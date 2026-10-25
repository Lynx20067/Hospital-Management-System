import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import PDFDocument from 'pdfkit';
import { setupAuth, syncDoctorUsers } from './auth.js';

const db = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,          // change if Workbench shows another port
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || 'Since2006', // put your Workbench password here
  database: 'hms', dateStrings: true,
});
const app = express();
app.use(cors(), express.json());
await setupAuth(app, db); // login + role protection for every /api route
await db.query(`CREATE TABLE IF NOT EXISTS prescriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL, doctor_id INT NOT NULL, medicine_id INT NOT NULL,
  dosage VARCHAR(100), qty INT NOT NULL, status VARCHAR(20) DEFAULT 'Pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  FOREIGN KEY (doctor_id) REFERENCES doctors(id),
  FOREIGN KEY (medicine_id) REFERENCES medicines(id))`);

// Merge existing duplicate medicines (same name + same price) into one row and add up their stock
{
  const [dups] = await db.query(`SELECT MIN(id) keep_id, GROUP_CONCAT(id) ids, SUM(stock) total
    FROM medicines GROUP BY LOWER(TRIM(name)), price HAVING COUNT(*) > 1`);
  for (const d of dups) {
    const others = d.ids.split(',').map(Number).filter((i) => i !== Number(d.keep_id));
    await db.query('UPDATE issued_medicines SET medicine_id=? WHERE medicine_id IN (?)', [d.keep_id, others]);
    await db.query('UPDATE prescriptions SET medicine_id=? WHERE medicine_id IN (?)', [d.keep_id, others]);
    await db.query('UPDATE medicines SET stock=? WHERE id=?', [Number(d.total), d.keep_id]);
    await db.query('DELETE FROM medicines WHERE id IN (?)', [others]);
  }
}

// table -> writable columns (also a whitelist)
const T = {
  patients: ['name', 'age', 'gender', 'phone', 'address'],
  doctors: ['name', 'specialization', 'fee', 'available_from', 'available_to'],
  appointments: ['patient_id', 'doctor_id', 'appt_date', 'appt_time'],
  medical_records: ['patient_id', 'doctor_id', 'diagnosis', 'prescription', 'notes'],
  lab_results: ['patient_id', 'test_name', 'result', 'charge'],
  medicines: ['name', 'stock', 'price'],
  vitals: ['patient_id', 'temperature', 'bp', 'pulse', 'oxygen'],
  beds: ['bed_no', 'ward'],
  issued_medicines: ['patient_id', 'medicine_id', 'qty'],
  admissions: ['patient_id', 'bed_id', 'nurse'],
  bills: ['patient_id'],
  prescriptions: ['patient_id', 'doctor_id', 'medicine_id', 'dosage', 'qty'],
};
const J = { patient_id: ['patients', 'name', 'patient'], doctor_id: ['doctors', 'name', 'doctor'],
  medicine_id: ['medicines', 'name', 'medicine'], bed_id: ['beds', 'bed_no', 'bed'] };

const wrap = (fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (e) {
    console.error(e);
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That doctor is already booked for this date and time.' });
    res.status(e.status || 500).json({ error: e.message });
  }
};
const fail = (status, message) => Object.assign(new Error(message), { status });

// Dashboard / reports (User Story 10)
app.get('/api/reports', wrap(async (_q, res) => {
  const [[c]] = await db.query(`SELECT
    (SELECT COUNT(*) FROM patients) patients, (SELECT COUNT(*) FROM appointments) appointments,
    (SELECT COUNT(*) FROM admissions) admissions, (SELECT IFNULL(SUM(total),0) FROM bills) revenue,
    (SELECT IFNULL(SUM(total),0) FROM bills WHERE status='Paid') collected`);
  const [doctors] = await db.query(`SELECT d.name, d.specialization, COUNT(a.id) appointments
    FROM doctors d LEFT JOIN appointments a ON a.doctor_id=d.id GROUP BY d.id ORDER BY appointments DESC`);
  res.json({ ...c, doctors });
}));

// Pharmacy: issue medicine and reduce stock atomically (User Story 6)
app.post('/api/issue', wrap(async (req, res) => {
  const { patient_id, medicine_id, qty } = req.body;
  const cn = await db.getConnection();
  try {
    await cn.beginTransaction();
    const [r] = await cn.query('UPDATE medicines SET stock=stock-? WHERE id=? AND stock>=?', [qty, medicine_id, qty]);
    if (!r.affectedRows) throw fail(400, 'Not enough stock for this medicine.');
    await cn.query('INSERT INTO issued_medicines (patient_id, medicine_id, qty) VALUES (?,?,?)', [patient_id, medicine_id, qty]);
    await cn.commit(); res.json({ ok: true });
  } catch (e) { await cn.rollback(); throw e; } finally { cn.release(); }
}));

// Admission: allocate bed (User Story 8)
app.post('/api/admit', wrap(async (req, res) => {
  const { patient_id, bed_id, nurse } = req.body;
  const [r] = await db.query('UPDATE beds SET occupied=1 WHERE id=? AND occupied=0', [bed_id]);
  if (!r.affectedRows) throw fail(400, 'That bed is already occupied.');
  await db.query('INSERT INTO admissions (patient_id, bed_id, nurse) VALUES (?,?,?)', [patient_id, bed_id, nurse]);
  res.json({ ok: true });
}));

// Billing: consultation + lab + medicine (User Story 7)
app.post('/api/bills', wrap(async (req, res) => {
  const id = req.body.patient_id;
  const val = async (sql) => Number((await db.query(sql, [id]))[0][0].v);
  const consultation = await val('SELECT IFNULL(SUM(d.fee),0) v FROM appointments a JOIN doctors d ON d.id=a.doctor_id WHERE a.patient_id=?');
  const lab = await val('SELECT IFNULL(SUM(charge),0) v FROM lab_results WHERE patient_id=?');
  const medicine = await val('SELECT IFNULL(SUM(i.qty*m.price),0) v FROM issued_medicines i JOIN medicines m ON m.id=i.medicine_id WHERE i.patient_id=?');
  await db.query('INSERT INTO bills (patient_id, consultation, lab, medicine, total) VALUES (?,?,?,?,?)',
    [id, consultation, lab, medicine, consultation + lab + medicine]);
  res.json({ ok: true });
}));
app.post('/api/bills/:id/pay', wrap(async (req, res) => {
  await db.query("UPDATE bills SET status='Paid' WHERE id=?", [req.params.id]); res.json({ ok: true });
}));

// Pharmacy: issue one prescribed medicine and reduce stock (User Story 6)
app.post('/api/issue/rx/:id', wrap(async (req, res) => {
  const cn = await db.getConnection();
  try {
    await cn.beginTransaction();
    const [[rx]] = await cn.query("SELECT * FROM prescriptions WHERE id=? AND status='Pending' FOR UPDATE", [req.params.id]);
    if (!rx) throw fail(404, 'Prescription not found or already issued.');
    const [r] = await cn.query('UPDATE medicines SET stock=stock-? WHERE id=? AND stock>=?', [rx.qty, rx.medicine_id, rx.qty]);
    if (!r.affectedRows) throw fail(400, 'Not enough stock for this medicine.');
    await cn.query('INSERT INTO issued_medicines (patient_id, medicine_id, qty) VALUES (?,?,?)', [rx.patient_id, rx.medicine_id, rx.qty]);
    await cn.query("UPDATE prescriptions SET status='Issued' WHERE id=?", [rx.id]);
    await cn.commit(); res.json({ ok: true });
  } catch (e) { await cn.rollback(); throw e; } finally { cn.release(); }
}));

// Invoice as PDF (?inline=1 opens in the browser, otherwise downloads)
app.get('/api/bills/:id/pdf', wrap(async (req, res) => {
  const [[b]] = await db.query('SELECT b.*, p.name, p.patient_code, p.phone, p.age, p.gender, p.address FROM bills b JOIN patients p ON p.id=b.patient_id WHERE b.id=?', [req.params.id]);
  if (!b) throw fail(404, 'Bill not found');
  const q = async (sql) => (await db.query(sql, [b.patient_id]))[0];
  const appts = await q('SELECT d.name, d.specialization, d.fee, a.appt_date FROM appointments a JOIN doctors d ON d.id=a.doctor_id WHERE a.patient_id=?');
  const labs = await q('SELECT test_name, charge FROM lab_results WHERE patient_id=?');
  const meds = await q('SELECT m.name, i.qty, m.price FROM issued_medicines i JOIN medicines m ON m.id=i.medicine_id WHERE i.patient_id=?');

  const money = (n) => `Rs. ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const invNo = `INV-${String(b.id).padStart(5, '0')}`;
  const C = { pine: '#0d3b3a', teal: '#0e8a86', ink: '#12262b', muted: '#5d7076', line: '#dbe4e6', bg: '#f3f6f7', ok: '#1d7a4d', okBg: '#e4f4eb', warn: '#8a5a00', warnBg: '#fdf1d8' };
  const L = 40, W = 515, R = L + W;

  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true, info: { Title: `Invoice ${invNo}`, Author: 'CareDesk Hospital' } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${req.query.inline ? 'inline' : 'attachment'}; filename=invoice-${b.id}.pdf`);
  doc.pipe(res);

  // ---- Header band ----
  doc.rect(0, 0, 595.28, 100).fill(C.pine);
  doc.rect(0, 100, 595.28, 4).fill(C.teal);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(22).text('CareDesk Hospital', L, 32, { lineBreak: false });
  doc.fillColor('#9cc0bd').font('Helvetica').fontSize(9).text('Multi-speciality care  |  Kerala, India', L, 60, { lineBreak: false });
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(26).text('INVOICE', L, 30, { width: W, align: 'right', lineBreak: false });
  doc.fillColor('#9cc0bd').font('Helvetica').fontSize(10).text(invNo, L, 62, { width: W, align: 'right', lineBreak: false });

  // ---- Billed to / invoice details ----
  let y = 126;
  const boxH = 92, half = W / 2 - 8;
  const box = (x, title) => {
    doc.roundedRect(x, y, half, boxH, 6).fill(C.bg);
    doc.fillColor(C.teal).font('Helvetica-Bold').fontSize(8).text(title, x + 14, y + 12, { lineBreak: false, characterSpacing: 1 });
  };
  const kv = (x, yy, k, v, w = half - 28) => {
    doc.fillColor(C.muted).font('Helvetica').fontSize(9).text(k, x + 14, yy, { width: 70, lineBreak: false });
    doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(9.5).text(String(v ?? '-'), x + 84, yy, { width: w - 70, lineBreak: false, ellipsis: true });
  };
  box(L, 'BILLED TO');
  kv(L, y + 30, 'Patient', b.name);
  kv(L, y + 45, 'Patient ID', b.patient_code || '-');
  kv(L, y + 60, 'Age / Gender', `${b.age ?? '-'} / ${b.gender || '-'}`);
  kv(L, y + 75, 'Phone', b.phone || '-');
  const rx = L + half + 16;
  box(rx, 'INVOICE DETAILS');
  kv(rx, y + 30, 'Invoice no', invNo);
  kv(rx, y + 45, 'Date', String(b.created_at).slice(0, 10));
  kv(rx, y + 60, 'Status', '');
  const paid = b.status === 'Paid';
  doc.roundedRect(rx + 84, y + 57, 56, 16, 8).fill(paid ? C.okBg : C.warnBg);
  doc.fillColor(paid ? C.ok : C.warn).font('Helvetica-Bold').fontSize(8.5)
    .text(paid ? 'PAID' : 'UNPAID', rx + 84, y + 62, { width: 56, align: 'center', lineBreak: false });
  y += boxH + 24;

  // ---- Itemised table ----
  const col = { d: L + 12, qty: 330, unit: 385, amt: 470 };
  const ensure = (h) => { if (y + h > 740) { doc.addPage(); y = 50; tableHead(); } };
  const tableHead = () => {
    doc.rect(L, y, W, 24).fill(C.pine);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);
    doc.text('DESCRIPTION', col.d, y + 8, { width: 280, lineBreak: false });
    doc.text('QTY', col.qty, y + 8, { width: 45, align: 'right', lineBreak: false });
    doc.text('UNIT PRICE', col.unit, y + 8, { width: 75, align: 'right', lineBreak: false });
    doc.text('AMOUNT', col.amt, y + 8, { width: R - 12 - col.amt, align: 'right', lineBreak: false });
    y += 24;
  };
  const group = (title, rows) => {
    ensure(40);
    doc.rect(L, y, W, 20).fill('#e8f1f1');
    doc.fillColor(C.pine).font('Helvetica-Bold').fontSize(9).text(title.toUpperCase(), col.d, y + 6, { lineBreak: false, characterSpacing: 0.8 });
    y += 20;
    if (!rows.length) {
      ensure(24);
      doc.fillColor(C.muted).font('Helvetica-Oblique').fontSize(9).text('No charges', col.d, y + 7, { lineBreak: false });
      doc.moveTo(L, y + 24).lineTo(R, y + 24).strokeColor(C.line).lineWidth(0.5).stroke();
      y += 24; return;
    }
    rows.forEach(([desc, qty, unit, amt], i) => {
      ensure(24);
      if (i % 2) doc.rect(L, y, W, 24).fill('#f8fafb');
      doc.fillColor(C.ink).font('Helvetica').fontSize(9.5);
      doc.text(desc, col.d, y + 7, { width: 280, lineBreak: false, ellipsis: true });
      doc.text(String(qty), col.qty, y + 7, { width: 45, align: 'right', lineBreak: false });
      doc.text(money(unit), col.unit, y + 7, { width: 75, align: 'right', lineBreak: false });
      doc.font('Helvetica-Bold').text(money(amt), col.amt, y + 7, { width: R - 12 - col.amt, align: 'right', lineBreak: false });
      doc.moveTo(L, y + 24).lineTo(R, y + 24).strokeColor(C.line).lineWidth(0.5).stroke();
      y += 24;
    });
  };
  tableHead();
  group('Consultation', appts.map((a) => [`Dr. ${a.name}${a.specialization ? ` (${a.specialization})` : ''} - ${String(a.appt_date).slice(0, 10)}`, 1, a.fee, a.fee]));
  group('Laboratory', labs.map((l) => [l.test_name, 1, l.charge, l.charge]));
  group('Medicines', meds.map((m) => [m.name, m.qty, m.price, m.qty * m.price]));

  // ---- Totals ----
  ensure(130);
  y += 16;
  const tx = 330, tw = R - tx;
  const tot = (k, v) => {
    doc.fillColor(C.muted).font('Helvetica').fontSize(10).text(k, tx + 12, y, { lineBreak: false });
    doc.fillColor(C.ink).font('Helvetica').fontSize(10).text(money(v), tx, y, { width: tw - 12, align: 'right', lineBreak: false });
    y += 20;
  };
  tot('Consultation', b.consultation); tot('Laboratory', b.lab); tot('Medicines', b.medicine);
  doc.moveTo(tx, y - 4).lineTo(R, y - 4).strokeColor(C.line).lineWidth(0.5).stroke();
  y += 4;
  doc.roundedRect(tx, y, tw, 32, 6).fill(C.pine);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11).text('GRAND TOTAL', tx + 12, y + 11, { lineBreak: false });
  doc.fontSize(13).text(money(b.total), tx, y + 10, { width: tw - 12, align: 'right', lineBreak: false });
  y += 32;

  // ---- Footer on every page ----
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(pages.start + i);
    doc.page.margins.bottom = 0; // allow drawing in the bottom margin without adding a page
    doc.moveTo(L, 790).lineTo(R, 790).strokeColor(C.line).lineWidth(0.5).stroke();
    doc.fillColor(C.muted).font('Helvetica').fontSize(8)
      .text('This is a computer-generated invoice and does not require a signature.', L, 799, { width: W - 80, lineBreak: false });
    doc.text(`Page ${i + 1} of ${pages.count}`, L, 799, { width: W, align: 'right', lineBreak: false });
  }
  doc.end();
}));

// Doctor prescribes several medicines for one patient in one go (all saved together)
app.post('/api/prescriptions/batch', wrap(async (req, res) => {
  const { patient_id, items } = req.body;
  const doctor_id = req.user.role === 'Doctor' ? req.user.doctorId : req.body.doctor_id;
  if (!patient_id || !doctor_id || !Array.isArray(items) || !items.length) throw fail(400, 'Choose a patient and add at least one medicine.');
  for (const it of items)
    if (!it.medicine_id || !(Number(it.qty) > 0)) throw fail(400, 'Every medicine needs a medicine and a quantity.');
  const [appts] = await db.query('SELECT appt_date, appt_time FROM appointments WHERE doctor_id=? AND patient_id=?', [doctor_id, patient_id]);
  if (!appts.length) throw fail(403, 'This patient has no appointment with you.');
  if (!appts.some((a) => new Date(`${String(a.appt_date).slice(0, 10)}T${String(a.appt_time).slice(0, 8)}`) >= new Date()))
    throw fail(403, "This patient's appointment has expired.");
  const cn = await db.getConnection();
  try {
    await cn.beginTransaction();
    for (const it of items)
      await cn.query('INSERT INTO prescriptions (patient_id, doctor_id, medicine_id, dosage, qty) VALUES (?,?,?,?,?)',
        [patient_id, doctor_id, it.medicine_id, it.dosage || null, it.qty]);
    await cn.commit(); res.json({ ok: true, count: items.length });
  } catch (e) { await cn.rollback(); throw e; } finally { cn.release(); }
}));

// Generic list + create. Doctors only ever see their own appointments and appointed patients.
const DOC_SCOPE = {
  appointments: 't.doctor_id=?', prescriptions: 't.doctor_id=?', doctors: 't.id=?',
  patients: 't.id IN (SELECT patient_id FROM appointments WHERE doctor_id=?)',
  medical_records: 't.patient_id IN (SELECT patient_id FROM appointments WHERE doctor_id=?)',
};
app.get('/api/:t', wrap(async (req, res) => {
  const t = req.params.t, cols = T[t]; if (!cols) throw fail(404, 'Unknown resource');
  const js = cols.filter((c) => J[c]);
  const sel = ['t.*', ...js.map((c) => `${c}_j.${J[c][1]} AS ${J[c][2]}`)];
  const joins = js.map((c) => `LEFT JOIN ${J[c][0]} ${c}_j ON ${c}_j.id=t.${c}`).join(' ');
  const where = [], args = [];
  if (cols.includes('patient_id') && req.query.patient_id) { where.push('t.patient_id=?'); args.push(req.query.patient_id); }
  if (t === 'prescriptions' && req.query.status) { where.push('t.status=?'); args.push(req.query.status); }
  if (req.user.role === 'Doctor' && DOC_SCOPE[t]) { where.push(DOC_SCOPE[t]); args.push(req.user.doctorId); }
  const sql = `SELECT ${sel.join(',')} FROM ${t} t ${joins} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY t.id DESC`;
  res.json((await db.query(sql, args))[0]);
}));
app.post('/api/:t', wrap(async (req, res) => {
  const t = req.params.t, cols = T[t]; if (!cols) throw fail(404, 'Unknown resource');
  if (req.user.role === 'Doctor' && ['medical_records', 'prescriptions'].includes(t)) {
    req.body.doctor_id = req.user.doctorId; // the doctor is always the signed-in doctor
    const [[ok]] = await db.query('SELECT COUNT(*) n FROM appointments WHERE doctor_id=? AND patient_id=?', [req.user.doctorId, req.body.patient_id]);
    if (!ok.n) throw fail(403, 'This patient has no appointment with you.');
  }
  if (t === 'medicines') { // same name + same price already in stock: just add to its stock
    const name = String(req.body.name || '').trim(), stock = Number(req.body.stock) || 0, price = Number(req.body.price) || 0;
    const [[ex]] = await db.query('SELECT id FROM medicines WHERE LOWER(TRIM(name))=LOWER(?) AND price=? LIMIT 1', [name, price]);
    if (ex) {
      await db.query('UPDATE medicines SET stock=stock+? WHERE id=?', [stock, ex.id]);
      return res.json({ id: ex.id, merged: true });
    }
    req.body.name = name; // different price (or new medicine): saved as a separate entry
  }
  const use = cols.filter((c) => req.body[c] !== undefined && req.body[c] !== '');
  const [r] = await db.query(`INSERT INTO ${t} (${use.join(',')}) VALUES (${use.map(() => '?').join(',')})`, use.map((c) => req.body[c]));
  if (t === 'patients') // unique patient ID (User Story 1)
    await db.query("UPDATE patients SET patient_code=CONCAT('PAT',LPAD(id,5,'0')) WHERE id=?", [r.insertId]);
  if (t === 'doctors') await syncDoctorUsers(db); // new doctor gets a login
  res.json({ id: r.insertId });
}));

app.listen(5000, () => console.log('HMS API running on http://localhost:5000'));
