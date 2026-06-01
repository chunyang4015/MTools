export default {
  id: 'hash',
  name: 'Hash',
  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>',
  description: '计算 SHA-1 / SHA-256 / SHA-512',
  keywords: ['hash', 'md5', 'sha', '哈希', '摘要'],

  render(container) {
    container.innerHTML = `
      <div class="tool-header">
        <h2>Hash 计算</h2>
      </div>
      <div class="tool-body">
        <textarea class="tool-input" id="hash-input" placeholder="输入文本..."  style="min-height: 180px" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></textarea>
        <div class="tool-actions">
          <button class="btn" id="hash-calc">计算</button>
        </div>
        <div class="hash-results" id="hash-results"></div>
      </div>
    `;

    async function computeHash(text, algorithm) {
      const data = new TextEncoder().encode(text);
      const buf = await crypto.subtle.digest(algorithm, data);
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }

    document.getElementById('hash-calc').addEventListener('click', async () => {
      const input = document.getElementById('hash-input').value;
      const results = document.getElementById('hash-results');
      const algos = [
        { name: 'SHA-1', algo: 'SHA-1' },
        { name: 'SHA-256', algo: 'SHA-256' },
        { name: 'SHA-512', algo: 'SHA-512' },
      ];

      const entries = await Promise.all(
        algos.map(async ({ name, algo }) => ({ name, hash: await computeHash(input, algo) }))
      );

      results.innerHTML = entries
        .map(
          ({ name, hash }) => `
          <div class="hash-item">
            <label>${name}</label>
            <code>${hash}</code>
            <button class="btn-sm" data-hash="${hash}">复制</button>
          </div>
        `
        )
        .join('');

      results.querySelectorAll('.btn-sm').forEach((btn) => {
        btn.addEventListener('click', () => {
          navigator.clipboard.writeText(btn.dataset.hash);
          btn.textContent = '已复制';
          setTimeout(() => (btn.textContent = '复制'), 1000);
        });
      });
    });
  },

  destroy() {},
};
