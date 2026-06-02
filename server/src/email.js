// Email delivery for signup verification. Provider-agnostic SMTP via nodemailer
// (works with Gmail App Passwords, Brevo, SendGrid, Mailgun, etc.).
//
// Verification is REQUIRED only when SMTP is configured (or forced on with
// REQUIRE_EMAIL_VERIFICATION=1). If neither is set, signups are auto-verified —
// so deploying this code does NOT break a live site that has no SMTP yet.
import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_SECURE = process.env.SMTP_SECURE === 'true' || SMTP_PORT === 465;
const MAIL_FROM =
  process.env.MAIL_FROM || (SMTP_USER ? `IITM Invest Arena <${SMTP_USER}>` : 'IITM Invest Arena');

const smtpConfigured = !!(SMTP_HOST && SMTP_USER && SMTP_PASS);

export function verificationRequired() {
  return smtpConfigured || process.env.REQUIRE_EMAIL_VERIFICATION === '1';
}

let transporter = null;
function getTransporter() {
  if (!smtpConfigured) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return transporter;
}

export function generateCode() {
  // 6-digit numeric code, zero-padded.
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function sendVerificationEmail(to, name, code) {
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

  const t = getTransporter();
  if (!t) {
    // No SMTP configured — log the code so testing still works.
    console.log(`[email:fallback] Verification code for ${to}: ${code}`);
    return { delivered: false };
  }
  await t.sendMail({ from: MAIL_FROM, to, subject, text, html });
  return { delivered: true };
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
