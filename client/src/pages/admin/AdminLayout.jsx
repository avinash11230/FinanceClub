import { NavLink, useNavigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import Icon from '../../components/icons';

const links = [
  { to: '/admin/overview', label: 'Overview', icon: Icon.Grid },
  { to: '/admin/participants', label: 'Participants', icon: Icon.User },
  { to: '/admin/companies', label: 'Company Manager', icon: Icon.Building },
  { to: '/admin/rounds', label: 'Round Manager', icon: Icon.Calendar },
  { to: '/admin/returns', label: 'Returns Manager', icon: Icon.Sliders },
  { to: '/admin/analytics', label: 'Analytics', icon: Icon.Chart },
];

export default function AdminLayout() {
  const { admin, adminLogout } = useAuth();
  const navigate = useNavigate();
  const onLogout = async () => { await adminLogout(); navigate('/admin'); };

  return (
    <div className="min-h-full lg:grid lg:grid-cols-[260px_1fr]">
      {/* Sidebar */}
      <aside className="border-b border-white/10 bg-ink-900/60 lg:border-b-0 lg:border-r lg:min-h-screen">
        <div className="flex items-center gap-2.5 px-5 py-4">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-white shadow-glow"><Icon.Settings width={18} height={18} /></span>
          <div className="leading-tight">
            <div className="font-mono text-sm font-semibold text-white">CONTROL PANEL</div>
            <div className="text-[10px] uppercase tracking-widest text-slate-500">Invest Arena Admin</div>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:px-3 lg:pb-0">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors duration-200 cursor-pointer ${
                  isActive ? 'bg-brand-deep/40 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`}>
              <l.icon width={17} height={17} /> {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden lg:block lg:px-3 lg:mt-4 lg:border-t lg:border-white/10 lg:pt-4">
          <div className="px-3.5 text-xs text-slate-500">{admin?.email}</div>
          <button onClick={onLogout} className="btn-ghost mt-2 w-[calc(100%-1.5rem)] mx-3 !justify-start"><Icon.Logout width={16} height={16} /> Log out</button>
        </div>
        <button onClick={onLogout} className="btn-ghost m-3 lg:hidden"><Icon.Logout width={16} height={16} /></button>
      </aside>

      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
