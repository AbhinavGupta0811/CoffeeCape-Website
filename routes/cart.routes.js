const express = require("express");
const db = require("../db");
const auth = require("../middleware/auth.middleware");
const router = express.Router();

/*============== GET CART ==============*/
router.get("/", auth, async (req, res) => {
  try {

    const [cart] = await db.query(
      `
      SELECT
        c.id,
        c.product_id,
        c.qty,
        p.name,
        p.description,
        p.price,
        p.offer_price,
        p.image,
        p.category,
        p.subcategory,
        p.badge,
        p.rating,
        p.prep_time,
        p.stock_qty,
        p.availability
      FROM cart c
      INNER JOIN products p ON c.product_id=p.id
      WHERE c.user_id=?
      AND p.is_active=TRUE
      LIMIT 100
      `,
      [req.session.user.id]
    );

    res.status(200).json({ cart });

  } catch (err) {
    console.error("Cart fetch error:", err);
    res.status(500).json({ success:false, message:"Server error" });
  }
});

/* ================ ADD TO CART ================ */
router.post("/add", auth, async (req, res) => {
  try {
    const { product_id, qty } = req.body;

    /*=========================
      VALIDATION
    =========================*/
    const productId = String(product_id).trim();
    const quantity = Number(qty);

    if (!productId || !quantity || quantity < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid cart data"
      });
    }

    /*=========================
      GET PRODUCT
    =========================*/
    const [products] = await db.query(
      `
      SELECT
        id,
        product_id,
        name,
        price,
        offer_price,
        stock_qty,
        availability,
        is_active
      FROM products
      WHERE product_id=?
      LIMIT 1
      `,
      [productId]
    );

    if (!products.length) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    const product = products[0];
    const dbProductId = product.id;

    /*=========================
      PRODUCT STATUS
    =========================*/
    if (!product.is_active || product.availability !== "in_stock") {
      return res.status(400).json({
        success: false,
        message: "Product unavailable"
      });
    }

    if (product.stock_qty < quantity) {
      return res.status(400).json({
        success: false,
        message: "Insufficient stock"
      });
    }

    const finalPrice = product.offer_price || product.price;

    /*=========================
      EXISTING CART ITEM
    =========================*/
    const [existing] = await db.query(
      `
      SELECT
        id,
        qty
      FROM cart
      WHERE user_id=? AND product_id=?
      LIMIT 1
      `,
      [
        req.session.user.id,
        dbProductId
      ]
    );

    /*=========================
      UPDATE EXISTING
    =========================*/
    if (existing.length) {
      const newQty = existing[0].qty + quantity;

      if (newQty > product.stock_qty) {
        return res.status(400).json({
          success: false,
          message: "Stock limit exceeded"
        });
      }

      await db.query(
        `
        UPDATE cart
        SET qty=?, price=?, name=?
        WHERE id=?
        `,
        [
          newQty,
          finalPrice,
          product.name,
          existing[0].id
        ]
      );

      return res.status(200).json({
        success: true,
        message: "Cart updated",
        cartQty: newQty
      });
    }

    /*=========================
      INSERT NEW
    =========================*/
    await db.query(
      `
      INSERT INTO cart(
        user_id,
        product_id,
        name,
        price,
        qty
      )
      VALUES(
        ?,
        ?,
        ?,
        ?,
        ?
      )
      `,
      [
        req.session.user.id,
        dbProductId,
        product.name,
        finalPrice,
        quantity
      ]
    );

    /*=========================
      SUCCESS
    =========================*/
    return res.status(201).json({
      success: true,
      message: "Added to cart",
      product: {
        id: product.id,
        name: product.name,
        price: finalPrice
      },
      qty: quantity
    });

  } catch (err) {
    console.error("Cart add error:", err);

    return res.status(500).json({
      success: false,
      message: "Server error"
    });
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