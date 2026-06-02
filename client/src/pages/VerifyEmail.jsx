import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import AuthShell, { FormError } from '../components/AuthShell';

export default function VerifyEmail() {
  const { verifyEmail, resendCode } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const email = location.state?.email || '';

  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // If someone lands here directly without an email, send them to signup.
  useEffect(() => {
    if (!email) navigate('/signup', { replace: true });
  }, [email, navigate]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code from your email.');
    setBusy(true);
    try {
      await verifyEmail(email, code);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError('');
    setNotice('');
    try {
      await resendCode(email);
      setNotice('A new code is on its way. Check your inbox (and spam).');
      setCooldown(60);
    } catch (err) {
      setError(err.message);
      if (err.status === 429) setCooldown(60);
    }
  };

  return (
    <AuthShell
      title="Verify your email"
      subtitle={email ? `We sent a 6-digit code to ${email}.` : 'Check your inbox for a code.'}
      footer={<>Wrong email? <Link to="/signup" className="font-medium text-brand-soft hover:underline">Sign up again</Link></>}
    >
      <form onSubmit={submit} noValidate>
        <FormError>{error}</FormError>
        {notice && (
          <div className="mb-4 rounded-xl border border-gain/30 bg-gain/10 px-3.5 py-2.5 text-sm text-gain">{notice}</div>
        )}
        <div className="mb-5">
          <label className="label" htmlFor="code">Verification code</label>
          <input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            className="input num text-center text-2xl tracking-[0.5em]"
            placeholder="••••••"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            autoFocus
          />
          <p className="mt-2 text-xs text-slate-500">The code expires in 15 minutes.</p>
        </div>
        <button type="submit" className="btn-primary w-full" disabled={busy || code.length !== 6}>
          {busy ? 'Verifying…' : 'Verify & continue'}
        </button>
      </form>
      <div className="mt-5 text-center text-sm text-slate-400">
        Didn't get it?{' '}
        <button
          onClick={resend}
          disabled={cooldown > 0}
          className="font-medium text-brand-soft hover:underline disabled:opacity-50 disabled:no-underline cursor-pointer"
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
        </button>
      </div>
    </AuthShell>
  );
}
