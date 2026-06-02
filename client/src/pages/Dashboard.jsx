import { useEffect, useMemo, useState } from 'react';
import api from '../api';
import { formatINR, formatNumberINR, companyColor } from '../lib/format';
import Icon from '../components/icons';
import Modal from '../components/Modal';
import Markdown from '../components/Markdown';
import Countdown from '../components/Countdown';
import ConfidenceMeter from '../components/ConfidenceMeter';
import CompanyLogo from '../components/CompanyLogo';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [amounts, setAmounts] = useState({});
  const [confidence, setConfidence] = useState({});
  const [details, setDetails] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const load = async () => {
    const { data } = await api.get('/me/dashboard');
    setData(data);
    const a = {}, c = {};
    for (const comp of data.companies) c[comp.id] = 3;
    for (const al of data.allocations) { a[al.company_id] = al.amount; c[al.company_id] = al.confidence; }
    setAmounts(a);
    setConfidence(c);
    setDone(data.submitted);
  };

  useEffect(() => { load().catch((e) => setError(e.message)); }, []);

  const capital = data?.capital || 1000000;
  const editable = data?.round?.status === 'open' && !done;

  const total = useMemo(
    () => Object.values(amounts).reduce((s, v) => s + (Number(v) || 0), 0),
    [amounts]
  );
  const remaining = capital - total;
  const pctFilled = Math.min(100, (total / capital) * 100);
  const valid = Math.abs(total - capital) <= 1;
  const fundedCount = Object.values(amounts).filter((v) => Number(v) > 0).length;

  const setAmount = (id, raw) => {
    const v = Math.max(0, Math.round(Number(String(raw).replace(/[^0-9]/g, '')) || 0));
    setAmounts((a) => ({ ...a, [id]: v }));
  };
  const distributeEvenly = () => {
    const n = data.companies.length;
    const each = Math.floor(capital / n);
    const a = {};
    data.companies.forEach((c, i) => (a[c.id] = i === 0 ? capital - each * (n - 1) : each));
    setAmounts(a);
  };
  const clearAll = () => setAmounts({});

  const submit = async () => {
    setError('');
    if (!valid) return setError('Allocate exactly your full capital before submitting.');
    setBusy(true);
    try {
      const allocations = data.companies.map((c) => ({
        company_id: c.id,
        amount: Number(amounts[c.id]) || 0,
        confidence: confidence[c.id] || 3,
      }));
      await api.post('/me/allocations', { allocations });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <SkeletonDashboard />;

  const round = data.round;
  const noRound = !round || round.status === 'pending';

  return (
    <div className="space-y-6">
      {/* Top summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="panel p-5 sm:col-span-1">
          <div className="flex items-center gap-2 text-slate-400"><Icon.Wallet width={16} height={16} /><span className="text-xs uppercase tracking-wide">Virtual capital</span></div>
          <div className="num mt-2 text-3xl font-semibold text-white">{formatINR(capital)}</div>
          <div className="mt-1 text-xs text-slate-500">Starting balance for every participant</div>
        </div>
        <div className="panel p-5 sm:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-slate-400"><Icon.Calendar width={16} height={16} /><span className="text-xs uppercase tracking-wide">Round status</span></div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-lg font-semibold text-white">{round ? `Round ${round.number}` : 'No round yet'}</span>
                <StatusChip status={round?.status} />
              </div>
            </div>
            {round?.status === 'open' && round.closes_at && (
              <div className="rounded-xl border border-white/10 bg-ink-800/60 px-4 py-2">
                <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Window closes in</div>
                <Countdown target={round.closes_at} onExpire={load} />
              </div>
            )}
          </div>
          {round?.recap && (
            <div className="mt-4 rounded-xl border border-brand/20 bg-brand-deep/10 p-3">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-brand-soft">Round recap</div>
              <Markdown className="text-sm">{round.recap}</Markdown>
            </div>
          )}
        </div>
      </div>

      {noRound && (
        <div className="panel p-8 text-center">
          <Icon.Clock className="mx-auto text-slate-600" width={32} height={32} />
          <h2 className="mt-3 text-lg">No active reallocation window</h2>
          <p className="mt-1 text-sm text-slate-400">The organisers haven't opened a round yet. Check back soon — and watch WhatsApp for news.</p>
        </div>
      )}

      {!noRound && (
        <>
          {done && (
            <div className="panel flex items-center gap-3 border-gain/30 bg-gain/5 p-4">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-gain/15 text-gain"><Icon.Lock width={18} height={18} /></span>
              <div>
                <div className="font-medium text-white">Allocations locked for Round {round.number}</div>
                <div className="text-sm text-slate-400">You're set. Allocations unlock when the admin opens the next window.</div>
              </div>
            </div>
          )}
          {!done && round.status !== 'open' && (
            <div className="panel flex items-center gap-3 border-amber/30 bg-amber/5 p-4">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-amber/15 text-amber"><Icon.Lock width={18} height={18} /></span>
              <div>
                <div className="font-medium text-white">This window is closed</div>
                <div className="text-sm text-slate-400">You didn't submit for this round. Wait for the next window to open.</div>
              </div>
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            {/* Company cards */}
            <div className="grid gap-4 sm:grid-cols-2">
              {data.companies.map((c, i) => (
                <CompanyCard
                  key={c.id}
                  company={c}
                  index={i}
                  capital={capital}
                  amount={amounts[c.id] || 0}
                  confidence={confidence[c.id] || 3}
                  editable={editable}
                  onAmount={(v) => setAmount(c.id, v)}
                  onConfidence={(v) => setConfidence((cf) => ({ ...cf, [c.id]: v }))}
                  onDetails={() => setDetails(c)}
                />
              ))}
            </div>

            {/* Allocation tracker */}
            <div className="lg:sticky lg:top-24 self-start">
              <AllocationTracker
                capital={capital}
                total={total}
                remaining={remaining}
                pctFilled={pctFilled}
                valid={valid}
                fundedCount={fundedCount}
                editable={editable}
                done={done}
                busy={busy}
                error={error}
                onEven={distributeEvenly}
                onClear={clearAll}
                onSubmit={submit}
              />
            </div>
          </div>
        </>
      )}

      <DetailsModal company={details} index={details ? data.companies.findIndex((c) => c.id === details.id) : 0} onClose={() => setDetails(null)} />
    </div>
  );
}

function StatusChip({ status }) {
  const map = {
    open: { c: 'border-gain/40 text-gain bg-gain/10', t: 'Open' },
    closed: { c: 'border-loss/40 text-loss bg-loss/10', t: 'Closed' },
    pending: { c: 'border-slate-500/40 text-slate-400 bg-white/5', t: 'Pending' },
  };
  const m = map[status] || map.pending;
  return <span className={`chip ${m.c}`}>{m.t}</span>;
}

function CompanyCard({ company, index, capital, amount, confidence, editable, onAmount, onConfidence, onDetails }) {
  const pct = capital > 0 ? (amount / capital) * 100 : 0;
  const color = companyColor(index);
  return (
    <div className="panel group flex flex-col p-4 transition-colors duration-200 hover:border-white/20">
      <div className="flex items-start gap-3">
        <CompanyLogo company={company} index={index} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-white">{company.name}</div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            {company.ticker && <span className="num">{company.ticker}</span>}
            {company.sector && <span className="truncate">· {company.sector}</span>}
          </div>
        </div>
      </div>

      {editable ? (
        <div className="mt-4 space-y-3">
          <div>
            <label className="label" htmlFor={`amt-${company.id}`}>Allocation (₹)</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">₹</span>
              <input
                id={`amt-${company.id}`}
                inputMode="numeric"
                className="input num pl-7 pr-16"
                value={amount ? formatNumberINR(amount) : ''}
                placeholder="0"
                onChange={(e) => onAmount(e.target.value)}
              />
              <span className="num absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{pct.toFixed(1)}%</span>
            </div>
          </div>
          <div>
            <label className="label">Confidence</label>
            <ConfidenceMeter value={confidence} onChange={onConfidence} />
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-slate-500">Your allocation</span>
            <span className="num font-semibold text-white">{formatINR(amount)}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="num text-xs text-slate-500">{pct.toFixed(1)}% of capital</span>
            {amount > 0 && <ConfidenceMeter value={confidence} readOnly size="sm" />}
          </div>
        </div>
      )}

      <div className="mt-4 flex gap-2 pt-1">
        <button onClick={onDetails} className="btn-ghost flex-1 !py-2 text-xs">
          <Icon.Info width={15} height={15} /> Details
        </button>
        {editable && (
          <button
            onClick={() => { onAmount(capital); }}
            className="btn-secondary !py-2 text-xs"
            title="Put all remaining capital here"
          >
            Invest all
          </button>
        )}
      </div>
    </div>
  );
}

function AllocationTracker({ capital, total, remaining, pctFilled, valid, fundedCount, editable, done, busy, error, onEven, onClear, onSubmit }) {
  if (done) {
    return (
      <div className="panel p-5">
        <h3 className="text-base">Portfolio submitted</h3>
        <p className="mt-1 text-sm text-slate-400">Your Round allocations are locked in across {fundedCount} {fundedCount === 1 ? 'company' : 'companies'}.</p>
      </div>
    );
  }
  if (!editable) {
    return (
      <div className="panel p-5">
        <h3 className="text-base">Allocation closed</h3>
        <p className="mt-1 text-sm text-slate-400">The reallocation window isn't open for edits right now.</p>
      </div>
    );
  }
  const over = total > capital;
  return (
    <div className="panel p-5">
      <h3 className="text-base">Allocation tracker</h3>
      <p className="mt-1 text-xs text-slate-500">Distribute exactly {formatINR(capital)} across the companies.</p>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-sm">
          <span className="text-slate-400">Allocated</span>
          <span className={`num font-semibold ${over ? 'text-loss' : valid ? 'text-gain' : 'text-white'}`}>{formatINR(total)}</span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-white/5">
          <div
            className={`h-full rounded-full transition-all duration-300 ${over ? 'bg-loss' : valid ? 'bg-gain' : 'bg-brand'}`}
            style={{ width: `${pctFilled}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="num text-slate-400">{((total / capital) * 100).toFixed(1)}% filled</span>
          <span className={`num ${over ? 'text-loss' : 'text-slate-400'}`}>
            {over ? `${formatINR(Math.abs(remaining))} over` : `${formatINR(remaining)} left`}
          </span>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button onClick={onEven} className="btn-ghost flex-1 !py-2 text-xs">Split evenly</button>
        <button onClick={onClear} className="btn-ghost flex-1 !py-2 text-xs">Clear</button>
      </div>

      {error && <div className="mt-3 rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-xs text-loss">{error}</div>}

      <button onClick={onSubmit} disabled={!valid || busy} className="btn-primary mt-4 w-full">
        {busy ? 'Submitting…' : valid ? 'Lock in portfolio' : 'Allocate full capital to submit'}
      </button>
      <p className="mt-2 text-center text-[11px] text-slate-500">Once submitted, allocations lock until the next window.</p>
    </div>
  );
}

function DetailsModal({ company, index, onClose }) {
  return (
    <Modal open={!!company} onClose={onClose} title={company?.name || ''}>
      {company && (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <CompanyLogo company={company} index={index} size={52} />
            <div>
              <div className="text-lg font-semibold text-white">{company.name}</div>
              <div className="text-sm text-slate-400">
                {company.ticker && <span className="num">{company.ticker}</span>}
                {company.sector && <span> · {company.sector}</span>}
              </div>
            </div>
          </div>
          <Section title="Overview"><Markdown>{company.description}</Markdown></Section>
          <Section title="Key metrics"><Markdown>{company.metrics}</Markdown></Section>
          <Section title="History"><Markdown>{company.history}</Markdown></Section>
        </div>
      )}
    </Modal>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h4>
      {children}
    </div>
  );
}

function SkeletonDashboard() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((i) => <div key={i} className="panel h-28 animate-pulse" />)}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {[1, 2, 3, 4].map((i) => <div key={i} className="panel h-48 animate-pulse" />)}
      </div>
    </div>
  );
}
