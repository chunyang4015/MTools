const FAV_KEY = 'mtools:color-picker:favorites';
const FAV_MAX = 30;

const PALETTES = {
  material: {
    name: 'Material',
    colors: [
      '#F44336','#EF5350','#E57373','#EF9A9A',
      '#E91E63','#EC407A','#F06292','#F48FB1',
      '#9C27B0','#AB47BC','#BA68C8','#CE93D8',
      '#673AB7','#7E57C2','#9575CD','#B39DDB',
      '#3F51B5','#5C6BC0','#7986CB','#9FA8DA',
      '#2196F3','#42A5F5','#64B5F6','#90CAF9',
      '#009688','#26A69A','#4DB6AC','#80CBC4',
      '#4CAF50','#66BB6A','#81C784','#A5D6A7',
      '#FF9800','#FFA726','#FFB74D','#FFCC80',
      '#FF5722','#FF7043','#FF8A65','#FFAB91',
      '#795548','#8D6E63','#A1887F','#BCAAA4',
      '#607D8B','#78909C','#90A4AE','#B0BEC5',
    ],
  },
  ant: {
    name: 'Ant Design',
    colors: [
      '#1677FF','#4096FF','#69B1FF','#91CAFF','#BAE0FF','#E6F4FF',
      '#F5222D','#FF4D4F','#FF7875','#FFA39E','#FFCCC7','#FFF1F0',
      '#FA8C16','#FAAD14','#FFC53D','#FFD666','#FFE58F','#FFF7E6',
      '#52C41A','#73D13D','#95DE64','#B7EB8F','#D9F7BE','#F6FFED',
      '#13C2C2','#36CFC9','#5CDBD3','#87E8DE','#B5F5EC','#E6FFFB',
      '#722ED1','#9254DE','#B37FEB','#D3ADF7','#EFDBFF','#F9F0FF',
      '#EB2F96','#F759AB','#FF85C0','#FFB6E0','#FFD6E7','#FFF0F6',
      '#FA541C','#FF7A45','#FF9C6E','#FFBB96','#FFD8BF','#FFF2E8',
    ],
  },
  tailwind: {
    name: 'Tailwind',
    colors: [
      '#F87171','#EF4444','#DC2626','#B91C1C',
      '#FB923C','#F97316','#EA580C','#C2410C',
      '#FBBF24','#F59E0B','#D97706','#B45309',
      '#A3E635','#84CC16','#65A30D','#4D7C0F',
      '#34D399','#10B981','#059669','#047857',
      '#22D3EE','#06B6D4','#0891B2','#0E7490',
      '#60A5FA','#3B82F6','#2563EB','#1D4ED8',
      '#A78BFA','#8B5CF6','#7C3AED','#6D28D9',
      '#F472B6','#EC4899','#DB2777','#BE185D',
      '#94A3B8','#64748B','#475569','#334155',
    ],
  },
};

function loadFavorites() {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveFavorites(list) {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(list.slice(0, FAV_MAX)));
  } catch {}
}

function normalizeHex(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  return '#' + hex.toUpperCase();
}

export default {
  id: 'color-picker',
  name: '颜色转换',
  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"/><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/></svg>',
  description: 'HEX / RGB / HSL 颜色格式互转',
  keywords: ['color', 'hex', 'rgb', 'hsl', '颜色', '色彩'],

  detectClipboardData(text) {
    const t = text.trim();
    if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(t)) {
      return `检测到 HEX 颜色 ${t}，点击转换`;
    }
    if (/^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/.test(t)) {
      return `检测到 RGB 颜色，点击转换`;
    }
    return null;
  },

  setData(text) {
    const input = this._container?.querySelector('#color-text');
    if (!input) return;
    input.value = text.trim();
    input.dispatchEvent(new Event('input'));
  },

  render(container) {
    container.innerHTML = `
      <div class="color-layout">
        <div class="color-left">
          <div class="color-picker-row">
            <input type="color" id="color-native" value="#4A90D9" class="color-wheel-lg">
            <button class="btn-icon" id="color-eyedropper" title="屏幕取色">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9"/><path d="m15 6 3 3"/></svg>
            </button>
          </div>
          <input type="text" class="color-text-input" id="color-text" placeholder="#4A90D9 或 rgb(74,144,217)" spellcheck="false">
          <div class="color-preview-lg" id="color-preview">
            <button class="color-fav-btn-lg" id="color-fav" title="收藏此颜色">☆</button>
          </div>
          <div class="color-formats" id="color-results"></div>
        </div>
        <div class="color-right">
          <div class="color-tabs" id="color-tabs">
            <button class="color-tab active" data-tab="favorites">收藏</button>
            <button class="color-tab" data-tab="material">Material</button>
            <button class="color-tab" data-tab="ant">Ant</button>
            <button class="color-tab" data-tab="tailwind">Tailwind</button>
          </div>
          <div class="color-palette" id="color-panel-content"></div>
        </div>
      </div>
    `;

    this._container = container;
    const nativePicker = document.getElementById('color-native');
    const preview = document.getElementById('color-preview');
    const results = document.getElementById('color-results');
    const panelContent = document.getElementById('color-panel-content');
    const favBtn = document.getElementById('color-fav');
    const tabs = container.querySelector('.color-tabs');
    const textInput = document.getElementById('color-text');
    let activePanel = 'favorites';

    function hexToRgb(hex) {
      hex = hex.replace('#', '');
      if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
      const n = parseInt(hex, 16);
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }

    function rgbToHsl(r, g, b) {
      r /= 255; g /= 255; b /= 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const l = (max + min) / 2;
      if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };
      const d = max - min;
      const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      let h;
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
      return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
    }

    function updateFavBtn(hex) {
      const favs = loadFavorites();
      const normalized = normalizeHex(hex);
      const isFav = favs.includes(normalized);
      favBtn.textContent = isFav ? '★' : '☆';
      favBtn.classList.toggle('active', isFav);
    }

    function showColor(hex) {
      const { r, g, b } = hexToRgb(hex);
      const { h, s, l } = rgbToHsl(r, g, b);
      preview.style.background = hex;
      nativePicker.value = hex.length === 4
        ? '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3]
        : hex;
      const formats = [
        { label: 'HEX', value: hex.toUpperCase() },
        { label: 'RGB', value: `rgb(${r}, ${g}, ${b})` },
        { label: 'HSL', value: `hsl(${h}, ${s}%, ${l}%)` },
      ];
      results.innerHTML = formats.map(({ label, value }) => `
        <div class="color-format-row">
          <span class="color-format-label">${label}</span>
          <code class="color-format-value">${value}</code>
          <button class="color-copy-btn" data-val="${value}" title="复制">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
          </button>
        </div>
      `).join('');

      results.querySelectorAll('.color-copy-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          navigator.clipboard.writeText(btn.dataset.val);
          const svg = btn.innerHTML;
          btn.innerHTML = '✓';
          btn.classList.add('copied');
          setTimeout(() => { btn.innerHTML = svg; btn.classList.remove('copied'); }, 800);
        });
      });

      updateFavBtn(hex);
    }

    function renderFavoritesPanel() {
      const favs = loadFavorites();
      if (favs.length === 0) {
        panelContent.innerHTML = '<div class="color-panel-empty">点击 ☆ 收藏颜色</div>';
        return;
      }
      panelContent.innerHTML = '<div class="color-swatch-grid">' +
        favs.map(hex => `
          <div class="color-swatch" data-color="${hex}" title="${hex}">
            <div class="color-swatch-inner" style="background:${hex}"></div>
            <button class="color-swatch-remove" data-remove="${hex}">&times;</button>
          </div>
        `).join('') +
        '</div>';

      panelContent.querySelectorAll('.color-swatch').forEach(sw => {
        sw.addEventListener('click', (e) => {
          if (e.target.closest('.color-swatch-remove')) return;
          const hex = sw.dataset.color;
          textInput.value = hex;
          showColor(hex);
        });
      });

      panelContent.querySelectorAll('.color-swatch-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const hex = btn.dataset.remove;
          const favs = loadFavorites().filter(f => f !== hex);
          saveFavorites(favs);
          updateFavBtn(textInput.value.trim() || '#4A90D9');
          renderFavoritesPanel();
        });
      });
    }

    function renderPalettePanel(key) {
      const palette = PALETTES[key];
      if (!palette) return;
      panelContent.innerHTML = '<div class="color-swatch-grid">' +
        palette.colors.map(hex => `
          <div class="color-swatch" data-color="${hex}" title="${hex}">
            <div class="color-swatch-inner" style="background:${hex}"></div>
          </div>
        `).join('') +
        '</div>';

      panelContent.querySelectorAll('.color-swatch').forEach(sw => {
        sw.addEventListener('click', () => {
          const hex = sw.dataset.color;
          textInput.value = hex;
          showColor(hex);
        });
      });
    }

    function switchPanel(tab) {
      activePanel = tab;
      tabs.querySelectorAll('.color-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tab);
      });
      if (tab === 'favorites') {
        renderFavoritesPanel();
      } else {
        renderPalettePanel(tab);
      }
    }

    nativePicker.addEventListener('input', () => {
      textInput.value = nativePicker.value;
      showColor(nativePicker.value);
    });

    textInput.addEventListener('input', () => {
      const val = textInput.value.trim();
      let hex;
      if (val.startsWith('#')) {
        if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(val)) hex = val;
      } else {
        const m = val.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
        if (m) {
          hex = '#' + [m[1], m[2], m[3]].map((n) => parseInt(n).toString(16).padStart(2, '0')).join('');
        }
      }
      if (hex) showColor(hex);
    });

    // Eyedropper
    const eyeDropperBtn = document.getElementById('color-eyedropper');
    if (window.__TAURI__) {
      eyeDropperBtn.addEventListener('click', async () => {
        try {
          const hex = await window.__TAURI__.core.invoke('pick_color');
          textInput.value = hex;
          showColor(hex);
        } catch (e) {
          if (e !== 'cancelled') console.error('pick_color error:', e);
        }
      });
    } else {
      eyeDropperBtn.style.display = 'none';
    }

    // Favorite toggle
    favBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const currentHex = normalizeHex(textInput.value.trim() || '#4A90D9');
      let favs = loadFavorites();
      if (favs.includes(currentHex)) {
        favs = favs.filter(f => f !== currentHex);
      } else {
        if (favs.length >= FAV_MAX) favs.shift();
        favs.push(currentHex);
      }
      saveFavorites(favs);
      updateFavBtn(currentHex);
      if (activePanel === 'favorites') renderFavoritesPanel();
    });

    // Tabs
    tabs.querySelectorAll('.color-tab').forEach(btn => {
      btn.addEventListener('click', () => switchPanel(btn.dataset.tab));
    });

    showColor('#4A90D9');
    renderFavoritesPanel();
  },

  destroy() {},
};
