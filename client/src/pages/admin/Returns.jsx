import { useEffect, useState } from 'react';
import api from '../../api';
import Icon from '../../components/icons';
import { Banner } from './AdminOverview';
import { formatPct } from '../../lib/format';

export default function Returns() {
  const [rounds, setRounds] = useState([]);
  const [roundId, setRoundId] = useState('');
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/admin/rounds').then(({ data }) => {
      setRounds(data.rounds);
      const active = data.rounds.find((r) => r.status === 'open') || [...data.rounds].reverse()[0];
      if (active) setRoundId(String(active.id));
    }).catch((e) => setMsg({ type: 'error', text: e.message }));
  }, []);

  useEffect(() => {
    if (!roundId) return;
    api.get(`/admin/rounds/${roundId}/returns`).then(({ data }) => setRows(data.returns)).catch((e) => setMsg({ type: 'error', text: e.message }));
  }, [roundId]);

  const setBase = (cid, v) => setRows((rs) => rs.map((r) => r.company_id === cid ? { ...r, base_return: v } : r));
  const addMult = (cid) => setRows((rs) => rs.map((r) => r.company_id === cid ? { ...r, multipliers: [...r.multipliers, { label: 'News', value: 1 }] } : r));
  const setMult = (cid, i, key, v) => setRows((rs) => rs.map((r) => r.company_id === cid ? { ...r, multipliers: r.multipliers.map((m, j) => j === i ? { ...m, [key]: v } : m) } : r));
  const delMult = (cid, i) => setRows((rs) => rs.map((r) => r.company_id === cid ? { ...r, multipliers: r.multipliers.filter((_, j) => j !== i) } : r));

  const finalReturn = (r) => {
    const product = r.multipliers.reduce((acc, m) => acc * (Number(m.value) || 1), 1);
    return (Number(r.base_return) || 0) * product;
  };

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const payload = {
        returns: rows.map((r) => ({
          company_id: r.company_id,
          base_return: Number(r.base_return) || 0,
          multipliers: r.multipliers.map((m) => ({ label: String(m.label || ''), value: Number(m.value) || 1 })),
        })),
      };
      await api.put(`/admin/rounds/${roundId}/returns`, payload);
      setMsg({ type: 'success', text: 'Returns saved. Run a snapshot to apply them to the leaderboard.' });
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl">Returns Manager</h1>
          <p className="text-sm text-slate-400">Set hidden base returns and event multipliers per company. Participants never see these.</p>
        </div>
        <div>
          <label className="label">Round</label>
          <select className="input min-w-[160px]" value={roundId} onChange={(e) => setRoundId(e.target.value)}>
            {rounds.map((r) => <option key={r.id} value={r.id}>Round {r.round_number} ({r.status})</option>)}
          </select>
        </div>
      </div>

      <div className="rounded-xl border border-amber/20 bg-amber/5 px-4 py-2.5 text-xs text-amber-soft flex items-center gap-2">
        <Icon.Lock width={14} height={14} /> Hidden from participants. Final return = base return × all multipliers. Crowd dilution (−5pp) is applied automatically at snapshot time.
      </div>

      {msg && <Banner {...msg} onClose={() => setMsg(null)} />}

      <div className="space-y-4">
        {rows.map((r) => {
          const fin = finalReturn(r);
          return (
            <div key={r.company_id} className="panel p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="font-semibold text-white">{r.name} <span className="num text-xs text-slate-500">{r.ticker}</span></div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-slate-500">Final:</span>
                  <span className={`num font-semibold ${fin >= 0 ? 'text-gain' : 'text-loss'}`}>{formatPct(fin)}</span>
                </div>
              </div>
              <div className="mt-3 grid gap-4 sm:grid-cols-[160px_1fr]">
                <div>
                  <label className="label">Base return %</label>
                  <input type="number" step="0.1" className="input num" value={r.base_return} onChange={(e) => setBase(r.company_id, e.target.value)} />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <label className="label">Event multipliers</label>
                    <button onClick={() => addMult(r.company_id)} className="btn-ghost !py-1 !px-2 text-xs"><Icon.Plus width={13} height={13} /> Add</button>
                  </div>
                  <div className="space-y-2">
                    {r.multipliers.length === 0 && <div className="text-xs text-slate-500">No multipliers — final equals base return.</div>}
                    {r.multipliers.map((m, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input className="input flex-1" placeholder="News label (e.g. Earnings beat)" value={m.label} onChange={(e) => setMult(r.company_id, i, 'label', e.target.value)} />
                        <div className="flex items-center gap-1">
                          <span className="text-slate-500">×</span>
                          <input type="number" step="0.05" className="input num w-20" value={m.value} onChange={(e) => setMult(r.company_id, i, 'value', e.target.value)} />
                        </div>
                        <button onClick={() => delMult(r.company_id, i)} className="btn-ghost !p-2 text-loss" aria-label="Remove multiplier"><Icon.Trash width={14} height={14} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="sticky bottom-4 flex justify-end">
        <button onClick={save} disabled={busy || !roundId} className="btn-primary shadow-glow-amber"><Icon.Check width={16} height={16} /> {busy ? 'Saving…' : 'Save returns'}</button>
      </div>
    </div>
  );
}
