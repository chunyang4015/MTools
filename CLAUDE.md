# CLAUDE.md - MTools 项目指引

## 项目概述

MTools 是一款 macOS 效率工具箱。Tauri v2 + 原生 Web（HTML/CSS/JS，无框架无构建）。内嵌 llama.cpp + Metal 推理引擎，支持本地 GGUF 模型。

## 项目结构

```
MTools2/
├── src-tauri/              # Tauri 后端（Rust）
│   ├── src/lib.rs          # 主逻辑：全局快捷键、窗口管理、Tauri 命令、配置管理、自启动、LLM 翻译（含内嵌 llama.cpp 推理）
│   ├── src/main.rs         # 入口
│   ├── src/macos_picker.m  # macOS 原生取色
│   ├── src/macos_icon.m    # macOS 应用图标提取
│   ├── build.rs            # 构建脚本：编译 Objective-C 文件
│   └── tauri.conf.json     # Tauri 配置
├── src/                    # 前端代码
│   ├── index.html          # 主 HTML
│   ├── main.js             # 应用控制器：搜索、Tab 系统、IME 组合、剪贴板检测、工具直达快捷键
│   ├── styles.css          # 全局样式
│   ├── lib/
│   │   ├── registry.js     # 内置工具注册与搜索（含拼音匹配）
│   │   ├── pinyin.js       # 拼音转换
│   │   └── app-launcher.js # 系统应用扫描、搜索、图标加载、启动
│   └── tools/              # 工具实现（每个工具一个文件）
│       ├── json-formatter.js
│       ├── base64.js
│       ├── timestamp.js
│       ├── uuid.js
│       ├── url-encode.js
│       ├── hash.js
│       ├── regex-tester.js
│       ├── color-picker.js
│       ├── calc-pad.js     # 计算稿
│       ├── naming.js       # 变量命名（中文→英文变量命名，本地 LLM）
│       ├── translator.js   # 翻译（中英互译，本地 LLM，支持直达快捷键）
│       └── settings.js     # 设置（快捷键、自启动、AI 模型配置）
└── docs/
    ├── interaction-design.md     # 交互设计
    ├── tools.md                  # 内置工具功能规格
    ├── rust-backend.md           # Rust 后端命令 + 内嵌推理引擎
    └── translation-tool-prd.md   # 翻译工具需求分析
```

## 开发命令

```bash
npx tauri dev      # 开发模式
npx tauri build    # 生产构建
```

Rust 代码改动后需手动触发重编译：`cd src-tauri && cargo build`

## 架构

搜索框输入时同时匹配内置工具（最多 5 个）和系统应用（最多 5 个），混合展示。IME 组合输入期间不触发搜索（`compositionstart/end`），仅在确认后执行。窗口高度根据结果数量动态调整，高度未变时跳过 IPC。搜索防抖 80ms，结果去重（相同 ID 跳过渲染），图标加载延迟 500ms（输入期间不触发）。

详细交互设计 → [docs/interaction-design.md](docs/interaction-design.md)

### 剪贴板智能识别

每次唤醒搜索框时检测剪贴板内容，匹配到的工具以描述文字展示在搜索结果中。**同一条剪贴板内容只提示一次**——关闭窗口、选了其他工具、或点击检测到的工具后，只要剪贴板不变就不重复提示。通过 `lastDetectedClipboard` 指纹（`changeCount` + 文本 + 文件路径）去重。支持文本剪贴板（`readClipboardText`）和文件剪贴板（`get_clipboard_files`，检测 PDF 等文件类型）。**当多个工具同时匹配时，翻译工具优先置顶**，方便快速按 Enter 打开。

## Rust 后端命令

完整命令表（24 个）→ [docs/rust-backend.md](docs/rust-backend.md)

关键规则：**所有涉及 macOS 原生 API 的命令必须用 `async` + `spawn_blocking`**，否则阻塞主线程导致 WebView 输入卡顿。仅纯计算或纯数据操作可以用同步命令。

内嵌推理引擎（llama.cpp + Metal）架构和注意事项 → [docs/rust-backend.md](docs/rust-backend.md)

## 配置持久化

配置文件：`~/Library/Application Support/com.mtools.app/config.json`

详细配置结构和字段说明 → [docs/rust-backend.md](docs/rust-backend.md)

## 工具接口

每个工具遵循统一接口：

```js
{
  id: string,           // 唯一标识
  name: string,         // 显示名称
  icon: string,         // 图标（inline SVG）
  description: string,  // 一行描述
  keywords: string[],   // 搜索关键词（中英文）
  render(container),    // 渲染 UI 到容器
  destroy(),            // 清理（定时器等）
  detectClipboardData?(text): string | null,
  setData?(text): void,
  toolbar?: [{ icon?, label?, action?, type, placeholder?, onInput? }]
}
```

新工具：在 `src/tools/` 下创建文件 → 在 `src/lib/registry.js` 中 import 并添加到 tools 数组。

工具功能规格 → [docs/tools.md](docs/tools.md)

## 搜索输入性能优化

已优化：搜索防抖 80ms、结果去重、resize 防抖 120ms、图标延迟 500ms、原生命令全部 async + spawn_blocking。

根因分析和优化详情 → [docs/rust-backend.md](docs/rust-backend.md)

## Tauri v2 注意事项

- `LogicalSize` 在 `window.__TAURI__.dpi` 下，不是 `window.__TAURI__.window`
- `withGlobalTauri: true` 时 API 通过 `window.__TAURI__` 访问
- JS 调用 Rust：`window.__TAURI__.core.invoke('command_name', args)`
- 窗口操作需在 `capabilities/default.json` 中声明权限
- 全局快捷键回调：`(app, &Shortcut, ShortcutEvent)`，第三个参数才有 `.state()`
- 快捷键需过滤 `ShortcutState::Pressed`，避免松开重复触发
- 不显示 Dock 栏：`app.set_activation_policy(ActivationPolicy::Accessory)`
- macOS 原生 API 需主线程：`dispatch_async(dispatch_get_main_queue(), ...)`
- macOS 16 `NSColorSampler` 方法重命名：需同时检查 `showWithSelectionHandler:` 和 `showSamplerWithSelectionHandler:`

## macOS 输入框遮罩问题（重要）

所有 `<input type="text">` 和 `<textarea>` 元素**必须**添加以下属性，防止 macOS 自动纠正/拼写检查弹出遮罩浮层：

```html
<input ... autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
<textarea ... autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
```

不添加这些属性时，macOS WebView 会在输入时弹出系统级自动纠正建议浮层（如 "Hello" 建议），覆盖输入区域。新增工具或新建输入框时务必检查。已修复的文件：`index.html`（搜索框）、`translator.js`、`naming.js`、`regex-tester.js`、`base64.js`、`url-encode.js`、`hash.js`、`timestamp.js`、`calc-pad.js`。

## 约定

- 前端使用 ES Modules，无框架
- CSS 自定义属性管理设计 token
- localStorage 命名规范：`mtools:<tool-id>:<key>`
- Rust 遵循标准命名规范
- 用户使用中文交流
