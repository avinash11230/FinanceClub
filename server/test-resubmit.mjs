// Tests multiple submissions: latest-before-close is what's stored & scored.
const BASE = 'http://localhost:4000';
const assert = (c, m) => { if (!c) { console.error('  ✗ FAIL:', m); process.exitCode = 1; } else console.log('  ✓', m); };
const near = (a, b, e = 1) => Math.abs(a - b) <= e;

function makeClient() {
  let cookies = {};
  return async (method, path, body) => {
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
const r1 = (await admin('GET', '/api/admin/rounds')).data.rounds[0];
await admin('POST', `/api/admin/rounds/${r1.id}/open`, { closes_at: new Date(Date.now() + 3600e3).toISOString() });

const P = makeClient();
await P('POST', '/api/auth/signup', { name: 'Editor', email: 'editor@smail.iitm.ac.in', password: 'password123' });

// First submission: all into company 1
let r = await P('POST', '/api/me/allocations', { allocations: ids.map((cid, i) => ({ company_id: cid, amount: i === 0 ? 1000000 : 0, confidence: 5 })) });
assert(r.status === 201 && r.data.updated === false, `first submission ok (updated=false) (${r.status})`);

let dash = (await P('GET', '/api/me/dashboard')).data;
assert(dash.submitted === true, 'dashboard shows submitted');
assert(dash.locked === false, 'still editable while window open (locked=false)');
assert(dash.allocations.find((a) => a.company_id === ids[0])?.amount === 1000000, 'dashboard pre-fills first submission');

// Re-submit: even split instead
r = await P('POST', '/api/me/allocations', { allocations: ids.map((cid) => ({ company_id: cid, amount: 200000, confidence: 3 })) });
assert(r.status === 201 && r.data.updated === true, `re-submission ok (updated=true) (${r.status})`);

dash = (await P('GET', '/api/me/dashboard')).data;
const a0 = dash.allocations.find((a) => a.company_id === ids[0])?.amount;
assert(a0 === 200000, `dashboard now reflects the latest (even) submission (${a0})`);
assert(dash.allocations.length === 5, 'all 5 positions stored from latest submission');

// Only ONE submission row should exist (no duplicates)
// Verify via scoring: returns all +10% -> even split -> exactly +10% (no leftover from first submit)
await admin('PUT', `/api/admin/rounds/${r1.id}/returns`, { returns: ids.map((cid) => ({ company_id: cid, base_return: 10, multipliers: [] })) });
await admin('POST', `/api/admin/rounds/${r1.id}/close`);
const snap = await admin('POST', `/api/admin/rounds/${r1.id}/snapshot`);
assert(snap.data.scored === 1, `exactly 1 participant scored, no dup submissions (${snap.data.scored})`);

const prof = (await P('GET', '/api/me/profile')).data;
assert(near(prof.netWorth, 1100000), `scored on LATEST submission: even split +10% -> 11,00,000 (${prof.netWorth})`);

// After close, further submission is rejected
r = await P('POST', '/api/me/allocations', { allocations: ids.map((cid) => ({ company_id: cid, amount: 200000, confidence: 3 })) });
assert(r.status === 409, `submission after window close rejected (${r.status})`);

console.log('\nRe-submission test done.');
