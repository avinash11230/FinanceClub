# IITM Invest Arena

A web-based investment-simulation competition platform for IIT Madras students.
Participants distribute ₹10,00,000 of virtual capital across 5 companies each
round; admins control the rounds, set hidden returns, and publish leaderboards
via a fully automated scoring engine.

Built with **React + Tailwind** (frontend) and **Node.js + Express + SQLite**
(backend), with JWT auth in secure httpOnly cookies.

---

## Quick start

> Prerequisites: **Node.js 22+** (uses the built-in `node:sqlite` — no database
> server to install). Check with `node --version`.

Open **two terminals**.

**1 · Backend** (port 4000)
```bash
cd server
npm install        # first time only
npm run seed       # first time only — creates the admin + 5 demo companies
npm start
```

**2 · Frontend** (port 5173)
```bash
cd client
npm install        # first time only
npm run dev
```

Then open **http://localhost:5173**.

| Role        | URL                          | Default credentials                                   |
|-------------|------------------------------|-------------------------------------------------------|
| Participant | `/signup` · `/login`         | Sign up with any `@smail.iitm.ac.in` email            |
| Admin       | `/admin`                     | `admin@financeclub.iitm.ac.in` / `admin123`           |

> **Change the admin password before going live** — edit `server/.env`
> (`SEED_ADMIN_*`) and run `npm run reset`, or add a new admin directly in the DB.

---

## Running a competition (admin flow)

1. **Company Manager** — edit the 5 companies' names, logos, sectors, and the
   markdown shown in the details panel. (Keep metrics qualitative — see AI-proofing.)
2. **Round Manager** — open Round 1 and set the countdown closing time.
   Participants can now allocate and lock in their portfolios.
3. **Returns Manager** — set each company's hidden **base return %** and any
   **event multipliers** for the round. (Final return = base × all multipliers.)
4. **Analytics** — watch the allocation heatmap to see which companies are getting
   crowded, and aim your news drops / multipliers accordingly.
5. **Run scoring snapshot** (Overview or Round Manager) — runs the full 6-step
   calculation and publishes both leaderboards. Re-runnable after editing returns.
6. Repeat: create the next round, open the window, etc.
7. **End competition** (Overview) — reveals the equal-weight *ghost portfolio*
   benchmark on every participant's profile.

News events are delivered out-of-band (e.g. WhatsApp) — the site intentionally
stores no structured data about them.

---

## The scoring engine

Run on every snapshot, for the round being scored
(`server/src/scoring.js`). The exact constants live in the `SCORING` object there
and are surfaced read-only via the admin `/settings` endpoint.

1. **Base return** — admin-set per company per round (hidden).
2. **Event multipliers** — admin-set; `gross = base × Π(multipliers)`.
3. **Crowd dilution** — for each company, if **>40%** of the pool put **>25%** of
   their capital in it, everyone who crowded it loses **5 percentage points** on
   that company. (Herd behaviour is costly; the "right" answer shifts with the crowd.)
4. **Portfolio return** — allocation-weighted average of each participant's
   effective (post-dilution) company returns.
5. **Risk score (0–100)** — diversification bonus (no company >35% **and** ≥4
   companies funded → 100); concentration penalty (>50% in one company). ~20% weight.
6. **Consistency score (0–100)** — `100 − turnover%` between rounds; panic-switching
   (>70% reallocation) is penalised, conviction rewarded. ~20% weight.

**Overall score** = `0.6 × returnScore + 0.2 × riskScore + 0.2 × consistencyScore`,
where `returnScore` normalises portfolio return onto 0–100 (0% → 50, +25% → 100).

Two leaderboards are published: **Highest Returns** (by raw portfolio return %) and
**Overall Score** (composite). Rank-change indicators (↑/↓/NEW) compare to the
previous snapshot. Other participants' allocations are never exposed.

A cosmetic **Analyst Title** (The Diversifier, Risk Junkie, The Contrarian,
Momentum Chaser, Conviction Player, The Strategist) is assigned from each
participant's allocation pattern.

---

## AI-proofing (by design)

- Company metrics are deliberately **qualitative and incomplete**.
- Base returns and multipliers are **never revealed**, even after a round — only
  each participant's final portfolio return is shown, never per-company breakdowns.
- **Crowd dilution** means there is no static optimal answer.
- The **confidence meter** history surfaces overconfidence as a self-reflection loop.
- The **volatility penalty** discourages pure momentum/reaction strategies.
- News events live off-site, so there is nothing structured for an AI to parse.

---

## Project structure

```
FINANCE CLUB/
├── server/                 # Express API
│   ├── src/
│   │   ├── index.js        # app entry, route mounting, CORS
│   │   ├── db.js           # node:sqlite wrapper + schema (swap point for Postgres)
│   │   ├── auth.js         # bcrypt, JWT, httpOnly cookies, middleware
│   │   ├── scoring.js      # the 6-step scoring engine
│   │   ├── seed.js         # seeds admin + 5 demo companies + Round 1
│   │   └── routes/         # auth / participant / admin route handlers
│   └── data/arena.db       # SQLite database (created on first run)
└── client/                 # React + Vite + Tailwind
    └── src/
        ├── pages/          # participant pages + pages/admin/* control panel
        ├── components/     # Layout, Modal, Countdown, charts, icons, etc.
        └── auth/           # AuthContext (participant + admin sessions)
```

---

## Configuration

All backend config is in `server/.env` (see `.env.example`):
`PORT`, `CLIENT_ORIGIN`, `JWT_SECRET`, `JWT_ADMIN_SECRET`, `ALLOWED_EMAIL_DOMAIN`,
`STARTING_CAPITAL`, and the `SEED_ADMIN_*` values.

Useful scripts:
- `server`: `npm start`, `npm run dev` (watch mode), `npm run seed`, `npm run reset`
- `client`: `npm run dev`, `npm run build`, `npm run preview`

---

## Deploying to production

- **Database:** for a hosted deployment, swap SQLite for **PostgreSQL** by
  rewriting `server/src/db.js` (the rest of the app only uses the `all/get/run/tx`
  helpers and `?` placeholders, which map cleanly to `pg`). The schema in
  `migrate()` is standard SQL.
- **Auth cookies:** set `NODE_ENV=production` so cookies become `Secure` +
  `SameSite=None` (requires HTTPS). Set strong `JWT_SECRET` / `JWT_ADMIN_SECRET`.
- **Hosting:** frontend on Vercel (build `client`), backend on Railway/Render.
  Set `CLIENT_ORIGIN` to the deployed frontend URL and point the frontend at the
  API (replace the Vite dev proxy with `VITE_API_URL` or a rewrite).

---

## Tests

`server/test-e2e.mjs` is an end-to-end smoke test of the whole API (signup rules,
allocation locking, crowd dilution, scoring math, leaderboard, ghost portfolio).
With the backend running on port 4000 against a fresh DB:

```bash
cd server && npm run reset && node test-e2e.mjs
```
