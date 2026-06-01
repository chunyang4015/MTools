const STORAGE_KEY = 'mtools:calc-pad:pads';

function nowTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatNum(n) {
  if (Number.isInteger(n)) return String(n);
  return String(parseFloat(n.toPrecision(12)));
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

export default {
  id: 'calc-pad',
  name: '计算稿',
  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="10" y2="10"/><line x1="14" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="10" y2="14"/><line x1="14" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="10" y2="18"/><line x1="14" y1="18" x2="16" y2="18"/></svg>',
  description: '快速计算稿纸，支持连续运算',
  keywords: ['calc', 'calculator', '计算', '稿纸', '运算', '加减乘除'],

  render(container) {
    container.innerHTML = `
      <div class="calc-pad">
        <div class="calc-pad-scroll" id="calc-pad-scroll"></div>
        <div class="calc-sidebar" id="calc-sidebar"></div>
      </div>
    `;

    this._container = container;
    this._scroll = container.querySelector('#calc-pad-scroll');
    this._sidebar = container.querySelector('#calc-sidebar');
    this._inputEl = null;
    this._eqEl = null;

    this._pads = [];
    this._activePadId = null;

    this._onGlobalKeydown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'r') {
        e.preventDefault();
        this._doClear();
      }
    };
    document.addEventListener('keydown', this._onGlobalKeydown);

    this._loadState();
    if (this._pads.length === 0) {
      this._createPad();
    }
    this._activePadId = this._pads[this._pads.length - 1].id;
    this._renderSidebar();
    this._renderAll();

    setTimeout(() => this._focusInput(), 50);
  },

  _getPad() {
    return this._pads.find(p => p.id === this._activePadId);
  },

  _getRows() {
    const pad = this._getPad();
    return pad ? pad.rows : [];
  },

  _getLastResult() {
    const rows = this._getRows();
    return rows.length > 0 ? rows[rows.length - 1].result : null;
  },

  _createPad() {
    const pad = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: `稿纸 ${this._pads.length + 1}`,
      rows: [],
      createdAt: nowTimestamp(),
    };
    this._pads = [...this._pads, pad];
    return pad;
  },

  _switchPad(padId) {
    if (padId === this._activePadId) return;
    this._activePadId = padId;
    this._renderAll();
    this._renderSidebar();
    this._saveState();
    setTimeout(() => this._focusInput(), 20);
  },

  _doNewPad() {
    const pad = this._createPad();
    this._activePadId = pad.id;
    this._renderAll();
    this._renderSidebar();
    this._saveState();
    setTimeout(() => this._focusInput(), 20);
  },

  _deletePad(padId) {
    if (this._pads.length <= 1) return;
    const idx = this._pads.findIndex(p => p.id === padId);
    if (idx === -1) return;
    this._pads = [...this._pads.slice(0, idx), ...this._pads.slice(idx + 1)];
    if (this._activePadId === padId) {
      const nextIdx = Math.min(idx, this._pads.length - 1);
      this._activePadId = this._pads[nextIdx].id;
    }
    this._renderAll();
    this._renderSidebar();
    this._saveState();
  },

  _focusInput() {
    const input = this._scroll.querySelector('.calc-input-inline');
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  },

  _onInput() {
    const input = this._inputEl;
    const eq = this._eqEl;
    if (!input || !eq) return;

    const expr = input.value.trim();
    if (!expr) {
      eq.textContent = '';
      return;
    }
    const result = this._evaluate(expr);
    if (result !== null) {
      eq.textContent = `= ${formatNum(result)}`;
    } else {
      eq.textContent = '';
    }
  },

  _onKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      this._commitRow();
    }
  },

  _commitRow() {
    const input = this._inputEl;
    if (!input) return;

    const expr = input.value.trim();
    if (!expr) return;

    const result = this._evaluate(expr);
    if (result === null) return;

    const activePad = this._getPad();
    if (!activePad) return;

    const row = {
      expr,
      result,
      timestamp: nowTimestamp(),
    };
    activePad.rows = [...activePad.rows, row];
    this._renderAll();
    this._saveState();
    this._renderSidebar();

    setTimeout(() => this._focusInput(), 20);
  },

  _evaluate(expr) {
    const sanitized = expr.replace(/\s/g, '');
    if (!sanitized) return null;

    if (!/^[0-9+\-*/.()]+$/.test(sanitized)) return null;

    try {
      const fn = new Function(`"use strict"; return (${sanitized});`);
      const result = fn();
      if (typeof result !== 'number' || !isFinite(result)) return null;
      return result;
    } catch {
      return null;
    }
  },

  _renderAll() {
    const rows = this._getRows();
    const last = this._getLastResult();
    const prefilled = last !== null ? formatNum(last) : '';

    this._scroll.innerHTML = `
      ${rows.map((row, i) => `
        <div class="calc-row" data-idx="${i}">
          <div class="calc-row-left">
            <span class="calc-expr">${escapeHtml(row.expr)}</span>
            <span class="calc-result">= ${formatNum(row.result)}</span>
          </div>
          <span class="calc-row-time">${row.timestamp}</span>
        </div>
      `).join('')}
      <div class="calc-row calc-row-input">
        <div class="calc-row-left">
          <input type="text" class="calc-input-inline" id="calc-input-inline"
            value="${escapeHtml(prefilled)}"
            placeholder="输入表达式" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off">
          <span class="calc-pad-eq" id="calc-pad-eq"></span>
        </div>
      </div>
    `;

    this._inputEl = this._scroll.querySelector('#calc-input-inline');
    this._eqEl = this._scroll.querySelector('#calc-pad-eq');

    if (this._inputEl) {
      this._inputEl.addEventListener('input', () => this._onInput());
      this._inputEl.addEventListener('keydown', (e) => this._onKeydown(e));
    }

    this._scroll.querySelectorAll('.calc-row[data-idx]').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.idx);
        const row = this._getRows()[idx];
        if (row) {
          navigator.clipboard.writeText(String(row.result)).catch(() => {});
        }
      });
    });

    this._scrollToBottom();
  },

  _renderSidebar() {
    this._sidebar.innerHTML = `
      <button class="calc-new-btn" id="calc-new-btn">+ 新稿纸</button>
      <div class="calc-pad-list">
        ${this._pads.map(p => `
          <div class="calc-pad-item${p.id === this._activePadId ? ' active' : ''}" data-pad-id="${p.id}">
            <span class="calc-pad-item-name">${escapeHtml(p.name)}</span>
            ${this._pads.length > 1 ? `<button class="calc-pad-del" data-del-id="${p.id}">×</button>` : ''}
          </div>
        `).join('')}
      </div>
    `;

    this._sidebar.querySelector('#calc-new-btn').addEventListener('click', () => this._doNewPad());

    this._sidebar.querySelectorAll('.calc-pad-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.calc-pad-del')) return;
        this._switchPad(el.dataset.padId);
      });
    });

    this._sidebar.querySelectorAll('.calc-pad-del').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this._deletePad(el.dataset.delId);
      });
    });
  },

  _scrollToBottom() {
    requestAnimationFrame(() => {
      this._scroll.scrollTop = this._scroll.scrollHeight;
    });
  },

  _doCopyAll() {
    const rows = this._getRows();
    const text = rows.map(r => `${r.expr} = ${formatNum(r.result)}`).join('\n');
    if (!text) return;
    navigator.clipboard.writeText(text).catch(() => {});
  },

  _doClear() {
    const pad = this._getPad();
    if (!pad) return;
    pad.rows = [];
    this._renderAll();
    this._saveState();
    this._renderSidebar();
    setTimeout(() => this._focusInput(), 20);
  },

  _saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        pads: this._pads,
        activePadId: this._activePadId,
      }));
    } catch {}
  },

  _loadState() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        this._pads = parsed.pads || [];
        this._activePadId = parsed.activePadId || null;
      }
    } catch {
      this._pads = [];
    }
  },

  toolbar: [
    { icon: '⎘', label: '复制全部', action: (t) => t._doCopyAll() },
    { type: 'separator' },
    {
      icon: '🗑',
      label: '清空',
      action: (t) => t._doClear(),
      longPressTip: '⌘R',
    },
  ],

  destroy() {
    if (this._onGlobalKeydown) {
      document.removeEventListener('keydown', this._onGlobalKeydown);
    }
    this._container = null;
    this._scroll = null;
    this._sidebar = null;
    this._inputEl = null;
    this._eqEl = null;
    this._pads = [];
    this._activePadId = null;
  },
};
