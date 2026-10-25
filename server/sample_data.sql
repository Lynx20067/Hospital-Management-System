-- Optional: sample patients and appointments (run AFTER schema.sql)
USE hms;

INSERT INTO patients (name, age, gender, phone, address) VALUES
('Soorya Nair',    20, 'Male',   '9847012345', 'Kanjirappally'),
('Anu Thomas',     24, 'Female', '9876543210', 'Kottayam'),
('Rahul Menon',    35, 'Male',   '9946123456', 'Changanassery'),
('Meera Krishnan', 29, 'Female', '9961234567', 'Pala'),
('Joseph Mathew',  58, 'Male',   '9447098765', 'Erattupetta'),
('Fathima Beevi',  46, 'Female', '9633456789', 'Ponkunnam'),
('Arun Kumar',     41, 'Male',   '9895123789', 'Mundakayam'),
('Sneha Varghese', 12, 'Female', '9745678901', 'Kumarakom');

-- patient IDs like PAT00001 (id > 0 avoids the "safe update" block in Workbench)
UPDATE patients SET patient_code = CONCAT('PAT', LPAD(id, 5, '0')) WHERE id > 0;

-- Doctors 1, 2, 3 come from schema.sql (Anita, Rahul, Sneha)
INSERT INTO appointments (patient_id, doctor_id, appt_date, appt_time) VALUES
(1, 2, '2026-10-20', '10:00:00'),
(2, 1, '2026-10-20', '11:30:00'),
(3, 2, '2026-10-21', '09:30:00'),
(4, 3, '2026-10-21', '10:30:00');
