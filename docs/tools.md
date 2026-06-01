# MTools 内置工具功能规格

## 工具总览

| 工具 | ID | 剪贴板检测 | 底部工具栏 |
|------|-----|:----------:|:----------:|
| JSON 格式化 | json-formatter | ✅ | ✅ |
| Base64 编解码 | base64 | ✅ | - |
| 时间戳转换 | timestamp | ✅ | - |
| UUID 生成器 | uuid | - | - |
| URL 编解码 | url-encode | ✅ | - |
| Hash 计算 | hash | - | - |
| 正则测试 | regex-tester | - | - |
| 颜色转换 | color-picker | ✅ | - |
| 计算稿 | calc-pad | - | ✅ |
| 设置 | settings | - | - |
| 变量命名 | naming | ✅ | ✅ |
| 翻译 | translator | ✅ | ✅ |

---

## 1. JSON 格式化

**ID**：`json-formatter`
**关键词**：`json`, `format`, `格式化`, `校验`

### 功能

- 格式化（2 空格缩进）、压缩（单行）、实时校验（显示错误信息和位置）
- 结构描述：`Object{3}`、`Array[5]` 等
- 键路径过滤：输入 `data.list` 提取嵌套数据

### 剪贴板检测

以 `{`/`}` 或 `[`/`]` 包裹的合法 JSON → 填入并自动格式化

### 底部工具栏

| 按钮 | 功能 |
|------|------|
| 格式化 | 美化 JSON |
| 压缩 | 压缩为单行 |
| 复制 | 复制编辑器内容 |
| 清空 | 清空编辑器 |
| 过滤输入框 | 键路径过滤，如 `data.list` |

---

## 2. Base64 编解码

**ID**：`base64`
**关键词**：`base64`, `encode`, `decode`, `编码`, `解码`

### 功能

- 编码/解码双模式切换，输入后实时转换
- 通过 `encodeURIComponent`/`decodeURIComponent` 支持 Unicode

### 剪贴板检测

合法 Base64 字符串（≥4 位，`atob()` 成功且含可打印字符） → 填入并切到解码模式

---

## 3. 时间戳转换

**ID**：`timestamp`
**关键词**：`timestamp`, `time`, `时间戳`, `时间`, `日期`

### 功能

- 实时显示当前 Unix 时间戳（每秒更新）
- 时间戳 → 日期：支持 10 位（秒）/ 13 位（毫秒），输出本地时间、UTC、ISO 8601
- 日期 → 时间戳：输出秒级和毫秒级

### 剪贴板检测

10 或 13 位纯数字（年份 2000–2100） → 填入并转为日期

---

## 4. UUID 生成器

**ID**：`uuid`
**关键词**：`uuid`, `guid`, `唯一`, `id`

### 功能

- 生成 UUID v4，支持批量（1–100 个，默认 1 个）
- 每个有独立复制按钮，支持一键全部复制
- 打开时自动生成一个

---

## 5. URL 编解码

**ID**：`url-encode`
**关键词**：`url`, `encode`, `decode`, `uri`, `编码`, `解码`

### 功能

- 编码/解码双模式切换，输入后实时转换

### 剪贴板检测

包含 `%XX` 编码的文本 → 填入并切到解码模式

---

## 6. Hash 计算

**ID**：`hash`
**关键词**：`hash`, `md5`, `sha`, `哈希`, `摘要`

### 功能

- 同时计算 SHA-1、SHA-256、SHA-512（Web Crypto API）
- 每个哈希值有独立复制按钮，复制后显示"已复制"反馈

---

## 7. 正则测试

**ID**：`regex-tester`
**关键词**：`regex`, `regexp`, `regular`, `正则`, `表达式`

### 功能

- 以 `/pattern/flags` 格式输入，默认 flags `g`
- 实时匹配、高亮标记、显示匹配数量和具体内容
- HTML 转义防注入

---

## 8. 颜色转换

**ID**：`color-picker`
**关键词**：`color`, `hex`, `rgb`, `hsl`, `颜色`, `色彩`

### 布局

左右双列布局（55% / 45%）：

**左列 — 取色与转换：** 原生颜色选择器 + 屏幕取色按钮 + 手动输入框（HEX/RGB 实时转换）+ 颜色预览块（带收藏星标）+ HEX/RGB/HSL 格式行（每行有标签、值、复制按钮）

**右列 — 收藏与色卡：** 标签页切换（收藏 / Material / Ant / Tailwind），色卡网格，收藏色块支持 hover 删除

### 功能

- 格式互转（HEX、RGB、HSL）
- 屏幕取色：macOS 原生 `NSColorSampler`（Rust 后端 `pick_color` 命令）
- 颜色收藏：上限 30 个，持久化到 `localStorage`（key: `mtools:color-picker:favorites`）

### 剪贴板检测

`#RGB`/`#RRGGBB` 或 `rgb(r, g, b)` 格式 → 填入并转换

---

## 9. 计算稿

**ID**：`calc-pad`
**关键词**：`calc`, `calculator`, `计算`, `稿纸`, `运算`, `加减乘除`

### 功能

- 从上到下逐行输入表达式，实时显示计算结果
- 回车后结果带入下一行表达式（可编辑修改）
- 右侧稿纸列表：新建稿纸、切换、删除
- 数据持久化到 `localStorage`（key: `mtools:calc-pad:pads`）

### 底部工具栏

| 按钮 | 功能 |
|------|------|
| 清空 | 清空当前稿纸（⌘R 快捷键） |

---

## 10. 设置

**ID**：`settings`
**关键词**：`settings`, `设置`, `快捷键`, `自启动`, `shortcut`, `autostart`, `偏好`

### 功能

- **快捷键修改**：点击输入框进入录入模式，按下修饰键+按键组合即保存。实时显示按下的修饰键，录入完成自动 blur
- **开机自启动**：toggle 开关，通过 macOS LaunchAgent plist 实现
- **AI 模型配置**：
  - 运行时选择（自动检测 / Ollama / LM Studio / 内嵌引擎）
  - **外部服务模式**：模型服务地址 + 模型下拉选择 + 自动检测 + 测试连接
    - URL 输入变化后自动刷新模型列表
    - 自动检测失败时 fallback 到用户填写的自定义 URL
  - **内嵌引擎模式**：
    - 本地模型路径输入 + 文件选择器（筛选 `.gguf`）
    - 推荐模型列表（Qwen2.5 系列），一键下载到 `~/.mtools/models/`
    - 已下载模型管理（列表 + 删除）
    - 下载进度事件（`model-download-progress` / `model-download-complete`）

### 配置持久化

配置文件 `~/Library/Application Support/com.mtools.app/config.json`，Rust 端读写。

### Tauri 后端命令

| 命令 | 功能 | 返回值 |
|------|------|--------|
| `get_settings` | 获取全部配置 | `{ shortcut, autoStart, llm, toolShortcuts }` |
| `set_llm_config` | 保存 LLM 配置（含 `local_model_path`） | `Result<(), String>` |
| `detect_llm_runtimes` | 检测本机 LLM 运行时 | `{ runtimes: [{id, name, apiUrl}] }` |
| `list_available_models` | 列出运行时可用模型（Ollama + OpenAI 格式） | `{ models: string[] }` |
| `test_llm_connection` | 测试模型连接 | `{ success: bool, error? }` |
| `validate_local_model` | 验证 GGUF 文件 | `{ valid: bool, error? }` |
| `download_model` | 下载模型（带进度事件） | `Result<(), String>` |
| `list_downloaded_models` | 列出已下载模型 | `{ models: [{name, path, size}] }` |
| `delete_model` | 删除模型文件 | `Result<(), String>` |

---

## 11. 快速启动系统应用

**模块**：`app-launcher`（非标准工具接口，集成在搜索流程中）

### 功能

- 搜索栏输入时与内置工具混合展示（各最多 5 个，合计上限 10）
- 拼音搜索（全拼 + 首字母），真实图标（异步懒加载），点击/回车启动后自动隐藏窗口

### 搜索规则

- 扫描目录：`/Applications`、`/System/Applications`、`~/Applications`
- 应用列表首次加载后缓存（Rust `OnceLock` + 前端拼音预计算）

### Tauri 后端命令

| 命令 | 功能 | 返回值 |
|------|------|--------|
| `scan_applications` | 扫描已安装应用 | `Vec<{name, path}>` |
| `launch_application` | 启动指定应用 | `Result<(), String>` |
| `get_app_icon` | 提取应用图标 | `Option<String>`（base64 PNG） |

---

## 12. 变量命名

**ID**：`naming`
**关键词**：`variable`, `变量`, `camel`, `驼峰`, `naming`, `命名`, `snake`, `kebab`, `变量名`

### 布局

上下布局：上方为输入框，下方为命名结果列表。

### 功能

- 中文文本输入后调用 LLM 翻译为英文，输出多种编程命名格式
- 支持格式（可在工具设置中勾选）：camelCase、PascalCase、snake_case、UPPER_SNAKE_CASE、kebab-case
- LLM 可返回多条建议，每条建议独立展示所有命名格式
- 点击格式行或复制按钮即可复制，1.5 秒反馈
- **推理后端自动选择**：
  - `auto` 模式：优先使用内嵌本地模型，其次走外部 API
  - `embedded` 模式：使用 llama.cpp + Metal 本地推理
  - `ollama`/`lmstudio` 模式：通过 HTTP API 调用

### 前置依赖

需在「设置」工具中配置 AI 模型。支持三种方式：
1. **外部服务**：配置 Ollama / LM Studio 等模型服务地址 + 选择模型
2. **内嵌引擎**：配置本地 GGUF 模型路径或从推荐列表下载模型
3. **自动检测**：自动选择可用的推理后端

未配置时翻译结果区提示「请先在设置中配置 AI 模型」。

### 剪贴板检测

包含 2 个及以上中文字符且长度小于 15、不含句号等标点的短文本 → 提示「xxx 可以翻译为变量命名」

### 底部工具栏

| 按钮 | 功能 |
|------|------|
| 翻译 | 手动触发翻译 |
| 清空 | 清空输入和结果 |
| 设置 | 打开设置浮层（遮罩 + 卡片，点击遮罩关闭） |

### 工具级设置

工具内设置浮层包含：

- **命名格式**：勾选要展示的命名格式，持久化到 `localStorage`（key: `mtools:naming:formats`）

### Tauri 后端命令

| 命令 | 功能 | 返回值 |
|------|------|--------|
| `translate_to_naming` | 调用 LLM 翻译中文为英文命名建议（自动选择内嵌/外部） | `{ suggestions: string[] }` |

---

## 13. 翻译

**ID**：`translator`
**关键词**：`translate`, `翻译`, `翻译文本`, `中英`, `英中`, `text`, `翻译器`

### 布局

左右双列弹性布局：左侧输入区 + 右侧结果区，自适应填充面板高度。

### 功能

- 中英互译：自动检测输入语言（中文→英文、英文→中文）
- 输入后自动翻译（防抖 600ms），也可按 Enter 或点击翻译按钮手动触发
- 翻译结果直接显示在右侧结果区，带复制按钮
- **推理后端自动选择**：
  - `auto` 模式：优先使用内嵌本地模型，其次走外部 API
  - `embedded` 模式：使用 llama.cpp + Metal 本地推理
  - `ollama`/`lmstudio` 模式：通过 HTTP API 调用

### 前置依赖

与变量命名工具共享 AI 模型配置。

### 剪贴板检测

- 包含 2 个及以上中文字符的文本 → 提示「xxx 可以翻译」
- 包含 3 个及以上英文字母且长度大于 5 的文本 → 提示「xxx 可以翻译为中文」
- **多个工具匹配时翻译优先置顶**

### 底部工具栏

| 按钮 | 功能 |
|------|------|
| 翻译 | 手动触发翻译 |
| 清空 | 清空输入和结果 |
| 设置 | 打开设置浮层（遮罩 + 卡片，点击遮罩关闭） |

### 工具级设置

工具内设置浮层包含：

- **直达快捷键**：录入后按下快捷键直接打开翻译工具，通过 `register_tool_shortcut`/`unregister_tool_shortcut` 后端命令注册全局快捷键，持久化到配置文件 `tool_shortcuts` 字段

### Tauri 后端命令

| 命令 | 功能 | 返回值 |
|------|------|--------|
| `translate_to_naming` | 调用 LLM 翻译（自动选择内嵌/外部） | `{ translation: string }` |
| `register_tool_shortcut` | 注册工具直达全局快捷键 | `Result<(), String>` |
| `unregister_tool_shortcut` | 注销工具直达全局快捷键 | `Result<(), String>` |
