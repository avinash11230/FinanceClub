// Email delivery for signup verification.
//
// Two transports, picked by env:
//   1. Brevo HTTP API (recommended on Render/Vercel/etc., which BLOCK outbound
//      SMTP): set BREVO_API_KEY + SENDER_EMAIL. Sends over HTTPS (port 443).
//   2. SMTP via nodemailer (works locally and on hosts that allow SMTP):
//      set SMTP_HOST/SMTP_USER/SMTP_PASS.
//
// Verification is REQUIRED only when a transport is configured (or forced with
// REQUIRE_EMAIL_VERIFICATION=1). Otherwise signups auto-verify, so deploying
// never breaks a live site that has no email configured yet.
import nodemailer from 'nodemailer';

// --- Brevo (HTTP API) -------------------------------------------------------
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const SENDER_EMAIL = process.env.SENDER_EMAIL || process.env.SMTP_USER;
const SENDER_NAME = process.env.SENDER_NAME || 'IITM Invest Arena';
const brevoConfigured = !!(BREVO_API_KEY && SENDER_EMAIL);

// --- SMTP (nodemailer) ------------------------------------------------------
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_SECURE = process.env.SMTP_SECURE === 'true' || SMTP_PORT === 465;
const MAIL_FROM = process.env.MAIL_FROM || (SMTP_USER ? `IITM Invest Arena <${SMTP_USER}>` : 'IITM Invest Arena');
const smtpConfigured = !!(SMTP_HOST && SMTP_USER && SMTP_PASS);

const SEND_TIMEOUT_MS = 10000;

export function verificationRequired() {
  return brevoConfigured || smtpConfigured || process.env.REQUIRE_EMAIL_VERIFICATION === '1';
}

export function emailTransport() {
  if (brevoConfigured) return 'brevo';
  if (smtpConfigured) return 'smtp';
  return 'none';
}

export function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

let transporter = null;
function getSmtpTransporter() {
  if (!smtpConfigured) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      connectionTimeout: SEND_TIMEOUT_MS,
      greetingTimeout: SEND_TIMEOUT_MS,
      socketTimeout: SEND_TIMEOUT_MS,
    });
  }
  return transporter;
}

function buildEmail(name, code) {
  const subject = 'Your IITM Invest Arena verification code';
  const text =
    `Hi ${name || 'there'},\n\n` +
    `Your verification code is: ${code}\n\n` +
    `Enter it on the site to activate your account. It expires in 15 minutes.\n\n` +
    `If you didn't sign up, you can ignore this email.`;
  const html = `
    <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:480px;margin:auto;color:#0f172a">
      <h2 style="margin:0 0 8px">IITM Invest Arena</h2>
      <p>Hi ${escapeHtml(name) || 'there'},</p>
      <p>Your verification code is:</p>
      <div style="font-size:32px;font-weight:700;letter-spacing:6px;background:#f1f5f9;border-radius:12px;padding:16px;text-align:center">${code}</div>
      <p style="color:#475569;font-size:14px">Enter it on the site to activate your account. It expires in 15 minutes.</p>
      <p style="color:#94a3b8;font-size:12px">If you didn't sign up, you can ignore this email.</p>
    </div>`;
  return { subject, text, html };
}

async function sendViaBrevo(to, name, code) {
  const { subject, text, html } = buildEmail(name, code);
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': BREVO_API_KEY,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { email: SENDER_EMAIL, name: SENDER_NAME },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Brevo ${res.status}: ${body.slice(0, 300)}`);
  }
}

async function sendViaSmtp(to, name, code) {
  const { subject, text, html } = buildEmail(name, code);
  const t = getSmtpTransporter();
  await t.sendMail({ from: MAIL_FROM, to, subject, text, html });
}

// Sends the verification email. Throws on failure (caller decides whether to
// surface it). Bounded by SEND_TIMEOUT_MS so it can never hang a request.
export async function sendVerificationEmail(to, name, code) {
  if (brevoConfigured) return sendViaBrevo(to, name, code);
  if (smtpConfigured) return sendViaSmtp(to, name, code);
  // No transport — log so local/testing still works.
  console.log(`[email:fallback] Verification code for ${to}: ${code}`);
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
