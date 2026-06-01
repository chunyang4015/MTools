const ALL_FORMATS = [
  { id: 'camelCase', label: 'camelCase', example: 'userName' },
  { id: 'PascalCase', label: 'PascalCase', example: 'UserName' },
  { id: 'snake_case', label: 'snake_case', example: 'user_name' },
  { id: 'UPPER_SNAKE_CASE', label: 'UPPER_SNAKE', example: 'USER_NAME' },
  { id: 'kebab-case', label: 'kebab-case', example: 'user-name' },
];

function getFormats() {
  try {
    const saved = JSON.parse(localStorage.getItem('mtools:naming:formats'));
    if (Array.isArray(saved) && saved.length > 0) return saved;
  } catch { }
  return ALL_FORMATS.map(f => f.id);
}

function saveFormats(formats) {
  localStorage.setItem('mtools:naming:formats', JSON.stringify(formats));
}

function toNamingFormats(english) {
  const words = english
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean)
    .map(w => w.toLowerCase());

  if (words.length === 0) return {};

  const camel = words[0] + words.slice(1).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  const pascal = words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  const snake = words.join('_');
  const upper = words.join('_').toUpperCase();
  const kebab = words.join('-');

  return {
    camelCase: camel,
    PascalCase: pascal,
    snake_case: snake,
    UPPER_SNAKE_CASE: upper,
    kebab_case: kebab,
  };
}

function containsChinese(text) {
  return /[一-鿿]{1,}/.test(text);
}

export default {
  id: 'naming',
  name: '变量命名',
  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
  description: '中文转英文变量命名',
  keywords: ['variable', '变量', 'camel', '驼峰', 'naming', '命名', 'snake', 'kebab', '变量名'],

  detectClipboardData(text) {
    const t = text.trim();
    if (/[一-鿿]{2,}/.test(t) && t.length < 15 && !/[。？！；\n]/.test(t)) {
      const preview = t.slice(0, 10);
      return `「${preview}${t.length > 10 ? '...' : ''}」可以翻译为变量命名`;
    }
    return null;
  },

  setData(text) {
    const input = document.getElementById('naming-input');
    if (input && text) {
      input.value = text.trim();
      this._doNaming();
    }
  },

  render(container) {
    this._formats = getFormats();
    this._llmConfig = null;

    container.innerHTML = `
      <div class="naming-wrap">
        <div class="naming-input-area">
          <textarea class="naming-input" id="naming-input" placeholder="输入中文，自动生成变量命名" rows="2" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></textarea>
        </div>
        <div class="naming-results" id="naming-results"></div>
      </div>
      <div class="tool-settings-overlay" id="naming-settings" style="display:none;">
        <div class="tool-settings-card"></div>
      </div>
    `;

    this._bindEvents();
    this._loadLlmConfig();
  },

  _bindEvents() {
    const input = document.getElementById('naming-input');
    let timer = null;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => this._doNaming(), 600);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._doNaming();
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

  async _doNaming() {
    const input = document.getElementById('naming-input');
    const resultsEl = document.getElementById('naming-results');
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
      const result = await window.__TAURI__.core.invoke('translate_to_naming', { text });
      const suggestions = result.suggestions || [];
      if (suggestions.length === 0) {
        resultsEl.innerHTML = '<div class="translator-empty">未获得翻译结果</div>';
        return;
      }

      const formats = getFormats();
      let html = '';
      suggestions.forEach((suggestion, idx) => {
        const namings = toNamingFormats(suggestion);
        if (suggestions.length > 1) {
          html += `<div class="translator-suggestion-label">建议 ${idx + 1}：${suggestion}</div>`;
        }
        html += '<div class="translator-format-list">';
        for (const fmt of ALL_FORMATS) {
          if (!formats.includes(fmt.id)) continue;
          const value = namings[fmt.id] || '';
          if (!value) continue;
          html += `
            <div class="translator-format-row" data-value="${value}">
              <span class="translator-format-label">${fmt.label}</span>
              <code class="translator-format-value">${value}</code>
              <button class="translator-copy-btn" data-value="${value}">复制</button>
            </div>
          `;
        }
        html += '</div>';
      });

      resultsEl.innerHTML = html;
      this._bindCopyButtons(resultsEl);
    } catch (err) {
      resultsEl.innerHTML = `<div class="translator-error">${err}</div>`;
    }
  },

  _bindCopyButtons(container) {
    container.querySelectorAll('.translator-copy-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const value = btn.dataset.value;
        try {
          await navigator.clipboard.writeText(value);
          btn.textContent = '已复制';
          btn.classList.add('copied');
          setTimeout(() => {
            btn.textContent = '复制';
            btn.classList.remove('copied');
          }, 1500);
        } catch { }
      });
    });

    container.querySelectorAll('.translator-format-row').forEach(row => {
      row.addEventListener('click', async () => {
        const value = row.dataset.value;
        try {
          await navigator.clipboard.writeText(value);
          const btn = row.querySelector('.translator-copy-btn');
          if (btn) {
            btn.textContent = '已复制';
            btn.classList.add('copied');
            setTimeout(() => {
              btn.textContent = '复制';
              btn.classList.remove('copied');
            }, 1500);
          }
        } catch { }
      });
    });
  },

  toggleSettings() {
    const el = document.getElementById('naming-settings');
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
    const formats = getFormats();
    const formatCheckboxes = ALL_FORMATS.map(f => `
      <label class="translator-checkbox">
        <input type="checkbox" value="${f.id}" ${formats.includes(f.id) ? 'checked' : ''}>
        <span>${f.label}</span>
        <code class="translator-checkbox-example">${f.example}</code>
      </label>
    `).join('');

    card.innerHTML = `
      <div class="translator-settings-section">
        <div class="translator-settings-title">命名格式</div>
        <div class="translator-format-checks">
          ${formatCheckboxes}
        </div>
      </div>
    `;

    const overlay = document.getElementById('naming-settings');
    overlay.onclick = (e) => {
      if (e.target === overlay) this.toggleSettings();
    };

    card.querySelectorAll('.translator-checkbox input').forEach(cb => {
      cb.addEventListener('change', () => {
        const checked = [...card.querySelectorAll('.translator-checkbox input:checked')].map(c => c.value);
        saveFormats(checked);
        this._formats = checked;
      });
    });
  },

  toolbar: [
    {
      icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
      label: '翻译',
      action(tool) {
        tool._doNaming();
      },
    },
    {
      icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M3 12h12"/><path d="M3 18h12"/><path d="M3 6h12"/></svg>',
      label: '清空',
      action(tool) {
        const input = document.getElementById('naming-input');
        const results = document.getElementById('naming-results');
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

  destroy() {},
};
