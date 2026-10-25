# 🏥 CareDesk — Hospital Management System

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-Express-339933?logo=node.js&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-8-4479A1?logo=mysql&logoColor=white)

CareDesk is a full-stack hospital management web application built with **React + Vite**, **Node.js + Express** and **MySQL**. It connects the front desk, doctors, laboratory, pharmacy, wards and billing in one system, with a separate login and menu for every staff role.

## ✨ Features

- **Patient registration** with an automatically generated unique ID (`PAT00001`, `PAT00002`, …)
- **Appointments** with double-booking protection and automatic **Expired** status using the system clock
- **Medical records** saved as new entries, so treatment history is never overwritten
- **Prescriptions**: a doctor can prescribe several medicines at once (Add another medicine / Remove)
- **Pharmacy**: issue prescribed medicines; stock reduces automatically inside a database transaction
- **Medicine inventory**: same name and price adds to existing stock, a different price is kept as a separate entry
- **Admissions and beds**: occupied beds cannot be assigned twice
- **Laboratory results** and **patient vitals**
- **Billing**: consultation + laboratory + medicine charges, mark as paid, **View PDF** and **Download PDF** professional invoice
- **Reports dashboard**: patients, appointments, admissions, revenue, collected amount and doctor performance
- **Searchable patient dropdowns** (search by name, patient ID or phone) on every screen
- **Role-based access** with JWT login and bcrypt-hashed passwords

## 👥 User roles

| Role | What they can do |
|---|---|
| Administrator | Everything: doctors, patients, medicine inventory, billing, reports |
| Receptionist | Register patients, book appointments, admit patients to beds |
| Doctor | See own appointed patients, write medical records, prescribe medicines |
| Nurse | Record patient vitals |
| Pharmacist | Issue medicines, manage inventory, billing and invoices |
| Lab technician | Upload laboratory results |

## 🛠 Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 5, CSS3 |
| Backend | Node.js, Express 4, jsonwebtoken, bcryptjs, PDFKit, cors |
| Database | MySQL 8, `mysql2` |

## 📁 Project structure

```
hospital/
├── client/                 React + Vite frontend
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   └── src/
│       ├── main.jsx
│       ├── App.jsx         modules, pharmacy, prescribe, dashboard, searchable dropdown
│       ├── Login.jsx
│       ├── api.js          API helper, PDF view/download
│       └── styles.css
├── server/                 Express API
│   ├── index.js            routes, billing, PDF invoice, pharmacy, reports
│   ├── auth.js             login, JWT, role-based access
│   ├── schema.sql          database schema and starter data
│   ├── sample_data.sql     optional sample patients and appointments
│   └── package.json
└── README.md
```

The `hms` database has 13 tables. `schema.sql` creates 11 of them; the server creates `users` and `prescriptions` automatically when it starts.

## 🚀 Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) 18 or newer
- MySQL Server 8 and MySQL Workbench (the **MySQL80** service must be running)

### 1. Clone the repository

```bash
git clone https://github.com/<your-username>/<your-repo>.git
cd <your-repo>
```

### 2. Set up the database

1. Open MySQL Workbench and connect to your local server.
2. Open `server/schema.sql` and execute it. This creates the `hms` database and its tables.
3. *(Optional)* Open `server/sample_data.sql` and execute it to add sample patients and appointments.

Run `schema.sql` only once. To start over, run `DROP DATABASE hms;` and execute `schema.sql` again.

### 3. Run the server

```bash
cd server
npm install
```

Set your MySQL password, either by editing the `password` line in `server/index.js` or for the current terminal session (PowerShell):

```powershell
$env:DB_PASS = "your_mysql_password"
```

You can also set `DB_HOST` (default `127.0.0.1`), `DB_PORT` (default `3306`), `DB_USER` (default `root`) and `JWT_SECRET`. Then start the API:

```bash
npm start
```

Expected message: `HMS API running on http://localhost:5000`. Keep this terminal open.

### 4. Run the client

Open a second terminal:

```bash
cd client
npm install
npm run dev
```

Open the URL Vite prints, normally <http://localhost:5173>.

## 🔐 Default logins

Every password is the username followed by `@123`.

| Role | Username | Password |
|---|---|---|
| Administrator | `admin` | `admin@123` |
| Receptionist | `reception` | `reception@123` |
| Nurse | `nurse` | `nurse@123` |
| Pharmacist | `pharmacist` | `pharmacist@123` |
| Lab technician | `lab` | `lab@123` |
| Doctor | `anita`, `rahul`, `sneha` | `anita@123`, `rahul@123`, `sneha@123` |

- Each doctor the administrator adds gets a login automatically: the doctor's first name in lowercase, with the password `<username>@123`.
- **Change these passwords and set a strong `JWT_SECRET` before using the project outside a local demo.** Never commit your real MySQL password to GitHub.

## 🧩 Troubleshooting

| Problem | Fix |
|---|---|
| `Unknown database 'hms'` / `Table ... doesn't exist` | Execute `server/schema.sql` in MySQL Workbench first |
| `Access denied for user 'root'` / `ECONNREFUSED` | Start the MySQL80 service and check the password, host and port |
| `EADDRINUSE ... :5000` | Port 5000 is busy. Stop the old server (Ctrl + C) or run `netstat -ano \| findstr :5000` then `taskkill /PID <number> /F` |
| `Failed to fetch` / no data on screen | Make sure the server terminal is still running on port 5000 |
| `Cannot find module ...` | Run `npm install` in the folder that reported the error (`server` or `client`) |
| Workbench "safe update mode" error | Add `WHERE id > 0` to your `UPDATE` or `DELETE` statement |

## 🔭 Future improvements

- Patient portal and appointment reminders
- Discharge process with automatic bed release
- Per-visit billing with taxes, discounts and insurance
- Edit/cancel options, audit log and password change
- Automated tests and deployment with HTTPS

## 📄 License

Add your license here (for example MIT).

## 👤 Author

Your name — [GitHub](https://github.com/<your-username>)
