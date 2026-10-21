// Site-wide behaviour: skin picker, consent, game player, favorites, recently played, search.
// Everything here degrades gracefully: if storage is blocked the site still works, it just forgets.

const store = {
  get(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key: string, value: string) {
    try { localStorage.setItem(key, value); } catch { /* storage blocked */ }
  },
  json<T>(key: string, fallback: T): T {
    const raw = store.get(key);
    if (!raw) return fallback;
    try { return JSON.parse(raw) as T; } catch { return fallback; }
  },
};

const html = document.documentElement;
const lang = html.lang.startsWith('fr') ? 'fr' : 'en';

/* ---------------- Skins ---------------- */
function applySkin(id: string) {
  html.setAttribute('data-skin', id);
  const link = document.getElementById('skin-fonts') as HTMLLinkElement | null;
  if (link) link.href = `/fonts/${id}.css`;
  store.set('vg.skin', id);
  document.querySelectorAll<HTMLElement>('[data-skin-choice]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.skinChoice === id)));
  const picker = document.querySelector<HTMLElement>('.skin-picker');
  const names = picker ? (JSON.parse(picker.dataset.skinNames || '{}') as Record<string, string>) : {};
  document.querySelectorAll<HTMLElement>('[data-skin-name]').forEach((el) => { el.textContent = names[id] || id; });
  const meta = document.querySelector<HTMLMetaElement>('meta[name=theme-color]');
  if (meta) meta.content = getComputedStyle(html).getPropertyValue('--bg').trim() || meta.content;
}

function initSkinPicker() {
  const picker = document.querySelector<HTMLElement>('.skin-picker');
  if (!picker) return;
  const btn = picker.querySelector<HTMLButtonElement>('.skin-btn')!;
  const menu = picker.querySelector<HTMLElement>('.skin-menu')!;
  const options = () => Array.from(menu.querySelectorAll<HTMLButtonElement>('[data-skin-choice]'));
  const current = html.getAttribute('data-skin') || 'arena';
  applySkinLabels(current);

  const open = () => {
    menu.hidden = false; btn.setAttribute('aria-expanded', 'true');
    (options().find((o) => o.getAttribute('aria-checked') === 'true') || options()[0])?.focus();
  };
  const close = (focusBtn = false) => {
    menu.hidden = true; btn.setAttribute('aria-expanded', 'false');
    if (focusBtn) btn.focus();
  };
  btn.addEventListener('click', () => (menu.hidden ? open() : close()));
  menu.addEventListener('click', (e) => {
    const opt = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-skin-choice]');
    if (!opt) return;
    applySkin(opt.dataset.skinChoice!);
    close(true);
  });
  menu.addEventListener('keydown', (e) => {
    const list = options();
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); list[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); list[list.length - 1].focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); close(true); }
    else if (e.key === 'Tab') close();
  });
  document.addEventListener('click', (e) => {
    if (!menu.hidden && !picker.contains(e.target as Node)) close();
  });
}

function applySkinLabels(id: string) {
  const picker = document.querySelector<HTMLElement>('.skin-picker');
  const names = picker ? (JSON.parse(picker.dataset.skinNames || '{}') as Record<string, string>) : {};
  document.querySelectorAll<HTMLElement>('[data-skin-choice]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.skinChoice === id)));
  document.querySelectorAll<HTMLElement>('[data-skin-name]').forEach((el) => { el.textContent = names[id] || id; });
}

/* ---------------- Consent ---------------- */
type Consent = 'granted' | 'denied' | null;
const getConsent = (): Consent => {
  const v = store.get('vg.consent');
  return v === 'granted' || v === 'denied' ? v : null;
};
function setConsent(v: 'granted' | 'denied') {
  store.set('vg.consent', v);
  const banner = document.getElementById('consent');
  if (banner) banner.hidden = true;
  document.dispatchEvent(new CustomEvent('vg:consent', { detail: v }));
}
function initConsent() {
  const banner = document.getElementById('consent');
  if (!banner) return;
  if (getConsent() === null) banner.hidden = false;
  banner.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-consent]');
    if (b) setConsent(b.dataset.consent as 'granted' | 'denied');
  });
  document.querySelectorAll('[data-open-consent]').forEach((b) =>
    b.addEventListener('click', () => { banner.hidden = false; banner.querySelector<HTMLElement>('[data-consent="granted"]')?.focus(); }),
  );
}

/* ---------------- Favorites & recent ---------------- */
const favs = () => store.json<string[]>('vg.favs', []);
function toggleFav(id: string): boolean {
  const list = favs();
  const i = list.indexOf(id);
  if (i > -1) list.splice(i, 1); else list.unshift(id);
  store.set('vg.favs', JSON.stringify(list.slice(0, 200)));
  return i === -1;
}
function markPlayed(id: string) {
  const list = store.json<{ id: string; t: number }[]>('vg.recent', []).filter((x) => x && x.id !== id);
  list.unshift({ id, t: Date.now() });
  store.set('vg.recent', JSON.stringify(list.slice(0, 40)));
}
function initFavButtons() {
  document.querySelectorAll<HTMLButtonElement>('[data-fav-id]').forEach((btn) => {
    const id = btn.dataset.favId!;
    const label = btn.querySelector<HTMLElement>('[data-fav-label]');
    const render = (on: boolean) => {
      btn.setAttribute('aria-pressed', String(on));
      if (label) label.textContent = on ? btn.dataset.labelOn! : btn.dataset.labelOff!;
    };
    render(favs().includes(id));
    btn.addEventListener('click', () => render(toggleFav(id)));
  });
}

/* ---------------- Player ---------------- */
function initPlayers() {
  document.querySelectorAll<HTMLElement>('[data-player]').forEach((player) => {
    const cover = player.querySelector<HTMLElement>('.player-cover');
    const playBtn = player.querySelector<HTMLButtonElement>('[data-play]');
    const consentBox = player.querySelector<HTMLElement>('.player-consent');
    const needsConsent = player.dataset.consent === 'required';
    const id = player.dataset.gameId || '';

    const load = () => {
      if (player.querySelector('iframe')) return;
      const f = document.createElement('iframe');
      f.src = player.dataset.src!;
      f.title = player.dataset.title || '';
      if (player.dataset.allow) f.setAttribute('allow', player.dataset.allow);
      f.setAttribute('allowfullscreen', '');
      f.loading = 'eager';
      player.appendChild(f);
      if (cover) cover.remove();
      if (consentBox) consentBox.hidden = true;
      if (id) markPlayed(id);
      f.focus();
    };

    playBtn?.addEventListener('click', () => {
      if (needsConsent && getConsent() !== 'granted' && consentBox) {
        consentBox.hidden = false;
        consentBox.querySelector<HTMLElement>('[data-consent-play]')?.focus();
        return;
      }
      load();
    });
    consentBox?.querySelector('[data-consent-play]')?.addEventListener('click', () => { setConsent('granted'); load(); });
    consentBox?.querySelector('[data-consent-cancel]')?.addEventListener('click', () => { consentBox.hidden = true; playBtn?.focus(); });
    if (player.dataset.autoload === 'true') load();
  });

  document.querySelectorAll<HTMLButtonElement>('[data-fullscreen]').forEach((btn) => {
    const target = document.getElementById(btn.dataset.fullscreen!);
    const el = target as (HTMLElement & { webkitRequestFullscreen?: () => void }) | null;
    if (!el || !(el.requestFullscreen || el.webkitRequestFullscreen)) { btn.hidden = true; return; }
    btn.addEventListener('click', () => {
      // Start the game first if it hasn't been loaded yet.
      if (!el.querySelector('iframe')) el.querySelector<HTMLButtonElement>('[data-play]')?.click();
      if (!el.querySelector('iframe')) return; // waiting for consent
      const req = el.requestFullscreen ? el.requestFullscreen() : (el.webkitRequestFullscreen?.(), undefined);
      if (req && typeof req.catch === 'function') req.catch(() => {});
    });
  });
}

/* ---------------- Lists: favorites, recent, search ---------------- */
interface IndexItem { id: string; title: string; url: string; img?: string; cat: string; sum: string; glyph?: string; bg?: string; fg?: string }
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function cardHtml(g: IndexItem) {
  const thumb = g.img
    ? `<img src="${esc(g.img)}" alt="" loading="lazy" decoding="async" width="448" height="280">`
    : `<span class="orig-glyph" style="color:${esc(g.fg || 'var(--accent2)')}" aria-hidden="true">${esc(g.glyph || '')}</span>`;
  const style = g.img ? '' : ` style="background:${esc(g.bg || 'var(--tile1-bg)')}"`;
  return `<a class="card" href="${esc(g.url)}"><div class="card-thumb"${style}>${thumb}</div><div class="card-body"><div class="card-title">${esc(g.title)}</div><div class="card-meta">${esc(g.cat)}</div></div></a>`;
}
function readIndex(): IndexItem[] {
  const el = document.getElementById('games-index');
  if (!el) return [];
  try { return JSON.parse(el.textContent || '[]'); } catch { return []; }
}
function initLists() {
  const favList = document.getElementById('list-favorites');
  const recentList = document.getElementById('list-recent');
  const searchBox = document.getElementById('search-input') as HTMLInputElement | null;
  if (!favList && !recentList && !searchBox) return;
  const index = readIndex();
  const byId = new Map(index.map((g) => [g.id, g]));

  const fill = (el: HTMLElement, items: IndexItem[]) => {
    el.innerHTML = items.map(cardHtml).join('');
    const empty = document.getElementById(`${el.id}-empty`);
    if (empty) empty.hidden = items.length > 0;
  };
  if (favList) fill(favList, favs().map((id) => byId.get(id)).filter(Boolean) as IndexItem[]);
  if (recentList) {
    const render = () => fill(recentList, store.json<{ id: string }[]>('vg.recent', []).map((x) => byId.get(x?.id)).filter(Boolean) as IndexItem[]);
    render();
    document.querySelector('[data-clear-recent]')?.addEventListener('click', () => { store.set('vg.recent', '[]'); render(); });
  }
  if (searchBox) {
    const out = document.getElementById('search-results')!;
    const count = document.getElementById('search-count')!;
    const empty = document.getElementById('search-results-empty')!;
    const fmt = (n: number) => (lang === 'fr' ? `${n} ${n === 1 ? 'jeu' : 'jeux'}` : `${n} ${n === 1 ? 'game' : 'games'}`);
    const run = () => {
      const q = norm(searchBox.value.trim());
      const words = q.split(/\s+/).filter(Boolean);
      const hits = !words.length ? index : index
        .map((g) => {
          const title = norm(g.title), hay = `${title} ${norm(g.cat)} ${norm(g.sum)}`;
          if (!words.every((w) => hay.includes(w))) return null;
          const score = (title.startsWith(q) ? 3 : 0) + (title.includes(q) ? 2 : 0) + words.filter((w) => title.includes(w)).length;
          return { g, score };
        })
        .filter(Boolean)
        .sort((a, b) => b!.score - a!.score)
        .map((x) => x!.g);
      out.innerHTML = hits.map(cardHtml).join('');
      count.textContent = fmt(hits.length);
      empty.hidden = hits.length > 0;
      const url = new URL(location.href);
      if (q) url.searchParams.set('q', searchBox.value.trim()); else url.searchParams.delete('q');
      history.replaceState(null, '', url);
    };
    const initial = new URL(location.href).searchParams.get('q');
    if (initial) searchBox.value = initial;
    searchBox.addEventListener('input', run);
    run();
  }
}

/* ---------------- Originals: track plays ---------------- */
function initOriginalTracking() {
  const el = document.querySelector<HTMLElement>('[data-original-id]');
  if (el) markPlayed(el.dataset.originalId!);
}

/* ---------------- Language choice ---------------- */
function initLangSwitch() {
  document.querySelectorAll<HTMLAnchorElement>('[data-lang-switch]').forEach((a) =>
    a.addEventListener('click', () => store.set('vg.lang', a.hreflang === 'fr' ? 'fr' : 'en')),
  );
  // Remember the language of the page the visitor is reading, so the root URL sends them back here.
  store.set('vg.lang', lang);
}

/* ---------------- Broken thumbnails ---------------- */
// If a partner image fails to load, hide it so the tile shows its plain background instead of a broken icon.
function initImageFallback() {
  const hide = (img: HTMLImageElement) => img.classList.add('img-missing');
  document.addEventListener('error', (e) => {
    const el = e.target as HTMLElement;
    if (el instanceof HTMLImageElement) hide(el);
  }, true);
  document.querySelectorAll<HTMLImageElement>('img').forEach((img) => { if (img.complete && img.naturalWidth === 0 && img.src) hide(img); });
}

initImageFallback();
initLangSwitch();
initSkinPicker();
initConsent();
initFavButtons();
initPlayers();
initLists();
initOriginalTracking();
