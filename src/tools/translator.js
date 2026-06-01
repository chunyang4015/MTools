function formatShortcutDisplay(str) {
  return str
    .replace('Alt', '⌥')
    .replace('Cmd', '⌘')
    .replace('Ctrl', '⌃')
    .replace('Shift', '⇧')
    .replace(/\+/g, ' ');
}

export default {
  id: 'translator',
  name: '翻译',
  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>',
  description: '中英互译',
  keywords: ['translate', '翻译', '翻译文本', '中英', '英中', 'text', '翻译器'],

  detectClipboardData(text) {
    const t = text.trim();
    if (/[一-鿿]{2,}/.test(t)) {
      const preview = t.slice(0, 10);
      return `「${preview}${t.length > 10 ? '...' : ''}」可以翻译`;
    }
    if (/[a-zA-Z]{3,}/.test(t) && t.length > 5) {
      const preview = t.slice(0, 15);
      return `「${preview}${t.length > 15 ? '...' : ''}」可以翻译为中文`;
    }
    return null;
  },

  setData(text) {
    const input = document.getElementById('translator-input');
    if (input && text) {
      input.value = text.trim();
      this._doTranslate();
    }
  },

  render(container) {
    this._llmConfig = null;
    this._isRecordingShortcut = false;
    this._directShortcut = '';
    this._boundOnKeyDown = this._onKeyDown.bind(this);

    container.innerHTML = `
      <div class="translator-wrap">
        <div class="translator-input-area">
          <textarea class="translator-input" id="translator-input" placeholder="输入文本，自动翻译" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></textarea>
        </div>
        <div class="translator-results" id="translator-results"></div>
      </div>
      <div class="tool-settings-overlay" id="translator-settings" style="display:none;">
        <div class="tool-settings-card"></div>
      </div>
    `;

    document.addEventListener('keydown', this._boundOnKeyDown, true);
    this._bindEvents();
    this._loadLlmConfig();
    this._loadDirectShortcut();
  },

  _bindEvents() {
    const input = document.getElementById('translator-input');
    let timer = null;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => this._doTranslate(), 600);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._doTranslate();
      }
    });
  },

  async _loadLlmConfig() {
    if (!window.__TAURI__) return;
    try {
      const settings = await window.__TAURI__.core.invoke('get_settings');
      this._llmConfig = settings.llm;
      this._hasModel = !!(settings.llm.model || settings.llm.localModelPath);
    } catch { }
  },

  async _loadDirectShortcut() {
    if (!window.__TAURI__) return;
    try {
      const settings = await window.__TAURI__.core.invoke('get_settings');
      this._directShortcut = settings.toolShortcuts?.translator || '';
    } catch { }
  },

  async _doTranslate() {
    const input = document.getElementById('translator-input');
    const resultsEl = document.getElementById('translator-results');
    const text = input?.value?.trim();
    if (!text) {
      resultsEl.innerHTML = '';
      return;
    }

    if (!this._llmConfig || !this._hasModel) {
      await this._loadLlmConfig();
    }

    if (!this._llmConfig || !this._hasModel) {
      resultsEl.innerHTML = `
        <div class="translator-no-model">
          <span>请先在设置中配置 AI 模型</span>
          <button class="btn-sm" onclick="document.querySelector('.tab-close')?.click()">前往设置</button>
        </div>
      `;
      return;
    }

    resultsEl.innerHTML = '<div class="translator-loading">翻译中...</div>';

    try {
      const result = await window.__TAURI__.core.invoke('translate_text', { text });
      const translation = result.translation || '';
      if (!translation) {
        resultsEl.innerHTML = '<div class="translator-empty">未获得翻译结果</div>';
        return;
      }

      const escaped = translation
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');

      resultsEl.innerHTML = `
        <div class="translator-text-result">
          <div class="translator-text-content">${escaped}</div>
          <button class="translator-copy-btn translator-text-copy" data-value="">复制</button>
        </div>
      `;

      const copyBtn = resultsEl.querySelector('.translator-text-copy');
      if (copyBtn) {
        copyBtn.dataset.value = translation;
        copyBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            await navigator.clipboard.writeText(translation);
            copyBtn.textContent = '已复制';
            copyBtn.classList.add('copied');
            setTimeout(() => {
              copyBtn.textContent = '复制';
              copyBtn.classList.remove('copied');
            }, 1500);
          } catch { }
        });
      }
    } catch (err) {
      resultsEl.innerHTML = `<div class="translator-error">${err}</div>`;
    }
  },

  toggleSettings() {
    const el = document.getElementById('translator-settings');
    if (!el) return;
    const visible = el.style.display !== 'none';
    if (visible) {
      el.style.display = 'none';
      return;
    }
    el.style.display = 'flex';
    this._renderSettings(el.querySelector('.tool-settings-card'));
  },

  _renderSettings(card) {
    card.innerHTML = `
      <div class="translator-settings-section">
        <div class="translator-settings-title">直达快捷键</div>
        <div class="translator-settings-row">
          <span class="translator-settings-desc">按下快捷键直接打开翻译工具</span>
          <input class="shortcut-input" id="translator-shortcut-input" readonly
            placeholder="点击录入快捷键" value="${this._directShortcut ? formatShortcutDisplay(this._directShortcut) : ''}">
        </div>
      </div>
    `;

    const overlay = document.getElementById('translator-settings');
    overlay.onclick = (e) => {
      if (e.target === overlay) this.toggleSettings();
    };

    const shortcutInput = document.getElementById('translator-shortcut-input');
    shortcutInput.addEventListener('focus', () => {
      this._isRecordingShortcut = true;
      shortcutInput.value = '';
      shortcutInput.placeholder = '按下快捷键组合...';
      shortcutInput.classList.add('recording');
    });
    shortcutInput.addEventListener('blur', () => {
      if (this._isRecordingShortcut) this._stopRecording();
    });
  },

  _onKeyDown(e) {
    if (!this._isRecordingShortcut) return;
    e.preventDefault();
    e.stopImmediatePropagation();

    const input = document.getElementById('translator-shortcut-input');
    if (!input) return;

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

    const code = e.code;
    let keyName;
    if (code === 'Space') keyName = 'Space';
    else if (code === 'Backquote') keyName = 'Backquote';
    else if (code.startsWith('Key')) keyName = code.slice(3);
    else if (code.startsWith('Digit')) keyName = code.slice(5);
    else if (/^F\d{1,2}$/.test(code)) keyName = code;
    else return;

    const parts = [];
    if (e.altKey) parts.push('Alt');
    if (e.metaKey) parts.push('Cmd');
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.shiftKey) parts.push('Shift');
    parts.push(keyName);
    const shortcut = parts.join('+');

    this._isRecordingShortcut = false;
    input.value = formatShortcutDisplay(shortcut);
    input.classList.remove('recording');
    input.placeholder = '点击录入快捷键';

    if (!window.__TAURI__) return;

    if (this._directShortcut) {
      window.__TAURI__.core.invoke('unregister_tool_shortcut', { toolId: 'translator' }).catch(() => { });
    }

    window.__TAURI__.core.invoke('register_tool_shortcut', {
      toolId: 'translator',
      shortcut,
    }).then(() => {
      this._directShortcut = shortcut;
      input.blur();
    }).catch((err) => {
      input.value = err || '注册失败';
      input.classList.add('error');
      input.classList.remove('recording');
      setTimeout(() => {
        input.value = this._directShortcut ? formatShortcutDisplay(this._directShortcut) : '';
        input.classList.remove('error');
        input.blur();
      }, 1500);
    });
  },

  _stopRecording() {
    this._isRecordingShortcut = false;
    const input = document.getElementById('translator-shortcut-input');
    if (input) {
      input.value = this._directShortcut ? formatShortcutDisplay(this._directShortcut) : '';
      input.classList.remove('recording');
      input.placeholder = '点击录入快捷键';
    }
  },

  toolbar: [
    {
      icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>',
      label: '翻译',
      action(tool) {
        tool._doTranslate();
      },
    },
    {
      icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M3 12h12"/><path d="M3 18h12"/><path d="M3 6h12"/></svg>',
      label: '清空',
      action(tool) {
        const input = document.getElementById('translator-input');
        const results = document.getElementById('translator-results');
        if (input) input.value = '';
        if (results) results.innerHTML = '';
      },
    },
    { type: 'spacer' },
    {
      icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
      label: '设置',
      action(tool) {
        tool.toggleSettings();
      },
    },
  ],

  destroy() {
    if (this._boundOnKeyDown) {
      document.removeEventListener('keydown', this._boundOnKeyDown, true);
    }
  },
};
