const path = require("path");
const express = require("express");
const oracledb = require("oracledb");
const cors = require("cors");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const app = express();
const port = Number(process.env.PORT) || 3000;

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

app.use(cors());
app.use(express.json({ limit: "100kb" }));
app.use((req, res, next) => {
    if (req.body === null || typeof req.body !== "object" || Array.isArray(req.body)) {
        req.body = {};
    }
    next();
});

function getDatabaseConfig() {
    const { DB_USER, DB_PASSWORD, DB_CONNECT_STRING } = process.env;

    if (!DB_USER || !DB_PASSWORD || !DB_CONNECT_STRING || DB_PASSWORD === "REPLACE_WITH_YOUR_ORACLE_PASSWORD") {
        const error = new Error("Oracle connection settings are missing.");
        error.code = "CONFIG_MISSING";
        throw error;
    }

    return {
        user: DB_USER,
        password: DB_PASSWORD,
        connectString: DB_CONNECT_STRING
    };
}

async function withConnection(action) {
    const connection = await oracledb.getConnection(getDatabaseConfig());

    try {
        return await action(connection);
    } finally {
        try {
            await connection.close();
        } catch (error) {
            console.error("Oracle connection close failed:", error.code || error.message);
        }
    }
}

function databaseError(res, error, message) {
    console.error("Oracle request failed:", error.code || error.message);
    const code = String(error.code || "");
    const isConnectionError = error.code === "CONFIG_MISSING" || code.startsWith("NJS-") || code.startsWith("DPI-") || code === "ECONNREFUSED" || ["ORA-01017", "ORA-12170", "ORA-12514", "ORA-12541", "ORA-12545", "ORA-28000"].includes(code);
    res.status(isConnectionError ? 503 : 500).json({
        success: false,
        message: isConnectionError ? "Database connection failed." : message
    });
}

function requiredText(value, maximumLength) {
    return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maximumLength;
}

function positiveInteger(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function positiveNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
}

function formatPlan(row) {
    return {
        planId: row.planId,
        planName: row.planName,
        durationMonths: row.durationMonths,
        price: Number(row.price),
        description: row.description || ""
    };
}

app.get("/api/test", async (req, res) => {
    try {
        const result = await withConnection(connection => connection.execute(
            `SELECT USER AS USER_NAME,
                    SYS_CONTEXT('USERENV', 'CON_NAME') AS CONTAINER_NAME
             FROM DUAL`
        ));

        res.json({
            success: true,
            user: result.rows[0].USER_NAME,
            container: result.rows[0].CONTAINER_NAME
        });
    } catch (error) {
        databaseError(res, error, "Unable to verify the Oracle connection.");
    }
});

app.get("/api/plans", async (req, res) => {
    try {
        const result = await withConnection(connection => connection.execute(
            `SELECT plan_id AS "planId",
                    plan_name AS "planName",
                    duration_months AS "durationMonths",
                    price AS "price",
                    description AS "description"
             FROM plans
             ORDER BY plan_id`
        ));
        res.json(result.rows.map(formatPlan));
    } catch (error) {
        databaseError(res, error, "Unable to load plans.");
    }
});

app.get("/api/members", async (req, res) => {
    try {
        const result = await withConnection(connection => connection.execute(
            `SELECT m.member_id AS "memberId",
                    m.name AS "name",
                    m.phone AS "phone",
                    m.email AS "email",
                    m.age AS "age",
                    m.gender AS "gender",
                    m.plan_id AS "planId",
                    p.plan_name AS "planName",
                    p.duration_months AS "durationMonths",
                    p.price AS "price",
                    m.registration_date AS "registrationDate"
             FROM members m
             JOIN plans p ON p.plan_id = m.plan_id
             ORDER BY m.member_id`
        ));
        res.json(result.rows.map(member => ({ ...member, price: Number(member.price) })));
    } catch (error) {
        databaseError(res, error, "Unable to load members.");
    }
});

app.post("/api/members", async (req, res) => {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const phone = typeof req.body.phone === "string" ? req.body.phone.trim() : "";
    const email = typeof req.body.email === "string" ? req.body.email.trim() : "";
    const age = Number(req.body.age);
    const gender = typeof req.body.gender === "string" ? req.body.gender.trim() : "";
    const planId = positiveInteger(req.body.plan_id);

    if (!requiredText(name, 100)) {
        return res.status(400).json({ success: false, message: "Enter a name up to 100 characters." });
    }
    if (!requiredText(phone, 15) || !/^[0-9+() -]{10,15}$/.test(phone) || phone.replace(/\D/g, "").length < 10) {
        return res.status(400).json({ success: false, message: "Enter a valid phone number." });
    }
    if (email && (email.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
        return res.status(400).json({ success: false, message: "Enter a valid email address." });
    }
    if (!Number.isInteger(age) || age < 15 || age > 80) {
        return res.status(400).json({ success: false, message: "Age must be between 15 and 80." });
    }
    if (!requiredText(gender, 20) || !planId) {
        return res.status(400).json({ success: false, message: "Select a valid gender and membership plan." });
    }

    try {
        const result = await withConnection(async connection => {
            const planResult = await connection.execute(
                `SELECT plan_id AS "planId",
                        plan_name AS "planName",
                        duration_months AS "durationMonths",
                        price AS "price",
                        description AS "description"
                 FROM plans
                 WHERE plan_id = :planId`,
                { planId }
            );

            if (!planResult.rows.length) {
                const error = new Error("Plan not found.");
                error.statusCode = 404;
                throw error;
            }

            const selectedPlan = formatPlan(planResult.rows[0]);
            const insertResult = await connection.execute(
                `INSERT INTO members (name, phone, email, age, gender, plan_id, registration_date)
                 VALUES (:name, :phone, :email, :age, :gender, :planId, SYSDATE)
                 RETURNING member_id INTO :memberId`,
                {
                    name,
                    phone,
                    email: email || null,
                    age,
                    gender,
                    planId,
                    memberId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
                },
                { autoCommit: true }
            );

            return {
                memberId: insertResult.outBinds.memberId[0],
                selectedPlan
            };
        });

        res.status(201).json({
            success: true,
            message: "Member registered successfully.",
            memberId: result.memberId,
            selectedPlan: result.selectedPlan
        });
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({ success: false, message: error.message });
        }
        databaseError(res, error, "Unable to register member. Please try again.");
    }
});

app.post("/api/plans", async (req, res) => {
    const planName = typeof req.body.plan_name === "string" ? req.body.plan_name.trim() : "";
    const durationMonths = positiveInteger(req.body.duration_months);
    const price = positiveNumber(req.body.price);
    const description = typeof req.body.description === "string" ? req.body.description.trim() : "";

    if (!requiredText(planName, 50) || !durationMonths || !price || description.length > 4000) {
        return res.status(400).json({ success: false, message: "Provide a plan name, positive duration and price, and a description up to 4000 characters." });
    }

    try {
        const result = await withConnection(connection => connection.execute(
            `INSERT INTO plans (plan_name, duration_months, price, description)
             VALUES (:planName, :durationMonths, :price, :description)
             RETURNING plan_id INTO :planId`,
            {
                planName,
                durationMonths,
                price,
                description: description || null,
                planId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
            },
            { autoCommit: true }
        ));

        res.status(201).json({
            success: true,
            message: "New membership plan added successfully!",
            plan: {
                planId: result.outBinds.planId[0],
                planName,
                durationMonths,
                price,
                description
            }
        });
    } catch (error) {
        databaseError(res, error, "Unable to add plan.");
    }
});

app.post("/api/payments", async (req, res) => {
    const memberId = positiveInteger(req.body.member_id);
    const planId = positiveInteger(req.body.plan_id);
    const amount = positiveNumber(req.body.amount);
    const paymentStatus = typeof req.body.payment_status === "string" ? req.body.payment_status.trim().toUpperCase() : "";
    const paymentDate = req.body.payment_date;

    if (!memberId || !planId || !amount || !["PAID", "PENDING"].includes(paymentStatus)) {
        return res.status(400).json({ success: false, message: "Provide valid member, plan, amount, and PAID or PENDING status." });
    }
    if (paymentDate !== undefined && paymentDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
        return res.status(400).json({ success: false, message: "Payment date must use YYYY-MM-DD format." });
    }

    try {
        const result = await withConnection(async connection => {
            const referenceResult = await connection.execute(
                `SELECT p.price AS "price"
                 FROM plans p
                 JOIN members m ON m.member_id = :memberId
                 WHERE p.plan_id = :planId`,
                { memberId, planId }
            );

            if (!referenceResult.rows.length) {
                const error = new Error("Member or plan not found.");
                error.statusCode = 404;
                throw error;
            }

            const expectedAmount = Number(referenceResult.rows[0].price);
            if (Math.round(amount * 100) !== Math.round(expectedAmount * 100)) {
                const error = new Error("Payment amount does not match the selected plan price.");
                error.statusCode = 400;
                throw error;
            }

            const insertResult = await connection.execute(
                `INSERT INTO payments (member_id, plan_id, payment_date, amount, payment_status)
                 VALUES (:memberId, :planId,
                         ${paymentDate ? "TO_DATE(:paymentDate, 'YYYY-MM-DD')" : "SYSDATE"},
                         :amount, :paymentStatus)
                 RETURNING payment_id INTO :paymentId`,
                {
                    memberId,
                    planId,
                    ...(paymentDate ? { paymentDate } : {}),
                    amount,
                    paymentStatus,
                    paymentId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
                },
                { autoCommit: true }
            );

            return insertResult.outBinds.paymentId[0];
        });

        res.status(201).json({
            success: true,
            message: "Payment recorded successfully!",
            paymentId: result
        });
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({ success: false, message: error.message });
        }
        databaseError(res, error, "Unable to record payment.");
    }
});

app.get("/api/dashboard", async (req, res) => {
    try {
        const result = await withConnection(connection => connection.execute(
            `SELECT (SELECT COUNT(*) FROM members) AS "totalMembers",
                    (SELECT COUNT(DISTINCT member_id)
                     FROM payments
                     WHERE UPPER(payment_status) = 'PAID') AS "paidMembers",
                    (SELECT COUNT(*) FROM members) -
                    (SELECT COUNT(DISTINCT member_id)
                     FROM payments
                     WHERE UPPER(payment_status) = 'PAID') AS "pendingPayments",
                    (SELECT COALESCE(SUM(amount), 0)
                     FROM payments
                     WHERE UPPER(payment_status) = 'PAID') AS "totalPaidAmount"
             FROM DUAL`
        ));
        const dashboard = result.rows[0];
        res.json({
            totalMembers: Number(dashboard.totalMembers),
            paidMembers: Number(dashboard.paidMembers),
            pendingPayments: Number(dashboard.pendingPayments),
            totalPaidAmount: Number(dashboard.totalPaidAmount)
        });
    } catch (error) {
        databaseError(res, error, "Unable to load the dashboard.");
    }
});

app.get("/api/payment-details", async (req, res) => {
    try {
        const result = await withConnection(connection => connection.execute(
            `SELECT m.name AS "memberName",
                    p.plan_name AS "planName",
                    TO_CHAR(pay.payment_date, 'YYYY-MM-DD') AS "paymentDate",
                    pay.amount AS "amount",
                    pay.payment_status AS "paymentStatus"
             FROM payments pay
             JOIN members m ON m.member_id = pay.member_id
             JOIN plans p ON p.plan_id = pay.plan_id
             ORDER BY pay.payment_date DESC, pay.payment_id DESC`
        ));
        res.json(result.rows.map(payment => ({ ...payment, amount: Number(payment.amount) })));
    } catch (error) {
        databaseError(res, error, "Unable to load payment details.");
    }
});

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
["index", "members", "plans", "payment", "history"].forEach(page => {
    app.get(`/${page}.html`, (req, res) => res.sendFile(path.join(__dirname, `${page}.html`)));
});
app.use("/css", express.static(path.join(__dirname, "css"), { dotfiles: "deny" }));
app.use("/js", express.static(path.join(__dirname, "js"), { dotfiles: "deny" }));

app.use((req, res) => {
    res.status(404).json({ success: false, message: "Not found." });
});

app.use((error, req, res, next) => {
    console.error("Unhandled request error:", error.code || error.message);
    if (res.headersSent) {
        return next(error);
    }
    res.status(error.status || 500).json({ success: false, message: "Request failed." });
});

app.listen(port, () => {
    console.log(`Gym Membership System running at http://localhost:${port}`);
});
