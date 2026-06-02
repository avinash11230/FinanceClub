// Throwaway end-to-end smoke test against the running API (port 4000).
const BASE = 'http://localhost:4000';

function makeClient() {
  let cookies = {};
  return async function call(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const cookieStr = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookieStr) headers.Cookie = cookieStr;
    const res = await fetch(BASE + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.getSetCookie?.() || [];
    for (const sc of setCookie) {
      const [pair] = sc.split(';');
      const [k, v] = pair.split('=');
      cookies[k] = v;
    }
    let data = null;
    try { data = await res.json(); } catch {}
    return { status: res.status, data };
  };
}

const assert = (cond, msg) => {
  if (!cond) { console.error('  ✗ FAIL:', msg); process.exitCode = 1; }
  else console.log('  ✓', msg);
};

const admin = makeClient();

// --- Admin login ---
let r = await admin('POST', '/api/admin/login', { email: 'admin@financeclub.iitm.ac.in', password: 'admin123' });
assert(r.status === 200, `admin login (${r.status})`);

// --- Reject wrong-domain signup ---
const tmp = makeClient();
r = await tmp('POST', '/api/auth/signup', { name: 'Bad Domain', email: 'someone@gmail.com', password: 'password123' });
assert(r.status === 400, `reject non-smail domain (${r.status}: ${r.data?.error})`);

// --- Get companies (need IDs) ---
r = await admin('GET', '/api/admin/companies');
const companies = r.data.companies;
assert(companies.length === 5, `5 companies seeded (${companies.length})`);
const [c1, c2, c3, c4, c5] = companies.map((c) => c.id);

// --- Find / open Round 1 ---
r = await admin('GET', '/api/admin/rounds');
let round = r.data.rounds[0];
const closesAt = new Date(Date.now() + 3600 * 1000).toISOString();
r = await admin('POST', `/api/admin/rounds/${round.id}/open`, { closes_at: closesAt });
assert(r.status === 200, `open round 1 (${r.status})`);

// --- Create participants with distinct strategies ---
async function signupAndAllocate(name, alloc, confidences) {
  const cl = makeClient();
  const email = `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}@smail.iitm.ac.in`;
  let res = await cl('POST', '/api/auth/signup', { name, email, password: 'password123' });
  assert(res.status === 201, `signup ${name} (${res.status} ${res.data?.error || ''})`);
  const allocations = companies.map((c, i) => ({
    company_id: c.id, amount: alloc[i], confidence: confidences[i],
  }));
  res = await cl('POST', '/api/me/allocations', { allocations });
  assert(res.status === 201, `allocate ${name} (${res.status} ${res.data?.error || ''})`);
  return cl;
}

// Diversifier: even spread, no company > 35%
const diversifier = await signupAndAllocate('Diversifier', [200000, 200000, 200000, 200000, 200000], [3, 3, 3, 3, 3]);
// Risk Junkie: 60% in one company
const junkie = await signupAndAllocate('RiskJunkie', [600000, 100000, 100000, 100000, 100000], [5, 2, 2, 2, 2]);
// Crowder A: 30% into c1 (to help c1 exceed crowd threshold)
const crowderA = await signupAndAllocate('CrowderA', [300000, 175000, 175000, 175000, 175000], [4, 3, 3, 3, 3]);
// Crowder B: 40% into c1
const crowderB = await signupAndAllocate('CrowderB', [400000, 150000, 150000, 150000, 150000], [4, 3, 3, 3, 3]);

// --- Reject allocation that doesn't total capital ---
const badCl = makeClient();
await badCl('POST', '/api/auth/signup', { name: 'BadTotal', email: 'badtotal@smail.iitm.ac.in', password: 'password123' });
r = await badCl('POST', '/api/me/allocations', {
  allocations: companies.map((c) => ({ company_id: c.id, amount: 100000, confidence: 3 })),
});
assert(r.status === 400, `reject total != capital (${r.status}: ${r.data?.error})`);

// --- Admin sets hidden returns + a multiplier ---
const returns = {
  returns: [
    { company_id: c1, base_return: 10, multipliers: [{ label: 'News A', value: 1.3 }] }, // crowded -> dilution
    { company_id: c2, base_return: 8, multipliers: [] },
    { company_id: c3, base_return: -5, multipliers: [{ label: 'News C', value: 0.7 }] },
    { company_id: c4, base_return: 4, multipliers: [] },
    { company_id: c5, base_return: 15, multipliers: [] },
  ],
};
r = await admin('PUT', `/api/admin/rounds/${round.id}/returns`, returns);
assert(r.status === 200, `set returns (${r.status})`);

// --- Analytics heatmap should flag c1 as crowding ---
r = await admin('GET', `/api/admin/analytics?round_id=${round.id}`);
const c1meta = r.data.companies.find((x) => x.company_id === c1);
assert(r.data.poolSize === 4, `analytics pool size 4 (${r.data.poolSize})`);
assert(c1meta.crowders === 3, `c1 has 3 crowders >25% (${c1meta.crowders})`); // junkie(60),crowderA(30),crowderB(40)
assert(c1meta.will_dilute === true, `c1 flagged to dilute (ratio ${c1meta.crowd_ratio} > 40)`);

// --- Trigger snapshot ---
r = await admin('POST', `/api/admin/rounds/${round.id}/snapshot`);
assert(r.status === 200, `trigger snapshot (${r.status} ${r.data?.error || ''})`);
assert(r.data.scored === 4, `scored 4 participants (${r.data.scored})`);

// --- Leaderboard ---
r = await diversifier('GET', '/api/me/leaderboard');
assert(r.data.published === true, 'leaderboard published');
assert(r.data.returns.length === 4 && r.data.overall.length === 4, 'both boards have 4 rows');
assert(r.data.returns.every((x) => !('value' in x) || typeof x.value === 'number'), 'returns rows have values');
assert(r.data.returns.some((x) => x.movement === 'new'), 'rank movement NEW present on first snapshot');
console.log('  Leaderboard (returns):', r.data.returns.map((x) => `${x.rank}. ${x.name} ${x.value}%`).join(' | '));
console.log('  Leaderboard (overall):', r.data.overall.map((x) => `${x.rank}. ${x.name} ${x.value}`).join(' | '));

// --- Verify scoring math for the Diversifier (no dilution: never >25% anywhere) ---
// gross: c1=10*1.3=13, c2=8, c3=-5*0.7=-3.5, c4=4, c5=15 ; equal 20% each
const expectedDiv = 0.2 * (13 + 8 + -3.5 + 4 + 15);
r = await diversifier('GET', '/api/me/profile');
const divScore = r.data.scores[r.data.scores.length - 1];
assert(Math.abs(divScore.portfolio_return - expectedDiv) < 0.01,
  `Diversifier portfolio return = ${divScore.portfolio_return} (expected ${expectedDiv})`);
assert(divScore.risk_score === 100, `Diversifier risk score 100 (${divScore.risk_score})`);
assert(divScore.title === 'The Diversifier', `Diversifier title (${divScore.title})`);

// --- Verify Risk Junkie got concentration penalty + dilution on c1 ---
r = await junkie('GET', '/api/me/profile');
const junkieScore = r.data.scores[r.data.scores.length - 1];
// junkie: c1 60% crowded+diluted -> 13-5=8 ; rest 10% each at gross
const expJunkie = 0.6 * 8 + 0.1 * (8 + -3.5 + 4 + 15);
assert(Math.abs(junkieScore.portfolio_return - expJunkie) < 0.01,
  `RiskJunkie portfolio return = ${junkieScore.portfolio_return} (expected ${expJunkie}, dilution applied)`);
assert(junkieScore.risk_score < 70, `RiskJunkie risk penalty (${junkieScore.risk_score})`);
assert(junkieScore.title === 'Risk Junkie', `RiskJunkie title (${junkieScore.title})`);

// --- Re-submit should be locked ---
r = await diversifier('POST', '/api/me/allocations', {
  allocations: companies.map((c) => ({ company_id: c.id, amount: 200000, confidence: 3 })),
});
assert(r.status === 409, `re-submit locked (${r.status})`);

// --- Ghost portfolio hidden until competition ends ---
r = await diversifier('GET', '/api/me/ghost');
assert(r.data.revealed === false, 'ghost hidden during competition');
await admin('POST', '/api/admin/competition/end');
r = await diversifier('GET', '/api/me/ghost');
assert(r.data.revealed === true && typeof r.data.ghostReturn === 'number', `ghost revealed = ${r.data.ghostReturn}%`);
await admin('POST', '/api/admin/competition/reopen');

console.log('\nE2E smoke test done.');
