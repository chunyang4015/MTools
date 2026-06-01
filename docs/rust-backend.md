# Rust 后端命令参考

## 完整命令列表

| 命令 | 用途 |
|------|------|
| `resize_window(height)` | 动态调整窗口高度（宽度缓存，仅首次查 monitor） |
| `pick_color()` | 屏幕取色，返回 `#RRGGBB` |
| `scan_applications()` | 扫描已安装应用，返回 `{name, path}[]` |
| `launch_application(path)` | 启动指定应用（`open` 命令，也支持打开文件夹） |
| `get_app_icon(path)` | 提取应用图标，返回 base64 PNG（async，后台线程执行 NSImage 操作） |
| `get_settings()` | 获取当前配置（快捷键、自启动、LLM 配置） |
| `update_shortcut(shortcut)` | 更新全局快捷键，格式如 `"Alt+Space"` |
| `set_autostart_setting(enabled)` | 开关开机自启动 |
| `read_file_as_base64(path)` | 读取文件并返回 base64 编码（async，后台线程） |
| `save_images_to_downloads(folder_name, images)` | 将 base64 图片数组保存到 `~/Downloads/<folder_name>/`（async，后台线程） |
| `get_clipboard_files()` | 读取 macOS 剪贴板中的文件路径列表（async，通过 NSPasteboard） |
| `get_clipboard_change_count()` | 返回 macOS 粘贴板变化计数，每次写入递增（同步，通过 NSPasteboard.changeCount） |
| `get_llm_config()` | 获取 LLM 配置（runtime、api_url、model、local_model_path） |
| `set_llm_config(runtime, api_url, model, local_model_path)` | 保存 LLM 配置 |
| `detect_llm_runtimes()` | 检测本机 LLM 运行时（Ollama、LM Studio） |
| `list_available_models(api_url)` | 列出运行时可用模型（兼容 Ollama `/api/tags` 和 OpenAI `/v1/models`） |
| `test_llm_connection(api_url, model)` | 测试模型连接是否可用 |
| `translate_to_naming(text)` | 调用 LLM 翻译中文为英文命名建议（自动选择内嵌引擎或外部 API） |
| `validate_local_model(path)` | 验证 GGUF 文件是否有效 |
| `download_model(name, url)` | 下载模型到 `~/.mtools/models/`（支持断点续传、取消、速度显示） |
| `list_downloaded_models()` | 列出已下载模型 |
| `delete_model(path)` | 删除模型文件 |
| `cancel_download(name)` | 取消正在进行的下载 |
| `list_pending_downloads()` | 列出中断的下载任务（含 URL，支持重试） |
| `delete_pending_download(name)` | 删除中断的下载临时文件 |
| `register_tool_shortcut(tool_id, shortcut)` | 注册工具直达全局快捷键 |
| `unregister_tool_shortcut(tool_id)` | 注销工具直达全局快捷键 |

## 下载管理

### 断点续传机制

下载文件保存为 `.part` 临时文件，完成后再重命名为最终文件。中断后再次调用 `download_model` 会检测 `.part` 文件大小，通过 HTTP Range 头续传。服务器不支持 Range 时自动重新下载。

### 下载事件

| 事件 | 触发时机 | Payload |
|------|---------|---------|
| `model-download-started` | 下载开始 | `{name, url, resuming, existingSize}` |
| `model-download-progress` | 每 300ms 更新 | `{name, downloaded, total, progress, speed}` |
| `model-download-complete` | 下载完成 | `{name, path}` |
| `model-download-failed` | 下载失败 | `{name, error, downloaded, total}` |
| `model-download-cancelled` | 用户取消 | `{name}` |

### 临时文件

| 文件 | 用途 |
|------|------|
| `<name>.part` | 下载中的临时文件 |
| `<name>.part.json` | 下载元数据（`{url, name}`），用于重试 |

## 内嵌推理引擎

使用 `llama-cpp-2` crate（v0.1.146，Metal + sampler 特性）在 Apple Silicon 上本地推理 GGUF 模型。

### 架构

```
EmbeddedState (Mutex, OnceLock)
  ├── model: Option<LlamaModel>    -- 懒加载，首次推理时加载
  └── loaded_path: String          -- 已加载的模型路径（避免重复加载）

run_inference(model_path, messages, max_tokens)
  1. ensure_model_loaded()         -- 懒加载模型（GPU 层数 100）
  2. model.chat_template(None)     -- 获取模型自带的聊天模板
  3. LlamaChatMessage::new()       -- 构造 system/user/assistant 消息
  4. model.apply_chat_template()   -- 应用模板格式化 prompt
  5. model.str_to_token()          -- 分词
  6. batch.add_sequence()          -- 批处理（自动在最后一个 token 设置 logits）
  7. 循环：sample → token_to_piece → decode
```

### 推理调度（translate_to_naming）

1. `auto` 模式：检查 `local_model_path` 文件是否存在 → 存在则走内嵌引擎，否则走外部 API
2. `embedded` 模式：直接走内嵌引擎，检查 `local_model_path` 或 `~/.mtools/models/` 下的 GGUF 文件
3. `ollama`/`lmstudio` 模式：走 HTTP API（OpenAI 兼容格式）

### 关键注意事项

- **logits**：`batch.add()` 的 `logits` 参数控制是否计算 logits。最后一个 prompt token 必须设 `logits=true`，否则采样会读取未初始化内存导致崩溃。`batch.add_sequence()` 自动处理。
- **聊天模板**：必须通过 `model.apply_chat_template()` 格式化 prompt，直接喂原始文本模型会输出乱码。
- **token_to_piece**：需要 `encoding_rs::Decoder` 参数（已添加为依赖）。
- **n_ctx**：默认 1024 tokens，小模型翻译场景足够。
- **温度**：0.3，适合翻译任务（确定性优先）。
- **Few-shot**：系统提示中包含示例（"用户名" → userName，"翻译" → translate），小模型有示例后输出更稳定。

### 翻译 Prompt

```
System: 将中文翻译为英文变量名。直接翻译原意，不要添加多余词汇。每行一个，用 camelCase，不要解释。

User: 翻译以下中文：用户名
Assistant: userName

User: 翻译以下中文：翻译
Assistant: translate

User: 翻译以下中文：{input}
```

## 配置持久化

配置文件：`~/Library/Application Support/com.mtools.app/config.json`

```json
{
  "shortcut": "Alt+Space",
  "auto_start": false,
  "llm": {
    "runtime": "auto",
    "api_url": "http://localhost:11434",
    "model": "",
    "local_model_path": ""
  },
  "tool_shortcuts": {
    "translator": "Alt+T"
  }
}
```

快捷键格式：修饰键用 `+` 连接，支持 `Alt`、`Cmd`、`Ctrl`、`Shift`，按键支持 `Space`、`A`-`Z`、`0`-`9`、`F1`-`F12`、`Backquote`。自启动通过 macOS LaunchAgent plist 实现（`~/Library/LaunchAgents/com.mtools.app.plist`）。`llm.runtime` 支持四种模式：`auto`（自动检测）、`ollama`、`lmstudio`、`embedded`（内嵌引擎）。`auto` 模式按优先级选择：本地模型 → 外部 API。

## 搜索输入性能优化

搜索框输入时的卡顿根因是 **Rust 主线程被 IPC 调用阻塞**，导致 WebView 无法处理键盘事件。Tauri v2 同步命令（非 async）在主线程执行，期间 WebView 事件排队等待。

### 根因链路

```
用户输入 → 80ms防抖 → 搜索渲染 → resize IPC (阻塞主线程 ~30ms)
                                → get_app_icon x5 IPC (每个 ~20ms, 共 ~100ms)
                                → 主线程被占 ~130ms → 键盘事件排队 → 多字符延迟
```

### 已实施的优化

| 优化项 | 文件 | 效果 |
|--------|------|------|
| 搜索防抖 30ms → 80ms | main.js | 减少渲染频率 ~60% |
| 去掉 requestAnimationFrame 包装 | main.js | 避免 rAF 阻塞渲染管线导致当帧无法绘制输入字符 |
| 结果去重（相同 ID 跳过渲染） | main.js | 连续输入缩小范围时跳过无效 DOM 重建 |
| 窗口 resize 防抖 50ms → 120ms | main.js | 合并多次高度变化为一次 IPC |
| 图标加载延迟 100ms → 500ms | app-launcher.js | 输入期间零次 get_app_icon IPC，停止输入后才加载 |
| get_app_icon 改为 async + spawn_blocking | lib.rs | NSImage 提取移到后台线程，不再阻塞 Rust 主线程 |

### 新增命令规则

**所有涉及 macOS 原生 API 的命令必须用 `async` + `spawn_blocking`**，否则会阻塞主线程导致 WebView 输入卡顿：

```rust
// 正确：异步 + 后台线程
#[tauri::command]
async fn some_native_command(path: String) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || {
        // macOS 原生调用
    }).await.ok().flatten()
}

// 错误：同步命令阻塞主线程
#[tauri::command]
fn some_native_command(path: String) -> Option<String> {
    // 这会阻塞 WebView 事件处理
}
```

仅纯计算或纯数据操作（不涉及原生 API、窗口操作）可以用同步命令。
