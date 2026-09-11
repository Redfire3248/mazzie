// ══════════════════════════════════════════════════
// js/save.js — Persistence, XP, ranks, settings, sound
// ══════════════════════════════════════════════════

// ── SHA-256 (for admin PIN) ──
async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}
function getStoredPinHash() {
  return localStorage.getItem('mazzie_pin_hash')
    || (window.MAZZIE_CONFIG && window.MAZZIE_CONFIG.pinHash)
    || null;
}
async function checkPinHash(pin) {
  return (await sha256(pin)) === getStoredPinHash();
}

// ── Save / Load ──
function loadSave()  { try { return JSON.parse(localStorage.getItem('mazzie') || '{}'); } catch(e) { return {}; } }
function writeSave(d){ const s = loadSave(); Object.assign(s, d); localStorage.setItem('mazzie', JSON.stringify(s)); }

// ── Settings (sound, haptics, auto-next) ──
function getSetting(key, def) { const s = loadSave().settings || {}; return key in s ? s[key] : def; }
function setSetting(key, val) { const s = loadSave().settings || {}; s[key] = val; writeSave({ settings: s }); }

// ── Text safety ──
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
// Names that arrive over the network are forced into the same shape accounts allow
function cleanName(n) {
  const s = String(n || '').replace(/[^a-zA-Z0-9_ -]/g, '').trim().slice(0, 16);
  return s.length >= 1 ? s : 'Racer';
}

// ── Ranks ──
const RANKS = [
  { min:0,   name:'Newbie',  icon:'🌱' },
  { min:5,   name:'Rookie',  icon:'⚡' },
  { min:15,  name:'Solver',  icon:'🔥' },
  { min:30,  name:'Pro',     icon:'💎' },
  { min:60,  name:'Master',  icon:'👑' },
  { min:100, name:'Legend',  icon:'🌟' },
  { min:200, name:'Mythic',  icon:'🔮' }
];
const DIFF_XP = { baby:10, easy:20, medium:35, hard:55, expert:80 };

function getRank(cleared) {
  let r = RANKS[0];
  for (const rk of RANKS) if (cleared >= rk.min) r = rk;
  return r;
}
function getXpLevel(xp) { return Math.floor(Math.sqrt(xp / 30)) + 1; }
function myXpLevel()    { return getXpLevel(loadSave().xp || 0); }
function xpProgressInLevel(xp) {
  const lvl  = getXpLevel(xp);
  const need = Math.pow(lvl, 2) * 30;
  const prev = Math.pow(lvl - 1, 2) * 30;
  const current = xp - prev;
  const pct = Math.round((current / (need - prev)) * 100);
  return { lvl, current, need: need - prev, pct };
}
function addXp(amount) {
  const s = loadSave();
  const before  = getXpLevel(s.xp || 0);
  const newXp   = Math.max(0, (s.xp || 0) + amount);
  writeSave({ xp: newXp });
  const after = getXpLevel(newXp);
  if (after > before) {
    pushToast('⬡ Level up! Now level ' + after, 'xp'); spawnParticles(); sfx('level');
    const unlocked = typeof cosmeticsUnlockedAt === 'function' ? cosmeticsUnlockedAt(before + 1, after) : 0;
    if (unlocked > 0) setTimeout(() => pushToast('🎨 ' + unlocked + ' new Locker item' + (unlocked > 1 ? 's' : '') + '!', 'acc'), 900);
  }
  return { gained: amount, newXp, newLvl: after };
}

// ── Best times (solo, per difficulty) ──
function getBest(diff)  { return (loadSave().best || {})[diff] || null; }
function recordBest(diff, ms) {
  const best = loadSave().best || {};
  const isNew = !best[diff] || ms < best[diff];
  if (isNew) { best[diff] = ms; writeSave({ best }); }
  return isNew;
}

// ── Level badge — fixed circle, never stretches ──
// Tiers: 0 grey · 1 green · 2 teal · 3 blue · 4 purple · 5 gold · 6 orange · 7 red · 8 rainbow
function levelTier(lvl) {
  if (lvl >= 5000) return 8;
  if (lvl >= 1000) return 7;
  if (lvl >= 500)  return 6;
  if (lvl >= 200)  return 5;
  if (lvl >= 100)  return 4;
  if (lvl >= 50)   return 3;
  if (lvl >= 25)   return 2;
  if (lvl >= 10)   return 1;
  return 0;
}
function getLevelBadge(lvl) {
  lvl = Math.max(1, parseInt(lvl) || 1);
  const tier = levelTier(lvl);
  let label = lvl;
  if      (lvl >= 10000) label = '∞';
  else if (lvl >= 1000)  label = (lvl >= 1500 && lvl < 2000) ? '1.5K' : Math.floor(lvl / 1000) + 'K';
  // Shrink font for 3-digit numbers so the circle never bulges
  const fs = String(label).length >= 3 ? 'style="font-size:7px"' : '';
  return `<span class="lvl-chip t${tier}" ${fs}>${label}</span>`;
}

// ══════════════════════════════════════════════════
// SOUND + HAPTICS — tiny synthesized blips, no assets
// ══════════════════════════════════════════════════
let _actx = null;
const SFX = {
  step:   [[660, .025, .025, 'triangle']],
  node:   [[880, .06, .07, 'triangle'], [1320, .05, .05, 'sine', .04]],
  back:   [[420, .02, .02, 'triangle']],
  pickup: [[784, .05, .06, 'square'], [1047, .05, .06, 'square', .05], [1568, .08, .05, 'square', .1]],
  ability:[[523, .08, .08, 'sawtooth'], [1046, .1, .06, 'sine', .06]],
  hit:    [[180, .2, .12, 'sawtooth'], [120, .25, .1, 'square', .08]],
  win:    [[523, .12, .08, 'triangle'], [659, .12, .08, 'triangle', .1], [784, .12, .08, 'triangle', .2], [1047, .3, .08, 'triangle', .3]],
  level:  [[440, .1, .07, 'sine'], [880, .2, .07, 'sine', .1]],
  tick:   [[1000, .05, .06, 'square']],
  go:     [[1400, .18, .08, 'square']],
  err:    [[200, .08, .06, 'square']]
};
function sfx(name) {
  if (!getSetting('sound', true)) return;
  const notes = SFX[name]; if (!notes) return;
  try {
    if (!_actx) _actx = new (window.AudioContext || window.webkitAudioContext)();
    if (_actx.state === 'suspended') _actx.resume();
    const t0 = _actx.currentTime;
    notes.forEach(([freq, dur, vol, type, delay]) => {
      const o = _actx.createOscillator(), g = _actx.createGain();
      o.type = type || 'sine'; o.frequency.value = freq;
      const st = t0 + (delay || 0);
      g.gain.setValueAtTime(0, st);
      g.gain.linearRampToValueAtTime(vol, st + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, st + dur);
      o.connect(g); g.connect(_actx.destination);
      o.start(st); o.stop(st + dur + 0.02);
    });
  } catch (e) {}
}
function buzz(ms) {
  if (!getSetting('haptics', true)) return;
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {}
}
