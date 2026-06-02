// Participant authentication routes: signup, email verification, login, logout, me.
import { Router } from 'express';
import { z } from 'zod';
import { get, run } from '../db.js';
import { hashPassword, verifyPassword, issueToken, clearToken, requireParticipant } from '../auth.js';
import { verificationRequired, generateCode, sendVerificationEmail } from '../email.js';

const router = Router();

const ALLOWED_DOMAIN = (process.env.ALLOWED_EMAIL_DOMAIN || 'smail.iitm.ac.in').toLowerCase();
const CODE_TTL_MIN = 15;
const RESEND_COOLDOWN_SEC = 60;

const signupSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.').max(128),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
});

const verifySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code.'),
});

const emailOnlySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

const isAllowedDomain = (email) => email.endsWith(`@${ALLOWED_DOMAIN}`);
const nowIso = () => new Date().toISOString();
const plusMinutes = (m) => new Date(Date.now() + m * 60000).toISOString();

async function issueVerification(participantId, email, name) {
  const code = generateCode();
  await run(
    'UPDATE participants SET verify_code = ?, verify_expires = ?, verify_sent_at = ? WHERE id = ?',
    [code, plusMinutes(CODE_TTL_MIN), nowIso(), participantId]
  );
  await sendVerificationEmail(email, name, code);
}

router.post('/signup', async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { name, email, password } = parsed.data;

  if (!isAllowedDomain(email)) {
    return res.status(400).json({ error: `Only @${ALLOWED_DOMAIN} email addresses may register.` });
  }

  const existing = await get('SELECT id, verified FROM participants WHERE email = ?', [email]);
  if (existing) {
    // Allow re-triggering verification for an unverified, abandoned signup.
    if (existing.verified === 0 && verificationRequired()) {
      await issueVerification(existing.id, email, name);
      return res.status(200).json({ needsVerification: true, email });
    }
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  const password_hash = await hashPassword(password);
  const needsVerification = verificationRequired();
  const result = await run(
    'INSERT INTO participants (name, email, password_hash, verified) VALUES (?, ?, ?, ?)',
    [name, email, password_hash, needsVerification ? 0 : 1]
  );
  const id = Number(result.lastInsertRowid);

  if (needsVerification) {
    await issueVerification(id, email, name);
    return res.status(201).json({ needsVerification: true, email });
  }

  issueToken(res, { role: 'participant', id, email });
  return res.status(201).json({ user: { id, name, email } });
});

// Verify a 6-digit code and activate the account (logs the user in).
router.post('/verify', async (req, res) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { email, code } = parsed.data;

  const user = await get('SELECT * FROM participants WHERE email = ?', [email]);
  if (!user) return res.status(404).json({ error: 'No account found for that email.' });
  if (user.verified === 1) {
    issueToken(res, { role: 'participant', id: user.id, email: user.email });
    return res.json({ user: { id: user.id, name: user.name, email: user.email } });
  }
  if (!user.verify_code || user.verify_code !== code) {
    return res.status(400).json({ error: 'Incorrect code. Please check and try again.' });
  }
  if (!user.verify_expires || new Date(user.verify_expires).getTime() < Date.now()) {
    return res.status(400).json({ error: 'This code has expired. Request a new one.' });
  }

  await run(
    'UPDATE participants SET verified = 1, verify_code = NULL, verify_expires = NULL WHERE id = ?',
    [user.id]
  );
  issueToken(res, { role: 'participant', id: user.id, email: user.email });
  return res.json({ user: { id: user.id, name: user.name, email: user.email } });
});

// Resend a verification code (rate-limited).
router.post('/resend', async (req, res) => {
  const parsed = emailOnlySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid email address.' });
  const { email } = parsed.data;

  const user = await get('SELECT * FROM participants WHERE email = ?', [email]);
  // Don't reveal whether the email exists.
  if (!user || user.verified === 1) return res.json({ ok: true });

  if (user.verify_sent_at) {
    const elapsed = (Date.now() - new Date(user.verify_sent_at).getTime()) / 1000;
    if (elapsed < RESEND_COOLDOWN_SEC) {
      return res.status(429).json({ error: `Please wait ${Math.ceil(RESEND_COOLDOWN_SEC - elapsed)}s before requesting another code.` });
    }
  }
  await issueVerification(user.id, user.email, user.name);
  return res.json({ ok: true });
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
  if (user.verified === 0) {
    if (verificationRequired()) await issueVerification(user.id, user.email, user.name);
    return res.status(403).json({
      error: 'Please verify your email first. We just sent you a fresh code.',
      needsVerification: true,
      email: user.email,
    });
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
