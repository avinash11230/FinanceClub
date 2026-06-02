# Deploying IITM Invest Arena (free)

The app is a **single Docker image**: the Express server builds and serves the
React site *and* the API from one port. The database is **Turso (libSQL)** — a
free, hosted, SQLite-compatible database — so no persistent disk is needed and a
**free web host works**.

> Already done for you: production single-origin serving, secure httpOnly cookies,
> auto-seed on first boot, libSQL data layer, and a `Dockerfile`.

**Total cost: $0.** Two free accounts: **Turso** (database) + **Render** (hosting).

---

## Step 1 — Create the database (Turso, free)

1. Sign up at **turso.tech** (free "Starter" plan — generous for this).
2. Install the CLI and create a DB, **or** use the web dashboard:
   ```bash
   # CLI route (optional)
   curl -sSfL https://get.tur.so/install.sh | bash
   turso auth signup
   turso db create invest-arena
   turso db show invest-arena --url           # -> libsql://invest-arena-xxx.turso.io
   turso db tokens create invest-arena        # -> the auth token
   ```
   Dashboard route: **Create Database** → open it → copy the **Database URL** and
   create a **Token**. Keep both handy for Step 3.

(The app creates its own tables on first boot — you don't run any SQL.)

---

## Step 2 — Put the code on GitHub

Your repo: **https://github.com/avinash11230/FinanceClub**

```bash
cd "FINANCE CLUB"
git remote add origin https://github.com/avinash11230/FinanceClub.git
git branch -M main
git push -u origin main
```
(`.gitignore` excludes `node_modules`, `.env`, the local DB, and `private/`.)

---

## Step 3 — Deploy on Render (free)

1. Sign up at **render.com** → **New + → Web Service** → connect GitHub → pick
   `avinash11230/FinanceClub`.
2. Render detects the `Dockerfile`. Settings:
   - **Instance type: Free**
   - Region: **Singapore** (closest to India)
3. Add **Environment Variables**:

   | Key | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | your Turso URL (`libsql://…turso.io`) |
   | `DATABASE_AUTH_TOKEN` | your Turso token |
   | `JWT_SECRET` | long random string |
   | `JWT_ADMIN_SECRET` | different long random string |
   | `SEED_ADMIN_EMAIL` | your admin email |
   | `SEED_ADMIN_PASSWORD` | a strong admin password |
   | `SEED_ADMIN_NAME` | e.g. `Finance Club Admin` |
   | `ALLOWED_EMAIL_DOMAIN` | `smail.iitm.ac.in` |
   | `STARTING_CAPITAL` | `1000000` |

   > Generate a secret: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
   > Don't set `PORT` — Render injects it; the app reads it automatically.
4. **Create Web Service.** Render builds the image and gives you a URL like
   `https://invest-arena.onrender.com`. On first boot it auto-seeds your admin +
   5 companies + Round 1.

- Participants → share the base URL, they sign up at `/signup`.
- You → `/admin`, log in with the `SEED_ADMIN_*` values you set.

---

## Step 4 — Keep it awake (recommended, free)

Render's free tier **sleeps after ~15 min idle** (next visit takes ~30–60s to
wake). Avoid that with a free uptime pinger:

- Go to **uptimerobot.com** (free) or **cron-job.org** → add a monitor hitting
  `https://<your-app>.onrender.com/api/health` every **10 minutes**.

This keeps the service warm during the competition and is also what makes the
**12-hour round automation** reliable later (a sleeping server can't run timers).

---

## Email verification (optional)

⚠️ **Render's free tier blocks outbound SMTP**, so Gmail/SMTP will hang. Use an
HTTP email API instead — **Brevo** (free, 300 emails/day, no domain needed):

1. **brevo.com** → sign up (free).
2. **Senders** → add and **verify a sender email** (Brevo emails you a link to click).
3. **SMTP & API → API Keys** → generate a key (`xkeysib-…`).
4. In **Render → Environment**, add (and delete any `SMTP_*` vars):
   - `BREVO_API_KEY` = your key
   - `SENDER_EMAIL` = the verified sender email
   - `SENDER_NAME` = `IITM Invest Arena`
5. Save → Render redeploys → the admin **Overview** shows *"Email verification ON ·
   brevo"*, and new signups receive a 6-digit code. Existing accounts stay valid.

Leave all email vars unset to disable verification (signups auto-verify).

## Updating after changes
Push to GitHub → Render auto-rebuilds and redeploys. Turso data persists across
deploys (it's external).

## Free-tier limits to know
See the "Drawbacks" section the assistant shared — short version: cold starts if
idle (mitigated by Step 4), modest CPU/RAM (fine for a class-sized competition),
and Turso free limits (far above what this app needs).

## Switching to always-on later
If you want zero cold starts during finals, the same image runs on Render's paid
tier (~$7/mo) or Railway — just reuse the env vars. No code change.
