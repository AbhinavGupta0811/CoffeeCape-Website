// Delivery Auth Routes
const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const router = express.Router();
const pool = require("../../db");
const { requireDeliveryAuth } = require("../../middleware/delivery.auth.middleware");
const { sendDeliveryPasswordResetMail, sendDeliveryRegistrationMail } = require("../../mailer");

// Registration rate limiter (5 attempts per 15 minutes per IP)
const deliveryRegistrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many registration attempts. Please try again later." }
});

// Validation helpers
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}
function isValidPhone(phone) {
  return phone.length >= 10 && phone.length <= 15;
}
function isValidPassword(password) {
  return password.length >= 8 && password.length <= 128;
}

// Secure delivery ID generator
function generateDeliveryId() {
  const randomPart = crypto.randomBytes(8).toString("hex").toUpperCase();
  return `CC-DLV-${randomPart}`;
}

// Delivery registration
router.post("/register", deliveryRegistrationLimiter, async (req, res) => {
  let connection = null;
  try {
    // Read request data
    const name = String(req.body.name || "").trim().replace(/\s+/g, " ");
    const email = String(req.body.email || "").trim().toLowerCase();
    const phone = normalizePhone(req.body.phone);
    const password = String(req.body.password || "");
    const confirmPassword = String(req.body.confirmPassword || "");

    // Required fields
    if (!name || !email || !phone || !password || !confirmPassword) {
      return res.status(400).json({ success: false, message: "All registration fields are required." });
    }

    // Name validation
    if (name.length < 2 || name.length > 100 || /[\x00-\x1F\x7F]/.test(name)) {
      return res.status(400).json({ success: false, message: "Please enter a valid name." });
    }

    // Email validation
    if (email.length > 255 || !isValidEmail(email)) {
      return res.status(400).json({ success: false, message: "Please enter a valid email address." });
    }

    // Phone validation
    if (!isValidPhone(phone) || phone.length > 20) {
      return res.status(400).json({ success: false, message: "Please enter a valid phone number." });
    }

    // Password validation
    if (!isValidPassword(password)) {
      return res.status(400).json({ success: false, message: "Password must be between 8 and 128 characters." });
    }

    // Password confirmation
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: "Passwords do not match." });
    }

    // Database connection + transaction
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Check duplicate email
    const [existingUsers] = await connection.query(
      `SELECT id FROM delivery_users WHERE email = ? LIMIT 1 FOR UPDATE`,
      [email]
    );
    if (existingUsers.length > 0) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: "An account with this email already exists." });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Generate unique delivery ID
    let deliveryId = null;
    const MAX_ID_ATTEMPTS = 5;
    for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt++) {
      const candidateId = generateDeliveryId();
      const [existingId] = await connection.query(
        `SELECT id FROM delivery_users WHERE employee_id = ? LIMIT 1`,
        [candidateId]
      );
      if (existingId.length === 0) {
        deliveryId = candidateId;
        break;
      }
    }
    if (!deliveryId) {
      await connection.rollback();
      console.error("Delivery ID generation failed.");
      return res.status(500).json({ success: false, message: "Unable to create your delivery account. Please try again." });
    }

    // Create delivery account
    const [result] = await connection.query(
      `
      INSERT INTO delivery_users (
        employee_id, name, email, phone, password_hash,
        status, auth_version, force_password_change, failed_login_attempt
      )
      VALUES (?, ?, ?, ?, ?, 'active', 0, 0, 0)
      `,
      [deliveryId, name, email, phone, passwordHash]
    );
    if (!result || !result.insertId) {
      await connection.rollback();
      console.error("Delivery account insert failed.");
      return res.status(500).json({ success: false, message: "Unable to create your delivery account." });
    }

    // Get created user
    const [createdRows] = await connection.query(
      `SELECT id, employee_id, name, email, phone, status, created_at FROM delivery_users WHERE id = ? LIMIT 1`,
      [result.insertId]
    );
    const createdUser = createdRows[0];
    if (!createdUser) {
      await connection.rollback();
      console.error("Created delivery account could not be retrieved.");
      return res.status(500).json({ success: false, message: "Unable to complete delivery account creation." });
    }

    // Commit transaction and release connection
    await connection.commit();
    connection.release();
    connection = null;

    // Send registration email
    const mailResult = await sendDeliveryRegistrationMail({
      to: createdUser.email,
      name: createdUser.name,
      employeeId: createdUser.employee_id
    });

    // Email failure
    if (!mailResult || !mailResult.success) {
      console.error("Delivery registration email failed:", mailResult?.error?.message || "Unknown mail error");
      return res.status(201).json({
        success: true,
        emailSent: false,
        message: "Your delivery account was created, but we could not send the confirmation email. Please contact support.",
        user: {
          id: createdUser.id,
          employeeId: createdUser.employee_id,
          name: createdUser.name,
          email: createdUser.email,
          phone: createdUser.phone
        }
      });
    }

    // Registration success
    return res.status(201).json({
      success: true,
      emailSent: true,
      message: "Your delivery account has been created successfully. Your Delivery ID has been sent to your registered email.",
      user: {
        id: createdUser.id,
        employeeId: createdUser.employee_id,
        name: createdUser.name,
        email: createdUser.email,
        phone: createdUser.phone
      }
    });

  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (rollbackError) {
        console.error("Delivery registration rollback error:", rollbackError.message);
      }
    }
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ success: false, message: "An account with these details already exists." });
    }
    console.error("Delivery registration error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to create delivery account. Please try again later." });
  } finally {
    if (connection) {
      connection.release();
      connection = null;
    }
  }
});

// Delivery login rate limiter (15 attempts per 15 minutes per IP)
const deliveryLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many login attempts. Please try again later." }
});

// Delivery login
router.post("/login", deliveryLoginLimiter, async (req, res) => {
  let connection = null;
  try {
    // Read input
    const loginIdentifier = String(req.body.employeeId || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    // Basic validation
    if (!loginIdentifier || !password) {
      return res.status(400).json({ success: false, message: "Delivery ID or email and password are required." });
    }
    if (loginIdentifier.length > 255 || password.length > 128) {
      return res.status(400).json({ success: false, message: "Invalid login credentials." });
    }

    // Database connection + transaction
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Find delivery account (by Delivery ID or email)
    const [rows] = await connection.query(
      `
      SELECT id, employee_id, name, email, phone, password_hash, status,
             auth_version, force_password_change, failed_login_attempt, locked_until
      FROM delivery_users
      WHERE LOWER(employee_id) = ? OR LOWER(email) = ?
      LIMIT 1 FOR UPDATE
      `,
      [loginIdentifier, loginIdentifier]
    );
    const deliveryUser = rows[0];

    // Invalid credentials (generic response)
    if (!deliveryUser) {
      await connection.rollback();
      return res.status(401).json({ success: false, message: "Invalid Delivery ID/email or password." });
    }

    // Account status check
    if (deliveryUser.status !== "active") {
      await connection.rollback();
      return res.status(401).json({ success: false, message: "Invalid Delivery ID/email or password." });
    }

    // Login lock check
    if (deliveryUser.locked_until && new Date(deliveryUser.locked_until) > new Date()) {
      await connection.rollback();
      return res.status(429).json({ success: false, message: "Too many failed login attempts. Please try again later." });
    }

    // Password verification
    const passwordValid = await bcrypt.compare(password, deliveryUser.password_hash);

    // Invalid password
    if (!passwordValid) {
      const currentAttempts = Number(deliveryUser.failed_login_attempt || 0);
      const nextAttempts = currentAttempts + 1;
      const MAX_ATTEMPTS = 5;

      // Account lock
      if (nextAttempts >= MAX_ATTEMPTS) {
        const lockUntil = new Date(Date.now() + 15 * 60 * 1000);
        await connection.query(
          `UPDATE delivery_users SET failed_login_attempt = 0, locked_until = ? WHERE id = ?`,
          [lockUntil, deliveryUser.id]
        );
        await connection.commit();
        return res.status(429).json({ success: false, message: "Too many failed login attempts. Please try again later." });
      }

      // Increment failed attempts
      await connection.query(
        `UPDATE delivery_users SET failed_login_attempt = ? WHERE id = ?`,
        [nextAttempts, deliveryUser.id]
      );
      await connection.commit();
      return res.status(401).json({ success: false, message: "Invalid Delivery ID/email or password." });
    }

    // Successful password verification → reset login state
    await connection.query(
      `UPDATE delivery_users SET failed_login_attempt = 0, locked_until = NULL, last_login_at = NOW() WHERE id = ?`,
      [deliveryUser.id]
    );
    await connection.commit();
    connection.release();
    connection = null;

    // Session regeneration (protect against fixation)
    req.session.regenerate((sessionError) => {
      if (sessionError) {
        console.error("Delivery session regeneration error:", sessionError.message);
        return res.status(500).json({ success: false, message: "Unable to create secure session." });
      }

      // Create delivery session
      req.session.deliveryUser = {
        id: deliveryUser.id,
        employeeId: deliveryUser.employee_id,
        name: deliveryUser.name,
        email: deliveryUser.email,
        phone: deliveryUser.phone,
        authVersion: deliveryUser.auth_version
      };

      // Save session
      req.session.save((saveError) => {
        if (saveError) {
          console.error("Delivery session save error:", saveError.message);
          return res.status(500).json({ success: false, message: "Unable to complete login." });
        }

        // Success response
        return res.status(200).json({
          success: true,
          message: "Login successful.",
          user: {
            id: deliveryUser.id,
            employeeId: deliveryUser.employee_id,
            name: deliveryUser.name,
            email: deliveryUser.email,
            phone: deliveryUser.phone
          },
          forcePasswordChange: Boolean(deliveryUser.force_password_change)
        });
      });
    });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (rollbackError) {
        console.error("Delivery login rollback error:", rollbackError.message);
      }
    }
    console.error("Delivery login error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to process login. Please try again later." });
  } finally {
    if (connection) {
      connection.release();
      connection = null;
    }
  }
});

const deliveryForgotPasswordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,

    max: 5,

    standardHeaders: true,
    legacyHeaders: false,

    message: {
        success: false,
        message:
            "Too many password reset requests. Please try again later."
    }
});

const deliveryResetPasswordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,

    max: 10,

    standardHeaders: true,
    legacyHeaders: false,

    message: {
        success: false,
        message:
            "Too many password reset attempts. Please try again later."
    }
});

// Delivery forgot-password
router.post("/forgot-password", deliveryForgotPasswordLimiter, async (req, res) => {
  // Always return the same response to prevent account/email enumeration
  const genericResponse = {
    success: true,
    message: "If the account exists, a password reset code has been sent."
  };

  try {
    // Read input
    const employeeId = String(req.body.employeeId || "").trim().toUpperCase();

    // Basic validation (generic response if invalid)
    if (!employeeId || employeeId.length > 30) {
      return res.status(200).json(genericResponse);
    }

    // Find delivery account
    const [rows] = await pool.query(
      `SELECT id, employee_id, email, status, password_reset_locked_until
       FROM delivery_users
       WHERE employee_id = ?
       LIMIT 1`,
      [employeeId]
    );
    const user = rows[0];

    // Account not found or inactive
    if (!user || user.status !== "active") {
      return res.status(200).json(genericResponse);
    }

    // Reset lock check
    if (user.password_reset_locked_until && new Date(user.password_reset_locked_until) > new Date()) {
      return res.status(200).json(genericResponse);
    }

    // Generate secure reset code (6 digits)
    const resetCode = crypto.randomInt(100000, 1000000).toString();

    // Hash reset code
    const resetCodeHash = crypto.createHash("sha256").update(resetCode).digest("hex");

    // Reset code expiration (10 minutes)
    const resetExpires = new Date(Date.now() + 10 * 60 * 1000);

    // Invalidate previous reset code
    await pool.query(
      `UPDATE delivery_users
       SET password_reset_token_hash = ?, password_reset_expires = ?, password_reset_attempts = 0, password_reset_locked_until = NULL
       WHERE id = ?`,
      [resetCodeHash, resetExpires, user.id]
    );

    // Send reset email
    const mailResult = await sendDeliveryPasswordResetMail(user.email, resetCode);

    // Email failure → remove reset token
    if (!mailResult || mailResult.success === false) {
      await pool.query(
        `UPDATE delivery_users
         SET password_reset_token_hash = NULL, password_reset_expires = NULL, password_reset_attempts = 0, password_reset_locked_until = NULL
         WHERE id = ?`,
        [user.id]
      );
      console.error("Delivery password-reset email failed:", mailResult?.error?.message || "Unknown mail error");
      return res.status(200).json(genericResponse);
    }

    // Success
    return res.status(200).json(genericResponse);

  } catch (error) {
    console.error("Delivery forgot-password error:", error.message);
    // Always return generic response to prevent account enumeration
    return res.status(200).json(genericResponse);
  }
});

// Delivery reset-password
router.post("/reset-password", deliveryResetPasswordLimiter, async (req, res) => {
  let connection = null;
  try {
    // Read input
    const employeeId = String(req.body.employeeId || "").trim().toUpperCase();
    const newPassword = String(req.body.newPassword || ""); // never trim
    const resetCode = String(req.body.resetCode || "").trim();

    // Basic validation
    if (!employeeId || !resetCode || !newPassword) {
      return res.status(400).json({ success: false, message: "Employee ID, reset code and new password are required." });
    }
    if (employeeId.length > 30) return res.status(400).json({ success: false, message: "Invalid or expired reset code." });
    if (!/^\d{6}$/.test(resetCode)) return res.status(400).json({ success: false, message: "Invalid or expired reset code." });
    if (newPassword.length < 8) return res.status(400).json({ success: false, message: "Password must be at least 8 characters long." });
    if (Buffer.byteLength(newPassword, "utf8") > 72) {
      return res.status(400).json({ success: false, message: "Password must not exceed 72 bytes." });
    }

    // Database connection + transaction
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Find account
    const [rows] = await connection.query(
      `SELECT id, password_hash, password_reset_token_hash, password_reset_expires,
              password_reset_attempts, password_reset_locked_until, status
       FROM delivery_users
       WHERE employee_id = ?
       LIMIT 1 FOR UPDATE`,
      [employeeId]
    );
    const user = rows[0];

    // Account validation
    if (!user || user.status !== "active") {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Invalid or expired reset code." });
    }

    // Reset lock check
    if (user.password_reset_locked_until && new Date(user.password_reset_locked_until) > new Date()) {
      await connection.rollback();
      return res.status(429).json({ success: false, message: "Too many invalid reset attempts. Please try again later." });
    }

    // Token existence
    if (!user.password_reset_token_hash || !user.password_reset_expires) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Invalid or expired reset code." });
    }

    // Expiration check
    if (new Date(user.password_reset_expires) <= new Date()) {
      await connection.query(
        `UPDATE delivery_users
         SET password_reset_token_hash = NULL, password_reset_expires = NULL,
             password_reset_attempts = 0, password_reset_locked_until = NULL
         WHERE id = ?`,
        [user.id]
      );
      await connection.commit();
      return res.status(400).json({ success: false, message: "Reset code has expired." });
    }

    // Hash submitted reset code
    const submittedCodeHash = crypto.createHash("sha256").update(resetCode).digest("hex");
    if (!/^[a-f0-9]{64}$/i.test(user.password_reset_token_hash)) {
      await connection.rollback();
      console.error("Invalid password reset token hash format for delivery user:", user.id);
      return res.status(400).json({ success: false, message: "Invalid or expired reset code." });
    }

    // Constant-time comparison
    const submittedBuffer = Buffer.from(submittedCodeHash, "hex");
    const storedBuffer = Buffer.from(user.password_reset_token_hash, "hex");
    const hashesMatch = submittedBuffer.length === storedBuffer.length && crypto.timingSafeEqual(submittedBuffer, storedBuffer);

    // Invalid reset code
    if (!hashesMatch) {
      const nextAttempts = Number(user.password_reset_attempts || 0) + 1;
      const MAX_RESET_ATTEMPTS = 5;
      if (nextAttempts >= MAX_RESET_ATTEMPTS) {
        const lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
        await connection.query(
          `UPDATE delivery_users SET password_reset_attempts = 0, password_reset_locked_until = ? WHERE id = ?`,
          [lockedUntil, user.id]
        );
        await connection.commit();
        return res.status(429).json({ success: false, message: "Too many invalid reset attempts. Please try again later." });
      }
      await connection.query(`UPDATE delivery_users SET password_reset_attempts = ? WHERE id = ?`, [nextAttempts, user.id]);
      await connection.commit();
      return res.status(400).json({ success: false, message: "Invalid or expired reset code." });
    }

    // Prevent password reuse
    const samePassword = await bcrypt.compare(newPassword, user.password_hash);
    if (samePassword) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "New password must be different from the old password." });
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // Update password
    await connection.query(
      `UPDATE delivery_users
       SET password_hash = ?, password_reset_token_hash = NULL, password_reset_expires = NULL,
           password_reset_attempts = 0, password_reset_locked_until = NULL, force_password_change = FALSE,
           failed_login_attempt = 0, locked_until = NULL, auth_version = auth_version + 1
       WHERE id = ?`,
      [newPasswordHash, user.id]
    );
    await connection.commit();
    connection.release();
    connection = null;

    // Destroy current session
    if (req.session) {
      req.session.destroy((sessionError) => {
        if (sessionError) console.error("Delivery reset session destruction error:", sessionError.message);
      });
    }

    // Success
    return res.status(200).json({ success: true, message: "Password reset successfully. You can now log in." });

  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (rollbackError) {
        console.error("Delivery reset rollback error:", rollbackError.message);
      }
    }
    console.error("Delivery reset-password error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to reset password. Please try again later." });
  } finally {
    if (connection) {
      connection.release();
      connection = null;
    }
  }
});

// Delivery change-password
router.post("/change-password", requireDeliveryAuth, async (req, res) => {
  let connection = null;
  try {
    // Read input (do not trim passwords)
    const currentPassword = String(req.body.currentPassword || "");
    const newPassword = String(req.body.newPassword || "");

    // Required fields
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: "Current password and new password are required." });
    }

    // Password length
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: "New password must be at least 8 characters long." });
    }
    if (Buffer.byteLength(newPassword, "utf8") > 72) {
      return res.status(400).json({ success: false, message: "New password must not exceed 72 bytes." });
    }

    // Passwords must be different
    if (currentPassword === newPassword) {
      return res.status(400).json({ success: false, message: "New password must be different from the current password." });
    }

    // Database connection + transaction
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Lock current user row
    const [rows] = await connection.query(
      `SELECT id, password_hash, status, auth_version, force_password_change
       FROM delivery_users
       WHERE id = ?
       LIMIT 1 FOR UPDATE`,
      [req.deliveryUser.id]
    );
    const user = rows[0];

    // Account validation
    if (!user || user.status !== "active") {
      await connection.rollback();
      if (req.session) req.session.destroy(() => {});
      return res.status(401).json({ success: false, message: "Your delivery account is no longer active." });
    }

    // Verify current password
    const currentPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!currentPasswordValid) {
      await connection.rollback();
      return res.status(401).json({ success: false, message: "Current password is incorrect." });
    }

    // Prevent password reuse
    const samePassword = await bcrypt.compare(newPassword, user.password_hash);
    if (samePassword) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "New password must be different from the current password." });
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // Update password (increment auth_version, clear force_password_change)
    await connection.query(
      `UPDATE delivery_users
       SET password_hash = ?, force_password_change = FALSE, auth_version = auth_version + 1
       WHERE id = ?`,
      [newPasswordHash, user.id]
    );
    await connection.commit();
    connection.release();
    connection = null;

    // Destroy current session (auth_version changed)
    if (req.session) {
      req.session.destroy((sessionError) => {
        if (sessionError) console.error("Delivery change-password session destruction error:", sessionError.message);
      });
    }

    // Success
    return res.status(200).json({ success: true, message: "Password changed successfully. Please log in again." });

  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (rollbackError) {
        console.error("Delivery change-password rollback error:", rollbackError.message);
      }
    }
    console.error("Delivery change-password error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to change password. Please try again later." });
  } finally {
    if (connection) {
      connection.release();
      connection = null;
    }
  }
});

// Delivery current user (GET /api/delivery/auth/me)
router.get("/me", requireDeliveryAuth, async (req, res) => {
    try {
        if (
            !req.deliveryUser ||
            !req.deliveryUser.id
        ) {
            return res.status(401).json({
                success: false,
                message:
                    "Authentication required."
            });
        }
        return res.status(200).json({
            success: true,
            user: {
                id:
                    req.deliveryUser.id,
                employeeId:
                    req.deliveryUser.employeeId,
                name:
                    req.deliveryUser.name,
                email:
                    req.deliveryUser.email,
                phone:
                    req.deliveryUser.phone,
                forcePasswordChange:
                    Boolean(
                        req.deliveryUser.forcePasswordChange
                    )
            }
        });
    } catch (error) {
        console.error(
            "Delivery /me error:",
            error.message
        );
        return res.status(500).json({
            success: false,
            message:
                "Unable to retrieve delivery profile."
        });
    }
    }
);

// Delivery logout (POST /api/delivery/auth/logout)
router.post("/logout", requireDeliveryAuth, async (req, res) => {
  const sessionId = req.sessionID; // useful for logging/debugging

  try {
    // Destroy server-side session
    await new Promise((resolve, reject) => {
      req.session.destroy((error) => {
        if (error) return reject(error);
        resolve();
      });
    });

    // Clear session cookie (connect.sid)
    res.clearCookie("connect.sid", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/"
    });

    // Success
    return res.status(200).json({ success: true, message: "Logged out successfully." });

  } catch (error) {
    console.error("Delivery logout error:", error.message);

    // Attempt to clear cookie even if session destruction failed
    try {
      res.clearCookie("connect.sid", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/"
      });
    } catch (cookieError) {
      console.error("Delivery logout cookie-clear error:", cookieError.message);
    }

    return res.status(500).json({ success: false, message: "Unable to complete logout. Please try again." });
  }
});

module.exports = router;