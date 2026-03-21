// ══════════════════════════════════════════════════
// js/account.js — Global account system (Firebase Realtime DB via REST)
// ══════════════════════════════════════════════════

const ACC_UID  = 'mazzie_uid';
const ACC_TOK  = 'mazzie_tok';
const ACC_NAME = 'mazzie_uname';

let currentAccount = null;   // full account object once logged in
let accountReady   = false;  // true once init completes

// ── Firebase URL from config ──
function fbUrl() {
  return (window.MAZZIE_CONFIG && window.MAZZIE_CONFIG.firebaseUrl &&
    !window.MAZZIE_CONFIG.firebaseUrl.includes('YOUR-PROJECT'))
    ? window.MAZZIE_CONFIG.firebaseUrl
    : null;
}

// ── REST helpers ──
async function dbGet(path) {
  const base = fbUrl(); if (!base) throw new Error('NO_CONFIG');
  const r = await fetch(base + path + '.json', { cache: 'no-store' });
  if (!r.ok) throw new Error('DB_READ_ERROR');
  return r.json();
}
async function dbPut(path, data) {
  const base = fbUrl(); if (!base) throw new Error('NO_CONFIG');
  const r = await fetch(base + path + '.json', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!r.ok) throw new Error('DB_WRITE_ERROR');
  return r.json();
}
async function dbPatch(path, data) {
  const base = fbUrl(); if (!base) throw new Error('NO_CONFIG');
  const r = await fetch(base + path + '.json', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return r.json();
}
async function dbDelete(path) {
  const base = fbUrl(); if (!base) return;
  await fetch(base + path + '.json', { method: 'DELETE' });
}

// ── Sanitise name for use as a Firebase key ──
function nameKey(name) {
  return name.toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

// ── Generate a fresh UID ──
function genUid() {
  return 'mz_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
}

// ════════════════════════════════════════════════
// CHECK NAME AVAILABLE (globally)
// Returns: 'available' | 'taken' | 'invalid' | 'error'
// ════════════════════════════════════════════════
async function checkNameAvailable(name) {
  const n = name.trim();
  if (!n || n.length < 2 || n.length > 16)     return 'invalid';
  if (!/^[a-zA-Z0-9_ -]+$/.test(n))             return 'invalid';
  const key = nameKey(n);
  if (!key || key.length < 2)                   return 'invalid';
  try {
    const rec = await dbGet('/usernames/' + key);
    return rec === null ? 'available' : 'taken';
  } catch(e) {
    if (e.message === 'NO_CONFIG') return 'available'; // local mode — no global check
    return 'error';
  }
}

// ════════════════════════════════════════════════
// REGISTER
// ════════════════════════════════════════════════
async function registerAccount(name, pin) {
  const n = name.trim();
  if (!n || n.length < 2 || n.length > 16 || !/^[a-zA-Z0-9_ -]+$/.test(n))
    return { error: 'Name must be 2–16 characters (letters, numbers, spaces).' };
  if (!pin || pin.length < 4 || !/^\d+$/.test(pin))
    return { error: 'PIN must be at least 4 digits.' };

  const key = nameKey(n);
  if (!fbUrl()) {
    // Local mode — just save locally, no global uniqueness
    const uid      = genUid();
    const pinHash  = await sha256(pin + uid);
    const account  = buildAccountObj(n, uid, pinHash);
    saveTokenLocally(uid, pinHash, n);
    applyAccountLocally(account);
    return { ok: true, account, offline: true };
  }

  // Check name globally
  const status = await checkNameAvailable(n);
  if (status === 'taken')   return { error: 'That name is already taken. Choose another.' };
  if (status === 'invalid') return { error: 'Name must be 2–16 characters (letters, numbers, spaces).' };
  if (status === 'error')   return { error: 'Could not reach server. Check your internet.' };

  const uid     = genUid();
  const pinHash = await sha256(pin + uid);
  const account = buildAccountObj(n, uid, pinHash);

  // Claim the name (Firebase rule: !data.exists() prevents overwrites)
  try {
    await dbPut('/usernames/' + key, { uid, createdAt: Date.now() });
  } catch(e) {
    return { error: 'That name was just taken. Try another.' };
  }
  // Create account record
  try {
    await dbPut('/accounts/' + uid, account);
  } catch(e) {
    await dbDelete('/usernames/' + key); // rollback
    return { error: 'Account creation failed. Try again.' };
  }

  saveTokenLocally(uid, pinHash, n);
  applyAccountLocally(account);
  return { ok: true, account };
}

// ════════════════════════════════════════════════
// LOGIN
// ════════════════════════════════════════════════
async function loginAccount(name, pin) {
  const n = name.trim();
  if (!fbUrl()) return { error: 'Firebase not configured — cannot sign in online.' };

  const key = nameKey(n);
  let nameRec;
  try { nameRec = await dbGet('/usernames/' + key); }
  catch(e) { return { error: 'Could not reach server. Check your internet.' }; }

  if (!nameRec || !nameRec.uid)
    return { error: 'No account found with that name.' };

  let account;
  try { account = await dbGet('/accounts/' + nameRec.uid); }
  catch(e) { return { error: 'Could not reach server.' }; }
  if (!account) return { error: 'Account data missing. Contact admin.' };

  const pinHash = await sha256(pin + nameRec.uid);
  if (pinHash !== account.pinHash)
    return { error: 'Wrong PIN. Try again.' };

  // Update last seen
  dbPatch('/accounts/' + nameRec.uid, { lastSeen: Date.now() }).catch(() => {});

  saveTokenLocally(nameRec.uid, pinHash, account.name);
  applyAccountLocally(account);
  return { ok: true, account };
}

// ════════════════════════════════════════════════
// AUTO-LOGIN (on app start)
// ════════════════════════════════════════════════
async function tryAutoLogin() {
  const uid  = localStorage.getItem(ACC_UID);
  const tok  = localStorage.getItem(ACC_TOK);
  const name = localStorage.getItem(ACC_NAME);

  if (!uid || !tok) return false;

  if (!fbUrl()) {
    // Local mode — trust the stored token
    if (name) {
      currentAccount = { uid, name, pinHash: tok, local: true, xp: 0, totalCleared: 0 };
      applyAccountLocally(currentAccount);
      return true;
    }
    return false;
  }

  try {
    const account = await dbGet('/accounts/' + uid);
    if (!account || account.pinHash !== tok) {
      clearTokenLocally();
      return false;
    }
    dbPatch('/accounts/' + uid, { lastSeen: Date.now() }).catch(() => {});
    applyAccountLocally(account);
    return true;
  } catch(e) {
    // Offline — allow using cached credentials
    if (name) {
      currentAccount = { uid, name, pinHash: tok, offline: true, xp: 0, totalCleared: 0 };
      applyAccountLocally(currentAccount);
      pushToast('Playing offline — stats will sync later.', 'info');
      return true;
    }
    return false;
  }
}

// ════════════════════════════════════════════════
// RENAME (change username, globally enforced)
// ════════════════════════════════════════════════
async function renameAccount(newName) {
  if (!currentAccount) return { error: 'Not logged in.' };
  const n = newName.trim();
  if (!n || n.length < 2 || n.length > 16 || !/^[a-zA-Z0-9_ -]+$/.test(n))
    return { error: 'Name must be 2–16 characters (letters, numbers, spaces).' };

  const newKey = nameKey(n);
  const oldKey = nameKey(currentAccount.name);

  if (newKey === oldKey) {
    // Same name (maybe different capitalisation) — just update display
    currentAccount.name = n;
    if (fbUrl()) dbPatch('/accounts/' + currentAccount.uid, { name: n }).catch(() => {});
    localStorage.setItem(ACC_NAME, n);
    return { ok: true };
  }

  if (!fbUrl()) {
    // Local mode — just update
    const oldName = currentAccount.name;
    currentAccount.name = n;
    localStorage.setItem(ACC_NAME, n);
    writeSave({ name: n });
    return { ok: true, offline: true };
  }

  const status = await checkNameAvailable(n);
  if (status === 'taken')   return { error: 'That name is already taken.' };
  if (status === 'invalid') return { error: 'Name must be 2–16 chars (letters, numbers, spaces).' };
  if (status === 'error')   return { error: 'Could not reach server.' };

  // Claim new name
  try {
    await dbPut('/usernames/' + newKey, { uid: currentAccount.uid, createdAt: Date.now() });
  } catch(e) {
    return { error: 'That name was just taken. Try another.' };
  }
  // Release old name
  dbDelete('/usernames/' + oldKey).catch(() => {});
  // Update account
  currentAccount.name = n;
  dbPatch('/accounts/' + currentAccount.uid, { name: n }).catch(() => {});
  localStorage.setItem(ACC_NAME, n);
  writeSave({ name: n });
  return { ok: true };
}

// ════════════════════════════════════════════════
// SYNC stats to cloud (call after every win)
// ════════════════════════════════════════════════
async function syncAccountToCloud() {
  if (!currentAccount || currentAccount.local || currentAccount.offline) return;
  const uid = currentAccount.uid;
  if (!uid || !fbUrl()) return;
  const s = loadSave();
  try {
    await dbPatch('/accounts/' + uid, {
      xp:           s.xp || 0,
      totalCleared: s.totalCleared || 0,
      level:        s.level || 1,
      diff:         s.diff || 'easy',
      lastSeen:     Date.now()
    });
  } catch(e) { /* offline — will sync next time */ }
}

// ════════════════════════════════════════════════
// INIT (called on app load)
// ════════════════════════════════════════════════
async function initAccount(onReady) {
  document.getElementById('conn-txt').innerText = 'LOADING…';

  // ── LOCAL MODE: no Firebase URL configured ──
  // Behave exactly like the old version — no auth screen, just load name from localStorage
  if (!fbUrl()) {
    const s    = loadSave();
    const name = s.name || localStorage.getItem(ACC_NAME) || '';
    const uid  = localStorage.getItem(ACC_UID) || genUid();
    localStorage.setItem(ACC_UID, uid);
    currentAccount = { uid, name: name || 'Racer', local: true, xp: s.xp||0, totalCleared: s.totalCleared||0 };
    myName = currentAccount.name;
    myId   = uid;
    accountReady = true;
    hideConnecting();
    if (!name) {
      // First time — show name edit screen like the original game did
      updateMenuProfile();
      show('menu');
      setTimeout(openNameEdit, 400);
    } else {
      onReady(name);
    }
    return;
  }

  // ── FIREBASE MODE ──
  const ok = await tryAutoLogin();
  if (ok) {
    accountReady = true;
    onReady(currentAccount.name);
    return;
  }
  // No saved session — show auth screen
  hideConnecting();
  showAuthScreen();
}

// ── logoutAccount: local mode just clears name and re-opens name edit ──
function logoutAccount() {
  syncAccountToCloud().catch(() => {});
  if (!fbUrl()) {
    // Local mode logout — just clear name, go back to name edit
    currentAccount = null; accountReady = false;
    writeSave({ name: '' });
    myName = 'Racer';
    updateMenuProfile();
    show('menu');
    setTimeout(openNameEdit, 200);
    return;
  }
  clearTokenLocally();
  currentAccount = null; accountReady = false;
  writeSave({ name: '' });
  myName = 'Racer';
  show('auth');
  _renderAuthTab();
}

// ════════════════════════════════════════════════
// AUTH SCREEN CONTROLLER
// ════════════════════════════════════════════════
let _authTab = 'login'; // 'login' | 'register'

function showAuthScreen() {
  _authTab = 'login';
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById('auth').classList.remove('hidden');
  _renderAuthTab();
  setTimeout(() => {
    const f = document.getElementById('auth-name-input');
    if (f) { f.style.touchAction = 'auto'; f.focus(); }
  }, 300);
}

function authSwitchTab(tab) {
  _authTab = tab;
  _renderAuthTab();
}

function _renderAuthTab() {
  const isReg = _authTab === 'register';
  document.getElementById('auth-tab-login').classList.toggle('active',  !isReg);
  document.getElementById('auth-tab-reg').classList.toggle('active',   isReg);
  document.getElementById('auth-heading').innerText     = isReg ? 'Create Account' : 'Welcome Back';
  document.getElementById('auth-sub').innerText         = isReg
    ? 'Pick a unique name and PIN'
    : 'Enter your name and PIN';
  document.getElementById('auth-submit-btn').innerText  = isReg ? 'Create Account →' : 'Sign In →';
  document.getElementById('auth-err').innerText         = '';
  document.getElementById('auth-name-input').value      = '';
  document.getElementById('auth-pin-input').value       = '';
  if (isReg) {
    document.getElementById('auth-name-status').innerText = '';
  }
  const checkRow = document.getElementById('auth-name-check-row');
  if (checkRow) checkRow.style.display = isReg ? 'flex' : 'none';
}

// Live name availability check (register tab only)
let _nameCheckTimeout = null;
async function authCheckName() {
  if (_authTab !== 'register') return;
  const val = document.getElementById('auth-name-input').value.trim();
  const el  = document.getElementById('auth-name-status');
  clearTimeout(_nameCheckTimeout);
  if (!el) return;
  if (val.length < 2) { el.innerText = ''; el.className = 'auth-name-status'; return; }
  el.innerText = '…'; el.className = 'auth-name-status checking';
  _nameCheckTimeout = setTimeout(async () => {
    const status = await checkNameAvailable(val);
    if (document.getElementById('auth-name-input').value.trim() !== val) return; // stale
    if (status === 'available') { el.innerText = '✓ Available'; el.className = 'auth-name-status ok'; }
    else if (status === 'taken') { el.innerText = '✗ Already taken'; el.className = 'auth-name-status bad'; }
    else if (status === 'invalid') { el.innerText = '✗ Invalid name'; el.className = 'auth-name-status bad'; }
    else { el.innerText = '? Could not check'; el.className = 'auth-name-status bad'; }
  }, 550);
}

async function authSubmit() {
  const name = document.getElementById('auth-name-input').value.trim();
  const pin  = document.getElementById('auth-pin-input').value.trim();
  const btn  = document.getElementById('auth-submit-btn');
  const err  = document.getElementById('auth-err');

  err.innerText = '';
  btn.disabled  = true;
  btn.innerText = '…';

  let result;
  if (_authTab === 'register') {
    result = await registerAccount(name, pin);
  } else {
    result = await loginAccount(name, pin);
  }

  btn.disabled = false;
  btn.innerText = _authTab === 'register' ? 'Create Account →' : 'Sign In →';

  if (result.error) {
    err.innerText = result.error;
    return;
  }

  // Success
  accountReady = true;
  const msg = _authTab === 'register' ? 'Account created! Welcome, ' + result.account.name + '!' : 'Welcome back, ' + result.account.name + '!';
  document.getElementById('auth').classList.add('hidden');
  document.getElementById('connecting').classList.remove('hidden');
  document.getElementById('conn-txt').innerText = msg;
  setTimeout(() => {
    hideConnecting();
    myName = currentAccount.name;
    myId   = currentAccount.uid;
    updateMenuProfile();
    _setupContinueBtn();
    show('menu');
  }, 1200);
}

// Allow Enter key on auth inputs
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !document.getElementById('auth').classList.contains('hidden')) {
    e.preventDefault(); authSubmit();
  }
});

// ── Helpers ──
function buildAccountObj(name, uid, pinHash) {
  return {
    uid, name, nameLower: nameKey(name), pinHash,
    xp: 0, totalCleared: 0, level: 1, diff: 'easy',
    createdAt: Date.now(), lastSeen: Date.now()
  };
}
function saveTokenLocally(uid, tok, name) {
  localStorage.setItem(ACC_UID, uid);
  localStorage.setItem(ACC_TOK, tok);
  localStorage.setItem(ACC_NAME, name);
}
function clearTokenLocally() {
  localStorage.removeItem(ACC_UID);
  localStorage.removeItem(ACC_TOK);
  localStorage.removeItem(ACC_NAME);
}
function applyAccountLocally(account) {
  currentAccount = account;
  myName = account.name;
  myId   = account.uid;
  writeSave({
    name:         account.name,
    xp:           account.xp           || 0,
    totalCleared: account.totalCleared || 0,
    level:        account.level        || 1,
    diff:         account.diff         || 'easy'
  });
}
function _setupContinueBtn() {
  const s = loadSave();
  if (s.level && s.level > 1 && s.diff) {
    document.getElementById('continue-btn').classList.remove('hidden');
    document.getElementById('continue-info').innerText = s.diff.toUpperCase() + ' · LVL ' + s.level;
  }
}
