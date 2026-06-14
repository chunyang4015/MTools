import { getAllTools } from '../lib/registry.js';

function formatShortcutDisplay(str) {
  return str
    .replace('Alt', '⌥')
    .replace('Cmd', '⌘')
    .replace('Ctrl', '⌃')
    .replace('Shift', '⇧')
    .replace(/\+/g, ' ');
}

function parseKeyEvent(e) {
  const parts = [];
  if (e.altKey) parts.push('Alt');
  if (e.metaKey) parts.push('Cmd');
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.shiftKey) parts.push('Shift');

  if (['Alt', 'Meta', 'Control', 'Shift'].includes(e.key)) return null;
  if (parts.length === 0) return null;

  const code = e.code;
  let keyName;
  if (code === 'Space') keyName = 'Space';
  else if (code === 'Backquote') keyName = 'Backquote';
  else if (code.startsWith('Key')) keyName = code.slice(3);
  else if (code.startsWith('Digit')) keyName = code.slice(5);
  else if (/^F\d{1,2}$/.test(code)) keyName = code;
  else return null;

  parts.push(keyName);
  return parts.join('+');
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

function escHtml(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

export default {
  id: 'settings',
  name: '设置',
  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
  description: '应用设置：快捷键、开机自启',
  keywords: ['settings', '设置', '快捷键', '自启动', 'shortcut', 'autostart', '偏好'],

  render(container) {
    container.innerHTML = `
      <div class="settings-panel">
        <div class="settings-sidebar">
          <div class="settings-sidebar-item active" data-tab="general">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
            <span>通用</span>
          </div>
          <div class="settings-sidebar-item" data-tab="ai">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9h.01"/><path d="M15 9h.01"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M9 19v2"/><path d="M15 19v2"/></svg>
            <span>AI 模型</span>
          </div>
          <div class="settings-sidebar-item" data-tab="tools">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
            <span>工具中心</span>
          </div>
        </div>

        <div class="settings-content">
          <!-- 通用设置 -->
          <div id="settings-tab-general">
            <div class="settings-section">
              <div class="settings-section-title">快捷键</div>
              <div class="settings-row">
                <span class="settings-label">显示/隐藏窗口</span>
                <input class="shortcut-input" id="settings-shortcut-input" readonly placeholder="点击录入快捷键">
              </div>
            </div>
            <div class="settings-section">
              <div class="settings-section-title">通用</div>
              <div class="settings-row">
                <span class="settings-label">开机自启动</span>
                <label class="toggle-switch">
                  <input type="checkbox" id="settings-autostart-toggle">
                  <span class="toggle-slider"></span>
                </label>
              </div>
              <div class="settings-row">
                <span class="settings-label">默认终端</span>
                <div class="settings-model-select-wrap">
                  <select class="settings-model-select" id="settings-terminal-select">
                    <option value="">加载中...</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <!-- AI 模型设置 -->
          <div id="settings-tab-ai" style="display:none;">
            <div class="settings-section">
              <div class="settings-section-title">运行时配置</div>
              <div class="settings-row">
                <span class="settings-label">运行时</span>
                <div class="settings-model-select-wrap">
                  <select class="settings-model-select" id="settings-llm-runtime">
                    <option value="auto">自动检测</option>
                    <option value="ollama">Ollama</option>
                    <option value="lmstudio">LM Studio</option>
                    <option value="embedded">内嵌引擎</option>
                  </select>
                </div>
              </div>
              <div id="settings-llm-external-section">
                <div class="settings-row">
                  <span class="settings-label">模型服务地址</span>
                  <input class="settings-text-input" id="settings-llm-url" placeholder="http://localhost:11434" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
                </div>
                <div class="settings-row">
                  <span class="settings-label">当前模型</span>
                  <div class="settings-model-select-wrap">
                    <select class="settings-model-select" id="settings-llm-model">
                      <option value="">加载中...</option>
                    </select>
                  </div>
                </div>
                <div class="settings-row settings-actions-row">
                  <button class="btn-sm" id="settings-llm-detect">自动检测</button>
                  <button class="btn-sm" id="settings-llm-test">测试连接</button>
                </div>
              </div>
              <div id="settings-llm-embedded-section" style="display:none;">
                <div class="settings-row">
                  <span class="settings-label">本地模型</span>
                  <div class="settings-model-path-row">
                    <input class="settings-text-input" id="settings-local-model-path" placeholder="选择或输入 GGUF 文件路径" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
                    <button class="btn-sm" id="settings-choose-model">选择</button>
                  </div>
                </div>
                <div class="settings-row" id="settings-local-model-status-row" style="display:none;">
                  <span class="settings-label"></span>
                  <span class="settings-llm-status" id="settings-local-model-status"></span>
                </div>
              </div>
              <div class="settings-row">
                <span class="settings-label">模型状态</span>
                <span class="settings-llm-status" id="settings-llm-status">未配置</span>
              </div>
            </div>

            <!-- 模型社区 / 下载管理 -->
            <div class="settings-section">
              <div class="settings-hub-tabs" style="margin-top:12px;">
                <button class="settings-hub-tab active" data-main-hub="community">模型社区</button>
                <button class="settings-hub-tab" data-main-hub="downloads">下载管理</button>
              </div>
              <div id="settings-main-hub-community">
                <div class="settings-hub-section">
                  <div class="settings-hub-tabs" >
                    <button class="settings-hub-tab active" data-source="huggingface">HuggingFace</button>
                    <button class="settings-hub-tab" data-source="modelscope">魔搭社区</button>
                  </div>
                  <input class="settings-hub-search" id="settings-hub-search" placeholder="搜索 GGUF 模型..." autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
                  <div class="settings-hub-list" id="settings-hub-list"></div>
                </div>
              </div>
              <div id="settings-main-hub-downloads" style="display:none;">
                <div id="settings-download-list"></div>
                <div class="settings-embedded-subsection">
                  <div class="settings-embedded-subtitle">已下载模型</div>
                  <div id="settings-downloaded-models"></div>
                </div>
              </div>
            </div>
          </div>

          <div id="settings-tab-tools" style="display:none;">
            <div class="settings-section">
              <div id="settings-tools-list"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    this._isRecording = false;
    this._currentShortcut = 'Alt+Space';
    this._boundOnKeyDown = this._onKeyDown.bind(this);
    this._hubSource = 'huggingface';
    this._hubQuery = '';
    this._hubPage = 1;
    this._hubHasMore = false;
    this._hubLoading = false;
    this._hubRequestId = 0;
    this._expandedModels = new Set();
    this._tauriUnlisteners = [];
    this._downloads = new Map();

    document.addEventListener('keydown', this._boundOnKeyDown, true);
    this._loadSettings();
    this._bindEvents();
    this._bindSidebarTabs();
    this._bindHubEvents();
    this._renderHubRecommendations();
    this._renderToolsList();
  },

  async _loadSettings() {
    if (!window.__TAURI__) return;
    try {
      const settings = await window.__TAURI__.core.invoke('get_settings');
      this._currentShortcut = settings.shortcut;
      document.getElementById('settings-shortcut-input').value = formatShortcutDisplay(settings.shortcut);
      document.getElementById('settings-autostart-toggle').checked = settings.autoStart;
      this._loadTerminals(settings.terminal);

      const llm = settings.llm;
      const runtimeSelect = document.getElementById('settings-llm-runtime');
      runtimeSelect.value = llm.runtime || 'auto';

      this._showRuntimeSection(llm.runtime || 'auto');

      if (llm.localModelPath) {
        document.getElementById('settings-local-model-path').value = llm.localModelPath;
      }

      this._updateStatus(llm);
      this._loadExternalModels(llm);
      this._loadDownloadedModels();
      this._loadPendingDownloads();
    } catch {
      document.getElementById('settings-shortcut-input').value = formatShortcutDisplay(this._currentShortcut);
    }
  },

  async _loadTerminals(selectedId) {
    const select = document.getElementById('settings-terminal-select');
    if (!select) return;
    if (!window.__TAURI__) {
      select.innerHTML = '<option value="">不可用</option>';
      return;
    }
    try {
      const terminals = await window.__TAURI__.core.invoke('scan_installed_terminals');
      let html = '<option value="">未选择</option>';
      for (const t of terminals) {
        html += `<option value="${escHtml(t.id)}">${escHtml(t.name)}</option>`;
      }
      if (selectedId && !terminals.some(t => t.id === selectedId)) {
        html += `<option value="${escHtml(selectedId)}" selected>${escHtml(selectedId)}</option>`;
      }
      select.innerHTML = html;
      select.value = selectedId || '';
    } catch {
      select.innerHTML = '<option value="">检测失败</option>';
    }
  },

  _showRuntimeSection(runtime) {
    const externalSection = document.getElementById('settings-llm-external-section');
    const embeddedSection = document.getElementById('settings-llm-embedded-section');
    const isEmbedded = runtime === 'embedded';
    externalSection.style.display = isEmbedded ? 'none' : '';
    embeddedSection.style.display = isEmbedded ? '' : 'none';
  },

  _updateStatus(llm) {
    const statusEl = document.getElementById('settings-llm-status');
    if (llm.runtime === 'embedded') {
      if (llm.localModelPath) {
        statusEl.textContent = '已配置本地模型';
        statusEl.className = 'settings-llm-status ok';
      } else {
        statusEl.textContent = '请配置本地模型';
        statusEl.className = 'settings-llm-status';
      }
    } else {
      if (llm.model) {
        statusEl.textContent = '已配置';
        statusEl.className = 'settings-llm-status ok';
      } else {
        statusEl.textContent = '未选择模型';
        statusEl.className = 'settings-llm-status';
      }
    }
  },

  async _loadExternalModels(llm) {
    const modelSelect = document.getElementById('settings-llm-model');
    const urlInput = document.getElementById('settings-llm-url');

    if (llm.apiUrl) urlInput.value = llm.apiUrl;

    if (llm.apiUrl && llm.runtime !== 'embedded') {
      try {
        const result = await window.__TAURI__.core.invoke('list_available_models', { apiUrl: llm.apiUrl });
        const models = result.models || [];
        modelSelect.innerHTML = models.length > 0
          ? models.map(m => `<option value="${escHtml(m)}" ${m === llm.model ? 'selected' : ''}>${escHtml(m)}</option>`).join('')
          : '<option value="">无可用模型</option>';
        if (llm.model && !models.includes(llm.model)) {
          modelSelect.innerHTML += `<option value="${escHtml(llm.model)}" selected>${escHtml(llm.model)}</option>`;
        }
      } catch {
        modelSelect.innerHTML = '<option value="">无法连接</option>';
        if (llm.model) {
          modelSelect.innerHTML += `<option value="${escHtml(llm.model)}" selected>${escHtml(llm.model)}</option>`;
        }
      }
    } else {
      modelSelect.innerHTML = '<option value="">请先配置地址</option>';
    }
  },

  async _loadDownloadedModels() {
    if (!window.__TAURI__) return;
    const container = document.getElementById('settings-downloaded-models');
    try {
      const result = await window.__TAURI__.core.invoke('list_downloaded_models');
      const models = result.models || [];
      if (models.length === 0) {
        container.innerHTML = '<div class="settings-empty-text">暂无已下载模型</div>';
        return;
      }
      container.innerHTML = models.map(m => `
        <div class="settings-model-item">
          <div class="settings-model-info">
            <span class="settings-model-name">${escHtml(m.name)}</span>
            <span class="settings-model-size">${formatFileSize(m.size)}</span>
          </div>
          <button class="btn-sm btn-danger" data-path="${escHtml(m.path)}">删除</button>
        </div>
      `).join('');

      container.querySelectorAll('.btn-danger').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('确定删除此模型？文件较大，删除后需重新下载。')) return;
          try {
            await window.__TAURI__.core.invoke('delete_model', { path: btn.dataset.path });
            this._loadDownloadedModels();
          } catch (err) {
            alert('删除失败: ' + err);
          }
        });
      });
    } catch {
      container.innerHTML = '<div class="settings-empty-text">加载失败</div>';
    }
  },

  async _loadPendingDownloads() {
    if (!window.__TAURI__) return;
    try {
      const result = await window.__TAURI__.core.invoke('list_pending_downloads');
      const downloads = result.downloads || [];
      for (const dl of downloads) {
        this._downloads.set(dl.name, {
          status: 'failed',
          progress: 0,
          downloaded: dl.downloaded,
          total: 0,
          speed: 0,
          error: '下载中断（上次未完成）',
          url: dl.url,
        });
      }
      this._renderDownloads();
    } catch {}
  },

  _renderDownloads() {
    const container = document.getElementById('settings-download-list');
    if (!container) return;

    if (this._downloads.size === 0) {
      container.innerHTML = '<div class="settings-empty-text">暂无下载任务</div>';
      return;
    }

    let html = '';
    for (const [name, dl] of this._downloads) {
      if (dl.status === 'downloading') {
        const sizeText = dl.total > 0
          ? `${formatFileSize(dl.downloaded)} / ${formatFileSize(dl.total)}`
          : formatFileSize(dl.downloaded);
        const speedText = dl.speed > 0 ? ` · ${formatFileSize(dl.speed)}/s` : '';
        html += `
          <div class="settings-download-item" data-name="${escHtml(name)}">
            <div class="settings-download-header">
              <span class="settings-download-name">${escHtml(name)}</span>
              <span class="settings-download-progress">${dl.progress}%</span>
            </div>
            <div class="settings-download-bar">
              <div class="settings-download-bar-fill" style="width:${dl.progress}%"></div>
            </div>
            <div class="settings-download-meta">
              <span>${sizeText}${speedText}</span>
              <button class="btn-sm btn-danger settings-dl-cancel">取消</button>
            </div>
          </div>`;
      } else {
        html += `
          <div class="settings-download-item failed" data-name="${escHtml(name)}">
            <div class="settings-download-header">
              <span class="settings-download-name">${escHtml(name)}</span>
              <span class="settings-download-status error">${dl.status === 'failed' ? '下载失败' : '已取消'}</span>
            </div>
            <div class="settings-download-meta">
              ${dl.error ? `<span class="settings-download-error">${escHtml(dl.error.slice(0, 80))}</span>` : '<span></span>'}
              <span class="settings-download-actions">
                ${dl.url ? '<button class="btn-sm btn-primary settings-dl-retry">重试</button>' : ''}
                <button class="btn-sm btn-danger settings-dl-delete">删除</button>
              </span>
            </div>
          </div>`;
      }
    }

    container.innerHTML = html;

    container.querySelectorAll('.settings-dl-cancel').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.closest('.settings-download-item').dataset.name;
        window.__TAURI__.core.invoke('cancel_download', { name });
      });
    });

    container.querySelectorAll('.settings-dl-retry').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.settings-download-item');
        const name = item.dataset.name;
        const dl = this._downloads.get(name);
        if (dl && dl.url) {
          this._downloads.delete(name);
          this._renderDownloads();
          this._downloadHubFile(dl.url, name, btn);
        }
      });
    });

    container.querySelectorAll('.settings-dl-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const name = btn.closest('.settings-download-item').dataset.name;
        this._downloads.delete(name);
        try {
          await window.__TAURI__.core.invoke('delete_pending_download', { name });
        } catch {}
        this._renderDownloads();
      });
    });
  },

  async _bindEvents() {
    const input = document.getElementById('settings-shortcut-input');

    input.addEventListener('focus', () => {
      this._isRecording = true;
      input.value = '';
      input.placeholder = '按下快捷键组合...';
      input.classList.add('recording');
    });

    input.addEventListener('blur', () => {
      if (this._isRecording) this._stopRecording();
    });

    const autostartToggle = document.getElementById('settings-autostart-toggle');
    autostartToggle.addEventListener('change', async (e) => {
      if (!window.__TAURI__) return;
      try {
        await window.__TAURI__.core.invoke('set_autostart_setting', { enabled: e.target.checked });
      } catch {
        e.target.checked = !e.target.checked;
      }
    });

    const terminalSelect = document.getElementById('settings-terminal-select');
    terminalSelect.addEventListener('change', () => {
      if (!window.__TAURI__) return;
      window.__TAURI__.core.invoke('set_terminal_setting', { id: terminalSelect.value });
    });

    // Runtime selector
    document.getElementById('settings-llm-runtime').addEventListener('change', (e) => {
      const runtime = e.target.value;
      this._showRuntimeSection(runtime);
      this._saveLlmConfig();
    });

    // External: URL change
    const llmUrlInput = document.getElementById('settings-llm-url');
    let urlTimer = null;
    llmUrlInput.addEventListener('input', () => {
      clearTimeout(urlTimer);
      urlTimer = setTimeout(async () => {
        await this._saveLlmConfig();
        await this._loadExternalModels({ apiUrl: llmUrlInput.value.trim(), runtime: 'external' });
      }, 800);
    });

    // External: Model select change
    document.getElementById('settings-llm-model').addEventListener('change', () => this._saveLlmConfig());

    // Auto detect
    document.getElementById('settings-llm-detect').addEventListener('click', () => this._autoDetect());

    // Test connection
    document.getElementById('settings-llm-test').addEventListener('click', () => this._testConnection());

    // Embedded: local model path input
    let pathTimer = null;
    document.getElementById('settings-local-model-path').addEventListener('input', (e) => {
      clearTimeout(pathTimer);
      pathTimer = setTimeout(() => this._validateAndSaveLocalModel(e.target.value.trim()), 500);
    });

    // Embedded: choose file button
    document.getElementById('settings-choose-model').addEventListener('click', () => this._pickModelFile());

    // Download events
    if (window.__TAURI__) {
      const unlistenStarted = await window.__TAURI__.event.listen('model-download-started', (event) => {
        const data = event.payload;
        this._downloads.set(data.name, {
          status: 'downloading',
          progress: 0,
          downloaded: data.existingSize || 0,
          total: 0,
          speed: 0,
          error: null,
          url: data.url || '',
        });
        this._renderDownloads();
        this._switchToDownloadsTab();
      });
      this._tauriUnlisteners.push(unlistenStarted);

      const unlistenProgress = await window.__TAURI__.event.listen('model-download-progress', (event) => {
        const data = event.payload;
        const existing = this._downloads.get(data.name) || {};
        this._downloads.set(data.name, {
          status: 'downloading',
          progress: data.progress,
          downloaded: data.downloaded,
          total: data.total,
          speed: data.speed || 0,
          error: null,
          url: existing.url || '',
        });
        this._renderDownloads();
        const btns = document.querySelectorAll(`.settings-hub-file-download[data-name="${data.name}"]`);
        btns.forEach(btn => { btn.textContent = `${data.progress}%`; });
      });
      this._tauriUnlisteners.push(unlistenProgress);

      const unlistenComplete = await window.__TAURI__.event.listen('model-download-complete', (event) => {
        const data = event.payload;
        this._downloads.delete(data.name);
        this._renderDownloads();
        const btns = document.querySelectorAll(`.settings-hub-file-download[data-name="${data.name}"]`);
        btns.forEach(btn => {
          btn.textContent = '已下载';
          btn.disabled = true;
          btn.classList.add('btn-success');
        });
        const pathInput = document.getElementById('settings-local-model-path');
        if (pathInput && !pathInput.value) {
          pathInput.value = data.path;
          this._saveLlmConfig();
        }
        this._loadDownloadedModels();
      });
      this._tauriUnlisteners.push(unlistenComplete);

      const unlistenFailed = await window.__TAURI__.event.listen('model-download-failed', (event) => {
        const data = event.payload;
        const existing = this._downloads.get(data.name) || {};
        this._downloads.set(data.name, {
          status: 'failed',
          progress: existing.progress || 0,
          downloaded: data.downloaded || existing.downloaded || 0,
          total: data.total || existing.total || 0,
          speed: 0,
          error: data.error || '下载失败',
          url: existing.url || '',
        });
        this._renderDownloads();
      });
      this._tauriUnlisteners.push(unlistenFailed);

      const unlistenCancelled = await window.__TAURI__.event.listen('model-download-cancelled', (event) => {
        const data = event.payload;
        const existing = this._downloads.get(data.name) || {};
        this._downloads.set(data.name, {
          status: 'cancelled',
          progress: existing.progress || 0,
          downloaded: existing.downloaded || 0,
          total: existing.total || 0,
          speed: 0,
          error: '已取消',
          url: existing.url || '',
        });
        this._renderDownloads();
      });
      this._tauriUnlisteners.push(unlistenCancelled);
    }
  },

  async _pickModelFile() {
    if (!window.__TAURI__) return;
    window._skipBlur = true;
    try {
      const selected = await window.__TAURI__.core.invoke('pick_gguf_file');
      if (selected) {
        const pathInput = document.getElementById('settings-local-model-path');
        pathInput.value = selected;
        this._validateAndSaveLocalModel(selected);
      }
    } catch {} finally {
      setTimeout(() => { window._skipBlur = false; }, 200);
    }
  },

  async _validateAndSaveLocalModel(path) {
    const statusRow = document.getElementById('settings-local-model-status-row');
    const statusEl = document.getElementById('settings-local-model-status');
    if (!path) {
      statusRow.style.display = 'none';
      this._saveLlmConfig();
      return;
    }
    statusRow.style.display = '';
    statusEl.textContent = '验证中...';
    statusEl.className = 'settings-llm-status';

    try {
      const result = await window.__TAURI__.core.invoke('validate_local_model', { path });
      if (result.valid) {
        statusEl.textContent = `✅ ${result.name} (${formatFileSize(result.size)})`;
        statusEl.className = 'settings-llm-status ok';
      } else {
        statusEl.textContent = `❌ ${result.error}`;
        statusEl.className = 'settings-llm-status error';
      }
    } catch {
      statusEl.textContent = '❌ 验证失败';
      statusEl.className = 'settings-llm-status error';
    }
    this._saveLlmConfig();
  },

  async _saveLlmConfig() {
    if (!window.__TAURI__) return;
    const runtime = document.getElementById('settings-llm-runtime').value;
    const apiUrl = document.getElementById('settings-llm-url').value.trim();
    const model = document.getElementById('settings-llm-model').value;
    const localModelPath = document.getElementById('settings-local-model-path').value.trim();

    try {
      await window.__TAURI__.core.invoke('set_llm_config', {
        runtime,
        apiUrl,
        model,
        localModelPath,
      });
      this._updateStatus({ runtime, model, localModelPath });
    } catch {}
  },

  async _autoDetect() {
    if (!window.__TAURI__) return;
    const statusEl = document.getElementById('settings-llm-status');
    const urlInput = document.getElementById('settings-llm-url');
    const modelSelect = document.getElementById('settings-llm-model');

    statusEl.textContent = '检测中...';
    statusEl.className = 'settings-llm-status';

    try {
      const result = await window.__TAURI__.core.invoke('detect_llm_runtimes');
      const runtimes = result.runtimes || [];

      let targetUrl = '';
      if (runtimes.length > 0) {
        const rt = runtimes[0];
        targetUrl = rt.apiUrl;
        urlInput.value = rt.apiUrl;
        statusEl.textContent = `已检测到 ${rt.name}`;
        statusEl.className = 'settings-llm-status ok';
      } else {
        targetUrl = urlInput.value.trim();
        if (!targetUrl) {
          statusEl.textContent = '未检测到运行时';
          statusEl.className = 'settings-llm-status error';
          return;
        }
      }

      const modelsResult = await window.__TAURI__.core.invoke('list_available_models', { apiUrl: targetUrl });
      const models = modelsResult.models || [];
      modelSelect.innerHTML = models.length > 0
        ? models.map(m => `<option value="${escHtml(m)}">${escHtml(m)}</option>`).join('')
        : '<option value="">无可用模型</option>';

      await this._saveLlmConfig();
    } catch {
      statusEl.textContent = '检测失败';
      statusEl.className = 'settings-llm-status error';
    }
  },

  async _testConnection() {
    if (!window.__TAURI__) return;
    const statusEl = document.getElementById('settings-llm-status');
    const apiUrl = document.getElementById('settings-llm-url').value.trim();
    const model = document.getElementById('settings-llm-model').value;

    if (!apiUrl || !model) {
      statusEl.textContent = '请先配置地址和模型';
      statusEl.className = 'settings-llm-status error';
      return;
    }

    statusEl.textContent = '测试中...';
    statusEl.className = 'settings-llm-status';

    try {
      const result = await window.__TAURI__.core.invoke('test_llm_connection', { apiUrl, model });
      if (result.success) {
        statusEl.textContent = '连接成功';
        statusEl.className = 'settings-llm-status ok';
      } else {
        statusEl.textContent = result.error || '连接失败';
        statusEl.className = 'settings-llm-status error';
      }
    } catch {
      statusEl.textContent = '测试失败';
      statusEl.className = 'settings-llm-status error';
    }
  },

  _onKeyDown(e) {
    if (!this._isRecording) return;
    e.preventDefault();
    e.stopImmediatePropagation();

    const input = document.getElementById('settings-shortcut-input');

    if (e.key === 'Escape') {
      input.blur();
      return;
    }

    const modSymbols = [];
    if (e.altKey) modSymbols.push('⌥');
    if (e.metaKey) modSymbols.push('⌘');
    if (e.ctrlKey) modSymbols.push('⌃');
    if (e.shiftKey) modSymbols.push('⇧');

    if (['Alt', 'Meta', 'Control', 'Shift'].includes(e.key)) {
      input.value = modSymbols.join(' ');
      return;
    }

    if (modSymbols.length === 0) return;

    const shortcut = parseKeyEvent(e);
    if (!shortcut) return;

    this._isRecording = false;
    input.value = formatShortcutDisplay(shortcut);
    input.classList.remove('recording');
    input.placeholder = '点击录入快捷键';

    if (!window.__TAURI__) return;

    window.__TAURI__.core.invoke('update_shortcut', { shortcut }).then(() => {
      this._currentShortcut = shortcut;
      input.blur();
    }).catch((err) => {
      input.value = err || '注册失败';
      input.classList.add('error');
      input.classList.remove('recording');
      setTimeout(() => {
        input.value = formatShortcutDisplay(this._currentShortcut);
        input.classList.remove('error');
        input.blur();
      }, 1500);
    });
  },

  _stopRecording() {
    this._isRecording = false;
    const input = document.getElementById('settings-shortcut-input');
    input.value = formatShortcutDisplay(this._currentShortcut);
    input.classList.remove('recording');
    input.placeholder = '点击录入快捷键';
  },

  _renderToolsList() {
    const container = document.getElementById('settings-tools-list');
    if (!container) return;

    const tools = getAllTools();
    container.innerHTML = tools.map(t => {
      const kwList = t.keywords.map(k => escHtml(k)).join('、');
      return `
        <div class="settings-tool-card" data-tool-id="${escHtml(t.id)}" role="button" tabindex="0">
          <div class="settings-tool-icon">${t.icon}</div>
          <div class="settings-tool-info">
            <div class="settings-tool-name">${escHtml(t.name)}</div>
            <div class="settings-tool-detail">
              <span class="settings-tool-detail-label">介绍：</span>${escHtml(t.description)}
            </div>
            <div class="settings-tool-detail">
              <span class="settings-tool-detail-label">匹配规则：</span>${kwList}
            </div>
          </div>
        </div>`;
    }).join('');

    container.querySelectorAll('.settings-tool-card').forEach(card => {
      const open = () => {
        const id = card.dataset.toolId;
        if (window.mtoolsOpenTool) window.mtoolsOpenTool(id);
      };
      card.addEventListener('click', open);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      });
    });
  },

  _bindSidebarTabs() {
    const items = document.querySelectorAll('.settings-sidebar-item');
    items.forEach(item => {
      item.addEventListener('click', () => {
        items.forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        const tab = item.dataset.tab;
        document.getElementById('settings-tab-general').style.display = tab === 'general' ? '' : 'none';
        document.getElementById('settings-tab-ai').style.display = tab === 'ai' ? '' : 'none';
        document.getElementById('settings-tab-tools').style.display = tab === 'tools' ? '' : 'none';
      });
    });
  },

  _bindHubEvents() {
    // Main hub tabs: 模型社区 / 下载管理
    document.querySelectorAll('[data-main-hub]').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('[data-main-hub]').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.dataset.mainHub;
        document.getElementById('settings-main-hub-community').style.display = target === 'community' ? '' : 'none';
        document.getElementById('settings-main-hub-downloads').style.display = target === 'downloads' ? '' : 'none';
        if (target === 'downloads') {
          this._loadDownloadedModels();
          this._renderDownloads();
        }
      });
    });

    // Source tabs: HuggingFace / 魔搭社区
    const searchInput = document.getElementById('settings-hub-search');
    let searchTimer = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        this._hubQuery = searchInput.value.trim();
        this._hubPage = 1;
        if (this._hubQuery) {
          this._searchHubModels();
        } else {
          this._renderHubRecommendations();
        }
      }, 500);
    });

    document.querySelectorAll('[data-source]').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('[data-source]').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this._hubSource = tab.dataset.source;
        this._hubPage = 1;
        this._expandedModels.clear();
        if (this._hubQuery) {
          this._searchHubModels();
        } else {
          this._renderHubRecommendations();
        }
      });
    });
  },

  async _searchHubModels() {
    if (!window.__TAURI__) return;
    this._hubRequestId++;
    const requestId = this._hubRequestId;
    const listEl = document.getElementById('settings-hub-list');

    if (this._hubPage === 1) {
      listEl.innerHTML = '<div class="settings-hub-loading">搜索中...</div>';
    }

    try {
      const result = await window.__TAURI__.core.invoke('search_models', {
        source: this._hubSource,
        query: this._hubQuery,
        page: this._hubPage,
      });

      if (requestId !== this._hubRequestId) return;

      this._hubHasMore = result.hasMore;
      const models = result.models || [];

      if (this._hubPage === 1) listEl.innerHTML = '';

      if (models.length === 0 && this._hubPage === 1) {
        listEl.innerHTML = '<div class="settings-hub-empty">未找到相关模型</div>';
        return;
      }

      models.forEach(m => listEl.insertAdjacentHTML('beforeend', this._renderHubCard(m)));

      if (this._hubHasMore) {
        const existingMore = listEl.querySelector('.settings-hub-more');
        if (existingMore) existingMore.remove();
        listEl.insertAdjacentHTML('beforeend', '<button class="settings-hub-more" id="settings-hub-more">加载更多</button>');
        document.getElementById('settings-hub-more').addEventListener('click', () => {
          this._hubPage++;
          this._searchHubModels();
        });
      }

      this._bindHubCardEvents(listEl);
    } catch {
      if (requestId !== this._hubRequestId) return;
      if (this._hubPage === 1) {
        listEl.innerHTML = '<div class="settings-hub-empty">搜索失败，请检查网络</div>';
      }
    }
  },

  _renderHubRecommendations() {
    const listEl = document.getElementById('settings-hub-list');
    const isModelscope = this._hubSource === 'modelscope';

    const recommendations = [
      { id: 'Qwen/Qwen2.5-3B-Instruct-GGUF', author: 'Qwen', downloads: isModelscope ? '-' : '42,391', likes: isModelscope ? '-' : '128' },
      { id: 'Qwen/Qwen2.5-1.5B-Instruct-GGUF', author: 'Qwen', downloads: isModelscope ? '-' : '28,653', likes: isModelscope ? '-' : '95' },
      { id: 'Qwen/Qwen2.5-7B-Instruct-GGUF', author: 'Qwen', downloads: isModelscope ? '-' : '15,872', likes: isModelscope ? '-' : '67' },
    ];

    listEl.innerHTML = recommendations.map(m => this._renderHubCard(m)).join('');
    this._bindHubCardEvents(listEl);
  },

  _renderHubCard(model) {
    const isExpanded = this._expandedModels.has(model.id);
    const name = escHtml(model.id.split('/').pop());
    const id = escHtml(model.id);
    return `
      <div class="settings-hub-card" data-model-id="${id}">
        <div class="settings-hub-card-header">
          <div>
            <div class="settings-hub-card-name">${name}</div>
            <div class="settings-hub-card-meta">${escHtml(model.author)} · ↓ ${escHtml(model.downloads)} · ❤ ${escHtml(model.likes)}</div>
          </div>
          <button class="settings-hub-card-toggle" data-model-id="${id}">
            ${isExpanded ? '收起 ▴' : '下载 ▾'}
          </button>
        </div>
        <div class="settings-hub-files" data-model-id="${id}" style="${isExpanded ? '' : 'display:none'}">
          <div class="settings-hub-loading">加载中...</div>
        </div>
      </div>
    `;
  },

  _bindHubCardEvents(listEl) {
    listEl.querySelectorAll('.settings-hub-card-toggle').forEach(btn => {
      btn.addEventListener('click', () => this._toggleHubModelFiles(btn.dataset.modelId));
    });
    listEl.querySelectorAll('.settings-hub-file-download').forEach(btn => {
      btn.addEventListener('click', () => this._downloadHubFile(btn.dataset.url, btn.dataset.name, btn));
    });
  },

  async _toggleHubModelFiles(modelId) {
    const filesEl = document.querySelector(`.settings-hub-files[data-model-id="${modelId}"]`);
    const toggleBtn = document.querySelector(`.settings-hub-card-toggle[data-model-id="${modelId}"]`);

    if (this._expandedModels.has(modelId)) {
      this._expandedModels.delete(modelId);
      filesEl.style.display = 'none';
      toggleBtn.textContent = '下载 ▾';
      return;
    }

    this._expandedModels.add(modelId);
    filesEl.style.display = '';
    toggleBtn.textContent = '收起 ▴';
    filesEl.innerHTML = '<div class="settings-hub-loading">加载中...</div>';

    try {
      const result = await window.__TAURI__.core.invoke('list_model_files', {
        source: this._hubSource,
        modelId: modelId,
      });
      const files = (result.files || []).filter(f => f.name.endsWith('.gguf'));

      if (files.length === 0) {
        filesEl.innerHTML = '<div class="settings-hub-empty">无 GGUF 文件</div>';
        return;
      }

      filesEl.innerHTML = files.map(f => `
        <div class="settings-hub-file">
          <span class="settings-hub-file-name">${escHtml(f.name)}</span>
          <span class="settings-hub-file-size">${formatFileSize(f.size)}</span>
          <button class="btn-sm btn-primary settings-hub-file-download" data-url="${escHtml(f.download_url)}" data-name="${escHtml(f.name)}">下载</button>
        </div>
      `).join('');

      filesEl.querySelectorAll('.settings-hub-file-download').forEach(btn => {
        btn.addEventListener('click', () => this._downloadHubFile(btn.dataset.url, btn.dataset.name, btn));
      });
    } catch {
      filesEl.innerHTML = '<div class="settings-hub-empty">加载失败</div>';
    }
  },

  async _downloadHubFile(url, name, btn) {
    if (!window.__TAURI__) return;
    btn.disabled = true;
    btn.textContent = '准备下载...';

    try {
      await window.__TAURI__.core.invoke('download_model', { name, url });
      btn.textContent = '已下载';
      btn.classList.add('btn-success');
      this._loadDownloadedModels();
    } catch (err) {
      const msg = String(err).slice(0, 60);
      btn.textContent = '失败: ' + msg;
      btn.disabled = false;
      console.error('[MTools] download_model failed:', err, 'url:', url);
    }
  },

  _switchToDownloadsTab() {
    document.querySelectorAll('[data-main-hub]').forEach(t => t.classList.remove('active'));
    const downloadsTab = document.querySelector('[data-main-hub="downloads"]');
    if (downloadsTab) downloadsTab.classList.add('active');
    document.getElementById('settings-main-hub-community').style.display = 'none';
    document.getElementById('settings-main-hub-downloads').style.display = '';
    this._loadDownloadedModels();
    this._renderDownloads();
  },

  destroy() {
    if (this._boundOnKeyDown) {
      document.removeEventListener('keydown', this._boundOnKeyDown, true);
    }
    if (this._tauriUnlisteners) {
      this._tauriUnlisteners.forEach(fn => fn());
      this._tauriUnlisteners = [];
    }
  },
};
