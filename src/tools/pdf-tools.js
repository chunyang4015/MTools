// PDF.js 动态加载
const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// PptxGenJS 动态加载
const PPTX_CDN = 'https://cdn.jsdelivr.net/gh/gitbrent/PptxGenJS@3.12.0/dist/pptxgen.bundle.js';

let _pdfjs = null;
let _pdfjsPromise = null;
let _pptxgen = null;
let _pptxgenPromise = null;

async function loadPdfJs() {
  if (_pdfjs) return _pdfjs;
  if (_pdfjsPromise) return _pdfjsPromise;
  _pdfjsPromise = new Promise((resolve, reject) => {
    if (window.pdfjsLib) {
      _pdfjs = window.pdfjsLib;
      _pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN;
      resolve(_pdfjs);
      return;
    }
    const s = document.createElement('script');
    s.src = PDFJS_CDN;
    s.onload = () => {
      _pdfjs = window.pdfjsLib;
      _pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN;
      resolve(_pdfjs);
    };
    s.onerror = () => reject(new Error('PDF.js 库加载失败'));
    document.head.appendChild(s);
  });
  return _pdfjsPromise;
}

async function loadPptxGen() {
  if (_pptxgen) return _pptxgen;
  if (_pptxgenPromise) return _pptxgenPromise;
  _pptxgenPromise = new Promise((resolve, reject) => {
    if (window.PptxGenJS || window.pptxgen) {
      _pptxgen = window.PptxGenJS || window.pptxgen;
      resolve(_pptxgen);
      return;
    }
    const s = document.createElement('script');
    s.src = PPTX_CDN;
    s.onload = () => {
      _pptxgen = window.PptxGenJS || window.pptxgen;
      resolve(_pptxgen);
    };
    s.onerror = () => reject(new Error('PptxGenJS 库加载失败'));
    document.head.appendChild(s);
  });
  return _pptxgenPromise;
}

async function pdfToImages(pdfData, onProgress) {
  const lib = await loadPdfJs();
  const pdf = await lib.getDocument({ data: pdfData }).promise;
  const images = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    onProgress?.(i, pdf.numPages);
    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width;
    canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    images.push(canvas.toDataURL('image/png').split(',')[1]);
    page.cleanup();
  }
  return images;
}

function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / 1048576).toFixed(2) + ' MB';
}

const PDF_ICON = `<svg width="28" height="28" viewBox="0 0 28 28" fill="none"><rect x="5" y="2" width="18" height="24" rx="2.5" fill="#FFF0F0" stroke="#E53935" stroke-width="1"/><text x="14" y="17" text-anchor="middle" fill="#E53935" font-size="7" font-weight="700" font-family="sans-serif">PDF</text></svg>`;
const PLUS = `<svg width="12" height="12" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.2"/><path d="M7 4v6M4 7h6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`;
const TRASH = `<svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M2.5 3.5h9M5.5 3.5V2.5h3v1M4 3.5l.5 8h5l.5-8" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const FOLDER = `<svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M1.5 3.5v8a1 1 0 001 1h9a1 1 0 001-1V5.5a1 1 0 00-1-1H7L5.5 3H2.5a1 1 0 00-1 1z" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const SIDEBAR_ITEMS = [
  { id: 'to-image', label: 'PDF 转 图片', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>' },
  { id: 'to-ppt', label: 'PDF 转 PPT', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m10 14-2 2 2 2"/><path d="m14 18 2-2-2-2"/></svg>' },
];

export default {
  id: 'pdf-tools',
  name: 'PDF 工具',
  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
  description: 'PDF 转 图片、PDF 转 PPT',
  keywords: ['pdf', 'image', 'png', 'ppt', 'pptx', '图片', '幻灯片', '转换', 'pdf2img', 'pdf to image', 'pdf转图片', 'pdf2ppt', 'pdf转ppt'],

  detectClipboardData(text) {
    const t = text.trim();
    if ((t.startsWith('/') || t.startsWith('file://'))
      && t.toLowerCase().endsWith('.pdf')) {
      return '检测到 PDF 文件，点击使用 PDF 工具处理';
    }
    return null;
  },

  render(container) {
    this._container = container;
    this._activeTab = 'to-image';
    this._files = { 'to-image': [], 'to-ppt': [] };
    this._converting = { 'to-image': false, 'to-ppt': false };
    this._setupEvents();
    this._render();
  },

  setData(text) {
    if (!text) return;
    const path = text.trim();
    if (!path.toLowerCase().endsWith('.pdf')) return;
    this._loadFromPath(path);
  },

  _curFiles() { return this._files[this._activeTab]; },
  _curConverting() { return this._converting[this._activeTab]; },

  _setupEvents() {
    this._fileInput = document.createElement('input');
    this._fileInput.type = 'file';
    this._fileInput.accept = '.pdf';
    this._fileInput.multiple = true;
    this._fileInput.style.display = 'none';

    const resetBlur = () => { window._skipBlur = false; };
    this._fileInput.addEventListener('change', (e) => {
      resetBlur();
      this._addFiles(Array.from(e.target.files));
      this._fileInput.value = '';
    });
    this._fileInput.addEventListener('cancel', resetBlur);
    this._container.appendChild(this._fileInput);

    this._onClick = (e) => this._handleClick(e);
    this._container.addEventListener('click', this._onClick);

    this._onDragOver = (e) => { e.preventDefault(); this._container.classList.add('pdf-drag-over'); };
    this._onDragLeave = () => this._container.classList.remove('pdf-drag-over');
    this._onDrop = (e) => {
      e.preventDefault();
      this._container.classList.remove('pdf-drag-over');
      const pdfs = Array.from(e.dataTransfer.files)
        .filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
      if (pdfs.length) this._addFiles(pdfs);
    };
    this._container.addEventListener('dragover', this._onDragOver);
    this._container.addEventListener('dragleave', this._onDragLeave);
    this._container.addEventListener('drop', this._onDrop);

    this._onPaste = (e) => {
      const pdfs = Array.from(e.clipboardData?.files || [])
        .filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
      if (pdfs.length) { e.preventDefault(); this._addFiles(pdfs); }
    };
    this._container.addEventListener('paste', this._onPaste);
  },

  _handleClick(e) {
    const t = e.target;

    const navItem = t.closest('.pdf-sidebar-item');
    if (navItem) {
      const tab = navItem.dataset.tab;
      if (tab && tab !== this._activeTab) {
        this._activeTab = tab;
        this._render();
      }
      return;
    }

    if (t.closest('[data-action="select"]') || t.closest('[data-action="add"]')) {
      window._skipBlur = true;
      this._fileInput?.click();
      return;
    }
    if (t.closest('[data-action="clear"]')) {
      if (this._curConverting()) return;
      this._files[this._activeTab] = [];
      this._render();
      return;
    }
    if (t.closest('[data-action="convert"]')) {
      if (!this._curConverting()) this._startConvert();
      return;
    }
    const del = t.closest('[data-action="delete"]');
    if (del) {
      if (this._curConverting()) return;
      this._curFiles().splice(parseInt(del.dataset.idx), 1);
      this._render();
      return;
    }
    const open = t.closest('[data-action="open"]');
    if (open) {
      const files = this._curFiles();
      const f = files[parseInt(open.dataset.idx)];
      if (f?.outputPath && window.__TAURI__) {
        window.__TAURI__.core.invoke('launch_application', { path: f.outputPath });
      }
    }
  },

  _render() {
    this._container.classList.remove('pdf-drag-over');

    this._container.innerHTML = `
      <div class="pdf-layout">
        <div class="pdf-sidebar">
          <nav class="pdf-sidebar-nav">
            ${SIDEBAR_ITEMS.map(item => `
              <button class="pdf-sidebar-item ${item.id === this._activeTab ? 'active' : ''}" data-tab="${item.id}">
                <span class="pdf-sidebar-icon">${item.icon}</span>
                <span class="pdf-sidebar-label">${item.label}</span>
              </button>
            `).join('')}
          </nav>
          <div class="pdf-sidebar-footer">
            <span class="pdf-feature"><span class="pdf-check">✓</span> 本地完成处理</span>
            <span class="pdf-feature"><span class="pdf-check">✓</span> 数据隐私安全</span>
          </div>
        </div>
        <div class="pdf-main">
          ${this._activeTab === 'to-image' ? this._renderToImage() : this._renderToPpt()}
        </div>
      </div>
    `;

    this._container.appendChild(this._fileInput);
  },

  _renderToImage() {
    const files = this._curFiles();
    if (files.length === 0) {
      return `
        <div class="pdf-empty">
          <button class="pdf-select-btn" data-action="select">${PLUS}<span>选择 PDF 文件</span></button>
          <div class="pdf-empty-hint">或拖入文件、粘贴文件</div>
          <div class="pdf-features">
            <span class="pdf-feature"><span class="pdf-check">✓</span> 高清 PNG 输出</span>
            <span class="pdf-feature"><span class="pdf-check">✓</span> 支持多文件批量转换</span>
          </div>
        </div>`;
    }

    const pending = files.filter(f => f.status === 'pending').length;
    return `
      <div class="pdf-list">
        <div class="pdf-list-header">
          <div class="pdf-list-title">PDF 转 图片</div>
          <div class="pdf-list-actions">
            <button class="pdf-header-btn" data-action="add">${PLUS} 添加文件</button>
            <button class="pdf-header-btn" data-action="clear">${TRASH} 清空列表</button>
          </div>
        </div>
        <div class="pdf-file-list">
          ${files.map((f, i) => `
            <div class="pdf-file-item">
              <div class="pdf-file-icon">${PDF_ICON}</div>
              <div class="pdf-file-info">
                <div class="pdf-file-name">${this._esc(f.name)}</div>
                <div class="pdf-file-meta">${fmtSize(f.size)}</div>
              </div>
              <div class="pdf-file-status ${f.status}">${this._statusText(f)}</div>
              <div class="pdf-file-actions">
                ${f.status === 'done' ? `<button class="pdf-icon-btn" data-action="open" data-idx="${i}" title="打开目录">${FOLDER}</button>` : ''}
                <button class="pdf-icon-btn" data-action="delete" data-idx="${i}" title="删除">${TRASH}</button>
              </div>
            </div>
          `).join('')}
        </div>
        ${pending > 0 ? `<button class="pdf-convert-btn" data-action="convert">开始转换 (${pending})</button>` : ''}
      </div>`;
  },

  _renderToPpt() {
    const files = this._curFiles();
    if (files.length === 0) {
      return `
        <div class="pdf-empty">
          <button class="pdf-select-btn pdf-ppt-btn" data-action="select">${PLUS}<span>选择 PDF 文件</span></button>
          <div class="pdf-empty-hint">或拖入文件、粘贴文件</div>
          <div class="pdf-features">
            <span class="pdf-feature"><span class="pdf-check">✓</span> 每页 PDF 对应一张幻灯片</span>
            <span class="pdf-feature"><span class="pdf-check">✓</span> 高清图片嵌入</span>
          </div>
        </div>`;
    }

    const pending = files.filter(f => f.status === 'pending').length;
    return `
      <div class="pdf-list">
        <div class="pdf-list-header">
          <div class="pdf-list-title">PDF 转 PPT</div>
          <div class="pdf-list-actions">
            <button class="pdf-header-btn" data-action="add">${PLUS} 添加文件</button>
            <button class="pdf-header-btn" data-action="clear">${TRASH} 清空列表</button>
          </div>
        </div>
        <div class="pdf-file-list">
          ${files.map((f, i) => `
            <div class="pdf-file-item">
              <div class="pdf-file-icon">${PDF_ICON}</div>
              <div class="pdf-file-info">
                <div class="pdf-file-name">${this._esc(f.name)}</div>
                <div class="pdf-file-meta">${fmtSize(f.size)}</div>
              </div>
              <div class="pdf-file-status ${f.status}">${this._statusText(f, 'ppt')}</div>
              <div class="pdf-file-actions">
                ${f.status === 'done' ? `<button class="pdf-icon-btn" data-action="open" data-idx="${i}" title="打开目录">${FOLDER}</button>` : ''}
                <button class="pdf-icon-btn" data-action="delete" data-idx="${i}" title="删除">${TRASH}</button>
              </div>
            </div>
          `).join('')}
        </div>
        ${pending > 0 ? `<button class="pdf-convert-btn pdf-ppt-btn" data-action="convert">开始转换 (${pending})</button>` : ''}
      </div>`;
  },

  _esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  },

  _statusText(f, mode) {
    switch (f.status) {
      case 'pending': return '待转换';
      case 'converting': return `转换中 ${f.progress || ''}`;
      case 'done': return mode === 'ppt' ? '已完成' : `已完成 (${f.pageCount}页)`;
      case 'error': return '转换失败';
      default: return '';
    }
  },

  _hasFile(name, size) {
    return this._curFiles().some(f => f.name === name && f.size === size);
  },

  async _addFiles(fileList) {
    if (this._curConverting()) return;
    const files = this._curFiles();
    for (const file of fileList) {
      if (!file.name.toLowerCase().endsWith('.pdf')) continue;
      if (files.some(f => f.name === file.name && f.size === file.size)) continue;
      const buf = await file.arrayBuffer();
      const srcPath = file.path || '';
      const lastSlash = srcPath.lastIndexOf('/');
      const sourceDir = lastSlash > 0 ? srcPath.substring(0, lastSlash) : '';
      files.push({
        name: file.name,
        size: file.size,
        data: new Uint8Array(buf),
        status: 'pending',
        pageCount: 0,
        progress: '',
        sourceDir,
        outputPath: null,
      });
    }
    this._render();
  },

  async _loadFromPath(path) {
    if (!window.__TAURI__) return;
    try {
      const b64 = await window.__TAURI__.core.invoke('read_file_as_base64', { path });
      const bin = atob(b64);
      const data = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
      const name = path.split('/').pop() || 'document.pdf';
      const lastSlash = path.lastIndexOf('/');
      const sourceDir = lastSlash > 0 ? path.substring(0, lastSlash) : '';
      const files = this._curFiles();
      if (files.some(f => f.name === name && f.size === data.length)) return;
      files.push({
        name,
        size: data.length,
        data,
        status: 'pending',
        pageCount: 0,
        progress: '',
        sourceDir,
        outputPath: null,
      });
      this._render();
    } catch (e) {
      console.error('Failed to load PDF:', e);
    }
  },

  async _startConvert() {
    if (this._activeTab === 'to-image') {
      await this._startConvertToImage();
    } else {
      await this._startConvertToPpt();
    }
  },

  async _startConvertToImage() {
    const files = this._curFiles();
    const pending = files.filter(f => f.status === 'pending');
    if (!pending.length) return;

    this._converting[this._activeTab] = true;

    for (const file of pending) {
      file.status = 'converting';
      this._render();

      try {
        const images = await pdfToImages(file.data, (cur, total) => {
          file.progress = `(${cur}/${total})`;
          const el = this._container.querySelector('.pdf-file-status.converting');
          if (el) el.textContent = `转换中 (${cur}/${total})`;
        });

        file.pageCount = images.length;

        const folder = file.name.replace(/\.pdf$/i, '');
        if (window.__TAURI__) {
          const outputPath = await window.__TAURI__.core.invoke('save_images_to_downloads', {
            folderName: folder,
            images,
            outputDir: file.sourceDir || null,
          });
          file.outputPath = outputPath;
        }

        file.status = 'done';
      } catch (e) {
        console.error('PDF conversion failed:', e);
        file.status = 'error';
      }

      this._render();
    }

    this._converting[this._activeTab] = false;
  },

  async _startConvertToPpt() {
    const files = this._curFiles();
    const pending = files.filter(f => f.status === 'pending');
    if (!pending.length) return;

    this._converting[this._activeTab] = true;

    try {
      await loadPptxGen();
    } catch (e) {
      console.error('Failed to load PptxGenJS:', e);
      this._converting[this._activeTab] = false;
      return;
    }

    for (const file of pending) {
      file.status = 'converting';
      file.progress = '(加载中...)';
      this._render();

      try {
        const images = await pdfToImages(file.data, (cur, total) => {
          file.progress = `(${cur}/${total})`;
          const el = this._container.querySelector('.pdf-file-status.converting');
          if (el) el.textContent = `渲染中 (${cur}/${total})`;
        });

        file.pageCount = images.length;
        file.progress = '(生成 PPT...)';
        const statusEl = this._container.querySelector('.pdf-file-status.converting');
        if (statusEl) statusEl.textContent = '生成 PPT...';

        const PptxGenJS = window.PptxGenJS || window.pptxgen;
        const pptx = new PptxGenJS();

        for (const imgB64 of images) {
          const slide = pptx.addSlide();
          slide.addImage({
            data: `image/png;base64,${imgB64}`,
            x: 0,
            y: 0,
            w: '100%',
            h: '100%',
          });
        }

        const fileName = file.name.replace(/\.pdf$/i, '.pptx');
        const pptxBlob = await pptx.write({ outputType: 'blob' });

        if (window.__TAURI__) {
          const base64Data = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(pptxBlob);
          });

          const outputPath = await window.__TAURI__.core.invoke('save_binary_to_downloads', {
            filename: fileName,
            data: base64Data,
            outputDir: file.sourceDir || null,
          });
          file.outputPath = outputPath;
        }

        file.status = 'done';
      } catch (e) {
        console.error('PDF to PPT conversion failed:', e);
        file.status = 'error';
      }

      this._render();
    }

    this._converting[this._activeTab] = false;
  },

  destroy() {
    if (this._fileInput) { this._fileInput.remove(); this._fileInput = null; }
    if (this._onClick) this._container.removeEventListener('click', this._onClick);
    if (this._onDragOver) this._container.removeEventListener('dragover', this._onDragOver);
    if (this._onDragLeave) this._container.removeEventListener('dragleave', this._onDragLeave);
    if (this._onDrop) this._container.removeEventListener('drop', this._onDrop);
    if (this._onPaste) this._container.removeEventListener('paste', this._onPaste);
    this._container = null;
  },
};
