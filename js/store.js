// ══════════════════════════════════════════════════
// js/store.js — Coins, the Store, your boost bag and the free daily chest
//
// Coins are earned by playing (solo wins, dailies, battle placements, level-ups).
// Boosts are no longer sold: Power-ups matches hand them out on the board.
// Boosts bought before that stay in your bag; tap an empty boost slot mid-game to use one.
// The database rules check every purchase costs the right amount and that coins
// can only grow at a humanly possible speed (see tools/build-rules.js).
// ══════════════════════════════════════════════════

const BOOST_PRICES = { hint: 25, dash: 40, stop: 35, shield: 45, frost: 50, fog: 45 };
const COIN_BY_DIFF = { baby: 3, easy: 5, medium: 8, hard: 11, expert: 15 };
const CHEST_MIN = 20, CHEST_MAX = 50;

function getCoins() { return Math.max(0, loadSave().coins || 0); }
function getBag()   { const b = loadSave().boosts || {}; const out = {}; Object.keys(BOOST_PRICES).forEach(k => out[k] = Math.max(0, b[k] | 0)); return out; }
function bagTotal(kinds) { const b = getBag(); return (kinds || Object.keys(b)).reduce((s, k) => s + (b[k] || 0), 0); }

function addCoins(n) {
  if (!n) return getCoins();
  const c = Math.max(0, getCoins() + Math.round(n));
  writeSave({ coins: c });
  updateCoinUI();
  return c;
}
function updateCoinUI() {
  const c = getCoins();
  document.querySelectorAll('.coin-count').forEach(el => {
    const old = parseInt(el.dataset.v || '0');
    el.dataset.v = c; el.textContent = fmtCoins(c);
    if (c > old && el.offsetParent) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  });
}
// 100,000 and up → short form (123K, 1.25M, 3B); below that, normal digits with separators
function fmtCoins(n) {
  n = Number(n) || 0;
  if (Math.abs(n) < 100000) return n.toLocaleString();
  const u = [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']].find(([v]) => Math.abs(n) >= v);
  const x = n / u[0];
  return (Math.abs(x) >= 100 ? Math.floor(x) : Math.floor(x * 100) / 100).toString() + u[1];
}
const coinHtml = n => `<span class="coin-inline">${ic('coin')}${typeof n === 'string' ? escapeHtml(n) : fmtCoins(n)}</span>`;

// ══════════════════════════════════════════════════
// STORE SCREEN
// ══════════════════════════════════════════════════
function openStore() { if (typeof pollGifts === 'function') pollGifts(); show('store'); renderStore(); }

function renderStore() {
  updateCoinUI();
  if (typeof renderCrates === 'function') renderCrates();
  // Daily chest
  const chest = document.getElementById('store-chest');
  const ready = loadSave().chestDay !== todayKey();
  chest.classList.toggle('ready', ready);
  chest.innerHTML = `<div class="chest-ic">${ic(ready ? 'chest' : 'check')}</div>
    <div class="chest-txt"><b>${ready ? 'Daily chest is ready!' : 'Chest opened today'}</b>
    <small>${ready ? `Free ${CHEST_MIN}–${CHEST_MAX} coins, once a day` : 'Next chest in ' + untilTomorrow()}</small></div>
    ${ready ? `<button class="btn primary sm" onclick="claimChest()">${ic('gift')}Open</button>` : ''}`;
}
function untilTomorrow() {
  const now = new Date(), next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const m = Math.ceil((next - now) / 60000);
  return m >= 60 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : m + 'm';
}

function claimChest() {
  if (loadSave().chestDay === todayKey()) return;
  const amt = CHEST_MIN + Math.floor(Math.random() * (CHEST_MAX - CHEST_MIN + 1));
  writeSave({ chestDay: todayKey() });
  addCoins(amt);
  sfx('reward'); spawnParticles(); buzz([20, 40, 20]);
  showReward({ icon: 'chest', tone: 'gold', title: 'Daily chest', sub: 'Come back tomorrow for another', chips: [{ html: coinHtml(amt), label: 'coins' }] });
  syncAccountToCloud().catch(() => {});
  renderStore();
  updateMenuProfile();
}

// ══════════════════════════════════════════════════
// BAG — tap an empty boost slot in a game to use a boost you bought
// ══════════════════════════════════════════════════
function usableKinds() { return Object.keys(BOOST_PRICES); }

function openBag() {
  const el = document.getElementById('bag');
  if (!canPlay()) return;
  const bag = getBag(), kinds = usableKinds();
  const owned = kinds.filter(k => bag[k] > 0);
  el.innerHTML = `<div class="bag-head">${ic('bag')}<b>Your bag</b><button class="icon-btn" onclick="closeBag()">${ic('x')}</button></div>`
    + (owned.length
      ? `<div class="bag-list">${owned.map(k => `<button class="bag-item${ABILITIES[k].attack ? ' attack' : ''}" onclick="useFromBag('${k}')">
          <span class="bag-ic">${ic(ABILITIES[k].icon)}</span><span class="bag-name">${ABILITIES[k].name}</span><span class="bag-n">×${bag[k]}</span></button>`).join('')}</div>`
      : `<div class="bag-empty">No boosts in your bag. Grab the glowing orbs on the board.</div>`);
  el.classList.remove('hidden');
  sfx('tap');
}
function closeBag() { document.getElementById('bag').classList.add('hidden'); }
function useFromBag(kind) {
  const bag = getBag();
  if (!(bag[kind] > 0) || abilityInv.length >= MAX_SLOTS) { closeBag(); return; }
  bag[kind]--; writeSave({ boosts: bag });
  abilityInv.push(kind);
  renderAbilityBar(abilityInv.length - 1);
  closeBag(); sfx('pickup');
  syncAccountToCloud().catch(() => {});
}
document.addEventListener('pointerdown', e => {
  const bag = document.getElementById('bag');
  if (bag && !bag.classList.contains('hidden') && !e.target.closest('#bag') && !e.target.closest('.ab-slot')) closeBag();
});

// ══════════════════════════════════════════════════
// EARNING (called from the game)
// ══════════════════════════════════════════════════
function coinsForWin(diff, speedXp) { return (COIN_BY_DIFF[diff] || 5) + Math.round((speedXp || 0) / 8); }
