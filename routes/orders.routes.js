const express = require("express");
const db = require("../db");
const auth = require("../middleware/auth.middleware");

const router = express.Router();

/* =====================================
   CONSTANTS
===================================== */
const SIX_HOURS = 6 * 60 * 60 * 1000;

/* =====================================
   INITIATE ORDER (PAYMENT FIRST FLOW)
   POST /api/orders
===================================== */
router.post("/", auth, async (req, res) => {

  const { name, phone, address, tip = 0, discount = 0, notes = "" } = req.body;

  if (!name || !phone || !address) {
    return res.status(400).json({ message: "All fields required" });
  }

  const connection = await db.getConnection();

  try {

    const [cart] = await connection.query(
      "SELECT name, price, qty FROM cart WHERE user_id=?",
      [req.session.user.id]
    );

    if (!cart.length) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    /* =========================
       PRICE CALCULATION
    ========================= */
    let subtotal = 0;

    cart.forEach(item => {
      subtotal += Number(item.price) * Number(item.qty);
    });

    subtotal = Number(subtotal.toFixed(2));

    const GST_RATE = 0.05;
    const DELIVERY_FEE = subtotal >= 2999 ? 0 : 40;
    const PLATFORM_FEE = 10;
    const PACKING_FEE = 10;

    const gst = Number((subtotal * GST_RATE).toFixed(2));

    const finalTotal = Number(
      (
        subtotal +
        gst +
        DELIVERY_FEE +
        PLATFORM_FEE +
        PACKING_FEE +
        Number(tip) -
        Number(discount)
      ).toFixed(2)
    );

    /* =========================
       SAVE AS PENDING ORDER
    ========================= */
    const [result] = await connection.query(
      `
      INSERT INTO pending_orders
      (user_id, cart_data, user_details, pricing, notes, expires_at)
      VALUES (?, ?, ?, ?, ?,  DATE_ADD(NOW(), INTERVAL 15 MINUTE))
      `,
      [
        req.session.user.id,
        JSON.stringify(cart),

        JSON.stringify({
          name,
          phone,
          address
        }),

        JSON.stringify({
          subtotal,
          gst,
          DELIVERY_FEE,
          PLATFORM_FEE,
          PACKING_FEE,
          tip,
          discount,
          total: finalTotal
        }),
        notes
      ]
    );

    res.json({
      success: true,
      pendingOrderId: result.insertId,
      total: finalTotal
    });

  } catch (err) {
    console.error("Initiate Order Error:", err);
    res.status(500).json({ message: "Failed to initiate order" });
  } finally {
    connection.release();
  }
});

/* =====================================
   GET PENDING ORDER
   GET /api/orders/pending/:id
===================================== */
router.get("/pending/:id", auth, async (req, res) => {
  try {

    const [[pending]] = await db.query(
      "SELECT * FROM pending_orders WHERE id=? AND user_id=?",
      [req.params.id, req.user.id]
    );

    if (!pending) {
      return res.status(404).json({ message: "Pending order not found" });
    }

    /* =========================
       CHECK EXPIRY
    ========================= */
    if (new Date() > new Date(pending.expires_at)) {
      return res.status(400).json({ message: "Order expired" });
    }

    /* =========================
       SAFE JSON PARSE
    ========================= */
    let pricing;

    try {
      pricing =
        typeof pending.pricing === "string"
          ? JSON.parse(pending.pricing)
          : pending.pricing;
    } catch (err) {
      console.error("JSON Parse Error:", err);
      return res.status(500).json({ message: "Invalid pricing data" });
    }

    if (!pricing || !pricing.total) {
      return res.status(500).json({ message: "Pricing data missing" });
    }

    res.json({
      success: true,
      total: Number(pricing.total)
    });

  } catch (err) {
    console.error("Pending Order Fetch Error:", err);
    res.status(500).json({ message: "Failed to fetch pending order" });
  }
});

/* =====================================
   GET ALL USER ORDERS
   GET /api/orders
===================================== */
router.get("/", auth, async (req, res) => {
  try {

    const userId = req.user.id;

    const [orders] = await db.query(
      `
      SELECT 
        order_id,
        status,
        total,
        created_at,
        delivered_at,
        payment_status,
        payment_method,
        cancelled_by
      FROM orders
      WHERE user_id=?
      ORDER BY created_at DESC
      `,
      [userId]
    );

    res.json({ orders });

  } catch (err) {
    console.error("Fetch orders error:", err);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
});

/* =====================================
   GET ORDER BY PUBLIC ID
   GET /api/orders/:id
===================================== */
router.get("/:id", auth, async (req, res) => {
  try {

    const userId = req.user.id;

    /* =========================
       FETCH ORDER
    ========================= */
    const [[order]] = await db.query(
      `
      SELECT 
          id,
          order_id,
          name,
          address,
          notes,
          status,
          subtotal,
          gst,
          delivery_fee,
          platform_fee,
          packing_fee,
          tip,
          discount,
          total,
          created_at,
          delivered_at,
          cancelled_by,
          refund_reason,
          refund_reject_reason,
          payment_status,
          payment_method
      FROM orders
      WHERE order_id=? AND user_id=?
      `,
      [req.params.id, userId]
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    /* =========================
       FETCH ORDER ITEMS(IMPORTANT: order_items.order_id should store numeric orders.id)
    ========================= */
    const [items] = await db.query(
      "SELECT name, qty, price FROM order_items WHERE order_id=?",
      [order.id]  // use numeric internal ID
    );

    /* =========================
       RESPONSE
    ========================= */
    res.json({
    success: true,

    order_id: order.order_id,
    name: order.name,
    address: order.address,
    notes: order.notes,
    status: order.status,
    payment_status: order.payment_status,
    payment_method: order.payment_method,
    cancelled_by: order.cancelled_by,

    subtotal: Number(order.subtotal),
    gst: Number(order.gst),
    delivery_fee: Number(order.delivery_fee),
    platform_fee: Number(order.platform_fee),
    packing_fee: Number(order.packing_fee),
    tip: Number(order.tip),
    discount: Number(order.discount),
    total: Number(order.total),

    created_at: order.created_at,
    delivered_at: order.delivered_at,

    refund_reason: order.refund_reason,
    refund_reject_reason: order.refund_reject_reason,

    items
  });

  } catch (err) {
    console.error("Fetch order error:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

/* =====================================
   CANCEL ORDER (Public ID Based)
   POST /api/orders/:id/cancel
===================================== */
router.post("/:id/cancel", auth, async (req, res) => {
  try {
    const [[order]] = await db.query(
      `SELECT status, payment_method 
       FROM orders 
       WHERE order_id=? AND user_id=?`,
      [req.params.id, req.session.user.id]
    );

    if (!order || !["pending", "confirmed"].includes(order.status)) {
      return res.status(400).json({ message: "Cannot cancel order" });
    }

    /* Decide payment status */
    let paymentStatus = order.payment_method === "cod" ? "cancelled" : "refunded";

    await db.query(
      `UPDATE orders 
       SET status='cancelled',
          cancelled_by = 'user',
           payment_status=?
       WHERE order_id=?`,
      [paymentStatus, req.params.id]
    );

    res.json({
      success: true,
      payment_status: paymentStatus
    });

  } catch (err) {
    console.error("Cancel error:", err);
    res.status(500).json({ message: "Cancel failed" });
  }
});

/* =====================================
   REFUND REQUEST (6 HOURS RULE)
   POST /api/orders/:id/refund
===================================== */
router.post("/:id/refund", auth, async (req, res) => {
  const { reason } = req.body;

  if (!reason || reason.trim().length < 10) {
    return res.status(400).json({ message: "Invalid refund reason" });
  }

  try {
    const [[order]] = await db.query(
      `
      SELECT status, delivered_at
      FROM orders
      WHERE order_id=? AND user_id=?
      `,
      [req.params.id, req.session.user.id]
    );

    if (!order || order.status !== "delivered") {
      return res.status(400).json({ message: "Refund not allowed" });
    }

    const deliveredTime = new Date(order.delivered_at).getTime();
    const now = Date.now();

    if (now - deliveredTime > SIX_HOURS) {
      return res.status(403).json({
        message: "Refund window expired (6 hours)"
      });
    }

    await db.query(
      `
      UPDATE orders
      SET status='refund_requested',
          refund_reason=?,
          refund_requested_at=NOW()
      WHERE order_id=?
      `,
      [reason.trim(), req.params.id]
    );

    /* 🔥 Notify Admin */
    const io = req.app.get("io");

    io.emit("refund-requested", {
      order_id: req.params.id
    });

    res.json({ success: true });

  } catch (err) {
    console.error("Refund error:", err);
    res.status(500).json({ message: "Refund failed" });
  }
});

/* =====================================
   REORDER (ADD ITEMS BACK TO CART)
   POST /api/orders/reorder
===================================== */
router.post("/reorder", auth, async (req, res) => {
  const { items } = req.body;

  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ message: "Invalid items" });
  }

  try {
    for (const item of items) {
      await db.query(
        `
        INSERT INTO cart (user_id, name, price, qty)
        VALUES (?,?,?,?)
        `,
        [req.session.user.id, item.name, item.price, item.qty]
      );
    }

    res.json({ success: true });

  } catch (err) {
    console.error("Reorder error:", err);
    res.status(500).json({ message: "Reorder failed" });
  }
});

module.exports = router;