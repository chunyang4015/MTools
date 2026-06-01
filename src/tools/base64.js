export default {
  id: 'base64',
  name: 'Base64 编解码',
  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/></svg>',
  description: 'Base64 编码和解码',
  keywords: ['base64', 'encode', 'decode', '编码', '解码'],

  detectClipboardData(text) {
    const t = text.trim();
    if (t.length < 4) return null;
    if (!/^[A-Za-z0-9+/]+=*$/.test(t)) return null;
    try {
      const decoded = atob(t);
      if (decoded.length > 0 && /[\x20-\x7E]/.test(decoded)) {
        return '检测到 Base64 数据，点击解码';
      }
    } catch {}
    return null;
  },

  render(container) {
    container.classList.add('convert-layout');
    container.innerHTML = `
      <div class="tool-header">
        <h2>Base64 编解码</h2>
        <div class="mode-toggle">
          <button class="btn btn-active" id="b64-enc-mode">编码</button>
          <button class="btn" id="b64-dec-mode">解码</button>
        </div>
      </div>
      <div class="tool-body">
        <textarea class="tool-input" id="b64-input" placeholder="输入文本..." autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></textarea>
        <div class="tool-actions">
          <button class="btn" id="b64-convert">转换</button>
          <button class="btn btn-secondary" id="b64-copy">复制结果</button>
        </div>
        <div class="tool-output" id="b64-output"></div>
        <div class="tool-error" id="b64-error"></div>
      </div>
    `;

    let mode = 'encode';

    const input = document.getElementById('b64-input');

    document.getElementById('b64-enc-mode').addEventListener('click', () => {
      mode = 'encode';
      document.getElementById('b64-enc-mode').classList.add('btn-active');
      document.getElementById('b64-dec-mode').classList.remove('btn-active');
      input.focus();
    });

    document.getElementById('b64-dec-mode').addEventListener('click', () => {
      mode = 'decode';
      document.getElementById('b64-dec-mode').classList.add('btn-active');
      document.getElementById('b64-enc-mode').classList.remove('btn-active');
      input.focus();
    });

    document.getElementById('b64-convert').addEventListener('click', () => {
      const input = document.getElementById('b64-input').value;
      const output = document.getElementById('b64-output');
      const error = document.getElementById('b64-error');
      error.textContent = '';
      try {
        output.textContent = mode === 'encode'
          ? btoa(unescape(encodeURIComponent(input)))
          : decodeURIComponent(escape(atob(input)));
      } catch (e) {
        error.textContent = '转换失败: ' + e.message;
        output.textContent = '';
      }
    });

    document.getElementById('b64-copy').addEventListener('click', () => {
      const output = document.getElementById('b64-output');
      if (output.textContent) {
        navigator.clipboard.writeText(output.textContent);
      }
    });

    this._container = container;
  },

  setData(text) {
    const input = this._container?.querySelector('#b64-input');
    const decBtn = this._container?.querySelector('#b64-dec-mode');
    const convertBtn = this._container?.querySelector('#b64-convert');
    if (!input || !decBtn || !convertBtn) return;
    input.value = text;
    decBtn.click();
    setTimeout(() => convertBtn.click(), 0);
  },

  destroy() {
    this._container?.classList.remove('convert-layout');
  },
};
