const express = require("express");
const db = require("../../db");
const adminAuth = require("../../middleware/admin.middleware");

const router = express.Router();

/* =========================
   USERS STATS
========================= */
router.get("/stats", adminAuth, async (req, res) => {
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
router.get("/", adminAuth, async (req, res) => {
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
router.put("/:id/status", adminAuth, async (req, res) => {
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
      return res.status(400).json({
        success: false,
        message: "Invalid user ID"
      });
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
router.get("/:id", adminAuth, async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);

    if (!userId || isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID"
      });
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


module.exports = router;