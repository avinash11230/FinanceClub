// Tests the admin top-N export (union of both boards, deduplicated).
const BASE = 'http://localhost:4000';
const assert = (c, m) => { if (!c) { console.error('  ✗ FAIL:', m); process.exitCode = 1; } else console.log('  ✓', m); };

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

// 4 participants with different strategies so the two boards differ.
async function player(name, alloc) {
  const c = makeClient();
  await c('POST', '/api/auth/signup', { name, email: `${name.toLowerCase()}@smail.iitm.ac.in`, password: 'password123' });
  await c('POST', '/api/me/allocations', { allocations: ids.map((cid, i) => ({ company_id: cid, amount: alloc[i], confidence: 3 })) });
}
await player('Aaa', [1000000, 0, 0, 0, 0]);        // concentrated: high return, low risk score
await player('Bbb', [200000, 200000, 200000, 200000, 200000]); // diversified
await player('Ccc', [300000, 175000, 175000, 175000, 175000]);
await player('Ddd', [250000, 250000, 250000, 250000, 0]);

await admin('PUT', `/api/admin/rounds/${r1.id}/returns`, { returns: ids.map((cid, i) => ({ company_id: cid, base_return: [30, 5, 5, 5, 5][i], multipliers: [] })) });
await admin('POST', `/api/admin/rounds/${r1.id}/snapshot`);

// Export top 2 of each board.
const r = await admin('GET', '/api/admin/export/top?n=2');
assert(r.status === 200, `export endpoint ok (${r.status})`);
const ppl = r.data.participants;
console.log('  exported:', ppl.map((p) => `${p.name}(nw#${p.rank_returns},ov#${p.rank_overall})`).join(', '));
assert(ppl.every((p) => p.name && p.email), 'every row has name + email');
assert(ppl.every((p) => p.email.endsWith('@smail.iitm.ac.in')), 'emails present');
// dedup: count == unique participant ids
const emails = ppl.map((p) => p.email);
assert(new Set(emails).size === emails.length, 'no duplicate participants (deduplicated across both boards)');
// everyone exported is in top-2 of at least one board
assert(ppl.every((p) => p.in_networth_top || p.in_overall_top), 'every exported person is in top-2 of at least one board');
// union should be >= 2 and <= 4
assert(r.data.count >= 2 && r.data.count <= 4, `union count between 2 and 4 (${r.data.count})`);

console.log('\nExport test done.');
