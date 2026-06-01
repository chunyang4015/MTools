export default {
  id: 'uuid',
  name: 'UUID 生成器',
  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"/><path d="M14 13.12c0 2.38 0 6.38-1 8.88"/><path d="M17.29 21.02c.12-.6.43-2.3.5-3.02"/><path d="M2 12a10 10 0 0 1 18-6"/><path d="M2 16h.01"/><path d="M21.8 16c.2-2 .131-5.354 0-6"/><path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2"/><path d="M8.65 22c.21-.66.45-1.32.57-2"/><path d="M9 6.8a6 6 0 0 1 9 5.2v2"/></svg>',
  description: '生成 UUID v4',
  keywords: ['uuid', 'guid', '唯一', 'id'],

  render(container) {
    container.innerHTML = `
      <div class="tool-header">
        <h2>UUID 生成器</h2>
      </div>
      <div class="tool-body">
        <div class="tool-row">
          <label>数量: </label>
          <input type="number" class="tool-input-inline" id="uuid-count" value="1" min="1" max="100" style="width:80px">
          <button class="btn" id="uuid-gen">生成</button>
          <button class="btn btn-secondary" id="uuid-copy">复制全部</button>
        </div>
        <div class="uuid-format-bar">
          <div class="mode-toggle" id="uuid-case-toggle">
            <button class="btn btn-active" data-value="lower">小写</button>
            <button class="btn" data-value="upper">大写</button>
          </div>
          <div class="mode-toggle" id="uuid-dash-toggle">
            <button class="btn btn-active" data-value="dash">带-</button>
            <button class="btn" data-value="nodash">无-</button>
          </div>
        </div>
        <div class="tool-output tool-output-list" id="uuid-output"></div>
      </div>
    `;

    let upperCase = false;
    let noDash = false;
    let rawUuids = [];

    function formatUuid(uuid) {
      let result = noDash ? uuid.replace(/-/g, '') : uuid;
      return upperCase ? result.toUpperCase() : result;
    }

    function renderOutput() {
      const output = document.getElementById('uuid-output');
      output.innerHTML = rawUuids
        .map(
          (u) =>
            `<div class="uuid-item"><code>${formatUuid(u)}</code><button class="btn-sm" data-raw="${u}">复制</button></div>`
        )
        .join('');

      output.querySelectorAll('.btn-sm').forEach((btn) => {
        btn.addEventListener('click', () => {
          const text = formatUuid(btn.dataset.raw);
          navigator.clipboard.writeText(text);
          btn.textContent = '已复制';
          setTimeout(() => (btn.textContent = '复制'), 1000);
        });
      });
    }

    function generateUUID() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
    }

    // Toggle handlers
    document.getElementById('uuid-case-toggle').addEventListener('click', (e) => {
      const btn = e.target.closest('.btn');
      if (!btn) return;
      upperCase = btn.dataset.value === 'upper';
      btn.closest('.mode-toggle').querySelectorAll('.btn').forEach((b) => b.classList.remove('btn-active'));
      btn.classList.add('btn-active');
      if (rawUuids.length) renderOutput();
    });

    document.getElementById('uuid-dash-toggle').addEventListener('click', (e) => {
      const btn = e.target.closest('.btn');
      if (!btn) return;
      noDash = btn.dataset.value === 'nodash';
      btn.closest('.mode-toggle').querySelectorAll('.btn').forEach((b) => b.classList.remove('btn-active'));
      btn.classList.add('btn-active');
      if (rawUuids.length) renderOutput();
    });

    // Generate
    document.getElementById('uuid-gen').addEventListener('click', () => {
      const count = Math.min(100, Math.max(1, parseInt(document.getElementById('uuid-count').value) || 1));
      rawUuids = Array.from({ length: count }, generateUUID);
      renderOutput();
    });

    // Copy all
    document.getElementById('uuid-copy').addEventListener('click', () => {
      if (rawUuids.length) {
        navigator.clipboard.writeText(rawUuids.map(formatUuid).join('\n'));
      }
    });

    document.getElementById('uuid-gen').click();
  },

  destroy() {},
};
