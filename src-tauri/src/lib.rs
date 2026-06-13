use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager};

// ========== 内嵌推理引擎 ==========

use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::model::{LlamaModel, LlamaChatMessage};
use llama_cpp_2::model::params::LlamaModelParams;
use llama_cpp_2::context::params::LlamaContextParams;
use llama_cpp_2::llama_batch::LlamaBatch;
use llama_cpp_2::sampling::LlamaSampler;

struct EmbeddedState {
    model: Option<LlamaModel>,
    loaded_path: String,
}

static EMBEDDED_ENGINE: OnceLock<Mutex<EmbeddedState>> = OnceLock::new();
static LLAMA_BACKEND: OnceLock<LlamaBackend> = OnceLock::new();

fn get_embedded_engine() -> &'static Mutex<EmbeddedState> {
    EMBEDDED_ENGINE.get_or_init(|| Mutex::new(EmbeddedState { model: None, loaded_path: String::new() }))
}

fn get_backend() -> &'static LlamaBackend {
    LLAMA_BACKEND.get_or_init(|| LlamaBackend::init().expect("Failed to init llama backend"))
}

// ========== 下载任务管理 ==========

static CANCEL_FLAGS: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();

fn get_cancel_flags() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    CANCEL_FLAGS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn cleanup_cancel_flag(name: &str) {
    get_cancel_flags().lock().unwrap().remove(name);
}

fn ensure_model_loaded(model_path: &str) -> Result<(), String> {
    let engine = get_embedded_engine();
    let mut guard = engine.lock().unwrap();

    if guard.model.is_some() && guard.loaded_path == model_path {
        return Ok(());
    }

    let backend = get_backend();
    let model_params = LlamaModelParams::default().with_n_gpu_layers(100);
    let model = LlamaModel::load_from_file(
        backend,
        std::path::Path::new(model_path),
        &model_params,
    ).map_err(|e| format!("加载模型失败: {e}"))?;

    guard.model = Some(model);
    guard.loaded_path = model_path.to_string();
    Ok(())
}

fn run_inference(
    model_path: &str,
    messages: &[(&str, &str)],
    max_tokens: u32,
) -> Result<String, String> {
    ensure_model_loaded(model_path)?;

    let n_threads = std::thread::available_parallelism()
        .map(|n| n.get() as i32)
        .unwrap_or(4);

    let ctx_params = LlamaContextParams::default()
        .with_n_ctx(Some(std::num::NonZero::new(1024u32).unwrap()))
        .with_n_threads(n_threads)
        .with_n_threads_batch(n_threads);

    let backend = get_backend();
    let engine = get_embedded_engine();
    let guard = engine.lock().unwrap();
    let model = guard.model.as_ref().ok_or("模型未加载")?;

    let tmpl = model.chat_template(None)
        .map_err(|e| format!("获取聊天模板失败: {e}"))?;

    let chat_messages: Vec<LlamaChatMessage> = messages.iter()
        .map(|(role, content)| LlamaChatMessage::new(role.to_string(), content.to_string()))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("创建消息失败: {e}"))?;

    let formatted = model.apply_chat_template(&tmpl, &chat_messages, true)
        .map_err(|e| format!("应用聊天模板失败: {e}"))?;

    let mut ctx = model.new_context(backend, ctx_params)
        .map_err(|e| format!("创建上下文失败: {e}"))?;

    let tokens = model.str_to_token(&formatted, llama_cpp_2::model::AddBos::Always)
        .map_err(|e| format!("分词失败: {e}"))?;

    if tokens.is_empty() {
        return Err("分词结果为空".to_string());
    }

    let n_ctx = ctx.n_ctx() as usize;
    if tokens.len() >= n_ctx {
        return Err(format!("Prompt 过长 ({} tokens, 上限 {})", tokens.len(), n_ctx));
    }

    let mut batch = LlamaBatch::new(tokens.len().max(1), 1);
    batch.add_sequence(&tokens, 0, false)
        .map_err(|e| format!("添加token失败: {e}"))?;

    ctx.decode(&mut batch)
        .map_err(|e| format!("处理输入失败: {e}"))?;

    // Sampler chain: penalties + truncation suppress the low-probability tail
    // that causes garbled CJK output (dropped/extra chars, stray spaces).
    let mut sampler = LlamaSampler::chain(
        [
            LlamaSampler::penalties(-1, 1.1, 0.0, 0.0), // repeat penalty over full context
            LlamaSampler::top_k(40),                     // keep only top-40 tokens
            LlamaSampler::top_p(0.9, 1),                 // nucleus truncation
            LlamaSampler::temp(0.3),
            LlamaSampler::dist(0),
        ],
        false,
    );

    // Accumulate raw bytes and decode once after the loop. Per-token decoding
    // with a fresh decoder drops multi-byte UTF-8 chars split across token
    // boundaries (common for CJK in byte-BPE vocabularies), causing lost chars.
    let mut output_bytes: Vec<u8> = Vec::new();
    let mut n_cur = tokens.len() as i32;

    for _ in 0..max_tokens {
        let new_token = sampler.sample(&ctx, -1);
        sampler.accept(new_token);

        if model.is_eog_token(new_token) { break; }

        let bytes = match model.token_to_piece_bytes(new_token, 8, false, None) {
            Ok(b) => b,
            Err(llama_cpp_2::TokenToStringError::InsufficientBufferSpace(n)) => {
                let need = n.unsigned_abs() as usize;
                model.token_to_piece_bytes(new_token, need, false, None)
                    .map_err(|e| format!("解码失败: {e}"))?
            }
            Err(e) => return Err(format!("解码失败: {e}")),
        };
        output_bytes.extend_from_slice(&bytes);

        batch.clear();
        batch.add(new_token, n_cur, &[0], true)
            .map_err(|e| format!("添加token失败: {e}"))?;
        n_cur += 1;

        if n_cur as usize >= n_ctx {
            break;
        }

        ctx.decode(&mut batch)
            .map_err(|e| format!("推理失败: {e}"))?;
    }

    let output = String::from_utf8(output_bytes)
        .unwrap_or_else(|e| String::from_utf8_lossy(&e.into_bytes()).into_owned());
    let result = output.trim();
    // Strip <think>...</think> blocks from reasoning models (e.g. Qwen3, DeepSeek)
    let result = strip_think_tags(result);
    Ok(result.to_string())
}

fn strip_think_tags(text: &str) -> String {
    let mut result = String::new();
    let mut remaining = text;
    while let Some(start) = remaining.find("<think") {
        // Append content before <think >
        result.push_str(&remaining[..start]);
        // Find the end of the opening tag
        let after_open = &remaining[start..];
        let tag_end = after_open.find('>').map(|i| start + i + 1).unwrap_or(start + 6);
        // Find </think >
        let rest = &remaining[tag_end..];
        if let Some(end_len) = rest.find("</think") {
            let close_end = rest[end_len..].find('>').map(|i| end_len + i + 1).unwrap_or(end_len + 8);
            remaining = &rest[close_end..];
        } else {
            // Unclosed <think > — discard the rest
            remaining = "";
        }
    }
    result.push_str(remaining);
    result.trim().to_string()
}

#[derive(serde::Serialize, Clone)]
struct AppInfo {
    name: String,
    path: String,
    #[serde(rename = "pinyinFull")]
    pinyin_full: String,
    #[serde(rename = "pinyinInitials")]
    pinyin_initials: String,
}

struct AppCache {
    apps: Vec<AppInfo>,
    mtimes: Vec<Option<std::time::SystemTime>>,
}

static APP_CACHE: Mutex<Option<AppCache>> = Mutex::new(None);
static CACHED_WIDTH: OnceLock<f64> = OnceLock::new();

// ========== 配置管理 ==========

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
struct LlmConfig {
    #[serde(default = "default_runtime")]
    runtime: String,
    #[serde(default = "default_api_url")]
    api_url: String,
    #[serde(default)]
    model: String,
    #[serde(default)]
    local_model_path: String,
}

fn default_runtime() -> String { "auto".to_string() }
fn default_api_url() -> String { "http://localhost:11434".to_string() }

impl Default for LlmConfig {
    fn default() -> Self {
        Self {
            runtime: default_runtime(),
            api_url: default_api_url(),
            model: String::new(),
            local_model_path: String::new(),
        }
    }
}

fn models_dir() -> std::path::PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    std::path::PathBuf::from(home).join(".mtools").join("models")
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
struct AppConfig {
    shortcut: String,
    #[serde(default)]
    auto_start: bool,
    #[serde(default)]
    llm: LlmConfig,
    #[serde(default)]
    tool_shortcuts: HashMap<String, String>,
    #[serde(default)]
    terminal: String,
}

static APP_CONFIG: OnceLock<Mutex<AppConfig>> = OnceLock::new();

fn default_config() -> AppConfig {
    AppConfig {
        shortcut: "Alt+Space".to_string(),
        auto_start: false,
        llm: LlmConfig::default(),
        tool_shortcuts: HashMap::new(),
        terminal: String::new(),
    }
}

fn config_file_path() -> std::path::PathBuf {
    let home = std::env::var("HOME").expect("HOME not set");
    std::path::PathBuf::from(home)
        .join("Library")
        .join("Application Support")
        .join("com.mtools.app")
        .join("config.json")
}

fn load_config(path: &std::path::Path) -> AppConfig {
    let content = std::fs::read_to_string(path).unwrap_or_default();
    serde_json::from_str(&content).unwrap_or_else(|_| default_config())
}

fn save_config(config: &AppConfig, path: &std::path::Path) {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(content) = serde_json::to_string_pretty(config) {
        let _ = std::fs::write(path, content);
    }
}

// ========== 快捷键解析 ==========

fn parse_key_code(key: &str) -> Result<tauri_plugin_global_shortcut::Code, String> {
    use tauri_plugin_global_shortcut::Code;
    match key {
        "Space" => Ok(Code::Space),
        "Backquote" => Ok(Code::Backquote),
        s if s.len() == 1 && s.chars().next().unwrap().is_ascii_alphabetic() => {
            Ok(match s.chars().next().unwrap().to_ascii_uppercase() {
                'A' => Code::KeyA, 'B' => Code::KeyB, 'C' => Code::KeyC,
                'D' => Code::KeyD, 'E' => Code::KeyE, 'F' => Code::KeyF,
                'G' => Code::KeyG, 'H' => Code::KeyH, 'I' => Code::KeyI,
                'J' => Code::KeyJ, 'K' => Code::KeyK, 'L' => Code::KeyL,
                'M' => Code::KeyM, 'N' => Code::KeyN, 'O' => Code::KeyO,
                'P' => Code::KeyP, 'Q' => Code::KeyQ, 'R' => Code::KeyR,
                'S' => Code::KeyS, 'T' => Code::KeyT, 'U' => Code::KeyU,
                'V' => Code::KeyV, 'W' => Code::KeyW, 'X' => Code::KeyX,
                'Y' => Code::KeyY, 'Z' => Code::KeyZ,
                _ => return Err(format!("不支持的按键: {key}")),
            })
        }
        s if s.len() == 1 && s.chars().next().unwrap().is_ascii_digit() => {
            Ok(match s {
                "0" => Code::Digit0, "1" => Code::Digit1, "2" => Code::Digit2,
                "3" => Code::Digit3, "4" => Code::Digit4, "5" => Code::Digit5,
                "6" => Code::Digit6, "7" => Code::Digit7, "8" => Code::Digit8,
                "9" => Code::Digit9,
                _ => return Err(format!("不支持的按键: {key}")),
            })
        }
        s if s.starts_with('F') && s.len() <= 3 => {
            let num: u8 = s[1..].parse().map_err(|_| format!("无效的F键: {key}"))?;
            Ok(match num {
                1 => Code::F1, 2 => Code::F2, 3 => Code::F3, 4 => Code::F4,
                5 => Code::F5, 6 => Code::F6, 7 => Code::F7, 8 => Code::F8,
                9 => Code::F9, 10 => Code::F10, 11 => Code::F11, 12 => Code::F12,
                _ => return Err(format!("不支持的F键: {key}")),
            })
        }
        _ => Err(format!("不支持的按键: {key}")),
    }
}

fn parse_shortcut(s: &str) -> Result<(Option<tauri_plugin_global_shortcut::Modifiers>, tauri_plugin_global_shortcut::Code), String> {
    use tauri_plugin_global_shortcut::Modifiers;
    let parts: Vec<&str> = s.split('+').map(|p| p.trim()).collect();
    if parts.is_empty() {
        return Err("快捷键不能为空".into());
    }
    let mut mods = Modifiers::empty();
    let mut code = None;
    for part in parts {
        match part {
            "Alt" => mods |= Modifiers::ALT,
            "Cmd" | "Super" => mods |= Modifiers::SUPER,
            "Ctrl" | "Control" => mods |= Modifiers::CONTROL,
            "Shift" => mods |= Modifiers::SHIFT,
            key => code = Some(parse_key_code(key)?),
        }
    }
    let code = code.ok_or("请指定一个按键")?;
    let modifiers = if mods.is_empty() { None } else { Some(mods) };
    Ok((modifiers, code))
}

// ========== 自启动管理 ==========

fn autostart_plist_path() -> Option<std::path::PathBuf> {
    std::env::var("HOME").ok().map(|home| {
        std::path::PathBuf::from(home)
            .join("Library")
            .join("LaunchAgents")
            .join("com.mtools.app.plist")
    })
}

fn set_autostart(enabled: bool) -> Result<(), String> {
    let plist_path = autostart_plist_path().ok_or("无法找到 LaunchAgents 目录")?;
    if enabled {
        let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
        let exe_str = exe_path.to_string_lossy();
        let plist_content = format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.mtools.app</string>
    <key>ProgramArguments</key>
    <array>
        <string>{exe_str}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
</dict>
</plist>"#
        );
        if let Some(parent) = plist_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::write(&plist_path, plist_content).map_err(|e| e.to_string())?;
    } else if plist_path.exists() {
        std::fs::remove_file(&plist_path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ========== 设置命令 ==========

#[tauri::command]
fn get_settings() -> Result<serde_json::Value, String> {
    let config = APP_CONFIG.get().unwrap().lock().unwrap();
    Ok(serde_json::json!({
        "shortcut": config.shortcut,
        "autoStart": config.auto_start,
        "llm": {
            "runtime": config.llm.runtime,
            "apiUrl": config.llm.api_url,
            "model": config.llm.model,
            "localModelPath": config.llm.local_model_path,
        },
        "toolShortcuts": config.tool_shortcuts,
        "terminal": config.terminal,
    }))
}

#[tauri::command]
fn update_shortcut(app: tauri::AppHandle, shortcut: String) -> Result<(), String> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

    let (new_modifiers, new_code) = parse_shortcut(&shortcut)?;
    let new_shortcut = Shortcut::new(new_modifiers, new_code);

    // Unregister old shortcut
    {
        let config = APP_CONFIG.get().unwrap().lock().unwrap();
        if let Ok((old_modifiers, old_code)) = parse_shortcut(&config.shortcut) {
            let old_shortcut = Shortcut::new(old_modifiers, old_code);
            let _ = app.global_shortcut().unregister(old_shortcut);
        }
    }

    // Also unregister new shortcut in case it's lingering from a previous registration
    let _ = app.global_shortcut().unregister(new_shortcut);

    // Register new shortcut
    app.global_shortcut().on_shortcut(new_shortcut, move |app, _shortcut, event| {
        if event.state() != ShortcutState::Pressed { return; }
        if let Some(w) = app.get_webview_window("main") {
            if w.is_visible().unwrap_or(false) {
                let _ = w.emit("window-toggle", ());
            } else {
                let _ = w.show();
                let _ = w.set_focus();
                let _ = w.emit("window-shown", ());
            }
        }
    }).map_err(|e| format!("注册快捷键失败: {e}"))?;

    // Update config
    let cfg_path = config_file_path();
    let config_snapshot = {
        let mut config = APP_CONFIG.get().unwrap().lock().unwrap();
        config.shortcut = shortcut;
        config.clone()
    };
    save_config(&config_snapshot, &cfg_path);

    Ok(())
}

#[tauri::command]
fn set_autostart_setting(_app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    set_autostart(enabled)?;

    let cfg_path = config_file_path();
    let config_snapshot = {
        let mut config = APP_CONFIG.get().unwrap().lock().unwrap();
        config.auto_start = enabled;
        config.clone()
    };
    save_config(&config_snapshot, &cfg_path);

    Ok(())
}

/// Build a lowercase full-pinyin string and an initials string for fuzzy app search.
/// CJK characters map to their pinyin; other characters are kept (lowercased) so
/// mixed names like "Xcode" or "微信" still match.
fn compute_app_pinyin(name: &str) -> (String, String) {
    use pinyin::ToPinyin;
    let mut full = String::with_capacity(name.len() * 3);
    let mut initials = String::with_capacity(name.len());
    for (ch, py) in name.chars().zip(name.to_pinyin()) {
        match py {
            Some(p) => {
                full.push_str(p.plain());
                initials.push_str(p.first_letter());
            }
            None => {
                let lower = ch.to_ascii_lowercase();
                full.push(lower);
                if lower.is_ascii_alphabetic() {
                    initials.push(lower);
                }
            }
        }
    }
    (full, initials)
}

#[cfg(test)]
mod tests {
    use super::compute_app_pinyin;

    // Reproduces the user scenario: searching "qianwen" must match "通义千问".
    #[test]
    fn app_pinyin_full_and_initials() {
        assert_eq!(
            compute_app_pinyin("通义千问"),
            ("tongyiqianwen".to_string(), "tyqw".to_string())
        );
    }

    // Characters missing from the old frontend dict (微/信) now resolve via the full Unihan table.
    #[test]
    fn app_pinyin_resolves_uncovered_chars() {
        assert_eq!(
            compute_app_pinyin("微信"),
            ("weixin".to_string(), "wx".to_string())
        );
    }

    // Non-CJK characters are lowercased; alphabetic ones contribute to initials.
    #[test]
    fn app_pinyin_keeps_ascii() {
        assert_eq!(
            compute_app_pinyin("Xcode"),
            ("xcode".to_string(), "xcode".to_string())
        );
    }
}

/// Resolve the user-visible (zh-localized) app name from the bundle's InfoPlist.strings.
/// Returns None when no localization is present, so the caller falls back to the filename.
#[cfg(target_os = "macos")]
fn localized_app_name(path: &str) -> Option<String> {
    use std::ffi::{CStr, CString};
    extern "C" {
        fn macos_get_app_display_name(app_path: *const i8) -> *const i8;
        fn free(ptr: *mut std::ffi::c_void);
    }
    unsafe {
        let c = CString::new(path).ok()?;
        let raw = macos_get_app_display_name(c.as_ptr());
        if raw.is_null() {
            return None;
        }
        let name = CStr::from_ptr(raw).to_string_lossy().into_owned();
        free(raw as *mut _);
        Some(name)
    }
}

#[cfg(not(target_os = "macos"))]
fn localized_app_name(_path: &str) -> Option<String> {
    None
}

fn scan_dir(dir: &std::path::Path, apps: &mut Vec<AppInfo>) {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().map_or(false, |e| e == "app") && path.is_dir() {
            let stem = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();
            let name = localized_app_name(&path.to_string_lossy()).unwrap_or(stem);
            if !name.is_empty() {
                let (pinyin_full, pinyin_initials) = compute_app_pinyin(&name);
                apps.push(AppInfo {
                    name,
                    path: path.to_string_lossy().into(),
                    pinyin_full,
                    pinyin_initials,
                });
            }
        }
    }
}

/// Application directories scanned at runtime (top-level only, like Finder).
fn app_scan_dirs() -> Vec<std::path::PathBuf> {
    let mut dirs = vec![
        std::path::PathBuf::from("/Applications"),
        std::path::PathBuf::from("/System/Applications"),
    ];
    if let Ok(home) = std::env::var("HOME") {
        dirs.push(std::path::PathBuf::from(format!("{home}/Applications")));
    }
    dirs
}

fn dir_mtime(path: &std::path::Path) -> Option<std::time::SystemTime> {
    std::fs::metadata(path).ok()?.modified().ok()
}

#[tauri::command]
async fn scan_applications() -> Vec<AppInfo> {
    tauri::async_runtime::spawn_blocking(|| {
        let dirs = app_scan_dirs();
        let current_mtimes: Vec<Option<std::time::SystemTime>> =
            dirs.iter().map(|d| dir_mtime(d)).collect();

        let mut cache = APP_CACHE.lock().expect("APP_CACHE poisoned");
        // Reuse the cached list when no scanned directory has changed on disk, so a
        // newly installed app only triggers one rescan — after its directory's mtime
        // updates (macOS bumps the parent dir mtime on add/remove).
        if let Some(c) = cache.as_ref() {
            if c.mtimes == current_mtimes {
                return c.apps.clone();
            }
        }

        let mut apps = Vec::new();
        for dir in &dirs {
            scan_dir(dir, &mut apps);
        }
        apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        let result = apps.clone();
        *cache = Some(AppCache { apps, mtimes: current_mtimes });
        result
    })
    .await
    .unwrap_or_default()
}

#[tauri::command]
fn launch_application(path: String) -> Result<(), String> {
    std::process::Command::new("open")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ========== Folder clipboard actions: VSCode / Terminal ==========

/// Known terminal candidates: (id, app bundle basename, display name).
const TERMINAL_CANDIDATES: &[(&str, &str, &str)] = &[
    ("terminal", "Terminal", "Terminal"),
    ("iterm", "iTerm", "iTerm2"),
    ("warp", "Warp", "Warp"),
    ("ghostty", "Ghostty", "Ghostty"),
    ("alacritty", "Alacritty", "Alacritty"),
    ("kitty", "kitty", "kitty"),
    ("hyper", "Hyper", "Hyper"),
    ("wezterm", "WezTerm", "WezTerm"),
];

#[derive(serde::Serialize)]
struct TerminalInfo {
    id: String,
    name: String,
}

#[cfg(target_os = "macos")]
fn terminal_app_basename(id: &str) -> Option<&'static str> {
    TERMINAL_CANDIDATES
        .iter()
        .find(|(i, _, _)| *i == id)
        .map(|(_, b, _)| *b)
}

/// Escape a string for safe interpolation inside an AppleScript double-quoted string.
#[cfg(target_os = "macos")]
fn esc_applescript(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

/// Persist the user's chosen default terminal id (empty = none selected).
#[tauri::command]
fn set_terminal_setting(id: String) -> Result<(), String> {
    let cfg_path = config_file_path();
    let config_snapshot = {
        let mut config = APP_CONFIG.get().unwrap().lock().unwrap();
        config.terminal = id;
        config.clone()
    };
    save_config(&config_snapshot, &cfg_path);
    Ok(())
}

/// Scan /Applications and ~/Applications for known terminal apps.
#[tauri::command]
async fn scan_installed_terminals() -> Vec<TerminalInfo> {
    tauri::async_runtime::spawn_blocking(|| {
        let home = std::env::var("HOME").unwrap_or_default();
        TERMINAL_CANDIDATES
            .iter()
            .filter_map(|(id, app, display)| {
                let exists = if *id == "terminal" {
                    std::path::Path::new("/System/Applications/Utilities/Terminal.app").exists()
                } else {
                    std::path::Path::new(&format!("/Applications/{}.app", app)).exists()
                        || std::path::Path::new(&format!("{}/Applications/{}.app", home, app))
                            .exists()
                };
                if exists {
                    Some(TerminalInfo {
                        id: id.to_string(),
                        name: display.to_string(),
                    })
                } else {
                    None
                }
            })
            .collect()
    })
    .await
    .unwrap_or_default()
}

/// Whether standard Visual Studio Code is installed.
#[cfg(target_os = "macos")]
#[tauri::command]
async fn vscode_installed() -> bool {
    tauri::async_runtime::spawn_blocking(|| {
        let home = std::env::var("HOME").unwrap_or_default();
        std::path::Path::new("/Applications/Visual Studio Code.app").exists()
            || std::path::Path::new(&format!("{}/Applications/Visual Studio Code.app", home))
                .exists()
    })
    .await
    .unwrap_or(false)
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
async fn vscode_installed() -> bool {
    false
}

/// Return the folder path if the clipboard holds exactly one directory.
#[cfg(target_os = "macos")]
#[tauri::command]
async fn get_clipboard_folder() -> Option<String> {
    tauri::async_runtime::spawn_blocking(|| {
        let paths = macos_clipboard::read_files()?;
        if paths.len() == 1 {
            let p = std::path::Path::new(&paths[0]);
            if p.is_dir() {
                return Some(paths[0].clone());
            }
        }
        None
    })
    .await
    .ok()
    .flatten()
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
async fn get_clipboard_folder() -> Option<String> {
    None
}

/// Open a folder in Visual Studio Code.
#[tauri::command]
async fn open_in_vscode(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        std::process::Command::new("open")
            .arg("-a")
            .arg("Visual Studio Code")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(())
}

/// Open a terminal at the given directory (cd into it) using the configured terminal.
#[cfg(target_os = "macos")]
#[tauri::command]
async fn open_in_terminal(dir: String, terminal: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let escaped = esc_applescript(&dir);
        match terminal.as_str() {
            "terminal" => {
                let script = format!(
                    "tell application \"Terminal\"\ndo script \"cd \" & quoted form of \"{}\"\nactivate\nend tell",
                    escaped
                );
                std::process::Command::new("osascript")
                    .arg("-e")
                    .arg(&script)
                    .spawn()
                    .map_err(|e| e.to_string())?;
            }
            "iterm" => {
                let script = format!(
                    "tell application \"iTerm\"\ncreate window with default profile\ntell current session of current window\nwrite text \"cd \" & quoted form of \"{}\"\nend tell\nactivate\nend tell",
                    escaped
                );
                std::process::Command::new("osascript")
                    .arg("-e")
                    .arg(&script)
                    .spawn()
                    .map_err(|e| e.to_string())?;
            }
            other => {
                let app = terminal_app_basename(other).unwrap_or(other);
                std::process::Command::new("open")
                    .arg("-a")
                    .arg(app)
                    .arg(&dir)
                    .spawn()
                    .map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(())
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
async fn open_in_terminal(_dir: String, _terminal: String) -> Result<(), String> {
    Err("unsupported platform".into())
}

#[cfg(target_os = "macos")]
mod macos_clipboard {
    use std::ffi::CStr;

    extern "C" {
        fn macos_get_clipboard_files() -> *const i8;
    }

    extern "C" {
        fn macos_get_clipboard_change_count() -> i64;
    }

    extern "C" {
        fn free(ptr: *mut std::ffi::c_void);
    }

    pub fn read_files() -> Option<Vec<String>> {
        unsafe {
            let result = macos_get_clipboard_files();
            if result.is_null() {
                return None;
            }
            let json_str = CStr::from_ptr(result as *const i8)
                .to_string_lossy()
                .into_owned();
            free(result as *mut _);
            let paths: Vec<String> = serde_json::from_str(&json_str).ok()?;
            if paths.is_empty() {
                return None;
            }
            Some(paths)
        }
    }

    pub fn change_count() -> i64 {
        unsafe { macos_get_clipboard_change_count() }
    }
}

#[cfg(target_os = "macos")]
#[tauri::command]
async fn get_clipboard_files() -> Option<Vec<String>> {
    tauri::async_runtime::spawn_blocking(|| macos_clipboard::read_files())
        .await
        .ok()
        .flatten()
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn get_clipboard_change_count() -> i64 {
    macos_clipboard::change_count()
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
async fn get_clipboard_files() -> Option<Vec<String>> {
    None
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn get_clipboard_change_count() -> i64 {
    0
}

#[cfg(target_os = "macos")]
mod macos_icon {
    use std::ffi::CStr;

    extern "C" {
        fn macos_get_app_icon(path: *const i8) -> *const i8;
    }

    extern "C" {
        fn free(ptr: *mut std::ffi::c_void);
    }

    pub fn get(path: &str) -> Option<String> {
        let c_path = std::ffi::CString::new(path).ok()?;
        unsafe {
            let result = macos_get_app_icon(c_path.as_ptr());
            if result.is_null() {
                return None;
            }
            let s = CStr::from_ptr(result as *const i8)
                .to_string_lossy()
                .into_owned();
            free(result as *mut _);
            Some(s)
        }
    }
}

#[cfg(target_os = "macos")]
#[tauri::command]
async fn get_app_icon(path: String) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || macos_icon::get(&path))
        .await
        .ok()
        .flatten()
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
async fn get_app_icon(_path: String) -> Option<String> {
    None
}

#[tauri::command]
fn resize_window(window: tauri::Window, height: f64) {
    let width = *CACHED_WIDTH.get_or_init(|| {
        window
            .primary_monitor()
            .ok()
            .flatten()
            .map(|m| {
                let screen_w = m.size().width as f64 / m.scale_factor();
                (screen_w * 0.52).round().max(600.0)
            })
            .unwrap_or(600.0)
    });
    let _ = window.set_size(tauri::LogicalSize::new(width, height));
}

#[cfg(target_os = "macos")]
mod macos_picker {
    use std::ffi::c_void;
    use std::ffi::CStr;

    type PickCallback = extern "C" fn(*const u8, *mut c_void);

    extern "C" {
        fn macos_pick_color(ctx: *mut c_void, callback: PickCallback);
    }

    extern "C" fn on_color_picked(hex: *const u8, ctx: *mut c_void) {
        let tx = unsafe { Box::from_raw(ctx as *mut std::sync::mpsc::Sender<Option<String>>) };
        if hex.is_null() {
            let _ = tx.send(None);
        } else {
            let s = unsafe { CStr::from_ptr(hex as *const i8) };
            let _ = tx.send(Some(s.to_string_lossy().into_owned()));
        }
    }

    pub fn pick() -> Result<String, String> {
        let (tx, rx) = std::sync::mpsc::channel();
        let tx = Box::new(tx);
        unsafe {
            macos_pick_color(Box::into_raw(tx) as *mut c_void, on_color_picked);
        }
        match rx.recv() {
            Ok(Some(hex)) => Ok(hex),
            Ok(None) => Err("cancelled".into()),
            Err(_) => Err("pick failed".into()),
        }
    }
}

#[cfg(target_os = "macos")]
#[tauri::command]
async fn pick_color() -> Result<String, String> {
    macos_picker::pick()
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
async fn pick_color() -> Result<String, String> {
    Err("Not supported on this platform".into())
}

// ========== PDF 工具文件操作 ==========

#[tauri::command]
async fn read_file_as_base64(path: String) -> Result<String, String> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    tauri::async_runtime::spawn_blocking(move || {
        let data = std::fs::read(&path).map_err(|e| e.to_string())?;
        Ok(STANDARD.encode(&data))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn save_images_to_downloads(
    output_dir: Option<String>,
    folder_name: String,
    images: Vec<String>,
) -> Result<String, String> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    tauri::async_runtime::spawn_blocking(move || {
        let base = match output_dir {
            Some(dir) => std::path::PathBuf::from(dir),
            None => {
                let home = std::env::var("HOME").map_err(|e| e.to_string())?;
                std::path::PathBuf::from(home).join("Downloads")
            }
        };
        let dir = base.join(&folder_name);
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        for (i, b64) in images.iter().enumerate() {
            let data = STANDARD.decode(b64).map_err(|e| e.to_string())?;
            let path = dir.join(format!("page_{:04}.png", i + 1));
            std::fs::write(&path, data).map_err(|e| e.to_string())?;
        }
        Ok(dir.to_string_lossy().into())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn save_binary_to_downloads(
    output_dir: Option<String>,
    filename: String,
    data: String,
) -> Result<String, String> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    tauri::async_runtime::spawn_blocking(move || {
        let dir = match output_dir {
            Some(d) => std::path::PathBuf::from(d),
            None => {
                let home = std::env::var("HOME").map_err(|e| e.to_string())?;
                std::path::PathBuf::from(home).join("Downloads")
            }
        };
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let bin_data = STANDARD.decode(&data).map_err(|e| e.to_string())?;
        let path = dir.join(&filename);
        std::fs::write(&path, bin_data).map_err(|e| e.to_string())?;
        Ok(dir.to_string_lossy().into())
    })
    .await
    .map_err(|e| e.to_string())?
}

// ========== 模型管理 ==========

#[tauri::command]
async fn pick_gguf_file(window: tauri::Window) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let file_path = window.dialog()
        .file()
        .add_filter("GGUF 模型", &["gguf"])
        .blocking_pick_file();
    Ok(file_path.map(|p| p.to_string()))
}

#[tauri::command]
async fn validate_local_model(path: String) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let p = std::path::Path::new(&path);
        if !p.exists() {
            return Ok(serde_json::json!({ "valid": false, "error": "文件不存在" }));
        }
        if !p.is_file() {
            return Ok(serde_json::json!({ "valid": false, "error": "不是文件" }));
        }
        // Check GGUF magic number: 0x46475547 ("GGUF")
        let mut buf = [0u8; 4];
        match std::fs::File::open(p) {
            Ok(mut f) => {
                use std::io::Read;
                if f.read_exact(&mut buf).is_err() {
                    return Ok(serde_json::json!({ "valid": false, "error": "无法读取文件头" }));
                }
            }
            Err(e) => {
                return Ok(serde_json::json!({ "valid": false, "error": e.to_string() }));
            }
        }
        if buf != [0x47, 0x47, 0x55, 0x46] {
            return Ok(serde_json::json!({ "valid": false, "error": "不是有效的 GGUF 文件" }));
        }
        let size = p.metadata().map(|m| m.len()).unwrap_or(0);
        Ok(serde_json::json!({
            "valid": true,
            "size": size,
            "name": p.file_name().unwrap_or_default().to_string_lossy(),
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn download_model(
    app: tauri::AppHandle,
    name: String,
    url: String,
) -> Result<(), String> {
    use std::io::Write;

    if url.is_empty() {
        return Err("下载地址为空".to_string());
    }

    let dir = models_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let file_name = std::path::Path::new(&name).file_name()
        .map(|f| f.to_string_lossy().to_string())
        .unwrap_or(name.clone());

    let final_path = dir.join(&file_name);
    let part_path = dir.join(format!("{}.part", &file_name));
    let meta_path = dir.join(format!("{}.part.json", &file_name));

    // Already fully downloaded
    if final_path.exists() {
        let _ = app.emit("model-download-complete", serde_json::json!({
            "name": &file_name,
            "path": final_path.to_string_lossy(),
        }));
        return Ok(());
    }

    // Register cancel flag
    let cancel_flag = Arc::new(AtomicBool::new(false));
    {
        let mut flags = get_cancel_flags().lock().unwrap();
        if flags.contains_key(&file_name) {
            return Err("该文件正在下载中".to_string());
        }
        flags.insert(file_name.clone(), cancel_flag.clone());
    }

    // Save download metadata for retry
    if let Ok(meta_json) = serde_json::to_string(&serde_json::json!({"url": &url, "name": &file_name})) {
        let _ = std::fs::write(&meta_path, meta_json);
    }

    // Check for partial download to resume
    let mut existing_size: u64 = 0;
    let mut file = if part_path.exists() {
        match std::fs::metadata(&part_path) {
            Ok(meta) if meta.len() > 0 => {
                existing_size = meta.len();
                std::fs::OpenOptions::new().append(true).open(&part_path)
            }
            _ => std::fs::File::create(&part_path),
        }
    } else {
        std::fs::File::create(&part_path)
    }.map_err(|e| {
        cleanup_cancel_flag(&file_name);
        format!("创建文件失败: {e}")
    })?;

    let _ = app.emit("model-download-started", serde_json::json!({
        "name": &file_name,
        "url": &url,
        "resuming": existing_size > 0,
        "existingSize": existing_size,
    }));

    eprintln!("[MTools download] name={file_name}, url={url}, resuming={}", existing_size > 0);

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| {
            cleanup_cancel_flag(&file_name);
            format!("创建 HTTP 客户端失败: {e}")
        })?;

    let mut request = client.get(&url)
        .timeout(std::time::Duration::from_secs(3600));

    if existing_size > 0 {
        request = request.header("Range", format!("bytes={}-", existing_size));
    }

    let resp = request.send().await.map_err(|e| {
        let _ = app.emit("model-download-failed", serde_json::json!({
            "name": &file_name,
            "error": format!("请求失败: {e}"),
        }));
        cleanup_cancel_flag(&file_name);
        format!("请求失败: {e}")
    })?;

    let status_code = resp.status();

    let (total_size, resuming) = if status_code.as_u16() == 206 {
        let total = resp.headers()
            .get("content-range")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.split('/').last())
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(0);
        (total, true)
    } else if status_code.is_success() {
        if existing_size > 0 {
            existing_size = 0;
            file = std::fs::File::create(&part_path).map_err(|e| {
                cleanup_cancel_flag(&file_name);
                format!("重建文件失败: {e}")
            })?;
        }
        (resp.content_length().unwrap_or(0), false)
    } else {
        let status_str = status_code.to_string();
        let body = resp.text().await.unwrap_or_default();
        eprintln!("[MTools download] error: HTTP {status_str}, body: {}", &body[..body.len().min(200)]);
        cleanup_cancel_flag(&file_name);
        return Err(format!("下载失败: HTTP {status_str}"));
    };

    eprintln!("[MTools download] resuming={resuming}, existing={existing_size}, total={total_size}");

    let mut downloaded: u64 = existing_size;
    let mut last_emit = std::time::Instant::now();
    let mut last_bytes = downloaded;
    let mut resp = resp;

    loop {
        if cancel_flag.load(Ordering::Relaxed) {
            cleanup_cancel_flag(&file_name);
            let _ = app.emit("model-download-cancelled", serde_json::json!({
                "name": &file_name,
            }));
            return Err("下载已取消".to_string());
        }

        let chunk = resp.chunk().await.map_err(|e| {
            let _ = app.emit("model-download-failed", serde_json::json!({
                "name": &file_name,
                "error": format!("下载中断: {e}"),
                "downloaded": downloaded,
                "total": total_size,
            }));
            cleanup_cancel_flag(&file_name);
            format!("下载中断: {e}")
        })?;
        let Some(chunk) = chunk else { break };

        file.write_all(&chunk).map_err(|e| {
            cleanup_cancel_flag(&file_name);
            format!("写入文件失败: {e}")
        })?;
        downloaded += chunk.len() as u64;

        if last_emit.elapsed() >= std::time::Duration::from_millis(300) {
            let elapsed = last_emit.elapsed();
            let bytes_delta = downloaded.saturating_sub(last_bytes);
            let speed = if elapsed.as_secs_f64() > 0.0 {
                (bytes_delta as f64 / elapsed.as_secs_f64()) as u64
            } else {
                0
            };

            last_emit = std::time::Instant::now();
            last_bytes = downloaded;

            let progress = if total_size > 0 {
                ((downloaded as f64 / total_size as f64) * 100.0).min(100.0) as u8
            } else {
                0
            };

            let _ = app.emit("model-download-progress", serde_json::json!({
                "name": &file_name,
                "downloaded": downloaded,
                "total": total_size,
                "progress": progress,
                "speed": speed,
            }));
        }
    }

    file.flush().map_err(|e| format!("写入文件失败: {e}"))?;
    drop(file);

    // Validate downloaded file
    let meta = std::fs::metadata(&part_path)
        .map_err(|_| "下载完成但文件不存在".to_string())?;
    if meta.len() < 1024 {
        let _ = std::fs::remove_file(&part_path);
        let _ = std::fs::remove_file(&meta_path);
        cleanup_cancel_flag(&file_name);
        return Err("下载失败: 文件过小，可能是错误页面".to_string());
    }
    let mut buf = [0u8; 8];
    if let Ok(mut f) = std::fs::File::open(&part_path) {
        let _ = std::io::Read::read_exact(&mut f, &mut buf);
        if &buf[..5] == b"<!doc" || &buf[..4] == b"<htm" || &buf[..5] == b"<?xml" {
            let _ = std::fs::remove_file(&part_path);
            let _ = std::fs::remove_file(&meta_path);
            cleanup_cancel_flag(&file_name);
            return Err("下载失败: 服务器返回了错误页面".to_string());
        }
    }

    // Rename .part to final
    let _ = std::fs::rename(&part_path, &final_path);
    let _ = std::fs::remove_file(&meta_path);

    cleanup_cancel_flag(&file_name);

    let _ = app.emit("model-download-complete", serde_json::json!({
        "name": &file_name,
        "path": final_path.to_string_lossy(),
    }));

    Ok(())
}

#[tauri::command]
async fn list_downloaded_models() -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let dir = models_dir();
        if !dir.exists() {
            return Ok(serde_json::json!({ "models": [] }));
        }
        let mut models = Vec::new();
        let entries = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(false, |e| e == "gguf") && path.is_file() {
                let size = path.metadata().map(|m| m.len()).unwrap_or(0);
                let name: String = path.file_name().unwrap_or_default().to_string_lossy().into();
                models.push(serde_json::json!({
                    "name": name,
                    "path": path.to_string_lossy(),
                    "size": size,
                }));
            }
        }
        Ok(serde_json::json!({ "models": models }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn delete_model(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let p = std::path::Path::new(&path);
        if !p.exists() {
            return Err("文件不存在".to_string());
        }
        std::fs::remove_file(p).map_err(|e| e.to_string())?;
        // Clear config if it points to this file
        let cfg_path = config_file_path();
        let config_snapshot = {
            let mut config = APP_CONFIG.get().unwrap().lock().unwrap();
            if config.llm.local_model_path == path {
                config.llm.local_model_path = String::new();
            }
            config.clone()
        };
        save_config(&config_snapshot, &cfg_path);
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn cancel_download(name: String) -> Result<(), String> {
    let flags = get_cancel_flags().lock().unwrap();
    if let Some(flag) = flags.get(&name) {
        flag.store(true, Ordering::Relaxed);
        Ok(())
    } else {
        Err("未找到下载任务".to_string())
    }
}

#[tauri::command]
async fn list_pending_downloads() -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let dir = models_dir();
        if !dir.exists() {
            return Ok(serde_json::json!({ "downloads": [] }));
        }
        let mut downloads = Vec::new();
        let entries = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;
        for entry in entries.flatten() {
            let path = entry.path();
            let file_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
            if file_name.ends_with(".part.json") && path.is_file() {
                let model_name = file_name.trim_end_matches(".part.json").to_string();
                let part_path = path.with_extension("");
                let downloaded = if part_path.exists() {
                    part_path.metadata().map(|m| m.len()).unwrap_or(0)
                } else {
                    0
                };
                let url = std::fs::read_to_string(&path).ok()
                    .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
                    .and_then(|v| v["url"].as_str().map(String::from))
                    .unwrap_or_default();
                downloads.push(serde_json::json!({
                    "name": model_name,
                    "downloaded": downloaded,
                    "url": url,
                    "status": "interrupted",
                }));
            }
        }
        Ok(serde_json::json!({ "downloads": downloads }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn delete_pending_download(name: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = models_dir();
        let part_path = dir.join(format!("{}.part", &name));
        let meta_path = dir.join(format!("{}.part.json", &name));
        if part_path.exists() {
            std::fs::remove_file(&part_path).map_err(|e| e.to_string())?;
        }
        if meta_path.exists() {
            let _ = std::fs::remove_file(&meta_path);
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

// ========== 模型社区搜索 ==========

#[derive(serde::Serialize)]
struct HubModel {
    id: String,
    author: String,
    downloads: String,
    likes: String,
}

#[tauri::command]
async fn search_models(
    source: String,
    query: String,
    page: u32,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let encoded_query = urlencoding::encode(&query);

    match source.as_str() {
        "huggingface" => {
            let url = if query.is_empty() {
                format!(
                    "https://huggingface.co/api/models?filter=gguf&sort=downloads&direction=-1&limit=20&offset={}",
                    (page - 1) * 20
                )
            } else {
                format!(
                    "https://huggingface.co/api/models?filter=gguf&search={encoded_query}&sort=downloads&direction=-1&limit=20&offset={}",
                    (page - 1) * 20
                )
            };

            let resp = client.get(&url)
                .timeout(std::time::Duration::from_secs(15))
                .send().await
                .map_err(|e| format!("请求失败: {e}"))?;

            if !resp.status().is_success() {
                return Err(format!("HuggingFace API 返回: {}", resp.status()));
            }

            let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
            let models = body.as_array().cloned().unwrap_or_default();

            let hub_models: Vec<HubModel> = models.iter().map(|m| {
                let id = m["id"].as_str().unwrap_or("").to_string();
                let author = m["author"].as_str().unwrap_or("").to_string();
                let downloads = m["downloads"].as_u64().map(|d| d.to_string()).unwrap_or("-".to_string());
                let likes = m["likes"].as_u64().map(|l| l.to_string()).unwrap_or("-".to_string());
                HubModel { id, author, downloads, likes }
            }).collect();

            let has_more = hub_models.len() >= 20;
            Ok(serde_json::json!({
                "models": hub_models,
                "page": page,
                "hasMore": has_more,
            }))
        }
        "modelscope" => {
            let search_q = if query.is_empty() { "gguf".to_string() } else { format!("gguf {encoded_query}") };
            let url = format!(
                "https://www.modelscope.cn/openapi/v1/models?search={search_q}&sort=downloads&page_number={page}&page_size=20"
            );

            let resp = client.get(&url)
                .timeout(std::time::Duration::from_secs(15))
                .send().await
                .map_err(|e| format!("请求失败: {e}"))?;

            if !resp.status().is_success() {
                return Err(format!("魔搭 API 返回: {}", resp.status()));
            }

            let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
            let models = body["data"]["models"].as_array().cloned().unwrap_or_default();
            let total: u32 = body["data"]["total_count"].as_u64().unwrap_or(0) as u32;

            let hub_models: Vec<HubModel> = models.iter().map(|m| {
                let id = m["id"].as_str().unwrap_or("").to_string();
                let author = id.split('/').next().unwrap_or("").to_string();
                let downloads = m["downloads"].as_u64().map(|d| d.to_string()).unwrap_or("-".to_string());
                let likes = m["likes"].as_u64().map(|l| l.to_string()).unwrap_or("-".to_string());
                HubModel { id, author, downloads, likes }
            }).collect();

            let has_more = (page * 20) < total;
            Ok(serde_json::json!({
                "models": hub_models,
                "page": page,
                "hasMore": has_more,
            }))
        }
        _ => Err("不支持的来源".to_string()),
    }
}

#[derive(serde::Serialize)]
struct HubFile {
    name: String,
    size: u64,
    download_url: String,
}

#[tauri::command]
async fn list_model_files(
    source: String,
    model_id: String,
) -> Result<serde_json::Value, String> {
    if !model_id.chars().all(|c| c.is_alphanumeric() || c == '/' || c == '.' || c == '-' || c == '_') {
        return Err("无效的模型 ID".to_string());
    }

    let client = reqwest::Client::new();

    match source.as_str() {
        "huggingface" => {
            let url = format!("https://huggingface.co/api/models/{model_id}");
            let resp = client.get(&url)
                .timeout(std::time::Duration::from_secs(15))
                .send().await
                .map_err(|e| format!("请求失败: {e}"))?;

            if !resp.status().is_success() {
                return Err(format!("HuggingFace API 返回: {}", resp.status()));
            }

            let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
            let siblings = body["siblings"].as_array().cloned().unwrap_or_default();

            let files: Vec<HubFile> = siblings.iter()
                .filter_map(|s| {
                    let name = s["rfilename"].as_str()?.to_string();
                    if !name.ends_with(".gguf") { return None; }
                    let size = s["size"].as_u64().unwrap_or(0);
                    let download_url = format!("https://huggingface.co/{model_id}/resolve/main/{name}");
                    Some(HubFile { name, size, download_url })
                })
                .collect();

            Ok(serde_json::json!({ "files": files }))
        }
        "modelscope" => {
            let url = format!("https://www.modelscope.cn/api/v1/models/{model_id}/repo/files?Recursive=True");
            let resp = client.get(&url)
                .timeout(std::time::Duration::from_secs(15))
                .send().await
                .map_err(|e| format!("请求失败: {e}"))?;

            if !resp.status().is_success() {
                return Err(format!("魔搭 API 返回: {}", resp.status()));
            }

            let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
            let data_files = body["Data"]["Files"].as_array().cloned().unwrap_or_default();

            let files: Vec<HubFile> = data_files.iter()
                .filter_map(|f| {
                    let name = f["Name"].as_str()?.to_string();
                    if !name.ends_with(".gguf") { return None; }
                    let size = f["Size"].as_u64().unwrap_or(0);
                    let download_url = format!("https://www.modelscope.cn/models/{model_id}/resolve/master/{name}");
                    Some(HubFile { name, size, download_url })
                })
                .collect();

            Ok(serde_json::json!({ "files": files }))
        }
        _ => Err("不支持的来源".to_string()),
    }
}

// ========== LLM 配置与翻译 ==========

#[tauri::command]
async fn get_llm_config() -> Result<serde_json::Value, String> {
    let config = APP_CONFIG.get().unwrap().lock().unwrap();
    Ok(serde_json::json!({
        "runtime": config.llm.runtime,
        "apiUrl": config.llm.api_url,
        "model": config.llm.model,
        "localModelPath": config.llm.local_model_path,
    }))
}

#[tauri::command]
async fn set_llm_config(
    _app: tauri::AppHandle,
    runtime: String,
    api_url: String,
    model: String,
    local_model_path: Option<String>,
) -> Result<(), String> {
    let cfg_path = config_file_path();
    let config_snapshot = {
        let mut config = APP_CONFIG.get().unwrap().lock().unwrap();
        config.llm.runtime = runtime;
        config.llm.api_url = api_url;
        config.llm.model = model;
        if let Some(path) = local_model_path {
            config.llm.local_model_path = path;
        }
        config.clone()
    };
    save_config(&config_snapshot, &cfg_path);
    Ok(())
}

#[tauri::command]
async fn detect_llm_runtimes() -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let mut detected = Vec::new();

    // Ollama
    if let Ok(resp) = client.get("http://localhost:11434/api/tags")
        .timeout(std::time::Duration::from_secs(2))
        .send().await
    {
        if resp.status().is_success() {
            detected.push(serde_json::json!({
                "id": "ollama",
                "name": "Ollama",
                "apiUrl": "http://localhost:11434",
            }));
        }
    }

    // LM Studio
    if let Ok(resp) = client.get("http://localhost:1234/v1/models")
        .timeout(std::time::Duration::from_secs(2))
        .send().await
    {
        if resp.status().is_success() {
            detected.push(serde_json::json!({
                "id": "lmstudio",
                "name": "LM Studio",
                "apiUrl": "http://localhost:1234",
            }));
        }
    }

    Ok(serde_json::json!({ "runtimes": detected }))
}

#[tauri::command]
async fn list_available_models(api_url: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();

    // Try Ollama API format
    if let Ok(resp) = client.get(format!("{}/api/tags", api_url.trim_end_matches('/')))
        .timeout(std::time::Duration::from_secs(3))
        .send().await
    {
        if let Ok(body) = resp.json::<serde_json::Value>().await {
            if let Some(models) = body["models"].as_array() {
                let names: Vec<String> = models.iter()
                    .filter_map(|m| m["name"].as_str().map(String::from))
                    .collect();
                return Ok(serde_json::json!({ "models": names }));
            }
        }
    }

    // Try OpenAI-compatible /v1/models format
    let url = format!("{}/v1/models", api_url.trim_end_matches('/'));
    if let Ok(resp) = client.get(&url)
        .timeout(std::time::Duration::from_secs(3))
        .send().await
    {
        if let Ok(body) = resp.json::<serde_json::Value>().await {
            if let Some(models) = body["data"].as_array() {
                let names: Vec<String> = models.iter()
                    .filter_map(|m| m["id"].as_str().map(String::from))
                    .collect();
                return Ok(serde_json::json!({ "models": names }));
            }
        }
    }

    Ok(serde_json::json!({ "models": [] }))
}

#[tauri::command]
async fn test_llm_connection(api_url: String, model: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/v1/chat/completions", api_url.trim_end_matches('/'));

    let body = serde_json::json!({
        "model": model,
        "messages": [{"role": "user", "content": "hi"}],
        "max_tokens": 5,
    });

    match client.post(&url)
        .json(&body)
        .timeout(std::time::Duration::from_secs(10))
        .send().await
    {
        Ok(resp) if resp.status().is_success() => {
            Ok(serde_json::json!({ "success": true }))
        }
        Ok(resp) => {
            let status = resp.status().as_u16();
            let text = resp.text().await.unwrap_or_default();
            Ok(serde_json::json!({
                "success": false,
                "error": format!("HTTP {status}: {text}")
            }))
        }
        Err(e) => {
            Ok(serde_json::json!({
                "success": false,
                "error": e.to_string()
            }))
        }
    }
}

#[tauri::command]
async fn translate_to_naming(text: String) -> Result<serde_json::Value, String> {
    // Read config to determine runtime
    let (runtime, api_url, model, local_model_path) = {
        let config = APP_CONFIG.get().unwrap().lock().unwrap();
        (
            config.llm.runtime.clone(),
            config.llm.api_url.clone(),
            config.llm.model.clone(),
            config.llm.local_model_path.clone(),
        )
    };

    let effective_runtime = match runtime.as_str() {
        "embedded" => "embedded".to_string(),
        "ollama" | "lmstudio" => runtime.clone(),
        _ => {
            // auto: prefer embedded local model → detect external
            if !local_model_path.is_empty() && std::path::Path::new(&local_model_path).exists() {
                "embedded".to_string()
            } else {
                runtime.clone()
            }
        }
    };

    if effective_runtime == "embedded" {
        // Embedded engine: for now, local model path is validated but inference not yet integrated
        let model_path = if !local_model_path.is_empty() {
            local_model_path.clone()
        } else {
            // Check ~/.mtools/models/ for any downloaded model
            let dir = models_dir();
            if dir.exists() {
                let mut found = None;
                if let Ok(entries) = std::fs::read_dir(&dir) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        if p.extension().map_or(false, |e| e == "gguf") && p.is_file() {
                            found = Some(p.to_string_lossy().into());
                            break;
                        }
                    }
                }
                found.unwrap_or_default()
            } else {
                String::new()
            }
        };

        if model_path.is_empty() {
            return Err("请先在设置中配置本地模型路径或下载模型".to_string());
        }
        if !std::path::Path::new(&model_path).exists() {
            return Err(format!("模型文件不存在: {model_path}"));
        }

        let system_prompt = "将中文翻译为英文，用于生成变量名。直接翻译原意，不要添加多余词汇。每行一个，用空格分隔单词（例如 user name），不要解释。";
        let user_content = format!("翻译以下中文：{text}");

        return tauri::async_runtime::spawn_blocking(move || {
            let messages: Vec<(&str, &str)> = vec![
                ("system", system_prompt),
                ("user", "翻译以下中文：用户名"),
                ("assistant", "user name"),
                ("user", "翻译以下中文：翻译"),
                ("assistant", "translate"),
                ("user", &user_content),
            ];
            let content = run_inference(&model_path, &messages, 64)?;
            if content.is_empty() {
                return Err("模型返回了空结果".to_string());
            }
            let suggestions: Vec<String> = content
                .lines()
                .map(|l| l.trim().to_string())
                .filter(|l| !l.is_empty())
                .take(5)
                .collect();
            Ok(serde_json::json!({ "suggestions": suggestions }))
        }).await.map_err(|e| e.to_string())?;
    }

    // External API mode
    if api_url.is_empty() || model.is_empty() {
        return Err("请先在设置中配置 AI 模型服务地址和模型".to_string());
    }

    let client = reqwest::Client::new();
    let url = format!("{}/v1/chat/completions", api_url.trim_end_matches('/'));

    let prompt = format!(
        "将中文翻译为英文，用于生成变量名。直接翻译原意，不要添加多余词汇。每行一个，用空格分隔单词（例如 user name），不要解释。\n\n用户输入：{text}"
    );

    let body = serde_json::json!({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 128,
        "temperature": 0.3,
    });

    let resp = client.post(&url)
        .json(&body)
        .timeout(std::time::Duration::from_secs(30))
        .send().await
        .map_err(|e| format!("连接失败: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let err_text = resp.text().await.unwrap_or_default();
        return Err(format!("模型调用失败 (HTTP {status}): {err_text}"));
    }

    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let content = json["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .trim()
        .to_string();

    if content.is_empty() {
        return Err("模型返回了空结果".to_string());
    }

    let suggestions: Vec<String> = content
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .take(5)
        .collect();

    Ok(serde_json::json!({ "suggestions": suggestions }))
}

/// Decide translation direction by dominant script.
/// Returns true when CJK characters outnumber Latin letters (translate to
/// English), false otherwise (translate to Chinese). Using proportions
/// instead of mere presence lets mixed text — e.g. an English sentence with
/// a few Chinese words — resolve to its dominant language.
fn is_predominantly_chinese(text: &str) -> bool {
    let mut cjk = 0usize;
    let mut latin = 0usize;
    for c in text.chars() {
        let cp = c as u32;
        let is_cjk = (0x4E00..=0x9FFF).contains(&cp)      // CJK Unified Ideographs
            || (0x3400..=0x4DBF).contains(&cp)             // CJK Extension A
            || (0x3000..=0x303F).contains(&cp)             // CJK Symbols
            || (0x3040..=0x309F).contains(&cp)             // Hiragana
            || (0x30A0..=0x30FF).contains(&cp);            // Katakana
        if is_cjk {
            cjk += 1;
        } else if c.is_ascii_alphabetic() {
            latin += 1;
        }
    }
    cjk > latin
}

#[tauri::command]
async fn translate_text(text: String) -> Result<serde_json::Value, String> {
    let (runtime, api_url, model, local_model_path) = {
        let config = APP_CONFIG.get().unwrap().lock().unwrap();
        (
            config.llm.runtime.clone(),
            config.llm.api_url.clone(),
            config.llm.model.clone(),
            config.llm.local_model_path.clone(),
        )
    };

    let effective_runtime = match runtime.as_str() {
        "embedded" => "embedded".to_string(),
        "ollama" | "lmstudio" => runtime.clone(),
        _ => {
            if !local_model_path.is_empty() && std::path::Path::new(&local_model_path).exists() {
                "embedded".to_string()
            } else {
                runtime.clone()
            }
        }
    };

    let is_chinese = is_predominantly_chinese(&text);

    if effective_runtime == "embedded" {
        let model_path = if !local_model_path.is_empty() {
            local_model_path.clone()
        } else {
            let dir = models_dir();
            if dir.exists() {
                let mut found = None;
                if let Ok(entries) = std::fs::read_dir(&dir) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        if p.extension().map_or(false, |e| e == "gguf") && p.is_file() {
                            found = Some(p.to_string_lossy().into());
                            break;
                        }
                    }
                }
                found.unwrap_or_default()
            } else {
                String::new()
            }
        };

        if model_path.is_empty() {
            return Err("请先在设置中配置本地模型路径或下载模型".to_string());
        }
        if !std::path::Path::new(&model_path).exists() {
            return Err(format!("模型文件不存在: {model_path}"));
        }

        return tauri::async_runtime::spawn_blocking(move || {
            let (system_prompt, user_content) = if is_chinese {
                (
                    "将中文翻译为英文。直接输出翻译结果，保持原文语气和格式，不要解释。",
                    format!("翻译以下中文：{text}"),
                )
            } else {
                (
                    "将以下文本翻译为中文。直接输出翻译结果，保持原文语气和格式，不要解释。",
                    format!("翻译以下文本：{text}"),
                )
            };

            let messages: Vec<(&str, &str)> = if is_chinese {
                vec![
                    ("system", system_prompt),
                    ("user", "翻译以下中文：你好世界"),
                    ("assistant", "Hello World"),
                    ("user", "翻译以下中文：这个功能非常有用"),
                    ("assistant", "This feature is very useful"),
                    ("user", &user_content),
                ]
            } else {
                vec![
                    ("system", system_prompt),
                    ("user", "翻译以下文本：Hello World"),
                    ("assistant", "你好世界"),
                    ("user", "翻译以下文本：This feature is very useful"),
                    ("assistant", "这个功能非常有用"),
                    ("user", &user_content),
                ]
            };

            let content = run_inference(&model_path, &messages, 512)?;
            if content.is_empty() {
                return Err("模型返回了空结果".to_string());
            }
            Ok(serde_json::json!({ "translation": content }))
        }).await.map_err(|e| e.to_string())?;
    }

    // External API mode
    if api_url.is_empty() || model.is_empty() {
        return Err("请先在设置中配置 AI 模型服务地址和模型".to_string());
    }

    let client = reqwest::Client::new();
    let url = format!("{}/v1/chat/completions", api_url.trim_end_matches('/'));

    let prompt = if is_chinese {
        format!(
            "你是一个专业的翻译助手。将用户输入的中文翻译为英文。\n\n规则：\n- 直接输出翻译结果，不要解释\n- 保持原文语气和格式\n- 准确翻译，不要遗漏内容\n\n用户输入：{text}"
        )
    } else {
        format!(
            "你是一个专业的翻译助手。将用户输入的文本翻译为中文。\n\n规则：\n- 直接输出翻译结果，不要解释\n- 保持原文语气和格式\n- 准确翻译，不要遗漏内容\n\n用户输入：{text}"
        )
    };

    let body = serde_json::json!({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 512,
        "temperature": 0.3,
    });

    let resp = client.post(&url)
        .json(&body)
        .timeout(std::time::Duration::from_secs(30))
        .send().await
        .map_err(|e| format!("连接失败: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let err_text = resp.text().await.unwrap_or_default();
        return Err(format!("模型调用失败 (HTTP {status}): {err_text}"));
    }

    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let content = json["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .trim()
        .to_string();

    if content.is_empty() {
        return Err("模型返回了空结果".to_string());
    }

    Ok(serde_json::json!({ "translation": content }))
}

// ========== 工具直达快捷键 ==========

#[tauri::command]
async fn register_tool_shortcut(app: tauri::AppHandle, tool_id: String, shortcut: String) -> Result<(), String> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

    let (modifiers, code) = parse_shortcut(&shortcut)?;
    let gs = Shortcut::new(modifiers, code);

    // Unregister if already registered
    let _ = app.global_shortcut().unregister(gs);

    let tid = tool_id.clone();
    app.global_shortcut().on_shortcut(gs, move |app, _shortcut, event| {
        if event.state() != ShortcutState::Pressed { return; }
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.show();
            let _ = w.set_focus();
            let _ = w.emit("open-tool-direct", tid.clone());
        }
    }).map_err(|e| format!("注册快捷键失败: {e}"))?;

    // Save to config
    let cfg_path = config_file_path();
    let config_snapshot = {
        let mut config = APP_CONFIG.get().unwrap().lock().unwrap();
        config.tool_shortcuts.insert(tool_id, shortcut);
        config.clone()
    };
    save_config(&config_snapshot, &cfg_path);

    Ok(())
}

#[tauri::command]
async fn unregister_tool_shortcut(app: tauri::AppHandle, tool_id: String) -> Result<(), String> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

    let shortcut_str = {
        let config = APP_CONFIG.get().unwrap().lock().unwrap();
        config.tool_shortcuts.get(&tool_id).cloned()
    };

    if let Some(ss) = shortcut_str {
        let (modifiers, code) = parse_shortcut(&ss)?;
        let gs = Shortcut::new(modifiers, code);
        let _ = app.global_shortcut().unregister(gs);
    }

    let cfg_path = config_file_path();
    let config_snapshot = {
        let mut config = APP_CONFIG.get().unwrap().lock().unwrap();
        config.tool_shortcuts.remove(&tool_id);
        config.clone()
    };
    save_config(&config_snapshot, &cfg_path);

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            resize_window,
            pick_color,
            scan_applications,
            launch_application,
            get_app_icon,
            get_settings,
            update_shortcut,
            set_autostart_setting,
            read_file_as_base64,
            save_images_to_downloads,
            save_binary_to_downloads,
            get_clipboard_files,
            get_clipboard_change_count,
            get_llm_config,
            set_llm_config,
            detect_llm_runtimes,
            list_available_models,
            test_llm_connection,
            translate_to_naming,
            translate_text,
            register_tool_shortcut,
            unregister_tool_shortcut,
            validate_local_model,
            download_model,
            list_downloaded_models,
            delete_model,
            cancel_download,
            list_pending_downloads,
            delete_pending_download,
            pick_gguf_file,
            search_models,
            list_model_files,
            set_terminal_setting,
            scan_installed_terminals,
            vscode_installed,
            get_clipboard_folder,
            open_in_vscode,
            open_in_terminal
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // Status bar tray icon
            {
                use tauri::menu::{Menu, MenuItem};
                use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

                let show_item = MenuItem::with_id(app, "show", "显示 MTools", true, None::<&str>)?;
                let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

                let icon_bytes = include_bytes!("../icons/tray-icon.png");
                let icon = tauri::image::Image::from_bytes(icon_bytes)?;

                TrayIconBuilder::new()
                    .icon(icon)
                    .tooltip("MTools")
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(move |app, event| match event.id().as_ref() {
                        "show" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            let app = tray.app_handle();
                            if let Some(w) = app.get_webview_window("main") {
                                if w.is_visible().unwrap_or(false) {
                                    let _ = w.emit("window-toggle", ());
                                } else {
                                    let _ = w.show();
                                    let _ = w.set_focus();
                                    let _ = w.emit("window-shown", ());
                                }
                            }
                        }
                    })
                    .build(app)?;
            }

            // Load config and register shortcut
            {
                let cfg_path = config_file_path();
                let config = load_config(&cfg_path);
                APP_CONFIG.set(Mutex::new(config.clone())).unwrap();

                use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
                let (modifiers, code) = parse_shortcut(&config.shortcut).expect("Invalid shortcut in config");
                let shortcut = Shortcut::new(modifiers, code);
                app.global_shortcut().on_shortcut(shortcut, move |app, _shortcut, event| {
                    if event.state() != ShortcutState::Pressed { return; }
                    if let Some(w) = app.get_webview_window("main") {
                        if w.is_visible().unwrap_or(false) {
                            let _ = w.emit("window-toggle", ());
                        } else {
                            let _ = w.show();
                            let _ = w.set_focus();
                            let _ = w.emit("window-shown", ());
                        }
                    }
                })?;
            }

            // Register tool direct shortcuts from config
            {
                use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

                let config = APP_CONFIG.get().unwrap().lock().unwrap();
                for (tool_id, shortcut_str) in &config.tool_shortcuts {
                    if let Ok((modifiers, code)) = parse_shortcut(shortcut_str) {
                        let gs = Shortcut::new(modifiers, code);
                        let _ = app.global_shortcut().unregister(gs);
                        let tid = tool_id.clone();
                        let _ = app.global_shortcut().on_shortcut(gs, move |app, _shortcut, event| {
                            if event.state() != ShortcutState::Pressed { return; }
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                                let _ = w.emit("open-tool-direct", tid.clone());
                            }
                        });
                    }
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running MTools");
}
