import { useEffect, useState } from 'react';
import api from '../../api';
import Icon from '../../components/icons';
import Modal from '../../components/Modal';
import Markdown from '../../components/Markdown';
import CompanyLogo from '../../components/CompanyLogo';
import { Banner } from './AdminOverview';

const EMPTY = { name: '', ticker: '', sector: '', logo_url: '', description: '', metrics: '', history: '', sort_order: 0 };

export default function Companies() {
  const [companies, setCompanies] = useState([]);
  const [editing, setEditing] = useState(null); // company object or {new:true}
  const [msg, setMsg] = useState(null);

  const load = async () => {
    const { data } = await api.get('/admin/companies');
    setCompanies(data.companies);
  };
  useEffect(() => { load().catch((e) => setMsg({ type: 'error', text: e.message })); }, []);

  const remove = async (id) => {
    if (!confirm('Delete this company? This cannot be undone.')) return;
    try { await api.delete(`/admin/companies/${id}`); await load(); setMsg({ type: 'success', text: 'Company deleted.' }); }
    catch (e) { setMsg({ type: 'error', text: e.message }); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl">Company Manager</h1>
          <p className="text-sm text-slate-400">Edit names, logos, and the markdown shown in the details panel.</p>
        </div>
        <button onClick={() => setEditing({ ...EMPTY, sort_order: companies.length })} className="btn-primary"><Icon.Plus width={16} height={16} /> Add company</button>
      </div>

      {msg && <Banner {...msg} onClose={() => setMsg(null)} />}

      <div className="grid gap-4 sm:grid-cols-2">
        {companies.map((c, i) => (
          <div key={c.id} className="panel p-4">
            <div className="flex items-start gap-3">
              <CompanyLogo company={c} index={i} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-white">{c.name}</div>
                <div className="text-xs text-slate-500"><span className="num">{c.ticker || '—'}</span> · {c.sector || 'No sector'}</div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => setEditing(c)} className="btn-ghost !p-2" aria-label="Edit"><Icon.Settings width={15} height={15} /></button>
                <button onClick={() => remove(c.id)} className="btn-ghost !p-2 text-loss" aria-label="Delete"><Icon.Trash width={15} height={15} /></button>
              </div>
            </div>
            <div className="mt-3 line-clamp-2 text-xs text-slate-400"><Markdown>{c.description}</Markdown></div>
          </div>
        ))}
        {companies.length === 0 && <div className="panel p-8 text-center text-slate-500 sm:col-span-2">No companies yet. Add five to run the competition.</div>}
      </div>

      {editing && (
        <CompanyEditor
          company={editing}
          onClose={() => setEditing(null)}
          onSaved={async (text) => { setEditing(null); await load(); setMsg({ type: 'success', text }); }}
          onError={(text) => setMsg({ type: 'error', text })}
        />
      )}
    </div>
  );
}

function CompanyEditor({ company, onClose, onSaved, onError }) {
  const isNew = !company.id;
  const [form, setForm] = useState({ ...EMPTY, ...company });
  const [tab, setTab] = useState('edit');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.name.trim()) return onError('Company name is required.');
    setBusy(true);
    try {
      const payload = {
        name: form.name, ticker: form.ticker, sector: form.sector, logo_url: form.logo_url,
        description: form.description, metrics: form.metrics, history: form.history,
        sort_order: Number(form.sort_order) || 0,
      };
      if (isNew) await api.post('/admin/companies', payload);
      else await api.put(`/admin/companies/${company.id}`, payload);
      onSaved(isNew ? 'Company created.' : 'Company updated.');
    } catch (e) {
      onError(e.message); setBusy(false);
    }
  };

  const mdFields = [
    { k: 'description', label: 'Description', hint: 'Short overview. Markdown supported.' },
    { k: 'metrics', label: 'Key metrics', hint: 'Tip: keep these qualitative / incomplete to resist AI solving.' },
    { k: 'history', label: 'History', hint: 'Background and past performance narrative.' },
  ];

  return (
    <Modal open onClose={onClose} title={isNew ? 'New company' : `Edit · ${company.name}`} maxWidth="max-w-3xl">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Name" className="col-span-2"><input className="input" value={form.name} onChange={set('name')} /></Field>
        <Field label="Ticker"><input className="input num" value={form.ticker || ''} onChange={set('ticker')} /></Field>
        <Field label="Sort order"><input className="input num" type="number" value={form.sort_order} onChange={set('sort_order')} /></Field>
        <Field label="Sector" className="col-span-2"><input className="input" value={form.sector || ''} onChange={set('sector')} /></Field>
        <Field label="Logo URL (optional)" className="col-span-2"><input className="input" placeholder="https://…" value={form.logo_url || ''} onChange={set('logo_url')} /></Field>
      </div>

      <div className="mt-5 flex gap-1 border-b border-white/10">
        {['edit', 'preview'].map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`cursor-pointer rounded-t-lg px-4 py-2 text-sm font-medium capitalize ${tab === t ? 'border-b-2 border-amber text-white' : 'text-slate-400'}`}>{t}</button>
        ))}
      </div>

      {tab === 'edit' ? (
        <div className="mt-4 space-y-4">
          {mdFields.map((f) => (
            <Field key={f.k} label={f.label} hint={f.hint}>
              <textarea className="input min-h-[90px] font-mono text-xs leading-relaxed" value={form[f.k] || ''} onChange={set(f.k)} />
            </Field>
          ))}
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {mdFields.map((f) => (
            <div key={f.k}>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">{f.label}</div>
              <div className="rounded-xl border border-white/10 bg-ink-800/40 p-3"><Markdown>{form[f.k]}</Markdown></div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <button onClick={onClose} className="btn-ghost">Cancel</button>
        <button onClick={save} disabled={busy} className="btn-primary">{busy ? 'Saving…' : isNew ? 'Create' : 'Save changes'}</button>
      </div>
    </Modal>
  );
}

function Field({ label, hint, children, className = '' }) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}
