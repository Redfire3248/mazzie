// Security-rules tests against the local Auth + RTDB emulators
const DB = 'http://127.0.0.1:9000', NS = 'mazzzie-7d6bb-default-rtdb', AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
let pass = 0, fail = 0;
const url = (p, tok) => `${DB}${p}.json?ns=${NS}${tok ? '&auth=' + tok : ''}`;
async function req(method, p, body, tok, owner) {
  const r = await fetch(url(p, tok), { method, headers: { 'Content-Type': 'application/json', ...(owner ? { Authorization: 'Bearer owner' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return r.status;
}
const ok  = (name, st) => { if (st === 200) { pass++; console.log('  ok   ', name); } else { fail++; console.log('  FAIL ', name, '(expected allow, got', st + ')'); } };
const no  = (name, st) => { if (st !== 200) { pass++; console.log('  ok   ', name, '(denied)'); } else { fail++; console.log('  FAIL ', name, '(expected DENY, got 200)'); } };
async function signUp(email) {
  const r = await (await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'mz-pin:1234', returnSecureToken: true }) })).json();
  return { uid: r.localId, tok: r.idToken };
}
async function google(email, verified = true) {
  const idt = JSON.stringify({ sub: 'g-' + email, email, email_verified: verified });
  const r = await (await fetch(`${AUTH}/accounts:signInWithIdp?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ postBody: `id_token=${encodeURIComponent(idt)}&providerId=google.com`, requestUri: 'http://localhost', returnSecureToken: true }) })).json();
  return { uid: r.localId, tok: r.idToken };
}
const SV = { '.sv': 'timestamp' };

(async () => {
  await fetch('http://127.0.0.1:9099/emulator/v1/projects/mazzzie-7d6bb/accounts', { method: 'DELETE' });
  await req('DELETE', '/', undefined, null, true);
  await req('PUT', '/admins', { 'redjai1981@gmail,com': true }, null, true);

  const alice = await signUp('p.alice@players.mazzie.game');
  const bob   = await signUp('p.bob@players.mazzie.game');
  const admin = await google('redjai1981@gmail.com');
  const fakeAdmin = await signUp('redjai1981@gmail.com');          // same email, but NOT verified
  const unverifiedG = await google('redjai1981+x@gmail.com');       // verified but not in admins

  console.log('Registration');
  const accA = { owner: alice.uid, name: 'Alice', nameLower: 'alice', xp: 0, totalCleared: 0, xpAt: SV };
  ok('alice creates her account',         await req('PUT', '/accounts/A', accA, alice.tok));
  ok('alice maps owner → account',        await req('PUT', '/owners/' + alice.uid, 'A', alice.tok));
  ok('alice claims username',             await req('PUT', '/usernames/alice', { acc: 'A', email: 'p.alice@players.mazzie.game' }, alice.tok));
  ok('alice stores recovery code',        await req('PUT', '/recovery/A', { code: 'ABCD-EFGH-JK' }, alice.tok));
  no('anonymous cannot create account',   await req('PUT', '/accounts/Z', { owner: 'x', name: 'Z', nameLower: 'z' }));
  no('bob cannot create account owned by alice', await req('PUT', '/accounts/B2', { owner: alice.uid, name: 'B', nameLower: 'b' }, bob.tok));
  ok('bob creates his account',           await req('PUT', '/accounts/B', { owner: bob.uid, name: 'Bob', nameLower: 'bob' }, bob.tok));
  ok('bob claims username',               await req('PUT', '/usernames/bob', { acc: 'B', email: 'p.bob@players.mazzie.game' }, bob.tok));

  console.log('Privacy / hijacking');
  ok('anyone can look up usernames',      await req('GET', '/usernames/alice'));
  no('anonymous cannot read accounts',    await req('GET', '/accounts/A'));
  no('anonymous cannot list accounts',    await req('GET', '/accounts'));
  no('bob cannot read alice',             await req('GET', '/accounts/A', undefined, bob.tok));
  no('bob cannot edit alice',             await req('PATCH', '/accounts/A', { xp: 999999 }, bob.tok));
  no('bob cannot steal alice (owner swap)', await req('PATCH', '/accounts/A', { owner: bob.uid }, bob.tok));
  no('bob cannot repoint alice username', await req('PUT', '/usernames/alice', { acc: 'B' }, bob.tok));
  no('bob cannot delete alice username',  await req('DELETE', '/usernames/alice', undefined, bob.tok));
  no('bob cannot point his uid at A',     await req('PUT', '/owners/' + bob.uid, 'A', bob.tok));
  no('nobody can read recovery codes',    await req('GET', '/recovery/A', undefined, alice.tok));
  no('bob cannot overwrite alice recovery', await req('PUT', '/recovery/A', { code: 'HACKED-CODE-1' }, bob.tok));
  ok('alice reads her account',           await req('GET', '/accounts/A', undefined, alice.tok));
  ok('alice earns xp normally',           await req('PATCH', '/accounts/A', { xp: 160, totalCleared: 1, xpAt: SV }, alice.tok));

  console.log('Anti-cheat / no fake leaderboards');
  no('console cheat: +1,000,000 xp',      await req('PATCH', '/accounts/A', { xp: 1000160, xpAt: SV }, alice.tok));
  no('xp raise without server timestamp', await req('PATCH', '/accounts/A', { xp: 400 }, alice.tok));
  no('faked old timestamp for big allowance', await req('PATCH', '/accounts/A', { xp: 90000, xpAt: 1 }, alice.tok));
  no('console cheat: +500 clears',        await req('PATCH', '/accounts/A', { totalCleared: 501, xpAt: SV }, alice.tok));
  const carl = await signUp('p.carl@players.mazzie.game');
  no('new account cannot start with xp',  await req('PUT', '/accounts/C', { owner: carl.uid, name: 'Carl', nameLower: 'carl', xp: 99999, xpAt: SV }, carl.tok));
  no('player cannot create /leaderboards', await req('PUT', '/leaderboards/top', { Alice: 999999 }, alice.tok));
  no('anonymous cannot create /leaderboards', await req('PUT', '/leaderboards/top', { x: 1 }));
  no('player cannot write any new top-level data', await req('PUT', '/scores/A', 5, alice.tok));
  ok('admin can correct a cheater xp',    await req('PATCH', '/accounts/A', { xp: 50 }, admin.tok));

  console.log('Admin');
  ok('admin (verified Google) lists all accounts', await req('GET', '/accounts', undefined, admin.tok));
  no('unverified same-email account is NOT admin', await req('GET', '/accounts', undefined, fakeAdmin.tok));
  no('other Google account is NOT admin', await req('GET', '/accounts', undefined, unverifiedG.tok));
  no('players cannot make themselves admin', await req('PUT', '/admins/p,bob@players,mazzie,game', true, bob.tok));
  no('alice cannot ban bob',              await req('PUT', '/bans/B', { until: Date.now() + 6e5 }, alice.tok));
  ok('admin bans bob 10 min',             await req('PUT', '/bans/B', { until: Date.now() + 6e5, reason: 'test' }, admin.tok));
  ok('anyone can see a ban',              await req('GET', '/bans/B'));
  no('banned bob cannot read his account', await req('GET', '/accounts/B', undefined, bob.tok));
  no('banned bob cannot write his account', await req('PATCH', '/accounts/B', { xp: 1 }, bob.tok));
  no('bob cannot lift his own ban',       await req('DELETE', '/bans/B', undefined, bob.tok));
  ok('admin unbans bob',                  await req('DELETE', '/bans/B', undefined, admin.tok));
  ok('bob can play again',                await req('GET', '/accounts/B', undefined, bob.tok));

  console.log('5 wrong PINs → 15 min lock');
  for (let i = 1; i <= 4; i++) ok('failure ' + i + ' recorded (anonymous)', await req('PUT', '/locks/alice', { fails: i, lockedAt: 0 }));
  no('cannot skip or fake the counter',   await req('PUT', '/locks/alice', { fails: 1, lockedAt: 0 }));
  no('cannot delete the counter',         await req('DELETE', '/locks/alice'));
  no('cannot fake an old lock timestamp', await req('PUT', '/locks/alice', { fails: 0, lockedAt: 5 }));
  ok('5th failure locks the account',     await req('PUT', '/locks/alice', { fails: 0, lockedAt: SV }));
  no('no more attempts counted while locked', await req('PUT', '/locks/alice', { fails: 1, lockedAt: 0 }));
  no('owner cannot clear the lock early', await req('PATCH', '/locks/alice', { fails: 0 }, alice.tok));
  no('even with the right PIN, data is locked', await req('GET', '/accounts/A', undefined, alice.tok));
  no('locked owner cannot write either',  await req('PATCH', '/accounts/A', { xp: 1 }, alice.tok));
  ok('admin can unlock',                  await req('PUT', '/locks/alice', { fails: 0, lockedAt: 0 }, admin.tok));
  ok('alice back in after unlock',        await req('GET', '/accounts/A', undefined, alice.tok));
  ok('bob fail #1',                       await req('PUT', '/locks/bob', { fails: 1, lockedAt: 0 }));
  ok('bob resets counter after good sign-in', await req('PUT', '/locks/bob', { fails: 0, lockedAt: 0 }, bob.tok));
  no('alice cannot reset bob counter',    await req('PUT', '/locks/bob', { fails: 0, lockedAt: 0 }, alice.tok));

  console.log('Forgot PIN — recovery code');
  const aliceNew = await signUp('p.alice2@players.mazzie.game');
  no('wrong recovery code rejected',      await req('PATCH', '/accounts/A', { owner: aliceNew.uid, recoveryProof: 'WRONG-CODE-00' }, aliceNew.tok));
  no('stranger cannot claim without code', await req('PATCH', '/accounts/A', { owner: bob.uid }, bob.tok));
  ok('correct recovery code moves account', await req('PATCH', '/accounts/A', { owner: aliceNew.uid, recoveryProof: 'ABCD-EFGH-JK' }, aliceNew.tok));
  ok('new login repoints username',       await req('PUT', '/usernames/alice', { acc: 'A', email: 'p.alice2@players.mazzie.game' }, aliceNew.tok));
  ok('new login maps owner',              await req('PUT', '/owners/' + aliceNew.uid, 'A', aliceNew.tok));
  ok('new login rotates recovery code',   await req('PUT', '/recovery/A', { code: 'NEWC-ODE0-12' }, aliceNew.tok));
  ok('proof field cleared',               await req('PATCH', '/accounts/A', { recoveryProof: null }, aliceNew.tok));
  no('old code no longer works',          await req('PATCH', '/accounts/A', { owner: bob.uid, recoveryProof: 'ABCD-EFGH-JK' }, bob.tok));
  no('old login lost access',             await req('GET', '/accounts/A', undefined, alice.tok));

  console.log('Coins + Store');
  ok('bob earns 100 coins (stamped)',     await req('PATCH', '/accounts/B', { coins: 100, xpAt: SV }, bob.tok));
  no('console cheat: +1,000,000 coins',   await req('PATCH', '/accounts/B', { coins: 1000100, xpAt: SV }, bob.tok));
  no('coin raise without server stamp',   await req('PATCH', '/accounts/B', { coins: 150 }, bob.tok));
  ok('buy a hint for 25',                 await req('PATCH', '/accounts/B', { coins: 75, boosts: { hint: 1 } }, bob.tok));
  no('free boosts (patch)',               await req('PATCH', '/accounts/B', { boosts: { hint: 50 } }, bob.tok));
  no('free boosts (deep write)',          await req('PUT', '/accounts/B/boosts/dash', 5, bob.tok));
  no('underpriced purchase',              await req('PATCH', '/accounts/B', { coins: 70, boosts: { hint: 1, dash: 1 } }, bob.tok));
  ok('using a boost',                     await req('PATCH', '/accounts/B', { boosts: { hint: 0 } }, bob.tok));
  no('unknown boost kind',                await req('PATCH', '/accounts/B', { boosts: { hint: 0, god: 5 } }, bob.tok));
  no('negative coins',                    await req('PATCH', '/accounts/B', { coins: -5 }, bob.tok));
  ok('admin gifts coins',                 await req('PATCH', '/accounts/B', { coins: 5000 }, admin.tok));
  
  no('console cheat: 500 crate keys',     await req('PATCH', '/accounts/B', { crateKeys: 500, xpAt: SV }, bob.tok));
  await req('PATCH', '/accounts/B', { xp: 0 }, admin.tok);
  no('keys without xp gain',              await req('PATCH', '/accounts/B', { crateKeys: 1, xpAt: SV }, bob.tok));
  no('too many keys for the xp gained',   await req('PATCH', '/accounts/B', { xp: 100, crateKeys: 5, xpAt: SV }, bob.tok));
  ok('level-up key with its xp',          await req('PATCH', '/accounts/B', { xp: 100, crateKeys: 1, xpAt: SV }, bob.tok));
  ok('open a crate: spend coins, own item', await req('PATCH', '/accounts/B', { coins: 4900, owned: { frame: { 'f-nova': true } } }, bob.tok));
  ok('use a key',                         await req('PATCH', '/accounts/B', { crateKeys: 0 }, bob.tok));
  no('owned: unknown set',                await req('PATCH', '/accounts/B', { owned: { hacks: { x: true } } }, bob.tok));
  no('owned: non-true value',             await req('PATCH', '/accounts/B', { owned: { icon: { 'cr-fox': 'yes' } } }, bob.tok));

  console.log('Live: broadcast / troll / online');
  ok('signed-in player reads broadcast',  await req('GET', '/broadcast', undefined, bob.tok));
  no('anonymous cannot read broadcast',   await req('GET', '/broadcast'));
  no('player cannot broadcast',           await req('PUT', '/broadcast', { msg: 'hi all', at: SV }, bob.tok));
  ok('admin broadcasts',                  await req('PUT', '/broadcast', { msg: 'hello world', at: SV, by: 'Admin' }, admin.tok));
  no('broadcast needs server time',       await req('PUT', '/broadcast', { msg: 'x', at: 5 }, admin.tok));
  ok('admin trolls bob',                  await req('PUT', '/troll/B', { kind: 'flip', at: SV, by: 'Admin' }, admin.tok));
  no('player cannot troll others',        await req('PUT', '/troll/B', { kind: 'fakeban', at: SV }, aliceNew.tok));
  ok('bob reads his troll inbox',         await req('GET', '/troll/B', undefined, bob.tok));
  no('others cannot read bob inbox',      await req('GET', '/troll/B', undefined, aliceNew.tok));
  no('bob cannot troll himself',          await req('PUT', '/troll/B', { kind: 'gift', at: SV, value: 9999 }, bob.tok));
  ok('bob clears his inbox',              await req('DELETE', '/troll/B', undefined, bob.tok));
  ok('bob heartbeat',                     await req('PUT', '/online/B', { name: 'Bob', lvl: 3, at: SV, where: 'menu' }, bob.tok));
  no('bob cannot fake alice online',      await req('PUT', '/online/A', { name: 'Alice', at: SV }, bob.tok));
  no('players cannot list who is online', await req('GET', '/online', undefined, bob.tok));
  ok('admin sees who is online',          await req('GET', '/online', undefined, admin.tok));

  console.log('Legacy account migration');
  await req('PUT', '/accounts/mz_legacy', { name: 'Old', nameLower: 'old', pinHash: 'HASH123', xp: 700 }, null, true);
  await req('PUT', '/usernames/old', { uid: 'mz_legacy', createdAt: 1 }, null, true);
  const oldUser = await signUp('p.old@players.mazzie.game');
  ok('legacy record readable for PIN check', await req('GET', '/accounts/mz_legacy'));
  no('claim with wrong proof rejected',   await req('PATCH', '/accounts/mz_legacy', { owner: oldUser.uid, legacyProof: 'nope' }, oldUser.tok));
  ok('claim with proof',                  await req('PATCH', '/accounts/mz_legacy', { owner: oldUser.uid, legacyProof: 'HASH123' }, oldUser.tok));
  no('old account (no stamp) cannot jump xp', await req('PATCH', '/accounts/mz_legacy', { xp: 900000, xpAt: SV }, oldUser.tok));
  ok('old account earns normally',        await req('PATCH', '/accounts/mz_legacy', { xp: 860, xpAt: SV }, oldUser.tok));
  ok('legacy username upgraded',          await req('PUT', '/usernames/old', { acc: 'mz_legacy', email: 'p.old@players.mazzie.game' }, oldUser.tok));
  ok('hash + proof wiped',                await req('PATCH', '/accounts/mz_legacy', { pinHash: null, legacyProof: null }, oldUser.tok));
  no('claimed account no longer public',  await req('GET', '/accounts/mz_legacy'));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
