export default {
  id: 'json-formatter',
  name: 'JSON 格式化',
  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/><path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/></svg>',
  description: 'JSON 格式化、压缩、校验',
  keywords: ['json', 'format', '格式化', '校验'],

  detectClipboardData(text) {
    const t = text.trim();
    if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
      try { JSON.parse(t); return '检测到 JSON 数据，点击格式化'; } catch {}
    }
    return null;
  },

  render(container) {
    container.innerHTML = `
      <div class="json-editor-wrap">
        <textarea class="json-editor" id="json-editor" spellcheck="false"
          placeholder='粘贴或输入 JSON，例如: {"name":"mtools"}'></textarea>
        <div class="json-status" id="json-status"></div>
      </div>
    `;

    this._editor = container.querySelector('#json-editor');
    this._status = container.querySelector('#json-status');
    this._parsed = null;
    this._mode = 'format';
    this._filtering = false;

    this._editor.addEventListener('paste', () => {
      setTimeout(() => this._autoFormat(), 0);
    });

    this._editor.addEventListener('input', () => {
      if (this._filtering) return;
      this._validate();
    });

    setTimeout(() => this._editor.focus(), 50);
  },

  setData(text) {
    if (!text || !this._editor) return;
    this._editor.value = text;
    this._autoFormat();
    setTimeout(() => this._editor.focus(), 50);
  },

  _autoFormat() {
    const raw = this._editor.value.trim();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      this._parsed = parsed;
      this._mode = 'format';
      this._editor.value = JSON.stringify(parsed, null, 2);
      this._showStatus('ok', `JSON 有效 · ${this._describe(parsed)}`);
    } catch {
      this._validate();
    }
  },

  _validate() {
    const raw = this._editor.value.trim();
    if (!raw) {
      this._parsed = null;
      this._showStatus('', '');
      return;
    }
    try {
      this._parsed = JSON.parse(raw);
      this._showStatus('ok', `JSON 有效 · ${this._describe(this._parsed)}`);
    } catch (e) {
      this._parsed = null;
      this._showStatus('err', e.message);
    }
  },

  _describe(value) {
    if (Array.isArray(value)) return `Array[${value.length}]`;
    if (value && typeof value === 'object') return `Object{${Object.keys(value).length}}`;
    return typeof value;
  },

  _showStatus(type, msg) {
    if (!msg) {
      this._status.textContent = '';
      this._status.className = 'json-status';
      return;
    }
    this._status.textContent = msg;
    this._status.className = `json-status json-status-${type}`;
  },

  _doFormat() {
    const raw = this._editor.value.trim();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      this._parsed = parsed;
      this._mode = 'format';
      this._editor.value = JSON.stringify(parsed, null, 2);
      this._showStatus('ok', `已格式化 · ${this._describe(parsed)}`);
    } catch (e) {
      this._showStatus('err', e.message);
    }
  },

  _doMinify() {
    const raw = this._editor.value.trim();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      this._parsed = parsed;
      this._mode = 'minify';
      this._editor.value = JSON.stringify(parsed);
      this._showStatus('ok', `已压缩 · ${this._describe(parsed)}`);
    } catch (e) {
      this._showStatus('err', e.message);
    }
  },

  _doCopy() {
    const text = this._editor.value;
    if (!text.trim()) return;
    navigator.clipboard.writeText(text).then(() => {
      this._showStatus('ok', '已复制到剪贴板');
      setTimeout(() => this._validate(), 1500);
    });
  },

  _doClear() {
    this._editor.value = '';
    this._parsed = null;
    this._showStatus('', '');
    this._editor.focus();
  },

  _doFilter(query) {
    this._filtering = true;
    if (!query.trim()) {
      if (this._parsed !== null) {
        this._editor.value = JSON.stringify(this._parsed, null, 2);
      }
      this._validate();
      this._filtering = false;
      return;
    }
    if (this._parsed === null) {
      this._filtering = false;
      return;
    }

    const filtered = this._filterByPath(this._parsed, query.trim());
    this._editor.value = JSON.stringify(filtered, null, 2);
    this._showStatus('ok', `过滤: "${query}"`);
    this._filtering = false;
  },

  _filterByPath(obj, path) {
    const keys = path.split('.');
    let current = obj;
    for (const key of keys) {
      if (current === null || current === undefined) return null;
      if (Array.isArray(current)) {
        const idx = parseInt(key, 10);
        current = isNaN(idx) ? current.map(item => item?.[key]) : current[idx];
      } else if (typeof current === 'object') {
        current = current[key];
      } else {
        return null;
      }
    }
    return current;
  },

  toolbar: [
    { icon: '⊞', label: '格式化', action: (t) => t._doFormat() },
    { icon: '⊟', label: '压缩', action: (t) => t._doMinify() },
    { type: 'separator' },
    { icon: '⎘', label: '复制', action: (t) => t._doCopy() },
    { icon: '✕', label: '清空', action: (t) => t._doClear() },
    { type: 'separator' },
    {
      type: 'input',
      id: 'json-filter-input',
      placeholder: '键路径过滤，如: data.list',
      onInput: (t, value) => t._doFilter(value),
    },
  ],

  destroy() {
    this._editor = null;
    this._status = null;
    this._parsed = null;
  },
};
