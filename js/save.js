// ══════════════════════════════════════════════════
// js/save.js — Persistence, XP, ranks
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
  const newXp   = (s.xp || 0) + amount;
  writeSave({ xp: newXp });
  const after = getXpLevel(newXp);
  if (after > before) { pushToast('⬡ Level up! Now level ' + after, 'xp'); spawnParticles(); }
  return { gained: amount, newXp, newLvl: after };
}

// ── Level badge — fixed circle, never stretches ──
// Tiers: 0 grey · 1 green · 2 teal · 3 blue · 4 purple · 5 gold · 6 orange · 7 red · 8 rainbow
function getLevelBadge(lvl) {
  let tier, label;

  if      (lvl >= 5000) { tier = 8; label = lvl >= 10000 ? '∞'    : Math.round(lvl/1000)+'K'; }
  else if (lvl >= 2000) { tier = 7; label = Math.round(lvl/1000)+'K'; }
  else if (lvl >= 1000) { tier = 7; label = lvl >= 1500 ? '1.5K' : '1K';                       }
  else if (lvl >= 500)  { tier = 6; label = lvl > 999 ? '1K' : lvl;                             }
  else if (lvl >= 200)  { tier = 5; label = lvl;  }
  else if (lvl >= 100)  { tier = 4; label = lvl;  }
  else if (lvl >= 50)   { tier = 3; label = lvl;  }
  else if (lvl >= 25)   { tier = 2; label = lvl;  }
  else if (lvl >= 10)   { tier = 1; label = lvl;  }
  else                  { tier = 0; label = lvl;  }

  // Shrink font for 3-digit numbers so the circle never bulges
  const fs = String(label).length >= 3 ? 'style="font-size:7px"' : '';
  return `<span class="lvl-chip t${tier}" ${fs}>${label}</span>`;
}
