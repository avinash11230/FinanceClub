import { useEffect, useState } from 'react';
import api from '../api';
import Icon from '../components/icons';
import { formatINR, formatPct } from '../lib/format';

export default function Leaderboard() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('returns');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/me/leaderboard').then((r) => setData(r.data)).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="panel p-6 text-loss">{error}</div>;
  if (!data) return <div className="space-y-3">{[...Array(6)].map((_, i) => <div key={i} className="panel h-14 animate-pulse" />)}</div>;

  if (!data.published) {
    return (
      <div className="panel p-10 text-center">
        <Icon.Trophy className="mx-auto text-slate-600" width={36} height={36} />
        <h2 className="mt-3 text-lg">No leaderboard published yet</h2>
        <p className="mt-1 text-sm text-slate-400">Rankings appear once the organisers run the first scoring snapshot.</p>
      </div>
    );
  }

  const rows = tab === 'returns' ? data.returns : data.overall;
  const isNetWorth = tab === 'returns';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl">Leaderboard</h1>
          <p className="text-sm text-slate-400">
            After Round {data.snapshot?.round_number} ·{' '}
            {new Date(data.snapshot?.created_at + 'Z').toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        </div>
        <div className="flex rounded-xl border border-white/10 bg-ink-800/60 p-1">
          <TabBtn active={isNetWorth} onClick={() => setTab('returns')} icon={Icon.Wallet}>Net Worth</TabBtn>
          <TabBtn active={!isNetWorth} onClick={() => setTab('overall')} icon={Icon.Trophy}>Overall Score</TabBtn>
        </div>
      </div>

      <div className="rounded-xl border border-amber/20 bg-amber/5 px-4 py-2.5 text-xs text-amber-soft">
        Net worth compounds across rounds — everyone started at {formatINR(data.startingCapital)}. Rankings update only when organisers publish a snapshot; other participants' allocations stay private.
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 w-20">Rank</th>
              <th className="px-4 py-3">Participant</th>
              <th className="hidden px-4 py-3 sm:table-cell">Title</th>
              <th className="px-4 py-3 text-right">This round</th>
              <th className="px-4 py-3 text-right">{isNetWorth ? 'Net worth' : 'Score'}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.participant_id} className={`border-b border-white/5 transition-colors ${r.isMe ? 'bg-brand-deep/20' : 'hover:bg-white/[0.03]'}`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <RankNumber rank={r.rank} />
                    <Movement movement={r.movement} delta={r.delta} />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="font-medium text-white">{r.name}</span>
                  {r.isMe && <span className="chip ml-2 border-brand/40 bg-brand/10 text-brand-soft">You</span>}
                  <div className="sm:hidden mt-0.5 text-xs text-slate-500">{r.title}</div>
                </td>
                <td className="hidden px-4 py-3 sm:table-cell">
                  <span className="chip border-white/10 bg-white/5 text-slate-300">{r.title}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={`num font-medium ${r.roundPnl > 0 ? 'text-gain' : r.roundPnl < 0 ? 'text-loss' : 'text-slate-500'}`}>
                    {r.roundPnl > 0 ? '+' : r.roundPnl < 0 ? '−' : ''}{r.roundPnl === 0 ? '—' : formatINR(Math.abs(r.roundPnl))}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {isNetWorth ? (
                    <div>
                      <div className="num font-semibold text-white">{formatINR(r.netWorth)}</div>
                      <div className={`num text-xs ${r.cumulativeReturn >= 0 ? 'text-gain' : 'text-loss'}`}>{formatPct(r.cumulativeReturn)}</div>
                    </div>
                  ) : (
                    <div>
                      <div className="num font-semibold text-white">{r.value.toFixed(2)}</div>
                      <div className="num text-xs text-slate-500">{formatINR(r.netWorth)}</div>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="p-8 text-center text-slate-500">No participants scored yet.</div>}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon: I, children }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors duration-200 cursor-pointer ${
        active ? 'bg-amber text-ink-950' : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      <I width={15} height={15} /> {children}
    </button>
  );
}

function RankNumber({ rank }) {
  const medal = rank <= 3;
  const colors = { 1: '#F59E0B', 2: '#CBD5E1', 3: '#D08A52' };
  return (
    <span className="num grid h-7 w-7 place-items-center rounded-lg text-sm font-semibold" style={medal ? { backgroundColor: `${colors[rank]}22`, color: colors[rank] } : { color: '#94A3B8' }}>
      {rank}
    </span>
  );
}

function Movement({ movement, delta }) {
  if (movement === 'new') return <span className="chip border-brand/40 bg-brand/10 text-brand-soft text-[10px]">NEW</span>;
  if (movement === 'up') return <span className="flex items-center text-xs font-semibold text-gain"><Icon.Up width={13} height={13} />{delta}</span>;
  if (movement === 'down') return <span className="flex items-center text-xs font-semibold text-loss"><Icon.Down width={13} height={13} />{delta}</span>;
  return <span className="text-xs text-slate-600">–</span>;
}
