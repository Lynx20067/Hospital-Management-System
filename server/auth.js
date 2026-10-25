import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'change-this-secret-before-real-use';

// username, role, display name. Default password for each is  <username>@123
// (every doctor gets their own login automatically, see syncDoctorUsers)
const USERS = [
  ['admin', 'Administrator', 'Hospital Administrator'],
  ['reception', 'Receptionist', 'Front Desk'],
  ['nurse', 'Nurse', 'Ward Nurse'],
  ['pharmacist', 'Pharmacist', 'Pharmacy Counter'],
  ['lab', 'Lab technician', 'Laboratory'],
];

// API sections each role may use ('*' = everything)
// Billing ('bills') now belongs to the Pharmacist; there is no separate billing login.
const ALLOW = {
  Administrator: '*',
  Receptionist: ['patients', 'appointments', 'admissions', 'admit'],
  Doctor: ['medical_records', 'appointments', 'prescriptions'],
  Nurse: ['vitals'],
  Pharmacist: ['issued_medicines', 'issue', 'medicines', 'prescriptions', 'bills'],
  'Lab technician': ['lab_results'],
};
// Lists used to fill dropdowns: any signed-in user may read these
const OPEN_GET = ['patients', 'doctors', 'medicines', 'beds'];

// One login per doctor: first name in lowercase, password <username>@123
export async function syncDoctorUsers(db) {
  const [docs] = await db.query(
    'SELECT d.id, d.name FROM doctors d LEFT JOIN users u ON u.doctor_id=d.id WHERE u.id IS NULL');
  for (const d of docs) {
    const clean = d.name.replace(/^dr\.?\s*/i, '');
    const base = clean.toLowerCase().split(/\s+/)[0].replace(/[^a-z]/g, '') || 'doctor';
    const [[e]] = await db.query('SELECT COUNT(*) n FROM users WHERE username=?', [base]);
    const username = e.n ? `${base}${d.id}` : base;
    await db.query('INSERT INTO users (username, password_hash, role, full_name, doctor_id) VALUES (?,?,?,?,?)',
      [username, await bcrypt.hash(`${username}@123`, 10), 'Doctor', `Dr. ${clean}`, d.id]);
    console.log(`Doctor login created: ${username} / ${username}@123`);
  }
}

export async function setupAuth(app, db) {
  await db.query(`CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(100) NOT NULL,
    role VARCHAR(30) NOT NULL,
    full_name VARCHAR(100),
    doctor_id INT NULL)`);
  try { await db.query('ALTER TABLE users ADD COLUMN doctor_id INT NULL'); } catch { /* already there */ }
  const [[{ n }]] = await db.query('SELECT COUNT(*) n FROM users');
  if (!n) {
    for (const [u, role, name] of USERS) {
      await db.query('INSERT INTO users (username, password_hash, role, full_name) VALUES (?,?,?,?)',
        [u, await bcrypt.hash(`${u}@123`, 10), role, name]);
    }
    console.log('Created default users (password = username@123)');
  }
  await db.query("DELETE FROM users WHERE role='Doctor' AND doctor_id IS NULL"); // old shared doctor login
  await db.query("DELETE FROM users WHERE role='Patient'"); // patient login removed
  await db.query("DELETE FROM users WHERE role='Billing staff'"); // billing login removed (pharmacist does billing)
  await syncDoctorUsers(db);

  app.post('/api/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      const [[u]] = await db.query('SELECT * FROM users WHERE username=?', [username]);
      if (!u || !(await bcrypt.compare(password || '', u.password_hash)))
        return res.status(401).json({ error: 'Wrong username or password.' });
      const token = jwt.sign({ id: u.id, role: u.role, name: u.full_name, doctorId: u.doctor_id }, SECRET, { expiresIn: '8h' });
      res.json({ token, role: u.role, name: u.full_name });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
  });

  // Every other /api route needs a valid token and the right role
  app.use('/api', (req, res, next) => {
    if (req.path === '/login') return next();
    try {
      req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), SECRET);
    } catch {
      return res.status(401).json({ error: 'Please sign in.' });
    }
    const { role } = req.user;
    const section = req.path.split('/')[1];
    const allowed = ALLOW[role];
    let ok = allowed === '*' || allowed?.includes(section) || (req.method === 'GET' && OPEN_GET.includes(section));
    const write = req.method !== 'GET';
    if (write && section === 'prescriptions' && !['Doctor', 'Administrator'].includes(role)) ok = false; // only doctors prescribe
    if (write && section === 'appointments' && role === 'Doctor') ok = false; // doctors view, not book
    if (!ok) return res.status(403).json({ error: 'You do not have access to this section.' });
    next();
  });
}
