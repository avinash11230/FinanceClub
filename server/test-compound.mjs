// Multi-round COMPOUNDING test against the running API (port 4000) on a fresh DB.
// Allocations are kept diversified (<=25% each) to isolate compounding from
// crowd dilution.
const BASE = 'http://localhost:4000';
const assert = (c, m) => { if (!c) { console.error('  ✗ FAIL:', m); process.exitCode = 1; } else console.log('  ✓', m); };
const near = (a, b, e = 1) => Math.abs(a - b) <= e;

function makeClient() {
  let cookies = {};
  return async function call(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const cs = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    if (cs) headers.Cookie = cs;
    const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    for (const sc of res.headers.getSetCookie?.() || []) { const [p] = sc.split(';'); const [k, v] = p.split('='); cookies[k] = v; }
    let data = null; try { data = await res.json(); } catch {}
    return { status: res.status, data };
  };
}

const admin = makeClient();
await admin('POST', '/api/admin/login', { email: 'admin@financeclub.iitm.ac.in', password: 'admin123' });
const ids = (await admin('GET', '/api/admin/companies')).data.companies.map((c) => c.id);

const setReturns = (roundId, vals) =>
  admin('PUT', `/api/admin/rounds/${roundId}/returns`, {
    returns: ids.map((cid, i) => ({ company_id: cid, base_return: vals[i], multipliers: [] })),
  });
const evenSplit = (capital) => { const e = Math.floor(capital / 5); return ids.map((cid, i) => ({ company_id: cid, amount: i === 0 ? capital - e * 4 : e, confidence: 3 })); };

// --- Round 1: open the seeded pending round ---
let r1 = (await admin('GET', '/api/admin/rounds')).data.rounds[0];
await admin('POST', `/api/admin/rounds/${r1.id}/open`, { closes_at: new Date(Date.now() + 3600e3).toISOString() });

// A: even split (20% each). B: [25,25,25,25,0] — all <=25% so no dilution.
const A = makeClient();
await A('POST', '/api/auth/signup', { name: 'Alpha', email: 'alpha@smail.iitm.ac.in', password: 'password123' });
assert((await A('GET', '/api/me/dashboard')).data.capital === 1000000, 'R1 start capital = 10,00,000');
await A('POST', '/api/me/allocations', { allocations: evenSplit(1000000) });

const B = makeClient();
await B('POST', '/api/auth/signup', { name: 'Bravo', email: 'bravo@smail.iitm.ac.in', password: 'password123' });
await B('POST', '/api/me/allocations', { allocations: ids.map((cid, i) => ({ company_id: cid, amount: i === 4 ? 0 : 250000, confidence: 3 })) });

// Returns R1: [20, 5, -5, 10, 0]
await setReturns(r1.id, [20, 5, -5, 10, 0]);
await admin('POST', `/api/admin/rounds/${r1.id}/close`);
await admin('POST', `/api/admin/rounds/${r1.id}/snapshot`);

// A even -> 6% -> 10,60,000.  B [25,25,25,25,0] -> 7.5% -> 10,75,000
let lb = (await A('GET', '/api/me/leaderboard')).data;
const a1 = lb.returns.find((x) => x.name === 'Alpha');
const b1 = lb.returns.find((x) => x.name === 'Bravo');
assert(near(a1.netWorth, 1060000), `A net worth after R1 = 10,60,000 (${a1.netWorth})`);
assert(near(a1.roundPnl, 60000), `A R1 P&L = +60,000 (${a1.roundPnl})`);
assert(near(b1.netWorth, 1075000), `B net worth after R1 = 10,75,000 (${b1.netWorth})`);
assert(b1.rank === 1 && a1.rank === 2, `B #1, A #2 by net worth (${b1.rank},${a1.rank})`);

// --- Round 2: capital carries forward ---
await admin('POST', '/api/admin/rounds');
let r2 = (await admin('GET', '/api/admin/rounds')).data.rounds.at(-1);
await admin('POST', `/api/admin/rounds/${r2.id}/open`, { closes_at: new Date(Date.now() + 3600e3).toISOString() });

const dashA = (await A('GET', '/api/me/dashboard')).data;
assert(near(dashA.capital, 1060000), `R2 A capital carried = 10,60,000 (${dashA.capital})`);
assert(dashA.lastRound && near(dashA.lastRound.pnl, 60000), `R2 dashboard last-round P&L = +60,000 (${dashA.lastRound?.pnl})`);

// wrong total (old fixed 10,00,000) must be rejected now
const bad = await A('POST', '/api/me/allocations', { allocations: evenSplit(1000000) });
assert(bad.status === 400, `R2 allocation of 10,00,000 rejected (capital is 10,60,000) (${bad.status})`);

// correct: allocate full carried capital. B sits out (tests carry-forward).
await A('POST', '/api/me/allocations', { allocations: evenSplit(1060000) });

await setReturns(r2.id, [10, 10, 10, 10, 10]); // everything +10%
await admin('POST', `/api/admin/rounds/${r2.id}/close`);
await admin('POST', `/api/admin/rounds/${r2.id}/snapshot`);

lb = (await A('GET', '/api/me/leaderboard')).data;
const a2 = lb.returns.find((x) => x.name === 'Alpha');
const b2 = lb.returns.find((x) => x.name === 'Bravo');
assert(near(a2.netWorth, 1166000), `A compounded net worth after R2 = 11,66,000 (${a2.netWorth})`);
assert(near(a2.roundPnl, 106000), `A R2 P&L = +1,06,000 (${a2.roundPnl})`);
assert(near(a2.cumulativeReturn, 16.6, 0.2), `A cumulative return = +16.6% (${a2.cumulativeReturn})`);
assert(near(b2.netWorth, 1075000), `B carried forward flat = 10,75,000 (${b2.netWorth})`);
assert(b2.roundPnl === 0, `B sat out R2 -> P&L 0 (${b2.roundPnl})`);
assert(a2.rank === 1 && b2.rank === 2, `A overtakes B: A #1, B #2 (${a2.rank},${b2.rank})`);
assert(a2.movement === 'up', `A shows rank movement up (${a2.movement})`);

const prof = (await A('GET', '/api/me/profile')).data;
assert(near(prof.netWorth, 1166000), `profile net worth = 11,66,000 (${prof.netWorth})`);
assert(prof.scores.length === 2 && near(prof.scores[0].capital_after, 1060000), 'profile records R1 net worth');

console.log('\nCompounding test done.');
