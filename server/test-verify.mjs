// Tests the email-verification flow + admin participant management.
// Run with the server up and REQUIRE_EMAIL_VERIFICATION=1.
import { createClient } from '@libsql/client';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'http://localhost:4000';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = createClient({ url: 'file:' + path.join(__dirname, 'data', 'arena.db') });

const assert = (c, m) => { if (!c) { console.error('  ✗ FAIL:', m); process.exitCode = 1; } else console.log('  ✓', m); };

function client() {
  let cookies = {};
  return async (method, p, body) => {
    const headers = { 'Content-Type': 'application/json' };
    const cs = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    if (cs) headers.Cookie = cs;
    const res = await fetch(BASE + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
    for (const sc of res.headers.getSetCookie?.() || []) {
      const [pair] = sc.split(';'); const [k, v] = pair.split('='); cookies[k] = v;
    }
    let data = null; try { data = await res.json(); } catch {}
    return { status: res.status, data };
  };
}
const codeFor = async (email) =>
  (await db.execute({ sql: 'SELECT verify_code FROM participants WHERE email = ?', args: [email] })).rows[0]?.verify_code;

const email = 'verifytest@smail.iitm.ac.in';
// clean any prior run
await db.execute({ sql: 'DELETE FROM participants WHERE email = ?', args: [email] });

const c = client();

// 1. signup -> needsVerification, NO session
let r = await c('POST', '/api/auth/signup', { name: 'Verify Test', email, password: 'password123' });
assert(r.status === 201 && r.data.needsVerification === true, `signup returns needsVerification (${r.status})`);
r = await c('GET', '/api/me/dashboard');
assert(r.status === 401, `not logged in until verified (${r.status})`);

// 2. login before verify -> 403 needsVerification
const c2 = client();
r = await c2('POST', '/api/auth/login', { email, password: 'password123' });
assert(r.status === 403 && r.data.needsVerification, `login blocked until verified (${r.status})`);

// 3. wrong code -> 400
r = await c('POST', '/api/auth/verify', { email, code: '000000' });
assert(r.status === 400, `wrong code rejected (${r.status}: ${r.data?.error})`);

// 4. correct code -> logged in
const code = await codeFor(email);
assert(/^\d{6}$/.test(code || ''), `6-digit code stored (${code})`);
r = await c('POST', '/api/auth/verify', { email, code });
assert(r.status === 200 && r.data.user?.email === email, `verify succeeds + logs in (${r.status})`);
r = await c('GET', '/api/me/dashboard');
assert(r.status === 200, `dashboard accessible after verify (${r.status})`);

// 5. login now works (verified)
const c3 = client();
r = await c3('POST', '/api/auth/login', { email, password: 'password123' });
assert(r.status === 200, `login works after verification (${r.status})`);

// 6. resend throttle
r = await c3('POST', '/api/auth/resend', { email: 'someoneelse@smail.iitm.ac.in' });
assert(r.status === 200, `resend for unknown email returns ok (no enumeration) (${r.status})`);

// --- Admin participant management ---
const admin = client();
r = await admin('POST', '/api/admin/login', { email: 'admin@financeclub.iitm.ac.in', password: 'admin123' });
assert(r.status === 200, `admin login (${r.status})`);
r = await admin('GET', '/api/admin/participants');
const found = r.data.participants.find((p) => p.email === email);
assert(!!found, 'admin sees the participant in list');
assert(found.verified === 1, 'participant shows as verified');
assert(typeof found.submissions === 'number', 'participant has submissions count');

// delete it
r = await admin('DELETE', `/api/admin/participants/${found.id}`);
assert(r.status === 200, `admin deletes participant (${r.status})`);
const gone = (await db.execute({ sql: 'SELECT id FROM participants WHERE email = ?', args: [email] })).rows.length === 0;
assert(gone, 'participant removed from DB');

console.log('\nVerification + participant-management test done.');
