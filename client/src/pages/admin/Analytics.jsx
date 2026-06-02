import { useEffect, useState } from 'react';
import api from '../../api';
import Icon from '../../components/icons';
import { formatNumberINR } from '../../lib/format';

// Map a 0..maxPct value to a heat color (blue -> amber -> red).
function heat(pct, max) {
  const t = max > 0 ? Math.min(1, pct / max) : 0;
  const stops = [
    [30, 41, 74], // ink
    [59, 130, 246], // brand blue
    [245, 158, 11], // amber
    [248, 113, 113], // red
  ];
  const seg = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(seg));
  const f = seg - i;
  const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export default function Analytics() {
  const [rounds, setRounds] = useState([]);
  const [roundId, setRoundId] = useState('');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get('/admin/rounds').then(({ data }) => {
      setRounds(data.rounds);
      const active = data.rounds.find((r) => r.status === 'open') || [...data.rounds].reverse()[0];
      if (active) setRoundId(String(active.id));
    }).catch((e) => setErr(e.message));
  }, []);

  useEffect(() => {
    const q = roundId ? `?round_id=${roundId}` : '';
    api.get(`/admin/analytics${q}`).then(({ data }) => setData(data)).catch((e) => setErr(e.message));
  }, [roundId]);

  const maxAvg = data ? Math.max(1, ...data.companies.map((c) => c.avg_pct)) : 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl">Allocation Analytics</h1>
          <p className="text-sm text-slate-400">Where the pool is crowding — so you can aim news drops and multipliers. Participants never see this.</p>
        </div>
        <div>
          <label className="label">Round</label>
          <select className="input min-w-[160px]" value={roundId} onChange={(e) => setRoundId(e.target.value)}>
            {rounds.map((r) => <option key={r.id} value={r.id}>Round {r.round_number} ({r.status})</option>)}
          </select>
        </div>
      </div>

      {err && <div className="panel p-4 text-loss">{err}</div>}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="panel p-5">
              <div className="text-xs uppercase tracking-wide text-slate-500">Pool size</div>
              <div className="num mt-1 text-3xl font-semibold text-white">{data.poolSize}</div>
              <div className="text-xs text-slate-500">submitted this round</div>
            </div>
            <div className="panel p-5 sm:col-span-2">
              <div className="text-xs uppercase tracking-wide text-slate-500">Crowd-dilution threshold</div>
              <div className="num mt-1 text-3xl font-semibold text-amber">{data.threshold}%</div>
              <div className="text-xs text-slate-500">If more than this share of the pool puts &gt;25% into a company, crowders lose 5pp on it.</div>
            </div>
          </div>

          {data.poolSize === 0 ? (
            <div className="panel p-10 text-center text-slate-500">No submissions yet for this round.</div>
          ) : (
            <>
              {/* Heatmap */}
              <div className="panel p-5">
                <h2 className="mb-1 text-lg">Capital concentration heatmap</h2>
                <p className="mb-4 text-sm text-slate-500">Average % of capital each company is receiving across the pool.</p>
                <div className="space-y-3">
                  {data.companies.map((c) => (
                    <div key={c.company_id} className="flex items-center gap-3">
                      <div className="w-40 shrink-0 truncate text-sm text-slate-300">{c.name}</div>
                      <div className="relative h-8 flex-1 overflow-hidden rounded-lg bg-white/5">
                        <div className="h-full rounded-lg transition-all duration-500" style={{ width: `${Math.min(100, (c.avg_pct / maxAvg) * 100)}%`, backgroundColor: heat(c.avg_pct, maxAvg) }} />
                        <span className="num absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-white">{c.avg_pct}%</span>
                      </div>
                      {c.will_dilute && (
                        <span className="chip border-loss/40 bg-loss/10 text-loss text-[10px]"><Icon.Bolt width={11} height={11} /> Diluting</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Detail table */}
              <div className="panel overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3">Company</th>
                      <th className="px-4 py-3 text-right">Investors</th>
                      <th className="px-4 py-3 text-right">Total capital</th>
                      <th className="px-4 py-3 text-right">Avg %</th>
                      <th className="px-4 py-3 text-right">Crowders &gt;25%</th>
                      <th className="px-4 py-3 text-right">Crowd ratio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.companies.map((c) => (
                      <tr key={c.company_id} className={`border-b border-white/5 ${c.will_dilute ? 'bg-loss/5' : ''}`}>
                        <td className="px-4 py-3 font-medium text-white">{c.name}</td>
                        <td className="num px-4 py-3 text-right text-slate-300">{c.investors}</td>
                        <td className="num px-4 py-3 text-right text-slate-300">₹{formatNumberINR(c.total_amount)}</td>
                        <td className="num px-4 py-3 text-right text-slate-300">{c.avg_pct}%</td>
                        <td className="num px-4 py-3 text-right text-slate-300">{c.crowders}</td>
                        <td className={`num px-4 py-3 text-right font-semibold ${c.will_dilute ? 'text-loss' : 'text-slate-300'}`}>{c.crowd_ratio}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
