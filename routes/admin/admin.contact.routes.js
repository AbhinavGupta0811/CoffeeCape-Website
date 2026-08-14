const express = require("express");
const db = require("../../db");
const adminAuth = require("../../middleware/admin.middleware");

const router = express.Router();


/* =========================
   ADMIN CONTACT MESSAGES
========================= */
router.get("/", adminAuth, async (req, res) => {
  try {
    const [messages] = await db.query(`
      SELECT 
        id,
        name,
        email,
        subject,
        message,
        is_read,
        created_at
      FROM contact_messages
      ORDER BY created_at DESC
    `);

    res.json(messages);

  } catch (err) {
    console.error("Fetch contact messages error:", err);

    res.status(500).json({
      success: false,
      message: "Failed to fetch contact messages"
    });
  }
});


/* =========================
   MARK CONTACT MESSAGE AS READ
========================= */
router.put("/read/:id", adminAuth, async (req, res) => {
  try {
    const msgId = parseInt(req.params.id, 10);

    if (!msgId || isNaN(msgId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID"
      });
    }

    await db.query(
      "UPDATE contact_messages SET is_read=1 WHERE id=?",
      [msgId]
    );

    res.json({
      success: true
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false
    });
  }
});


/* =========================
   DELETE CONTACT MESSAGE
========================= */
router.delete("/:id", adminAuth, async (req, res) => {
  try {
    const msgId = parseInt(req.params.id, 10);

    if (!msgId || isNaN(msgId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID"
      });
    }

    await db.query(
      "DELETE FROM contact_messages WHERE id=?",
      [msgId]
    );

    res.json({
      success: true
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false
    });
  }
});


module.exports = router;