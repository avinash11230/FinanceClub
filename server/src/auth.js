// Authentication: password hashing, JWT issuing/verification, secure
// httpOnly cookies, and Express middleware for participants and admins.
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { get } from './db.js';

const isProd = process.env.NODE_ENV === 'production';

const PARTICIPANT_COOKIE = 'arena_token';
const ADMIN_COOKIE = 'arena_admin_token';

const SECRETS = {
  participant: process.env.JWT_SECRET || 'dev-participant-secret',
  admin: process.env.JWT_ADMIN_SECRET || 'dev-admin-secret',
};
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}
export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

function cookieOptions() {
  // Single-origin deploy (backend serves the frontend) => first-party cookie,
  // so 'lax' is correct and safest. 'secure' requires HTTPS, which the hosts provide.
  // If you ever split the frontend onto a different domain, switch sameSite to 'none'.
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: process.env.CROSS_SITE_COOKIES === '1' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  };
}

export function issueToken(res, { role, id, email }) {
  const secret = SECRETS[role];
  const token = jwt.sign({ id, email, role }, secret, { expiresIn: EXPIRES_IN });
  const cookieName = role === 'admin' ? ADMIN_COOKIE : PARTICIPANT_COOKIE;
  res.cookie(cookieName, token, cookieOptions());
  return token;
}

export function clearToken(res, role) {
  const cookieName = role === 'admin' ? ADMIN_COOKIE : PARTICIPANT_COOKIE;
  res.clearCookie(cookieName, { ...cookieOptions(), maxAge: undefined });
}

function readToken(req, role) {
  const cookieName = role === 'admin' ? ADMIN_COOKIE : PARTICIPANT_COOKIE;
  return req.cookies?.[cookieName] || null;
}

// Middleware: require a logged-in participant.
export function requireParticipant(req, res, next) {
  const token = readToken(req, 'participant');
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });
  try {
    const payload = jwt.verify(token, SECRETS.participant);
    if (payload.role !== 'participant') throw new Error('wrong role');
    const user = get('SELECT id, email, name FROM participants WHERE id = ?', [payload.id]);
    if (!user) throw new Error('not found');
    req.participant = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
}

// Middleware: require a logged-in admin.
export function requireAdmin(req, res, next) {
  const token = readToken(req, 'admin');
  if (!token) return res.status(401).json({ error: 'Admin authentication required.' });
  try {
    const payload = jwt.verify(token, SECRETS.admin);
    if (payload.role !== 'admin') throw new Error('wrong role');
    const admin = get('SELECT id, email, name FROM admins WHERE id = ?', [payload.id]);
    if (!admin) throw new Error('not found');
    req.admin = admin;
    next();
  } catch {
    return res.status(401).json({ error: 'Admin session expired. Please log in again.' });
  }
}
