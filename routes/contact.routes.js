const express = require("express");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const db = require("../db");
const auth = require("../middleware/auth.middleware");
const { sendContactToAdmin, sendContactConfirmation} = require("../mailer");
const router = express.Router();

/* =========================
   SECURITY CONSTANTS
========================= */
const LIMITS = {
  NAME_MIN: 2,
  NAME_MAX: 50,
  EMAIL_MAX: 254,
  SUBJECT_MIN: 3,
  SUBJECT_MAX: 100,
  MESSAGE_MIN: 10,
  MESSAGE_MAX: 2000
};

/* =========================
   RATE LIMIT
========================= */
// burst limiter
const contactLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,

  keyGenerator: (req) => {
    return req.user?.id
      ? `user:${req.user.id}`
      : ipKeyGenerator(req.ip);
  },

  message: {
    success: false,
    message: "Too many requests."
  }
});

// daily limiter
const dailyLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 20,

  keyGenerator: (req) => {
    return req.user?.id
      ? `user:${req.user.id}`
      : ipKeyGenerator(req.ip);
  },

  message: {
    success: false,
    message:
      "Daily contact limit reached"
  }
});

/* =========================
   HELPERS
========================= */
function normalizeText(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/\n/g, "\n")
    .trim();
}

function normalizeEmail(email) {
  return normalizeText(email)
    .toLowerCase();
}

function sanitizeMailHeader(value) {
  return value.replace(
    /[\r\n]+/g,
    " "
  );
}

function normalizeDuplicateMessage(msg) {
  return msg
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHTML(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function validate(data) {
  const errors = [];

  const nameRegex =
    /^[A-Za-z\s'-]{2,50}$/;

  if (
    !nameRegex.test(data.name)
  ) {
    errors.push(
      "Invalid name format"
    );
  }

  if (
    data.email.length >
    LIMITS.EMAIL_MAX
  ) {
    errors.push(
      "Invalid email"
    );
  }

  const emailRegex =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (
    !emailRegex.test(data.email)
  ) {
    errors.push(
      "Invalid email address"
    );
  }

  if (
    data.subject.length <
      LIMITS.SUBJECT_MIN ||
    data.subject.length >
      LIMITS.SUBJECT_MAX
  ) {
    errors.push(
      "Subject length invalid"
    );
  }

  if (
    data.message.length <
      LIMITS.MESSAGE_MIN ||
    data.message.length >
      LIMITS.MESSAGE_MAX
  ) {
    errors.push(
      "Message length invalid"
    );
  }

  return errors;
}

/* =========================
   CONTACT SUBMIT
========================= */
router.post( "/", auth, contactLimiter, dailyLimiter, async (req, res) => {
    try {
      /*OWNERSHIP CHECK*/
      const user = req.user || {};
      console.log(req.user);

      /* AUTHENTICATION CHECK */
      if (!user || !user.id || !user.email) {
        return res.status(401).json({
          success: false,
          message: "Please login first"
        });
      }

      const email =
        normalizeEmail(
          user.email || ""
        );

      const name =
        normalizeText(
          [
            user.first_name,
            user.last_name
          ]
          .filter(Boolean)
          .join(" ")
          ||
          user.full_name
          ||
          user.name
          ||
          ""
        );
        
      const subject =
        sanitizeMailHeader(
          normalizeText(
            req.body.subject || ""
          )
        );

      const message =
        normalizeText(
          req.body.message || ""
        );

      const payload = {
        name,
        email,
        subject,
        message
      };

      /*VALIDATION*/
      const errors =
        validate(payload);

      if (errors.length) {
        return res
          .status(400)
          .json({
            success:
              false,
            errors
          });
      }

      /*DUPLICATE*/
      const normalized =
        normalizeDuplicateMessage(
          message
        );

      const [duplicate] =
        await db.query(
          `
          SELECT id
          FROM contact_messages
          WHERE email=?
          AND normalized_message=?
          AND created_at >=
          NOW()
          - INTERVAL 5 MINUTE
          `,
          [
            email,
            normalized
          ]
        );

      if (
        duplicate.length
      ) {
        console.warn(
          "[CONTACT] duplicate blocked",
          email
        );

        return res
          .status(409)
          .json({
            success:
              false,

            message:
              "Duplicate message detected"
          });
      }

      /* SAVE */
      await db.query(
        `
        INSERT INTO
        contact_messages
        (
          name,
          email,
          subject,
          message,
          normalized_message
        )
        VALUES
        (?, ?, ?, ?, ?)
        `,
        [
          escapeHTML(
            name
          ),

          email,

          escapeHTML(
            subject
          ),

          escapeHTML(
            message
          ),

          normalized
        ]
      );

      /* EMAIL */
      try {
        await sendContactToAdmin(
          payload
        );

        await sendContactConfirmation(
          {
            name,
            email,
            message
          }
        );
      } catch (
        mailErr
      ) {
        console.error(
          "[MAIL]",
          mailErr
        );
      }

      /* AUDIT */
      console.info(
        "[CONTACT]",
        {
          userId : user.id,
          email,
          subject,
          time:
            new Date()
        }
      );

      return res
        .status(200)
        .json({
          success:
            true,

          message:
            "Message sent successfully"
        });
    } catch (err) {
      console.error(
        "[CONTACT ERROR]",
        err
      );

      return res
        .status(500)
        .json({
          success:
            false,

          message:
            "Failed to send message"
        });

    }
  }
);

module.exports = router;