const FALLBACK_ICON = `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" width="20" height="20">
  <rect x="2" y="2" width="28" height="28" rx="7" fill="currentColor" opacity="0.15"/>
  <rect x="8" y="8" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.5"/>
  <rect x="17" y="8" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.5"/>
  <rect x="8" y="17" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.5"/>
  <rect x="17" y="17" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.5"/>
</svg>`;

let apps = null;
const iconCache = new Map();

function precompute(raw) {
  return raw.map((a) => ({ ...a, lower: a.name.toLowerCase() }));
}

export async function loadApps() {
  if (!window.__TAURI__) { apps = []; return; }
  try {
    const raw = await window.__TAURI__.core.invoke('scan_applications');
    apps = precompute(raw);
  } catch (e) {
    console.error('scan_applications:', e);
    if (apps === null) apps = [];
  }
}

function matchApp(a, q) {
  return a.lower.includes(q) || a.pinyinFull.includes(q) || a.pinyinInitials.includes(q);
}

export function searchApps(query, limit = 5) {
  if (!apps || apps.length === 0) return [];
  const q = query.toLowerCase();
  const matched = [];
  for (const a of apps) {
    if (matchApp(a, q)) {
      matched.push({
        id: `app:${a.path}`,
        name: a.name,
        icon: iconCache.has(a.path)
          ? `<img src="data:image/png;base64,${iconCache.get(a.path)}" width="20" height="20" style="border-radius:4px"/>`
          : FALLBACK_ICON,
        description: a.path.replace(/^\/(System\/)?Applications\//, ''),
        _isApp: true,
        _appPath: a.path,
      });
      if (matched.length >= limit) break;
    }
  }
  return matched;
}

let iconLoadTimer = null;

export function loadIconsForResultItems(appPaths) {
  if (!window.__TAURI__) return;
  const uncached = appPaths.filter((p) => !iconCache.has(p));
  if (uncached.length === 0) return;

  clearTimeout(iconLoadTimer);
  iconLoadTimer = setTimeout(async () => {
    const results = await Promise.all(
      uncached.map(async (path) => {
        try {
          const b64 = await window.__TAURI__.core.invoke('get_app_icon', { path });
          return { path, b64 };
        } catch {
          return null;
        }
      })
    );
    for (const r of results) {
      if (r && r.b64) iconCache.set(r.path, r.b64);
    }
    document.querySelectorAll('.result-item[data-app-path]').forEach((el) => {
      const b64 = iconCache.get(el.dataset.appPath);
      if (!b64) return;
      const iconEl = el.querySelector('.result-icon');
      if (iconEl && iconEl.querySelector('svg')) {
        iconEl.innerHTML = `<img src="data:image/png;base64,${b64}" width="20" height="20" style="border-radius:4px"/>`;
      }
    });
  }, 500);
}

export async function launchApp(path) {
  if (!window.__TAURI__) return;
  await window.__TAURI__.core.invoke('launch_application', { path });
}
