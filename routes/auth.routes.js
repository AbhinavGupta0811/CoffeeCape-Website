const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { sendOtpVerifiedMail } = require("../mailer");
const router = express.Router();
const { OAuth2Client } = require("google-auth-library");

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/* ================= INPUT VALIDATION ================= */
function securityDelay(ms = 500) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeEmail(email) {
  if (typeof email !== "string") {
    return "";
  }

  return email
    .trim()
    .toLowerCase();
}

function isSafeLength(value, min, max) {
  if (typeof value !== "string")
    return false;

  value = value.trim();

  return (
    value.length >= min &&
    value.length <= max
  );
}

function validateName(name) {
  if (!isSafeLength(name, 2, 50))
    return false;

  name = name.trim();

  return /^[A-Za-z]+(?:[ '-][A-Za-z]+)*$/
    .test(name);
}

function validateEmail(email) {
  email = normalizeEmail(email);
  if (!isSafeLength(email, 5, 254))
    return false;

  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email);
}

function validatePhone(phone) {
  if (!isSafeLength(phone, 10, 15))
    return false;

  phone = phone.trim();

  return /^\d{10,15}$/.test(phone);
}

function validateOtp(otp) {
  if (!isSafeLength(otp, 6, 6))
    return false;

  otp = otp.trim();

  return /^\d{6}$/.test(otp);
}

/* ================= PASSWORD VALIDATION ================= */ 
function validatePassword(password) {
  if (!isSafeLength(password, 8, 64))
    return false;

  password = password.trim();

  const weakPasswords = [
    "Password@123",
    "Admin@123",
    "Qwerty@123",
    "Welcome@123"
  ];

  if (weakPasswords.includes(password))
    return false;

  /* No whitespace */
  if (/\s/.test(password))
    return false;

  /* Uppercase */
  if (!/[A-Z]/.test(password))
    return false;

  /* Lowercase */
  if (!/[a-z]/.test(password))
    return false;

  /* Number */
  if (!/\d/.test(password))
    return false;

  /* Special character */
  if (
    !/[!@#$%^&*(),.?":{}|<>_\-+=\\[\]\/~`]/.test(password)
  )
    return false;

  return true;
}
/* =====================================================
   REGISTER
===================================================== */
router.post("/register", async (req, res) => {
  let conn;

  try {
    /* ---------- NORMALIZE ---------- */
    const firstName = req.body.first_name?.trim();

    const lastName = req.body.last_name?.trim();

    const email =
      normalizeEmail(
        req.body.email
      );

    const phone = req.body.phone?.trim();

    const password = req.body.password;

    /* ---------- VALIDATE ---------- */
    if (
      !validateName(firstName) ||
      !validateName(lastName) ||
      !validateEmail(email) ||
      !validatePhone(phone) ||
      !validatePassword(password)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Please enter valid registration details."
      });
    }

    /* ---------- HASH ---------- */
    const hash =
      await bcrypt.hash(
        password,
        10
      );

    const otp = generateOtp();

    conn =
      await db.getConnection();

    await conn.beginTransaction();

    /* ---------- EXISTING ---------- */
    const [[existing]] =
      await conn.query(
        `
        SELECT
          id,
          email_verified
        FROM users
        WHERE email = ?
        LIMIT 1
        FOR UPDATE
        `,
        [email]
      );

    /* ---------- EXISTING USER ---------- */
    if (existing) {

      if (
        existing.email_verified
      ) {

        await conn.rollback();

        await securityDelay();

        return res.json({
          success: true,
          message:
            "If the email is eligible, verification instructions have been processed."
        });

      }

      await conn.query(
        `
        UPDATE users
        SET
          email_otp = ?,
          otp_expires_at =
            DATE_ADD(
              NOW(),
              INTERVAL 10 MINUTE
            )
        WHERE id = ?
        `,
        [
          otp,
          existing.id
        ]
      );

      await conn.commit();

      try {
        await sendOtpVerifiedMail(
          email,
          otp
        );
      } catch (mailErr) {
        console.error(
          "REGISTER OTP MAIL:",
          {
            email,
            error:
              mailErr.message
          }
        );
      }

      await securityDelay();

      return res.json({
        success: true,
        message:
          "If the email is eligible, verification instructions have been processed.",
        requireVerification:
          true
      });

    }

    /* ---------- ROLE ---------- */
    let role = "user";

    if (
      process.env
        .ADMIN_EMAIL_LOGIN &&
      email ===
      process.env
        .ADMIN_EMAIL_LOGIN
        .trim()
        .toLowerCase()
    ) {
      role =
        "admin";
    }

    /* ---------- CREATE ---------- */
    const [result] =
      await conn.query(
        `
        INSERT INTO users (
          first_name,
          last_name,
          email,
          phone,
          password,
          role,
          email_verified,
          email_otp,
          otp_expires_at
        )
        VALUES (
          ?, ?, ?, ?, ?, ?,
          false,
          ?,
          DATE_ADD(
            NOW(),
            INTERVAL 10 MINUTE
          )
        )
        `,
        [
          firstName,
          lastName,
          email,
          phone,
          hash,
          role,
          otp
        ]
      );

    await conn.commit();

    try {
      await sendOtpVerifiedMail(email, otp);
    } catch (mailErr) {
      console.error(
        "REGISTER MAIL ERROR:",
        {
          userId:
            result.insertId,
          email,
          error:
            mailErr.message
        }
      );
    }

    await securityDelay();

    return res
      .status(201)
      .json({
        success: true,
        message:
          "Registration successful. Continue verification.",
        requireVerification:
          true
      });

  } catch (err) {

    if (conn) {

      try {
        await conn.rollback();
      } catch {}

    }

    console.error(
      "REGISTER ERROR:",
      err
    );

    return res
      .status(500)
      .json({
        success: false,
        message:
          "Server error"
      });

  } finally {

    if (conn) {
      conn.release();
    }

  }
});

/* =====================================================
   RESEND OTP
===================================================== */
router.post("/resend-otp", async (req, res) => {
  let conn;

  try {
    /* ---------- NORMALIZE ---------- */
    const email =
      normalizeEmail(
        req.body.email
      );

    /* ---------- VALIDATE ---------- */
    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid request."
      });
    }

    const otp = generateOtp();

    /* ---------- CONNECTION ---------- */
    conn =
      await db.getConnection();

    await conn.beginTransaction();

    /* ---------- USER LOOKUP ---------- */
    const [[user]] =
      await conn.query(
        `
        SELECT
          id,
          email_verified
        FROM users
        WHERE email = ?
        LIMIT 1
        FOR UPDATE
        `,
        [email]
      );

    /*
      Enumeration protection: Always return generic success
    */

    if (!user || user.email_verified) {
      await conn.rollback();

      await securityDelay();

      return res.json({
        success: true,
        message:
          "If the email is eligible, verification instructions have been processed."
      });
    }

    /* ---------- UPDATE OTP ---------- */
    await conn.query(
      `
      UPDATE users
      SET
        email_otp = ?,
        otp_expires_at =
          DATE_ADD(
            NOW(),
            INTERVAL 10 MINUTE
          )
      WHERE id = ?
      `,
      [
        otp,
        user.id
      ]
    );

    await conn.commit();

    /* ---------- EMAIL ---------- */
    try {
      await sendOtpVerifiedMail(email, otp);
    } catch (mailErr) {
      console.error(
        "RESEND OTP MAIL ERROR:",
        {
          email,
          error:
            mailErr.message
        }
      );
    }

    await securityDelay();

    return res.json({
      success: true,
      message:
        "If the email is eligible, verification instructions have been processed."
    });

  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {}
    }

    console.error(
      "RESEND OTP ERROR:",
      err
    );

    return res.status(500).json({
      success: false,
      message:
        "Server error"
    });
  } finally {
    if (conn) {
      conn.release();
    }
  }
});

/* =====================================================
   VERIFY EMAIL
===================================================== */
router.post("/verify-email", async (req, res) => {
  let conn;

  try {
    /* ---------- NORMALIZE ---------- */
    const email =
      normalizeEmail(
        req.body.email
      );

    const otp =
      req.body.otp
        ?.trim();

    /* ---------- VALIDATE ---------- */
    if (!validateEmail(email) || !validateOtp(otp)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid request."
      });
    }

    /* ---------- CONNECTION ---------- */

    conn =
      await db.getConnection();

    await conn.beginTransaction();

    /* ---------- USER LOCK ---------- */
    const [[user]] =
      await conn.query(
        `
        SELECT
          id,
          email_verified,
          email_otp,
          otp_expires_at
        FROM users
        WHERE email = ?
        LIMIT 1
        FOR UPDATE
        `,
        [email]
      );

    /*Enumeration protection + already verified*/

    if (!user || user.email_verified) {
      await conn.rollback();
      await securityDelay();
      return res.json({
        success: false,
        message:
          "Invalid or expired OTP."
      });
    }

    const otpExpired =
      !user.otp_expires_at ||
      new Date(
        user.otp_expires_at
      ) < new Date();

    const invalidOtp =
      !user.email_otp ||
      user.email_otp !==
      otp;

    if (invalidOtp || otpExpired) {
      await conn.rollback();
      await securityDelay();
      return res.json({
        success: false,
        message:
          "Invalid or expired OTP."
      });
    }

    /* ---------- VERIFY ---------- */
    await conn.query(
      `
      UPDATE users
      SET
        email_verified = true,
        email_otp = NULL,
        otp_expires_at = NULL
      WHERE
        id = ?
        AND email_verified = false
      `,
      [
        user.id
      ]
    );

    await conn.commit();

    await securityDelay();

    return res.json({
      success: true,
      message:
        "Email verified successfully."
    });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {}
    }

    console.error(
      "VERIFY EMAIL ERROR:",
      err
    );

    return res.status(500).json({
      success: false,
      message:
        "Server error"
    });
  } finally {

    if (conn) {
      conn.release();
    }
  }
});

/* =====================================================
   LOGIN
===================================================== */
router.post("/login", async (req, res) => {
  try {
    /* ---------- NORMALIZE ---------- */
    const email =
      normalizeEmail(
        req.body.email
      );

    const password =
      req.body.password;

    /* ---------- VALIDATE ---------- */
    if (
      !validateEmail(email) ||
      typeof password !==
        "string" ||
      !isSafeLength(
        password,
        1,
        128
      )
    ) {
      await securityDelay();

      return res.status(400).json({
        success: false,
        message:
          "Invalid request."
      });
    }

    /* ---------- USER LOOKUP ---------- */
    const [rows] =
      await db.query(
        `
        SELECT
          id,
          first_name,
          email,
          password,
          role,
          profile_image,
          status,
          email_verified
        FROM users
        WHERE email = ?
        LIMIT 1
        `,
        [email]
      );

    /* ---------- INVALID ---------- */
    if (!rows.length) {
      await securityDelay();

      return res.status(401).json({
        success: false,
        message:
          "Invalid credentials"
      });
    }

    const user = rows[0];

    /* ---------- BLOCK ---------- */
    if (user.status ==="blocked") {
      await securityDelay();

      return res.status(403).json({
        success: false,
        message:
          "Your account is blocked by admin"
      });
    }

    /* ---------- PASSWORD ---------- */
    const match =
      await bcrypt.compare(
        password,
        user.password
      );

    if (!match) {
      await securityDelay();

      return res.status(401).json({
        success: false,
        message:
          "Invalid credentials"
      });
    }

    /* ---------- VERIFY ---------- */
    if (!user.email_verified) {
      await securityDelay();

      return res.status(403).json({
        success: false,
        message:
          "Please verify your email before login",
        requireVerification:
          true
      });
    }

    /* ---------- SESSION ---------- */
    await new Promise(
      (
        resolve,
        reject
      ) => {

        req.session.regenerate(
          err => {

            if (err) {
              return reject(
                err
              );
            }

            req.session.user =
              {
                id:
                  user.id,

                first_name:
                  user.first_name,

                email:
                  user.email,

                role:
                  user.role ||
                  "user",

                profile_image:
                  user.profile_image ||
                  null
              };

            req.session.save(
              err => {
                if (
                  err
                ) {
                  return reject(
                    err
                  );
                }
                resolve();
              }
            );

          }
        );

      }
    );

    return res.json({
      success: true,

      user: {
        id:
          user.id,

        email:
          user.email,

        role:
          user.role
      }
    });
  } catch (err) {
    console.error(
      "LOGIN ERROR:",
      err
    );

    return res.status(500).json({
      success: false,
      message:
        "Server error"
    });
  }
});

/* =====================================================
   GOOGLE LOGIN
===================================================== */
router.post("/google", async (req, res) => {
  let conn;

  try {
    /* ---------- TOKEN ---------- */
    const credential =
      req.body.credential;

    if (
      typeof credential !==
      "string"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid request."
      });
    }

    /* ---------- VERIFY ---------- */
    const ticket =
      await client.verifyIdToken({
        idToken:
          credential,

        audience:
          process.env
            .GOOGLE_CLIENT_ID
      });

    const payload =
      ticket.getPayload();

    if (
      !payload?.email
    ) {
      return res.status(401).json({
        success: false,
        message:
          "Authentication failed"
      });
    }

    /* ---------- NORMALIZE ---------- */
    const email =
      normalizeEmail(
        payload.email
      );

    conn =
      await db.getConnection();

    await conn.beginTransaction();

    /* ---------- LOOKUP ---------- */
    const [[existing]] =
      await conn.query(
        `
        SELECT
          id,
          first_name,
          email,
          role,
          profile_image,
          status
        FROM users
        WHERE email = ?
        LIMIT 1
        FOR UPDATE
        `,
        [email]
      );

    let user;

    /* ---------- EXISTING ---------- */
    if (existing) {
      if ( existing.status === "blocked") {

        await conn.rollback();

        return res.status(403).json({
          success: false,
          message:
            "Your account is blocked by admin"
        });

      }

      user = existing;
    } else {

      /* ---------- CREATE ---------- */
      const randomPassword =
        await bcrypt.hash(
          crypto
            .randomBytes(32)
            .toString("hex"),
          10
        );

      const firstName =
        payload.given_name
          ?.trim()
          || "Google";

      const lastName =
        payload.family_name
          ?.trim()
          || "User";

      const profileImage =
        payload.picture ||
        null;

      const [result] =
        await conn.query(
          `
          INSERT INTO users (
            first_name,
            last_name,
            email,
            password,
            role,
            email_verified,
            auth_provider,
            profile_image
          )
          VALUES (
            ?, ?, ?, ?,
            'user',
            true,
            'google',
            ?
          )
          `,
          [
            firstName,
            lastName,
            email,
            randomPassword,
            profileImage
          ]
        );

      const [[created]] =
        await conn.query(
          `
          SELECT
            id,
            first_name,
            email,
            role,
            profile_image
          FROM users
          WHERE id = ?
          LIMIT 1
          `,
          [
            result.insertId
          ]
        );
      user = created;
    }

    await conn.commit();

    /* ---------- SESSION ---------- */
    await new Promise(
      (
        resolve,
        reject
      ) => {

        req.session.regenerate(
          err => {

            if (
              err
            ) {
              return reject(
                err
              );
            }

            req.session.user =
              {
                id:
                  user.id,

                first_name:
                  user.first_name,

                email:
                  user.email,

                role:
                  user.role ||
                  "user",

                profile_image:
                  user.profile_image ||
                  null
              };

            req.session.save(
              err => {
                if (
                  err
                ) {
                  return reject(
                    err
                  );
                }
                resolve();
              }
            );
          }
        );
      }
    );

    return res.json({
      success: true,

      user: {
        id:
          user.id,

        email:
          user.email,

        role:
          user.role
      }
    });

  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {}
    }

    console.error(
      "GOOGLE LOGIN ERROR:",
      err
    );

    return res.status(500).json({
      success: false,
      message:
        "Google authentication failed"
    });
  } finally {
    if (conn) {
      conn.release();
    }
  }
});

/* =====================================================
   LOGOUT
===================================================== */
router.post("/logout", async (req, res) => {
  try {
    /* ---------- NO SESSION ---------- */
    if (!req.session) {
      return res.json({
        success: true,
        message:
          "Logged out successfully"
      });
    }

    /* ---------- DESTROY ---------- */
    await new Promise(
      (
        resolve,
        reject
      ) => {

        req.session.destroy(
          err => {

            if (
              err
            ) {
              return reject(
                err
              );
            }

            resolve();
          }
        );
      }
    );

    /* ---------- CLEAR COOKIE ---------- */
    res.clearCookie(
      "connect.sid",
      {
        httpOnly:
          true,

        secure:
          process.env
            .NODE_ENV ===
          "production",

        sameSite:
          "lax"
      }
    );

    /* ---------- RESPONSE ---------- */
    return res.json({
      success: true,
      message:
        "Logged out successfully"
    });
  } catch (err) {
    console.error(
      "LOGOUT ERROR:",
      err
    );

    return res.status(500).json({
      success: false,
      message:
        "Logout failed"
    });
  }
});

/* =====================================================
   SESSION USER
===================================================== */
router.get("/me", async (req, res) => {
  try {
    /* ---------- SESSION ---------- */
    if (
      !req.session ||
      !req.session.user ||
      !req.session.user.id
    ) {
      return res.status(401).json({
        success: false,
        message:
          "Authentication required"
      });
    }

    const userId = req.session.user.id;

    /* ---------- USER LOOKUP ---------- */
    const [rows] =
      await db.query(
        `
        SELECT
          id,
          first_name,
          last_name,
          email,
          phone,
          street,
          city,
          zip,
          country,
          role,
          profile_image,
          status,
          email_verified
        FROM users
        WHERE id = ?
        LIMIT 1
        `,
        [
          userId
        ]
      );

    /* ---------- INVALID SESSION ---------- */
    if (!rows.length) {

      await new Promise(
        (
          resolve
        ) => {

          req.session.destroy(
            () =>
              resolve()
          );

        }
      );

      res.clearCookie("connect.sid", {
          httpOnly:
            true,

          secure:
            process.env
              .NODE_ENV ===
            "production",

          sameSite:
            "lax"
        }
      );

      return res.status(401).json({
        success: false,
        message:
          "Session expired"
      });
    }

    const user = rows[0];

    /* ---------- BLOCK CHECK ---------- */
    if ( user.status === "blocked") {

      await new Promise(
        (
          resolve
        ) => {

          req.session.destroy(
            () =>
              resolve()
          );

        }
      );

      res.clearCookie(
        "connect.sid",
        {
          httpOnly:
            true,

          secure:
            process.env
              .NODE_ENV ===
            "production",

          sameSite:
            "lax"
        }
      );

      return res.status(403).json({
        success: false,
        message:
          "Account access restricted"
      });
    }

    /* ---------- VERIFY ---------- */
    if (!user.email_verified) {
      return res.status(403).json({
        success: false,
        message:
          "Email verification required",
        requireVerification:
          true
      });
    }

    /* ---------- RESPONSE ---------- */
    let profileImage = "assets/user-default.png";

    if (user.profile_image) {
      if (
        user.profile_image.startsWith("http://") ||
        user.profile_image.startsWith("https://")
      ) {
        profileImage = user.profile_image;
      } else if (user.profile_image.startsWith("/uploads/")) {
        profileImage = user.profile_image;
      } else {
        profileImage = `/uploads/profile/${user.profile_image}`;
      }
    }

    return res.json({
      success: true,
      user: {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        phone: user.phone || "",
        street: user.street || "",
        city: user.city || "",
        zip: user.zip || "",
        country: user.country || "",
        role: user.role || "user",
        profile_image: profileImage
      }
    });

  } catch (err) {
    console.error(
      "SESSION USER ERROR:",
      err
    );

    return res.status(500).json({
      success: false,
      message:
        "Server error"
    });
  }
});

module.exports = router;