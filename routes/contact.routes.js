const express = require("express");
const db = require("../db");
const {sendContactToAdmin, sendContactConfirmation} = require("../mailer");
const auth = require("../middleware/auth.middleware");
const router = express.Router();
const rateLimit = require("express-rate-limit");

const contactLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5,
  message: {
    success: false,
    message: "Too many contact requests. Try again later."
  },
  statusCode: 429
});

/* =========================
   CONTACT FORM SUBMIT
========================= */
router.post("/",auth,contactLimiter, async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    /* -------------------------
       VALIDATION
    ------------------------- */
    if (!name || !email || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: "All fields are required"
      });
    }

    if (message.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: "Message must be at least 10 characters long"
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email address"
      });
    }

    /* -------------------------
       SAVE TO DATABASE
    ------------------------- */
    // Prevent duplicate same message within 5 minutes
    const [duplicate] = await db.query(
      `SELECT id FROM contact_messages 
      WHERE email=? AND message=? 
      AND created_at >= NOW() - INTERVAL 5 MINUTE`,
      [email.trim(), message.trim()]
    );

    if (duplicate.length) {
      return res.status(409).json({
        success: false,
        message: "Duplicate message detected"
      });
    }

    await db.query(
      `
      INSERT INTO contact_messages (name, email, subject, message)
      VALUES (?, ?, ?, ?)
      `,
      [name.trim(), email.trim(), subject.trim(), message.trim()]
    );

    /* -------------------------
       SEND EMAILS
    ------------------------- */
    try {
      await sendContactToAdmin({ name, email, subject, message });
      await sendContactConfirmation({ name, email, message });
    } catch (mailErr) {
      console.error("Mail sending failed:", mailErr);
    }

    /* -------------------------
       RESPONSE
    ------------------------- */
    res.json({
      success: true,
      message: "Message sent successfully"
    });

  } catch (err) {
    console.error("Contact form error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to send message"
    });
  }
});

module.exports = router;
