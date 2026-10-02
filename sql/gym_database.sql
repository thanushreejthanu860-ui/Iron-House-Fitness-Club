-- ==========================================
-- GYM MEMBERSHIP MANAGEMENT SYSTEM
-- MySQL database schema and dashboard queries
-- ==========================================

CREATE DATABASE IF NOT EXISTS gym_management;
USE gym_management;

-- Plans are created before members so members can reference their selected plan.
CREATE TABLE plans (
    plan_id INT PRIMARY KEY AUTO_INCREMENT,
    plan_name VARCHAR(50) NOT NULL,
    duration INT NOT NULL,
    price DECIMAL(10,2) NOT NULL
);

CREATE TABLE members (
    member_id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(15) NOT NULL,
    email VARCHAR(100),
    age INT,
    gender VARCHAR(20),
    plan_id INT NOT NULL,
    CONSTRAINT fk_members_plan FOREIGN KEY (plan_id) REFERENCES plans(plan_id)
);

CREATE TABLE payments (
    payment_id INT PRIMARY KEY AUTO_INCREMENT,
    member_id INT NOT NULL,
    plan_id INT NOT NULL,
    payment_date DATE NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    CONSTRAINT fk_payments_member FOREIGN KEY (member_id) REFERENCES members(member_id),
    CONSTRAINT fk_payments_plan FOREIGN KEY (plan_id) REFERENCES plans(plan_id)
);

INSERT INTO plans (plan_name, duration, price) VALUES
('Monthly', 1, 1000.00),
('Quarterly', 3, 2500.00),
('Yearly', 12, 8000.00);

INSERT INTO members (name, phone, email, age, gender, plan_id) VALUES
('Rahul Kumar', '9876543210', 'rahul@gmail.com', 21, 'Male', 1),
('Ananya Rao', '9876543211', 'ananya@gmail.com', 20, 'Female', 2),
('Arjun Shetty', '9876543212', 'arjun@gmail.com', 23, 'Male', 3);

INSERT INTO payments (member_id, plan_id, payment_date, amount) VALUES
(1, 1, '2026-10-02', 1000.00),
(2, 2, '2026-10-02', 2500.00);

-- 1. Count all registered members.
SELECT COUNT(*) AS total_registered_members
FROM members;

-- 2. Count members who have completed at least one payment.
SELECT COUNT(DISTINCT member_id) AS total_paid_members
FROM payments;

-- 3. Count registered members with no payment record.
SELECT COUNT(*) AS pending_payment_members
FROM members AS m
WHERE NOT EXISTS (
    SELECT 1
    FROM payments AS p
    WHERE p.member_id = m.member_id
);

-- 4. Calculate total payment amount collected.
SELECT COALESCE(SUM(amount), 0) AS total_payment_amount
FROM payments;

-- 5. Display payment details with member and plan information.
SELECT
    m.member_id,
    m.name AS member_name,
    pl.plan_name AS membership_plan,
    CASE WHEN p.payment_id IS NULL THEN 'Pending' ELSE 'Paid' END AS payment_status,
    p.payment_date,
    p.amount
FROM members AS m
JOIN plans AS pl ON pl.plan_id = m.plan_id
LEFT JOIN payments AS p ON p.member_id = m.member_id
ORDER BY m.member_id, p.payment_date DESC;

-- Plans and payments can also be inspected independently.
SELECT * FROM plans;
SELECT * FROM members;
SELECT * FROM payments;
