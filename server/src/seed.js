// Seed script. Creates the seeded admin, 5 placeholder companies, and Round 1.
// Run `npm run seed`  (idempotent — skips what already exists)
//   or `npm run reset` (--reset wipes all data first).
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { sqlite, migrate, all, get, run } from './db.js';
import { hashPassword } from './auth.js';

// Seeds an empty database. Idempotent — only inserts what is missing.
// Called automatically on server boot (auto-seed) and by the CLI
// (`npm run seed`, or `npm run reset` which wipes first).
export async function seed({ reset = false } = {}) {
  migrate();

  if (reset) {
    console.log('Resetting all data...');
    for (const t of [
      'scores', 'snapshot_company_returns', 'snapshots', 'allocations', 'submissions',
      'round_company_returns', 'rounds', 'companies', 'participants', 'admins', 'settings',
    ]) {
      sqlite.exec(`DELETE FROM ${t};`);
    }
  }

// ---- seeded admin ----------------------------------------------------------
const adminEmail = (process.env.SEED_ADMIN_EMAIL || 'admin@financeclub.iitm.ac.in').toLowerCase();
const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'admin123';
const adminName = process.env.SEED_ADMIN_NAME || 'Competition Admin';

if (!get('SELECT id FROM admins WHERE email = ?', [adminEmail])) {
  const hash = await hashPassword(adminPassword);
  run('INSERT INTO admins (name, email, password_hash) VALUES (?, ?, ?)', [adminName, adminEmail, hash]);
  console.log(`Seeded admin: ${adminEmail}  (password: ${adminPassword})`);
} else {
  console.log(`Admin already exists: ${adminEmail}`);
}

// ---- 5 placeholder companies ----------------------------------------------
// NOTE: metrics are intentionally qualitative / incomplete (AI-proofing).
const companies = [
  {
    name: 'Grainmark Foods Ltd.',
    ticker: 'GRMK',
    sector: 'FMCG — Packaged Staples',
    logo_url: '',
    description:
      '**Grainmark Foods Ltd.** manufactures and distributes packaged staples — atta, rice, and edible oil — across 18 states through distributors, supermarkets, and local retailers. Around **42% of revenue** comes from modern-retail channels. The company recently renewed a five-year supply agreement with one of the country\'s largest supermarket chains, securing long-term distribution stability. A decade of consistent dividends reflects steady cash generation and disciplined capital allocation.',
    metrics:
      '- **Revenue growth:** 6% YoY — but management notes it was *largely price-led*; underlying volume growth was "broadly flat"\n' +
      '- **Net profit margin:** 14% reported; closer to ~12% once a one-time supplier rebate booked this year is stripped out\n' +
      '- **Market share:** 17% nationally — though concentrated in 4 core states and sub-scale elsewhere\n' +
      '- **Valuation:** ~22x P/E, a premium to the staples peer median; the Street is *split* on whether it is deserved\n' +
      '- **Input exposure:** wheat and edible oil dominate costs; hedging policy described only as "partial"\n' +
      '- **Working capital:** receivable days have crept up as the modern-retail mix has grown\n' +
      '- **Cash flow:** stable operating cash flows, low volatility',
    history:
      'A mature, dividend-paying staples business. Rarely surprises sharply in either direction. The open question is whether the modern-retail tilt lifts growth or quietly compresses margins as channel bargaining power shifts.',
  },
  {
    name: 'Finzo Technologies',
    ticker: 'FNZO',
    sector: 'Fintech — BNPL & Embedded Credit',
    logo_url: '',
    description:
      '**Finzo Technologies** offers Buy-Now-Pay-Later and embedded-credit solutions through merchant partnerships. Active users grew from **2.1M to 3.8M** over the past year, driven by expansion into six new cities. The company closed a Series C eighteen months ago and continues to prioritise aggressive customer acquisition. The BNPL space is currently **under regulatory review**, with policymakers weighing credit-risk norms and consumer-protection rules.',
    metrics:
      '- **Revenue growth:** 48% YoY\n' +
      '- **Customer growth:** 81% YoY — but newer-city cohorts are younger and "not yet seasoned" for credit losses\n' +
      '- **Net profit margin:** −12%, weighed down by acquisition and credit costs\n' +
      '- **Take rate:** described as "stable to slightly compressing" as merchant competition rises — no figure given\n' +
      '- **Loan-loss trend:** provisioning methodology was *recently changed*, so quarter-to-quarter comparability is limited\n' +
      '- **Valuation:** ~6–8x Price-to-Sales (the range itself depends on how deferred revenue is treated)\n' +
      '- **Cash flow:** negative operating cash flow; dependent on external funding and sensitive to rate and regulatory shifts',
    history:
      'A fast-scaling lender still in land-grab mode. Top-line growth is real, but the durability of unit economics is unproven and a regulatory decision could reset the rules of the game mid-competition.',
  },
  {
    name: 'Ironside Logistics',
    ticker: 'IRON',
    sector: 'Logistics — Last-Mile & Warehousing',
    logo_url: '',
    description:
      '**Ironside Logistics** operates 34 warehouses and provides last-mile logistics to e-commerce firms across India. Over the past year, two of its five largest clients **partially moved logistics in-house**, driving a revenue decline and a sharp valuation correction. A new CEO with prior turnaround experience joined this year to stabilise operations and rebuild the client base. Owned warehouse assets provide a degree of balance-sheet resilience arguably *not fully reflected* in the current valuation.',
    metrics:
      '- **Revenue growth:** −4% YoY — the in-housing hit landed mostly in the second half, so the full-year figure may understate the run-rate (or overstate it, if clients return)\n' +
      '- **Net profit margin:** 9% — held up better than revenue, partly on cost cuts of *uncertain durability*\n' +
      '- **Client concentration:** the top 5 clients remain a large majority of revenue (exact share not disclosed)\n' +
      '- **Warehouse utilisation:** fell after the client losses; recovery described as "in progress"\n' +
      '- **Debt-to-equity:** 1.4 (capital-intensive model, moderate leverage)\n' +
      '- **Valuation:** ~10x EV/EBITDA post-correction; book value likely understates owned property, last revalued some years ago\n' +
      '- **Cash flow:** moderately stable but under pressure from the revenue contraction',
    history:
      'A capital-heavy operator mid-turnaround. The thesis is asset value and a client rebuild versus the risk that enterprise customers keep pulling logistics in-house. Sentiment has corrected hard; whether that is opportunity or warning is the debate.',
  },
  {
    name: 'Helixa Bioworks',
    ticker: 'HLXA',
    sector: 'Biotech → AgriTech',
    logo_url: '',
    description:
      '**Helixa Bioworks** pivoted from genomics diagnostics to gene-edited crop seeds eighteen months ago. The legacy diagnostics business still contributes a *declining* share of revenue as the company transitions toward AgriTech. Helixa holds three seed-technology patents and has begun its first commercial crop trials in Gujarat, plus a (non-binding) MOU with a state agriculture board. The business remains pre-scale with weak profitability and limited revenue visibility.',
    metrics:
      '- **Revenue growth:** −9% YoY — legacy decline is outpacing nascent AgriTech revenue, and the two are *not broken out separately*\n' +
      '- **Net profit margin:** −6%, flattered by capitalised R&D; expensing it fully would widen the loss\n' +
      '- **Debt-to-equity:** 0.4 (lightly levered)\n' +
      '- **Patents:** 3 granted; commercial relevance unproven, and one lapses within the medium term\n' +
      '- **Regulatory:** the gene-edited-crop approval pathway is still evolving — timing "uncertain"\n' +
      '- **Cash runway:** R&D-driven burn; runway leans on a milestone payment that is *not guaranteed*\n' +
      '- **Valuation:** early-stage / not meaningfully comparable (loss-making)\n' +
      '- **Cash flow:** negative, R&D-driven',
    history:
      'A high-variance pivot story. The upside is optionality on seed technology; the downside is a shrinking legacy base funding an unproven one. Almost nothing here can be valued cleanly — it is a judgement call on a binary outcome.',
  },
  {
    name: 'Primecast Media',
    ticker: 'PCST',
    sector: 'Media — OTT Streaming & Digital Ads',
    logo_url: '',
    description:
      '**Primecast Media** runs a subscription OTT platform supported by advertising revenue. Subscriber additions have been strong over the last two quarters, driven by regional-language content and aggressive marketing. A multi-year content partnership with a major Bollywood studio has strengthened the pipeline. However, much of the recent growth is supported by promotional discounts, free trials, and elevated acquisition spend — raising questions about long-term retention and profitability.',
    metrics:
      '- **Revenue growth:** 31% YoY\n' +
      '- **Customer growth:** 37% YoY — but a meaningful slice are on free trials or discounted plans; the *paid-converted* share is not disclosed\n' +
      '- **Churn:** described as "elevated" — no number provided\n' +
      '- **ARPU:** a blended figure that masks a wide gap between ad-supported and paying subscribers\n' +
      '- **Content cost:** the studio deal is a multi-year *committed* outflow; the amortisation schedule is undisclosed\n' +
      '- **Debt-to-equity:** 1.9\n' +
      '- **Valuation:** ~4–5x Revenue\n' +
      '- **Cash flow:** negative, due to high content and acquisition costs',
    history:
      'Growth is loud but expensive. The question the headline numbers will not answer: how much of the subscriber base sticks once the promotions end, and how heavy the committed content bill becomes.',
  },
];

if (all('SELECT id FROM companies').length === 0) {
  companies.forEach((c, i) => {
    run(
      `INSERT INTO companies (name, ticker, logo_url, sector, description, metrics, history, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [c.name, c.ticker, c.logo_url, c.sector, c.description, c.metrics, c.history, i]
    );
  });
  console.log(`Seeded ${companies.length} companies.`);
} else {
  console.log('Companies already exist — skipping.');
}

// ---- Round 1 (pending) -----------------------------------------------------
if (all('SELECT id FROM rounds').length === 0) {
  const r = run('INSERT INTO rounds (round_number, status) VALUES (1, ?)', ['pending']);
  const roundId = Number(r.lastInsertRowid);
  for (const c of all('SELECT id FROM companies')) {
    run('INSERT OR IGNORE INTO round_company_returns (round_id, company_id) VALUES (?, ?)', [roundId, c.id]);
  }
  console.log('Seeded Round 1 (status: pending). Open it from the admin Round Manager.');
} else {
  console.log('Rounds already exist — skipping.');
}
}

// Run directly via the CLI: `node src/seed.js [--reset]`
const isDirect = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirect) {
  await seed({ reset: process.argv.includes('--reset') });
  console.log('\nSeed complete.\n');
  process.exit(0);
}
