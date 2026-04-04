const express = require("express");
const db = require("../db");
const auth = require("../middleware/auth.middleware");
const router = express.Router();

/* =============== GET CART =================== */
router.get("/", auth, async (req, res) => {
  try {
    const [cart] = await db.query(
      "SELECT * FROM cart WHERE user_id=?",
      [req.session.user.id]
    );

    res.status(200).json({ cart });

  } catch (err) {
    console.error("Cart fetch error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ================ADD TO CART ================ */
router.post("/add", auth, async (req, res) => {
  try {
    const { name, price, qty } = req.body;

    if (!name || !price || !qty) {
      return res.status(400).json({
        success: false,
        message: "Invalid cart data"
      });
    }

    if (qty < 1) {
      return res.status(400).json({
        success: false,
        message: "Quantity must be at least 1"
      });
    }

    // Prevent duplicate item
    const [existing] = await db.query(
      "SELECT id FROM cart WHERE user_id=? AND name=?",
      [req.session.user.id, name]
    );

    if (existing.length) {
      return res.status(409).json({
        success: false,
        message: "Item already in cart"
      });
    }

    await db.query(
      "INSERT INTO cart (user_id, name, price, qty) VALUES (?,?,?,?)",
      [req.session.user.id, name, price, qty]
    );

    res.status(201).json({ success: true });

  } catch (err) {
    console.error("Cart add error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* =============UPDATE QUANTITY ================== */
router.put("/update", auth, async (req, res) => {
  try {
    const { id, qty } = req.body;

    if (!id || qty < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid update request"
      });
    }

    const [result] = await db.query(
      "UPDATE cart SET qty=? WHERE id=? AND user_id=?",
      [qty, id, req.session.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Item not found"
      });
    }

    res.status(200).json({ success: true });

  } catch (err) {
    console.error("Cart update error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ============= REMOVE ITEM ================= */
router.delete("/remove/:id", auth, async (req, res) => {
  try {
    const [result] = await db.query(
      "DELETE FROM cart WHERE id=? AND user_id=?",
      [req.params.id, req.session.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Item not found"
      });
    }

    res.status(200).json({ success: true });

  } catch (err) {
    console.error("Cart delete error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});
module.exports = router;