export default {
  id: 'timestamp',
  name: '时间戳转换',
  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
  description: '时间戳与日期互转',
  keywords: ['timestamp', 'time', '时间戳', '时间', '日期'],

  detectClipboardData(text) {
    const t = text.trim();
    if (!/^\d{10,13}$/.test(t)) return null;
    const num = parseInt(t, 10);
    const ts = t.length === 13 ? num : num * 1000;
    const d = new Date(ts);
    if (d.getFullYear() >= 2000 && d.getFullYear() <= 2100) {
      return `检测到时间戳 → ${d.toLocaleString('zh-CN')}`;
    }
    return null;
  },

  setData(text) {
    const input = this._container?.querySelector('#ts-input');
    const btn = this._container?.querySelector('#ts-to-date');
    if (!input || !btn) return;
    input.value = text.trim();
    setTimeout(() => btn.click(), 0);
  },

  render(container) {
    const now = Math.floor(Date.now() / 1000);

    container.innerHTML = `
      <div class="tool-header">
        <h2>时间戳转换</h2>
      </div>
      <div class="tool-body">
        <div class="current-ts">
          当前时间戳: <span id="ts-current">${now}</span>
        </div>
        <div class="tool-row">
          <input type="text" class="tool-input-inline" id="ts-input" placeholder="输入时间戳 (秒)" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
          <button class="btn" id="ts-to-date">转为日期</button>
        </div>
        <div class="tool-output" id="ts-output"></div>
        <hr class="tool-divider">
        <div class="tool-row">
          <input type="text" class="tool-input-inline" id="date-input" placeholder="输入日期 (2024-01-01 12:00:00)" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
          <button class="btn" id="date-to-ts">转为时间戳</button>
        </div>
        <div class="tool-output" id="date-output"></div>
      </div>
    `;

    const tsTimer = setInterval(() => {
      const el = document.getElementById('ts-current');
      if (el) el.textContent = Math.floor(Date.now() / 1000);
    }, 1000);

    this._timer = tsTimer;
    this._container = container;

    document.getElementById('ts-to-date').addEventListener('click', () => {
      const val = document.getElementById('ts-input').value.trim();
      const output = document.getElementById('ts-output');
      if (!val) return;
      let ts = parseInt(val, 10);
      if (isNaN(ts)) { output.textContent = '无效的时间戳'; return; }
      if (ts > 1e12) ts = Math.floor(ts);
      else ts = ts * 1000;
      const d = new Date(ts);
      output.innerHTML = `
        <div>本地: ${d.toLocaleString('zh-CN')}</div>
        <div>UTC: ${d.toUTCString()}</div>
        <div>ISO: ${d.toISOString()}</div>
      `;
    });

    document.getElementById('date-to-ts').addEventListener('click', () => {
      const val = document.getElementById('date-input').value.trim();
      const output = document.getElementById('date-output');
      if (!val) return;
      const d = new Date(val);
      if (isNaN(d.getTime())) { output.textContent = '无效的日期格式'; return; }
      output.innerHTML = `
        <div>秒: ${Math.floor(d.getTime() / 1000)}</div>
        <div>毫秒: ${d.getTime()}</div>
      `;
    });
  },

  destroy() {
    if (this._timer) clearInterval(this._timer);
  },
};
