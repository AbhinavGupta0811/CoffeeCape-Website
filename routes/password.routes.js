const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { sendOtpMail } = require("../mailer");

const router = express.Router();

/* ================= SEND OTP ================= */
router.post("/forgot", async (req, res) => {
  try {
    const { email } = req.body;

    const [[user]] = await db.query(
      "SELECT id FROM users WHERE email=?",
      [email]
    );

    if (!user) {
      return res.json({ success: false, message: "Email not registered" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000);

    await db.query(
      "INSERT INTO password_otps (user_id, otp, expires_at) VALUES (?,?,?)",
      [user.id, otp, expires]
    );

    await sendOtpMail(email, otp);

    res.json({ success: true });

  } catch (err) {
    console.error("FORGOT PASSWORD ERROR:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

/* ================= VERIFY OTP (NEW) ================= */
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    const [[user]] = await db.query(
      "SELECT id FROM users WHERE email=?",
      [email]
    );

    if (!user) {
      return res.json({ success: false, message: "Invalid email" });
    }

    const [[record]] = await db.query(
      `SELECT id FROM password_otps
       WHERE user_id=? AND otp=? AND used=0 AND expires_at > NOW()
       ORDER BY id DESC
       LIMIT 1`,
      [user.id, otp]
    );

    if (!record) {
      return res.json({ success: false, message: "Invalid or expired OTP" });
    }

    await db.query(
      "UPDATE password_otps SET verified=1 WHERE id=?",
      [record.id]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("VERIFY OTP ERROR:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

/* ================= RESET PASSWORD ================= */
router.post("/reset", async (req, res) => {
  const { email, password } = req.body;

  const [[user]] = await db.query(
    "SELECT id FROM users WHERE email=?",
    [email]
  );

  if (!user) {
    return res.json({ success: false, message: "Invalid request" });
  }

  const [[record]] = await db.query(
    `SELECT id FROM password_otps
     WHERE user_id=? AND verified=1 AND used=0 AND expires_at > NOW()`,
    [user.id]
  );

  if (!record) {
    return res.json({ success: false, message: "OTP not verified" });
  }

  const hash = await bcrypt.hash(password, 10);

  await db.query(
    "UPDATE users SET password=? WHERE id=?",
    [hash, user.id]
  );

  // ✅ Mark OTP as used
  await db.query(
    "UPDATE password_otps SET used=1 WHERE id=?",
    [record.id]
  );

  res.json({ success: true });
});

module.exports = router;