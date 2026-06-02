import Icon from './icons';

// Shared centered card used by the login / signup screens.
export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-amber text-ink-950 shadow-glow-amber">
            <Icon.Bolt width={22} height={22} />
          </span>
          <div>
            <div className="font-mono text-lg font-semibold text-white">INVEST ARENA</div>
            <div className="text-xs uppercase tracking-widest text-slate-500">IIT Madras Finance Club</div>
          </div>
        </div>

        <div className="panel p-6 sm:p-7 animate-fade-in">
          <h1 className="text-xl">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>

        {footer && <div className="mt-5 text-center text-sm text-slate-400">{footer}</div>}
      </div>
    </div>
  );
}

export function FormError({ children }) {
  if (!children) return null;
  return (
    <div className="mb-4 flex items-start gap-2 rounded-xl border border-loss/30 bg-loss/10 px-3.5 py-2.5 text-sm text-loss">
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="mt-0.5 shrink-0"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
      <span>{children}</span>
    </div>
  );
}
