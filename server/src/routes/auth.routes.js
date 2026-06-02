// Participant authentication routes: signup, login, logout, me.
import { Router } from 'express';
import { z } from 'zod';
import { get, run } from '../db.js';
import { hashPassword, verifyPassword, issueToken, clearToken, requireParticipant } from '../auth.js';

const router = Router();

const ALLOWED_DOMAIN = (process.env.ALLOWED_EMAIL_DOMAIN || 'smail.iitm.ac.in').toLowerCase();

const signupSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.').max(128),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
});

const isAllowedDomain = (email) => email.endsWith(`@${ALLOWED_DOMAIN}`);

router.post('/signup', async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { name, email, password } = parsed.data;

  if (!isAllowedDomain(email)) {
    return res.status(400).json({ error: `Only @${ALLOWED_DOMAIN} email addresses may register.` });
  }

  const existing = await get('SELECT id FROM participants WHERE email = ?', [email]);
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  const password_hash = await hashPassword(password);
  const result = await run(
    'INSERT INTO participants (name, email, password_hash) VALUES (?, ?, ?)',
    [name, email, password_hash]
  );
  const id = Number(result.lastInsertRowid);
  issueToken(res, { role: 'participant', id, email });
  return res.status(201).json({ user: { id, name, email } });
});

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { email, password } = parsed.data;

  const user = await get('SELECT * FROM participants WHERE email = ?', [email]);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  issueToken(res, { role: 'participant', id: user.id, email: user.email });
  return res.json({ user: { id: user.id, name: user.name, email: user.email } });
});

router.post('/logout', (req, res) => {
  clearToken(res, 'participant');
  return res.json({ ok: true });
});

router.get('/me', requireParticipant, (req, res) => {
  return res.json({ user: req.participant });
});

export default router;
