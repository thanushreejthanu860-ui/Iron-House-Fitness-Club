
const path = require("path");
const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");

require("dotenv").config({
  path: path.join(__dirname, ".env")
});

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json({ limit: "100kb" }));

// Connect to Railway MySQL using MYSQL_URL.
function createDatabasePool() {
  const connectionString = process.env.MYSQL_URL;

  if (!connectionString) {
    throw new Error(
      "MYSQL_URL is missing. Configure it in Railway Variables."
    );
  }

  const url = new URL(connectionString);

  if (!["mysql:", "mysql2:"].includes(url.protocol)) {
    throw new Error("MYSQL_URL must be a MySQL connection URL.");
  }

  const databaseName = decodeURIComponent(url.pathname.slice(1));

  if (!url.hostname || !url.username || !databaseName) {
    throw new Error(
      "MYSQL_URL must include a host, username, and database name."
    );
  }

  return mysql.createPool({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: databaseName,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 15000,
    dateStrings: true
  });
}

let pool;

function sendDatabaseError(res, error) {
  console.error("MySQL API error:", error.message);

  return res.status(500).json({
    error: "Database operation failed. Check the database configuration."
  });
}

function getNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

// Create the database tables and default plans automatically.
async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS plans (
      plan_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      plan_name VARCHAR(100) NOT NULL,
      duration_months INT NOT NULL,
      price DECIMAL(10,2) NOT NULL,
      description VARCHAR(500) DEFAULT NULL
    ) ENGINE=InnoDB
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS members (
      member_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      phone VARCHAR(30) NOT NULL,
      email VARCHAR(255) NOT NULL,
      age INT NOT NULL,
      gender VARCHAR(30) NOT NULL,
      plan_id INT NOT NULL,
      registration_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_members_plan (plan_id),
      CONSTRAINT fk_members_plan
        FOREIGN KEY (plan_id) REFERENCES plans(plan_id)
    ) ENGINE=InnoDB
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payments (
      payment_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      member_id INT NOT NULL,
      plan_id INT NOT NULL,
      payment_date DATETIME DEFAULT NULL,
      amount DECIMAL(10,2) NOT NULL,
      payment_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      INDEX idx_payments_member (member_id),
      INDEX idx_payments_status (payment_status),
      CONSTRAINT fk_payments_member
        FOREIGN KEY (member_id) REFERENCES members(member_id),
      CONSTRAINT fk_payments_plan
        FOREIGN KEY (plan_id) REFERENCES plans(plan_id)
    ) ENGINE=InnoDB
  `);

  const [rows] = await pool.query(
    "SELECT COUNT(*) AS total FROM plans"
  );

  if (Number(rows[0].total) === 0) {
    await pool.query(
      `INSERT INTO plans
        (plan_name, duration_months, price, description)
       VALUES
        (?, ?, ?, ?),
        (?, ?, ?, ?),
        (?, ?, ?, ?)`,
      [
        "Monthly", 1, 1000, "Gym membership for one month",
        "Quarterly", 3, 2500, "Gym membership for three months",
        "Yearly", 12, 8000, "Gym membership for twelve months"
      ]
    );
  }

  console.log("MySQL tables are ready.");
}

// Database connection test.
app.get("/api/test", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT DATABASE() AS databaseName, CURRENT_USER() AS user"
    );

    res.json({
      success: true,
      message: "MySQL connection successful",
      ...rows[0]
    });
  } catch (error) {
    sendDatabaseError(res, error);
  }
});

// Get all membership plans.
app.get("/api/plans", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        plan_id AS planId,
        plan_name AS planName,
        duration_months AS durationMonths,
        price,
        description
      FROM plans
      ORDER BY plan_id
    `);

    res.json(rows);
  } catch (error) {
    sendDatabaseError(res, error);
  }
});

// Add a plan.
app.post("/api/plans", async (req, res) => {
  try {
    const { planName, durationMonths, price, description } = req.body;

    const duration = getNumber(durationMonths);
    const planPrice = getNumber(price);

    if (
      typeof planName !== "string" ||
      !planName.trim() ||
      !Number.isInteger(duration) ||
      duration < 1 ||
      !Number.isFinite(planPrice) ||
      planPrice < 0
    ) {
      return res.status(400).json({
        error: "Provide a plan name, valid duration, and price."
      });
    }

    const [result] = await pool.execute(
      `INSERT INTO plans
        (plan_name, duration_months, price, description)
       VALUES (?, ?, ?, ?)`,
      [
        planName.trim(),
        duration,
        planPrice,
        description || null
      ]
    );

    res.status(201).json({
      success: true,
      planId: result.insertId,
      message: "Plan added successfully."
    });
  } catch (error) {
    sendDatabaseError(res, error);
  }
});

// Get registered members.
app.get("/api/members", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        m.member_id AS memberId,
        m.name,
        m.phone,
        m.email,
        m.age,
        m.gender,
        m.plan_id AS planId,
        m.registration_date AS registrationDate,
        p.plan_name AS planName,
        p.price
      FROM members m
      JOIN plans p ON p.plan_id = m.plan_id
      ORDER BY m.member_id DESC
    `);

    res.json(rows);
  } catch (error) {
    sendDatabaseError(res, error);
  }
});

// Register a member and create their pending payment together.
app.post("/api/members", async (req, res) => {
  let connection;

  try {
    const { name, phone, email, age, gender } = req.body;
    const planId = getNumber(req.body.planId ?? req.body.plan_id);
    const memberAge = getNumber(age);

    if (
      typeof name !== "string" || !name.trim() ||
      typeof phone !== "string" || !phone.trim() ||
      typeof email !== "string" || !email.trim() ||
      !Number.isInteger(memberAge) || memberAge < 1 || memberAge > 120 ||
      typeof gender !== "string" || !gender.trim() ||
      !Number.isInteger(planId) || planId < 1
    ) {
      return res.status(400).json({
        error: "Please provide valid member details and a membership plan."
      });
    }

    const [plans] = await pool.execute(
      `SELECT plan_id, plan_name, duration_months, price
       FROM plans WHERE plan_id = ?`,
      [planId]
    );

    if (plans.length === 0) {
      return res.status(400).json({ error: "Selected plan was not found." });
    }

    const plan = plans[0];
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [memberResult] = await connection.execute(
      `INSERT INTO members
        (name, phone, email, age, gender, plan_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        phone.trim(),
        email.trim(),
        memberAge,
        gender.trim(),
        planId
      ]
    );

    await connection.execute(
      `INSERT INTO payments
        (member_id, plan_id, payment_date, amount, payment_status)
       VALUES (?, ?, NULL, ?, 'PENDING')`,
      [memberResult.insertId, planId, plan.price]
    );

    await connection.commit();

    res.status(201).json({
      success: true,
      memberId: memberResult.insertId,
      selectedPlan: plan,
      message: "Member registered. Payment is pending."
    });
  } catch (error) {
    if (connection) await connection.rollback();
    sendDatabaseError(res, error);
  } finally {
    if (connection) connection.release();
  }
});

// Record a payment, updating the pending record when one exists.
app.post("/api/payments", async (req, res) => {
  let connection;

  try {
    const memberId = getNumber(req.body.memberId ?? req.body.member_id);
    const planId = getNumber(req.body.planId ?? req.body.plan_id);
    const amount = getNumber(req.body.amount);
    const suppliedDate = req.body.paymentDate ?? req.body.payment_date ?? null;

    if (
      !Number.isInteger(memberId) || memberId < 1 ||
      !Number.isInteger(planId) || planId < 1 ||
      !Number.isFinite(amount) || amount < 0
    ) {
      return res.status(400).json({
        error: "Provide a valid member, plan, and payment amount."
      });
    }

    if (
      suppliedDate !== null &&
      (typeof suppliedDate !== "string" ||
       !/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.test(suppliedDate))
    ) {
      return res.status(400).json({
        error: "Payment date must use YYYY-MM-DD or a valid date-time format."
      });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [matchingPlans] = await connection.execute(
      `SELECT p.plan_id, p.price
       FROM plans p
       JOIN members m ON m.plan_id = p.plan_id
       WHERE m.member_id = ? AND p.plan_id = ?`,
      [memberId, planId]
    );

    if (matchingPlans.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        error: "Member or their selected plan was not found."
      });
    }

    const expectedAmount = Number(matchingPlans[0].price);

    if (Math.abs(amount - expectedAmount) > 0.009) {
      await connection.rollback();
      return res.status(400).json({
        error: `The payment amount must be ₹${expectedAmount.toFixed(2)}.`
      });
    }

    const [pendingRows] = await connection.execute(
      `SELECT payment_id
       FROM payments
       WHERE member_id = ? AND plan_id = ?
         AND payment_status = 'PENDING'
       ORDER BY payment_id
       LIMIT 1
       FOR UPDATE`,
      [memberId, planId]
    );

    let paymentId;

    if (pendingRows.length > 0) {
      paymentId = pendingRows[0].payment_id;

      await connection.execute(
        `UPDATE payments
         SET payment_status = 'PAID',
             payment_date = COALESCE(?, CURRENT_TIMESTAMP),
             amount = ?
         WHERE payment_id = ?`,
        [suppliedDate, expectedAmount, paymentId]
      );
    } else {
      const [paymentResult] = await connection.execute(
        `INSERT INTO payments
          (member_id, plan_id, payment_date, amount, payment_status)
         VALUES (?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, 'PAID')`,
        [memberId, planId, suppliedDate, expectedAmount]
      );

      paymentId = paymentResult.insertId;
    }

    await connection.commit();

    res.status(201).json({
      success: true,
      paymentId,
      message: "Payment recorded successfully."
    });
  } catch (error) {
    if (connection) await connection.rollback();
    sendDatabaseError(res, error);
  } finally {
    if (connection) connection.release();
  }
});

// Dashboard totals based on actual database payment statuses.
app.get("/api/dashboard", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM members) AS totalMembers,
        (SELECT COUNT(DISTINCT member_id)
         FROM payments WHERE payment_status = 'PAID') AS paidMembers,
        (SELECT COUNT(*)
         FROM payments WHERE payment_status = 'PENDING') AS pendingPayments,
        (SELECT COALESCE(SUM(amount), 0)
         FROM payments WHERE payment_status = 'PAID') AS totalPaidAmount
    `);

    const dashboard = rows[0];

    res.json({
      totalMembers: Number(dashboard.totalMembers),
      paidMembers: Number(dashboard.paidMembers),
      pendingPayments: Number(dashboard.pendingPayments),
      totalPaidAmount: Number(dashboard.totalPaidAmount)
    });
  } catch (error) {
    sendDatabaseError(res, error);
  }
});

// Payment history/details.
app.get("/api/payment-details", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        pay.payment_id AS paymentId,
        m.member_id AS memberId,
        m.name AS memberName,
        m.phone,
        m.email,
        p.plan_name AS planName,
        pay.amount,
        pay.payment_status AS paymentStatus,
        DATE_FORMAT(pay.payment_date, '%Y-%m-%d') AS paymentDate
      FROM payments pay
      JOIN members m ON m.member_id = pay.member_id
      JOIN plans p ON p.plan_id = pay.plan_id
      ORDER BY
        CASE WHEN pay.payment_date IS NULL THEN 1 ELSE 0 END,
        pay.payment_date DESC,
        pay.payment_id DESC
    `);

    res.json(rows);
  } catch (error) {
    sendDatabaseError(res, error);
  }
});

// Serve the existing HTML, CSS, and JavaScript files.
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Start only after the database is connected and initialized.
async function startServer() {
  pool = createDatabasePool();

  const connection = await pool.getConnection();
  connection.release();

  await initializeDatabase();

  app.listen(port, "0.0.0.0", () => {
    console.log(`Iron House Fitness running on port ${port}`);
  });
}

startServer().catch((error) => {
  console.error("Server startup failed:", error.message);
  process.exit(1);
});
