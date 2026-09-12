// ══════════════════════════════════════════════════
// js/account.js — Accounts
//
// Three modes (picked from config.js):
//   secure — Firebase Authentication + locked-down database rules (database.rules.json).
//            PIN sign-in, Google sign-in / linking, Forgot PIN, 5-try lock, bans, admin.
//   legacy — old PIN-hash-in-database system (only until firebaseConfig.apiKey is set).
//   local  — no Firebase at all: offline guest profile.
// ══════════════════════════════════════════════════

const ACC_UID  = 'mazzie_uid';
const ACC_TOK  = 'mazzie_tok';
const ACC_NAME = 'mazzie_uname';
const LOCK_MS = 15 * 60 * 1000, MAX_TRIES = 5;
const PIN_RE  = /^\d{4,12}$/;
const NAME_ERR = 'Name must be 2–16 characters (letters, numbers, spaces).';

let currentAccount = null;   // { id, name, nameLower, xp, … }
let accountReady   = false;
let _authUser      = null;   // firebase.User (secure mode)

const CFG = () => window.MAZZIE_CONFIG || {};
function fbUrl() {
  const u = CFG().firebaseUrl;
  return u && !u.includes('YOUR-PROJECT') ? u.replace(/\/$/, '') : null;
}
function fbCfg()   { const c = CFG().firebaseConfig; return c && c.apiKey ? c : null; }
function authMode(){ return !fbUrl() ? 'local' : fbCfg() ? 'secure' : 'legacy'; }

// ── REST (adds the signed-in user's ID token so database rules can check it) ──
// Signed out of a secure database? Every call would come back 401, so don't make it.
// (That flood of 401s was also what stopped friends' profiles from ever loading.)
let _signedOut = false, _deniedRow = 0;
// A path the rules refuse stays refused until the rules change — stop asking for a while
// instead of firing the same doomed request every few seconds (that was the 401 flood).
const _denyUntil = {}, DENY_COOLDOWN_MS = 5 * 60000;
const denyKey = p => '/' + String(p || '').split('/')[1];
let _rulesWarned = false;
// Checking what is wrong, or a refresh the player asked for, must never be throttled
function clearDenyCache() { Object.keys(_denyUntil).forEach(k => delete _denyUntil[k]); _rulesWarned = false; }
function warnStaleRules(path) {
  if (_rulesWarned) return;
  _rulesWarned = true;
  dbLog('warn', 'the database refused ' + path + ' even though you are signed in. '
    + 'Your published rules are older than this version of the game. '
    + 'Fix: Firebase console -> Realtime Database -> Rules -> paste database.rules.json from the repo -> Publish.');
}
const isMyPath = p => !!(currentAccount && currentAccount.id && new RegExp('^/(accounts|profiles|online)/' + currentAccount.id + '(/|$)').test(p));
// Connection trouble is admin information, not something to interrupt play with.
// It goes to the console and the admin terminal; players just see stale data quietly.
function dbLog(kind, msg) {
  console[kind === 'warn' ? 'warn' : 'log']('MAZZIE: ' + msg);
  if (typeof adminLog === 'function') adminLog(kind, msg);
}
function markSignedOut() {
  if (_signedOut) return;
  _signedOut = true;
  dbLog('warn', 'signed out — the database refused your own data; sign in again to sync');
  if (typeof stopLive === 'function') stopLive();
}
async function dbUrl(path, force) {
  const qs = [];
  if (CFG().dbNamespace) qs.push('ns=' + encodeURIComponent(CFG().dbNamespace));
  if (_authUser) qs.push('auth=' + encodeURIComponent(await _authUser.getIdToken(!!force)));
  else if (authMode() === 'secure' && currentAccount && !currentAccount.offline) { markSignedOut(); throw new Error('NO_AUTH'); }
  return fbUrl() + path + '.json' + (qs.length ? '?' + qs.join('&') : '');
}
// The live streams hold connections open, so a request can sit in the browser's queue for ever.
// Every call gets a deadline: better to fail and retry on the next pass than to hang the screen.
const DB_TIMEOUT_MS = 9000;
async function dbReq(method, path, data, retried) {
  if (!fbUrl()) throw new Error('NO_CONFIG');
  const isMine = isMyPath(path);
  // Your own data is always retried: that is how a genuinely lost session gets noticed.
  if (!isMine && Date.now() < (_denyUntil[denyKey(path)] || 0)) throw new Error('DENIED');   // still in the doghouse
  let r;
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = ctl ? setTimeout(() => ctl.abort(), DB_TIMEOUT_MS) : null;
  try {
    r = await fetch(await dbUrl(path, retried), { method, cache: 'no-store', headers: { 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data), signal: ctl ? ctl.signal : undefined });
  } catch (e) {
    if (e && e.message === 'NO_AUTH') throw e;                       // not a network problem: we are signed out
    throw new Error(e && e.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK');
  }
  finally { if (t) clearTimeout(t); }
  if (r.status === 401 || r.status === 403) {
    // A stale ID token looks like this too, but only for your OWN data — for anything else
    // a refusal is the rules talking, and a fresh token will not change their mind.
    if (!retried && _authUser && isMine) return dbReq(method, path, data, true);
    if (_authUser) { _denyUntil[denyKey(path)] = Date.now() + DENY_COOLDOWN_MS; warnStaleRules(path); }
    // Only a REFUSED READ OF YOUR OWN DATA means the session is gone. A refused WRITE is
    // usually the anti-cheat turning down a jump in xp or coins — treating that as a
    // sign-out made the app flip between "Signed out" and "Back online" for ever.
    if (isMine && method === 'GET' && ++_deniedRow >= 3) markSignedOut();
    throw new Error('DENIED');
  }
  if (isMine && method === 'GET') {
    _deniedRow = 0;
    // Reading your own data again? Whatever went wrong has passed — come back to life.
    if (_signedOut) { _signedOut = false; dbLog('ok', 'back online — the database is answering again'); if (typeof startLive === 'function') startLive(); }
  }
  if (!r.ok) throw new Error('DB_' + r.status);
  return r.json();
}
const dbGet    = p => dbReq('GET', p);
const dbPut    = (p, d) => dbReq('PUT', p, d);
const dbPatch  = (p, d) => dbReq('PATCH', p, d);
const dbDelete = p => dbReq('DELETE', p);
const SERVER_TIME = { '.sv': 'timestamp' };

// ── Small helpers ──
function nameKey(name) { return String(name || '').toLowerCase().replace(/[^a-z0-9_-]/g, ''); }
function validName(n)  { return n && n.length >= 2 && n.length <= 16 && /^[a-zA-Z0-9_ -]+$/.test(n) && nameKey(n).length >= 2; }
function randStr(n, alphabet) {
  const a = alphabet || 'abcdefghijkmnpqrstuvwxyz23456789';
  return [...crypto.getRandomValues(new Uint8Array(n))].map(x => a[x % a.length]).join('');
}
function genUid()          { return 'mz_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9); }
const newAccId        = () => 'ma_' + randStr(14);
const newPlayerEmail  = () => 'p.' + randStr(14) + '@players.mazzie.game';   // never shown; PIN logins map name → this
const pinPass         = pin => 'mz-pin:' + pin;                               // Firebase needs ≥6 chars
function newRecoveryCode() { const s = randStr(12, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'); return s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8); }
const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^(.{4})(.{4})(.{4})$/, '$1-$2-$3');
function fmtWait(ms) { const s = Math.ceil(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function isNet(e) { return e && (e.message === 'NETWORK' || e.code === 'auth/network-request-failed'); }

// ══════════════════════════════════════════════════
// FIREBASE SDK (loaded only in secure mode)
// ══════════════════════════════════════════════════
// Modular SDK: Google's popup iframe is only loaded when someone taps a Google button
const FB = {};           // firebase/auth functions + the app/auth instances
let _fbReady = null;
function initFirebase() {
  if (_fbReady) return _fbReady;
  _fbReady = (async () => {
    const V = '10.12.5';
    const [appMod, authMod] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`)
    ]);
    Object.assign(FB, authMod);
    FB.appMod = appMod;
    const app = appMod.getApps().find(a => a.name === '[DEFAULT]') || appMod.initializeApp(fbCfg());
    FB.auth = authMod.initializeAuth(app, { persistence: [authMod.indexedDBLocalPersistence, authMod.browserLocalPersistence] });
    if (CFG().emulator && CFG().emulator.auth) authMod.connectAuthEmulator(FB.auth, CFG().emulator.auth, { disableWarnings: true });
    // Firebase refreshes (or drops) the session on its own — follow it instead of holding a stale user
    authMod.onAuthStateChanged(FB.auth, u => {
      if (u) { _authUser = u; if (_signedOut) { _signedOut = false; dbLog('ok', 'signed back in'); if (typeof startLive === 'function') startLive(); } }
      else if (_authUser) { _authUser = null; markSignedOut(); }
    });
    return FB.auth;
  })();
  _fbReady.catch(() => { _fbReady = null; });
  return _fbReady;
}
function fbUser()    { return FB.auth ? FB.auth.currentUser : null; }
function fbSignOut() { _authUser = null; return FB.auth ? FB.signOut(FB.auth).catch(() => {}) : Promise.resolve(); }
function waitAuthState(auth) { return new Promise(res => { const off = FB.onAuthStateChanged(auth, u => { off(); res(u); }); }); }
function googleProvider() { const p = new FB.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' }); return p; }
function authErr(e) {
  const c = (e && e.code) || '';
  if (c === 'auth/network-request-failed') return 'Could not reach the server. Check your internet.';
  if (c === 'auth/too-many-requests')      return 'Too many attempts from this device — wait a few minutes.';
  if (c === 'auth/popup-blocked')          return 'Your browser blocked the Google window. Allow pop-ups and try again.';
  if (c === 'auth/unauthorized-domain')    return 'Google sign-in is not enabled for this website yet (admin: add the domain in Firebase).';
  if (c === 'auth/operation-not-allowed')  return 'This sign-in method is not switched on in Firebase yet.';
  if (c === 'auth/credential-already-in-use' || c === 'auth/email-already-in-use') return 'That Google account already belongs to another player.';
  if (c === 'auth/requires-recent-login')  return 'For safety, sign out and back in, then try again.';
  return (e && e.message) || 'Something went wrong.';
}
const hasProvider = (u, id) => !!(u && u.providerData.some(p => p.providerId === id));

// ══════════════════════════════════════════════════
// LOCKS (5 wrong PINs → 15 minutes) + BANS — enforced by database rules
// ══════════════════════════════════════════════════
async function readLock(key)  { try { return await dbGet('/locks/' + key); } catch (e) { return null; } }
function lockLeft(lock)       { return lock && lock.lockedAt ? Math.max(0, lock.lockedAt + LOCK_MS - Date.now()) : 0; }
async function readBan(acc)   { try { const b = await dbGet('/bans/' + acc); return b && b.until > Date.now() ? b : null; } catch (e) { return null; } }
async function recordFailure(key) {
  const lock = (await readLock(key)) || { fails: 0, lockedAt: 0 };
  if (lockLeft(lock)) return { locked: lockLeft(lock) };
  const fails = (lock.fails || 0) + 1;
  if (fails >= MAX_TRIES) {
    await dbPut('/locks/' + key, { fails: 0, lockedAt: SERVER_TIME }).catch(() => {});
    return { locked: lockLeft(await readLock(key)) || LOCK_MS };
  }
  await dbPut('/locks/' + key, { fails, lockedAt: lock.lockedAt || 0 }).catch(() => {});
  return { left: MAX_TRIES - fails };
}
async function clearFailures(key) {
  const lock = await readLock(key);
  if (lock && lock.fails) await dbPut('/locks/' + key, { fails: 0, lockedAt: lock.lockedAt || 0 }).catch(() => {});
}
async function failureResult(key, what) {
  const r = await recordFailure(key);
  if (r.locked) return { locked: r.locked };
  return { error: `Wrong ${what} — ${r.left} ${r.left === 1 ? 'try' : 'tries'} left before a 15 minute lock.` };
}

// ══════════════════════════════════════════════════
// NAME AVAILABILITY
// ══════════════════════════════════════════════════
async function checkNameAvailable(name) {
  const n = String(name || '').trim();
  if (!validName(n)) return 'invalid';
  try { return (await dbGet('/usernames/' + nameKey(n))) === null ? 'available' : 'taken'; }
  catch (e) { return e.message === 'NO_CONFIG' ? 'available' : 'error'; }
}

// ══════════════════════════════════════════════════
// SECURE MODE — sign in / register / Google / recovery
// ══════════════════════════════════════════════════
async function secureSignInPin(name, pin) {
  const key = nameKey(name.trim());
  if (!key) return { error: 'Enter your username.' };
  if (!PIN_RE.test(pin)) return { error: 'PIN must be 4–12 digits.' };
  let auth, rec;
  try { auth = await initFirebase(); } catch (e) { return { error: 'Could not load sign-in. Check your internet.' }; }
  try { rec = await dbGet('/usernames/' + key); } catch (e) { return { error: 'Could not reach the server. Check your internet.' }; }
  if (!rec) return { error: 'No account found with that name.' };
  const lock = await readLock(key);
  if (lockLeft(lock)) return { locked: lockLeft(lock) };

  if (!rec.acc && rec.uid) return migrateLegacy(auth, key, rec, pin);
  if (!rec.email) return { error: 'This account uses Google sign-in. Tap "Continue with Google".' };
  try { await FB.signInWithEmailAndPassword(auth, rec.email, pinPass(pin)); }
  catch (e) {
    if (['auth/wrong-password', 'auth/invalid-credential', 'auth/invalid-login-credentials', 'auth/user-not-found'].includes(e.code))
      return failureResult(key, 'PIN');
    return { error: authErr(e) };
  }
  return loadSignedInAccount(key);
}

// Old accounts (PIN hash stored in the database) are upgraded on their first sign-in
async function migrateLegacy(auth, key, rec, pin) {
  let legacy;
  try { legacy = await dbGet('/accounts/' + rec.uid); } catch (e) { return { error: 'Could not reach the server.' }; }
  if (!legacy || legacy.owner) return { error: 'Account data missing — ask an admin.' };
  if ((await sha256(pin + rec.uid)) !== legacy.pinHash) return failureResult(key, 'PIN');
  const ban = await readBan(rec.uid);           // banned players see the ban, not a half-finished upgrade
  if (ban) return { banned: ban };
  try {
    const email = newPlayerEmail();
    const cred = await FB.createUserWithEmailAndPassword(auth, email, pinPass(pin));
    _authUser = cred.user;
    await dbPatch('/accounts/' + rec.uid, { owner: cred.user.uid, legacyProof: legacy.pinHash });
    await dbPut('/owners/' + cred.user.uid, rec.uid);
    await dbPut('/usernames/' + key, { acc: rec.uid, email, createdAt: rec.createdAt || Date.now() });
    await dbPatch('/accounts/' + rec.uid, { pinHash: null, legacyProof: null });
    const code = newRecoveryCode();
    await dbPut('/recovery/' + rec.uid, { code });
    const r = await loadSignedInAccount(key);
    return { ...r, recoveryCode: code, migrated: true };
  } catch (e) { return { error: 'Upgrade failed: ' + authErr(e) }; }
}

async function secureRegister(name, pin) {
  const n = name.trim();
  if (!validName(n)) return { error: NAME_ERR };
  if (!PIN_RE.test(pin)) return { error: 'PIN must be 4–12 digits.' };
  const status = await checkNameAvailable(n);
  if (status === 'taken') return { error: 'That name is already taken. Choose another.' };
  if (status === 'error') return { error: 'Could not reach the server. Check your internet.' };
  let auth, cred;
  const email = newPlayerEmail();
  try { auth = await initFirebase(); cred = await FB.createUserWithEmailAndPassword(auth, email, pinPass(pin)); }
  catch (e) { return { error: authErr(e) }; }
  return createAccountFor(cred.user, n, email);
}

// Creates the game account for a freshly signed-in Firebase user
async function createAccountFor(user, name, email) {
  _authUser = user;
  const key = nameKey(name), acc = newAccId();
  const google = user.providerData.find(p => p.providerId === 'google.com');
  try {
    await dbPut('/accounts/' + acc, {
      owner: user.uid, name, nameLower: key, xp: 0, totalCleared: 0, xpAt: SERVER_TIME, level: 1, diff: 'easy',
      avatar: getMyAvatar(), google: google ? { email: google.email } : null,
      createdAt: SERVER_TIME, lastSeen: SERVER_TIME
    });
    await dbPut('/owners/' + user.uid, acc);
  } catch (e) { return { error: 'Account creation failed. Try again.' }; }
  try { await dbPut('/usernames/' + key, { acc, email: email || null, createdAt: Date.now() }); }
  catch (e) { await dbDelete('/owners/' + user.uid).catch(() => {}); return { error: 'That name was just taken. Try another.' }; }
  const code = newRecoveryCode();
  await dbPut('/recovery/' + acc, { code }).catch(() => {});
  const r = await loadSignedInAccount(key);
  return { ...r, recoveryCode: code, created: true };
}

// After Firebase says who you are: find + load your game account (honours bans & locks)
async function loadSignedInAccount(keyHint) {
  const u = fbUser(); _authUser = u;
  if (!u) return { error: 'Not signed in.' };
  let acc, account;
  try { acc = await dbGet('/owners/' + u.uid); }
  catch (e) { return isNet(e) ? offlineSession() : { error: 'Could not load your account.' }; }
  if (!acc) return { needsName: true, email: u.email || '' };
  const [ban, got] = await Promise.all([readBan(acc), dbGet('/accounts/' + acc).then(a => ({ a }), e => ({ e }))]);
  if (ban) { await fbSignOut(); return { banned: ban }; }
  try { if (got.e) throw got.e; account = got.a; }
  catch (e) {
    if (isNet(e)) return offlineSession();
    if (e.message === 'DENIED') {
      const key = keyHint || nameKey(localStorage.getItem(ACC_NAME) || '');
      const lock = key ? await readLock(key) : null;
      await fbSignOut();
      if (lockLeft(lock)) return { locked: lockLeft(lock) };
      return { error: 'Your account is locked right now. Try again soon.' };
    }
    return { error: 'Could not load your account.' };
  }
  if (!account) return { needsName: true, email: u.email || '' };
  account.id = acc;
  if (account.pinHash || account.legacyProof) dbPatch('/accounts/' + acc, { pinHash: null, legacyProof: null }).catch(() => {});
  applyAccountLocally(account);
  localStorage.setItem(ACC_NAME, account.name);
  clearFailures(account.nameLower).catch(() => {});
  dbPatch('/accounts/' + acc, { lastSeen: SERVER_TIME }).catch(() => {});
  return { ok: true, account };
}
function offlineSession() {
  const name = localStorage.getItem(ACC_NAME);
  if (!name) return { error: 'You are offline. Connect to sign in.' };
  currentAccount = { id: myId, name, offline: true };
  myName = name; writeSave({ name });
  pushToast('Playing offline — progress syncs later', 'info');
  return { ok: true, account: currentAccount, offline: true };
}

// ── Google ──
async function googleUserFlow(fn) {
  let auth;
  try { auth = await initFirebase(); } catch (e) { return { error: 'Could not load sign-in. Check your internet.' }; }
  try {
    // Automated tests (emulator only) inject a fake Google credential instead of a popup
    if (CFG().emulator && window.__mzGoogleIdToken) await fn(auth, FB.GoogleAuthProvider.credential(window.__mzGoogleIdToken));
    else await fn(auth, null);
  } catch (e) {
    if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return { cancelled: true };
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
      if (fn === _googleSignInFn) { sessionStorage.setItem('mz_redirect', '1'); await FB.signInWithRedirect(auth, googleProvider(), FB.browserPopupRedirectResolver); return { redirect: true }; }
    }
    return { error: authErr(e) };
  }
  return null;
}
const _googleSignInFn = (auth, cred) => cred ? FB.signInWithCredential(auth, cred) : FB.signInWithPopup(auth, googleProvider(), FB.browserPopupRedirectResolver);
async function secureGoogleSignIn() {
  const fail = await googleUserFlow(_googleSignInFn);
  if (fail) return fail;
  return loadSignedInAccount();
}
async function completeGoogleSignup(name) {
  const n = name.trim();
  if (!validName(n)) return { error: NAME_ERR };
  const status = await checkNameAvailable(n);
  if (status === 'taken') return { error: 'That name is already taken. Choose another.' };
  if (status === 'error') return { error: 'Could not reach the server.' };
  const u = fbUser();
  if (!u) return { error: 'Google session expired — try again.' };
  return createAccountFor(u, n, null);
}
async function linkGoogle() {
  const u = fbUser();
  if (!u) return { error: 'Sign in first.' };
  if (hasProvider(u, 'google.com')) return { error: 'Google is already linked.' };
  const fail = await googleUserFlow((auth, cred) => cred ? FB.linkWithCredential(u, cred) : FB.linkWithPopup(u, googleProvider(), FB.browserPopupRedirectResolver));
  if (fail) return fail;
  await FB.reload(u);
  const g = fbUser().providerData.find(p => p.providerId === 'google.com');
  const email = g ? g.email : '';
  await dbPatch('/accounts/' + currentAccount.id, { google: { email } }).catch(() => {});
  currentAccount.google = { email };
  return { ok: true, email };
}
async function unlinkGoogle() {
  const u = fbUser();
  if (!hasProvider(u, 'password')) return { error: 'Set a PIN first — otherwise you could not sign in any more.' };
  try { await FB.unlink(u, 'google.com'); } catch (e) { return { error: authErr(e) }; }
  await dbPatch('/accounts/' + currentAccount.id, { google: null }).catch(() => {});
  currentAccount.google = null;
  return { ok: true };
}

// ── PIN change / first PIN for Google-only players ──
async function setAccountPin(newPin, currentPin) {
  if (!PIN_RE.test(newPin)) return { error: 'PIN must be 4–12 digits.' };
  const u = fbUser();
  if (!u) return { error: 'Sign in first.' };
  try {
    if (hasProvider(u, 'password')) {
      if (currentPin) await FB.reauthenticateWithCredential(u, FB.EmailAuthProvider.credential(u.email, pinPass(currentPin)));
      await FB.updatePassword(u, pinPass(newPin));
    } else {
      const email = newPlayerEmail();
      await FB.linkWithCredential(u, FB.EmailAuthProvider.credential(email, pinPass(newPin)));
      const rec = (await dbGet('/usernames/' + currentAccount.nameLower)) || {};
      await dbPut('/usernames/' + currentAccount.nameLower, { acc: currentAccount.id, email, createdAt: rec.createdAt || Date.now() });
    }
  } catch (e) {
    if (['auth/wrong-password', 'auth/invalid-credential', 'auth/invalid-login-credentials'].includes(e.code)) return failureResult(currentAccount.nameLower, 'current PIN');
    return { error: authErr(e) };
  }
  return { ok: true };
}
function accountHasPin()    { return hasProvider(_authUser, 'password'); }
function accountHasGoogle() { return hasProvider(_authUser, 'google.com'); }

async function regenerateRecoveryCode() {
  const code = newRecoveryCode();
  try { await dbPut('/recovery/' + currentAccount.id, { code }); } catch (e) { return { error: 'Could not save a new code.' }; }
  return { ok: true, code };
}

// ── Forgot PIN: recovery code ──
async function recoverWithCode(name, code, newPin) {
  const key = nameKey(name.trim());
  if (!key) return { error: 'Enter your username.' };
  if (!PIN_RE.test(newPin)) return { error: 'New PIN must be 4–12 digits.' };
  const proof = normCode(code);
  if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(proof)) return { error: 'Recovery codes look like ABCD-EFGH-JKMN.' };
  let auth, rec;
  try { auth = await initFirebase(); rec = await dbGet('/usernames/' + key); } catch (e) { return { error: 'Could not reach the server.' }; }
  if (!rec) return { error: 'No account found with that name.' };
  if (!rec.acc) return { error: 'This account has not been upgraded yet — sign in with your PIN once, or ask an admin.' };
  const lock = await readLock(key);
  if (lockLeft(lock)) return { locked: lockLeft(lock) };
  let cred;
  const email = newPlayerEmail();
  try { cred = await FB.createUserWithEmailAndPassword(auth, email, pinPass(newPin)); } catch (e) { return { error: authErr(e) }; }
  _authUser = cred.user;
  try { await dbPatch('/accounts/' + rec.acc, { owner: cred.user.uid, recoveryProof: proof, google: null }); }
  catch (e) {
    await FB.deleteUser(cred.user).catch(() => {}); _authUser = null;
    return e.message === 'DENIED' ? failureResult(key, 'recovery code') : { error: 'Could not reach the server.' };
  }
  try {
    await dbPut('/owners/' + cred.user.uid, rec.acc);
    await dbPut('/usernames/' + key, { acc: rec.acc, email, createdAt: rec.createdAt || Date.now() });
    await dbPatch('/accounts/' + rec.acc, { recoveryProof: null });
  } catch (e) { return { error: 'Recovery half-finished — try again.' }; }
  const newCode = newRecoveryCode();
  await dbPut('/recovery/' + rec.acc, { code: newCode }).catch(() => {});
  const r = await loadSignedInAccount(key);
  return { ...r, recoveryCode: newCode, recovered: true };
}

// ══════════════════════════════════════════════════
// ADMIN (all enforced by the database rules — the UI only decides what to show)
// ══════════════════════════════════════════════════
function isAdminUser() {
  const cfg = CFG();
  if (authMode() === 'secure') {
    const u = _authUser;
    return !!(u && u.emailVerified && (cfg.adminEmails || []).some(e => e.toLowerCase() === String(u.email || '').toLowerCase()));
  }
  // legacy / local fallback: UID whitelist (not tamper-proof — secure mode fixes that)
  const uid = (currentAccount && (currentAccount.id || currentAccount.uid)) || localStorage.getItem(ACC_UID) || '';
  if (!uid) return false;
  const short = uid.slice(-8).toUpperCase();
  return (cfg.adminUids || []).some(a => a === uid || a.replace('#', '').toUpperCase() === short);
}
async function adminListAccounts() {
  const [accs, bans, locks] = await Promise.all([dbGet('/accounts'), dbGet('/bans').catch(() => null), dbGet('/locks').catch(() => null)]);
  return Object.entries(accs || {}).map(([id, a]) => ({
    id, name: a.name || '?', nameLower: a.nameLower || nameKey(a.name), xp: a.xp || 0, lvl: getXpLevel(a.xp || 0),
    cleared: a.totalCleared || 0, lastSeen: typeof a.lastSeen === 'number' ? a.lastSeen : 0, createdAt: a.createdAt || 0,
    google: a.google && a.google.email || '', legacy: !a.owner,
    ban: bans && bans[id] && bans[id].until > Date.now() ? bans[id] : null,
    lockLeft: locks && lockLeft(locks[a.nameLower])
  }));
}
async function adminBan(acc, minutes, reason) {
  const until = Date.now() + minutes * 60000;
  await dbPut('/bans/' + acc, { until, reason: reason || '', by: (_authUser && _authUser.email) || 'admin' });
  return until;
}
const adminUnban  = acc => dbDelete('/bans/' + acc);
const adminSetProgress = (acc, xp, cleared) => dbPatch('/accounts/' + acc, cleared == null ? { xp } : { xp, totalCleared: cleared });
const adminUnlock = key => dbPut('/locks/' + key, { fails: 0, lockedAt: 0 });
// Issue a temporary PIN: a helper Firebase app creates a fresh login and the account is moved onto it
async function adminResetPin(acc) {
  const account = await dbGet('/accounts/' + acc);
  if (!account) throw new Error('no such account');
  const pin = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
  if (!FB.helperAuth) {   // separate in-memory auth so the admin stays signed in
    const helper = FB.appMod.getApps().find(a => a.name === 'mz-admin-helper') || FB.appMod.initializeApp(fbCfg(), 'mz-admin-helper');
    FB.helperAuth = FB.initializeAuth(helper, { persistence: FB.inMemoryPersistence });
    if (CFG().emulator && CFG().emulator.auth) FB.connectAuthEmulator(FB.helperAuth, CFG().emulator.auth, { disableWarnings: true });
  }
  const email = newPlayerEmail();
  const cred = await FB.createUserWithEmailAndPassword(FB.helperAuth, email, pinPass(pin));
  const newUid = cred.user.uid;
  await FB.signOut(FB.helperAuth);
  const key = account.nameLower || nameKey(account.name);
  const rec = (await dbGet('/usernames/' + key)) || {};
  await dbPatch('/accounts/' + acc, { owner: newUid, google: null, pinHash: null });
  await dbPut('/owners/' + newUid, acc);
  await dbPut('/usernames/' + key, { acc, email, createdAt: rec.createdAt || Date.now() });
  if (account.owner) await dbDelete('/owners/' + account.owner).catch(() => {});
  await adminUnlock(key).catch(() => {});
  return { pin, hadGoogle: !!(account.google && account.google.email) };
}

// ══════════════════════════════════════════════════
// LEGACY MODE (until firebaseConfig.apiKey is filled in)
// ══════════════════════════════════════════════════
async function legacyRegister(name, pin) {
  const n = name.trim();
  if (!validName(n)) return { error: NAME_ERR };
  if (!PIN_RE.test(pin)) return { error: 'PIN must be 4–12 digits.' };
  const status = await checkNameAvailable(n);
  if (status === 'taken') return { error: 'That name is already taken. Choose another.' };
  if (status === 'error') return { error: 'Could not reach the server. Check your internet.' };
  const uid = genUid(), pinHash = await sha256(pin + uid), key = nameKey(n);
  const account = { uid, name: n, nameLower: key, pinHash, xp: 0, totalCleared: 0, level: 1, diff: 'easy', createdAt: Date.now(), lastSeen: Date.now() };
  try { await dbPut('/usernames/' + key, { uid, createdAt: Date.now() }); } catch (e) { return { error: 'That name was just taken. Try another.' }; }
  try { await dbPut('/accounts/' + uid, account); } catch (e) { await dbDelete('/usernames/' + key).catch(() => {}); return { error: 'Account creation failed. Try again.' }; }
  saveTokenLocally(uid, pinHash, n);
  applyAccountLocally({ ...account, id: uid });
  return { ok: true, account: currentAccount };
}
async function legacyLogin(name, pin) {
  const key = nameKey(name.trim());
  let rec, account;
  try { rec = await dbGet('/usernames/' + key); } catch (e) { return { error: 'Could not reach the server. Check your internet.' }; }
  if (!rec || !rec.uid) return { error: 'No account found with that name.' };
  try { account = await dbGet('/accounts/' + rec.uid); } catch (e) { return { error: 'Could not reach the server.' }; }
  if (!account) return { error: 'Account data missing. Contact admin.' };
  const pinHash = await sha256(pin + rec.uid);
  if (pinHash !== account.pinHash) return { error: 'Wrong PIN. Try again.' };
  dbPatch('/accounts/' + rec.uid, { lastSeen: Date.now() }).catch(() => {});
  saveTokenLocally(rec.uid, pinHash, account.name);
  applyAccountLocally({ ...account, id: rec.uid });
  return { ok: true, account: currentAccount };
}
async function legacyAutoLogin() {
  const uid = localStorage.getItem(ACC_UID), tok = localStorage.getItem(ACC_TOK), name = localStorage.getItem(ACC_NAME);
  if (!uid || !tok) return false;
  try {
    const account = await dbGet('/accounts/' + uid);
    if (!account || account.pinHash !== tok) { clearTokenLocally(); return false; }
    dbPatch('/accounts/' + uid, { lastSeen: Date.now() }).catch(() => {});
    applyAccountLocally({ ...account, id: uid });
    return true;
  } catch (e) {
    if (!name) return false;
    currentAccount = { id: uid, name, offline: true }; myName = name; myId = uid; writeSave({ name });
    pushToast('Playing offline — progress syncs later', 'info');
    return true;
  }
}

// ══════════════════════════════════════════════════
// COMMON: rename, sync, init, logout
// ══════════════════════════════════════════════════
async function renameAccount(newName) {
  if (!currentAccount) return { error: 'Not signed in.' };
  const n = newName.trim();
  if (!validName(n)) return { error: NAME_ERR };
  const newKey = nameKey(n), oldKey = nameKey(currentAccount.name), acc = currentAccount.id;
  const finish = () => { currentAccount.name = n; currentAccount.nameLower = newKey; localStorage.setItem(ACC_NAME, n); writeSave({ name: n }); return { ok: true }; };
  if (authMode() === 'local' || currentAccount.offline) return finish();
  if (newKey === oldKey) { dbPatch('/accounts/' + acc, { name: n }).catch(() => {}); return finish(); }
  const status = await checkNameAvailable(n);
  if (status === 'taken') return { error: 'That name is already taken.' };
  if (status !== 'available') return { error: status === 'invalid' ? NAME_ERR : 'Could not reach the server.' };
  try {
    if (authMode() === 'secure') {
      const old = (await dbGet('/usernames/' + oldKey)) || {};
      await dbPut('/usernames/' + newKey, { acc, email: old.email || null, createdAt: Date.now() });
      await dbPatch('/accounts/' + acc, { name: n, nameLower: newKey });
      await dbDelete('/usernames/' + oldKey).catch(() => {});
    } else {
      await dbPut('/usernames/' + newKey, { uid: acc, createdAt: Date.now() });
      await dbDelete('/usernames/' + oldKey).catch(() => {});
      await dbPatch('/accounts/' + acc, { name: n, nameLower: newKey });
    }
  } catch (e) { return { error: 'That name was just taken. Try another.' }; }
  return finish();
}

async function syncAccountToCloud() {
  if (!currentAccount || currentAccount.local || currentAccount.offline || !fbUrl()) return;
  if (authMode() === 'secure' && !_authUser) return;
  const s = loadSave(), id = currentAccount.id, secure = authMode() === 'secure';
  // Looks + position first: these never get held back by the anti-cheat limits
  try {
    // Recent daily clears travel with the account, so the daily can't be replayed on another device
    const daily = Object.fromEntries(Object.entries(s.daily || {}).sort().slice(-3));
    // Owned cosmetics are written item by item ("owned/frame/f-nova": true) so a sync only ever
    // adds — it can never wipe something an admin granted from another device
    const ownedPaths = {};
    Object.entries(mergeOwned(s.owned)).forEach(([set, ids]) => Object.keys(ids).forEach(k => { ownedPaths['owned/' + set + '/' + k] = true; }));
    await dbPatch('/accounts/' + id, { level: s.level || 1, diff: s.diff || 'easy', avatar: getMyAvatar(), daily, ...ownedPaths,
      ownedV1: !!s.ownedV1, ownedV2: !!s.ownedV2, pity: typeof pityMap === 'function' ? pityMap(s.pity) : {}, lastSeen: secure ? SERVER_TIME : Date.now() });
  } catch (e) { return; }
  // Progress is stamped with the server clock; the database rejects impossible jumps.
  // A rejected jump simply retries on later syncs, once enough real time has passed.
  let progressOk = false;
  try {
    await dbPatch('/accounts/' + id, secure
      ? { xp: s.xp || 0, totalCleared: s.totalCleared || 0, coins: s.coins || 0, boosts: s.boosts || {}, crateKeys: keyMap(s.crateKeys), xpAt: SERVER_TIME }
      : { xp: s.xp || 0, totalCleared: s.totalCleared || 0, coins: s.coins || 0, boosts: s.boosts || {}, crateKeys: keyMap(s.crateKeys) });
    progressOk = true;
  } catch (e) { /* offline or over the speed limit — next sync */ }
  // Public profile (anyone signed in can view it; the rules cap xp/clears at the real account's values).
  // Your look + name always go out, even when the anti-cheat is holding your progress back for now.
  if (secure) {
    const look = { name: myName, av: getMyAvatar(), at: SERVER_TIME };
    try {
      if (progressOk) await dbPut('/profiles/' + id, { ...look, xp: s.xp || 0, cleared: s.totalCleared || 0 });
      else await dbPatch('/profiles/' + id, look).catch(() => putProfileFromAccount(id, look));
      _lookSent = lookStamp();
    } catch (e) {}
  }
}
// What your friends see of you: name + look. Cheap to publish, so it goes out
// as soon as it changes instead of waiting for the next full sync.
const lookStamp = () => myName + '|' + JSON.stringify(getMyAvatar());
let _lookSent = '';
async function publishLookIfChanged() {
  if (authMode() !== 'secure' || !currentAccount || currentAccount.offline || !_authUser) return;
  const stamp = lookStamp();
  if (stamp === _lookSent) return;
  const id = currentAccount.id;
  const look = { name: myName, av: getMyAvatar(), at: SERVER_TIME };
  try {
    await dbPatch('/profiles/' + id, look).catch(() => putProfileFromAccount(id, look));
    _lookSent = stamp;
  } catch (e) {}
}
// Writing a whole profile needs xp + clears, and the rules cap them at what the account really has.
// Take them from the account itself — publishing zeros would show everyone as a level 1 Newbie.
async function putProfileFromAccount(id, look) {
  let acc = null;
  try { acc = await dbGet('/accounts/' + id); } catch (e) {}
  const s = loadSave();
  const xp = Math.min(s.xp || 0, (acc && acc.xp) || 0) || (acc && acc.xp) || 0;
  const cleared = Math.min(s.totalCleared || 0, (acc && acc.totalCleared) || 0) || (acc && acc.totalCleared) || 0;
  return dbPut('/profiles/' + id, { ...look, xp, cleared });
}

async function initAccount(onReady) {
  document.getElementById('conn-txt').innerText = 'LOADING…';
  const mode = authMode();
  if (mode === 'local') {
    const s = loadSave();
    const name = s.name || localStorage.getItem(ACC_NAME) || '';
    const uid  = localStorage.getItem(ACC_UID) || genUid();
    localStorage.setItem(ACC_UID, uid);
    currentAccount = { id: uid, name: name || 'Racer', local: true };
    myName = currentAccount.name; myId = uid; accountReady = true;
    hideConnecting();
    if (!name) { updateMenuProfile(); show('menu'); setTimeout(openNameEdit, 400); }
    else onReady(name);
    return;
  }
  if (mode === 'legacy') {
    if (await legacyAutoLogin()) { accountReady = true; onReady(currentAccount.name); return; }
    hideConnecting(); showAuthScreen(); return;
  }
  // secure
  let auth;
  try { auth = await initFirebase(); }
  catch (e) {
    const r = offlineSession(); hideConnecting();
    if (r.ok) { accountReady = true; onReady(currentAccount.name); } else showAuthScreen();
    return;
  }
  // Only returning from a Google redirect needs this (it loads a slow Google iframe)
  if (sessionStorage.getItem('mz_redirect')) {
    sessionStorage.removeItem('mz_redirect');
    try { await FB.getRedirectResult(auth, FB.browserPopupRedirectResolver); } catch (e) { pushToast(authErr(e), 'warn'); }
  }
  performance.mark('mz-sdk-ready');
  const user = await waitAuthState(auth);
  performance.mark('mz-auth-state');
  if (!user) { hideConnecting(); showAuthScreen(); return; }
  _authUser = user;
  handleAuthResult(await loadSignedInAccount(), 'auto');
}

function logoutAccount() {
  syncAccountToCloud().catch(() => {});
  if (typeof stopLive === 'function') { if (_liveOn && currentAccount) dbDelete('/online/' + currentAccount.id).catch(() => {}); stopLive(); }
  const mode = authMode();
  currentAccount = null; accountReady = false; myName = 'Racer';
  if (mode === 'local') { writeSave({ name: '' }); updateMenuProfile(); show('menu'); setTimeout(openNameEdit, 200); return; }
  clearTokenLocally();
  // Progress lives in the cloud — don't leave it for the next person on this device
  const s = loadSave();
  localStorage.setItem('mazzie', JSON.stringify({ settings: s.settings || {} }));
  applyMyCosmetics();
  if (mode === 'secure') fbSignOut();
  _authUser = null;
  showAuthScreen();
}

// ── Local helpers ──
function saveTokenLocally(uid, tok, name) { localStorage.setItem(ACC_UID, uid); localStorage.setItem(ACC_TOK, tok); localStorage.setItem(ACC_NAME, name); }
function clearTokenLocally() { [ACC_UID, ACC_TOK, ACC_NAME].forEach(k => localStorage.removeItem(k)); }
// Union of two owned-cosmetics maps ({ set: { id: true } }), known sets only
function mergeOwned(a, b) {
  const out = {};
  [a, b].forEach(o => o && typeof o === 'object' && Object.entries(o).forEach(([set, ids]) => {
    if (!['icon', 'color', 'frame', 'trail', 'title'].includes(set) || !ids || typeof ids !== 'object') return;
    Object.keys(ids).forEach(id => { if (ids[id] === true) (out[set] = out[set] || {})[id] = true; });
  }));
  return out;
}
function applyAccountLocally(account) {
  if (account && typeof account.resetAt === 'number' && account.resetAt > (loadSave().resetAt || 0) && typeof resetLocalProgress === 'function') resetLocalProgress(account.resetAt);
  currentAccount = account;
  myName = account.name;
  myId   = account.id;
  adminTargetId = myId;
  if (account.local || account.offline) { writeSave({ name: account.name }); return; }
  const s = loadSave();
  // Secure mode: the server-checked cloud values win (so edited local saves can't creep back up).
  // Legacy mode: keep whichever side is further ahead.
  const secure = authMode() === 'secure';
  const patch = {
    name:         account.name,
    xp:           secure ? (account.xp || 0) : Math.max(account.xp || 0, s.xp || 0),
    totalCleared: secure ? (account.totalCleared || 0) : Math.max(account.totalCleared || 0, s.totalCleared || 0),
    coins:        secure ? (account.coins || 0) : Math.max(account.coins || 0, s.coins || 0),
    boosts:       secure ? (account.boosts || {}) : (account.boosts || s.boosts || {}),
    crateKeys:    secure ? keyMap(account.crateKeys) : keyMap(account.crateKeys || s.crateKeys),
    owned:        mergeOwned(account.owned, s.owned),
    ownedV1:      !!(account.ownedV1 || s.ownedV1),
    ownedV2:      !!(account.ownedV2 || s.ownedV2),
    pity:         account.pity && typeof account.pity === 'object' ? pityMap(account.pity) : pityMap(s.pity),
    daily:        { ...(account.daily && typeof account.daily === 'object' ? account.daily : {}), ...(s.daily || {}) },
    level:        account.level || s.level || 1,
    diff:         account.diff  || s.diff  || 'easy'
  };
  if (account.avatar) patch.avatar = sanitizeAvatar(account.avatar);
  writeSave(patch);
  applyMyCosmetics();
}
function _setupContinueBtn() {
  const s = loadSave();
  const on = !!(s.level && s.level > 1 && s.diff);
  document.getElementById('continue-btn').classList.toggle('hidden', !on);
  if (on) document.getElementById('continue-info').innerText = s.diff.toUpperCase() + ' · LVL ' + s.level;
}
