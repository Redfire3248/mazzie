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
  { min:0,   name:'Newbie',  icon:'seed',  color:'#7ee8a2' },
  { min:5,   name:'Rookie',  icon:'bolt',  color:'#ffe04d' },
  { min:15,  name:'Solver',  icon:'flame', color:'#ff9f43' },
  { min:30,  name:'Pro',     icon:'gem',   color:'#4dfffe' },
  { min:60,  name:'Master',  icon:'crown', color:'#ffd700' },
  { min:100, name:'Legend',  icon:'star',  color:'#ff6b9d' },
  { min:200, name:'Mythic',  icon:'orb',   color:'#c084fc' }
];
function rankIcon(rank) { return `<span class="rank-ic" style="color:${rank.color}">${ic(rank.icon)}</span>`; }
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
    spawnParticles(); sfx('level');
    const bonus = 15 * (after - before);
    if (typeof addCoins === 'function') addCoins(bonus);
    // Nothing is "new" when everything is already unlocked (admin unlock-all)
    const unlocks = typeof unlockedBetween === 'function' && !loadSave().unlockAll ? unlockedBetween(before, after) : [];
    const chips = [{ html: coinHtml(bonus), label: 'bonus' }, ...unlocks.map(unlockChip)];
    showReward({ iconHtml: getLevelBadge(after), tone: 'xp', kicker: 'Level up', title: 'Level ' + after,
      sub: unlocks.length ? unlocks.length + ' new Locker item' + (unlocks.length > 1 ? 's' : '') + ' unlocked' : getRank(loadSave().totalCleared || 0).name + ' rank', chips });
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
let _actx = null, _bus = null;
function audioBus() {
  if (!_actx) {
    _actx = new (window.AudioContext || window.webkitAudioContext)();
    // soft compressor → speakers: stacked notes stay smooth instead of clipping
    const comp = _actx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 4; comp.release.value = 0.15;
    _bus = _actx.createGain(); _bus.gain.value = 0.9;
    _bus.connect(comp); comp.connect(_actx.destination);
  }
  if (_actx.state === 'suspended') _actx.resume();
  return _bus;
}
// One synth voice: f = start freq, to = end freq (pitch glide), d = decay seconds
function tone({ f, to, d = 0.12, v = 0.08, type = 'sine', at = 0, attack = 0.004 }) {
  const bus = audioBus(), t = _actx.currentTime + at;
  const o = _actx.createOscillator(), g = _actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + Math.min(d, 0.08));
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g); g.connect(bus);
  o.start(t); o.stop(t + d + 0.03);
}
// Major pentatonic from C5 — every step sounds "right", whatever order you play them in
const PENTA = [0, 2, 4, 7, 9];
function scaleFreq(n) { const o = Math.floor(n / 5), s = PENTA[((n % 5) + 5) % 5]; return 523.25 * Math.pow(2, (12 * o + s) / 12); }
function pluck(f, v = 0.085) {
  tone({ f: f * 1.03, to: f, d: 0.16, v, type: 'triangle' });   // body
  tone({ f: f * 2, d: 0.07, v: v * 0.35, type: 'sine' });        // shimmer
  tone({ f: f * 4, d: 0.025, v: v * 0.18, type: 'square' });     // click of the "tap"
}
const SFX = {
  node:   () => { const f = 783.99; tone({ f, d: 0.45, v: 0.07 }); tone({ f: f * 1.5, d: 0.35, v: 0.045, at: 0.03 }); tone({ f: f * 2.01, d: 0.5, v: 0.035, at: 0.05 }); tone({ f: f * 3, d: 0.2, v: 0.02, type: 'triangle', at: 0.06 }); },
  tap:    () => pluck(1046.5, 0.05),
  back:   () => tone({ f: 330, to: 262, d: 0.08, v: 0.05, type: 'triangle' }),
  pickup: () => [5, 7, 9, 12].forEach((n, i) => { tone({ f: scaleFreq(n), d: 0.2, v: 0.055, type: 'triangle', at: i * 0.05 }); tone({ f: scaleFreq(n) * 2, d: 0.08, v: 0.02, type: 'square', at: i * 0.05 }); }),
  coin:   () => { tone({ f: 987.77, d: 0.08, v: 0.07, type: 'square' }); tone({ f: 1318.5, d: 0.35, v: 0.07, type: 'square', at: 0.075 }); },
  buy:    () => { SFX.coin(); [0, 4, 7, 12].forEach((s, i) => tone({ f: 659.25 * Math.pow(2, s / 12), d: 0.22, v: 0.05, type: 'triangle', at: 0.18 + i * 0.06 })); },
  reward: () => [0, 4, 7, 11, 14].forEach((s, i) => tone({ f: 523.25 * Math.pow(2, s / 12), d: 0.4, v: 0.055, type: 'sine', at: i * 0.07 })),
  ability:() => { tone({ f: 440, to: 1320, d: 0.22, v: 0.06, type: 'sawtooth' }); tone({ f: 1760, d: 0.25, v: 0.03, at: 0.12 }); },
  hit:    () => { tone({ f: 220, to: 70, d: 0.35, v: 0.12, type: 'sawtooth' }); tone({ f: 110, d: 0.3, v: 0.08, type: 'square', at: 0.05 }); },
  win:    () => [0, 4, 7, 12, 16, 19].forEach((s, i) => { tone({ f: 523.25 * Math.pow(2, s / 12), d: i === 5 ? 0.9 : 0.25, v: 0.06, type: 'triangle', at: i * 0.075 }); }),
  level:  () => [0, 7, 12, 16].forEach((s, i) => tone({ f: 440 * Math.pow(2, s / 12), d: 0.5, v: 0.06, at: i * 0.09 })),
  tick:   () => tone({ f: 880, d: 0.09, v: 0.07, type: 'square' }),
  go:     () => { tone({ f: 1318.5, d: 0.3, v: 0.08, type: 'square' }); tone({ f: 1760, d: 0.35, v: 0.05, at: 0.05 }); },
  err:    () => tone({ f: 160, to: 110, d: 0.12, v: 0.07, type: 'square' }),
  honk:   () => { tone({ f: 330, d: 0.25, v: 0.12, type: 'sawtooth' }); tone({ f: 277, d: 0.35, v: 0.12, type: 'sawtooth', at: 0.28 }); },
  world:  () => [0, 5, 9, 12].forEach((s, i) => tone({ f: 392 * Math.pow(2, s / 12), d: 0.45, v: 0.06, type: 'triangle', at: i * 0.11 }))
};
function sfx(name) {
  if (!getSetting('sound', true) || !SFX[name]) return;
  try { SFX[name](); } catch (e) {}
}
// Each new box in your path plays the next note up the scale (wraps after two octaves)
function sfxStep(n) {
  if (!getSetting('sound', true)) return;
  try { pluck(scaleFreq(((n - 1) % 11) - 1)); } catch (e) {}
}
function buzz(ms) {
  if (!getSetting('haptics', true)) return;
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {}
}
