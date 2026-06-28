const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const adminAuth = require("../middleware/admin.middleware");
const createUploader = require("../middleware/upload.middleware");
const { exportOrdersCSV } = require("../services/exportController");
const upload = createUploader("profile");
const path = require("path");

const router = express.Router();

/* =========================
   CONSTANTS
========================= */
const MAIN_ADMIN_ROLE_FLAG = "is_main"; // use role flag, not hardcoded email
const PASSWORD_MIN_LENGTH = 8;
const NAME_MAX_LENGTH = 50;
const PHONE_MAX_LENGTH = 20;
const REASON_MIN_LENGTH = 3;
const REASON_MAX_LENGTH = 500;

/* =========================
   LOGIN RATE LIMITER
   In-memory store (replace with Redis in multi-instance deployments)
========================= */
const loginAttempts = new Map(); // key: email → { count, lockedUntil }

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(email) {
  const now = Date.now();
  const record = loginAttempts.get(email);

  if (!record) return { allowed: true };

  if (record.lockedUntil && now < record.lockedUntil) {
    const remaining = Math.ceil((record.lockedUntil - now) / 60000);
    return { allowed: false, remaining };
  }

  // Lock expired — reset
  if (record.lockedUntil && now >= record.lockedUntil) {
    loginAttempts.delete(email);
    return { allowed: true };
  }

  return { allowed: true };
}

function recordFailedAttempt(email) {
  const now = Date.now();
  const record = loginAttempts.get(email) || { count: 0, lockedUntil: null };

  record.count += 1;

  if (record.count >= MAX_LOGIN_ATTEMPTS) {
    record.lockedUntil = now + LOCK_DURATION_MS;
  }

  loginAttempts.set(email, record);
}

function clearLoginAttempts(email) {
  loginAttempts.delete(email);
}

/* =========================
   INPUT VALIDATORS
========================= */
function isValidName(name) {
  return (
    typeof name === "string" &&
    name.trim().length >= 1 &&
    name.trim().length <= NAME_MAX_LENGTH &&
    /^[a-zA-Z\s'\-\.]+$/.test(name.trim())
  );
}

function isValidPhone(phone) {
  if (!phone) return true; // optional field
  return (
    typeof phone === "string" &&
    phone.trim().length <= PHONE_MAX_LENGTH &&
    /^[\d\s\+\-\(\)]+$/.test(phone.trim())
  );
}

function isStrongPassword(password) {
  if (typeof password !== "string") return false;
  if (password.length < PASSWORD_MIN_LENGTH) return false;
  if (!/[A-Z]/.test(password)) return false; // at least one uppercase
  if (!/[a-z]/.test(password)) return false; // at least one lowercase
  if (!/[0-9]/.test(password)) return false; // at least one digit
  if (!/[^A-Za-z0-9]/.test(password)) return false; // at least one special char
  return true;
}

/* =========================
   SAFE SOCKET EMITTER
========================= */
function emitSocket(req, event, data) {
  try {
    const io = req.app.get("io");
    if (io) {
      io.emit(event, data);
    }
  } catch (err) {
    console.error("Socket emit error:", err);
  }
}

/* =========================
   ORDER STATUS WORKFLOW
   Enforces valid transitions to prevent status skipping
========================= */
const STATUS_TRANSITIONS = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["out_for_delivery"],
  out_for_delivery: ["delivered"],
  refund_requested: ["refunded", "refund_rejected"]
};

function isValidTransition(currentStatus, nextStatus) {
  const allowed = STATUS_TRANSITIONS[currentStatus];
  return allowed && allowed.includes(nextStatus);
}

/* =========================
   ADMIN LOGIN
========================= */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Basic presence check
    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Email and password required" });
    }

    const normalizedEmail = String(email).toLowerCase().trim();

    // --- Rate limit check ---
    const rateCheck = checkRateLimit(normalizedEmail);
    if (!rateCheck.allowed) {
      return res.status(429).json({
        success: false,
        message: `Too many failed attempts. Try again in ${rateCheck.remaining} minute(s).`
      });
    }

    const [rows] = await db.query(
      "SELECT * FROM users WHERE email=? AND role='admin'",
      [normalizedEmail]
    );

    // Generic message to prevent email enumeration
    if (!rows.length) {
      recordFailedAttempt(normalizedEmail);
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }

    const admin = rows[0];

    // --- Blocked admin check ---
    if (admin.status && admin.status !== "active") {
      return res
        .status(403)
        .json({ success: false, message: "Account is not active" });
    }

    const match = await bcrypt.compare(password, admin.password);

    if (!match) {
      recordFailedAttempt(normalizedEmail);
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }

    // --- Clear failed attempts on success ---
    clearLoginAttempts(normalizedEmail);

    // --- Session regeneration to prevent session fixation ---
    await new Promise((resolve, reject) => {
      req.session.regenerate((err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    req.session.user = {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      isMainAdmin: !!admin.is_main_admin // store flag, not email
    };

    res.json({
      success: true,
      user: {
        id: req.session.user.id,
        email: req.session.user.email,
        role: req.session.user.role
      }
    });

  } catch (err) {
    console.error("ADMIN LOGIN ERROR:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* =========================
   ADMIN LOGOUT
========================= */
router.post("/logout", adminAuth, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("coffeecape.sid");
    res.json({ success: true });
  });
});

/* =========================
   USERS STATS
========================= */
router.get("/users/stats", adminAuth, async (req, res) => {
  try {
    const [[total]] = await db.query(
      "SELECT COUNT(*) AS count FROM users"
    );

    const [[today]] = await db.query(
      "SELECT COUNT(*) AS count FROM users WHERE DATE(created_at)=CURDATE()"
    );

    const [[active]] = await db.query(
      `
      SELECT COUNT(DISTINCT user_id) AS count
      FROM orders
      WHERE created_at >= NOW() - INTERVAL 1 DAY
      `
    );

    res.json({
      success: true,
      totalUsers: total.count,
      todayUsers: today.count,
      activeUsers: active.count
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

/* =========================
   GET ALL USERS (ADMIN)
========================= */
router.get("/users", adminAuth, async (req, res) => {
  try {
    const [users] = await db.query(`
      SELECT id, email, phone, role, status, first_name, last_name, created_at
      FROM users WHERE role = 'user'
      ORDER BY created_at DESC
    `);

    res.json({ success: true, users });

  } catch (err) {
    console.error("Fetch users error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch users"
    });
  }
});

/* =========================
   BLOCK / ACTIVATE USER
========================= */
router.put("/users/:id/status", adminAuth, async (req, res) => {
  try {
    const { status } = req.body;

    if (!["active", "blocked"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status"
      });
    }

    const userId = parseInt(req.params.id, 10);
    if (!userId || isNaN(userId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    const [[user]] = await db.query(
      "SELECT id, role, is_main_admin, status FROM users WHERE id=? AND role='user'",
      [userId]
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    if (user.id === req.user.id) {
      return res.status(403).json({
        success: false,
        message: "You cannot modify your own account"
      });
    }

    if (user.role === "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin accounts cannot be modified"
      });
    }

    // Protect main admin by role flag, not hardcoded email
    if (user.is_main_admin) {
      return res.status(403).json({
        success: false,
        message: "This account cannot be modified"
      });
    }

    if (user.status === status) {
      return res.status(400).json({
        success: false,
        message: `User is already ${status}`
      });
    }

    await db.query(
      "UPDATE users SET status=? WHERE id=?",
      [status, userId]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("User status update error:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

/* =========================
   GET USER FULL DETAILS (ADMIN)
========================= */
router.get("/users/:id", adminAuth, async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (!userId || isNaN(userId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    const [[user]] = await db.query(`
      SELECT 
        id,
        email,
        role,
        first_name,
        last_name,
        phone,
        street,
        city,
        zip,
        country,
        profile_image,
        created_at
      FROM users
      WHERE id=?
      AND role = 'user'
    `, [userId]);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    res.json({ success: true, user });

  } catch (err) {
    console.error("User detail error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user details"
    });
  }
});

/* =========================
   ORDERS STATS
========================= */
router.get("/orders/stats", adminAuth, async (req, res) => {
  try {

    const [[ordersRow]] = await db.query(
      "SELECT COUNT(*) AS count FROM orders WHERE DATE(created_at)=CURDATE()"
    );

    const [[revenueRow]] = await db.query(
      `
      SELECT SUM(total) AS amount
      FROM orders
      WHERE DATE(created_at)=CURDATE()
        AND status='delivered'
      `
    );

    const todayOrders = ordersRow.count || 0;
    const todayRevenue = Number(revenueRow.amount) || 0;

    const [revenueByDay] = await db.query(`
      SELECT DATE(created_at) AS day, SUM(total) AS total
      FROM orders
      WHERE status='delivered'
      GROUP BY day
      ORDER BY day
    `);

    const [ordersByDay] = await db.query(`
      SELECT DATE(created_at) AS day, COUNT(*) AS count
      FROM orders
      GROUP BY day
      ORDER BY day
    `);

    const [statusRows] = await db.query(`
      SELECT status, COUNT(*) AS count
      FROM orders
      GROUP BY status
    `);

    const statusCount = {};
    statusRows.forEach(r => {
      statusCount[r.status] = r.count;
    });

    const [topItems] = await db.query(`
      SELECT oi.name AS name, SUM(oi.qty) AS qty
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      GROUP BY oi.name
      ORDER BY qty DESC
      LIMIT 6
    `);

    res.json({
      success: true,
      todayOrders,
      todayRevenue,
      revenueByDay,
      ordersByDay,
      statusCount,
      topItems
    });

  } catch (err) {
    console.error("Stats error:", err);
    res.status(500).json({ success: false });
  }
});

/* =========================
   Export The Orders
========================= */
router.get(
  "/orders/export",
  exportOrdersCSV
);

/* =========================
   GET ORDERS (ACTIVE / PAST / ALL)
========================= */
router.get("/orders", adminAuth, async (req, res) => {
  try {
    const type = req.query.type || "active";
    const VALID_TYPES = ["active", "past", "all"];

    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ success: false, message: "Invalid type" });
    }

    const ACTIVE_STATUSES = [
      "pending",
      "confirmed",
      "preparing",
      "out_for_delivery",
      "refund_requested"
    ];

    const PAST_STATUSES = [
      "delivered",
      "cancelled",
      "refunded",
      "refund_rejected"
    ];

    let query = `
      SELECT 
        o.id,
        o.order_id,
        o.name,
        o.status,
        o.payment_status,
        o.cancelled_by,
        o.total,
        o.created_at,
        o.delivered_at,
        u.email AS customer_email
      FROM orders o
      JOIN users u ON o.user_id = u.id
    `;

    let params = [];

    if (type === "active") {
      query += " WHERE o.status IN (?)";
      params.push(ACTIVE_STATUSES);
    } else if (type === "past") {
      query += " WHERE o.status IN (?)";
      params.push(PAST_STATUSES);
    }

    query += " ORDER BY o.created_at DESC";

    const [orders] = await db.query(query, params);

    res.json({ success: true, orders });

  } catch (err) {
    console.error("Admin fetch orders error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch orders"
    });
  }
});

/* =========================
   GET ORDER DETAILS (ADMIN)
========================= */
router.get("/orders/:id", adminAuth, async (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    if (!orderId || isNaN(orderId)) {
      return res.status(400).json({ success: false, message: "Invalid order ID" });
    }

    const [[order]] = await db.query(
      `
      SELECT 
      o.id,
      o.order_id,
      o.name,
      o.phone,
      o.status,
      o.payment_status,
      o.payment_method,
      o.subtotal,
      o.gst,
      o.delivery_fee,
      o.tip,
      o.discount,
      o.total,
      o.address,
      o.notes,
      o.created_at,
      o.delivered_at,
      o.refund_reason,
      o.refund_requested_at,
      o.refund_reject_reason,
      u.email AS customer_email
      FROM orders o
      JOIN users u ON o.user_id = u.id
      WHERE o.id = ?
      `,
      [orderId]
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    const [items] = await db.query(
      "SELECT name, qty, price FROM order_items WHERE order_id=?",
      [orderId]
    );

    res.json({
      success: true,
      order: { ...order, items }
    });

  } catch (err) {
    console.error("Admin order details error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch order details"
    });
  }
});

/* =========================
   UPDATE ORDER STATUS (ADMIN)
   Enforces strict status transition workflow
========================= */
router.put("/orders/:id/status", adminAuth, async (req, res) => {
  try {
    const { status } = req.body;

    const allowedStatuses = [
      "confirmed",
      "preparing",
      "out_for_delivery",
      "delivered",
      "cancelled"
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status"
      });
    }

    const orderId = parseInt(req.params.id, 10);
    if (!orderId || isNaN(orderId)) {
      return res.status(400).json({ success: false, message: "Invalid order ID" });
    }

    const [[order]] = await db.query(
      "SELECT status, payment_status, payment_method FROM orders WHERE id=?",
      [orderId]
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    // Prevent modifying final orders
    if (["delivered", "cancelled", "refunded", "refund_rejected"].includes(order.status)) {
      return res.status(403).json({
        success: false,
        message: "Final orders cannot be modified"
      });
    }

    // Enforce valid workflow transitions
    if (!isValidTransition(order.status, status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot transition from '${order.status}' to '${status}'`
      });
    }

    // Payment check before confirm
    if (status === "confirmed") {
      const isCOD =
        order.payment_method === "cod" &&
        order.payment_status === "pending";

      const isPaidOnline = order.payment_status === "paid";

      if (!isCOD && !isPaidOnline) {
        return res.status(403).json({
          success: false,
          message: "Order payment not completed"
        });
      }
    }

    if (status === "delivered") {
      await db.query(
        "UPDATE orders SET status=?, delivered_at=NOW() WHERE id=?",
        [status, orderId]
      );
    } else {
      await db.query(
        "UPDATE orders SET status=? WHERE id=?",
        [status, orderId]
      );
    }

    emitSocket(req, "order-status-updated", {
      order_id: orderId,
      status
    });

    res.json({ success: true });

  } catch (err) {
    console.error("Update status error:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

/* =========================
   CANCEL ORDER (ADMIN)
========================= */
router.post("/orders/:id/cancel", adminAuth, async (req, res) => {

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const orderId = parseInt(req.params.id, 10);
    if (!orderId || isNaN(orderId)) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Invalid order ID" });
    }

    const [[order]] = await connection.query(
      `SELECT status, payment_method, payment_status 
       FROM orders 
       WHERE id=?`,
      [orderId]
    );

    if (!order) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    if (order.status === "cancelled") {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: "Order already cancelled"
      });
    }

    if (!["pending", "confirmed"].includes(order.status)) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Order cannot be cancelled at this stage"
      });
    }

    let paymentStatus;
    if (order.payment_method === "cod") {
      paymentStatus = "cancelled";
    } else if (order.payment_status === "paid") {
      paymentStatus = "refunded";
    } else {
      paymentStatus = "cancelled";
    }

    await connection.query(
      `UPDATE orders 
       SET status=?,
           cancelled_by=?,
           payment_status=?
       WHERE id=?`,
      ["cancelled", "admin", paymentStatus, orderId]
    );

    await connection.commit();

    emitSocket(req, "order-status-updated", {
      order_id: orderId,
      status: "cancelled",
      payment_status: paymentStatus
    });

    return res.json({
      success: true,
      status: "cancelled",
      payment_status: paymentStatus
    });

  } catch (err) {
    await connection.rollback();
    console.error("Admin cancel error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error"
    });
  } finally {
    connection.release();
  }
});

/* =========================
   APPROVE REFUND (ADMIN)
========================= */
router.post("/orders/:id/refund", adminAuth, async (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    if (!orderId || isNaN(orderId)) {
      return res.status(400).json({ success: false, message: "Invalid order ID" });
    }

    const [[order]] = await db.query(
      "SELECT status FROM orders WHERE id=?",
      [orderId]
    );

    if (!order || order.status !== "refund_requested") {
      return res.status(400).json({
        success: false,
        message: "Refund not allowed"
      });
    }

    await db.query(
      "UPDATE orders SET status='refunded', payment_status='refunded' WHERE id=?",
      [orderId]
    );

    emitSocket(req, "order-status-updated", {
      order_id: orderId,
      status: "refunded"
    });

    res.json({ success: true });

  } catch (err) {
    console.error("Admin refund error:", err);
    res.status(500).json({ success: false });
  }
});

/* =========================
   REJECT REFUND (ADMIN)
========================= */
router.post("/orders/:id/refund/reject", adminAuth, async (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    if (!orderId || isNaN(orderId)) {
      return res.status(400).json({ success: false, message: "Invalid order ID" });
    }

    const { reason } = req.body;

    if (!reason || reason.trim().length < REASON_MIN_LENGTH) {
      return res.status(400).json({
        success: false,
        message: "Reject reason required (min 3 characters)"
      });
    }

    const sanitizedReason = reason.trim().slice(0, REASON_MAX_LENGTH);

    const [[order]] = await db.query(
      "SELECT status FROM orders WHERE id=?",
      [orderId]
    );

    if (!order || order.status !== "refund_requested") {
      return res.status(400).json({
        success: false,
        message: "This order is not in refund_requested state"
      });
    }

    await db.query(
      `
      UPDATE orders
      SET status='refund_rejected',
          refund_reject_reason=?
      WHERE id=?
      `,
      [sanitizedReason, orderId]
    );

    emitSocket(req, "order-status-updated", {
      order_id: orderId,
      status: "refund_rejected"
    });

    res.json({ success: true });

  } catch (err) {
    console.error("Reject refund error:", err);
    res.status(500).json({ success: false });
  }
});

/* =========================
   ADMIN CONTACT MESSAGES
========================= */
router.get("/contact", adminAuth, async (req, res) => {
  try {
    const [messages] = await db.query(`
      SELECT 
        id,
        name,
        email,
        subject,
        message,
        is_read,
        created_at
      FROM contact_messages
      ORDER BY created_at DESC
    `);

    res.json(messages);

  } catch (err) {
    console.error("Fetch contact messages error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch contact messages"
    });
  }
});

router.put("/contact/read/:id", adminAuth, async (req, res) => {
  try {
    const msgId = parseInt(req.params.id, 10);
    if (!msgId || isNaN(msgId)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    await db.query(
      "UPDATE contact_messages SET is_read=1 WHERE id=?",
      [msgId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

router.delete("/contact/:id", adminAuth, async (req, res) => {
  try {
    const msgId = parseInt(req.params.id, 10);
    if (!msgId || isNaN(msgId)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    await db.query(
      "DELETE FROM contact_messages WHERE id=?",
      [msgId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

/* =========================
   GET ADMIN PROFILE
========================= */
router.get("/profile", adminAuth, async (req, res) => {
  try {
    const [[admin]] = await db.query(
      `SELECT first_name, last_name, email, phone, profile_image
       FROM users
       WHERE id=? AND role='admin'`,
      [req.user.id]
    );

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found"
      });
    }

    if (!admin.profile_image || admin.profile_image === "default.png") {
      admin.profile_image = null;
    }

    res.json({
      success: true,
      first_name: admin.first_name,
      last_name: admin.last_name,
      email: admin.email,
      phone: admin.phone,
      profile_image: admin.profile_image
    });

  } catch (err) {
    console.error("Admin profile fetch error:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

/* =========================
   UPDATE ADMIN PROFILE
========================= */
router.put("/profile", adminAuth, async (req, res) => {
  try {
    const { first_name, last_name, phone } = req.body;

    // Name validation
    if (!first_name || !last_name) {
      return res.status(400).json({
        success: false,
        message: "First and last name required"
      });
    }

    if (!isValidName(first_name) || !isValidName(last_name)) {
      return res.status(400).json({
        success: false,
        message: "Name must be 1–50 characters and contain only letters, spaces, hyphens, apostrophes or dots"
      });
    }

    // Phone validation (optional)
    if (phone && !isValidPhone(phone)) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone number format"
      });
    }

    await db.query(
      `UPDATE users 
       SET first_name=?, last_name=?, phone=? 
       WHERE id=? AND role='admin'`,
      [
        first_name.trim(),
        last_name.trim(),
        phone ? phone.trim() : null,
        req.user.id
      ]
    );

    res.json({
      success: true,
      message: "Profile updated successfully"
    });

  } catch (err) {
    console.error("Profile update error:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

/* =========================
   PROFILE IMAGE UPLOAD
========================= */
router.post(
  "/profile-image",
  adminAuth,
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Image upload failed"
        });
      }

      const filename = req.file.filename;

      await db.query(
        "UPDATE users SET profile_image=? WHERE id=? AND role='admin'",
        [filename, req.user.id]
      );

      res.json({
        success: true,
        image: filename
      });

    } catch (err) {
      console.error("Profile image upload error:", err);
      res.status(500).json({
        success: false,
        message: "Server error"
      });
    }
  }
);

/* =========================
   CHANGE ADMIN PASSWORD
========================= */
router.put("/change-password", adminAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Both passwords required"
      });
    }

    // Strong password policy
    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        success: false,
        message:
          "Password must be at least 8 characters and include uppercase, lowercase, a digit, and a special character"
      });
    }

    const [[user]] = await db.query(
      "SELECT password FROM users WHERE id=? AND role='admin'",
      [req.user.id]
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const match = await bcrypt.compare(currentPassword, user.password);

    if (!match) {
      return res.status(401).json({
        success: false,
        message: "Current password incorrect"
      });
    }

    // Prevent reuse of current password
    const isSame = await bcrypt.compare(newPassword, user.password);
    if (isSame) {
      return res.status(400).json({
        success: false,
        message: "New password must differ from current password"
      });
    }

    const hash = await bcrypt.hash(newPassword, 12); // cost factor 12 (stronger than 10)

    await db.query(
      "UPDATE users SET password=? WHERE id=? AND role='admin'",
      [hash, req.user.id]
    );

    res.json({
      success: true,
      message: "Password updated successfully"
    });

  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

/* =========================
   DELETE ADMIN ACCOUNT
========================= */
router.delete("/account", adminAuth, async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Password required"
      });
    }

    const [[admin]] = await db.query(
      "SELECT password, is_main_admin FROM users WHERE id=? AND role='admin'",
      [req.user.id]
    );

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found"
      });
    }

    // Protect main admin by flag, not email
    if (admin.is_main_admin) {
      return res.status(403).json({
        success: false,
        message: "Main admin account cannot be deleted"
      });
    }

    const match = await bcrypt.compare(password, admin.password);

    if (!match) {
      return res.status(401).json({
        success: false,
        message: "Incorrect password"
      });
    }

    await db.query(
      "DELETE FROM users WHERE id=? AND role='admin'",
      [req.user.id]
    );

    req.session.destroy(() => {
      res.clearCookie("coffeecape.sid");
      res.json({ success: true });
    });

  } catch (err) {
    console.error("Delete admin error:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

module.exports = router;