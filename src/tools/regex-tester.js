export default {
  id: 'regex-tester',
  name: '正则测试',
  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.828 14.828 21 21"/><path d="M21 16v5h-5"/><path d="m21 3-9 9-4-4-6 6"/><path d="M21 8V3h-5"/></svg>',
  description: '正则表达式实时测试',
  keywords: ['regex', 'regexp', 'regular', '正则', '表达式'],

  render(container) {
    container.innerHTML = `
      <div class="tool-header">
        <h2>正则表达式测试</h2>
      </div>
      <div class="tool-body">
        <div class="tool-row regex-row">
          <span class="regex-slash">/</span>
          <input type="text" class="tool-input-inline regex-input" id="regex-pattern" placeholder="正则表达式" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
          <span class="regex-slash">/</span>
          <input type="text" class="tool-input-inline flags-input" id="regex-flags" placeholder="gi" value="g" style="width:60px" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
        </div>
        <textarea class="tool-input" id="regex-text" placeholder="测试文本..." rows="5"  style="min-height: 180px" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></textarea>
        <div class="tool-actions">
          <button class="btn" id="regex-test">测试</button>
          <span id="regex-match-count" class="match-count"></span>
        </div>
        <div class="tool-output regex-output" id="regex-output"></div>
        <div class="tool-error" id="regex-error"></div>
      </div>
    `;

    document.getElementById('regex-test').addEventListener('click', () => {
      const pattern = document.getElementById('regex-pattern').value;
      const flags = document.getElementById('regex-flags').value;
      const text = document.getElementById('regex-text').value;
      const output = document.getElementById('regex-output');
      const error = document.getElementById('regex-error');
      const countEl = document.getElementById('regex-match-count');
      error.textContent = '';
      countEl.textContent = '';

      try {
        const regex = new RegExp(pattern, flags);
        const matches = [...text.matchAll(regex)];
        countEl.textContent = `${matches.length} 个匹配`;

        if (matches.length === 0) {
          output.innerHTML = '<div class="no-match">无匹配结果</div>';
          return;
        }

        let html = '';
        let lastIdx = 0;
        const sorted = matches.sort((a, b) => a.index - b.index);
        for (const m of sorted) {
          html += escapeHtml(text.slice(lastIdx, m.index));
          html += `<mark>${escapeHtml(m[0])}</mark>`;
          lastIdx = m.index + m[0].length;
        }
        html += escapeHtml(text.slice(lastIdx));
        output.innerHTML = `<pre class="regex-highlight">${html}</pre>`;
        output.innerHTML += `<div class="match-groups">${matches
          .map(
            (m, i) =>
              `<div>匹配 ${i + 1}: <code>${escapeHtml(m[0])}</code> (index: ${m.index})</div>`
          )
          .join('')}</div>`;
      } catch (e) {
        error.textContent = '正则错误: ' + e.message;
        output.innerHTML = '';
      }
    });
  },

  destroy() {},
};

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
