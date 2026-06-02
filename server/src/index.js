import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { migrate } from './db.js';
import { seed } from './seed.js';
import authRoutes from './routes/auth.routes.js';
import participantRoutes from './routes/participant.routes.js';
import adminRoutes from './routes/admin.routes.js';

migrate();
// Auto-seed an empty database on first boot so a fresh deploy is usable
// immediately (admin + companies + Round 1). Disable with AUTO_SEED=0.
if (process.env.AUTO_SEED !== '0') {
  await seed({ reset: false });
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 4000);
const isProd = process.env.NODE_ENV === 'production';
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

// Behind a hosting proxy (Render/Railway/Fly) so Secure cookies work over HTTPS.
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// In dev the frontend runs on a different port (Vite) and proxies /api, so CORS
// with credentials is needed. In a single-origin production deploy it isn't.
if (!isProd || process.env.CROSS_SITE_COOKIES === '1') {
  app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
}

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/me', participantRoutes);
app.use('/api/admin', adminRoutes);

// Fallback 404 for unknown API routes.
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// --- Serve the built frontend (single-origin production deploy) -------------
const clientDist = path.resolve(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // SPA fallback: any non-API route returns index.html so client routing works.
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

// Central error handler.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`\n  IITM Invest Arena running on http://localhost:${PORT}`);
  console.log(`  Mode: ${isProd ? 'production (serving built client)' : 'development (API only)'}\n`);
});
