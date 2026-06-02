import { NavLink, useNavigate, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import Icon from './icons';

const links = [
  { to: '/dashboard', label: 'Dashboard', icon: Icon.Wallet },
  { to: '/leaderboard', label: 'Leaderboard', icon: Icon.Trophy },
  { to: '/profile', label: 'Profile', icon: Icon.User },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const onLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-ink-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber text-ink-950 shadow-glow-amber">
              <Icon.Bolt width={18} height={18} />
            </span>
            <div className="leading-tight">
              <div className="font-mono text-sm font-semibold text-white">INVEST ARENA</div>
              <div className="text-[10px] uppercase tracking-widest text-slate-500">IIT Madras Finance Club</div>
            </div>
          </div>

          <nav className="hidden items-center gap-1 sm:flex">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors duration-200 cursor-pointer ${
                    isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                  }`
                }
              >
                <l.icon width={16} height={16} /> {l.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <span className="hidden text-right text-xs sm:block">
              <span className="block font-medium text-slate-200">{user?.name}</span>
              <span className="block text-slate-500">{user?.email}</span>
            </span>
            <button onClick={onLogout} className="btn-ghost !px-2.5 !py-2" aria-label="Log out">
              <Icon.Logout width={16} height={16} />
            </button>
          </div>
        </div>

        {/* mobile nav */}
        <nav className="flex items-center gap-1 border-t border-white/10 px-2 py-1.5 sm:hidden">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                `flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium cursor-pointer ${
                  isActive ? 'bg-white/10 text-white' : 'text-slate-400'
                }`
              }
            >
              <l.icon width={15} height={15} /> {l.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
