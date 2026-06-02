# Deploying IITM Invest Arena

The app is packaged as a **single Docker image**: the Express server builds and
serves the React site *and* the API from one port, with the SQLite database on a
persistent volume. One service, one deploy.

> Already done for you: production single-origin serving, secure httpOnly cookies
> (`NODE_ENV=production`), auto-seed on first boot, and a `Dockerfile`.

---

## Recommended: Railway (simplest, persistent, ~$5/mo)

Railway gives a persistent volume (so participant data survives restarts) and a
one-click GitHub deploy. The Hobby plan is ~$5/month and includes usage credit —
plenty for a multi-day competition. Cancel when the event is over.

### 1. Put the code on GitHub
```bash
cd "FINANCE CLUB"
git init
git add .
git commit -m "IITM Invest Arena"
# create an empty repo on github.com, then:
git remote add origin https://github.com/<you>/invest-arena.git
git branch -M main
git push -u origin main
```
(`.gitignore` already excludes `node_modules`, `.env`, and the local `*.db`.)

### 2. Create the Railway service
1. Go to **railway.app** → **New Project** → **Deploy from GitHub repo** → pick the repo.
2. Railway detects the `Dockerfile` and builds it automatically.

### 3. Add a persistent volume (so data survives)
- In the service → **Variables/Settings → Volumes → New Volume**, mount path **`/data`**.
- The DB lives at `/data/arena.db` (already the image default).

### 4. Set environment variables
In the service → **Variables**, add:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | a long random string |
| `JWT_ADMIN_SECRET` | a different long random string |
| `SEED_ADMIN_EMAIL` | your admin email |
| `SEED_ADMIN_PASSWORD` | a strong admin password |
| `SEED_ADMIN_NAME` | e.g. `Finance Club Admin` |
| `ALLOWED_EMAIL_DOMAIN` | `smail.iitm.ac.in` |
| `STARTING_CAPITAL` | `1000000` |
| `DB_PATH` | `/data/arena.db` |

> Generate a secret quickly: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
> Don't set `PORT` — Railway injects it and the app reads it automatically.

### 5. Deploy & get the URL
Railway builds and gives you a URL like `https://invest-arena.up.railway.app`.
On first boot the app auto-seeds your admin + 5 companies + Round 1.

- Participants: share the base URL → they sign up at `/signup`.
- You: go to `/admin` and log in with the `SEED_ADMIN_*` credentials you set.

### 6. (Optional) Custom domain
Service → **Settings → Networking → Custom Domain**, then add the CNAME at your
registrar. Cookies and HTTPS work automatically.

---

## Free alternative

**Fly.io** also supports Docker + persistent volumes with a small free-ish
allowance (`fly launch` reads the `Dockerfile`; add a volume and set
`DB_PATH=/data/arena.db`). Slightly more CLI-driven than Railway.

**Render free tier** runs the Docker image for $0 **but** its disk is *ephemeral* —
the SQLite database would be wiped on every restart/redeploy. To use Render's free
tier safely, the app needs an external managed database (e.g. free **Neon**
PostgreSQL). That's a code change isolated to `server/src/db.js` — ask and it can
be done.

---

## After it's live

- **Change the admin password** if you used the default anywhere.
- **Open Round 1** in the admin Round Manager to start accepting allocations.
- To wipe everything and start fresh on the server, run `npm run reset` in the
  service shell (Railway: service → **Shell**), or redeploy with an empty volume.

## Updating after changes
Push to GitHub → the host rebuilds and redeploys automatically. The volume (and
all participant data) persists across deploys.
