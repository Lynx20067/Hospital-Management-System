CREATE DATABASE IF NOT EXISTS hms;
USE hms;

CREATE TABLE patients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_code VARCHAR(12) UNIQUE,
  name VARCHAR(100) NOT NULL, age INT, gender VARCHAR(10),
  phone VARCHAR(15), address VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE doctors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL, specialization VARCHAR(100),
  fee DECIMAL(10,2) DEFAULT 0, available_from TIME, available_to TIME
);
CREATE TABLE appointments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL, doctor_id INT NOT NULL,
  appt_date DATE NOT NULL, appt_time TIME NOT NULL,
  status VARCHAR(20) DEFAULT 'Booked',
  UNIQUE KEY no_double_booking (doctor_id, appt_date, appt_time),
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  FOREIGN KEY (doctor_id) REFERENCES doctors(id)
);
-- Every update is a new row, so previous records always remain available.
CREATE TABLE medical_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL, doctor_id INT NOT NULL,
  diagnosis TEXT, prescription TEXT, notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  FOREIGN KEY (doctor_id) REFERENCES doctors(id)
);
CREATE TABLE lab_results (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL, test_name VARCHAR(100), result TEXT,
  charge DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id)
);
CREATE TABLE medicines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL, stock INT DEFAULT 0, price DECIMAL(10,2) DEFAULT 0
);
CREATE TABLE issued_medicines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL, medicine_id INT NOT NULL, qty INT NOT NULL,
  issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  FOREIGN KEY (medicine_id) REFERENCES medicines(id)
);
CREATE TABLE beds (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bed_no VARCHAR(10) UNIQUE, ward VARCHAR(50), occupied TINYINT DEFAULT 0
);
CREATE TABLE admissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL, bed_id INT NOT NULL, nurse VARCHAR(100),
  admitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  FOREIGN KEY (bed_id) REFERENCES beds(id)
);
CREATE TABLE vitals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL, temperature DECIMAL(4,1), bp VARCHAR(10),
  pulse INT, oxygen INT,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id)
);
CREATE TABLE bills (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL,
  consultation DECIMAL(10,2), lab DECIMAL(10,2), medicine DECIMAL(10,2), total DECIMAL(10,2),
  status VARCHAR(20) DEFAULT 'Unpaid',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id)
);

INSERT INTO doctors (name, specialization, fee, available_from, available_to) VALUES
 ('Anita Menon','Cardiology',600,'09:00','16:00'),
 ('Rahul Varghese','General Medicine',400,'09:00','17:00'),
 ('Sneha Pillai','Pediatrics',500,'10:00','15:00');
INSERT INTO medicines (name, stock, price) VALUES
 ('Paracetamol 500mg',200,2.50),('Amoxicillin 250mg',120,8),('Cetirizine 10mg',150,3);
INSERT INTO beds (bed_no, ward) VALUES ('G-01','General'),('G-02','General'),('ICU-1','ICU'),('ICU-2','ICU');
