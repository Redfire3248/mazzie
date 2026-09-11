// ══════════════════════════════════════════════════
// js/cosmetics.js — Avatar icons, colours, frames, path trails, titles + Locker
// Everything unlocks by XP level. Ids are whitelisted before rendering, so
// avatars received from other players can never inject markup.
//
// Add your own art (e.g. AI-generated) without touching code:
//   assets/avatars/manifest.json  →  { "icons":[{ "id":"wizard","name":"Wizard","file":"wizard.png","lvl":8 }],
//                                       "frames":[{ "id":"vines","name":"Vines","file":"vines-frame.png","lvl":20 }] }
// ══════════════════════════════════════════════════

// Initials + every icon in assets/avatars/manifest.json (loaded at start-up)
const AVA_ICONS = [ { id:'init', lvl:1, name:'Initials' } ];
const AVA_COLORS = [
  { id:'mint',     lvl:1,  name:'Mint',     bg:'linear-gradient(135deg,#2dff7f,#00b86b)' },
  { id:'ice',      lvl:1,  name:'Ice',      bg:'linear-gradient(135deg,#4dfffe,#2b7bff)' },
  { id:'rose',     lvl:2,  name:'Rose',     bg:'linear-gradient(135deg,#ff6b9d,#ff4d6a)' },
  { id:'sun',      lvl:3,  name:'Sun',      bg:'linear-gradient(135deg,#ffe04d,#ff9f43)' },
  { id:'grape',    lvl:5,  name:'Grape',    bg:'linear-gradient(135deg,#c084fc,#6d28d9)' },
  { id:'ember',    lvl:8,  name:'Ember',    bg:'linear-gradient(135deg,#ff9f43,#e11d48)' },
  { id:'ocean',    lvl:12, name:'Ocean',    bg:'linear-gradient(135deg,#00b894,#0652dd)' },
  { id:'toxic',    lvl:16, name:'Toxic',    bg:'linear-gradient(135deg,#d4ff00,#00b86b)' },
  { id:'midnight', lvl:22, name:'Midnight', bg:'linear-gradient(135deg,#4b4bc8,#15153a)' },
  { id:'gold',     lvl:30, name:'Gold',     bg:'linear-gradient(135deg,#fff3a0,#ffd700 45%,#b8860b)' },
  { id:'holo',     lvl:45, name:'Holo',     bg:'linear-gradient(135deg,#ff6b9d,#ffe04d,#2dff7f,#4dfffe,#c084fc)', anim:true },
  { id:'void',     lvl:60, name:'Void',     bg:'radial-gradient(circle at 30% 30%,#8b5cf6,#0a0014 72%)' }
];
const AVA_FRAMES = [
  { id:'none',    lvl:1,   name:'None' },    { id:'ring',  lvl:1,  name:'Ring' },   { id:'double', lvl:3,  name:'Double' },
  { id:'dashed',  lvl:6,   name:'Spinner' }, { id:'glow',  lvl:10, name:'Glow' },   { id:'neon',   lvl:15, name:'Neon' },
  { id:'orbit',   lvl:20,  name:'Orbit' },   { id:'goldr', lvl:30, name:'Gold' },   { id:'flame',  lvl:40, name:'Flame' },
  { id:'rainbow', lvl:50,  name:'Rainbow' }, { id:'crown', lvl:75, name:'Crown' },  { id:'cosmic', lvl:100, name:'Cosmic' }
];
// Path trails: a neon tube (glow + body + white core). grad = colours along the path,
// flow = travelling sparks, pulse = breathing glow, zap = electric flicker, sparks = crackle at the head
const RAINBOW = ['#ff4d6a', '#ffd700', '#2dff7f', '#4dfffe', '#b06bff'];
const TRAILS = [
  { id:'mint',     lvl:1,  name:'Mint',      rgb:'45,255,127',  core:'#eafff3' },
  { id:'cyan',     lvl:2,  name:'Cyan',      rgb:'60,225,255',  core:'#effffe' },
  { id:'pink',     lvl:4,  name:'Bubblegum', rgb:'255,95,190',  core:'#fff0f8', pulse:true },
  { id:'gold',     lvl:7,  name:'Gold Rush', rgb:'255,205,40',  core:'#fffbe0', grad:['#fff3a0', '#ffd21a', '#ff9a1a'], flow:true },
  { id:'violet',   lvl:10, name:'Violet',    rgb:'170,110,255', core:'#f3ecff', pulse:true },
  { id:'ember',    lvl:14, name:'Ember',     rgb:'255,122,48',  core:'#fff4d6', grad:['#ffe14d', '#ff7a1a', '#ff2d2d'], flow:true, sparks:true },
  { id:'ice',      lvl:18, name:'Glacier',   rgb:'150,220,255', core:'#ffffff', grad:['#ffffff', '#9fe6ff', '#3aa0ff'] },
  { id:'plasma',   lvl:22, name:'Plasma',    rgb:'255,60,220',  core:'#ffffff', grad:['#ff3cdc', '#7a3cff', '#00e5ff'], flow:true },
  { id:'rainbow',  lvl:25, name:'Rainbow',   rgb:'45,255,127',  core:'#ffffff', grad:RAINBOW, flow:true, spin:true },
  { id:'toxic',    lvl:32, name:'Toxic',     rgb:'124,255,0',   core:'#f4ffe0', grad:['#eaff00', '#7cff00', '#00c96b'], pulse:true, sparks:true },
  { id:'void',     lvl:45, name:'Void',      rgb:'140,80,255',  core:'#e4d6ff', grad:['#4b1fa8', '#8c50ff', '#ff3cdc'], flow:true, sparks:true },
  { id:'electric', lvl:60, name:'Electric',  rgb:'90,200,255',  core:'#ffffff', zap:true, flow:true, sparks:true }
];
// Every title has its own display font (loaded from Google Fonts in index.html)
const TITLES = [
  { id:'none',        lvl:1,   name:'None' },
  { id:'puzzler',     lvl:1,   name:'Puzzler',     font:"'Righteous'",         color:'#7ee8a2' },
  { id:'speedster',   lvl:5,   name:'Speedster',   font:"'Russo One'",         color:'#ffe04d', italic:true },
  { id:'dreamer',     lvl:8,   name:'Dreamer',     font:"'Pacifico'",          color:'#ff9ecf' },
  { id:'pathfinder',  lvl:10,  name:'Pathfinder',  font:"'Orbitron'",          color:'#4dfffe' },
  { id:'tactician',   lvl:15,  name:'Tactician',   font:"'Bungee'",            color:'#ff9f43' },
  { id:'glitch',      lvl:20,  name:'Glitch',      font:"'Press Start 2P'",    color:'#c084fc' },
  { id:'mazelord',    lvl:25,  name:'Maze Lord',   font:"'Cinzel Decorative'", color:'#ffd700' },
  { id:'hustler',     lvl:35,  name:'Hustler',     font:"'Permanent Marker'",  color:'#ff6b9d' },
  { id:'spooky',      lvl:40,  name:'Spooky',      font:"'Creepster'",         color:'#9dff5c' },
  { id:'untouchable', lvl:50,  name:'Untouchable', font:"'Monoton'",           color:'#4dfffe' },
  { id:'mythic',      lvl:100, name:'Mythic',      font:"'Cinzel Decorative'", rainbow:true }
];
const COSMETIC_SETS = { icon:AVA_ICONS, color:AVA_COLORS, frame:AVA_FRAMES, trail:TRAILS, title:TITLES };
const DEFAULT_AVATAR = { icon:'init', color:'mint', frame:'ring', trail:'mint', title:'puzzler' };

// ── Custom art from assets/avatars/manifest.json ──
const SAFE_FILE = /^[a-zA-Z0-9_\-]+\.(png|webp|jpg|jpeg|svg|gif)$/;
const SAFE_ID   = /^[a-z0-9_\-]{1,32}$/;
let cosmeticsLoaded = Promise.resolve(), manifestReady = false;
// Icon ids from the art packs look like "cr-fox"; keep them even before the manifest has loaded
const PACK_ID = /^(cr|my|cy|sn|ar|fe|fr)-[a-z0-9-]{1,28}$/;
function loadCustomCosmetics() {
  cosmeticsLoaded = fetch('assets/avatars/manifest.json', { cache: 'no-cache' })
    .then(r => r.ok ? r.json() : null)
    .then(m => {
      if (!m) return;
      const add = (list, set) => (Array.isArray(list) ? list : []).forEach(x => {
        if (!x || !SAFE_ID.test(x.id) || !SAFE_FILE.test(x.file || '') || set.some(s => s.id === x.id)) return;
        set.push({ id: x.id, name: String(x.name || x.id).slice(0, 14), lvl: Math.max(1, parseInt(x.lvl) || 1), src: 'assets/avatars/' + x.file });
      });
      add(m.icons, AVA_ICONS); add(m.frames, AVA_FRAMES);
      manifestReady = true;
    })
    .catch(() => {});
  return cosmeticsLoaded;
}

function _find(set, id) { return set.find(x => x.id === id); }

// Coerce any (possibly remote or old-emoji) avatar object into known ids only
function sanitizeAvatar(av) {
  const out = {};
  for (const k of Object.keys(DEFAULT_AVATAR)) {
    let v = av && typeof av[k] === 'string' ? av[k] : null;
    if (k === 'icon' && v && LEGACY_AVATAR_IDS[v]) v = LEGACY_AVATAR_IDS[v];
    const known = v && (_find(COSMETIC_SETS[k], v) || (!manifestReady && (k === 'icon' || k === 'frame') && PACK_ID.test(v)));
    out[k] = known ? v : DEFAULT_AVATAR[k];
  }
  return out;
}
function getMyAvatar() { return sanitizeAvatar(loadSave().avatar); }
function isUnlocked(item) { return loadSave().unlockAll || myXpLevel() >= item.lvl; }
function cosmeticsUnlockedAt(fromLvl, toLvl) {
  let n = 0;
  Object.values(COSMETIC_SETS).forEach(set => set.forEach(i => { if (i.lvl >= fromLvl && i.lvl <= toLvl && i.lvl > 1) n++; }));
  return n;
}
function titleName(av) { const t = _find(TITLES, sanitizeAvatar(av).title); return t && t.id !== 'none' ? t.name : ''; }
// Styled title (its own font + colour); '' when the player shows no title
function titleHtml(avOrId) {
  const id = typeof avOrId === 'string' ? avOrId : sanitizeAvatar(avOrId).title;
  const t = _find(TITLES, id);
  if (!t || t.id === 'none') return typeof avOrId === 'string' ? '<span class="ttl ttl-none">None</span>' : '';
  const style = `font-family:${t.font},'Syne',sans-serif;${t.color ? 'color:' + t.color + ';' : ''}${t.italic ? 'font-style:italic;' : ''}`;
  return `<span class="ttl${t.rainbow ? ' ttl-rainbow' : ''}" style="${style}">${escapeHtml(t.name)}</span>`;
}
// Shrink text inside every .fit box until it fits on one line (re-run once web fonts load)
function fitText(root) {
  (root || document).querySelectorAll('.fit').forEach(el => {
    const max = parseFloat(el.dataset.max) || 14, min = parseFloat(el.dataset.min) || 7;
    let size = max; el.style.fontSize = size + 'px';
    while (el.scrollWidth > el.clientWidth + 0.5 && size > min) { size -= 0.5; el.style.fontSize = size + 'px'; }
  });
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => fitText());

// ── Avatar HTML (size in px) ──
function renderAvatar(av, name, size) {
  const a     = sanitizeAvatar(av);
  const color = _find(AVA_COLORS, a.color);
  const iconI = _find(AVA_ICONS, a.icon);
  const frame = _find(AVA_FRAMES, a.frame) || AVA_FRAMES[0];
  const inner = iconI && iconI.src
    ? `<img class="ava-img" src="${iconI.src}" alt="" draggable="false">`
    : `<span class="ava-init">${escapeHtml(String(name || '?').slice(0, 2).toUpperCase())}</span>`;
  const crown = a.frame === 'crown' ? `<span class="ava-crown">${ic('crown')}</span>` : '';
  const fimg  = frame.src ? `<img class="ava-frame-img" src="${frame.src}" alt="" draggable="false">` : '';
  return `<div class="ava fr-${frame.src ? 'custom' : a.frame}" style="--ava:${size}px">`
    + `<div class="ava-in${color.anim ? ' holo' : ''}" style="background:${color.bg}">${inner}</div>${crown}${fimg}</div>`;
}

// ── Path trail colour → CSS vars on <html> ──
let currentTrail = TRAILS[0];
function applyTrail(trailId) {
  const t = _find(TRAILS, trailId) || TRAILS[0];
  currentTrail = t;
  const root = document.documentElement;
  root.style.setProperty('--trail-rgb', t.rgb);
  root.style.setProperty('--trail-core', t.core || '#ffffff');
  ['flow', 'pulse', 'zap', 'sparks', 'spin'].forEach(k => root.classList.toggle('trail-' + k, !!t[k]));
  root.classList.toggle('trail-grad', !!t.grad);
  if (typeof paintTrailGradient === 'function') paintTrailGradient();
}
// Gradient <stop>s for a trail (solid trails get a subtle light→full→deep ramp so the tube looks round)
function trailStops(t) {
  const cols = t.grad || [`rgb(${t.rgb})`, `rgb(${t.rgb})`];
  return cols.map((c, i) => `<stop offset="${(i / (cols.length - 1)).toFixed(2)}" stop-color="${c}"/>`).join('');
}
// Animated mini path for the Locker (uses the same layers as the real board)
let _tpv = 0;
function trailPreviewSvg(t) {
  const id = 'tpv' + (++_tpv), d = 'M8 36 L8 12 L32 12 L32 36 L56 36 L56 12 L72 12';
  const spin = t.spin ? `<animateTransform attributeName="gradientTransform" type="rotate" from="0 40 24" to="360 40 24" dur="3s" repeatCount="indefinite"/>` : '';
  return `<svg class="trail-pv${t.flow ? ' flow' : ''}${t.pulse ? ' pulse' : ''}${t.zap ? ' zap' : ''}" viewBox="0 0 80 48" style="--trail-rgb:${t.rgb};--trail-core:${t.core || '#fff'}">
    <defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="80" y2="48">${trailStops(t)}${spin}</linearGradient></defs>
    <path class="tp-glow" d="${d}" stroke="url(#${id})"/><path class="tp-body" d="${d}" stroke="url(#${id})"/>
    <path class="tp-core" d="${d}"/>${t.flow ? `<path class="tp-flow" d="${d}"/>` : ''}
    <circle class="tp-head" cx="72" cy="12" r="5" fill="url(#${id})"/></svg>`;
}
function applyMyCosmetics() { applyTrail(getMyAvatar().trail); }

// ══════════════════════════════════════════════════
// LOCKER SCREEN
// ══════════════════════════════════════════════════
let _lockerTab = 'icon';
let _lockerDraft = null;
let _lockerQuery = '', _lockerOwned = false;
const PACK_NAMES = { cr:'critters animals', my:'mythic fantasy', cy:'cyber space robot', sn:'snacks food', ar:'arcade items', fe:'frame', fr:'frame' };
function lockerSearch(v) { _lockerQuery = String(v || '').trim().toLowerCase(); renderLocker(); }
function lockerOwnedToggle() { _lockerOwned = !_lockerOwned; renderLocker(); }
function matchesSearch(item, q) {
  if (!q) return true;
  const hay = (item.name + ' ' + item.id + ' ' + (PACK_NAMES[item.id.split('-')[0]] || '')).toLowerCase();
  return q.split(/\s+/).every(w => /^\d+$/.test(w) ? item.lvl <= +w : hay.includes(w));
}

function openLocker() {
  _lockerDraft = getMyAvatar();
  _lockerTab = 'icon'; _lockerQuery = ''; _lockerOwned = false;
  document.getElementById('locker-search').value = '';
  show('locker');
  renderLocker();
}
function lockerTab(tab) { _lockerTab = tab; renderLocker(); }

function renderLocker() {
  const d = _lockerDraft;
  document.getElementById('locker-preview').innerHTML = renderAvatar(d, myName, 92);
  document.getElementById('locker-name').innerText    = myName;
  document.getElementById('locker-title').innerHTML   = titleHtml(d) || '<span class="dim">No title</span>';
  document.getElementById('locker-trail').innerHTML   = trailPreviewSvg(_find(TRAILS, d.trail) || TRAILS[0]);
  document.getElementById('locker-lvl').innerHTML     = 'Level ' + myXpLevel() + ' ' + getLevelBadge(myXpLevel());
  document.querySelectorAll('.locker-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === _lockerTab));

  const grid = document.getElementById('locker-grid'); grid.innerHTML = '';
  const set  = COSMETIC_SETS[_lockerTab];
  let unlockedCount = 0, shown = 0;
  document.getElementById('locker-owned').classList.toggle('on', _lockerOwned);
  set.forEach(item => {
    const open = isUnlocked(item); if (open) unlockedCount++;
    if (!matchesSearch(item, _lockerQuery) || (_lockerOwned && !open)) return;
    shown++;
    const sel  = d[_lockerTab] === item.id;
    const el   = document.createElement('button');
    el.className = 'locker-item' + (sel ? ' sel' : '') + (open ? '' : ' locked');
    let inner = '';
    if (_lockerTab === 'icon')  inner = renderAvatar({ ...d, icon:item.id, frame:'none' }, myName, 44);
    if (_lockerTab === 'color') inner = renderAvatar({ ...d, color:item.id, frame:'none' }, myName, 44);
    if (_lockerTab === 'frame') inner = renderAvatar({ ...d, frame:item.id }, myName, 40);
    if (_lockerTab === 'trail') inner = trailPreviewSvg(item);
    if (_lockerTab === 'title') inner = `<div class="title-swatch fit" data-max="15" data-min="7">${titleHtml(item.id)}</div>`;
    el.innerHTML = inner
      + (_lockerTab !== 'title' ? `<span class="locker-lbl">${escapeHtml(item.name || '')}</span>` : '')
      + (open ? '' : `<span class="locker-lock">${ic('lock')}${item.lvl}</span>`);
    el.onclick = () => {
      if (!open) { pushToast('Unlocks at level ' + item.lvl, 'warn'); sfx('err'); return; }
      _lockerDraft[_lockerTab] = item.id; sfx('tap'); buzz(8);
      if (_lockerTab === 'trail') applyTrail(item.id);
      renderLocker();
    };
    grid.appendChild(el);
  });
  if (!shown) grid.innerHTML = `<div class="search-empty">${ic('search')}Nothing matches "${escapeHtml(_lockerQuery || 'unlocked')}"</div>`;
  document.getElementById('locker-count').innerText = (_lockerQuery || _lockerOwned ? shown + ' shown · ' : '') + unlockedCount + ' / ' + set.length + ' unlocked';
  fitText(document.getElementById('locker'));
}

function saveLocker() {
  writeSave({ avatar: sanitizeAvatar(_lockerDraft) });
  applyMyCosmetics();
  updateMenuProfile();
  syncAccountToCloud().catch(() => {});
  if (isHost && lobbyPlayers[myId]) {
    lobbyPlayers[myId].avatar = getMyAvatar();
    broadcastAll({ type:'lobby_update', players:sanitizePlayers(lobbyPlayers) });
  } else if (hostConn && hostConn.open) {
    hostConn.send({ type:'avatar', avatar:getMyAvatar() });
  }
  pushToast('Look saved', 'acc');
  show('menu');
}
function cancelLocker() { applyMyCosmetics(); show('menu'); }
