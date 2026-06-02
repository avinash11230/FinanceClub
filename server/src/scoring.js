// The automated scoring engine. Runs in full every time an admin triggers a
// leaderboard snapshot for a round. Implements the 6-step spec:
//
//   1. Base company returns        (admin-set, hidden)
//   2. Event multipliers           (admin-set, hidden) -> gross return
//   3. Crowd dilution              (herd behaviour penalised, per-participant)
//   4. Portfolio return            (allocation-weighted average)
//   5. Risk score                  (concentration penalty / diversification bonus)
//   6. Consistency score           (turnover / panic-switch penalty)
//
//   overall = 60% return + 20% risk + 20% consistency  (all normalised to 0..100)
//
// It also assigns a cosmetic "analyst title" and computes leaderboard ranks
// with deltas versus the previous snapshot.
import { all, get, run, tx } from './db.js';

const CAPITAL = Number(process.env.STARTING_CAPITAL || 1000000);

// ---- tunable scoring constants (documented for the admin) ------------------
export const SCORING = {
  CAPITAL,
  CROWD_ALLOC_THRESHOLD_PCT: 25, // a participant "crowds" a company if alloc% > this
  CROWD_POOL_THRESHOLD_PCT: 40, // a company is diluted if >this% of the pool crowds it
  CROWD_DILUTION_PP: 5, // percentage points removed from crowders' return
  CONCENTRATION_LIMIT_PCT: 50, // >this% in one company => risk penalty
  DIVERSIFY_MAX_PCT: 35, // no company above this...
  DIVERSIFY_MIN_COMPANIES: 4, // ...and at least this many used => diversification bonus
  PANIC_TURNOVER_PCT: 70, // turnover above this = panic switch
  WEIGHTS: { return: 0.6, risk: 0.2, consistency: 0.2 },
};

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const round2 = (n) => Math.round(n * 100) / 100;

// Final multiplier for a company in a round = product of all multiplier values.
function multiplierProduct(multipliersJson) {
  let arr = [];
  try {
    arr = JSON.parse(multipliersJson || '[]');
  } catch {
    arr = [];
  }
  return arr.reduce((acc, m) => acc * (Number(m?.value) || 1), 1);
}

// allocation %-by-company map for a participant in a given round.
function allocPctMap(participantId, roundId) {
  const rows = all(
    `SELECT company_id, amount FROM allocations WHERE participant_id = ? AND round_id = ?`,
    [participantId, roundId]
  );
  const map = {};
  for (const r of rows) map[r.company_id] = (r.amount / CAPITAL) * 100;
  return map;
}

// The most recent earlier round the participant submitted in (for turnover).
function previousRoundForParticipant(participantId, roundNumber) {
  return get(
    `SELECT r.id, r.round_number
       FROM submissions s JOIN rounds r ON r.id = s.round_id
      WHERE s.participant_id = ? AND r.round_number < ?
      ORDER BY r.round_number DESC LIMIT 1`,
    [participantId, roundNumber]
  );
}

// Turnover (0..100) = half the sum of absolute allocation-% changes between rounds.
function computeTurnover(curMap, prevMap) {
  const ids = new Set([...Object.keys(curMap), ...Object.keys(prevMap)]);
  let sum = 0;
  for (const id of ids) sum += Math.abs((curMap[id] || 0) - (prevMap[id] || 0));
  return sum / 2;
}

function riskScore(maxPct, companiesUsed) {
  if (maxPct <= SCORING.DIVERSIFY_MAX_PCT && companiesUsed >= SCORING.DIVERSIFY_MIN_COMPANIES) {
    return 100; // diversification bonus
  }
  if (maxPct > SCORING.CONCENTRATION_LIMIT_PCT) {
    return clamp(70 - (maxPct - SCORING.CONCENTRATION_LIMIT_PCT) * 1.4, 0, 100);
  }
  return 70; // neutral middle ground
}

// Portfolio return % normalised onto a 0..100 score so the 60/20/20 weights
// are comparable. 0% return -> 50, +25% -> 100, -25% -> 0.
function returnToScore(portfolioReturnPct) {
  return clamp(50 + portfolioReturnPct * 2, 0, 100);
}

function pickTitle({ maxPct, companiesUsed, turnover, hasPrev, contrarian }) {
  if (maxPct > SCORING.CONCENTRATION_LIMIT_PCT) return 'Risk Junkie';
  if (hasPrev && turnover > SCORING.PANIC_TURNOVER_PCT) return 'Momentum Chaser';
  if (contrarian) return 'The Contrarian';
  if (maxPct <= SCORING.DIVERSIFY_MAX_PCT && companiesUsed >= SCORING.DIVERSIFY_MIN_COMPANIES)
    return 'The Diversifier';
  if (hasPrev && turnover < 15) return 'Conviction Player';
  return 'The Strategist';
}

/**
 * Run the full scoring calculation for a round and publish a snapshot.
 * Returns a summary object. Safe to re-run (creates a new snapshot each time).
 */
export function scoreRound(roundId) {
  const round = get('SELECT * FROM rounds WHERE id = ?', [roundId]);
  if (!round) throw new Error('Round not found.');

  // Companies + admin-set returns for this round.
  const companies = all('SELECT id, name FROM companies ORDER BY sort_order, id');
  if (companies.length === 0) throw new Error('No companies configured.');

  const returnsRows = all(
    'SELECT company_id, base_return, multipliers FROM round_company_returns WHERE round_id = ?',
    [roundId]
  );
  const returnsByCompany = {};
  for (const c of companies) returnsByCompany[c.id] = { base: 0, mult: 1 };
  for (const r of returnsRows) {
    returnsByCompany[r.company_id] = {
      base: r.base_return,
      mult: multiplierProduct(r.multipliers),
    };
  }

  // Participants who submitted this round.
  const submitters = all(
    `SELECT p.id, p.name, p.email
       FROM submissions s JOIN participants p ON p.id = s.participant_id
      WHERE s.round_id = ?`,
    [roundId]
  );
  const poolSize = submitters.length;

  // --- Steps 1-2: gross return per company (base * multiplier) -------------
  const gross = {}; // company_id -> gross return %
  for (const c of companies) {
    const r = returnsByCompany[c.id];
    gross[c.id] = r.base * r.mult;
  }

  // --- Step 3: crowd dilution ---------------------------------------------
  const crowdersByCompany = {}; // company_id -> Set(participant_id)
  for (const c of companies) crowdersByCompany[c.id] = new Set();
  const allocMaps = {}; // participant_id -> {company_id: pct}
  for (const p of submitters) {
    const map = allocPctMap(p.id, roundId);
    allocMaps[p.id] = map;
    for (const [cid, pct] of Object.entries(map)) {
      if (pct > SCORING.CROWD_ALLOC_THRESHOLD_PCT) crowdersByCompany[cid].add(p.id);
    }
  }
  const companyMeta = {}; // company_id -> { crowders, ratio, diluted }
  for (const c of companies) {
    const crowders = crowdersByCompany[c.id].size;
    const ratio = poolSize > 0 ? (crowders / poolSize) * 100 : 0;
    const diluted = ratio > SCORING.CROWD_POOL_THRESHOLD_PCT;
    companyMeta[c.id] = { crowders, ratio, diluted };
  }

  // --- Steps 4-6: per-participant scoring ----------------------------------
  const results = [];
  for (const p of submitters) {
    const map = allocMaps[p.id];
    const pctValues = companies.map((c) => map[c.id] || 0);
    const maxPct = Math.max(0, ...pctValues);
    const companiesUsed = pctValues.filter((v) => v > 0).length;

    // Step 4: portfolio return (allocation-weighted, with per-participant dilution)
    let portfolioReturn = 0;
    let contrarian = false;
    for (const c of companies) {
      const pct = map[c.id] || 0;
      if (pct <= 0) continue;
      const meta = companyMeta[c.id];
      const isCrowder = crowdersByCompany[c.id].has(p.id);
      const effective =
        gross[c.id] - (meta.diluted && isCrowder ? SCORING.CROWD_DILUTION_PP : 0);
      portfolioReturn += (pct / 100) * effective;
      // Contrarian: a meaningful bet (>threshold) on a company few others crowded.
      if (pct > SCORING.CROWD_ALLOC_THRESHOLD_PCT && meta.ratio < 20) contrarian = true;
    }

    // Step 5: risk score
    const risk = riskScore(maxPct, companiesUsed);

    // Step 6: consistency (turnover) score
    const prevRound = previousRoundForParticipant(p.id, round.round_number);
    const hasPrev = !!prevRound;
    const turnover = hasPrev ? computeTurnover(map, allocPctMap(p.id, prevRound.id)) : 0;
    const consistency = hasPrev ? clamp(100 - turnover, 0, 100) : 100;

    const retScore = returnToScore(portfolioReturn);
    const overall =
      SCORING.WEIGHTS.return * retScore +
      SCORING.WEIGHTS.risk * risk +
      SCORING.WEIGHTS.consistency * consistency;

    const title = pickTitle({ maxPct, companiesUsed, turnover, hasPrev, contrarian });

    results.push({
      participant_id: p.id,
      portfolio_return: round2(portfolioReturn),
      return_score: round2(retScore),
      risk_score: round2(risk),
      consistency_score: round2(consistency),
      overall_score: round2(overall),
      turnover: round2(turnover),
      max_alloc_pct: round2(maxPct),
      companies_used: companiesUsed,
      title,
    });
  }

  // --- ranking + deltas vs previous snapshot -------------------------------
  rankInPlace(results, 'portfolio_return', 'rank_returns');
  rankInPlace(results, 'overall_score', 'rank_overall');

  const prevSnap = get('SELECT id FROM snapshots ORDER BY id DESC LIMIT 1');
  const prevRanks = {};
  if (prevSnap) {
    for (const row of all(
      'SELECT participant_id, rank_returns, rank_overall FROM scores WHERE snapshot_id = ?',
      [prevSnap.id]
    )) {
      prevRanks[row.participant_id] = row;
    }
  }

  // --- persist everything in one transaction -------------------------------
  const snapshotId = tx(() => {
    const ins = run('INSERT INTO snapshots (round_id) VALUES (?)', [roundId]);
    const sid = ins.lastInsertRowid;

    for (const c of companies) {
      const r = returnsByCompany[c.id];
      const meta = companyMeta[c.id];
      run(
        `INSERT INTO snapshot_company_returns
           (snapshot_id, company_id, base_return, multiplier, gross_return, crowders_count, crowd_ratio, diluted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [sid, c.id, r.base, r.mult, round2(gross[c.id]), meta.crowders, round2(meta.ratio), meta.diluted ? 1 : 0]
      );
    }

    for (const res of results) {
      const prev = prevRanks[res.participant_id];
      run(
        `INSERT INTO scores
           (snapshot_id, participant_id, round_id, portfolio_return, return_score, risk_score,
            consistency_score, overall_score, turnover, max_alloc_pct, companies_used, title,
            rank_returns, rank_overall, prev_rank_returns, prev_rank_overall)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          sid, res.participant_id, roundId, res.portfolio_return, res.return_score,
          res.risk_score, res.consistency_score, res.overall_score, res.turnover,
          res.max_alloc_pct, res.companies_used, res.title, res.rank_returns,
          res.rank_overall, prev ? prev.rank_returns : null, prev ? prev.rank_overall : null,
        ]
      );
    }
    return sid;
  });

  return { snapshotId, roundId, scored: results.length, poolSize };
}

// Assign dense ranks (1-based) by a numeric field, descending.
function rankInPlace(rows, field, rankField) {
  const sorted = [...rows].sort((a, b) => b[field] - a[field]);
  sorted.forEach((row, i) => {
    row[rankField] = i + 1;
  });
}

// Equal-weight benchmark return for a snapshot (20% each, never crowds => no dilution).
export function ghostPortfolioReturn(snapshotId) {
  const rows = all(
    'SELECT gross_return FROM snapshot_company_returns WHERE snapshot_id = ?',
    [snapshotId]
  );
  if (rows.length === 0) return null;
  const avg = rows.reduce((s, r) => s + r.gross_return, 0) / rows.length;
  return round2(avg);
}
