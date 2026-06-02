import { useEffect, useRef, useState } from 'react';
import Icon from './icons';

// Live countdown to an ISO timestamp. Calls onExpire once when it hits zero.
export default function Countdown({ target, onExpire, className = '' }) {
  const [now, setNow] = useState(Date.now());
  const firedRef = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const end = target ? new Date(target).getTime() : 0;
  let diff = target ? Math.max(0, end - now) : 0;
  const expired = target ? diff <= 0 : false;

  useEffect(() => {
    if (expired && !firedRef.current) {
      firedRef.current = true;
      onExpire?.();
    }
    if (!expired) firedRef.current = false;
  }, [expired, onExpire]);

  if (!target) return null;

  const d = Math.floor(diff / 86400000); diff -= d * 86400000;
  const h = Math.floor(diff / 3600000); diff -= h * 3600000;
  const m = Math.floor(diff / 60000); diff -= m * 60000;
  const s = Math.floor(diff / 1000);
  const pad = (n) => String(n).padStart(2, '0');

  const Seg = ({ v, label }) => (
    <div className="flex flex-col items-center">
      <span className="num text-2xl font-semibold text-white tabular-nums">{pad(v)}</span>
      <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
    </div>
  );

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <Icon.Clock className={expired ? 'text-loss' : 'text-amber'} width={18} height={18} />
      {expired ? (
        <span className="text-sm font-semibold text-loss">Window closed</span>
      ) : (
        <div className="flex items-center gap-3">
          {d > 0 && <Seg v={d} label="days" />}
          <Seg v={h} label="hrs" />
          <span className="text-slate-600 -mt-3">:</span>
          <Seg v={m} label="min" />
          <span className="text-slate-600 -mt-3">:</span>
          <Seg v={s} label="sec" />
        </div>
      )}
    </div>
  );
}
