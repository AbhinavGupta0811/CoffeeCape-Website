const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { sendOtpVerifiedMail } = require("../mailer");
const router = express.Router();
const { OAuth2Client } = require("google-auth-library");

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/* =====================
   REGISTER 
===================== */
router.post("/register", async (req, res) => {
  try {
    const { first_name, last_name, email, phone, password } = req.body;

    if (!first_name || !last_name || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields are required"
      });
    }

    const [existing] = await db.query(
      "SELECT id, email_verified FROM users WHERE email = ?",
      [email]
    );

    /* 🔥 EXISTING USER HANDLING */
    if (existing.length) {
      const user = existing[0];

      // ❌ If already verified → block
      if (user.email_verified) {
        return res.status(409).json({
          success: false,
          message: "Email already exists"
        });
      }

      // 🔥 If NOT verified → resend OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();

      await db.query(
        `UPDATE users 
         SET email_otp = ?, 
             otp_expires_at = DATE_ADD(NOW(), INTERVAL 10 MINUTE)
         WHERE id = ?`,
        [otp, user.id]
      );

      await sendOtpVerifiedMail(email, otp);

      return res.status(200).json({
        success: true,
        message: "Account exists but not verified. OTP resent.",
        requireVerification: true
      });
    }

    /* ✅ NEW USER CREATE */
    const hash = await bcrypt.hash(password, 10);

    let role = "user";
    if (
      process.env.ADMIN_EMAIL_LOGIN &&
      email.toLowerCase() === process.env.ADMIN_EMAIL_LOGIN.toLowerCase()
    ) {
      role = "admin";
    }

    const [result] = await db.query(
      `INSERT INTO users 
       (first_name, last_name, email, phone, password, role, email_verified) 
       VALUES (?, ?, ?, ?, ?, ?, false)`,
      [first_name, last_name, email, phone, hash, role]
    );

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await db.query(
      `UPDATE users 
       SET email_otp = ?, 
           otp_expires_at = DATE_ADD(NOW(), INTERVAL 10 MINUTE)
       WHERE id = ?`,
      [otp, result.insertId]
    );

    await sendOtpVerifiedMail(email, otp);

    res.status(201).json({
      success: true,
      message: "Registration successful. Please verify your email.",
      requireVerification: true
    });

  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

/* =====================
   RESEND OTP 
===================== */
router.post("/resend-otp", async (req, res) => {
  try {
    const { email } = req.body;

    const [rows] = await db.query(
      "SELECT id, email_verified FROM users WHERE email = ?",
      [email]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const user = rows[0];

    if (user.email_verified) {
      return res.status(400).json({
        success: false,
        message: "Email already verified"
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await db.query(
      `UPDATE users 
       SET email_otp = ?, 
           otp_expires_at = DATE_ADD(NOW(), INTERVAL 10 MINUTE)
       WHERE id = ?`,
      [otp, user.id]
    );

    await sendOtpVerifiedMail(email, otp);

    res.json({
      success: true,
      message: "OTP resent successfully"
    });

  } catch (err) {
    console.error("Resend OTP error:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

/* =====================
   VERIFY EMAIL
===================== */
router.post("/verify-email", async (req, res) => {
  try {
    const { email, otp } = req.body;

    const [[user]] = await db.query(
      `SELECT email_otp, otp_expires_at
       FROM users
       WHERE email = ?`,
      [email]
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    if (!user.email_otp || user.email_otp !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP"
      });
    }

    if (new Date(user.otp_expires_at) < new Date()) {
      return res.status(400).json({
        success: false,
        message: "OTP expired"
      });
    }

    await db.query(
      `UPDATE users
       SET email_verified = true,
           email_otp = NULL,
           otp_expires_at = NULL
       WHERE email = ?`,
      [email]
    );

    res.json({
      success: true,
      message: "Email verified successfully"
    });

  } catch (err) {
    console.error("Verify email error:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

/* =====================
   LOGIN
===================== */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const [rows] = await db.query(
      `SELECT id, first_name, email, password, role, 
              profile_image, status, email_verified
       FROM users 
       WHERE email = ?`,
      [email]
    );

    if (!rows.length) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    const user = rows[0];

    if (user.status === "blocked") {
      return res.status(403).json({
        success: false,
        message: "Your account is blocked by admin"
      });
    }

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    /* 🔥 KEY FIX */
    if (!user.email_verified) {
      return res.status(403).json({
        success: false,
        message: "Please verify your email before login",
        requireVerification: true
      });
    }

    req.session.user = {
      id: user.id,
      first_name: user.first_name,
      email: user.email,
      role: user.role || "user",
      profile_image: user.profile_image || null
    };

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      }
    });

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

/* =====================
   GOOGLE LOGIN
===================== */
router.post("/google", async (req, res) => {
  try {
    const { credential } = req.body;

    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();

    const email = payload.email;

    const [rows] = await db.query(
      "SELECT * FROM users WHERE email = ?",
      [email]
    );

    let user;

    if (!rows.length) {
      const randomPassword = await bcrypt.hash(Math.random().toString(36), 10);

      const [result] = await db.query(
        `INSERT INTO users
        (first_name,last_name,email,password,email_verified,auth_provider,role,profile_image)
        VALUES (?,?,?,?,?,?,?,?)`,
        [
          payload.given_name,
          payload.family_name,
          email,
          randomPassword,
          true,
          "google",
          "user",
          payload.picture
        ]
      );

      const [newUser] = await db.query(
        "SELECT * FROM users WHERE id = ?",
        [result.insertId]
      );

      user = newUser[0];

    } else {
      user = rows[0];
    }

    req.session.user = {
      id: user.id,
      first_name: user.first_name,
      email: user.email,
      role: user.role || "user",
      profile_image: user.profile_image || null
    };

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      }
    });

  } catch (err) {
    console.error("Google error:", err);
    res.status(500).json({
      success: false,
      message: "Google authentication failed"
    });
  }
});

/* =====================
   LOGOUT
===================== */
router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("coffeecape.sid");
    res.json({ success: true });
  });
});

/* =====================
   SESSION USER
===================== */
router.get("/me", (req, res) => {
  res.json({
    success: !!req.session.user,
    user: req.session.user || null
  });
});

module.exports = router;