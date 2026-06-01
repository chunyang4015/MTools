export default {
  id: 'url-encode',
  name: 'URL 编解码',
  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  description: 'URL 编码和解码',
  keywords: ['url', 'encode', 'decode', 'uri', '编码', '解码'],

  detectClipboardData(text) {
    if (text.includes('%') && /%[0-9A-Fa-f]{2}/.test(text)) {
      return '检测到 URL 编码数据，点击解码';
    }
    return null;
  },

  setData(text) {
    const input = this._container?.querySelector('#url-input');
    const decBtn = this._container?.querySelector('#url-dec-mode');
    const convertBtn = this._container?.querySelector('#url-convert');
    if (!input || !decBtn || !convertBtn) return;
    input.value = text;
    decBtn.click();
    setTimeout(() => convertBtn.click(), 0);
  },

  render(container) {
    container.classList.add('convert-layout');
    container.innerHTML = `
      <div class="tool-header">
        <h2>URL 编解码</h2>
        <div class="mode-toggle">
          <button class="btn btn-active" id="url-enc-mode">编码</button>
          <button class="btn" id="url-dec-mode">解码</button>
        </div>
      </div>
      <div class="tool-body">
        <textarea class="tool-input" id="url-input" placeholder="输入 URL 或文本..." autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></textarea>
        <div class="tool-actions">
          <button class="btn" id="url-convert">转换</button>
          <button class="btn btn-secondary" id="url-copy">复制结果</button>
        </div>
        <div class="tool-output" id="url-output"></div>
        <div class="tool-error" id="url-error"></div>
      </div>
    `;

    this._container = container;
    let mode = 'encode';

    document.getElementById('url-enc-mode').addEventListener('click', () => {
      mode = 'encode';
      document.getElementById('url-enc-mode').classList.add('btn-active');
      document.getElementById('url-dec-mode').classList.remove('btn-active');
      const input = document.getElementById('url-input');
      input.focus();
      input.select();
    });

    document.getElementById('url-dec-mode').addEventListener('click', () => {
      mode = 'decode';
      document.getElementById('url-dec-mode').classList.add('btn-active');
      document.getElementById('url-enc-mode').classList.remove('btn-active');
      const input = document.getElementById('url-input');
      input.focus();
      input.select();
    });

    document.getElementById('url-convert').addEventListener('click', () => {
      const input = document.getElementById('url-input').value;
      const output = document.getElementById('url-output');
      const error = document.getElementById('url-error');
      error.textContent = '';
      try {
        output.textContent = mode === 'encode'
          ? encodeURIComponent(input)
          : decodeURIComponent(input);
      } catch (e) {
        error.textContent = '转换失败: ' + e.message;
        output.textContent = '';
      }
    });

    document.getElementById('url-copy').addEventListener('click', () => {
      const output = document.getElementById('url-output');
      if (output.textContent) navigator.clipboard.writeText(output.textContent);
    });
  },

  destroy() {
    this._container?.classList.remove('convert-layout');
  },
};
