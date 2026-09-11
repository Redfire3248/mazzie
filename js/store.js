// ══════════════════════════════════════════════════
// js/store.js — Coins, the Store, your boost bag and the free daily chest
//
// Coins are earned by playing (solo wins, dailies, battle placements, level-ups).
// Boosts bought here go into your bag; tap an empty boost slot mid-game to use one.
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
    el.dataset.v = c; el.textContent = c.toLocaleString();
    if (c > old && el.offsetParent) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  });
}
const coinHtml = n => `<span class="coin-inline">${ic('coin')}${typeof n === 'string' ? escapeHtml(n) : Number(n).toLocaleString()}</span>`;

// ══════════════════════════════════════════════════
// STORE SCREEN
// ══════════════════════════════════════════════════
function openStore() { show('store'); renderStore(); }

function renderStore() {
  updateCoinUI();
  // Daily chest
  const chest = document.getElementById('store-chest');
  const ready = loadSave().chestDay !== todayKey();
  chest.classList.toggle('ready', ready);
  chest.innerHTML = `<div class="chest-ic">${ic(ready ? 'chest' : 'check')}</div>
    <div class="chest-txt"><b>${ready ? 'Daily chest is ready!' : 'Chest opened today'}</b>
    <small>${ready ? `Free ${CHEST_MIN}–${CHEST_MAX} coins, once a day` : 'Next chest in ' + untilTomorrow()}</small></div>
    ${ready ? `<button class="btn primary sm" onclick="claimChest()">${ic('gift')}Open</button>` : ''}`;

  // Boost cards
  const bag = getBag(), coins = getCoins();
  const grid = document.getElementById('store-grid'); grid.innerHTML = '';
  Object.entries(BOOST_PRICES).forEach(([kind, price]) => {
    const a = ABILITIES[kind];
    const can = coins >= price;
    const card = document.createElement('div');
    card.className = 'shop-card' + (a.attack ? ' attack' : '') + (a.battle ? ' battle' : '');
    card.innerHTML = `
      <div class="shop-top"><span class="shop-ic">${ic(a.icon)}</span><span class="shop-owned${bag[kind] ? ' has' : ''}">${ic('bag')}${bag[kind]}</span></div>
      <b class="shop-name">${a.name}</b>
      <small class="shop-desc">${a.desc}</small>
      <span class="shop-tag">${a.battle ? 'Battle only' : 'Solo + battle'}</span>
      <button class="shop-buy${can ? '' : ' poor'}" ${can ? '' : 'aria-disabled="true"'}>${coinHtml(price)}</button>`;
    card.querySelector('.shop-buy').onclick = e => buyBoost(kind, card);
    grid.appendChild(card);
  });
}
function untilTomorrow() {
  const now = new Date(), next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const m = Math.ceil((next - now) / 60000);
  return m >= 60 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : m + 'm';
}

function buyBoost(kind, card) {
  const price = BOOST_PRICES[kind], a = ABILITIES[kind];
  if (getCoins() < price) {
    sfx('err'); buzz(20);
    if (card) { card.classList.remove('nope'); void card.offsetWidth; card.classList.add('nope'); }
    pushToast(`Need ${price - getCoins()} more coins — win levels to earn them`, 'warn', 'coin');
    return;
  }
  const bag = getBag(); bag[kind] = (bag[kind] || 0) + 1;
  writeSave({ coins: getCoins() - price, boosts: bag });
  sfx('buy'); buzz([10, 30, 10]);
  if (card) { card.classList.remove('bought'); void card.offsetWidth; card.classList.add('bought'); }
  showReward({ icon: a.icon, tone: a.attack ? 'cyan' : 'gold', title: a.name + ' bought', sub: `You now have ${bag[kind]} in your bag`,
    chips: [{ html: coinHtml(-price), label: 'spent' }], quick: true });
  syncAccountToCloud().catch(() => {});
  renderStore();
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
function usableKinds() { return Object.keys(BOOST_PRICES).filter(k => battleActive || !ABILITIES[k].battle); }

function openBag() {
  const el = document.getElementById('bag');
  if (!canPlay()) return;
  const bag = getBag(), kinds = usableKinds();
  const owned = kinds.filter(k => bag[k] > 0);
  el.innerHTML = `<div class="bag-head">${ic('bag')}<b>Your bag</b><button class="icon-btn" onclick="closeBag()">${ic('x')}</button></div>`
    + (owned.length
      ? `<div class="bag-list">${owned.map(k => `<button class="bag-item${ABILITIES[k].attack ? ' attack' : ''}" onclick="useFromBag('${k}')">
          <span class="bag-ic">${ic(ABILITIES[k].icon)}</span><span class="bag-name">${ABILITIES[k].name}</span><span class="bag-n">×${bag[k]}</span></button>`).join('')}</div>`
      : `<div class="bag-empty">No boosts yet.${battleActive ? '' : ` <button class="link-btn" onclick="closeBag();gameMenuBtn();setTimeout(openStore,50)">Visit the Store</button>`}</div>`);
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

// Everything newly unlocked between two XP levels (for the level-up reward card)
function unlockedBetween(from, to) {
  const out = [];
  Object.entries(COSMETIC_SETS).forEach(([set, list]) => list.forEach(item => {
    if (item.lvl > from && item.lvl <= to && item.id !== 'none') out.push({ set, item });
  }));
  return out;
}
function unlockChip({ set, item }) {
  const av = getMyAvatar();
  let html;
  if (set === 'icon')  html = renderAvatar({ ...av, icon: item.id, frame: 'none' }, myName, 34);
  if (set === 'color') html = renderAvatar({ ...av, color: item.id, frame: 'none' }, myName, 34);
  if (set === 'frame') html = renderAvatar({ ...av, frame: item.id }, myName, 30);
  if (set === 'trail') html = trailPreviewSvg(item);
  if (set === 'title') html = `<span class="chip-title fit" data-max="12" data-min="7">${titleHtml(item.id)}</span>`;
  return { html, label: item.name };
}
