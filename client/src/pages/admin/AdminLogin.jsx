import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import AuthShell, { FormError } from '../../components/AuthShell';
import Icon from '../../components/icons';

export default function AdminLogin() {
  const { admin, adminLogin, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && admin) navigate('/admin/overview', { replace: true });
  }, [admin, loading, navigate]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await adminLogin(email, password);
      navigate('/admin/overview');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Organiser access" subtitle="Restricted control panel. Admin accounts are provisioned by the Finance Club.">
      <form onSubmit={submit} noValidate>
        <FormError>{error}</FormError>
        <div className="mb-4">
          <label className="label" htmlFor="email">Admin email</label>
          <input id="email" type="email" className="input" placeholder="admin@financeclub.iitm.ac.in" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="mb-5">
          <label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" className="input" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Authenticating…' : 'Enter control panel'}
        </button>
      </form>
      <div className="mt-5 flex items-center justify-center gap-2 text-xs text-slate-500">
        <Icon.Lock width={13} height={13} /> Separate from participant accounts
      </div>
    </AuthShell>
  );
}
