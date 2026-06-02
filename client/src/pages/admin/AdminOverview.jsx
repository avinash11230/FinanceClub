import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';
import Icon from '../../components/icons';

export default function AdminOverview() {
  const [settings, setSettings] = useState(null);
  const [rounds, setRounds] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [s, r, c, sn] = await Promise.all([
      api.get('/admin/settings'),
      api.get('/admin/rounds'),
      api.get('/admin/companies'),
      api.get('/admin/snapshots'),
    ]);
    setSettings(s.data);
    setRounds(r.data.rounds);
    setCompanies(c.data.companies);
    setSnapshots(sn.data.snapshots);
  };
  useEffect(() => { load().catch((e) => setMsg({ type: 'error', text: e.message })); }, []);

  const activeRound =
    rounds.find((r) => r.status === 'open') || [...rounds].reverse()[0] || null;

  const runSnapshot = async (roundId) => {
    setBusy(true);
    setMsg(null);
    try {
      const { data } = await api.post(`/admin/rounds/${roundId}/snapshot`);
      setMsg({ type: 'success', text: `Snapshot published — scored ${data.scored} participants from a pool of ${data.poolSize}.` });
      await load();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const toggleCompetition = async () => {
    setBusy(true);
    setMsg(null);
    try {
      if (settings.competition_ended) {
        await api.post('/admin/competition/reopen');
        setMsg({ type: 'success', text: 'Competition reopened. Ghost portfolio hidden again.' });
      } else {
        const { data } = await api.post('/admin/competition/end');
        setMsg({ type: 'success', text: `Competition ended. Ghost portfolio (${data.ghostReturn ?? '—'}%) is now revealed to participants.` });
      }
      await load();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    } finally {
      setBusy(false);
    }
  };

  if (!settings) return <div className="space-y-4">{[...Array(3)].map((_, i) => <div key={i} className="panel h-28 animate-pulse" />)}</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl">Overview</h1>
          <p className="text-sm text-slate-400">Run the competition from here.</p>
        </div>
        {settings.verificationRequired ? (
          <span className="chip border-gain/40 bg-gain/10 text-gain">
            Email verification ON · {settings.emailTransport}
          </span>
        ) : (
          <span className="chip border-amber/40 bg-amber/10 text-amber-soft">
            Email verification OFF · signups auto-verify
          </span>
        )}
      </div>

      {msg && <Banner {...msg} onClose={() => setMsg(null)} />}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat icon={Icon.User} label="Participants" value={settings.participants} />
        <Stat icon={Icon.Building} label="Companies" value={companies.length} link="/admin/companies" />
        <Stat icon={Icon.Calendar} label="Rounds" value={rounds.length} link="/admin/rounds" />
      </div>

      {/* Leaderboard trigger */}
      <div className="panel p-5">
        <div className="flex items-center gap-2 text-slate-400"><Icon.Bolt width={16} height={16} /><span className="text-xs uppercase tracking-wide">Leaderboard trigger</span></div>
        {activeRound ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-lg font-semibold text-white">Round {activeRound.round_number} <span className="text-sm font-normal text-slate-500">· {activeRound.submissions} submissions · {activeRound.snapshots} snapshots run</span></div>
              <p className="mt-1 max-w-lg text-sm text-slate-400">Runs the full 6-step scoring calculation and publishes updated leaderboards for everyone. Safe to re-run after updating returns.</p>
            </div>
            <button onClick={() => runSnapshot(activeRound.id)} disabled={busy} className="btn-primary">
              <Icon.Bolt width={16} height={16} /> {busy ? 'Scoring…' : 'Run scoring snapshot'}
            </button>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-400">Create a round in the <Link to="/admin/rounds" className="text-brand-soft hover:underline">Round Manager</Link> to begin.</p>
        )}
      </div>

      {/* Competition control */}
      <div className={`panel p-5 ${settings.competition_ended ? 'border-amber/30' : ''}`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-slate-400"><Icon.Ghost width={16} height={16} /><span className="text-xs uppercase tracking-wide">Competition status</span></div>
            <div className="mt-2 text-lg font-semibold text-white">{settings.competition_ended ? 'Ended — ghost portfolio revealed' : 'Live'}</div>
            <p className="mt-1 max-w-lg text-sm text-slate-400">Ending the competition reveals the equal-weight ghost portfolio benchmark on every participant's profile.</p>
          </div>
          <button onClick={toggleCompetition} disabled={busy} className={settings.competition_ended ? 'btn-secondary' : 'btn-ghost'}>
            {settings.competition_ended ? 'Reopen competition' : 'End competition'}
          </button>
        </div>
      </div>

      {/* Recent snapshots */}
      <div className="panel overflow-hidden">
        <div className="border-b border-white/10 px-5 py-3 text-sm font-semibold text-white">Recent snapshots</div>
        {snapshots.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">No snapshots published yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500"><th className="px-5 py-2.5">Snapshot</th><th className="px-5 py-2.5">Round</th><th className="px-5 py-2.5">Scored</th><th className="px-5 py-2.5">Published</th></tr></thead>
            <tbody>
              {snapshots.map((s) => (
                <tr key={s.id} className="border-t border-white/5">
                  <td className="num px-5 py-2.5 text-slate-300">#{s.id}</td>
                  <td className="px-5 py-2.5 text-slate-300">Round {s.round_number}</td>
                  <td className="num px-5 py-2.5 text-slate-300">{s.scored}</td>
                  <td className="px-5 py-2.5 text-slate-400">{new Date(s.created_at + 'Z').toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Stat({ icon: I, label, value, link }) {
  const inner = (
    <div className="panel p-5 transition-colors duration-200 hover:border-white/20">
      <div className="flex items-center gap-2 text-slate-400"><I width={16} height={16} /><span className="text-xs uppercase tracking-wide">{label}</span></div>
      <div className="num mt-2 text-3xl font-semibold text-white">{value}</div>
    </div>
  );
  return link ? <Link to={link} className="block cursor-pointer">{inner}</Link> : inner;
}

export function Banner({ type, text, onClose }) {
  const ok = type === 'success';
  return (
    <div className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${ok ? 'border-gain/30 bg-gain/10 text-gain' : 'border-loss/30 bg-loss/10 text-loss'}`}>
      <span>{text}</span>
      {onClose && <button onClick={onClose} className="cursor-pointer opacity-70 hover:opacity-100">✕</button>}
    </div>
  );
}
