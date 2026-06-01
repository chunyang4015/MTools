# 设置页面 UI 改版设计文档

## 1. 改版目标

将设置页面从单栏改为左右双栏布局，新增模型社区搜索下载功能。

## 2. 布局结构

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│  ┌──────────┐  ┌──────────────────────────────────┐  │
│  │  ⚙ 通用   │  │                                  │  │
│  │  🤖 AI 模型│  │   (选中分类对应的设置内容)         │  │
│  │           │  │                                  │  │
│  │           │  │                                  │  │
│  │           │  │                                  │  │
│  │           │  │                                  │  │
│  └──────────┘  └──────────────────────────────────┘  │
│                                                      │
└──────────────────────────────────────────────────────┘
```

- **左栏**：固定宽度（~160px），图标 + 文字垂直列表，点击切换右栏内容
- **右栏**：flex:1，展示当前选中分类的完整设置

### CSS 结构

```css
.settings-panel {
  display: flex;
  height: 100%;
}

.settings-sidebar {
  width: 160px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  padding: 12px 0;
}

.settings-sidebar-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  cursor: pointer;
  border-radius: 6px;
  margin: 2px 8px;
}

.settings-sidebar-item.active {
  background: var(--accent-bg);
  color: var(--accent);
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}
```

## 3. 通用设置（左栏选中"通用"时）

保持现有 UI 样式不变：

```
┌──────────────────────────────────┐
│  快捷键                          │
│  显示/隐藏窗口          ⌥ Space  │
│                                  │
│  通用                            │
│  开机自启动                  [○]  │
└──────────────────────────────────┘
```

直接复用现有的 settings-section / settings-row 结构。

## 4. AI 模型设置（左栏选中"AI 模型"时）

### 4.1 运行时配置

保持现有功能：运行时选择、外部服务（地址 + 模型 + 自动检测 + 测试连接）、内嵌引擎（本地模型路径 + 文件选择 + 已下载模型）。

UI 不变，只是外层容器从单栏变成了右栏。

### 4.2 模型社区搜索下载（新增）

在内嵌引擎区域新增「模型社区」子区块，提供 HuggingFace 和魔搭社区两个来源的搜索下载。

#### 交互流程

```
┌──────────────────────────────────────────────────┐
│  模型社区                                         │
│                                                  │
│  [HuggingFace]  [魔搭社区]       ← 来源切换 tab  │
│  [🔍 搜索 GGUF 模型...]                          │
│                                                  │
│  ── 搜索结果 / 推荐模型 ──                        │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │ Qwen2.5-3B-Instruct-GGUF                   │  │
│  │ Qwen · ↓ 42,391 · ❤ 128                    │  │
│  │                                    [下载 ▾]  │  │
│  └────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────┐  │
│  │ Llama-3.2-1B-Instruct-GGUF                 │  │
│  │ hugging-quants · ↓ 766,491 · ❤ 46          │  │
│  │                                    [下载 ▾]  │  │
│  └────────────────────────────────────────────┘  │
│  ...                                             │
│                                                  │
│  [加载更多]                                      │
└──────────────────────────────────────────────────┘
```

**点击「下载 ▾」**：展开显示该模型的 GGUF 文件列表

```
┌──────────────────────────────────────────────────┐
│  Qwen2.5-3B-Instruct-GGUF                        │
│  Qwen · ↓ 42,391 · ❤ 128                         │
│                                                  │
│  ├── qwen2.5-3b-instruct-q4_k_m.gguf  2.0GB [下载]│
│  ├── qwen2.5-3b-instruct-q5_k_m.gguf  2.4GB [下载]│
│  ├── qwen2.5-3b-instruct-q8_0.gguf    3.7GB [下载]│
│  └── ...                                         │
└──────────────────────────────────────────────────┘
```

**点击文件「下载」**：复用现有 `download_model` 命令，进度通过事件推送。

#### 推荐模型

无搜索关键词时展示内置推荐列表（替代现有 `RECOMMENDED_MODELS`），按社区分组：

| 来源 | 推荐模型 |
|------|----------|
| HuggingFace | Qwen2.5-3B-Instruct、Qwen2.5-1.5B-Instruct、Qwen2.5-7B-Instruct（均为 Q4_K_M 量化） |
| 魔搭社区 | 同上（魔搭有 Qwen 官方镜像，国内下载更快） |

推荐列表在前端硬编码（已有 `RECOMMENDED_MODELS` 数组），不需要 API 调用。搜索框有内容时隐藏推荐列表，展示搜索结果。

#### 搜索行为

- 来源 tab 在上，搜索框紧跟其下（搜索是针对当前来源的）
- 输入关键词后防抖 500ms 调用后端搜索
- 搜索框清空后恢复展示推荐模型
- 切换来源 tab 时：如果搜索框有内容则重新搜索，否则展示该来源的推荐模型
- 每次加载 20 条，底部「加载更多」翻页

## 5. Rust 后端新增命令

### `search_models(source, query, page)`

搜索模型社区中的 GGUF 模型。

**参数**：
- `source`: `"huggingface"` | `"modelscope"`
- `query`: 搜索关键词（空字符串时返回热门模型）
- `page`: 页码（从 1 开始）

**返回**：
```json
{
  "models": [
    {
      "id": "Qwen/Qwen2.5-3B-Instruct-GGUF",
      "author": "Qwen",
      "downloads": 42391,
      "likes": 128,
      "source": "huggingface"
    }
  ],
  "total": 156,
  "page": 1,
  "hasMore": true
}
```

### `list_model_files(source, model_id)`

获取指定模型的 GGUF 文件列表。

**参数**：
- `source`: `"huggingface"` | `"modelscope"`
- `model_id`: 模型 ID（如 `"Qwen/Qwen2.5-3B-Instruct-GGUF"`）

**返回**：
```json
{
  "files": [
    {
      "name": "qwen2.5-3b-instruct-q4_k_m.gguf",
      "size": 1999000000,
      "downloadUrl": "https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf"
    }
  ]
}
```

## 6. API 端点参考

### HuggingFace

| 用途 | 端点 |
|------|------|
| 搜索 | `GET https://huggingface.co/api/models?filter=gguf&search={query}&sort=downloads&direction=-1&limit=20` |
| 文件列表 | `GET https://huggingface.co/api/models/{owner}/{repo}` → `siblings[].rfilename` 过滤 `.gguf` |
| 下载 URL | `https://huggingface.co/{owner}/{repo}/resolve/main/{filename}` |
| 分页 | `Link` header 中的 `cursor` 参数 |

### 魔搭社区

| 用途 | 端点 |
|------|------|
| 搜索 | `GET https://www.modelscope.cn/openapi/v1/models?search=gguf+{query}&sort=downloads&page_number={page}&page_size=20` |
| 文件列表 | `GET https://www.modelscope.cn/api/v1/models/{owner}/{repo}/repo/files?Recursive=True` → 过滤 `.gguf` |
| 下载 URL | `https://www.modelscope.cn/models/{owner}/{repo}/resolve/master/{filename}` |
| 分页 | `page_number` / `page_size` 参数 |

## 7. 影响范围

### 前端

| 文件 | 变更 |
|------|------|
| `src/tools/settings.js` | 重构 HTML 为双栏布局 + 新增模型搜索 UI 和逻辑 |
| `src/styles.css` | 新增双栏布局样式 + 模型搜索列表样式 |

### 后端

| 文件 | 变更 |
|------|------|
| `src-tauri/src/lib.rs` | 新增 `search_models` 和 `list_model_files` 两个命令 |

## 8. 实现顺序

1. CSS：双栏布局样式
2. JS：重构 settings render 为双栏结构，通用/AI 模型 tab 切换
3. Rust：新增 `search_models` 和 `list_model_files` 命令
4. JS：模型搜索 UI（搜索框 + 来源 tab + 结果列表 + 文件展开 + 下载）
