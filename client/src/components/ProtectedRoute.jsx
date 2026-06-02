import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

function Splash() {
  return (
    <div className="grid min-h-screen place-items-center">
      <div className="flex items-center gap-3 text-slate-400">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
        Loading…
      </div>
    </div>
  );
}

export function ParticipantRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Splash />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

export function AdminRoute({ children }) {
  const { admin, loading } = useAuth();
  if (loading) return <Splash />;
  if (!admin) return <Navigate to="/admin" replace />;
  return children;
}
