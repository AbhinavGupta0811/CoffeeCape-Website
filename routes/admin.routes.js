const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const adminAuth = require("../middleware/admin.middleware");
const createUploader = require("../middleware/upload.middleware");
const upload = createUploader("profile");
const path = require("path");

const router = express.Router();

/* SAFE SOCKET EMITTER */
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
   ADMIN LOGIN
========================= */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Email and password required" });
    }

    const [rows] = await db.query(
      "SELECT * FROM users WHERE email=? AND role='admin'",
      [email]
    );

    if (!rows.length) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }

    const admin = rows[0];
    const match = await bcrypt.compare(password, admin.password);

    if (!match) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }

    req.session.user = {
      id: admin.id,
      email: admin.email,
      role: admin.role
    };

    res.json({ success: true, user: req.session.user });

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
      FROM users where role = 'user'
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
router.put("/users/:id/status", adminAuth, async (req,res)=>{
  try{
    const { status } = req.body;
    if(!["active","blocked"].includes(status)){
      return res.status(400).json({
        success:false,
        message:"Invalid status"
      });
    }

    // get user email first
    const [[user]] = await db.query(
      "SELECT email FROM users WHERE id=?",
      [req.params.id]
    );

    if(!user){
      return res.status(404).json({
        success:false,
        message:"User not found"
      });
    }

    // protect main admin
    if(user.email.toLowerCase() === "admin@coffeecape.com"){
      return res.status(403).json({
        success:false,
        message:"Main admin cannot be blocked"
      });
    }

    await db.query(
      "UPDATE users SET status=? WHERE id=?",
      [status, req.params.id]
    );

    res.json({ success:true });

  }catch(err){
    console.error("User status update error:",err);
    res.status(500).json({
      success:false,
      message:"Server error"
    });
  }
});

/* =========================
   GET USER FULL DETAILS (ADMIN)
========================= */
router.get("/users/:id", adminAuth, async (req,res)=>{
  try{

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
    `,[req.params.id]);

    if(!user){
      return res.status(404).json({
        success:false,
        message:"User not found"
      });
    }

    res.json({ success:true, user });

  }catch(err){
    console.error("User detail error:",err);
    res.status(500).json({
      success:false,
      message:"Failed to fetch user details"
    });
  }
});

/* =========================
   ORDERS STATS
========================= */
router.get("/orders/stats", adminAuth, async (req, res) => {
  try {

    /* ===== TODAY SUMMARY ===== */
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

    /* ===== REVENUE BY DAY ===== */
    const [revenueByDay] = await db.query(`
      SELECT DATE(created_at) AS day, SUM(total) AS total
      FROM orders
      WHERE status='delivered'
      GROUP BY day
      ORDER BY day
    `);

    /* ===== ORDERS BY DAY ===== */
    const [ordersByDay] = await db.query(`
      SELECT DATE(created_at) AS day, COUNT(*) AS count
      FROM orders
      GROUP BY day
      ORDER BY day
    `);

    /* ===== STATUS COUNT ===== */
    const [statusRows] = await db.query(`
      SELECT status, COUNT(*) AS count
      FROM orders
      GROUP BY status
    `);

    const statusCount = {};
    statusRows.forEach(r => {
      statusCount[r.status] = r.count;
    });

    /* ===== TOP SELLING ITEMS ===== */
    const [topItems] = await db.query(`
      SELECT oi.name AS name, SUM(oi.qty) AS qty
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      GROUP BY oi.name
      ORDER BY qty DESC
      LIMIT 6
    `);

    /* ===== SEND FULL ANALYTICS ===== */
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
   GET ORDERS (ACTIVE / PAST / ALL)
========================= */
router.get("/orders", adminAuth, async (req, res) => {
  try {
    const type = req.query.type || "active";

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
    // type === "all" → no WHERE

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
    const orderId = req.params.id;

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

    const [[order]] = await db.query(
      "SELECT status, payment_status, payment_method FROM orders WHERE id=?",
      [req.params.id]
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    if (["delivered", "cancelled", "refunded"].includes(order.status)) {
      return res.status(403).json({
        success: false,
        message: "Final orders cannot be modified"
      });
    }

    /* =========================
       PAYMENT CHECK BEFORE CONFIRM
    ========================= */

    if (status === "confirmed") {

      const isCOD =
        order.payment_method === "cod" &&
        order.payment_status === "pending";

      const isPaidOnline =
        order.payment_status === "paid";

      if (!isCOD && !isPaidOnline) {
        return res.status(403).json({
          success: false,
          message: "Order payment not completed"
        });
      }

    }

    /* =========================
       UPDATE ORDER STATUS
    ========================= */

    if (status === "delivered") {

      await db.query(
        "UPDATE orders SET status=?, delivered_at=NOW() WHERE id=?",
        [status, req.params.id]
      );

    } else {

      await db.query(
        "UPDATE orders SET status=? WHERE id=?",
        [status, req.params.id]
      );

    }

    /* 🔥 SOCKET EMIT */
    emitSocket(req, "order-status-updated", {
      order_id: req.params.id,
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
   CANCEL ORDER (ADMIN - SAFE VERSION)
========================= */
router.post("/orders/:id/cancel", adminAuth, async (req, res) => {

  const connection = await db.getConnection();

  try {

    await connection.beginTransaction();

    const [[order]] = await connection.query(
      `SELECT status, payment_method, payment_status 
       FROM orders 
       WHERE id=?`,
      [req.params.id]
    );

    if (!order) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    /* Prevent double cancel */
    if (order.status === "cancelled") {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: "Order already cancelled"
      });
    }

    /* Allow only early stage cancel */
    if (!["pending", "confirmed"].includes(order.status)) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Order cannot be cancelled at this stage"
      });
    }

    /* =========================
       DECIDE PAYMENT STATUS
    ========================= */
    let paymentStatus;

    if (order.payment_method === "cod") {
      paymentStatus = "cancelled";
    } else if (order.payment_status === "paid") {
      paymentStatus = "refunded";
    } else {
      paymentStatus = "cancelled";
    }

    /* =========================
       UPDATE ORDER
    ========================= */
    await connection.query(
      `UPDATE orders 
       SET status=?,
           cancelled_by=?,
           payment_status=?
       WHERE id=?`,
      ["cancelled", "admin", paymentStatus, req.params.id]
    );

    await connection.commit();

    /* =========================
       SOCKET EVENT
    ========================= */
    emitSocket(req, "order-status-updated", {
      order_id: req.params.id,
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
    const [[order]] = await db.query(
      "SELECT status FROM orders WHERE id=?",
      [req.params.id]
    );

    if (!order || order.status !== "refund_requested") {
      return res.status(400).json({
        success: false,
        message: "Refund not allowed"
      });
    }

    await db.query(
      "UPDATE orders SET status='refunded', payment_status='refunded' WHERE id=?",
      [req.params.id]
    );

    /* 🔥 SOCKET EMIT */
    emitSocket(req, "order-status-updated", {
      order_id: req.params.id,
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
    const { reason } = req.body;

    if (!reason || reason.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: "Reject reason required"
      });
    }

    await db.query(
      `
      UPDATE orders
      SET status='refund_rejected',
          refund_reject_reason=?
      WHERE id=?
      `,
      [reason.trim(), req.params.id]
    );

    /* 🔥 SOCKET EMIT */
    emitSocket(req, "order-status-updated", {
      order_id: req.params.id,
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
    await db.query(
      "UPDATE contact_messages SET is_read=1 WHERE id=?",
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

router.delete("/contact/:id", adminAuth, async (req, res) => {
  try {
    await db.query(
      "DELETE FROM contact_messages WHERE id=?",
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

/******************************
 GET ADMIN PROFILE
******************************/
router.get("/profile", adminAuth, async (req, res) => {
  try {

    const [[admin]] = await db.query(
      `SELECT first_name, last_name, email, phone, profile_image
       FROM users
       WHERE id=?`,
      [req.user.id]
    );

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found"
      });
    }

    /* Fix default profile image */
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

/******************************
 UPDATE ADMIN PROFILE
******************************/
router.put("/profile", adminAuth, async (req, res) => {
  try {

    const { first_name, last_name, phone } = req.body;

    if (!first_name || !last_name) {
      return res.status(400).json({
        success: false,
        message: "First and last name required"
      });
    }

    await db.query(
      `UPDATE users 
       SET first_name=?, last_name=?, phone=? 
       WHERE id=?`,
      [first_name.trim(), last_name.trim(), phone || null, req.user.id]
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
        "UPDATE users SET profile_image=? WHERE id=?",
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

/******************************
 CHANGE ADMIN PASSWORD
******************************/
router.put("/change-password", adminAuth, async (req, res) => {
  try {

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Both passwords required"
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters"
      });
    }

    const [[user]] = await db.query(
      "SELECT password FROM users WHERE id=?",
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

    const hash = await bcrypt.hash(newPassword, 10);

    await db.query(
      "UPDATE users SET password=? WHERE id=?",
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
      "SELECT password FROM users WHERE id=?",
      [req.user.id]
    );

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found"
      });
    }

    const match = await bcrypt.compare(password, admin.password);

    if (!match) {
      return res.status(401).json({
        success: false,
        message: "Incorrect password"
      });
    }

    // Prevent deleting main admin
    const [[user]] = await db.query(
      "SELECT email FROM users WHERE id=?",
      [req.user.id]
    );

    if (user.email.toLowerCase() === "admin@coffeecape.com") {
      return res.status(403).json({
        success: false,
        message: "Main admin cannot be deleted"
      });
    }

    await db.query(
      "DELETE FROM users WHERE id=?",
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