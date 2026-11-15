'use strict';
const TOKEN = new URLSearchParams(location.search).get('t') || '';
const SRC = { steam: 'Steam', epic: 'Epic', gog: 'GOG', custom: 'App' };
const COLORS = ['#2f7bff', '#ff4d5a', '#3fb950', '#f08ad8', '#f5a623', '#22c1c3', '#9b6bff', '#ff7a45'];
const TYPE = { phone: 'Phone controller', ps5: 'DualSense controller', ds4: 'DualShock 4', xbox: 'Xbox controller', switch: 'Switch Pro controller', generic: 'Game controller' };
const ICON = { phone: '📱', ps5: '🎮', ds4: '🎮', xbox: '🎮', switch: '🎮', generic: '🎮' };
const PSG = { A: '✕', B: '○', X: '□', Y: '△' };
const DIRS = ['up', 'down', 'left', 'right'];
const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

async function api(path, body) {
  const o = { headers: { 'X-Token': TOKEN } };
  if (body !== undefined) { o.method = 'POST'; o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(body); }
  const r = await fetch(path, o);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || ('Error ' + r.status));
  return j;
}

// ---------------------------------------------------------------- state
const S = { games: [], users: [], controllers: {}, settings: { sound: true, intro: true, art_download: true, theme: 'blue', volume: 2, magpie: false, magpie_path: '' }, magpieFound: '', phones: [], pads: [], native: { xinput: 0, other: [] },
            glyph: 'ps', ready: false, rev: 0, skipped: new Set(), prompting: false };
const userById = id => S.users.find(u => u.id === id);
const artUrl = (g, kind) => '/art/' + encodeURIComponent(g.id) + '?kind=' + kind + '&t=' + encodeURIComponent(TOKEN);
const displayName = c => c.alias || c.name;

// ---------------------------------------------------------------- sound
const VOLUMES = { 1: 0.32, 2: 0.6, 3: 0.95 }, VOL_NAMES = { 1: 'Low', 2: 'Medium', 3: 'High' };
const THEMES = { blue: 'Blue', midnight: 'Midnight', aurora: 'Aurora', ember: 'Ember', mono: 'Classic' };
const applyTheme = () => { document.documentElement.dataset.theme = S.settings.theme || 'blue'; };
let AC = null, SFX = null;
function audio() {
  if (!SFX) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); SFX = makeSfx(AC); } catch (e) { SFX = new Proxy({}, { get: () => () => 0 }); } }
  if (AC && AC.state === 'suspended') AC.resume();
  if (SFX.setVolume) SFX.setVolume(VOLUMES[S.settings.volume] || 0.6);
  return SFX;
}
function play(name, a) { if (!S.settings.sound) return 0; try { return audio()[name](a); } catch (e) { return 0; } }

let toastT = 0;
function toast(msg, err) {
  const t = $('#toast'); t.textContent = msg; t.className = 'show' + (err ? ' err' : '');
  clearTimeout(toastT); toastT = setTimeout(() => t.className = '', 2800);
  if (err) play('error');
}

// ---------------------------------------------------------------- screen stack + focus
const stack = [], root = $('#screens');
const cur = () => stack[stack.length - 1];
function push(s) {
  s.el.classList.add('screen'); if (s.modal) s.el.classList.add('modal');
  root.appendChild(s.el); stack.push(s); layout();
  const f = focusables(); if (f.length) setFocus(s.initial && f.includes(s.initial) ? s.initial : f[0]);
}
function pop() {
  const s = stack.pop(); if (s) { s.el.remove(); s.onClose && s.onClose(); }
  layout(); const t = cur();
  if (t) { const f = focusables(); setFocus(t.focus && f.includes(t.focus) ? t.focus : f[0]); t.refresh && t.refresh(); }
}
function layout() {
  stack.forEach((s, i) => {
    const last = i === stack.length - 1, below = i === stack.length - 2 && cur().modal;
    s.el.style.display = (last || below) ? '' : 'none';
    s.el.classList.toggle('dim', !last);
  });
  const t = cur(), below = stack[stack.length - 2];
  $('#bd').classList.toggle('off', !(t && (t.isHome || (t.modal && below && below.isHome))));
  renderHints();
}
function hintKey(k) {
  if (k === 'Start') return '<i class="k S">☰</i>';
  return S.glyph === 'ps' ? `<i class="k ps ${k}">${PSG[k]}</i>` : `<i class="k xb ${k}">${k}</i>`;
}
function renderHints() {
  const t = cur(), h = $('#hints'); h.innerHTML = '';
  if (t) (t.hints || []).forEach(([k, label]) => h.append(el('div', 'hint', hintKey(k) + esc(label))));
}
const focusables = () => cur() ? [...cur().el.querySelectorAll('[data-f]')] : [];
function setFocus(e) {
  const t = cur(); if (!t || !e) return;
  t.el.querySelectorAll('.focus').forEach(x => x.classList.remove('focus'));
  e.classList.add('focus'); t.focus = e;
  if (!t.noScroll) e.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
  if (t.onFocus) t.onFocus(e);
}
function nav(dir) {
  const list = focusables(); if (!list.length) return;
  const here = cur().focus && list.includes(cur().focus) ? cur().focus : null;
  if (!here) { setFocus(list[0]); return; }
  const a = here.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best = null, bs = 1e18;
  for (const e of list) {
    if (e === here) continue;
    const r = e.getBoundingClientRect(), dx = r.left + r.width / 2 - ax, dy = r.top + r.height / 2 - ay;
    let ok, p, q;
    if (dir === 'left') { ok = dx < -4; p = -dx; q = Math.abs(dy); }
    else if (dir === 'right') { ok = dx > 4; p = dx; q = Math.abs(dy); }
    else if (dir === 'up') { ok = dy < -4; p = -dy; q = Math.abs(dx); }
    else { ok = dy > 4; p = dy; q = Math.abs(dx); }
    if (!ok) continue;
    const sc = p + q * 2.4; if (sc < bs) { bs = sc; best = e; }
  }
  if (best) setFocus(best);
}
function fire(k) {
  const t = cur(); if (!t) return;
  if (DIRS.includes(k)) {
    const before = t.focus;
    if (!(t.onNav && t.onNav(k, t.focus))) nav(k);
    if (cur() === t && t.focus !== before) play('move', k);
    return;
  }
  if (k === 'A') { const f = t.focus; if (f && f.isConnected) { play('ok'); f.click(); } }
  else if (k === 'B') { if (t.onBack) { play('back'); t.onBack(); } }
  else if (k === 'X') t.onX && t.onX(t.focus);
  else if (k === 'Y') t.onY && t.onY(t.focus);
  else if (k === 'Start') t.onStart && t.onStart();
}

// ---------------------------------------------------------------- controllers: detect, classify, identify
function buildPads(raw) {
  const nth = {};
  return raw.map(p => {
    const id = p.id || '', m = /Vendor:\s*([0-9a-f]{4})\s*Product:\s*([0-9a-f]{4})/i.exec(id);
    const vid = m ? m[1].toLowerCase() : '', pid = m ? m[2].toLowerCase() : '';
    const xin = /xbox 360|xinput/i.test(id) && !m;            // Windows reports every XInput pad (phones included) this way
    const phone = xin ? (S.phones.find(ph => (ph.xinput != null ? ph.xinput : ph.slot - 1) === p.index) || null) : null;
    let kind = 'generic', name = id.replace(/\s*\(.*$/, '').trim() || 'Game controller', glyph = 'xbox';
    if (phone) { kind = 'phone'; name = phone.name || 'Phone'; glyph = 'ps'; }
    else if (vid === '054c') {
      glyph = 'ps';
      if (pid === '0ce6') { kind = 'ps5'; name = 'DualSense Wireless Controller'; }
      else if (pid === '0df2') { kind = 'ps5'; name = 'DualSense Edge'; }
      else if (['05c4', '09cc', '0ba0'].includes(pid)) { kind = 'ds4'; name = 'DualShock 4'; }
      else { kind = 'ps5'; name = 'PlayStation controller'; }
    } else if (vid === '045e' || xin || /xbox/i.test(id)) { kind = 'xbox'; name = xin ? 'Xbox controller' : (name || 'Xbox controller'); }
    else if (vid === '057e') { kind = 'switch'; name = 'Switch Pro controller'; }
    const base = phone ? 'phone:' + phone.pid : 'pad:' + (vid ? vid + ':' + pid : (xin ? 'xinput' : id.replace(/\W+/g, '').slice(0, 24)));
    const n = (nth[base] = (nth[base] || 0) + 1) - 1;
    const key = phone ? base : base + ':' + n;                 // two identical real pads get :0 and :1
    const cfg = S.controllers[key] || {}, user = cfg.user ? userById(cfg.user) : null;
    return { index: p.index, key, kind, name, glyph, phone, alias: cfg.alias || '', user, assigned: !!user };
  });
}
let padSig = '';
function syncPads(raw) {
  const sig = raw.map(p => p.index + '|' + p.id).join(',') + '#' + S.rev + '#' + S.phones.map(p => p.pid + ':' + p.xinput + ':' + p.slot).join(',');
  if (sig === padSig) return; padSig = sig;
  const old = new Map(S.pads.map(c => [c.key, c]));
  S.pads = buildPads(raw);
  if (S.ready) {
    S.pads.forEach(c => { if (!old.has(c.key)) { play('connect'); toast(displayName(c) + ' connected'); } });
    old.forEach((c, k) => { if (!S.pads.some(x => x.key === k)) { play('disconnect'); toast(displayName(c) + ' disconnected'); } });
  }
  refreshAll();
}
function refreshAll() { renderCluster(); const t = cur(); t && t.refresh && t.refresh(); }
function renderCluster() {
  const box = $('#avs'); box.innerHTML = '';
  S.pads.forEach(c => {
    const a = el('div', 'av' + (c.user ? '' : ' q'), c.user ? esc(c.user.name[0].toUpperCase()) : '?');
    if (c.user) a.style.setProperty('--c', c.user.color);
    a.append(el('small', '', ICON[c.kind])); box.append(a);
  });
  const found = (S.native.xinput || 0) + S.native.other.length > 0;
  $('#padhint').textContent = S.pads.length ? '' : found ? (S.native.other[0] || 'Controller') + ' found. Press a button on it to start' : 'Press any button on a controller';
}
function kindSummary(pads) {
  const n = {}; pads.forEach(c => n[c.kind] = (n[c.kind] || 0) + 1);
  return Object.keys(n).map(k => (k === 'phone' ? plural(n[k], 'phone') : n[k] + ' × ' + TYPE[k])).join(' · ');
}
async function identify(c) {
  if (c.phone) {
    try { const r = await api('/api/identify', { pid: c.phone.pid }); toast(r.ok ? 'Look for the buzzing phone…' : 'Could not reach that phone', !r.ok); } catch (e) { toast(e.message, true); }
    return;
  }
  const gp = (navigator.getGamepads ? navigator.getGamepads() : [])[c.index], a = gp && gp.vibrationActuator;
  if (a && a.playEffect) { a.playEffect('dual-rumble', { startDelay: 0, duration: 700, weakMagnitude: 1, strongMagnitude: 1 }); toast('Your controller is rumbling…'); }
  else toast('This controller cannot vibrate', true);
}

// ---------------------------------------------------------------- input: controllers, keyboard, mouse
const padState = {};
function onPress(k, info, repeat) {
  if (bootActive) { if (!repeat) bootSkip && bootSkip(); return; }
  if (info && S.glyph !== info.glyph) { S.glyph = info.glyph; renderHints(); home && home.updateHero && home.updateHero(); }
  fire(k);
}
function poll() {
  requestAnimationFrame(poll);
  const raw = (navigator.getGamepads ? [...navigator.getGamepads()] : []).filter(Boolean);
  syncPads(raw);
  if (!document.hasFocus()) { for (const k in padState) padState[k].prev = {}; return; }     // a game has focus: stay out of its way
  const now = performance.now();
  for (const p of raw) {
    const st = padState[p.index] || (padState[p.index] = { prev: {}, rep: {}, any: false });
    const b = i => p.buttons[i] && p.buttons[i].pressed, ax = p.axes[0] || 0, ay = p.axes[1] || 0;
    const info = S.pads.find(c => c.index === p.index);
    const anyNow = p.buttons.some(x => x.pressed);
    const cs = { up: b(12) || ay < -.55, down: b(13) || ay > .55, left: b(14) || ax < -.55, right: b(15) || ax > .55, A: b(0), B: b(1), X: b(2), Y: b(3), Start: b(9) };
    if (anyNow && !st.any && S.ready && !S.prompting && info && !info.assigned && !S.skipped.has(info.key)) {   // new controller wakes up: ask who it is
      st.any = true; Object.assign(st.prev, cs); document.body.classList.add('pad');       // swallow this press so it can't also pick a user
      chooseUser(info); continue;
    }
    st.any = anyNow;
    for (const k in cs) {
      if (cs[k]) {
        const isDir = DIRS.includes(k);
        if (!st.prev[k]) { document.body.classList.add('pad'); st.rep[k] = now + (isDir ? 380 : 1e12); onPress(k, info, false); }
        else if (isDir && now > st.rep[k]) { onPress(k, info, true); st.rep[k] = now + 110; }
      }
      st.prev[k] = cs[k];
    }
  }
}
addEventListener('keydown', e => {
  if (bootActive) { bootSkip && bootSkip(); return; }
  const t = cur(); if (!t) return;
  if (t.onKey && t.onKey(e)) { e.preventDefault(); return; }
  const m = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'A', ' ': 'A', Escape: 'B', Backspace: 'B', x: 'X', X: 'X', y: 'Y', Y: 'Y' }[e.key];
  if (m) { e.preventDefault(); fire(m); }
});
addEventListener('mousemove', () => document.body.classList.remove('pad'));
addEventListener('pointerdown', () => { if (bootActive) bootSkip && bootSkip(); if (AC && AC.state === 'suspended') AC.resume(); });

// ---------------------------------------------------------------- helpers
const hue = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const grad = n => { const h = hue(n); return `linear-gradient(150deg,hsl(${h},52%,36%),hsl(${(h + 45) % 360},58%,15%))`; };
const initials = n => (n.match(/[A-Za-z0-9]+/g) || ['?']).slice(0, 2).map(w => w[0]).join('').toUpperCase();
function square(g) {
  const q = el('div', 'sq'); q.style.background = grad(g.name);
  q.append(el('span', 'ini', esc(initials(g.name))));
  const kind = g.art ? 'cover' : g.hero ? 'hero' : '';
  if (kind) { const im = new Image(); im.onerror = () => im.remove(); im.src = artUrl(g, kind); q.append(im); }
  if (g.logo) { const lg = new Image(); lg.className = 'lg'; lg.alt = ''; lg.onerror = () => lg.remove(); lg.src = artUrl(g, 'logo'); q.append(lg); }
  q.append(el('div', 'src', SRC[g.source] || 'App'));
  return q;
}
function playedText(ts) {
  if (!ts) return 'Not played yet';
  const d = Math.floor((Date.now() / 1000 - ts) / 86400);
  return d <= 0 ? 'Played today' : d === 1 ? 'Played yesterday' : `Played ${d} days ago`;
}
let bdFlip = 0, bdZ = 1;
function setBackdrop(g) {
  const layers = [$('#bd0'), $('#bd1')]; bdFlip ^= 1;
  const L = layers[bdFlip], O = layers[bdFlip ^ 1];
  const url = g ? (g.hero ? artUrl(g, 'hero') : g.art ? artUrl(g, 'cover') : '') : '';
  L.style.zIndex = ++bdZ;
  if (url) { L.style.backgroundImage = `url("${url}")`; L.className = 'bdl on' + (g.hero ? '' : ' soft'); }
  else L.className = 'bdl';
  setTimeout(() => { if (O !== L) O.classList.remove('on'); }, 850);
}
function menu(title, items, sub) {
  const wrap = el('div'), m = el('div', 'menu'); m.append(el('h2', '', esc(title))); if (sub) m.append(el('p', 'sub', esc(sub)));
  items.forEach(it => {
    const b = el('div', 'mitem' + (it.danger ? ' danger' : ''), `<b>${esc(it.label)}</b>` + (it.sub ? `<small>${esc(it.sub)}</small>` : ''));
    b.dataset.f = 1; b.onclick = () => it.fn && it.fn(); b.onmouseenter = () => setFocus(b); m.append(b);
  });
  wrap.append(m); play('open');
  push({ el: wrap, modal: true, hints: [['A', 'Select'], ['B', 'Back']], onBack: pop });
}
function busy(msg, sub, onBack) {
  push({ el: el('div', 'busy', `<div class="spin"></div><p>${esc(msg)}</p>` + (sub ? `<small>${esc(sub)}</small>` : '')), modal: true, hints: onBack ? [['B', 'Close']] : [], onBack: onBack || (() => { }) });
}
function avatar(u, big) {
  const a = el('div', big ? 'big' : 'av', esc(u.name[0].toUpperCase())); a.style.setProperty('--c', u.color); return a;
}
function applyProfile(r) { S.users = r.users; S.controllers = r.controllers; S.rev++; refreshAll(); }
async function loadProfile() { const r = await api('/api/profile'); S.settings = Object.assign(S.settings, r.settings); S.magpieFound = r.magpie_found || ''; applyTheme(); applyProfile(r); }
async function saveSetting(patch) { const r = await api('/api/settings', patch); S.settings = r.settings; S.magpieFound = r.magpie_found || ''; applyTheme(); return r; }
const artSig = l => l.map(g => g.id + (g.art ? 'a' : '') + (g.hero ? 'h' : '') + (g.logo ? 'l' : '') + g.cat + g.name).join('|');
function setGames(list) { const same = artSig(list) === artSig(S.games); S.games = list; if (!same) home && home.render(); watchArt(); }
let artTimer = 0, artTries = 0;
function watchArt() {                      // pictures download in the background: pick them up as they arrive
  if (artTimer || !S.settings.art_download) return;
  artTries = 0;
  artTimer = setInterval(async () => {
    artTries++;
    try { const r = await api('/api/library'); if (artSig(r.games) !== artSig(S.games)) { S.games = r.games; home && home.render(); } } catch (e) { }
    if (artTries >= 14 || S.games.every(g => g.art && g.hero && g.logo)) { clearInterval(artTimer); artTimer = 0; }
  }, 2500);
}
async function refreshArt(manual) {
  try { const r = await api('/api/refreshart', {}); if (r.queued) { watchArt(); if (manual) toast('Getting pictures for ' + plural(r.queued, 'game') + '…'); } else if (manual) toast('All your games already have pictures ✓'); } catch (e) { if (manual) toast(e.message, true); }
}

// ---------------------------------------------------------------- home (PS5-style)
let home = null;
function homeScreen() {
  const s = { el: el('div', 'home'), noScroll: true, isHome: true, idx: 0, cat: 'game', hints: [['A', 'Play'], ['X', 'Options'], ['Y', 'Add games'], ['Start', 'Control Center']] };
  const inCat = () => S.games.filter(g => (g.cat || 'game') === s.cat);
  const step = () => innerHeight * 0.155 + innerHeight * 0.02;
  s.render = () => {
    const keep = s.focus && s.focus.dataset && s.focus.dataset.id;
    s.el.innerHTML = '';
    const tabs = el('nav', 'tabs');
    [['games', 'Games'], ['media', 'Media'], ['controllers', 'Controllers'], ['users', 'Users'], ['add', '＋ Add'], ['settings', '⚙']].forEach(([act, label]) => {
      const on = (act === 'games' && s.cat === 'game') || (act === 'media' && s.cat === 'media');
      const t = el('div', 'tab' + (on ? ' on' : '') + (act === 'settings' ? ' gear' : ''), esc(label));
      t.dataset.f = 1; t.dataset.act = act; t.onclick = () => tabAct(act); t.onmouseenter = () => setFocus(t); tabs.append(t);
    });
    const hero = el('section', 'hero', '<div class="gtitle"></div><div class="gmeta"></div><div class="playrow"></div>');
    const rail = el('section', 'rail'), track = el('div', 'track'); rail.append(track);
    inCat().forEach(g => {
      const t = el('div', 'rt'); t.dataset.f = 1; t.dataset.id = g.id;
      t.append(square(g), el('div', 'cap', esc(g.name)));
      t.onclick = () => launch(g.id); t.onmouseenter = () => setFocus(t); track.append(t);
    });
    const add = el('div', 'rt add', `<div class="sq"><span>＋</span></div><div class="cap">${s.cat === 'media' ? 'Add an app' : 'Add games'}</div>`);
    add.dataset.f = 1; add.dataset.id = ''; add.onclick = openAdd; add.onmouseenter = () => setFocus(add); track.append(add);
    s.el.append(tabs, hero, rail); s.track = track;
    const rts = [...s.el.querySelectorAll('.rt')];
    s.initial = rts.find(x => keep && x.dataset.id === keep) || rts[Math.min(s.idx, rts.length - 1)] || rts[0];
    if (cur() === s) setFocus(s.initial);
  };
  s.updateHero = () => {
    const f = s.focus; if (!f || !f.classList.contains('rt')) return;
    const g = inCat().find(x => x.id === f.dataset.id), t = $('.gtitle', s.el), m = $('.gmeta', s.el), p = $('.playrow', s.el);
    t.innerHTML = ''; p.innerHTML = '';
    if (!g) {
      t.textContent = inCat().length ? 'Add games' : s.cat === 'media' ? 'Media' : 'Welcome';
      m.textContent = inCat().length ? 'Scan this PC or browse for any app' : s.cat === 'media' ? 'Add streaming apps like Netflix or YouTube, then move them here with Options' : 'Add your games to get started';
      p.innerHTML = `<div class="play">${hintKey('A')}Add games</div>`;
      return;
    }
    if (g.logo) { const im = new Image(); im.alt = g.name; im.onerror = () => { t.textContent = g.name; }; im.src = artUrl(g, 'logo'); t.append(im); } else t.textContent = g.name;
    m.textContent = (SRC[g.source] || 'App') + '  ·  ' + playedText(g.played);
    p.innerHTML = `<div class="play">${hintKey('A')}Play</div>`;
  };
  s.onFocus = e => {
    if (!e.classList.contains('rt')) return;
    const rts = [...s.el.querySelectorAll('.rt')]; s.idx = Math.max(0, rts.indexOf(e));
    s.track.style.transform = `translateX(${-s.idx * step()}px)`;
    s.updateHero();
    const g = inCat().find(x => x.id === e.dataset.id);
    if (g !== s.lastGame) { s.lastGame = g; setBackdrop(g); }
  };
  s.onNav = (dir, f) => {
    const rts = [...s.el.querySelectorAll('.rt')], tabs = [...s.el.querySelectorAll('.tab')];
    if (f.classList.contains('rt')) {
      const i = rts.indexOf(f);
      if (dir === 'left') { if (i > 0) setFocus(rts[i - 1]); }
      else if (dir === 'right') { if (i < rts.length - 1) setFocus(rts[i + 1]); }
      else if (dir === 'up') setFocus(tabs[0]);
      return true;
    }
    const i = tabs.indexOf(f);
    if (dir === 'left') { if (i > 0) setFocus(tabs[i - 1]); }
    else if (dir === 'right') { if (i < tabs.length - 1) setFocus(tabs[i + 1]); }
    else if (dir === 'down') setFocus(rts[s.idx] || rts[0]);
    return true;
  };
  s.onBack = confirmExit; s.onY = () => openAdd(); s.onStart = () => controlCenter();
  s.setCat = c => { s.cat = c; s.idx = 0; s.lastGame = null; s.focus = null; s.render(); };
  s.onX = f => { if (f && f.dataset.id) gameOptions(f.dataset.id); };
  s.render(); return s;
}
function tabAct(act) {
  if (act === 'games' || act === 'media') {
    const c = act === 'media' ? 'media' : 'game';
    if (home.cat !== c) { home.setCat(c); return; }
    const r = home.el.querySelector('.rt'); r && setFocus(home.el.querySelector(`.rt[data-id="${home.lastGame ? home.lastGame.id : ''}"]`) || r);
  }
  else if (act === 'controllers') controllersScreen();
  else if (act === 'users') usersScreen();
  else if (act === 'add') openAdd();
  else if (act === 'settings') settingsScreen();
}
function confirmExit() {
  menu('Exit launcher?', [{ label: 'Exit launcher', fn: () => { api('/api/exit', {}).catch(() => { }); window.close(); } }, { label: 'Stay', fn: pop }],
       'Your games keep running.');
}
function gameOptions(id) {
  const g = S.games.find(x => x.id === id); if (!g) return;
  menu(g.name, [
    { label: 'Play', fn: () => { pop(); launch(id); } },
    { label: 'Rename', fn: () => { pop(); osk('Rename game', g.name, async n => { setGames((await api('/api/rename', { id, name: n })).games); toast('Renamed ✓'); }); } },
    { label: 'Change picture', sub: 'Choose an image from your PC', fn: () => { pop(); browse('', { image: true, onPick: async path => { try { setGames((await api('/api/setart', { id, path })).games); toast('Picture updated ✓'); pop(); } catch (e) { toast(e.message, true); } } }); } },
    { label: g.cat === 'media' ? 'Move to Games' : 'Move to Media', sub: g.cat === 'media' ? 'Show it in the Games row' : 'For streaming and video apps', fn: async () => { pop(); try { setGames((await api('/api/category', { id, cat: g.cat === 'media' ? 'game' : 'media' })).games); toast('Moved ✓'); } catch (e) { toast(e.message, true); } } },
    { label: 'Remove from library', danger: true, fn: () => { pop(); confirmRemove(g); } },
    { label: 'Cancel', fn: pop }]);
}
function confirmRemove(g) {
  menu(`Remove “${g.name}”?`, [
    { label: 'Yes, remove it', danger: true, fn: async () => { pop(); try { setGames((await api('/api/remove', { id: g.id })).games); toast('Removed ' + g.name); } catch (e) { toast(e.message, true); } } },
    { label: 'No, keep it', fn: pop }], 'This only removes it from this launcher. The game stays installed on your PC.');
}
async function launch(id) {
  const g = S.games.find(x => x.id === id); if (!g) return;
  const e = el('div', 'launch'); e.append(square(g), el('div', 'busy', `<div class="spin"></div><p>Starting ${esc(g.name)}…</p><small>Your controllers work in the game too.</small>`));
  const s = { el: e, modal: true, hints: [['B', 'Close']], onBack: pop }; push(s); play('launch');
  try { const r = await api('/api/launch', { id }); if (r.magpie === 'started') toast('Magpie started for FSR'); else if (r.magpie === 'missing') toast('Magpie (FSR) not found. Set its location in Settings', true); else if (r.magpie === 'failed') toast('Could not start Magpie', true); setTimeout(() => { if (cur() === s) pop(); }, 7000); }
  catch (err) { if (cur() === s) pop(); toast(err.message, true); }
}

// ---------------------------------------------------------------- add games
function openAdd() {
  menu('Add games', [
    { label: 'Scan this PC for games', sub: 'Finds installed Steam, Epic Games and GOG games', fn: () => { pop(); scan(); } },
    { label: 'Browse for an app or game', sub: 'Pick any program (.exe) or shortcut on your PC', fn: () => { pop(); browse(''); } },
    { label: 'Cancel', fn: pop }]);
}
async function scan() {
  busy('Scanning your PC…', 'Looking for Steam, Epic Games and GOG');
  try { const r = await api('/api/scan'); pop(); resultsScreen(r.games); } catch (e) { pop(); toast(e.message, true); }
}
function resultsScreen(list) {
  const sel = new Set();
  const s = { el: el('div', 'results'), hints: [['A', 'Tick / untick'], ['X', 'Select all'], ['Start', 'Add selected'], ['B', 'Back']] };
  s.el.append(el('h1', '', `Found ${plural(list.length, 'new game')} <small>tick the ones you want in your library</small>`));
  const lst = el('div', 'list'), bar = el('div', 'bar');
  const addBtn = el('div', 'btn primary', 'Add selected (0)'), allBtn = el('div', 'btn', 'Select all');
  const upd = () => { addBtn.textContent = `Add selected (${sel.size})`; lst.querySelectorAll('.row').forEach(r => r.classList.toggle('sel', sel.has(r.dataset.id))); };
  list.forEach(g => {
    const r = el('div', 'row', `<div class="chk">✓</div><div>${esc(g.name)}</div><div class="tag">${SRC[g.source] || 'App'}</div>`);
    r.dataset.f = 1; r.dataset.id = g.id; r.onclick = () => { sel.has(g.id) ? sel.delete(g.id) : sel.add(g.id); upd(); }; r.onmouseenter = () => setFocus(r); lst.append(r);
  });
  if (!list.length) lst.append(el('p', 'note', 'Nothing new found. Games from other stores (or portable ones) can be added with “Browse for an app or game”.'));
  const selectAll = () => { list.forEach(g => sel.add(g.id)); upd(); };
  const commit = async () => {
    if (!sel.size) { toast('Tick at least one game first'); return; }
    try { const r = await api('/api/add', { ids: [...sel] }); setGames(r.games); toast(`Added ${plural(r.added, 'game')} ✓`); play('pick'); pop(); } catch (e) { toast(e.message, true); }
  };
  addBtn.dataset.f = 1; allBtn.dataset.f = 1; addBtn.onclick = commit; allBtn.onclick = selectAll;
  addBtn.onmouseenter = () => setFocus(addBtn); allBtn.onmouseenter = () => setFocus(allBtn);
  bar.append(allBtn, addBtn); s.el.append(lst, bar);
  s.onBack = pop; s.onX = selectAll; s.onStart = commit; push(s);
}
function browse(path, opts) {
  opts = opts || {};
  const s = { el: el('div', 'browse'), hints: [['A', opts.image ? 'Open / choose' : 'Open / add'], ['B', 'Up'], ['Start', 'Done']], parent: null };
  s.onStart = pop; s.onBack = () => { if (s.parent === null || s.parent === undefined) pop(); else load(s.parent); };
  async function load(p) {
    let r; try { r = await api('/api/fs?path=' + encodeURIComponent(p) + (opts.image ? '&kind=image' : '')); } catch (e) { toast(e.message, true); return; }
    s.parent = r.parent; s.el.innerHTML = '';
    s.el.append(el('h1', '', opts.image ? 'Choose a picture' : 'Browse <small>pick a program or shortcut to add</small>'), el('div', 'path', esc(r.path || 'This PC')));
    const lst = el('div', 'list');
    if (r.parent !== null) { const u = el('div', 'row', '<div class="ico">⬆</div><div>Up one level</div>'); u.dataset.f = 1; u.onclick = () => load(r.parent); u.onmouseenter = () => setFocus(u); lst.append(u); }
    r.entries.forEach(en => {
      const row = el('div', 'row', `<div class="ico">${en.type === 'dir' ? (en.tag === 'drive' ? '💽' : '📁') : (opts.image ? '🖼' : '🎮')}</div><div>${esc(en.name)}</div><div class="tag">${en.type === 'dir' ? (en.tag || '') : (opts.image ? 'choose' : 'add')}</div>`);
      row.dataset.f = 1; row.onmouseenter = () => setFocus(row);
      row.onclick = async () => {
        if (en.type === 'dir') return load(en.path);
        if (opts.onPick) return opts.onPick(en.path);
        try { const a = await api('/api/add', { path: en.path }); setGames(a.games); toast(a.added ? 'Added ' + en.name.replace(/\.[^.]+$/, '') + ' ✓' : 'Already in your library'); if (a.added) play('pick'); } catch (e) { toast(e.message, true); }
      };
      lst.append(row);
    });
    if (!r.entries.length) lst.append(el('p', 'note', opts.image ? 'No folders or pictures here.' : 'No folders or programs here.'));
    s.el.append(lst); const f = focusables(); setFocus(f[0]); s.el.scrollTop = 0;
  }
  push(s); load(path);
}

// ---------------------------------------------------------------- on-screen keyboard (rename game / user / controller)
function osk(title, initial, onSave) {
  let text = initial || '', upper = true;
  const wrap = el('div'), box = el('div', 'osk'), shown = el('div', 'txt'), keys = el('div', 'keys');
  box.append(el('h2', '', esc(title)), shown, keys); wrap.append(box);
  const refresh = () => { shown.textContent = text; keys.querySelectorAll('[data-ch]').forEach(k => k.textContent = upper ? k.dataset.ch.toUpperCase() : k.dataset.ch.toLowerCase()); };
  const add = c => { if (text.length < 40) text += c; refresh(); };
  const mk = (label, fn, cls, ch) => { const k = el('div', 'key ' + (cls || ''), esc(label)); k.dataset.f = 1; if (ch) k.dataset.ch = ch; k.onclick = fn; k.onmouseenter = () => setFocus(k); return k; };
  ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm-_.:\'&'].forEach(r => { const row = el('div', 'krow'); [...r].forEach(c => row.append(mk(c, () => add(upper ? c.toUpperCase() : c), '', c))); keys.append(row); });
  const del = () => { text = text.slice(0, -1); refresh(); };
  const save = async () => { const n = text.trim(); if (!n) return toast('Type a name first'); try { await onSave(n); pop(); } catch (e) { toast(e.message, true); } };
  const last = el('div', 'krow');
  last.append(mk('Shift', () => { upper = !upper; refresh(); }, 'wide'), mk('Space', () => add(' '), 'wide'), mk('Delete', del, 'wide'), mk('Cancel', pop, 'wide'), mk('Save', save, 'wide'));
  keys.append(last); refresh();
  play('open');
  push({ el: wrap, modal: true, hints: [['A', 'Type'], ['X', 'Space'], ['Y', 'Delete'], ['Start', 'Save'], ['B', 'Cancel']],
    onBack: pop, onStart: save, onX: () => add(' '), onY: del,
    onKey: e => { if (e.key === 'Escape') { pop(); return true; } if (e.key === 'Enter') { save(); return true; } if (e.key === 'Backspace') { del(); return true; } if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) { add(e.key); return true; } return false; } });
}

// ---------------------------------------------------------------- users + controllers
function userCard(u, fn, extra) {
  const c = el('div', 'avc' + (extra || ''));
  c.dataset.f = 1; c.dataset.uid = u.id; c.append(avatar(u, true), el('div', 'nm', esc(u.name)));
  c.onclick = fn; c.onmouseenter = () => setFocus(c); return c;
}
function newUserCard(fn) {
  const c = el('div', 'avc', '<div class="big plus">＋</div><div class="nm">New user</div>');
  c.dataset.f = 1; c.dataset.uid = ''; c.onclick = fn; c.onmouseenter = () => setFocus(c); return c;
}
async function assign(c, uid) {
  try { applyProfile(await api('/api/controller', { key: c.key, user: uid })); const u = userById(uid); play('pick'); toast(`${displayName(c)} is now ${u ? u.name : 'unassigned'}`); } catch (e) { toast(e.message, true); }
}
function createUser(then) {
  osk('New user', '', async name => { const r = await api('/api/user', { action: 'add', name }); applyProfile(r); play('pick'); then && then(r.created); });
}
function suggestUser(c) {
  const taken = new Set(S.pads.filter(x => x !== c && x.user).map(x => x.user.id));
  const slotUser = c.phone ? S.users[(c.phone.slot || 1) - 1] : null;
  return (slotUser && !taken.has(slotUser.id) ? slotUser : S.users.find(u => !taken.has(u.id)) || S.users[0] || {}).id;
}
function chooseUser(c, afterPick) {
  S.prompting = true;
  const wrap = el('div'), box = el('div', 'who'), row = el('div', 'avrow'), sug = suggestUser(c);
  box.append(el('div', '', `<div style="font-size:7vh">${ICON[c.kind]}</div>`), el('h2', '', 'Who’s using this controller?'),
             el('p', 'sub', `${esc(displayName(c))} · ${TYPE[c.kind]}`), row); wrap.append(box);
  let initial = null;
  S.users.forEach(u => { const k = userCard(u, async () => { pop(); await assign(c, u.id); afterPick && afterPick(); }, u.id === sug ? ' sug' : ''); if (u.id === sug) initial = k; row.append(k); });
  row.append(newUserCard(() => { pop(); createUser(uid => assign(c, uid)); }));
  play('open');
  push({ el: wrap, modal: true, initial, hints: [['A', 'Choose'], ['B', 'Not now']],
    onBack: () => { S.skipped.add(c.key); pop(); }, onClose: () => { S.prompting = false; } });
}
function controllersScreen() {
  const s = { el: el('div', 'controllers'), hints: [['A', 'Options'], ['B', 'Back']], onBack: pop };
  s.refresh = () => {
    const keep = s.focus && s.focus.dataset && s.focus.dataset.key, pads = S.pads;
    s.el.innerHTML = '';
    s.el.append(el('h1', '', `Controllers <small>${pads.length ? plural(pads.length, 'controller') + ' connected' : 'none detected'}</small>`));
    s.el.append(el('p', 'note', pads.length
      ? `${esc(kindSummary(pads))}. Every controller can be a different user. Select one to change its user, rename it or find out which is which.`
      : 'Press any button on a controller to wake it up. Xbox, DualSense, DualShock, Switch Pro and most other controllers work: plug them in or pair them with Windows. Phone controllers need the PCStation Gamepad app.'));
    const grid = el('div', 'ccards');
    pads.forEach(c => {
      const card = el('div', 'ccard'); card.dataset.f = 1; card.dataset.key = c.key;
      const a = el('div', 'av' + (c.user ? '' : ' q'), c.user ? esc(c.user.name[0].toUpperCase()) : '?'); if (c.user) a.style.setProperty('--c', c.user.color);
      card.append(a, el('div', 'ci', `<div class="cn">${esc(displayName(c))}</div><div class="cm"><span class="chip">${ICON[c.kind]} ${TYPE[c.kind]}</span>${c.phone ? 'Player slot ' + c.phone.slot : 'Port ' + (c.index + 1)}</div><div class="cu">${c.user ? 'User: <b>' + esc(c.user.name) + '</b>' : '<i>No user chosen yet</i>'}</div>`));
      card.onclick = () => controllerOptions(c); card.onmouseenter = () => setFocus(card); grid.append(card);
    });
    s.el.append(grid);
    if (cur() === s) { const f = focusables(); if (f.length) setFocus(f.find(x => x.dataset.key === keep) || f[0]); }
  };
  s.refresh(); push(s);
}
function controllerOptions(c) {
  menu(displayName(c), [
    { label: 'Change user', sub: c.user ? 'Now: ' + c.user.name : 'No user yet', fn: () => { pop(); chooseUser(c); } },
    { label: 'Rename controller', fn: () => { pop(); osk('Rename controller', displayName(c), async n => { applyProfile(await api('/api/controller', { key: c.key, alias: n })); toast('Renamed ✓'); }); } },
    { label: 'Identify this controller', sub: c.phone ? 'Makes the phone buzz' : 'Makes the controller rumble', fn: () => { pop(); identify(c); } },
    { label: 'Forget this controller', danger: true, sub: 'It will ask who is playing again next time', fn: async () => { pop(); applyProfile(await api('/api/controller', { key: c.key, forget: true })); S.skipped.delete(c.key); toast('Forgotten'); } },
    { label: 'Cancel', fn: pop }], `${TYPE[c.kind]}${c.phone ? ' · ' + (c.phone.name || '') : ''}`);
}
function usersScreen() {
  const s = { el: el('div', 'users'), hints: [['A', 'Options'], ['B', 'Back']], onBack: pop };
  s.refresh = () => {
    const keep = s.focus && s.focus.dataset && s.focus.dataset.uid;
    s.el.innerHTML = '';
    s.el.append(el('h1', '', `Users <small>${plural(S.users.length, 'user')}</small>`),
                el('p', 'note', 'Users are like game accounts. Give each person a name and colour, then pick which user each controller belongs to in Controllers.'));
    const row = el('div', 'avrow');
    S.users.forEach(u => row.append(userCard(u, () => userOptions(u))));
    row.append(newUserCard(() => createUser()));
    s.el.append(row);
    if (cur() === s) { const f = focusables(); if (f.length) setFocus(f.find(x => x.dataset.uid === keep) || f[0]); }
  };
  s.refresh(); push(s);
}
function userOptions(u) {
  menu(u.name, [
    { label: 'Rename', fn: () => { pop(); osk('Rename user', u.name, async n => { applyProfile(await api('/api/user', { action: 'rename', id: u.id, name: n })); toast('Renamed ✓'); }); } },
    { label: 'Change colour', sub: 'Press again to cycle', fn: async () => { const c = COLORS[(COLORS.indexOf(u.color) + 1) % COLORS.length]; applyProfile(await api('/api/user', { action: 'color', id: u.id, color: c })); u = userById(u.id) || u; } },
    { label: 'Delete user', danger: true, sub: S.users.length > 1 ? 'Their controllers become unassigned' : 'You need at least one user', fn: () => { if (S.users.length <= 1) return toast('You need at least one user', true); pop(); confirmDeleteUser(u); } },
    { label: 'Done', fn: pop }]);
}
function confirmDeleteUser(u) {
  menu(`Delete “${u.name}”?`, [
    { label: 'Yes, delete', danger: true, fn: async () => { pop(); applyProfile(await api('/api/user', { action: 'remove', id: u.id })); toast('User deleted'); } },
    { label: 'No, keep', fn: pop }]);
}

// ---------------------------------------------------------------- settings
const cycle = (obj, cur) => { const k = Object.keys(obj), i = k.indexOf(String(cur)); return k[(i + 1) % k.length]; };
function controlCenter() {                  // like the PS5 Control Center: quick access without leaving the home screen
  const tog = (k, label) => ({ label: `${label}: ${S.settings[k] ? 'On' : 'Off'}`, fn: async () => { pop(); try { await saveSetting({ [k]: !S.settings[k] }); toast(`${label} ${S.settings[k] ? 'on' : 'off'}`); } catch (e) { toast(e.message, true); } } });
  menu('Control Center', [
    tog('sound', 'Sound effects'),
    { label: 'Volume: ' + VOL_NAMES[S.settings.volume], fn: async () => { pop(); await saveSetting({ volume: S.settings.volume % 3 + 1 }); play('ok'); toast('Volume ' + VOL_NAMES[S.settings.volume]); } },
    { label: 'Theme: ' + (THEMES[S.settings.theme] || 'Blue'), fn: async () => { pop(); await saveSetting({ theme: cycle(THEMES, S.settings.theme) }); toast('Theme ' + THEMES[S.settings.theme]); } },
    tog('magpie', 'FSR upscaling (Magpie)'),
    { label: 'Controllers', sub: 'Who is playing with which controller', fn: () => { pop(); controllersScreen(); } },
    { label: 'Users', fn: () => { pop(); usersScreen(); } },
    { label: 'Get missing game pictures', fn: () => { pop(); refreshArt(true); } },
    { label: 'All settings', fn: () => { pop(); settingsScreen(); } },
    { label: 'Close', fn: pop }]);
}
function settingsScreen() {
  const s = { el: el('div', 'settings'), hints: [['A', 'Change'], ['B', 'Back']], onBack: pop };
  const T = k => ({ k, val: () => S.settings[k] ? 'On' : 'Off', fn: () => saveSetting({ [k]: !S.settings[k] }) });
  const rows = [
    { sec: 'Sound' },
    Object.assign(T('sound'), { label: 'Sound effects', sub: 'Navigation sounds and the startup chime', after: () => S.settings.sound && play('ok') }),
    { k: 'volume', label: 'Volume', sub: 'How loud the launcher sounds are', val: () => VOL_NAMES[S.settings.volume], fn: () => saveSetting({ volume: S.settings.volume % 3 + 1 }), after: () => play('ok') },
    { sec: 'Appearance' },
    { k: 'theme', label: 'Theme', sub: 'Colour of the home screen background', val: () => THEMES[S.settings.theme] || 'Blue', fn: () => saveSetting({ theme: cycle(THEMES, S.settings.theme) }) },
    Object.assign(T('intro'), { label: 'Startup intro', sub: 'Play the Maxido Entertainment intro when the launcher opens' }),
    { sec: 'Games' },
    Object.assign(T('art_download'), { label: 'Download game pictures and logos', sub: 'Fetches covers, backgrounds and logos from the internet for games that have none on this PC', after: () => S.settings.art_download && refreshArt(true) }),
    { k: 'art_now', label: 'Get missing pictures now', sub: 'Retries every game that has no cover, background or logo', val: () => '', fn: () => refreshArt(true), noRender: true },
    { sec: 'Display' },
    Object.assign(T('magpie'), { label: 'FSR upscaling with Magpie', sub: 'Starts Magpie for you whenever you launch a game. Turn on FSR in Magpie’s profile for the game' }),
    { k: 'magpie_path', label: 'Magpie location', sub: () => S.magpieFound ? S.magpieFound : 'Not found. Install Magpie, then pick Magpie.exe here', val: () => S.magpieFound ? 'Found' : 'Choose…',
      fn: () => { browse('', { onPick: async path => { try { await saveSetting({ magpie_path: path }); toast('Magpie location saved ✓'); pop(); s.render(); } catch (e) { toast(e.message, true); } } }); }, noRender: true },
    { sec: 'System' },
    { k: 'replay', label: 'Replay the startup intro', sub: 'See it again right now', val: () => '', fn: () => { pop(); runBoot(); }, noRender: true },
    { k: 'exit', label: 'Exit launcher', sub: 'Closes the launcher. Your games keep running', val: () => '', fn: () => confirmExit(), noRender: true }];
  s.render = () => {
    const keep = s.focus && s.focus.dataset && s.focus.dataset.k;
    s.el.innerHTML = ''; s.el.append(el('h1', '', 'Settings'));
    const list = el('div', 'list');
    rows.forEach(rw => {
      if (rw.sec) { list.append(el('div', 'sec', esc(rw.sec))); return; }
      const sub = typeof rw.sub === 'function' ? rw.sub() : rw.sub, v = rw.val();
      const r = el('div', 'srow', `<div><b>${esc(rw.label)}</b><small>${esc(sub)}</small></div>` + (v ? `<div class="val">${esc(v)}</div>` : ''));
      r.dataset.f = 1; r.dataset.k = rw.k; r.onmouseenter = () => setFocus(r);
      r.onclick = async () => { try { await rw.fn(); } catch (e) { return toast(e.message, true); } if (!rw.noRender) { s.render(); rw.after && rw.after(); } };
      list.append(r);
    });
    s.el.append(list, el('div', 'about', 'PCStation Launcher · by Maxido Entertainment<br>Works with Xbox, PlayStation, Switch and most other controllers. Games you add are saved on this PC.<br>FSR: in Magpie add a profile for the game (or use its auto-scale), pick an FSR effect, and PCStation will start Magpie for you.'));
    if (cur() === s) { const f = focusables(); setFocus(f.find(x => x.dataset.k === keep) || f[0]); }
  };
  s.render(); push(s);
}

// ---------------------------------------------------------------- startup intro (Maxido Entertainment, then PCStation Launcher)
let bootActive = false, bootSkip = null;
function runBoot() {
  return new Promise(resolve => {
    const b = $('#boot'), cv = $('canvas', b), g = cv.getContext('2d');
    bootActive = true; b.classList.add('on'); b.classList.remove('fade');
    let W = 0, H = 0;
    const size = () => { const d = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight; cv.width = W * d; cv.height = H * d; g.setTransform(d, 0, 0, d, 0, 0); };
    size();
    const rnd = (a, c) => a + Math.random() * (c - a), ease = (a, c, t) => { t = Math.min(1, Math.max(0, (t - a) / (c - a))); return t * t * (3 - 2 * t); };
    const ribbons = Array.from({ length: 9 }, (_, i) => ({ off: (i - 4) * 0.045 + rnd(-0.01, 0.01), amp: rnd(0.07, 0.17), f: rnd(0.0035, 0.0075), sp: rnd(0.5, 1.1) * (i % 2 ? 1 : -1), ph: rnd(0, 6.28), w: rnd(1.2, 2.6), hue: rnd(198, 218), a: rnd(0.45, 0.9) }));
    const dust = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), v: rnd(0.012, 0.05), r: rnd(0.6, 1.9), p: rnd(0, 6.28) }));
    const bm = $('.bm', b), bl = $('.bl', b), nm = $('.bl-name', b), skip = $('.bskip', b);
    [bm, bl, nm, skip].forEach(x => x.classList.remove('show', 'hide'));
    play('boot');
    const t0 = performance.now(); let last = t0, step = 0, done = false;
    const finish = () => { if (done) return; done = true; bootActive = false; b.classList.add('fade'); setTimeout(() => { b.classList.remove('on'); resolve(); }, 900); };
    bootSkip = () => { if (done) return; if (S.settings.sound) { try { audio().silence(1.2); } catch (e) { } } finish(); };
    function frame(now) {
      const t = (now - t0) / 1000, dt = Math.min(0.05, (now - last) / 1000); last = now;
      g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, W, H);
      const intro = ease(0.2, 1.8, t) * (1 - ease(2.6, 3.3, t) * 0.7), calm = 1 - ease(3.3, 4.8, t), energy = 0.25 + 0.75 * calm;
      const bg = g.createRadialGradient(W / 2, H * 0.55, 0, W / 2, H * 0.55, Math.max(W, H) * 0.7);
      bg.addColorStop(0, 'rgba(24,52,104,.5)'); bg.addColorStop(0.5, 'rgba(8,16,36,.3)'); bg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'lighter';
      ribbons.forEach(r => {
        const grd = g.createLinearGradient(0, 0, W, 0), c = `hsla(${r.hue},100%,68%,`, a = r.a * energy * intro * 0.8;
        grd.addColorStop(0, c + '0)'); grd.addColorStop(0.25, c + a + ')'); grd.addColorStop(0.5, 'hsla(200,100%,88%,' + a + ')'); grd.addColorStop(0.75, c + a + ')'); grd.addColorStop(1, c + '0)');
        const amp = r.amp * H * (0.3 + 0.7 * energy) * (0.4 + 0.6 * ease(0, 2, t));
        const path = () => { g.beginPath(); for (let x = -10; x <= W + 10; x += 8) { const y = H * (0.5 + r.off * (0.4 + 0.6 * energy)) + Math.sin(x * r.f + t * r.sp + r.ph) * amp + Math.sin(x * r.f * 2.2 - t * r.sp * 0.7) * amp * 0.3; x < 0 ? g.moveTo(x, y) : g.lineTo(x, y); } };
        g.strokeStyle = grd; g.lineWidth = r.w * 7; g.globalAlpha = 0.14; path(); g.stroke(); g.lineWidth = r.w; g.globalAlpha = 1; path(); g.stroke();
      });
      g.globalAlpha = 1;
      dust.forEach(d => { d.y -= d.v * dt; if (d.y < -0.02) { d.y = 1.02; d.x = Math.random(); } const a = (0.25 + 0.35 * Math.sin(t * 1.6 + d.p)) * ease(0.2, 1.5, t); g.fillStyle = `rgba(190,225,255,${Math.max(0, a)})`; g.beginPath(); g.arc(d.x * W, d.y * H, d.r, 0, 6.283); g.fill(); });
      const f = t - 3.45;
      if (f > -0.15 && f < 1.2) { const k = f < 0 ? (f + 0.15) / 0.15 : 1 - f / 1.2, fl = g.createRadialGradient(W / 2, H * 0.46, 0, W / 2, H * 0.46, Math.max(W, H) * 0.55); fl.addColorStop(0, `rgba(170,215,255,${0.5 * k * k})`); fl.addColorStop(1, 'rgba(170,215,255,0)'); g.fillStyle = fl; g.fillRect(0, 0, W, H); }
      if (step < 1 && t > 0.9) { bm.classList.add('show'); step = 1; }
      if (step < 2 && t > 3.1) { bm.classList.add('hide'); step = 2; }
      if (step < 3 && t > 3.45) { bl.classList.add('show'); step = 3; }
      if (step < 4 && t > 4.25) { nm.classList.add('show'); step = 4; }
      if (t > 6.3) finish();
      if (!done) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    setTimeout(() => skip.classList.add('show'), 1500);
  });
}

// ---------------------------------------------------------------- header + startup
const clock = () => { $('#clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
let nativeSig = null;
async function pollNative() {           // controllers Windows can see even before one is pressed (the browser only lists them after a button press)
  try {
    const r = await api('/api/pads'), prev = S.native; S.native = { xinput: r.xinput || 0, other: r.other || [] };
    const sig = S.native.xinput + '|' + S.native.other.join(',');
    if (sig !== nativeSig) {
      if (nativeSig !== null && S.ready) S.native.other.filter(n => !prev.other.includes(n)).forEach(n => { play('connect'); toast(n + ' detected'); });
      nativeSig = sig; renderCluster();
    }
  } catch (e) { }
}
async function refreshPhones() { try { S.phones = (await api('/api/players')).players; } catch (e) { } }
async function init() {
  clock(); setInterval(clock, 20000);
  try { await Promise.all([loadProfile(), api('/api/library').then(r => { S.games = r.games; }), refreshPhones()]); } catch (e) { toast(e.message, true); }
  setInterval(refreshPhones, 1500); pollNative(); setInterval(pollNative, 3000);
  applyTheme(); home = homeScreen(); push(home);
  if (S.settings.art_download) refreshArt(false);
  requestAnimationFrame(poll);
  if (S.settings.intro) await runBoot();
  S.ready = true; renderCluster();
  if (!S.pads.some(c => c.assigned)) setTimeout(() => toast('Press a button on your controller to choose who is playing'), 600);
}
init();
