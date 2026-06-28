const express = require("express");
const db = require("../db");
const { sendReviewThankYouMail } = require("../mailer");
const verifyToken = require("../middleware/auth.middleware");

const router = express.Router();

/* ================= SAFE LENGTH CHECK ================= */
function isSafeLength(value, min, max) {
  if (typeof value !== "string")
    return false;

  value = value.trim();

  if (value.length < min)
    return false;

  if (value.length > max)
    return false;

  return true;
}

/* ================= RATING VALIDATION ================= */
function validateRating(rating) {
  if ( typeof rating !== "number" && typeof rating !== "string") {
    return false;
  }

  const num = Number(rating);
  return (
    Number.isInteger(num) &&
    num >= 1 &&
    num <= 5
  );
}

/* ================= COMMENT VALIDATION ================= */
function validateComment(comment) {
  if (!isSafeLength(comment, 10, 1000))
    return false;

  comment = comment.trim();
  return comment.length > 0;
}

/* ================= REVIEW ID VALIDATION ================= */
function validateReviewId(id) {
  if (typeof id !== "string" && typeof id !== "number") {
    return false;
  }

  const num = Number(id);
  return (
    Number.isInteger(num) &&
    num > 0
  );
}

/* =====================================================
   GET ALL REVIEWS
===================================================== */
router.get("/", async (req, res) => {
  try {
    const [reviews] = await db.query(`
      SELECT 
        id,
        name,
        rating,
        comment,
        likes,
        verified,
        avatar,
        created_at
      FROM reviews
      ORDER BY created_at DESC
    `);

    res.json(reviews);
  } catch (err) {
    console.error("GET /reviews error:", err);
    res.status(500).json({ message: "Failed to fetch reviews" });
  }
});

/* =====================================================
   CREATE REVIEW
===================================================== */
router.post("/", verifyToken, async (req, res) => {
  let conn;

  try {
    /* ---------- NORMALIZE ---------- */
    const safeRating = Number(req.body.rating);

    const safeComment = req.body.comment?.trim();

    /* ---------- VALIDATION ---------- */
    if (!validateRating(safeRating)) {
      return res.status(400).json({
        message:
          "Rating must be an integer between 1 and 5."
      });
    }

    if (!validateComment(safeComment)) {
      return res.status(400).json({
        message:
          "Comment must be between 10 and 1000 characters."
      });
    }

    /* ---------- BASIC XSS CHECK ---------- */
    const blockedPatterns = [
      /<script/i,
      /javascript:/i,
      /onerror=/i,
      /onload=/i,
      /onclick=/i,
      /<iframe/i,
      /<object/i,
      /<embed/i
    ];

    const hasUnsafeContent =
      blockedPatterns.some(
        pattern =>
          pattern.test(
            safeComment
          )
      );

    if (hasUnsafeContent) {
      return res.status(400).json({
        message:
          "Comment contains unsupported content."
      });
    }

    /* ---------- DB CONNECTION ---------- */
    conn = await db.getConnection();

    const userId = req.user.id;

    /* ---------- USER LOOKUP ---------- */
    const [[user]] =
      await conn.query(
        `
        SELECT
          first_name,
          last_name,
          email,
          profile_image,
          status
        FROM users
        WHERE id = ?
        LIMIT 1
        `,
        [userId]
      );

    if (!user) {
      return res.status(401).json({
        message:
          "Invalid user session"
      });
    }

    if (
      user.status ===
      "blocked"
    ) {
      return res.status(403).json({
        message:
          "Your account is blocked"
      });
    }

    /* ---------- DISPLAY NAME ---------- */
    const userName =
      [
        user.first_name,
        user.last_name
      ]
        .filter(Boolean)
        .join(" ")
        .trim();

    /* ---------- AVATAR ---------- */
    let avatar = "assets/user-default.png";

    if (user.profile_image) {

      if (
        user.profile_image.startsWith("http://") ||
        user.profile_image.startsWith("https://")
      ) {

        avatar = user.profile_image;

      } else if (
        user.profile_image.startsWith("/uploads/")
      ) {

        avatar = user.profile_image;

      } else {

        avatar = `/uploads/profile/${user.profile_image}`;
      }
    }

    /* ---------- TRANSACTION ---------- */
    await conn.beginTransaction();

    /* ---------- DUPLICATE REVIEW ---------- */
    const [[existingReview]] =
      await conn.query(
        `
        SELECT id
        FROM reviews
        WHERE user_id = ?
        LIMIT 1
        FOR UPDATE
        `,
        [userId]
      );

    if (existingReview) {
      await conn.rollback();

      return res.status(409).json({
        message:
          "You already submitted a review."
      });
    }

    /* ---------- INSERT REVIEW ---------- */
    const [result] =
      await conn.query(
        `
        INSERT INTO reviews (
          user_id,
          name,
          rating,
          comment,
          verified,
          avatar
        )
        VALUES (
          ?, ?, ?, ?, ?, ?
        )
        `,
        [
          userId,
          userName,
          safeRating,
          safeComment,
          true,
          avatar
        ]
      );

    /* ---------- FETCH CREATED ---------- */
    const [[review]] =
      await conn.query(
        `
        SELECT
          id,
          name,
          rating,
          comment,
          likes,
          verified,
          avatar,
          created_at
        FROM reviews
        WHERE id = ?
        LIMIT 1
        `,
        [
          result.insertId
        ]
      );

    await conn.commit();

    /* ---------- EMAIL ---------- */
    try {
      await sendReviewThankYouMail(
        user.email,
        userName,
        safeRating
      );

    } catch (mailError) {

      console.error(
        "REVIEW THANK YOU MAIL ERROR:",
        {
          userId,
          email:
            user.email,
          error:
            mailError.message
        }
      );

    }

    return res
      .status(201)
      .json(review);

  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {}
    }

    console.error(
      "POST /reviews ERROR:",
      err
    );

    return res.status(500).json({
      message:
        "Review submission failed"
    });

  } finally {
    if (conn) {
      conn.release();
    }
  }
});

/* =====================================================
   LIKE REVIEW
===================================================== */
router.patch("/:id/like", async (req, res) => {
  let conn;

  try {
    /* ---------- VALIDATE ---------- */
    const reviewId = req.params.id;

    if (
      !validateReviewId(
        reviewId
      )
    ) {
      return res.status(400).json({
        message:
          "Invalid review ID."
      });
    }

    /* ---------- CONNECTION ---------- */
    conn = await db.getConnection();

    await conn.beginTransaction();

    /* ---------- LOCK REVIEW ---------- */
    const [[review]] =
      await conn.query(
        `
        SELECT
          id,
          likes
        FROM reviews
        WHERE id = ?
        LIMIT 1
        FOR UPDATE
        `,
        [
          reviewId
        ]
      );

    if (!review) {
      await conn.rollback();
      return res.status(404).json({
        message:
          "Review not found"
      });
    }

    /* ---------- INCREMENT ---------- */
    await conn.query(
      `
      UPDATE reviews
      SET likes = likes + 1
      WHERE id = ?
      `,
      [
        reviewId
      ]
    );

    /* ---------- FETCH UPDATED ---------- */
    const [[updated]] =
      await conn.query(
        `
        SELECT
          likes
        FROM reviews
        WHERE id = ?
        LIMIT 1
        `,
        [
          reviewId
        ]
      );

    await conn.commit();

    return res.json({
      success: true,
      likes:
        updated.likes
    });

  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {}
    }

    console.error(
      "PATCH /reviews/:id/like ERROR:",
      err
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to like review"
    });
  } finally {
    if (conn) {
      conn.release();
    }
  }
});

module.exports = router;