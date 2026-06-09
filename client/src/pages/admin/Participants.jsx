import { useEffect, useMemo, useState } from 'react';
import api from '../../api';
import Icon from '../../components/icons';
import { Banner } from './AdminOverview';
import { formatINR, formatPct } from '../../lib/format';

export default function Participants() {
  const [participants, setParticipants] = useState([]);
  const [query, setQuery] = useState('');
  const [msg, setMsg] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await api.get('/admin/participants');
    setParticipants(data.participants);
    setLoading(false);
  };
  useEffect(() => { load().catch((e) => { setMsg({ type: 'error', text: e.message }); setLoading(false); }); }, []);

  const remove = async (p) => {
    if (!confirm(`Delete "${p.name}" (${p.email})?\n\nThis permanently removes their account, allocations and scores. This cannot be undone.`)) return;
    setBusyId(p.id);
    try {
      await api.delete(`/admin/participants/${p.id}`);
      setMsg({ type: 'success', text: `Deleted ${p.name}.` });
      await load();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    } finally {
      setBusyId(null);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return participants;
    return participants.filter((p) => p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q));
  }, [participants, query]);

  const csvCell = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const exportTop = async (n) => {
    try {
      const { data } = await api.get(`/admin/export/top?n=${n}`);
      if (!data.count) { setMsg({ type: 'error', text: 'No leaderboard published yet.' }); return; }
      const header = ['Name', 'Email', 'Net Worth Rank', 'Overall Rank', `In Net-Worth Top ${n}`, `In Overall Top ${n}`, 'Net Worth', 'Overall Score'];
      const rows = data.participants.map((p) => [
        p.name, p.email, p.rank_returns, p.rank_overall,
        p.in_networth_top ? 'Yes' : 'No', p.in_overall_top ? 'Yes' : 'No',
        Math.round(p.net_worth), p.overall_score,
      ]);
      const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invest-arena-top${n}-unique.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg({ type: 'success', text: `Exported ${data.count} unique participants from the top ${n} of both boards.` });
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl">Participant Manager</h1>
          <p className="text-sm text-slate-400">
            {participants.length} registered. Review details, remove invalid accounts, or export winners.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => exportTop(30)} className="btn-secondary text-xs whitespace-nowrap">
            <Icon.Chart width={14} height={14} /> Export top 30 (CSV)
          </button>
          <input
            className="input max-w-xs"
            placeholder="Search name or email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {msg && <Banner {...msg} onClose={() => setMsg(null)} />}

      <div className="panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Participant</th>
              <th className="px-4 py-3 text-right">Rounds</th>
              <th className="px-4 py-3 text-right">Net worth</th>
              <th className="hidden px-4 py-3 md:table-cell">Title</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-b border-white/5 hover:bg-white/[0.03]">
                <td className="px-4 py-3">
                  <div className="font-medium text-white">{p.name}</div>
                  <div className="text-xs text-slate-500">{p.email}</div>
                </td>
                <td className="num px-4 py-3 text-right text-slate-300">{p.submissions}</td>
                <td className="px-4 py-3 text-right">
                  {p.score ? (
                    <div>
                      <span className="num font-semibold text-white">{formatINR(p.score.capital_after ?? 0)}</span>
                      <span className="num ml-2 text-xs text-slate-500">#{p.score.rank_returns}</span>
                    </div>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>
                <td className="hidden px-4 py-3 md:table-cell">
                  {p.score?.title ? <span className="chip border-white/10 bg-white/5 text-slate-300">{p.score.title}</span> : <span className="text-slate-600">—</span>}
                </td>
                <td className="px-4 py-3 text-slate-400">
                  {new Date(p.created_at + 'Z').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => remove(p)}
                    disabled={busyId === p.id}
                    className="btn-ghost !p-2 text-loss"
                    aria-label={`Delete ${p.name}`}
                    title="Delete participant"
                  >
                    <Icon.Trash width={15} height={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && filtered.length === 0 && (
          <div className="p-8 text-center text-slate-500">
            {participants.length === 0 ? 'No participants have signed up yet.' : 'No matches for your search.'}
          </div>
        )}
        {loading && <div className="p-8 text-center text-slate-500">Loading…</div>}
      </div>
    </div>
  );
}
