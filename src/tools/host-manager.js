const STORAGE_KEY = 'mtools:host-manager:state';
const SAVE_DEBOUNCE = 300;
const PUBLIC_ID = 'public';
const GRIP_SVG = '<svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor"><circle cx="2.5" cy="2" r="1"/><circle cx="2.5" cy="6" r="1"/><circle cx="2.5" cy="10" r="1"/><circle cx="7.5" cy="2" r="1"/><circle cx="7.5" cy="6" r="1"/><circle cx="7.5" cy="10" r="1"/></svg>';

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Seed data shown on first launch (empty localStorage).
function defaultGroups() {
  return [
    {
      id: PUBLIC_ID,
      name: '公共配置',
      builtin: true,
      enabled: true,
      content:
        '# 公共配置（始终生效）\n' +
        '127.0.0.1\tlocalhost\n' +
        '255.255.255.255\tbroadcasthost\n' +
        '::1\tlocalhost\n',
    },
    {
      id: genId(),
      name: '开发环境',
      builtin: false,
      enabled: true,
      content:
        '# 开发环境\n' +
        '127.0.0.1\tapi.local.dev\n' +
        '127.0.0.1\tdev.internal.example.com\n' +
        '192.168.1.10\tmock-server.local\n',
    },
    {
      id: genId(),
      name: '测试环境',
      builtin: false,
      enabled: false,
      content:
        '# 测试环境\n' +
        '10.0.2.30\tapi.test.example.com\n' +
        '10.0.2.31\tdb.test.example.com\n',
    },
    {
      id: genId(),
      name: '生产环境',
      builtin: false,
      enabled: false,
      content:
        '# 生产环境（默认不启用，仅参考）\n' +
        '# 203.0.113.10\twww.example.com\n' +
        '# 203.0.113.11\tapi.example.com\n',
    },
  ];
}

export default {
  id: 'host-manager',
  name: 'hosts 管理',
  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><circle cx="7" cy="6" r="0.6" fill="currentColor"/><line x1="10" y1="6" x2="15" y2="6"/><line x1="6" y1="13" x2="9" y2="13"/><line x1="11" y1="13" x2="18" y2="13"/><line x1="6" y1="17" x2="9" y2="17"/><line x1="11" y1="17" x2="16" y2="17"/></svg>',
  description: '分组管理 hosts，一键应用到系统',
  keywords: ['hosts', 'host', 'hosts管理', '域名解析', 'dns', '系统hosts', 'etc hosts', 'hosts 文件', '修改hosts'],

  render(container) {
    container.innerHTML = `
      <div class="host-layout">
        <aside class="host-sidebar" id="host-sidebar"></aside>
        <section class="host-main" id="host-main"></section>
      </div>
      <div class="host-status" id="host-status"></div>
      <div class="host-overlay" id="host-overlay" style="display:none;">
        <div class="host-overlay-card">
          <div class="host-overlay-head">
            <span class="host-overlay-title">系统 /etc/hosts</span>
            <button class="host-overlay-close" id="host-overlay-close">关闭</button>
          </div>
          <pre class="host-overlay-pre" id="host-overlay-pre"></pre>
        </div>
      </div>
    `;

    this._container = container;
    this._sidebar = container.querySelector('#host-sidebar');
    this._main = container.querySelector('#host-main');
    this._status = container.querySelector('#host-status');
    this._overlay = container.querySelector('#host-overlay');
    this._overlayPre = container.querySelector('#host-overlay-pre');

    this._groups = [];
    this._activeId = null;
    this._saveTimer = null;
    this._statusTimer = null;
    this._textarea = null;
    this._highlight = null;
    this._gutter = null;

    this._loadState();
    this._renderSidebar();
    this._renderMain();

    container.querySelector('#host-overlay-close').addEventListener('click', () => this._closeOverlay());
    this._overlay.addEventListener('click', (e) => {
      if (e.target === this._overlay) this._closeOverlay();
    });

    setTimeout(() => this._textarea?.focus(), 30);
  },

  _getActive() {
    return this._groups.find((g) => g.id === this._activeId) || null;
  },

  _loadState() {
    let parsed = null;
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) parsed = JSON.parse(data);
    } catch {
      parsed = null;
    }

    if (!parsed || !Array.isArray(parsed.groups) || parsed.groups.length === 0) {
      this._groups = defaultGroups();
      this._activeId = PUBLIC_ID;
      this._saveState();
      return;
    }

    this._groups = parsed.groups;
    // Public-config health check: guarantee exactly one builtin group pinned at top.
    const hasPublic = this._groups.some((g) => g.builtin);
    if (!hasPublic) {
      this._groups = [
        { id: PUBLIC_ID, name: '公共配置', builtin: true, enabled: true, content: '' },
        ...this._groups,
      ];
    }
    this._activeId = parsed.activeId && this._groups.some((g) => g.id === parsed.activeId)
      ? parsed.activeId
      : PUBLIC_ID;
  },

  _saveState() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ groups: this._groups, activeId: this._activeId })
      );
    } catch {
      /* ignore quota / serialization errors */
    }
  },

  // Immediately flush the in-flight debounced content save (used before switching / destroying).
  _flushContent() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    const g = this._getActive();
    if (g && this._textarea) g.content = this._textarea.value;
  },

  _onContentChange() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      const g = this._getActive();
      if (g && this._textarea) g.content = this._textarea.value;
      this._saveState();
    }, SAVE_DEBOUNCE);
  },

  _setStatus(text, kind) {
    if (!this._status) return;
    if (this._statusTimer) {
      clearTimeout(this._statusTimer);
      this._statusTimer = null;
    }
    this._status.textContent = text;
    this._status.className = 'host-status' + (kind ? ' ' + kind : '');
    this._status.style.opacity = text ? '1' : '0';
    // Persistent kinds (info while applying) stay until replaced; others auto-clear.
    if (kind !== 'info' && text) {
      this._statusTimer = setTimeout(() => {
        if (this._status) {
          this._status.style.opacity = '0';
        }
      }, 2500);
    }
  },

  _renderSidebar() {
    const builtin = this._groups.filter((g) => g.builtin);
    const custom = this._groups.filter((g) => !g.builtin);

    const renderItem = (g) => {
      const active = g.id === this._activeId;
      return `
        <div class="host-group-item${active ? ' active' : ''}" data-id="${g.id}"${g.builtin ? '' : ' draggable="true"'}>
          <span class="host-dot${g.enabled ? ' enabled' : ''}"${g.builtin ? '' : ` data-toggle="${g.id}"`} title="${g.builtin ? '公共配置 · 始终启用' : (g.enabled ? '已启用 · 点击关闭' : '未启用 · 点击开启')}"></span>
          ${g.builtin ? '<span class="host-group-lock" title="公共配置，始终生效">🔒</span>' : ''}
          <span class="host-group-name" data-id="${g.id}" title="${g.builtin ? '公共配置不可改名' : '双击改名'}">${escapeHtml(g.name)}</span>
          ${g.builtin ? '' : `<span class="host-grip" title="拖动排序">${GRIP_SVG}</span>`}
          ${g.builtin ? '' : `<button class="host-group-del" data-id="${g.id}" title="删除">×</button>`}
        </div>
      `;
    };

    this._sidebar.innerHTML = `
      <div class="host-sidebar-section">公用</div>
      ${builtin.map(renderItem).join('')}
      <div class="host-sidebar-section">自定义</div>
      <div class="host-group-list">${custom.map(renderItem).join('')}</div>
      <button class="host-new-btn" id="host-new-btn">+ 新建分组</button>
    `;

    this._sidebar.querySelector('#host-new-btn').addEventListener('click', () => this._doNewGroup());

    this._sidebar.querySelectorAll('.host-group-item').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.host-group-del, .host-group-name-editing, .host-grip')) return;
        const dot = e.target.closest('[data-toggle]');
        if (dot) {
          this._toggleEnabled(dot.dataset.toggle);
          return;
        }
        this._switchGroup(el.dataset.id);
      });
    });

    this._sidebar.querySelectorAll('.host-group-name').forEach((el) => {
      if (el.dataset.id && this._groups.find((g) => g.id === el.dataset.id)?.builtin) return;
      el.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this._beginRename(el);
      });
    });

    this._sidebar.querySelectorAll('.host-group-del').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this._deleteGroup(el.dataset.id);
      });
    });

    this._bindDrag();
  },

  _renderMain() {
    const g = this._getActive();
    if (!g) {
      this._main.innerHTML = '';
      return;
    }

    const hint = g.builtin
      ? '公共配置 · 始终参与合并'
      : g.enabled
        ? '已启用 · 参与合并'
        : '未启用 · 不参与合并';

    this._main.innerHTML = `
      <div class="host-main-head">
        <span class="host-main-title">${escapeHtml(g.name)}</span>
        <span class="host-main-hint">${hint}</span>
      </div>
      <div class="host-editor">
        <div class="host-gutter" id="host-gutter"></div>
        <div class="host-editor-area">
          <pre class="host-highlight" id="host-highlight" aria-hidden="true"></pre>
          <textarea class="host-input" id="host-input" wrap="off"
            autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
            placeholder="# 输入 hosts，如 127.0.0.1  example.com"></textarea>
        </div>
      </div>
    `;

    this._textarea = this._main.querySelector('#host-input');
    this._highlight = this._main.querySelector('#host-highlight');
    this._gutter = this._main.querySelector('#host-gutter');
    this._textarea.value = g.content || '';
    this._bindEditor();
    this._syncEditor();
  },

  _highlightHosts(text) {
    const esc = escapeHtml(text);
    return esc
      .split('\n')
      .map((line) => (/^\s*#/.test(line) ? `<span class="host-comment">${line}</span>` : line))
      .join('\n');
  },

  _syncEditor() {
    const ta = this._textarea;
    const pre = this._highlight;
    const gutter = this._gutter;
    if (!ta || !pre || !gutter) return;
    const v = ta.value;
    pre.innerHTML = this._highlightHosts(v) + '\n';
    const count = v.split('\n').length;
    let g = '';
    for (let i = 1; i <= count; i++) g += i + '\n';
    gutter.textContent = g;
    pre.scrollTop = ta.scrollTop;
    pre.scrollLeft = ta.scrollLeft;
    gutter.scrollTop = ta.scrollTop;
  },

  _bindEditor() {
    const ta = this._textarea;
    ta.addEventListener('input', () => {
      this._syncEditor();
      this._onContentChange();
    });
    ta.addEventListener('scroll', () => {
      this._highlight.scrollTop = ta.scrollTop;
      this._highlight.scrollLeft = ta.scrollLeft;
      this._gutter.scrollTop = ta.scrollTop;
    });
    // Tab inserts two spaces (hosts editing convenience)
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const s = ta.selectionStart;
        const en = ta.selectionEnd;
        ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(en);
        ta.selectionStart = ta.selectionEnd = s + 2;
        this._syncEditor();
        this._onContentChange();
      }
    });
  },

  _switchGroup(id) {
    if (id === this._activeId) return;
    this._flushContent();
    this._activeId = id;
    this._renderSidebar();
    this._renderMain();
    this._saveState();
    setTimeout(() => this._textarea?.focus(), 20);
  },

  _doNewGroup() {
    const group = {
      id: genId(),
      name: `分组 ${this._groups.filter((g) => !g.builtin).length + 1}`,
      builtin: false,
      enabled: false,
      content: '',
    };
    this._groups = [...this._groups, group];
    this._activeId = group.id;
    this._renderSidebar();
    this._renderMain();
    this._saveState();
    setTimeout(() => this._textarea?.focus(), 20);
  },

  _deleteGroup(id) {
    const idx = this._groups.findIndex((g) => g.id === id);
    if (idx === -1) return;
    const target = this._groups[idx];
    if (target.builtin) return; // hard guard
    this._groups = [...this._groups.slice(0, idx), ...this._groups.slice(idx + 1)];
    if (this._activeId === id) {
      this._activeId = this._groups[0].id; // public config always remains at index 0
    }
    this._renderSidebar();
    this._renderMain();
    this._saveState();
  },

  _toggleEnabled(id) {
    const target = this._groups.find((g) => g.id === id);
    if (!target || target.builtin) return;
    const enabled = !target.enabled;
    this._groups = this._groups.map((g) => (g.id === id ? { ...g, enabled } : g));
    this._saveState();
    this._renderSidebar();
    if (id === this._activeId) {
      const hintEl = this._main.querySelector('.host-main-hint');
      if (hintEl) hintEl.textContent = enabled ? '已启用 · 参与合并' : '未启用 · 不参与合并';
    }
  },

  // Drag-and-drop reorder (custom groups only; public config stays pinned at top).
  _bindDrag() {
    this._dragId = null;
    this._sidebar.querySelectorAll('.host-group-item[draggable="true"]').forEach((el) => {
      el.addEventListener('dragstart', (e) => {
        this._dragId = el.dataset.id;
        el.classList.add('host-dragging');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', el.dataset.id); } catch { /* noop */ }
      });
      el.addEventListener('dragend', () => {
        el.classList.remove('host-dragging');
        this._clearDragHints();
        this._dragId = null;
      });
      el.addEventListener('dragover', (e) => {
        if (!this._dragId || this._dragId === el.dataset.id) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const rect = el.getBoundingClientRect();
        const before = e.clientY - rect.top < rect.height / 2;
        this._clearDragHints();
        el.classList.add(before ? 'host-drop-before' : 'host-drop-after');
      });
      el.addEventListener('dragleave', () => {
        el.classList.remove('host-drop-before', 'host-drop-after');
      });
      el.addEventListener('drop', (e) => {
        if (!this._dragId || this._dragId === el.dataset.id) return;
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const before = e.clientY - rect.top < rect.height / 2;
        this._reorderGroups(this._dragId, el.dataset.id, before);
        this._clearDragHints();
        this._dragId = null;
        this._renderSidebar();
        this._saveState();
      });
    });
  },

  _clearDragHints() {
    this._sidebar.querySelectorAll('.host-drop-before, .host-drop-after').forEach((el) => {
      el.classList.remove('host-drop-before', 'host-drop-after');
    });
  },

  _reorderGroups(draggedId, targetId, insertBefore) {
    const builtin = this._groups.filter((g) => g.builtin);
    const items = this._groups.filter((g) => !g.builtin);
    const draggedIdx = items.findIndex((g) => g.id === draggedId);
    if (draggedIdx === -1) return;
    const [dragged] = items.splice(draggedIdx, 1);
    let targetIdx = items.findIndex((g) => g.id === targetId);
    if (targetIdx === -1) {
      items.push(dragged);
    } else {
      if (!insertBefore) targetIdx += 1;
      items.splice(targetIdx, 0, dragged);
    }
    this._groups = [...builtin, ...items];
  },

  _beginRename(nameEl) {
    const id = nameEl.dataset.id;
    const g = this._groups.find((x) => x.id === id);
    if (!g || g.builtin) return;
    const old = g.name;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'host-group-name-editing';
    input.value = old;
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('spellcheck', 'false');
    nameEl.replaceWith(input);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    const commit = () => {
      const name = input.value.trim() || old;
      this._groups = this._groups.map((x) => (x.id === id ? { ...x, name } : x));
      this._saveState();
      this._renderSidebar();
      if (id === this._activeId) {
        const titleEl = this._main.querySelector('.host-main-title');
        if (titleEl) titleEl.textContent = name;
      }
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      } else if (e.key === 'Escape') {
        input.value = old;
        input.blur();
      }
    });
    input.addEventListener('blur', commit, { once: true });
    input.addEventListener('click', (e) => e.stopPropagation());
  },

  _mergeHosts() {
    const parts = [];
    const builtin = this._groups.find((g) => g.builtin);
    if (builtin) parts.push(builtin);
    this._groups
      .filter((g) => !g.builtin && g.enabled)
      .forEach((g) => parts.push(g));
    const body = parts
      .map((p) => `# ===== ${p.name} =====\n${(p.content || '').replace(/\s+$/, '')}`)
      .join('\n\n');
    return body + '\n';
  },

  async _doApply() {
    this._flushContent();
    if (!window.__TAURI__) {
      this._setStatus('应用不可用（非应用环境）', 'err');
      return;
    }
    this._setStatus('正在应用，请在系统弹窗输入密码…', 'info');
    try {
      await window.__TAURI__.core.invoke('apply_hosts', { content: this._mergeHosts() });
      this._setStatus('已应用到 /etc/hosts（浏览器 DNS 缓存需重启浏览器生效）', 'ok');
    } catch (err) {
      const msg = String(err);
      if (msg.includes('取消')) this._setStatus('已取消授权', 'muted');
      else this._setStatus('应用失败：' + msg, 'err');
    }
  },

  async _doCopyMerged() {
    this._flushContent();
    const text = this._mergeHosts();
    try {
      await navigator.clipboard.writeText(text);
      this._setStatus('已复制合并后的 hosts', 'ok');
    } catch {
      this._setStatus('复制失败', 'err');
    }
  },

  async _doViewSystem() {
    if (!window.__TAURI__) {
      this._setStatus('查看不可用（非应用环境）', 'err');
      return;
    }
    this._setStatus('读取系统 hosts…', 'info');
    try {
      const content = await window.__TAURI__.core.invoke('read_system_hosts');
      this._overlayPre.textContent = content;
      this._overlay.style.display = 'flex';
      this._setStatus('', '');
    } catch (err) {
      this._setStatus('读取失败：' + String(err), 'err');
    }
  },

  _closeOverlay() {
    if (this._overlay) this._overlay.style.display = 'none';
  },

  toolbar: [
    {
      icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
      label: '应用',
      action: (t) => t._doApply(),
    },
    {
      icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
      label: '复制',
      action: (t) => t._doCopyMerged(),
    },
    { type: 'separator' },
    {
      icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
      label: '查看系统',
      action: (t) => t._doViewSystem(),
    },
    { type: 'spacer' },
    {
      icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
      label: '新建分组',
      action: (t) => t._doNewGroup(),
    },
  ],

  destroy() {
    this._flushContent();
    if (this._saveTimer) clearTimeout(this._saveTimer);
    if (this._statusTimer) clearTimeout(this._statusTimer);
    this._dragId = null;
    this._container = null;
    this._sidebar = null;
    this._main = null;
    this._status = null;
    this._overlay = null;
    this._overlayPre = null;
    this._textarea = null;
    this._highlight = null;
    this._gutter = null;
    this._groups = [];
    this._activeId = null;
  },
};
