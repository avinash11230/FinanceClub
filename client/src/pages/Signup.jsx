import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import AuthShell, { FormError } from '../components/AuthShell';

const DOMAIN = 'smail.iitm.ac.in';

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.email.toLowerCase().endsWith(`@${DOMAIN}`)) {
      return setError(`Only @${DOMAIN} email addresses may register.`);
    }
    if (form.password.length < 8) return setError('Password must be at least 8 characters.');
    if (form.password !== form.confirm) return setError('Passwords do not match.');
    setBusy(true);
    try {
      await signup(form.name, form.email, form.password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle={`Open only to @${DOMAIN} students.`}
      footer={<>Already registered? <Link to="/login" className="font-medium text-brand-soft hover:underline">Log in</Link></>}
    >
      <form onSubmit={submit} noValidate>
        <FormError>{error}</FormError>
        <div className="mb-4">
          <label className="label" htmlFor="name">Full name</label>
          <input id="name" className="input" placeholder="Ada Lovelace" value={form.name} onChange={set('name')} required />
        </div>
        <div className="mb-4">
          <label className="label" htmlFor="email">Institute email</label>
          <input id="email" type="email" autoComplete="email" className="input" placeholder={`you@${DOMAIN}`}
            value={form.email} onChange={set('email')} required />
        </div>
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete="new-password" className="input" placeholder="8+ characters"
              value={form.password} onChange={set('password')} required />
          </div>
          <div>
            <label className="label" htmlFor="confirm">Confirm</label>
            <input id="confirm" type="password" autoComplete="new-password" className="input" placeholder="Repeat"
              value={form.confirm} onChange={set('confirm')} required />
          </div>
        </div>
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Creating account…' : 'Sign up'}
        </button>
      </form>
    </AuthShell>
  );
}
