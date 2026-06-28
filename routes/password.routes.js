const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const db = require("../db");
const { sendOtpMail } = require("../mailer");

const router = express.Router();

/* ================= INPUT VALIDATION ================= */
function isSafeLength(value, min, max) {
  if (typeof value !== "string") return false;

  value = value.trim();

  return value.length >= min && value.length <= max;
}

function validateEmail(email) {
  if (!isSafeLength(email, 5, 254)) return false;

  email = email.trim().toLowerCase();

  const regex =
    /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

  return regex.test(email);
}

function validateOtp(otp) {
  if (!isSafeLength(otp, 6, 6)) return false;

  otp = otp.trim();

  return /^\d{6}$/.test(otp);
}

function validatePassword(password) {
  if (!isSafeLength(password, 8, 64))
    return false;

  const weakPasswords = [
    "Password@123",
    "Admin@123",
    "Qwerty@123",
    "Welcome@123"
  ];

  password = password.trim();
  if (weakPasswords.includes(password))
    return false;
  
  // No whitespace allowed
  if (/\s/.test(password))
    return false;

  // At least one uppercase
  if (!/[A-Z]/.test(password))
    return false;

  // At least one lowercase
  if (!/[a-z]/.test(password))
    return false;

  // At least one number
  if (!/\d/.test(password))
    return false;

  // At least one special character
  if (!/[!@#$%^&*(),.?":{}|<>_\-+=\\[\]\/~`]/.test(password))
    return false;

  return true;
}

/* ================= SEND OTP ================= */
router.post("/forgot", async (req, res) => {
  let conn;

  try {
    /* Normalize input */
    const email = req.body.email
      ?.trim()
      ?.toLowerCase();

    /* Validate input before DB work */
    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address."
      });
    }

    /* Get dedicated DB connection */
    conn = await db.getConnection();

    /* Lookup user */
    const [[user]] = await conn.query(
      `
      SELECT id
      FROM users
      WHERE email = ?
      LIMIT 1
      `,
      [email]
    );

    /* Prevent email enumeration */
    if (!user) {
      await new Promise(resolve =>
        setTimeout(resolve, 500)
      );

      return res.json({
        success: true,
        message:
          "If the email exists, an OTP has been sent."
      });
    }

    /* Start transaction */
    await conn.beginTransaction();

    /* Invalidate previous active OTPs */
    await conn.query(
      `
      UPDATE password_otps
      SET
        used = 1,
        verified = 0
      WHERE
        user_id = ?
        AND used = 0
        AND expires_at > NOW()
      `,
      [user.id]
    );

    /* Generate secure OTP */
    const otp = crypto
      .randomInt(100000, 1000000)
      .toString();

    /* OTP expiry → 10 minutes */
    const expiresAt = new Date(
      Date.now() + 10 * 60 * 1000
    );

    /* Store OTP */
    await conn.query(
      `
      INSERT INTO password_otps (
        user_id,
        otp,
        expires_at
      )
      VALUES (?, ?, ?)
      `,
      [
        user.id,
        otp,
        expiresAt
      ]
    );

    /* Commit DB changes */
    await conn.commit();

    /* Send email outside transaction */
    try {
      await sendOtpMail(
        email,
        otp
      );
    } catch (mailError) {
      console.error(
        "MAIL ERROR:",
        mailError
      );
    }

    return res.json({
      success: true,
      message:
        "If the email exists, an OTP has been sent."
    });

  } catch (err) {

    if (conn) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        console.error(
          "ROLLBACK ERROR:",
          rollbackError
        );
      }
    }

    console.error(
      "FORGOT PASSWORD ERROR:",
      err
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });

  } finally {

    if (conn) {
      conn.release();
    }

  }
});

/* ================= VERIFY OTP ================= */
router.post("/verify-otp", async (req, res) => {
  let conn;

  try {
    /* Normalize input */
    const email = req.body.email
      ?.trim()
      ?.toLowerCase();

    const otp = req.body.otp
      ?.trim();

    /* Validate input */
    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid request."
      });
    }

    if (!validateOtp(otp)) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP format."
      });
    }

    /* Get dedicated connection */
    conn = await db.getConnection();

    /* Find user */
    const [[user]] = await conn.query(
      `
      SELECT id
      FROM users
      WHERE email = ?
      LIMIT 1
      `,
      [email]
    );

    /* Prevent account enumeration */
    if (!user) {
      await new Promise(resolve =>
        setTimeout(resolve, 500)
      );

      return res.json({
        success: false,
        message: "Invalid or expired OTP"
      });
    }

    /* Start transaction */
    await conn.beginTransaction();

    /* Find latest active OTP */
    const [[record]] = await conn.query(
      `
      SELECT id
      FROM password_otps
      WHERE
        user_id = ?
        AND otp = ?
        AND verified = 0
        AND used = 0
        AND expires_at > NOW()
      ORDER BY id DESC
      LIMIT 1
      FOR UPDATE
      `,
      [
        user.id,
        otp
      ]
    );

    if (!record) {
      await conn.rollback();

      return res.json({
        success: false,
        message: "Invalid or expired OTP"
      });
    }

    /* Mark OTP verified */
    await conn.query(
      `
      UPDATE password_otps
      SET verified = 1
      WHERE id = ?
      `,
      [record.id]
    );

    await conn.commit();

    return res.json({
      success: true,
      message: "OTP verified successfully."
    });

  } catch (err) {

    if (conn) {
      try {
        await conn.rollback();
      } catch (_) {}
    }

    console.error(
      "VERIFY OTP ERROR:",
      err
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });

  } finally {

    if (conn) {
      conn.release();
    }

  }
});

/* ================= RESET PASSWORD ================= */
router.post("/reset", async (req, res) => {
  let conn;

  try {
    /* Normalize input */
    const email = req.body.email
      ?.trim()
      ?.toLowerCase();

    const password = req.body.password;

    /* Validate */
    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid request."
      });
    }

    if (!validatePassword(password)) {
      return res.status(400).json({
        success: false,
        message:
          "Password must be 8–64 characters and include uppercase, lowercase, number, and special character."
      });
    }

    /* Pre-compute hash (outside transaction) */
    const hash = await bcrypt.hash(
      password,
      10
    );

    conn = await db.getConnection();

    /* Find user */
    const [[user]] = await conn.query(
      `
      SELECT id
      FROM users
      WHERE email = ?
      LIMIT 1
      `,
      [email]
    );

    if (!user) {
      return res.json({
        success: false,
        message: "Invalid request."
      });
    }

    await conn.beginTransaction();

    /* Lock latest verified OTP */
    const [[record]] = await conn.query(
      `
      SELECT id
      FROM password_otps
      WHERE
        user_id = ?
        AND verified = 1
        AND used = 0
        AND expires_at > NOW()
      ORDER BY id DESC
      LIMIT 1
      FOR UPDATE
      `,
      [user.id]
    );

    if (!record) {
      await conn.rollback();

      return res.json({
        success: false,
        message: "OTP not verified"
      });
    }

    /* Update password */
    await conn.query(
      `
      UPDATE users
      SET password = ?
      WHERE id = ?
      `,
      [
        hash,
        user.id
      ]
    );

    /* Consume OTP */
    await conn.query(
      `
      UPDATE password_otps
      SET
        used = 1,
        verified = 0
      WHERE
        id = ?
        AND verified = 1
        AND used = 0
      `,
      [record.id]
    );

    await conn.commit();

    return res.json({
      success: true,
      message:
        "Password reset successful."
    });

  } catch (err) {

    if (conn) {
      try {
        await conn.rollback();
      } catch (_) {}
    }

    console.error(
      "RESET PASSWORD ERROR:",
      err
    );

    return res.status(500).json({
      success: false,
      message:
        "Internal server error"
    });

  } finally {

    if (conn) {
      conn.release();
    }

  }
});

module.exports = router;