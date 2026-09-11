// ══════════════════════════════════════════════════
// js/cosmetics.js — Avatar icons, colours, frames, path trails, titles + Locker
// Everything unlocks by XP level. Ids are whitelisted before rendering, so
// avatars received from other players can never inject markup.
//
// Add your own art (e.g. AI-generated) without touching code:
//   assets/avatars/manifest.json  →  { "icons":[{ "id":"wizard","name":"Wizard","file":"wizard.png","lvl":8 }],
//                                       "frames":[{ "id":"vines","name":"Vines","file":"vines-frame.png","lvl":20 }] }
// ══════════════════════════════════════════════════

const AVA_ICONS = [
  { id:'init',    lvl:1,  name:'Initials' }, { id:'cat', lvl:1, name:'Cat' },     { id:'dog', lvl:1, name:'Dog' },
  { id:'fox',     lvl:2,  name:'Fox' },      { id:'panda', lvl:3, name:'Panda' }, { id:'frog', lvl:4, name:'Frog' },
  { id:'octopus', lvl:5,  name:'Octo' },     { id:'invader', lvl:6, name:'Invader' }, { id:'robot', lvl:8, name:'Robot' },
  { id:'ghost',   lvl:10, name:'Ghost' },    { id:'unicorn', lvl:12, name:'Unicorn' }, { id:'dragon', lvl:15, name:'Dragon' },
  { id:'skull',   lvl:18, name:'Skull' },    { id:'flame', lvl:20, name:'Flame' }, { id:'bolt', lvl:25, name:'Bolt' },
  { id:'gem',     lvl:30, name:'Gem' },      { id:'rocket', lvl:35, name:'Rocket' }, { id:'moon', lvl:40, name:'Moon' },
  { id:'crown',   lvl:50, name:'Crown' },    { id:'star', lvl:75, name:'Star' }
];
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
const TRAILS = [
  { id:'mint',    lvl:1,  name:'Mint',    rgb:'45,255,127'  },
  { id:'cyan',    lvl:2,  name:'Cyan',    rgb:'77,255,254'  },
  { id:'pink',    lvl:4,  name:'Pink',    rgb:'255,107,157' },
  { id:'gold',    lvl:7,  name:'Gold',    rgb:'255,215,0'   },
  { id:'violet',  lvl:10, name:'Violet',  rgb:'192,132,252' },
  { id:'ember',   lvl:14, name:'Ember',   rgb:'255,122,48'  },
  { id:'ice',     lvl:18, name:'Glacier', rgb:'150,200,255' },
  { id:'rainbow', lvl:25, name:'Rainbow', rgb:'45,255,127', rainbow:true }
];
const TITLES = [
  { id:'none',        lvl:1,   name:'None' },
  { id:'puzzler',     lvl:1,   name:'Puzzler' },
  { id:'speedster',   lvl:5,   name:'Speedster' },
  { id:'pathfinder',  lvl:10,  name:'Pathfinder' },
  { id:'tactician',   lvl:15,  name:'Tactician' },
  { id:'mazelord',    lvl:25,  name:'Maze Lord' },
  { id:'untouchable', lvl:50,  name:'Untouchable' },
  { id:'mythic',      lvl:100, name:'Mythic' }
];
const COSMETIC_SETS = { icon:AVA_ICONS, color:AVA_COLORS, frame:AVA_FRAMES, trail:TRAILS, title:TITLES };
const DEFAULT_AVATAR = { icon:'init', color:'mint', frame:'ring', trail:'mint', title:'puzzler' };

// ── Custom art from assets/avatars/manifest.json ──
const SAFE_FILE = /^[a-zA-Z0-9_\-]+\.(png|webp|jpg|jpeg|svg|gif)$/;
const SAFE_ID   = /^[a-z0-9_\-]{1,32}$/;
let cosmeticsLoaded = Promise.resolve();
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
    out[k] = (v && _find(COSMETIC_SETS[k], v)) ? v : DEFAULT_AVATAR[k];
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

// ── Avatar HTML (size in px) ──
function renderAvatar(av, name, size) {
  const a     = sanitizeAvatar(av);
  const color = _find(AVA_COLORS, a.color);
  const iconI = _find(AVA_ICONS, a.icon);
  const frame = _find(AVA_FRAMES, a.frame);
  let inner;
  if (iconI.src)            inner = `<img class="ava-img" src="${iconI.src}" alt="" draggable="false">`;
  else if (a.icon === 'init') inner = `<span class="ava-init">${escapeHtml(String(name || '?').slice(0, 2).toUpperCase())}</span>`;
  else                      inner = avatarGlyph(a.icon);
  const crown = a.frame === 'crown' ? `<span class="ava-crown">${ic('crown')}</span>` : '';
  const fimg  = frame.src ? `<img class="ava-frame-img" src="${frame.src}" alt="" draggable="false">` : '';
  return `<div class="ava fr-${frame.src ? 'custom' : a.frame}" style="--ava:${size}px">`
    + `<div class="ava-in${color.anim ? ' holo' : ''}" style="background:${color.bg}">${inner}</div>${crown}${fimg}</div>`;
}

// ── Path trail colour → CSS vars on <html> ──
function applyTrail(trailId) {
  const t = _find(TRAILS, trailId) || TRAILS[0];
  const root = document.documentElement;
  root.style.setProperty('--trail-rgb', t.rgb);
  root.classList.toggle('trail-rainbow', !!t.rainbow);
}
function applyMyCosmetics() { applyTrail(getMyAvatar().trail); }

// ══════════════════════════════════════════════════
// LOCKER SCREEN
// ══════════════════════════════════════════════════
let _lockerTab = 'icon';
let _lockerDraft = null;

function openLocker() {
  _lockerDraft = getMyAvatar();
  _lockerTab = 'icon';
  show('locker');
  renderLocker();
}
function lockerTab(tab) { _lockerTab = tab; renderLocker(); }

function renderLocker() {
  const d = _lockerDraft;
  document.getElementById('locker-preview').innerHTML = renderAvatar(d, myName, 92);
  document.getElementById('locker-name').innerText    = myName;
  document.getElementById('locker-title').innerText   = titleName(d) || ' ';
  document.getElementById('locker-lvl').innerHTML     = 'Level ' + myXpLevel() + ' ' + getLevelBadge(myXpLevel());
  document.querySelectorAll('.locker-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === _lockerTab));

  const grid = document.getElementById('locker-grid'); grid.innerHTML = '';
  const set  = COSMETIC_SETS[_lockerTab];
  let unlockedCount = 0;
  set.forEach(item => {
    const open = isUnlocked(item); if (open) unlockedCount++;
    const sel  = d[_lockerTab] === item.id;
    const el   = document.createElement('button');
    el.className = 'locker-item' + (sel ? ' sel' : '') + (open ? '' : ' locked');
    let inner = '';
    if (_lockerTab === 'icon')  inner = renderAvatar({ ...d, icon:item.id, frame:'none' }, myName, 44);
    if (_lockerTab === 'color') inner = renderAvatar({ ...d, color:item.id, frame:'none' }, myName, 44);
    if (_lockerTab === 'frame') inner = renderAvatar({ ...d, frame:item.id }, myName, 40);
    if (_lockerTab === 'trail') inner = `<div class="trail-swatch${item.rainbow ? ' rainbow' : ''}" style="--sw:${item.rgb}"></div>`;
    if (_lockerTab === 'title') inner = `<div class="title-swatch">${escapeHtml(item.name)}</div>`;
    el.innerHTML = inner
      + (_lockerTab !== 'title' ? `<span class="locker-lbl">${escapeHtml(item.name || '')}</span>` : '')
      + (open ? '' : `<span class="locker-lock">${ic('lock')}${item.lvl}</span>`);
    el.onclick = () => {
      if (!open) { pushToast('Unlocks at level ' + item.lvl, 'warn'); sfx('err'); return; }
      _lockerDraft[_lockerTab] = item.id; sfx('step'); buzz(8);
      if (_lockerTab === 'trail') applyTrail(item.id);
      renderLocker();
    };
    grid.appendChild(el);
  });
  document.getElementById('locker-count').innerText = unlockedCount + ' / ' + set.length + ' unlocked';
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
