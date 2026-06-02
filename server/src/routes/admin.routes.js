// Admin routes: separate login, company manager, round manager, returns
// manager (hidden base returns + multipliers), leaderboard trigger, analytics
// heatmap, round recap, and competition controls. Admins are seeded only.
import { Router } from 'express';
import { z } from 'zod';
import { all, get, run, tx, getSetting, setSetting } from '../db.js';
import {
  hashPassword, verifyPassword, issueToken, clearToken, requireAdmin,
} from '../auth.js';
import { scoreRound, ghostPortfolioReturn, SCORING } from '../scoring.js';

const router = Router();
const CAPITAL = Number(process.env.STARTING_CAPITAL || 1000000);

// ---- auth (no signup — admins are seeded) ---------------------------------
const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Email and password required.' });
  const { email, password } = parsed.data;
  const admin = get('SELECT * FROM admins WHERE email = ?', [email]);
  if (!admin || !(await verifyPassword(password, admin.password_hash))) {
    return res.status(401).json({ error: 'Invalid admin credentials.' });
  }
  issueToken(res, { role: 'admin', id: admin.id, email: admin.email });
  res.json({ admin: { id: admin.id, name: admin.name, email: admin.email } });
});

router.post('/logout', (req, res) => {
  clearToken(res, 'admin');
  res.json({ ok: true });
});

// Everything below requires an admin session.
router.use(requireAdmin);

router.get('/me', (req, res) => res.json({ admin: req.admin }));

// ---- Company Manager -------------------------------------------------------
const companySchema = z.object({
  name: z.string().trim().min(1),
  ticker: z.string().trim().max(12).optional().nullable(),
  logo_url: z.string().trim().optional().nullable(),
  sector: z.string().trim().optional().nullable(),
  description: z.string().optional().nullable(),
  metrics: z.string().optional().nullable(),
  history: z.string().optional().nullable(),
  sort_order: z.number().int().optional(),
});

router.get('/companies', (req, res) => {
  res.json({ companies: all('SELECT * FROM companies ORDER BY sort_order, id') });
});

router.post('/companies', (req, res) => {
  const parsed = companySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const c = parsed.data;
  const result = run(
    `INSERT INTO companies (name, ticker, logo_url, sector, description, metrics, history, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [c.name, c.ticker || null, c.logo_url || null, c.sector || null, c.description || null,
     c.metrics || null, c.history || null, c.sort_order ?? 0]
  );
  res.status(201).json({ id: Number(result.lastInsertRowid) });
});

router.put('/companies/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!get('SELECT id FROM companies WHERE id = ?', [id])) {
    return res.status(404).json({ error: 'Company not found.' });
  }
  const parsed = companySchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const fields = parsed.data;
  const keys = Object.keys(fields);
  if (keys.length === 0) return res.json({ ok: true });
  const setClause = keys.map((k) => `${k} = ?`).join(', ');
  run(`UPDATE companies SET ${setClause} WHERE id = ?`, [...keys.map((k) => fields[k]), id]);
  res.json({ ok: true });
});

router.delete('/companies/:id', (req, res) => {
  run('DELETE FROM companies WHERE id = ?', [Number(req.params.id)]);
  res.json({ ok: true });
});

// ---- Round Manager ---------------------------------------------------------
router.get('/rounds', (req, res) => {
  const rounds = all('SELECT * FROM rounds ORDER BY round_number');
  // attach submission counts
  for (const r of rounds) {
    const c = get('SELECT COUNT(*) AS n FROM submissions WHERE round_id = ?', [r.id]);
    r.submissions = c.n;
    const snap = get('SELECT COUNT(*) AS n FROM snapshots WHERE round_id = ?', [r.id]);
    r.snapshots = snap.n;
  }
  res.json({ rounds });
});

// Create the next round (round_number auto-increments).
router.post('/rounds', (req, res) => {
  const last = get('SELECT MAX(round_number) AS max FROM rounds');
  const nextNumber = (last?.max || 0) + 1;
  const result = run('INSERT INTO rounds (round_number, status) VALUES (?, ?)', [nextNumber, 'pending']);
  const id = Number(result.lastInsertRowid);
  // pre-create return rows so the Returns Manager has editable defaults
  for (const c of all('SELECT id FROM companies')) {
    run('INSERT OR IGNORE INTO round_company_returns (round_id, company_id) VALUES (?, ?)', [id, c.id]);
  }
  res.status(201).json({ id, round_number: nextNumber });
});

const openSchema = z.object({ closes_at: z.string().min(1) }); // ISO string

router.post('/rounds/:id/open', (req, res) => {
  const id = Number(req.params.id);
  const round = get('SELECT * FROM rounds WHERE id = ?', [id]);
  if (!round) return res.status(404).json({ error: 'Round not found.' });
  const parsed = openSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'A valid closing time is required.' });
  // close any other open round first (only one window open at a time)
  run(`UPDATE rounds SET status = 'closed', closed_at = datetime('now') WHERE status = 'open' AND id != ?`, [id]);
  run(
    `UPDATE rounds SET status = 'open', opened_at = COALESCE(opened_at, datetime('now')), closes_at = ?, closed_at = NULL WHERE id = ?`,
    [parsed.data.closes_at, id]
  );
  res.json({ ok: true });
});

router.post('/rounds/:id/close', (req, res) => {
  const id = Number(req.params.id);
  run(`UPDATE rounds SET status = 'closed', closed_at = datetime('now') WHERE id = ?`, [id]);
  res.json({ ok: true });
});

router.put('/rounds/:id/recap', (req, res) => {
  const id = Number(req.params.id);
  const recap = typeof req.body?.recap === 'string' ? req.body.recap : '';
  run('UPDATE rounds SET recap = ? WHERE id = ?', [recap, id]);
  res.json({ ok: true });
});

// ---- Returns Manager (hidden base returns + multipliers) -------------------
router.get('/rounds/:id/returns', (req, res) => {
  const id = Number(req.params.id);
  const companies = all('SELECT id, name, ticker FROM companies ORDER BY sort_order, id');
  const rows = all('SELECT * FROM round_company_returns WHERE round_id = ?', [id]);
  const byCompany = {};
  for (const r of rows) byCompany[r.company_id] = r;
  res.json({
    returns: companies.map((c) => {
      const r = byCompany[c.id];
      let multipliers = [];
      try { multipliers = JSON.parse(r?.multipliers || '[]'); } catch { multipliers = []; }
      return {
        company_id: c.id,
        name: c.name,
        ticker: c.ticker,
        base_return: r?.base_return ?? 0,
        multipliers,
      };
    }),
  });
});

const returnsSchema = z.object({
  returns: z.array(
    z.object({
      company_id: z.number().int().positive(),
      base_return: z.number(),
      multipliers: z.array(z.object({ label: z.string(), value: z.number() })).default([]),
    })
  ),
});

router.put('/rounds/:id/returns', (req, res) => {
  const id = Number(req.params.id);
  if (!get('SELECT id FROM rounds WHERE id = ?', [id])) {
    return res.status(404).json({ error: 'Round not found.' });
  }
  const parsed = returnsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  tx(() => {
    for (const r of parsed.data.returns) {
      run(
        `INSERT INTO round_company_returns (round_id, company_id, base_return, multipliers)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(round_id, company_id)
         DO UPDATE SET base_return = excluded.base_return, multipliers = excluded.multipliers`,
        [id, r.company_id, r.base_return, JSON.stringify(r.multipliers)]
      );
    }
  });
  res.json({ ok: true });
});

// ---- Leaderboard Trigger ---------------------------------------------------
router.post('/rounds/:id/snapshot', (req, res) => {
  const id = Number(req.params.id);
  try {
    const summary = scoreRound(id);
    res.json({ ok: true, ...summary });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/snapshots', (req, res) => {
  const snaps = all(
    `SELECT sn.id, sn.round_id, sn.created_at, r.round_number,
            (SELECT COUNT(*) FROM scores WHERE snapshot_id = sn.id) AS scored
       FROM snapshots sn JOIN rounds r ON r.id = sn.round_id
      ORDER BY sn.id DESC`
  );
  res.json({ snapshots: snaps });
});

// ---- Analytics: allocation heatmap (admin-only) ----------------------------
router.get('/analytics', (req, res) => {
  const roundId = req.query.round_id
    ? Number(req.query.round_id)
    : get(`SELECT id FROM rounds WHERE status = 'open' ORDER BY round_number DESC LIMIT 1`)?.id ||
      get('SELECT id FROM rounds ORDER BY round_number DESC LIMIT 1')?.id;

  if (!roundId) return res.json({ round_id: null, poolSize: 0, companies: [] });

  const poolSize = get('SELECT COUNT(*) AS n FROM submissions WHERE round_id = ?', [roundId]).n;
  const companies = all('SELECT id, name, ticker FROM companies ORDER BY sort_order, id');

  const data = companies.map((c) => {
    const rows = all(
      'SELECT amount FROM allocations WHERE round_id = ? AND company_id = ?',
      [roundId, c.id]
    );
    const investors = rows.length;
    const totalAmount = rows.reduce((s, r) => s + r.amount, 0);
    const crowders = rows.filter((r) => (r.amount / CAPITAL) * 100 > SCORING.CROWD_ALLOC_THRESHOLD_PCT).length;
    const crowdRatio = poolSize > 0 ? (crowders / poolSize) * 100 : 0;
    const avgPct = poolSize > 0 ? (totalAmount / (poolSize * CAPITAL)) * 100 : 0;
    return {
      company_id: c.id,
      name: c.name,
      ticker: c.ticker,
      investors,
      total_amount: totalAmount,
      avg_pct: Math.round(avgPct * 100) / 100,
      crowders,
      crowd_ratio: Math.round(crowdRatio * 100) / 100,
      will_dilute: crowdRatio > SCORING.CROWD_POOL_THRESHOLD_PCT,
    };
  });

  res.json({ round_id: roundId, poolSize, threshold: SCORING.CROWD_POOL_THRESHOLD_PCT, companies: data });
});

// ---- Competition controls + settings --------------------------------------
router.get('/settings', (req, res) => {
  res.json({
    competition_ended: getSetting('competition_ended', '0') === '1',
    scoring: SCORING,
    participants: get('SELECT COUNT(*) AS n FROM participants').n,
  });
});

router.post('/competition/end', (req, res) => {
  setSetting('competition_ended', '1');
  const snap = get('SELECT id FROM snapshots ORDER BY id DESC LIMIT 1');
  res.json({ ok: true, ghostReturn: snap ? ghostPortfolioReturn(snap.id) : null });
});

router.post('/competition/reopen', (req, res) => {
  setSetting('competition_ended', '0');
  res.json({ ok: true });
});

export default router;
