import { searchTools, getAllTools, getTool } from './lib/registry.js';
import { loadApps, searchApps, launchApp, loadIconsForResultItems } from './lib/app-launcher.js';

// DOM
const searchView = document.getElementById('search-view');
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
const toolView = document.getElementById('tool-view');
const tabItemsEl = document.getElementById('tab-items');
const toolContent = document.getElementById('tool-content');
const toolToolbar = document.getElementById('tool-toolbar');

// 常量
const BAR_H = 58;
const ITEM_H = 58;
const MAX_ITEMS = 10;
const MAX_TOOL_RESULTS = 5;
const MAX_APP_RESULTS = 5;
const PANEL_H = 560;
const MAX_TABS = 5;

const VSCODE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#0098FF" d="M17.5 2.5 9.2 10 5 6.5 3 8l4 4-4 4 2 1.5 4.2-3.5 8.3 7.5 3.5-1.5V4l-3.5-1.5zm0 4.2v10.6L11.5 12l6-5.3z"/></svg>';
const TERMINAL_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3"/><path d="M13 15h4"/></svg>';

// 状态
let currentView = 'search';
let results = [];
let selectedIdx = 0;
let tabs = [];
let activeTabId = null;
let clipboardText = '';
let lastDetectedClipboard = '';
let lastActiveToolId = null;
let isPinned = false;
let terminalNameMap = {};
window._skipBlur = false;

// ========== 窗口大小 ==========

let lastWindowHeight = 0;
let resizeTimer = null;
const RESIZE_DEBOUNCE = 120;
const SEARCH_DEBOUNCE = 80;
let prevResultIds = '';

function resizeWindow(height, immediate = false) {
  if (!window.__TAURI__) return;
  height = Math.round(height);
  if (!immediate && height === lastWindowHeight) return;
  lastWindowHeight = height;
  if (immediate) {
    clearTimeout(resizeTimer);
    window.__TAURI__.core.invoke('resize_window', { height }).catch(e => {
      console.error('resizeWindow:', e);
    });
    return;
  }
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    window.__TAURI__.core.invoke('resize_window', { height: lastWindowHeight }).catch(e => {
      console.error('resizeWindow:', e);
    });
  }, RESIZE_DEBOUNCE);
}

// ========== 视图切换 ==========

function showSearchView() {
  lastActiveToolId = null;
  if (isPinned) setPinned(false);
  currentView = 'search';
  prevResultIds = '';
  toolView.classList.add('hidden');
  searchView.classList.remove('hidden');
  searchInput.value = '';
  searchInput.focus();
  searchResults.innerHTML = '';
  results = [];
  selectedIdx = 0;
  clipboardText = '';
  resizeWindow(BAR_H, true);
  detectClipboard();
}

function showToolView() {
  currentView = 'tool';
  searchView.classList.add('hidden');
  searchInput.blur();
  toolView.classList.remove('hidden');
  resizeWindow(PANEL_H, true);
}

function setPinned(value) {
  isPinned = value;
  const btn = document.getElementById('pin-btn');
  btn.classList.toggle('active', value);
  btn.title = value ? '取消置顶' : '置顶窗口';
}

// ========== 剪贴板检测 ==========

async function readClipboardText() {
  if (!window.__TAURI__) {
    try { return await navigator.clipboard.readText(); } catch { return ''; }
  }
  try {
    return await window.__TAURI__.clipboardManager.readText();
  } catch {
    return '';
  }
}

async function detectClipboard() {
  const text = await readClipboardText();
  const detected = [];
  let fileFingerprint = '';
  let changeCount = 0;

  // macOS 剪贴板变化计数，重复制同一文件时计数递增
  if (window.__TAURI__) {
    try { changeCount = await window.__TAURI__.core.invoke('get_clipboard_change_count'); } catch {}
  }

  // 文本剪贴板检测
  if (text && text.trim()) {
    const textDetected = getAllTools()
      .map(tool => {
        if (!tool.detectClipboardData) return null;
        const desc = tool.detectClipboardData(text);
        return desc ? { tool, desc } : null;
      })
      .filter(Boolean);
    detected.push(...textDetected);
  }

  // macOS 文件剪贴板检测（复制文件时 readText 读不到路径）
  if (window.__TAURI__) {
    try {
      const filePaths = await window.__TAURI__.core.invoke('get_clipboard_files');
      if (filePaths && filePaths.length > 0) {
        fileFingerprint = filePaths.join(',');
        for (const fp of filePaths) {
          if (!fp.toLowerCase().endsWith('.pdf')) continue;
          const pdfTool = getTool('pdf-tools');
          if (pdfTool && !detected.some(d => d.tool.id === 'pdf-tools')) {
            detected.push({ tool: pdfTool, desc: '检测到 PDF 文件，点击使用 PDF 工具处理' });
          }
          if (!clipboardText) clipboardText = fp;
        }
      }
    } catch {}
  }

  // 文件夹检测：提示用 VSCode / 终端打开
  if (window.__TAURI__) {
    try {
      const folder = await window.__TAURI__.core.invoke('get_clipboard_folder');
      if (folder) {
        const [hasVscode, settings] = await Promise.all([
          window.__TAURI__.core.invoke('vscode_installed'),
          window.__TAURI__.core.invoke('get_settings'),
        ]);
        const baseName = folder.split('/').pop() || folder;
        if (hasVscode) {
          detected.push({
            folderAction: { type: 'vscode', folder },
            icon: VSCODE_ICON,
            name: '用 VSCode 打开',
            desc: `用 VSCode 打开「${baseName}」`,
          });
        }
        if (settings.terminal) {
          const terminalName = terminalNameMap[settings.terminal] || settings.terminal;
          detected.push({
            folderAction: { type: 'terminal', folder, terminalId: settings.terminal },
            icon: TERMINAL_ICON,
            name: `在 ${terminalName} 打开`,
            desc: `打开目录「${baseName}」`,
          });
        }
        if (!clipboardText) clipboardText = folder;
      }
    } catch {}
  }

  if (detected.length === 0) return;

  // 同一条剪贴板内容只提示一次；changeCount 变化（重复制）则重新检测
  const fingerprint = changeCount + '|' + (text?.trim() || '') + '|' + fileFingerprint;
  if (fingerprint === lastDetectedClipboard) return;
  lastDetectedClipboard = fingerprint;

  // 异步读取期间用户可能已切换到工具页面，此时不应覆盖窗口高度
  if (currentView !== 'search') return;

  if (text && text.trim() && !clipboardText) {
    clipboardText = text.trim();
  }
  // 翻译工具优先置顶，方便快速打开
  detected.sort((a, b) => {
    if (a.tool?.id === 'translator') return -1;
    if (b.tool?.id === 'translator') return 1;
    return 0;
  });
  results = detected.map(d => {
    if (d.folderAction) {
      return {
        id: 'folder-action-' + d.folderAction.type,
        name: d.name,
        icon: d.icon,
        _clipboardDesc: d.desc,
        _folderAction: d.folderAction,
      };
    }
    return { ...d.tool, _clipboardDesc: d.desc };
  });
  selectedIdx = 0;
  renderResults(true);
  resizeWindow(BAR_H + results.length * ITEM_H);
}

// ========== 应用启动 ==========

async function handleAppClick(appPath) {
  await launchApp(appPath);
  if (window.__TAURI__) {
    window.__TAURI__.window.getCurrentWindow().hide();
  }
}

async function handleFolderAction(action) {
  if (!window.__TAURI__) return;
  try {
    if (action.type === 'vscode') {
      await window.__TAURI__.core.invoke('open_in_vscode', { path: action.folder });
    } else if (action.type === 'terminal') {
      await window.__TAURI__.core.invoke('open_in_terminal', { dir: action.folder, terminal: action.terminalId });
    }
  } catch (e) {
    console.error('[MTools] handleFolderAction:', e);
  }
  window.__TAURI__.window.getCurrentWindow().hide();
}

async function loadTerminalNames() {
  if (!window.__TAURI__) return;
  try {
    const terminals = await window.__TAURI__.core.invoke('scan_installed_terminals');
    terminalNameMap = {};
    for (const t of terminals) terminalNameMap[t.id] = t.name;
  } catch {}
}

// ========== 搜索 ==========

function onSearchInput(query) {
  if (!query.trim()) {
    prevResultIds = '';
    results = [];
    selectedIdx = 0;
    searchResults.innerHTML = '';
    resizeWindow(BAR_H, true);
    return;
  }

  const toolResults = searchTools(query).slice(0, MAX_TOOL_RESULTS);
  const appResults = searchApps(query, MAX_APP_RESULTS);
  const newResults = toolResults.concat(appResults);

  if (newResults.length === 0) {
    prevResultIds = '';
    results = [];
    selectedIdx = 0;
    searchResults.innerHTML = '<div style="padding:12px 16px;color:var(--text-secondary);font-size:13px;">无匹配结果</div>';
    resizeWindow(BAR_H + 40);
    return;
  }

  const currentIds = newResults.map(r => r.id).join(',');
  if (currentIds === prevResultIds) return;
  prevResultIds = currentIds;

  results = newResults;
  selectedIdx = 0;
  renderResults(false);
  const newHeight = BAR_H + results.length * ITEM_H;
  if (newHeight !== lastWindowHeight) resizeWindow(newHeight);
}

function renderResults(fromClipboard) {
  searchResults.innerHTML = results.map((t, i) => `
    <div class="result-item${i === selectedIdx ? ' selected' : ''}" data-id="${t.id}" data-idx="${i}"${t._isApp ? ` data-app-path="${t._appPath}"` : ''}>
      <span class="result-icon">${t.icon}</span>
      <div class="result-info">
        <div class="result-name">${t.name}</div>
        <div class="result-desc">${fromClipboard && t._clipboardDesc ? t._clipboardDesc : t.description}</div>
      </div>
    </div>
  `).join('');

  const appPaths = results.filter((r) => r._isApp).map((r) => r._appPath);
  if (appPaths.length > 0) {
    requestAnimationFrame(() => loadIconsForResultItems(appPaths));
  }
}

function updateSelection() {
  searchResults.querySelectorAll('.result-item').forEach(el => {
    el.classList.toggle('selected', parseInt(el.dataset.idx) === selectedIdx);
  });
  const sel = searchResults.querySelector('.result-item.selected');
  if (sel) sel.scrollIntoView({ block: 'nearest' });
}

// ========== Tab 系统 ==========

function openTool(id, options) {
  const existing = tabs.find(t => t.id === id);
  if (existing) {
    switchTab(id);
    if (options?.initialData && existing.tool.setData) {
      existing.tool.setData(options.initialData);
    }
    return;
  }

  const tool = getTool(id);
  if (!tool) return;

  while (tabs.length >= MAX_TABS) {
    closeTab(tabs[0].id);
  }

  const container = document.createElement('div');
  container.className = 'tool-container';
  container.dataset.tabId = id;
  toolContent.appendChild(container);
  tool.render(container);

  if (options?.initialData && tool.setData) {
    tool.setData(options.initialData);
  }

  tabs.push({ id, tool, container });
  switchTab(id);
}

function switchTab(id) {
  const tab = tabs.find(t => t.id === id);
  if (!tab) return;

  activeTabId = id;

  toolContent.querySelectorAll('.tool-container').forEach(el => {
    el.classList.toggle('active', el.dataset.tabId === id);
  });

  renderTabBar();
  renderToolbar(tab.tool);
  showToolView();

  requestAnimationFrame(() => {
    const input = tab.container.querySelector('input:not([type="color"]):not([readonly]), textarea');
    if (input) input.focus();
  });
}

function closeTab(id) {
  const idx = tabs.findIndex(t => t.id === id);
  if (idx === -1) return;

  const tab = tabs[idx];
  tab.container.remove();
  if (tab.tool.destroy) tab.tool.destroy();
  tabs.splice(idx, 1);

  if (activeTabId === id) {
    activeTabId = null;
    if (isPinned) setPinned(false);
    showSearchView();
  } else {
    renderTabBar();
  }
}

function renderTabBar() {
  tabItemsEl.innerHTML = tabs.map(t => {
    const active = t.id === activeTabId;
    return `
    <div class="tab-item${active ? ' active' : ''}" data-id="${t.id}"${!active ? ' style="display:none"' : ''}>
      <span class="tab-icon">${t.tool.icon}</span>
      <span class="tab-name">${t.tool.name}</span>
      <button class="tab-close" data-close="${t.id}">×</button>
    </div>`;
  }).join('');

  tabItemsEl.querySelectorAll('.tab-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.tab-close')) return;
      switchTab(el.dataset.id);
    });
  });

  tabItemsEl.querySelectorAll('.tab-close').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      closeTab(el.dataset.close);
    });
  });
}

function renderToolbar(tool) {
  toolToolbar.innerHTML = '';
  if (!tool.toolbar || tool.toolbar.length === 0) return;

  tool.toolbar.forEach(item => {
    if (item.type === 'separator') {
      const el = document.createElement('div');
      el.className = 'toolbar-separator';
      toolToolbar.appendChild(el);
    } else if (item.type === 'spacer') {
      const el = document.createElement('div');
      el.className = 'toolbar-spacer';
      toolToolbar.appendChild(el);
    } else if (item.type === 'input') {
      const el = document.createElement('input');
      el.className = 'toolbar-input';
      el.placeholder = item.placeholder || '';
      if (item.id) el.id = item.id;
      if (item.onInput) el.addEventListener('input', () => item.onInput(tool, el.value));
      toolToolbar.appendChild(el);
    } else {
      const el = document.createElement('button');
      el.className = 'toolbar-btn';
      el.innerHTML = `${item.icon || ''}<span>${item.label || ''}</span>`;
      el.addEventListener('click', () => item.action(tool));
      if (item.longPressTip) {
        let tipEl = null;
        let tipTimer = null;
        el.addEventListener('mousedown', () => {
          tipTimer = setTimeout(() => {
            tipEl = document.createElement('span');
            tipEl.className = 'toolbar-tip';
            tipEl.textContent = item.longPressTip;
            el.appendChild(tipEl);
          }, 500);
        });
        const clearTip = () => {
          clearTimeout(tipTimer);
          if (tipEl) { tipEl.remove(); tipEl = null; }
        };
        el.addEventListener('mouseup', clearTip);
        el.addEventListener('mouseleave', clearTip);
      }
      toolToolbar.appendChild(el);
    }
  });
}

// ========== 事件绑定 ==========

let isComposing = false;
let compositionJustEnded = false;
let searchTimer = null;

searchResults.addEventListener('click', (e) => {
  const el = e.target.closest('.result-item');
  if (!el) return;
  const idx = parseInt(el.dataset.idx);
  const item = results[idx];
  if (!item) return;
  if (item._folderAction) {
    handleFolderAction(item._folderAction);
    return;
  }
  if (item._isApp) {
    handleAppClick(item._appPath);
  } else {
    const fromClipboard = !!item._clipboardDesc;
    openTool(el.dataset.id, { initialData: fromClipboard ? clipboardText : null });
  }
});

searchInput.addEventListener('compositionstart', () => {
  isComposing = true;
});

searchInput.addEventListener('compositionend', () => {
  isComposing = false;
  compositionJustEnded = true;
  clearTimeout(searchTimer);
  onSearchInput(searchInput.value);
});

searchInput.addEventListener('input', () => {
  if (isComposing) return;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => onSearchInput(searchInput.value), SEARCH_DEBOUNCE);
});

document.addEventListener('keydown', e => {
  if (e.isComposing || isComposing) return;

  if (compositionJustEnded) {
    compositionJustEnded = false;
    if (e.key === 'Enter') return;
  }

  if (e.key === 'Backspace' && !e.target.closest('input, textarea')) {
    e.preventDefault();
    return;
  }

  if (e.key === 'Escape') {
    if (isPinned) {
      setPinned(false);
      if (window.__TAURI__) window.__TAURI__.window.getCurrentWindow().hide();
      return;
    }
    if (currentView === 'tool') {
      showSearchView();
    } else if (window.__TAURI__) {
      window.__TAURI__.window.getCurrentWindow().hide();
    }
    return;
  }

  if (currentView === 'search' && results.length > 0) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIdx = (selectedIdx + 1) % results.length;
      updateSelection();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIdx = (selectedIdx - 1 + results.length) % results.length;
      updateSelection();
    } else if (e.key === 'Enter') {
      const item = results[selectedIdx];
      if (item._folderAction) {
        handleFolderAction(item._folderAction);
        return;
      }
      if (item._isApp) {
        handleAppClick(item._appPath);
      } else {
        const isClipboard = !!item._clipboardDesc;
        openTool(item.id, { initialData: isClipboard ? clipboardText : null });
      }
    }
  }
});

// ========== Tauri 事件 ==========

if (window.__TAURI__) {
  const { listen } = window.__TAURI__.event;
  const { getCurrentWindow } = window.__TAURI__.window;

  listen('window-shown', () => {
    loadApps();
    if (lastActiveToolId) {
      const tab = tabs.find(t => t.id === lastActiveToolId);
      if (tab) {
        switchTab(lastActiveToolId);
        return;
      }
    }
    showSearchView();
  });

  listen('window-toggle', async () => {
    if (currentView === 'tool') {
      lastActiveToolId = activeTabId;
    } else {
      lastActiveToolId = null;
    }
    await getCurrentWindow().hide();
  });

  listen('open-tool-direct', (event) => {
    const toolId = event.payload;
    if (toolId) {
      openTool(toolId);
    }
  });

  // 拖动窗口：点击任意非交互区域即可拖动
  document.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const el = e.target;
    if (el.closest('input, textarea, button, select, .result-item, .tab-close, .toolbar-btn, .color-wheel-lg, .color-swatch, .color-preview-lg, .color-tab, .toggle-switch, #pin-btn')) return;
    getCurrentWindow().startDragging();
  });

  // 失去焦点时自动隐藏窗口（文件选择器等对话框期间跳过）
  window.addEventListener('blur', () => {
    if (window._skipBlur) return;
    if (isPinned) return;
    if (currentView === 'tool') lastActiveToolId = activeTabId;
    getCurrentWindow().hide();
  });

  // 置顶按钮
  const pinBtn = document.getElementById('pin-btn');
  pinBtn.addEventListener('click', () => setPinned(!isPinned));
}

// Expose for cross-tool navigation (e.g. open a tool from settings)
window.mtoolsOpenTool = openTool;

// 初始化
searchInput.focus();
resizeWindow(BAR_H, true);
loadApps();
loadTerminalNames();
