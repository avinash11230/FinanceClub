import { useEffect, useState } from 'react';
import api from '../api';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  ComposedChart, Line, CartesianGrid,
} from 'recharts';
import Icon from '../components/icons';
import { companyColor, formatPct } from '../lib/format';

const TITLE_BLURB = {
  'The Diversifier': 'Spreads risk wide — no single bet dominates.',
  'Risk Junkie': 'Goes big on conviction. High ceiling, high floor.',
  'The Contrarian': 'Bets against the crowd when others pile in.',
  'Momentum Chaser': 'Reshuffles hard between rounds chasing the move.',
  'Conviction Player': 'Holds the line — minimal churn round to round.',
  'The Strategist': 'A balanced, measured allocator.',
};

export default function Profile() {
  const [data, setData] = useState(null);
  const [ghost, setGhost] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/me/profile').then((r) => setData(r.data)).catch((e) => setError(e.message));
    api.get('/me/ghost').then((r) => setGhost(r.data)).catch(() => {});
  }, []);

  if (error) return <div className="panel p-6 text-loss">{error}</div>;
  if (!data) return <div className="space-y-4">{[...Array(3)].map((_, i) => <div key={i} className="panel h-40 animate-pulse" />)}</div>;

  const companies = data.history[0]?.allocations.map((a) => a.name) || [];
  // Stacked-bar dataset: one row per round, a key per company (% of capital).
  const allocChart = data.history.map((h) => {
    const row = { round: `R${h.round_number}` };
    h.allocations.forEach((a) => (row[a.name] = Math.round(a.pct * 10) / 10));
    return row;
  });

  const confChart = data.confidenceVsReturns.map((c) => ({
    round: `R${c.round_number}`,
    confidence: c.avg_confidence,
    return: c.portfolio_return,
  }));

  const latest = data.scores[data.scores.length - 1];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="panel flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-4">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-deep/30 text-brand-soft"><Icon.User width={26} height={26} /></span>
          <div>
            <h1 className="text-xl">{data.user.name}</h1>
            <p className="text-sm text-slate-500">{data.user.email}</p>
          </div>
        </div>
        {data.currentTitle && (
          <div className="rounded-xl border border-amber/30 bg-amber/10 px-4 py-2.5">
            <div className="text-[10px] uppercase tracking-wider text-amber-soft">Analyst title</div>
            <div className="font-semibold text-white">{data.currentTitle}</div>
            <div className="mt-0.5 max-w-xs text-xs text-slate-400">{TITLE_BLURB[data.currentTitle]}</div>
          </div>
        )}
      </div>

      {data.history.length === 0 ? (
        <div className="panel p-10 text-center">
          <Icon.Chart className="mx-auto text-slate-600" width={34} height={34} />
          <h2 className="mt-3 text-lg">No history yet</h2>
          <p className="mt-1 text-sm text-slate-400">Submit your first allocation to start building your track record.</p>
        </div>
      ) : (
        <>
          {/* Score breakdown */}
          {latest && (
            <div>
              <h2 className="mb-3 text-lg">Latest standing</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <ScoreCard label="Net worth" value={formatINR(latest.capital_after ?? data.netWorth)} accent="#F59E0B" sub={`Rank #${latest.rank_returns} · started at ${formatINR(data.startingCapital)}`} big />
                <ScoreCard
                  label="Last round P&L"
                  value={`${latest.round_pnl >= 0 ? '+' : '−'}${formatINR(Math.abs(latest.round_pnl ?? 0))}`}
                  accent={latest.round_pnl >= 0 ? '#22D3A5' : '#F87171'}
                  sub={`${formatPct(latest.portfolio_return)} this round`}
                />
                <ScoreCard label="Overall return" value={formatPct(latest.cumulative_return ?? 0)} accent={(latest.cumulative_return ?? 0) >= 0 ? '#22D3A5' : '#F87171'} sub="since start" />
                <ScoreCard label="Overall score" value={latest.overall_score.toFixed(2)} accent="#A78BFA" sub={`Rank #${latest.rank_overall} · 60/20/20`} />
              </div>
            </div>
          )}

          {/* Allocation history */}
          <div className="panel p-5">
            <h2 className="text-lg">Allocation history</h2>
            <p className="mb-4 text-sm text-slate-500">How you split your capital each round (% of that round's capital).</p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={allocChart} margin={{ top: 5, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="round" stroke="#64748B" fontSize={12} />
                  <YAxis stroke="#64748B" fontSize={12} unit="%" domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{ background: '#0A0E1A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 12 }}
                    formatter={(v) => `${v}%`}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {companies.map((name, i) => (
                    <Bar key={name} dataKey={name} stackId="a" fill={companyColor(i)} radius={i === companies.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={64} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Confidence vs returns */}
          <div className="panel p-5">
            <h2 className="text-lg">Confidence vs. actual returns</h2>
            <p className="mb-4 text-sm text-slate-500">Your average pick-confidence (bars, 1–5) against the return you actually earned (line). A reality check on overconfidence.</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={confChart} margin={{ top: 5, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="round" stroke="#64748B" fontSize={12} />
                  <YAxis yAxisId="conf" domain={[0, 5]} stroke="#64748B" fontSize={12} />
                  <YAxis yAxisId="ret" orientation="right" stroke="#64748B" fontSize={12} unit="%" />
                  <Tooltip contentStyle={{ background: '#0A0E1A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="conf" dataKey="confidence" name="Avg confidence" fill="#F59E0B" radius={[4, 4, 0, 0]} maxBarSize={48} />
                  <Line yAxisId="ret" type="monotone" dataKey="return" name="Return %" stroke="#22D3A5" strokeWidth={2.5} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Score history table */}
          <div className="panel overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Round</th>
                  <th className="px-4 py-3 text-right">Return</th>
                  <th className="px-4 py-3 text-right">P&L</th>
                  <th className="px-4 py-3 text-right">Net worth</th>
                  <th className="hidden px-4 py-3 text-right sm:table-cell">Risk</th>
                  <th className="hidden px-4 py-3 text-right sm:table-cell">Consistency</th>
                  <th className="px-4 py-3 text-right">Overall</th>
                </tr>
              </thead>
              <tbody>
                {data.scores.map((s) => (
                  <tr key={s.snapshot_id} className="border-b border-white/5">
                    <td className="px-4 py-3 font-medium text-white">Round {s.round_number}</td>
                    <td className={`num px-4 py-3 text-right ${s.portfolio_return >= 0 ? 'text-gain' : 'text-loss'}`}>{formatPct(s.portfolio_return)}</td>
                    <td className={`num px-4 py-3 text-right ${(s.round_pnl ?? 0) > 0 ? 'text-gain' : (s.round_pnl ?? 0) < 0 ? 'text-loss' : 'text-slate-500'}`}>
                      {(s.round_pnl ?? 0) > 0 ? '+' : (s.round_pnl ?? 0) < 0 ? '−' : ''}{(s.round_pnl ?? 0) === 0 ? '—' : formatINR(Math.abs(s.round_pnl))}
                    </td>
                    <td className="num px-4 py-3 text-right font-semibold text-white">{formatINR(s.capital_after ?? data.startingCapital)}</td>
                    <td className="hidden num px-4 py-3 text-right text-slate-300 sm:table-cell">{s.risk_score.toFixed(0)}</td>
                    <td className="hidden num px-4 py-3 text-right text-slate-300 sm:table-cell">{s.consistency_score.toFixed(0)}</td>
                    <td className="num px-4 py-3 text-right font-semibold text-white">{s.overall_score.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Ghost portfolio */}
          {ghost?.revealed && (
            <div className="panel border-brand/30 bg-brand-deep/10 p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand/15 text-brand-soft"><Icon.Ghost width={20} height={20} /></span>
                <div>
                  <h2 className="text-lg">Ghost portfolio benchmark</h2>
                  <p className="text-sm text-slate-400">An equal-weight (20% each) portfolio would have returned{' '}
                    <span className={`num font-semibold ${ghost.ghostReturn >= 0 ? 'text-gain' : 'text-loss'}`}>{formatPct(ghost.ghostReturn)}</span>
                    {latest && <> — you {latest.portfolio_return >= ghost.ghostReturn ? 'beat' : 'trailed'} it by <span className="num font-semibold text-white">{formatPct(Math.abs(latest.portfolio_return - ghost.ghostReturn))}</span>.</>}
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ScoreCard({ label, value, accent, sub, big }) {
  return (
    <div className="panel p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`num mt-1 font-semibold text-white ${big ? 'text-3xl' : 'text-2xl'}`} style={{ color: accent }}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}
