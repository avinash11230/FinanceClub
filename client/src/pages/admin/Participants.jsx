import { useEffect, useMemo, useState } from 'react';
import api from '../../api';
import Icon from '../../components/icons';
import { Banner } from './AdminOverview';
import { formatPct } from '../../lib/format';

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

  const unverified = participants.filter((p) => p.verified === 0).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl">Participant Manager</h1>
          <p className="text-sm text-slate-400">
            {participants.length} registered{unverified > 0 && <span className="text-amber"> · {unverified} unverified</span>}. Review details and remove invalid accounts.
          </p>
        </div>
        <input
          className="input max-w-xs"
          placeholder="Search name or email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {msg && <Banner {...msg} onClose={() => setMsg(null)} />}

      <div className="panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Participant</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Rounds</th>
              <th className="px-4 py-3 text-right">Latest score</th>
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
                <td className="px-4 py-3">
                  {p.verified === 1 ? (
                    <span className="chip border-gain/40 bg-gain/10 text-gain">Verified</span>
                  ) : (
                    <span className="chip border-amber/40 bg-amber/10 text-amber-soft">Unverified</span>
                  )}
                </td>
                <td className="num px-4 py-3 text-right text-slate-300">{p.submissions}</td>
                <td className="px-4 py-3 text-right">
                  {p.score ? (
                    <div>
                      <span className="num font-semibold text-white">{p.score.overall_score.toFixed(2)}</span>
                      <span className="num ml-2 text-xs text-slate-500">#{p.score.rank_overall}</span>
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
