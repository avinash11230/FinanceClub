import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';
import Icon from '../../components/icons';
import Modal from '../../components/Modal';
import Markdown from '../../components/Markdown';
import Countdown from '../../components/Countdown';
import { Banner } from './AdminOverview';

function defaultCloseLocal() {
  const d = new Date(Date.now() + 24 * 3600 * 1000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16); // for datetime-local
}

export default function Rounds() {
  const [rounds, setRounds] = useState([]);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [openModal, setOpenModal] = useState(null); // round being opened
  const [closeAt, setCloseAt] = useState(defaultCloseLocal());
  const [recapModal, setRecapModal] = useState(null);

  const load = async () => { const { data } = await api.get('/admin/rounds'); setRounds(data.rounds); };
  useEffect(() => { load().catch((e) => setMsg({ type: 'error', text: e.message })); }, []);

  const act = async (fn, success) => {
    setBusy(true); setMsg(null);
    try { await fn(); await load(); if (success) setMsg({ type: 'success', text: success }); }
    catch (e) { setMsg({ type: 'error', text: e.message }); }
    finally { setBusy(false); }
  };

  const createRound = () => act(() => api.post('/admin/rounds'), 'New round created (pending).');
  const closeRound = (id) => act(() => api.post(`/admin/rounds/${id}/close`), 'Round closed.');
  const runSnapshot = (id) => act(async () => {
    const { data } = await api.post(`/admin/rounds/${id}/snapshot`);
    setMsg({ type: 'success', text: `Snapshot published — scored ${data.scored} of ${data.poolSize}.` });
  });

  const confirmOpen = () => {
    const iso = new Date(openModal_localToDate(closeAt)).toISOString();
    const id = openModal.id;
    setOpenModal(null);
    act(() => api.post(`/admin/rounds/${id}/open`, { closes_at: iso }), 'Round opened. Participants can now allocate.');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl">Round Manager</h1>
          <p className="text-sm text-slate-400">Open and close reallocation windows. Only one window is open at a time.</p>
        </div>
        <button onClick={createRound} disabled={busy} className="btn-primary"><Icon.Plus width={16} height={16} /> New round</button>
      </div>

      {msg && <Banner {...msg} onClose={() => setMsg(null)} />}

      <div className="space-y-4">
        {rounds.map((r) => (
          <div key={r.id} className="panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-lg">Round {r.round_number}</h2>
                  <StatusChip status={r.status} />
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-400">
                  <span>{r.submissions} submissions</span>
                  <span>{r.snapshots} snapshots</span>
                  {r.status === 'open' && r.closes_at && <Countdown target={r.closes_at} className="!gap-2" />}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {r.status !== 'open' && (
                  <button onClick={() => { setCloseAt(defaultCloseLocal()); setOpenModal(r); }} disabled={busy} className="btn-secondary text-xs">
                    {r.status === 'pending' ? 'Open window' : 'Reopen window'}
                  </button>
                )}
                {r.status === 'open' && (
                  <button onClick={() => closeRound(r.id)} disabled={busy} className="btn-ghost text-xs">Close window</button>
                )}
                <button onClick={() => setRecapModal(r)} className="btn-ghost text-xs">Edit recap</button>
                <Link to="/admin/returns" className="btn-ghost text-xs">Set returns</Link>
                <button onClick={() => runSnapshot(r.id)} disabled={busy} className="btn-primary text-xs"><Icon.Bolt width={14} height={14} /> Snapshot</button>
              </div>
            </div>
            {r.recap && (
              <div className="mt-4 rounded-xl border border-white/10 bg-ink-800/40 p-3">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Recap preview</div>
                <Markdown className="text-sm">{r.recap}</Markdown>
              </div>
            )}
          </div>
        ))}
        {rounds.length === 0 && <div className="panel p-8 text-center text-slate-500">No rounds yet. Create the first round to begin.</div>}
      </div>

      {/* Open-window modal */}
      <Modal open={!!openModal} onClose={() => setOpenModal(null)} title={`Open Round ${openModal?.round_number}`} maxWidth="max-w-md">
        <p className="text-sm text-slate-400">Set the closing time shown to participants as a live countdown. Opening this window closes any other open window.</p>
        <label className="label mt-4">Window closes at</label>
        <input type="datetime-local" className="input" value={closeAt} onChange={(e) => setCloseAt(e.target.value)} />
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={() => setOpenModal(null)} className="btn-ghost">Cancel</button>
          <button onClick={confirmOpen} className="btn-primary">Open window</button>
        </div>
      </Modal>

      {/* Recap modal */}
      {recapModal && (
        <RecapEditor round={recapModal} onClose={() => setRecapModal(null)}
          onSaved={async () => { setRecapModal(null); await load(); setMsg({ type: 'success', text: 'Recap saved.' }); }}
          onError={(text) => setMsg({ type: 'error', text })} />
      )}
    </div>
  );
}

// datetime-local string -> Date (treated as local time)
function openModal_localToDate(local) {
  return new Date(local);
}

function RecapEditor({ round, onClose, onSaved, onError }) {
  const [recap, setRecap] = useState(round.recap || '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await api.put(`/admin/rounds/${round.id}/recap`, { recap }); onSaved(); }
    catch (e) { onError(e.message); setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Round ${round.round_number} recap`} maxWidth="max-w-2xl">
      <p className="text-sm text-slate-400">A short paragraph hinting at what drove returns — without revealing exact numbers. Shown on the dashboard. Markdown supported.</p>
      <textarea className="input mt-3 min-h-[140px] font-mono text-xs leading-relaxed" value={recap} onChange={(e) => setRecap(e.target.value)}
        placeholder="Energy names caught a bid after the policy chatter, while the crowded favourite gave some back..." />
      <div className="mt-3 rounded-xl border border-white/10 bg-ink-800/40 p-3">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Preview</div>
        <Markdown className="text-sm">{recap}</Markdown>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="btn-ghost">Cancel</button>
        <button onClick={save} disabled={busy} className="btn-primary">{busy ? 'Saving…' : 'Save recap'}</button>
      </div>
    </Modal>
  );
}

function StatusChip({ status }) {
  const map = {
    open: 'border-gain/40 text-gain bg-gain/10',
    closed: 'border-loss/40 text-loss bg-loss/10',
    pending: 'border-slate-500/40 text-slate-400 bg-white/5',
  };
  return <span className={`chip ${map[status] || map.pending} capitalize`}>{status}</span>;
}
