const express = require("express");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const db = require("../../db");
const { adminProfileUpload} = require("../../middleware/upload.middleware");

const router = express.Router();

/* =========================
   ADMIN LOGIN ATTEMPT LIMIT
========================= */
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

const loginAttempts = new Map();

function getLoginAttempt(email) {
  return loginAttempts.get(email) || {
    count: 0,
    lockedUntil: null
  };
}

function isLoginLocked(email) {
  const record = getLoginAttempt(email);

  if (!record.lockedUntil) return false;

  if (Date.now() >= record.lockedUntil) {
    loginAttempts.delete(email);
    return false;
  }

  return true;
}

function recordFailedAttempt(email) {
  const now = Date.now();
  const record = getLoginAttempt(email);

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
const NAME_MAX_LENGTH = 100;
const PHONE_MAX_LENGTH = 30;
const PASSWORD_MIN_LENGTH = 8;

function isValidName(name) {
  return (
    typeof name === "string" &&
    name.trim().length >= 1 &&
    name.trim().length <= NAME_MAX_LENGTH &&
    /^[a-zA-Z\s'\-\.]+$/.test(name.trim())
  );
}

function isValidPhone(phone) {
  if (!phone) return true;

  return (
    typeof phone === "string" &&
    phone.trim().length <= PHONE_MAX_LENGTH &&
    /^[\d\s\+\-\(\)]+$/.test(phone.trim())
  );
}

function isStrongPassword(password) {
  if (typeof password !== "string") return false;
  if (password.length < PASSWORD_MIN_LENGTH) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  if (!/[^A-Za-z0-9]/.test(password)) return false;

  return true;
}

/* =========================
   ADMIN AUTH MIDDLEWARE
========================= */
function adminAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required"
    });
  }

  if (req.session.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Admin access required"
    });
  }

  req.user = req.session.user;

  next();
}

/* =========================
   ADMIN LOGIN
========================= */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Basic presence check
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required"
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    if (isLoginLocked(normalizedEmail)) {
      return res.status(429).json({
        success: false,
        message: "Too many failed attempts. Please try again later."
      });
    }

    const [rows] = await db.query(
      `
      SELECT
        id,
        email,
        password,
        role,
        status,
        is_main_admin
      FROM users
      WHERE email=? AND role='admin'
      LIMIT 1
      `,
      [normalizedEmail]
    );

    // Generic message to prevent email enumeration
    if (!rows.length) {
      recordFailedAttempt(normalizedEmail);

      return res
        .status(401)
        .json({
          success: false,
          message: "Invalid credentials"
        });
    }

    const admin = rows[0];

    // --- Blocked admin check ---
    if (admin.status && admin.status !== "active") {
      return res
        .status(403)
        .json({
          success: false,
          message: "Account is not active"
        });
    }

    const match = await bcrypt.compare(password, admin.password);

    if (!match) {
      recordFailedAttempt(normalizedEmail);

      return res
        .status(401)
        .json({
          success: false,
          message: "Invalid credentials"
        });
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
      isMainAdmin: !!admin.is_main_admin
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

    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

/* =========================
   ADMIN LOGOUT
========================= */
router.post("/logout", adminAuth, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("coffeecape.sid");

    res.json({
      success: true
    });
  });
});

/* =========================
   GET ADMIN PROFILE
========================= */
router.get("/profile", adminAuth, async (req, res) => {
  try {
    const [[admin]] = await db.query(
      `
      SELECT
        first_name,
        last_name,
        email,
        phone,
        profile_image
      FROM users
      WHERE id=? AND role='admin'
      `,
      [req.user.id]
    );

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found"
      });
    }

    res.json({
      success: true,
      admin
    });

  } catch (err) {
    console.error("Get admin profile error:", err);

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
    const {
      first_name,
      last_name,
      phone
    } = req.body;

    // Name validation
    if (!first_name || !last_name) {
      return res.status(400).json({
        success: false,
        message: "First name and last name are required"
      });
    }

    if (!isValidName(first_name) || !isValidName(last_name)) {
      return res.status(400).json({
        success: false,
        message: "Invalid name"
      });
    }

    if (!isValidPhone(phone)) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone number"
      });
    }

    await db.query(
      `
      UPDATE users
      SET
        first_name=?,
        last_name=?,
        phone=?
      WHERE id=? AND role='admin'
      `,
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
    console.error("Update admin profile error:", err);

    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

/* =========================
   ADMIN PROFILE IMAGE
========================= */
const profileUploadDir = path.join(
  __dirname,
  "../uploads/profiles"
);

if (!fs.existsSync(profileUploadDir)) {
  fs.mkdirSync(profileUploadDir, {
    recursive: true
  });
}

const profileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, profileUploadDir);
  },

  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();

    cb(
      null,
      `admin-${req.user.id}-${Date.now()}${ext}`
    );
  }
});

const profileUpload = multer({
  storage: profileStorage,

  limits: {
    fileSize: 5 * 1024 * 1024
  },

  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(
        new Error("Only JPG, PNG and WEBP images are allowed")
      );
    }

    cb(null, true);
  }
});

/* =========================
   UPLOAD ADMIN PROFILE IMAGE
========================= */
router.post(
  "/profile-image",
  adminAuth,
  adminProfileUpload.single("profile_image"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Profile image is required"
        });
      }

      const profileImage = `/uploads/profiles/${req.file.filename}`;

      const [[admin]] = await db.query(
        `
        SELECT profile_image
        FROM users
        WHERE id=? AND role='admin'
        `,
        [req.user.id]
      );

      if (!admin) {
        return res.status(404).json({
          success: false,
          message: "Admin not found"
        });
      }

      await db.query(
        `
        UPDATE users
        SET
          profile_image=?,
          mime_type=?
        WHERE id=? AND role='admin'
        `,
        [
          profileImage,
          req.file.mimetype,
          req.user.id
        ]
      );

      // Remove old profile image when applicable
      if (
        admin.profile_image &&
        admin.profile_image.startsWith("/uploads/profiles/")
      ) {
        const oldPath = path.join(
          __dirname,
          "..",
          admin.profile_image
        );

        if (fs.existsSync(oldPath)) {
          try {
            fs.unlinkSync(oldPath);
          } catch (unlinkError) {
            console.error(
              "Old profile image delete error:",
              unlinkError
            );
          }
        }
      }

      res.json({
        success: true,
        profile_image: profileImage
      });

    } catch (err) {
      console.error(
        "Admin profile image upload error:",
        err
      );

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
    const {
      currentPassword,
      newPassword
    } = req.body;

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

    const match = await bcrypt.compare(
      currentPassword,
      user.password
    );

    if (!match) {
      return res.status(401).json({
        success: false,
        message: "Current password incorrect"
      });
    }

    // Prevent reuse of current password
    const isSame = await bcrypt.compare(
      newPassword,
      user.password
    );

    if (isSame) {
      return res.status(400).json({
        success: false,
        message:
          "New password must differ from current password"
      });
    }

    const hash = await bcrypt.hash(
      newPassword,
      12
    );

    await db.query(
      "UPDATE users SET password=? WHERE id=? AND role='admin'",
      [
        hash,
        req.user.id
      ]
    );

    res.json({
      success: true,
      message: "Password updated successfully"
    });

  } catch (err) {
    console.error(
      "Change password error:",
      err
    );

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
    const {
      password
    } = req.body;

    const [[admin]] = await db.query(
      `
      SELECT
        id,
        password,
        is_main_admin
      FROM users
      WHERE id=? AND role='admin'
      `,
      [req.user.id]
    );

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found"
      });
    }

    if (admin.is_main_admin) {
      return res.status(403).json({
        success: false,
        message: "Main admin account cannot be deleted"
      });
    }

    const match = await bcrypt.compare(
      password,
      admin.password
    );

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

      res.json({
        success: true
      });
    });

  } catch (err) {
    console.error(
      "Delete admin error:",
      err
    );

    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

module.exports = router;