// Participant data routes: dashboard, company details, allocation submission,
// leaderboards, profile, and the post-competition ghost portfolio.
import { Router } from 'express';
import { z } from 'zod';
import { all, get, run, tx, getSetting } from '../db.js';
import { requireParticipant } from '../auth.js';
import { ghostPortfolioReturn } from '../scoring.js';

const router = Router();
const CAPITAL = Number(process.env.STARTING_CAPITAL || 1000000);

router.use(requireParticipant);

// The round currently accepting allocations, else the most recent round.
function currentRound() {
  return (
    get(`SELECT * FROM rounds WHERE status = 'open' ORDER BY round_number DESC LIMIT 1`) ||
    get(`SELECT * FROM rounds ORDER BY round_number DESC LIMIT 1`)
  );
}

// Public-safe company fields (never exposes returns/multipliers).
function publicCompanies() {
  return all(
    `SELECT id, name, ticker, logo_url, sector, description, metrics, history, sort_order
       FROM companies ORDER BY sort_order, id`
  );
}

function myAllocations(participantId, roundId) {
  return all(
    `SELECT company_id, amount, confidence FROM allocations
      WHERE participant_id = ? AND round_id = ?`,
    [participantId, roundId]
  );
}

// GET /api/me/dashboard
router.get('/dashboard', (req, res) => {
  const me = req.participant;
  const companies = publicCompanies();
  const round = currentRound();

  let submission = null;
  let allocations = [];
  if (round) {
    submission = get(
      'SELECT id, submitted_at FROM submissions WHERE participant_id = ? AND round_id = ?',
      [me.id, round.id]
    );
    if (submission) allocations = myAllocations(me.id, round.id);
  }

  const locked = !round || round.status !== 'open' || !!submission;

  res.json({
    capital: CAPITAL,
    companies,
    round: round
      ? {
          id: round.id,
          number: round.round_number,
          status: round.status,
          closes_at: round.closes_at,
          opened_at: round.opened_at,
          recap: round.recap,
        }
      : null,
    submitted: !!submission,
    locked,
    allocations,
  });
});

// GET /api/me/companies  (full details list for modal/side panel)
router.get('/companies', (req, res) => {
  res.json({ companies: publicCompanies() });
});

// POST /api/me/allocations  — submit (and lock) allocations for the open round.
const allocationSchema = z.object({
  allocations: z
    .array(
      z.object({
        company_id: z.number().int().positive(),
        amount: z.number().min(0),
        confidence: z.number().int().min(1).max(5),
      })
    )
    .min(1),
});

router.post('/allocations', (req, res) => {
  const me = req.participant;
  const parsed = allocationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { allocations } = parsed.data;

  const round = currentRound();
  if (!round || round.status !== 'open') {
    return res.status(409).json({ error: 'The reallocation window is not open right now.' });
  }

  const already = get(
    'SELECT id FROM submissions WHERE participant_id = ? AND round_id = ?',
    [me.id, round.id]
  );
  if (already) {
    return res.status(409).json({ error: 'You have already submitted for this round. Allocations are locked.' });
  }

  // Validate companies are real and unique.
  const validIds = new Set(all('SELECT id FROM companies').map((c) => c.id));
  const seen = new Set();
  for (const a of allocations) {
    if (!validIds.has(a.company_id)) return res.status(400).json({ error: 'Unknown company in allocation.' });
    if (seen.has(a.company_id)) return res.status(400).json({ error: 'Duplicate company in allocation.' });
    seen.add(a.company_id);
  }

  // Total must equal exactly the starting capital (allow ₹1 rounding tolerance).
  const total = allocations.reduce((s, a) => s + a.amount, 0);
  if (Math.abs(total - CAPITAL) > 1) {
    return res.status(400).json({
      error: `Total allocation must equal ₹${CAPITAL.toLocaleString('en-IN')}. Currently ₹${Math.round(total).toLocaleString('en-IN')}.`,
    });
  }

  tx(() => {
    const sub = run(
      'INSERT INTO submissions (participant_id, round_id) VALUES (?, ?)',
      [me.id, round.id]
    );
    const submissionId = sub.lastInsertRowid;
    for (const a of allocations) {
      if (a.amount <= 0) continue; // store only funded positions
      run(
        `INSERT INTO allocations (submission_id, participant_id, round_id, company_id, amount, confidence)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [submissionId, me.id, round.id, a.company_id, a.amount, a.confidence]
      );
    }
  });

  res.status(201).json({ ok: true, locked: true });
});

// GET /api/me/leaderboard — latest published snapshot, both boards.
router.get('/leaderboard', (req, res) => {
  const snap = get('SELECT id, round_id, created_at FROM snapshots ORDER BY id DESC LIMIT 1');
  if (!snap) {
    return res.json({ published: false, returns: [], overall: [], snapshot: null });
  }
  const round = get('SELECT round_number FROM rounds WHERE id = ?', [snap.round_id]);

  const rows = all(
    `SELECT s.participant_id, p.name, s.portfolio_return, s.overall_score, s.title,
            s.rank_returns, s.rank_overall, s.prev_rank_returns, s.prev_rank_overall
       FROM scores s JOIN participants p ON p.id = s.participant_id
      WHERE s.snapshot_id = ?`,
    [snap.id]
  );

  const decorate = (row, rankField, prevField) => {
    const rank = row[rankField];
    const prev = row[prevField];
    let movement = 'same';
    let delta = 0;
    if (prev == null) movement = 'new';
    else if (prev > rank) { movement = 'up'; delta = prev - rank; }
    else if (prev < rank) { movement = 'down'; delta = rank - prev; }
    return {
      participant_id: row.participant_id,
      name: row.name,
      title: row.title,
      rank,
      movement,
      delta,
      isMe: row.participant_id === req.participant.id,
    };
  };

  const returns = rows
    .map((r) => ({ ...decorate(r, 'rank_returns', 'prev_rank_returns'), value: r.portfolio_return }))
    .sort((a, b) => a.rank - b.rank);
  const overall = rows
    .map((r) => ({ ...decorate(r, 'rank_overall', 'prev_rank_overall'), value: r.overall_score }))
    .sort((a, b) => a.rank - b.rank);

  res.json({
    published: true,
    snapshot: { id: snap.id, created_at: snap.created_at, round_number: round?.round_number },
    returns,
    overall,
  });
});

// GET /api/me/profile — allocation history, score breakdown, confidence vs returns.
router.get('/profile', (req, res) => {
  const me = req.participant;
  const companies = publicCompanies();

  // Allocation history: one entry per round the participant submitted.
  const subs = all(
    `SELECT s.round_id, r.round_number, s.submitted_at
       FROM submissions s JOIN rounds r ON r.id = s.round_id
      WHERE s.participant_id = ? ORDER BY r.round_number`,
    [me.id]
  );
  const history = subs.map((sub) => {
    const allocs = myAllocations(me.id, sub.round_id);
    const byCompany = {};
    for (const a of allocs) byCompany[a.company_id] = { amount: a.amount, confidence: a.confidence };
    return {
      round_id: sub.round_id,
      round_number: sub.round_number,
      submitted_at: sub.submitted_at,
      allocations: companies.map((c) => ({
        company_id: c.id,
        name: c.name,
        amount: byCompany[c.id]?.amount || 0,
        pct: ((byCompany[c.id]?.amount || 0) / CAPITAL) * 100,
        confidence: byCompany[c.id]?.confidence || 0,
      })),
    };
  });

  // Score breakdown across snapshots.
  const scores = all(
    `SELECT sc.snapshot_id, sc.round_id, r.round_number, sn.created_at,
            sc.portfolio_return, sc.return_score, sc.risk_score, sc.consistency_score,
            sc.overall_score, sc.turnover, sc.max_alloc_pct, sc.companies_used, sc.title,
            sc.rank_returns, sc.rank_overall
       FROM scores sc
       JOIN snapshots sn ON sn.id = sc.snapshot_id
       JOIN rounds r ON r.id = sc.round_id
      WHERE sc.participant_id = ?
      ORDER BY sc.snapshot_id`,
    [me.id]
  );

  // Confidence vs actual returns: average confidence per round vs that round's return.
  const confidenceVsReturns = history.map((h) => {
    const funded = h.allocations.filter((a) => a.amount > 0);
    const weightedConf =
      funded.reduce((s, a) => s + a.confidence * a.amount, 0) /
      (funded.reduce((s, a) => s + a.amount, 0) || 1);
    const score = scores.find((s) => s.round_id === h.round_id);
    return {
      round_number: h.round_number,
      avg_confidence: Math.round(weightedConf * 100) / 100,
      portfolio_return: score ? score.portfolio_return : null,
    };
  });

  const latest = scores[scores.length - 1] || null;

  res.json({
    user: me,
    capital: CAPITAL,
    currentTitle: latest?.title || null,
    history,
    scores,
    confidenceVsReturns,
  });
});

// GET /api/me/ghost — equal-weight benchmark, revealed only after competition ends.
router.get('/ghost', (req, res) => {
  const ended = getSetting('competition_ended', '0') === '1';
  if (!ended) return res.json({ revealed: false, ghostReturn: null });
  const snap = get('SELECT id FROM snapshots ORDER BY id DESC LIMIT 1');
  if (!snap) return res.json({ revealed: true, ghostReturn: null });
  res.json({ revealed: true, ghostReturn: ghostPortfolioReturn(snap.id) });
});

export default router;
