const express = require("express");
const db = require("../db");
const { sendReviewThankYouMail } = require("../mailer");
const verifyToken = require("../middleware/auth.middleware");

const router = express.Router();
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
  const { rating, comment } = req.body;

  if (!rating || !comment) {
    return res.status(400).json({
      message: "Rating and comment are required"
    });
  }

  if (rating < 1 || rating > 5) {
    return res.status(400).json({
      message: "Rating must be between 1 and 5"
    });
  }

  try {
    const DEFAULT_AVATAR = "assets/user-default.png";

    const userId = req.user.id;

    /* ===== FETCH LOGGED-IN USER ===== */
    const [[user]] = await db.query(
      `SELECT first_name, last_name, email, profile_image, status
       FROM users
       WHERE id = ?`,
      [userId]
    );

    if (!user) {
      return res.status(401).json({
        message: "Invalid user session"
      });
    }

    if (user.status === "blocked") {
      return res.status(403).json({
        message: "Your account is blocked"
      });
    }

    /* ===== AVATAR FALLBACK ===== */
    let avatar = DEFAULT_AVATAR;

    if (user.profile_image && user.profile_image.trim() !== "") {
      avatar = `/uploads/profile/${user.profile_image}`;
    }

    /* ===== SAVE REVIEW ===== */
    const [result] = await db.query(
      `INSERT INTO reviews
       (user_id, name, rating, comment, verified, avatar)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        userId,
        `${user.first_name} ${user.last_name}`,
        rating,
        comment,
        true, // verified always true now
        avatar
      ]
    );

    /* ===== FETCH CREATED REVIEW ===== */
    const [[review]] = await db.query(
      `SELECT 
         id,
         name,
         rating,
         comment,
         likes,
         verified,
         avatar,
         created_at
       FROM reviews
       WHERE id = ?`,
      [result.insertId]
    );

    /* ===== SEND THANK YOU EMAIL ===== */
    await sendReviewThankYouMail(user.email, user.name, rating);

    res.status(201).json(review);

  } catch (err) {
    console.error("POST /reviews error:", err);
    res.status(500).json({
      message: "Review submission failed"
    });
  }
});

/* =====================================================
   LIKE REVIEW
===================================================== */
router.patch("/:id/like", async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await db.query(
      `UPDATE reviews SET likes = likes + 1 WHERE id = ?`,
      [id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Review not found" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("PATCH /reviews/:id/like error:", err);
    res.status(500).json({ message: "Failed to like review" });
  }
});

module.exports = router;