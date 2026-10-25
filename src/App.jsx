import { useEffect, useRef, useState } from 'react';
import { api, getUser, logout, download, view } from './api.js';
import Login from './Login.jsx';

const text = (name, label, type = 'text') => ({ name, label, type });
const ref = (name, label, r) => ({ name, label, ref: r });

// One config per module; each maps to a user story.
const MODULES = {
  patients: { title: 'Patient registration', path: '/patients', ok: 'Patient registered. Patient ID generated.',
    fields: [text('name', 'Full name'), text('age', 'Age', 'number'), text('gender', 'Gender'), text('phone', 'Phone'), text('address', 'Address')] },
  appointments: { title: 'Appointments', path: '/appointments', ok: 'Appointment booked.',
    fields: [ref('patient_id', 'Patient', 'patients'), ref('doctor_id', 'Doctor', 'doctors'), text('appt_date', 'Date', 'date'), text('appt_time', 'Time', 'time')] },
  records: { title: 'Medical records', path: '/medical_records', ok: 'Treatment record saved.',
    fields: [ref('patient_id', 'Patient', 'patients'), ref('doctor_id', 'Doctor', 'doctors'), text('diagnosis', 'Diagnosis'), text('prescription', 'Prescription'), text('notes', 'Treatment notes')] },
  lab: { title: 'Laboratory', path: '/lab_results', ok: 'Test result uploaded.',
    fields: [ref('patient_id', 'Patient', 'patients'), text('test_name', 'Test'), text('result', 'Result'), text('charge', 'Charge', 'number')] },
  pharmacy: { title: 'Pharmacy' },
  inventory: { title: 'Medicine inventory', path: '/medicines', ok: 'Medicine added.',
    fields: [text('name', 'Medicine'), text('stock', 'Stock', 'number'), text('price', 'Price', 'number')] },
  admissions: { title: 'Admissions', path: '/admissions', post: '/admit', ok: 'Patient admitted. Bed assigned.',
    fields: [ref('patient_id', 'Patient', 'patients'), ref('bed_id', 'Bed', 'beds'), text('nurse', 'Assigned nurse')] },
  vitals: { title: 'Patient vitals', path: '/vitals', ok: 'Vital signs saved.',
    fields: [ref('patient_id', 'Patient', 'patients'), text('temperature', 'Temperature (°C)', 'number'), text('bp', 'Blood pressure'), text('pulse', 'Pulse', 'number'), text('oxygen', 'Oxygen (%)', 'number')] },
  mypatients: { title: 'My appointed patients', path: '/appointments', readOnly: true, fields: [] },
  prescribe: { title: 'Prescribe medicine', path: '/prescriptions', ok: 'Medicine prescribed. The pharmacist can now see it.',
    fields: [ref('patient_id', 'Patient', 'patients'), ref('medicine_id', 'Medicine', 'medicines'), text('dosage', 'Dosage (e.g. 1-0-1 for 5 days)'), text('qty', 'Quantity to issue', 'number')] },
  billing: { title: 'Billing', path: '/bills', ok: 'Invoice generated.', pay: true,
    fields: [ref('patient_id', 'Patient', 'patients')] },
  doctors: { title: 'Doctors', path: '/doctors', ok: 'Doctor added.',
    fields: [text('name', 'Name'), text('specialization', 'Specialization'), text('fee', 'Consultation fee', 'number'), text('available_from', 'From', 'time'), text('available_to', 'To', 'time')] },
};
const ROLES = {
  Administrator: ['dashboard', 'patients', 'doctors', 'inventory', 'billing'],
  Receptionist: ['patients', 'appointments', 'admissions'],
  Doctor: ['mypatients', 'records', 'prescribe'],
  Nurse: ['vitals'],
  Pharmacist: ['pharmacy', 'inventory', 'billing'],
  'Lab technician': ['lab'],
};
const label = (r) => (r.patient_code ? `${r.patient_code} · ${r.name}${r.appt ? ` (appt ${r.appt})` : ''}` : r.bed_no ? `${r.bed_no} (${r.ward})${r.occupied ? ' – occupied' : ''}` : r.name);
const hidden = (k) => k === 'id' || k.endsWith('_id') || k === 'occupied';
const pretty = (k) => k.replace(/_/g, ' ');
// An appointment is expired once its date + time has passed on this computer's clock
const isExpired = (date, time) => !!date && !!time && new Date(`${String(date).slice(0, 10)}T${String(time).slice(0, 8)}`) < new Date();

// Patient options for SearchSelect: searchable by name, patient ID or phone
const patientOptions = (list) => list.map((p) => ({ value: p.id, label: label(p), search: `${label(p)} ${p.phone || ''}` }));

// A dropdown you can type into to search. Works with the normal form "required" check.
function SearchSelect({ options, value, onChange, required, clearLabel, placeholder = 'Search by name, ID or phone…' }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hl, setHl] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const selected = options.find((o) => String(o.value) === String(value));
  const needle = q.trim().toLowerCase();
  const shown = options.filter((o) => !needle || (o.search || o.label).toLowerCase().includes(needle));
  useEffect(() => { listRef.current?.querySelector('.hl')?.scrollIntoView({ block: 'nearest' }); }, [hl, open]);
  const pick = (v) => { onChange(v); setOpen(false); setQ(''); inputRef.current?.blur(); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHl((h) => Math.min(h + 1, shown.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHl((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter' && open) { e.preventDefault(); if (shown[hl]) pick(shown[hl].value); }
    else if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); }
  };
  return (
    <div className="ss">
      <input ref={inputRef} className="ss-input" autoComplete="off" role="combobox" aria-expanded={open}
        placeholder={selected ? selected.label : placeholder}
        value={open ? q : (selected ? selected.label : '')}
        onFocus={() => { setOpen(true); setQ(''); setHl(0); }}
        onBlur={() => setOpen(false)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setHl(0); }}
        onKeyDown={onKey} />
      <input className="ss-req" tabIndex={-1} aria-hidden="true" required={required} value={value ?? ''} onChange={() => {}} />
      {open && (
        <ul className="ss-list" ref={listRef} onMouseDown={(e) => e.preventDefault()} onClick={(e) => e.preventDefault()}>
          {clearLabel && <li className="ss-clear" onMouseDown={() => pick('')}>{clearLabel}</li>}
          {shown.map((o, i) => (
            <li key={o.value} className={`${i === hl ? 'hl' : ''} ${selected && o.value === selected.value ? 'sel' : ''}`}
              onMouseDown={() => pick(o.value)} onMouseEnter={() => setHl(i)}>{o.label}</li>
          ))}
          {!shown.length && <li className="ss-empty">No matching patients</li>}
        </ul>
      )}
    </div>
  );
}

function Dashboard() {
  const [d, setD] = useState(null);
  useEffect(() => { api('/reports').then(setD); }, []);
  if (!d) return <p className="muted">Loading report…</p>;
  const stats = [['Patients', d.patients], ['Appointments', d.appointments], ['Admissions', d.admissions],
    ['Billed', `₹${Number(d.revenue).toFixed(2)}`], ['Collected', `₹${Number(d.collected).toFixed(2)}`]];
  return (
    <>
      <div className="stats">{stats.map(([k, v]) => <div className="stat" key={k}><span>{k}</span><strong>{v}</strong></div>)}</div>
      <section className="panel">
        <div className="panel-head"><h2>Doctor performance</h2><button className="btn ghost" onClick={() => window.print()}>Print report</button></div>
        <Table rows={d.doctors} />
      </section>
    </>
  );
}

function Table({ rows, action, empty = 'No records yet. Add the first one using the form above.' }) {
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 30000); return () => clearInterval(t); }, []); // re-check expiry every 30 s
  if (!rows.length) return <p className="muted pad">{empty}</p>;
  const keys = Object.keys(rows[0]).filter((k) => !hidden(k));
  return (
    <div className="scroll">
      <table>
        <thead><tr>{keys.map((k) => <th key={k}>{pretty(k)}</th>)}{action && <th />}</tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={r.id ?? i}>
            {keys.map((k) => {
              const v = k === 'status' && r.status === 'Booked' && isExpired(r.appt_date, r.appt_time) ? 'Expired' : r[k];
              return <td key={k}>{k === 'status' ? <span className={`tag ${v}`}>{v}</span> : String(r[k] ?? '–')}</td>;
            })}
            {action && <td>{action(r)}</td>}
          </tr>))}
        </tbody>
      </table>
    </div>
  );
}

function Module({ m }) {
  const [rows, setRows] = useState([]);
  const [refs, setRefs] = useState({});
  const [f, setF] = useState({});
  const [msg, setMsg] = useState(null);
  const user = getUser();
  const fields = m.fields.filter((x) => !(user.role === 'Doctor' && x.ref === 'doctors')); // doctor is the signed-in doctor
  const load = async () => {
    setRows(await api(m.path));
    const r = {};
    for (const x of fields.filter((x) => x.ref)) {
      if (user.role === 'Doctor' && x.ref === 'patients') {
        const [pts, appts] = await Promise.all([api('/patients'), api('/appointments')]);
        r.patients = pts.map((p) => {
          const a = appts.find((a) => a.patient_id === p.id);
          return a ? { ...p, appt: `${a.appt_date} ${String(a.appt_time).slice(0, 5)}${isExpired(a.appt_date, a.appt_time) ? ' – expired' : ''}` } : p;
        });
      } else r[x.ref] = await api('/' + x.ref);
    }
    setRefs(r);
  };
  useEffect(() => { setF({}); setMsg(null); load(); }, [m]);
  const submit = async (e) => {
    e.preventDefault();
    try { const r = await api(m.post || m.path, 'POST', f); setMsg({ ok: true, t: r.merged ? 'Already in stock at the same price, so the stock was increased.' : m.ok }); setF({}); load(); }
    catch (err) { setMsg({ ok: false, t: err.message }); }
  };
  const pay = async (id) => { await api(`/bills/${id}/pay`, 'POST'); load(); };
  return (
    <>
      {!m.readOnly && <form className="panel form" onSubmit={submit}>
        {fields.map((x) => (
          <label key={x.name}>{x.label}
            {x.ref === 'patients' ? (
              <SearchSelect required options={patientOptions(refs.patients || [])} value={f[x.name] || ''} onChange={(v) => setF({ ...f, [x.name]: v })} />
            ) : x.ref ? (
              <select required value={f[x.name] || ''} onChange={(e) => setF({ ...f, [x.name]: e.target.value })}>
                <option value="">Select…</option>
                {(refs[x.ref] || []).map((r) => <option key={r.id} value={r.id}>{label(r)}</option>)}
              </select>
            ) : (
              <input required={x.name === 'name'} type={x.type} step="any" value={f[x.name] || ''} onChange={(e) => setF({ ...f, [x.name]: e.target.value })} />
            )}
          </label>
        ))}
        <button className="btn" type="submit">{m.pay ? 'Generate invoice' : 'Save'}</button>
        {msg && <p className={`notice ${msg.ok ? 'ok' : 'err'}`} role="status">{msg.t}</p>}
      </form>}
      <section className="panel">
        <div className="panel-head"><h2>{m.title}</h2><span className="muted">{rows.length} records</span></div>
        <Table rows={rows} empty={m.readOnly ? 'No patients have booked an appointment with you yet.' : undefined}
          action={m.pay ? (r) => (
            <div style={{ display: 'flex', gap: 8 }}>
              {r.status !== 'Paid' && <button className="btn small" onClick={() => pay(r.id)}>Mark paid</button>}
              <button className="btn ghost small" onClick={() => view(`/bills/${r.id}/pdf`)}>View PDF</button>
              <button className="btn ghost small" onClick={() => download(`/bills/${r.id}/pdf`, `invoice-${r.id}.pdf`)}>Download PDF</button>
            </div>) : null} />
      </section>
    </>
  );
}

function Pharmacy() {
  const [patients, setPatients] = useState([]);
  const [pid, setPid] = useState('');
  const [rx, setRx] = useState([]);
  const [issued, setIssued] = useState([]);
  const [msg, setMsg] = useState(null);
  const load = async () => {
    setIssued(await api('/issued_medicines'));
    setRx(pid ? await api(`/prescriptions?patient_id=${pid}&status=Pending`) : []);
  };
  useEffect(() => { api('/patients').then(setPatients); }, []);
  useEffect(() => { load(); }, [pid]);
  const issue = async (id) => {
    try { await api(`/issue/rx/${id}`, 'POST'); setMsg({ ok: true, t: 'Medicine issued. Stock updated.' }); load(); }
    catch (e) { setMsg({ ok: false, t: e.message }); }
  };
  return (
    <>
      <section className="panel form">
        <label>Patient
          <SearchSelect options={patientOptions(patients)} value={pid} clearLabel="Clear selection"
            onChange={(v) => { setPid(v); setMsg(null); }} />
        </label>
        {msg && <p className={`notice ${msg.ok ? 'ok' : 'err'}`} role="status">{msg.t}</p>}
      </section>
      <section className="panel">
        <div className="panel-head"><h2>Prescribed by the doctor</h2><span className="muted">{pid ? `${rx.length} pending` : ''}</span></div>
        <Table rows={rx}
          empty={pid ? 'No pending prescriptions for this patient.' : 'Select a patient to see the medicines their doctor prescribed.'}
          action={(r) => <button className="btn small" onClick={() => issue(r.id)}>Issue medicine</button>} />
      </section>
      <section className="panel">
        <div className="panel-head"><h2>Issued medicines</h2><span className="muted">{issued.length} records</span></div>
        <Table rows={issued} empty="Nothing has been issued yet." />
      </section>
    </>
  );
}

const emptyItem = () => ({ medicine_id: '', dosage: '', qty: '' });

// Doctor: prescribe one or more medicines for a patient. Patients who already have a prescription are not listed again.
function Prescribe() {
  const [rows, setRows] = useState([]);
  const [patients, setPatients] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [pid, setPid] = useState('');
  const [items, setItems] = useState([emptyItem()]);
  const [msg, setMsg] = useState(null);
  const load = async () => {
    const [rx, pts, appts, meds] = await Promise.all([api('/prescriptions'), api('/patients'), api('/appointments'), api('/medicines')]);
    const done = new Set(rx.map((r) => r.patient_id));
    setRows(rx); setMedicines(meds);
    // only patients with an appointment that has not expired yet (nearest upcoming one is shown)
    const upcoming = (id) => appts
      .filter((a) => a.patient_id === id && !isExpired(a.appt_date, a.appt_time))
      .sort((a, b) => `${a.appt_date} ${a.appt_time}`.localeCompare(`${b.appt_date} ${b.appt_time}`))[0];
    setPatients(pts.filter((p) => !done.has(p.id) && upcoming(p.id)).map((p) => {
      const a = upcoming(p.id);
      return { ...p, appt: `${a.appt_date} ${String(a.appt_time).slice(0, 5)}` };
    }));
  };
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, []); // refresh so newly expired patients drop out
  const setItem = (i, k, v) => setItems(items.map((it, n) => (n === i ? { ...it, [k]: v } : it)));
  const addItem = () => setItems([...items, emptyItem()]);
  const removeItem = (i) => setItems(items.filter((_, n) => n !== i));
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api('/prescriptions/batch', 'POST', { patient_id: pid, items });
      setMsg({ ok: true, t: `${items.length} medicine${items.length > 1 ? 's' : ''} prescribed. The pharmacist can now see ${items.length > 1 ? 'them' : 'it'}.` });
      setPid(''); setItems([emptyItem()]); load();
    } catch (err) { setMsg({ ok: false, t: err.message }); }
  };
  return (
    <>
      <form className="panel form" onSubmit={submit}>
        <label style={{ gridColumn: '1 / -1', maxWidth: 420 }}>Patient
          <SearchSelect required options={patientOptions(patients)} value={pid} onChange={setPid} />
        </label>
        {!patients.length && <p className="muted" style={{ gridColumn: '1 / -1', margin: 0 }}>No patients available. A patient needs an appointment that has not expired and no earlier prescription.</p>}
        {items.map((it, i) => (
          <div className="rx-row" key={i}>
            <label>Medicine
              <select required value={it.medicine_id} onChange={(e) => setItem(i, 'medicine_id', e.target.value)}>
                <option value="">Select…</option>
                {medicines.map((m) => <option key={m.id} value={m.id}>{`${m.name} (₹${Number(m.price).toFixed(2)})`}</option>)}
              </select>
            </label>
            <label>Dosage (e.g. 1-0-1 for 5 days)
              <input value={it.dosage} onChange={(e) => setItem(i, 'dosage', e.target.value)} />
            </label>
            <label>Quantity to issue
              <input required type="number" min="1" value={it.qty} onChange={(e) => setItem(i, 'qty', e.target.value)} />
            </label>
            <button type="button" className="btn ghost remove" onClick={() => removeItem(i)}
              style={{ visibility: items.length > 1 ? 'visible' : 'hidden' }} aria-label="Remove this medicine">Remove</button>
          </div>
        ))}
        <div className="actions">
          <button type="button" className="btn ghost" onClick={addItem}>+ Add another medicine</button>
          <button className="btn" type="submit">Save</button>
        </div>
        {msg && <p className={`notice ${msg.ok ? 'ok' : 'err'}`} role="status">{msg.t}</p>}
      </form>
      <section className="panel">
        <div className="panel-head"><h2>Prescribe medicine</h2><span className="muted">{rows.length} records</span></div>
        <Table rows={rows} />
      </section>
    </>
  );
}

export default function App() {
  const [user, setUser] = useState(getUser());
  const [page, setPage] = useState('dashboard');
  if (!user) return <Login onLogin={setUser} />;
  const role = user.role;
  const pages = ROLES[role];
  const current = pages.includes(page) ? page : pages[0];
  return (
    <div className="app">
      <aside className="side">
        <div className="brand"><span className="cross">+</span> CareDesk</div>
        <div className="role">
          Signed in as
          <strong>{user.name}</strong>
          <span>{role}</span>
          <button className="btn ghost small" onClick={logout}>Sign out</button>
        </div>
        <nav>{pages.map((p) => (
          <button key={p} className={p === current ? 'active' : ''} onClick={() => setPage(p)}>
            {p === 'dashboard' ? 'Reports' : MODULES[p].title}
          </button>))}
        </nav>
      </aside>
      <main className="main">
        <header><h1>{current === 'dashboard' ? 'Hospital reports' : MODULES[current].title}</h1></header>
        {current === 'dashboard' ? <Dashboard /> : current === 'pharmacy' ? <Pharmacy /> : current === 'prescribe' ? <Prescribe /> : <Module m={MODULES[current]} />}
      </main>
    </div>
  );
}
