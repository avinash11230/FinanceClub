// The automated scoring engine. Runs in full every time an admin triggers a
// leaderboard snapshot for a round.
//
// COMPOUNDED model: each participant's capital carries forward across rounds.
// They start at STARTING_CAPITAL and allocate their *current* capital each round;
// the round's portfolio return grows or shrinks it. The leaderboard ranks by
// total net worth (capital_after).
//
//   1. Base company returns        (admin-set, hidden)
//   2. Event multipliers           (admin-set, hidden) -> gross return
//   3. Crowd dilution              (herd behaviour penalised, per-participant)
//   4. Portfolio return            (allocation-weighted average) -> round P&L
//   5. Risk score                  (concentration penalty / diversification bonus)
//   6. Consistency score           (turnover / panic-switch penalty)
//
//   net worth = capital carried + this round's P&L  (the primary ranking)
//   overall   = 60% cumulative return + 20% risk + 20% consistency
import { all, get, tx } from './db.js';

const STARTING_CAPITAL = Number(process.env.STARTING_CAPITAL || 1000000);

export const SCORING = {
  CAPITAL: STARTING_CAPITAL,
  CROWD_ALLOC_THRESHOLD_PCT: 25,
  CROWD_POOL_THRESHOLD_PCT: 40,
  CROWD_DILUTION_PP: 5,
  CONCENTRATION_LIMIT_PCT: 50,
  DIVERSIFY_MAX_PCT: 35,
  DIVERSIFY_MIN_COMPANIES: 4,
  PANIC_TURNOVER_PCT: 70,
  WEIGHTS: { return: 0.6, risk: 0.2, consistency: 0.2 },
};

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const round2 = (n) => Math.round(n * 100) / 100;

function multiplierProduct(multipliersJson) {
  let arr = [];
  try { arr = JSON.parse(multipliersJson || '[]'); } catch { arr = []; }
  return arr.reduce((acc, m) => acc * (Number(m?.value) || 1), 1);
}

// Allocation %-by-company for a participant in a round, as a share of THAT
// round's total allocation (== their capital that round, since they allocate it
// all). Capital-independent, so it works under compounding.
async function allocPctMap(participantId, roundId) {
  const rows = await all(
    `SELECT company_id, amount FROM allocations WHERE participant_id = ? AND round_id = ?`,
    [participantId, roundId]
  );
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const map = {};
  if (total > 0) for (const r of rows) map[r.company_id] = (r.amount / total) * 100;
  return map;
}

async function previousRoundForParticipant(participantId, roundNumber) {
  return get(
    `SELECT r.id, r.round_number
       FROM submissions s JOIN rounds r ON r.id = s.round_id
      WHERE s.participant_id = ? AND r.round_number < ?
      ORDER BY r.round_number DESC LIMIT 1`,
    [participantId, roundNumber]
  );
}

function computeTurnover(curMap, prevMap) {
  const ids = new Set([...Object.keys(curMap), ...Object.keys(prevMap)]);
  let sum = 0;
  for (const id of ids) sum += Math.abs((curMap[id] || 0) - (prevMap[id] || 0));
  return sum / 2;
}

function riskScore(maxPct, companiesUsed) {
  if (maxPct <= SCORING.DIVERSIFY_MAX_PCT && companiesUsed >= SCORING.DIVERSIFY_MIN_COMPANIES) return 100;
  if (maxPct > SCORING.CONCENTRATION_LIMIT_PCT) return clamp(70 - (maxPct - SCORING.CONCENTRATION_LIMIT_PCT) * 1.4, 0, 100);
  return 70;
}

// Cumulative return % normalised to 0..100 for the composite (0% -> 50, +50% -> 100).
function cumulativeReturnToScore(pct) {
  return clamp(50 + pct, 0, 100);
}

function pickTitle({ maxPct, companiesUsed, turnover, hasPrev, contrarian }) {
  if (maxPct > SCORING.CONCENTRATION_LIMIT_PCT) return 'Risk Junkie';
  if (hasPrev && turnover > SCORING.PANIC_TURNOVER_PCT) return 'Momentum Chaser';
  if (contrarian) return 'The Contrarian';
  if (maxPct <= SCORING.DIVERSIFY_MAX_PCT && companiesUsed >= SCORING.DIVERSIFY_MIN_COMPANIES) return 'The Diversifier';
  if (hasPrev && turnover < 15) return 'Conviction Player';
  return 'The Strategist';
}

function rankInPlace(rows, field, rankField) {
  const sorted = [...rows].sort((a, b) => b[field] - a[field]);
  sorted.forEach((row, i) => { row[rankField] = i + 1; });
}

export async function scoreRound(roundId) {
  const round = await get('SELECT * FROM rounds WHERE id = ?', [roundId]);
  if (!round) throw new Error('Round not found.');

  const companies = await all('SELECT id, name FROM companies ORDER BY sort_order, id');
  if (companies.length === 0) throw new Error('No companies configured.');

  const returnsRows = await all(
    'SELECT company_id, base_return, multipliers FROM round_company_returns WHERE round_id = ?',
    [roundId]
  );
  const returnsByCompany = {};
  for (const c of companies) returnsByCompany[c.id] = { base: 0, mult: 1 };
  for (const r of returnsRows) {
    returnsByCompany[r.company_id] = { base: r.base_return, mult: multiplierProduct(r.multipliers) };
  }

  const submitters = await all(
    `SELECT p.id, p.name FROM submissions s JOIN participants p ON p.id = s.participant_id WHERE s.round_id = ?`,
    [roundId]
  );
  const submitterIds = new Set(submitters.map((p) => p.id));
  const poolSize = submitters.length;

  // Previous snapshot = the carried-forward state of everyone scored so far.
  const prevSnap = await get('SELECT id FROM snapshots ORDER BY id DESC LIMIT 1');
  const prev = {}; // participant_id -> prior row
  if (prevSnap) {
    for (const row of await all(
      `SELECT participant_id, capital_after, risk_score, consistency_score, title, rank_returns, rank_overall
         FROM scores WHERE snapshot_id = ?`,
      [prevSnap.id]
    )) prev[row.participant_id] = row;
  }
  const capitalBefore = (pid) => (prev[pid]?.capital_after ?? STARTING_CAPITAL);

  // --- Steps 1-2: gross return per company ---------------------------------
  const gross = {};
  for (const c of companies) gross[c.id] = returnsByCompany[c.id].base * returnsByCompany[c.id].mult;

  // --- Step 3: crowd dilution (share of THIS round's submitter pool) --------
  const crowdersByCompany = {};
  for (const c of companies) crowdersByCompany[c.id] = new Set();
  const allocMaps = {};
  for (const p of submitters) {
    const map = await allocPctMap(p.id, roundId);
    allocMaps[p.id] = map;
    for (const [cid, pct] of Object.entries(map)) {
      if (pct > SCORING.CROWD_ALLOC_THRESHOLD_PCT) crowdersByCompany[cid].add(p.id);
    }
  }
  const companyMeta = {};
  for (const c of companies) {
    const crowders = crowdersByCompany[c.id].size;
    const ratio = poolSize > 0 ? (crowders / poolSize) * 100 : 0;
    companyMeta[c.id] = { crowders, ratio, diluted: ratio > SCORING.CROWD_POOL_THRESHOLD_PCT };
  }

  // --- Per-participant scoring (submitters + carried-forward) ---------------
  const results = [];

  for (const p of submitters) {
    const map = allocMaps[p.id];
    const pctValues = companies.map((c) => map[c.id] || 0);
    const maxPct = Math.max(0, ...pctValues);
    const companiesUsed = pctValues.filter((v) => v > 0).length;

    let roundReturn = 0;
    let contrarian = false;
    for (const c of companies) {
      const pct = map[c.id] || 0;
      if (pct <= 0) continue;
      const meta = companyMeta[c.id];
      const isCrowder = crowdersByCompany[c.id].has(p.id);
      const effective = gross[c.id] - (meta.diluted && isCrowder ? SCORING.CROWD_DILUTION_PP : 0);
      roundReturn += (pct / 100) * effective;
      if (pct > SCORING.CROWD_ALLOC_THRESHOLD_PCT && meta.ratio < 20) contrarian = true;
    }

    const risk = riskScore(maxPct, companiesUsed);
    const prevRound = await previousRoundForParticipant(p.id, round.round_number);
    const hasPrev = !!prevRound;
    const turnover = hasPrev ? computeTurnover(map, await allocPctMap(p.id, prevRound.id)) : 0;
    const consistency = hasPrev ? clamp(100 - turnover, 0, 100) : 100;

    const capBefore = capitalBefore(p.id);
    const roundPnl = capBefore * (roundReturn / 100);
    const capAfter = capBefore + roundPnl;
    const cumulativeReturn = (capAfter / STARTING_CAPITAL - 1) * 100;

    const overall =
      SCORING.WEIGHTS.return * cumulativeReturnToScore(cumulativeReturn) +
      SCORING.WEIGHTS.risk * risk +
      SCORING.WEIGHTS.consistency * consistency;

    results.push({
      participant_id: p.id,
      portfolio_return: round2(roundReturn),
      return_score: round2(cumulativeReturnToScore(cumulativeReturn)),
      risk_score: round2(risk),
      consistency_score: round2(consistency),
      overall_score: round2(overall),
      turnover: round2(turnover),
      max_alloc_pct: round2(maxPct),
      companies_used: companiesUsed,
      title: pickTitle({ maxPct, companiesUsed, turnover, hasPrev, contrarian }),
      capital_before: round2(capBefore),
      round_pnl: round2(roundPnl),
      capital_after: round2(capAfter),
      cumulative_return: round2(cumulativeReturn),
    });
  }

  // Carry forward everyone who has played before but sat out this round (flat).
  for (const [pidStr, row] of Object.entries(prev)) {
    const pid = Number(pidStr);
    if (submitterIds.has(pid)) continue;
    const capAfter = row.capital_after ?? STARTING_CAPITAL;
    const cumulativeReturn = (capAfter / STARTING_CAPITAL - 1) * 100;
    const risk = row.risk_score ?? 0;
    const consistency = row.consistency_score ?? 0;
    results.push({
      participant_id: pid,
      portfolio_return: 0,
      return_score: round2(cumulativeReturnToScore(cumulativeReturn)),
      risk_score: round2(risk),
      consistency_score: round2(consistency),
      overall_score: round2(
        SCORING.WEIGHTS.return * cumulativeReturnToScore(cumulativeReturn) +
          SCORING.WEIGHTS.risk * risk +
          SCORING.WEIGHTS.consistency * consistency
      ),
      turnover: 0,
      max_alloc_pct: 0,
      companies_used: 0,
      title: row.title || 'Inactive',
      capital_before: round2(capAfter),
      round_pnl: 0,
      capital_after: round2(capAfter),
      cumulative_return: round2(cumulativeReturn),
    });
  }

  // Net-worth board (primary) and composite board.
  rankInPlace(results, 'capital_after', 'rank_returns');
  rankInPlace(results, 'overall_score', 'rank_overall');

  // --- persist -------------------------------------------------------------
  const snapshotId = await tx(async (q) => {
    const ins = await q.run('INSERT INTO snapshots (round_id) VALUES (?)', [roundId]);
    const sid = ins.lastInsertRowid;

    for (const c of companies) {
      const r = returnsByCompany[c.id];
      const meta = companyMeta[c.id];
      await q.run(
        `INSERT INTO snapshot_company_returns
           (snapshot_id, company_id, base_return, multiplier, gross_return, crowders_count, crowd_ratio, diluted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [sid, c.id, r.base, r.mult, round2(gross[c.id]), meta.crowders, round2(meta.ratio), meta.diluted ? 1 : 0]
      );
    }

    for (const res of results) {
      const pr = prev[res.participant_id];
      await q.run(
        `INSERT INTO scores
           (snapshot_id, participant_id, round_id, portfolio_return, return_score, risk_score,
            consistency_score, overall_score, turnover, max_alloc_pct, companies_used, title,
            rank_returns, rank_overall, prev_rank_returns, prev_rank_overall,
            capital_before, round_pnl, capital_after, cumulative_return)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          sid, res.participant_id, roundId, res.portfolio_return, res.return_score,
          res.risk_score, res.consistency_score, res.overall_score, res.turnover,
          res.max_alloc_pct, res.companies_used, res.title, res.rank_returns,
          res.rank_overall, pr ? pr.rank_returns : null, pr ? pr.rank_overall : null,
          res.capital_before, res.round_pnl, res.capital_after, res.cumulative_return,
        ]
      );
    }
    return sid;
  });

  return { snapshotId, roundId, scored: results.length, poolSize };
}

// Equal-weight benchmark return for a snapshot (20% each, never crowds).
export async function ghostPortfolioReturn(snapshotId) {
  const rows = await all('SELECT gross_return FROM snapshot_company_returns WHERE snapshot_id = ?', [snapshotId]);
  if (rows.length === 0) return null;
  return round2(rows.reduce((s, r) => s + r.gross_return, 0) / rows.length);
}

// The participant's current capital = latest snapshot's capital_after, else start.
export async function currentCapital(participantId) {
  const row = await get(
    `SELECT capital_after FROM scores
      WHERE participant_id = ? AND capital_after IS NOT NULL
      ORDER BY snapshot_id DESC LIMIT 1`,
    [participantId]
  );
  return row?.capital_after ?? STARTING_CAPITAL;
}

export { STARTING_CAPITAL };
