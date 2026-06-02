import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import AuthShell, { FormError } from '../components/AuthShell';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to manage your portfolio."
      footer={<>New here? <Link to="/signup" className="font-medium text-brand-soft hover:underline">Create an account</Link></>}
    >
      <form onSubmit={submit} noValidate>
        <FormError>{error}</FormError>
        <div className="mb-4">
          <label className="label" htmlFor="email">Institute email</label>
          <input id="email" type="email" autoComplete="email" className="input" placeholder="you@smail.iitm.ac.in"
            value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="mb-5">
          <label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" className="input" placeholder="••••••••"
            value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Signing in…' : 'Log in'}
        </button>
      </form>
      <p className="mt-5 text-center text-xs text-slate-500">
        Are you an organiser? <Link to="/admin" className="text-slate-400 hover:text-slate-200 hover:underline">Admin login</Link>
      </p>
    </AuthShell>
  );
}
