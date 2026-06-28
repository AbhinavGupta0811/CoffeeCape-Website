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
  let {name, phone, address, tip = 0, notes = "", couponCode = "", idempotencyKey} = req.body;

  /* =========================
     INPUT SANITIZATION
  ========================= */
  name = String(name || "").trim();
  phone = String(phone || "").trim();
  address = String(address || "").trim();
  notes = String(notes || "").trim();
  couponCode = String(couponCode || "")
    .trim()
    .toUpperCase();

  /* =========================
     BASIC VALIDATION
  ========================= */
  if (!name || !phone || !address) {
    return res.status(400).json({
      message: "All fields required"
    });
  }

  if (!/^[A-Za-z\s]{3,100}$/.test(name)) {
    return res.status(400).json({
      message: "Invalid name"
    });
  }

  if (!/^[6-9]\d{9}$/.test(phone)) {
    return res.status(400).json({
      message: "Invalid phone number"
    });
  }

  if (
    address.length < 10 ||
    address.length > 300
  ) {
    return res.status(400).json({
      message: "Invalid address"
    });
  }

  if (notes.length > 1000) {
    return res.status(400).json({
      message: "Notes too long"
    });
  }

  if (
    !idempotencyKey ||
    typeof idempotencyKey !== "string" ||
    idempotencyKey.length > 100
  ) {
    return res.status(400).json({
      message: "Invalid idempotency key"
    });
  }

  /* =========================
     TIP VALIDATION
  ========================= */
  tip = Number(tip);

  if (
    Number.isNaN(tip) ||
    tip < 0 ||
    tip > 1000
  ) {
    return res.status(400).json({
      message: "Invalid tip amount"
    });
  }

  tip = Number(tip.toFixed(2));

  const connection =
    await db.getConnection();

  try {

    await connection.beginTransaction();

    const userId =
      req.session.user.id;

    /* =========================
       IDEMPOTENCY CHECK
    ========================= */
    const [[existingOrder]] =
      await connection.query(
        `
        SELECT id
        FROM pending_orders
        WHERE user_id=?
        AND idempotency_key=?
        AND expires_at > NOW()
        LIMIT 1
        `,
        [userId, idempotencyKey]
      );

    if (existingOrder) {

      await connection.rollback();

      return res.json({
        success: true,
        pendingOrderId:
          existingOrder.id,
        duplicate: true
      });
    }

    /* =========================
       EXISTING PENDING ORDER
    ========================= */
    const [[activePending]] =
      await connection.query(
        `
        SELECT id
        FROM pending_orders
        WHERE user_id=?
        AND expires_at > NOW()
        LIMIT 1
        `,
        [userId]
      );

    if (activePending) {

      await connection.rollback();

      return res.json({
        success: true,
        pendingOrderId:
          activePending.id,
        existing: true
      });
    }

    /* =========================
       FETCH CART
    ========================= */
    const [cart] =
      await connection.query(
        `
        SELECT
          product_id,
          name,
          price,
          qty
        FROM cart
        WHERE user_id=?
        FOR UPDATE
        `,
        [userId]
      );

    if (!cart.length) {

      await connection.rollback();

      return res.status(400).json({
        message: "Cart is empty"
      });
    }

    /* =========================
       SUBTOTAL
    ========================= */
    let subtotal = 0;

    for (const item of cart) {

      subtotal +=
        Number(item.price) *
        Number(item.qty);
    }

    subtotal = Number(
      subtotal.toFixed(2)
    );

    const GST_RATE = 0.05;
    const DELIVERY_FEE =
      subtotal >= 2999 ? 0 : 40;
    const PLATFORM_FEE = 10;
    const PACKING_FEE = 10;

    let discount = 0;

    /* =========================
       COUPON VALIDATION
    ========================= */
    if (couponCode) {

      const [coupons] =
        await connection.query(
          `
          SELECT *
          FROM coupons
          WHERE code=?
          AND is_active=TRUE
          FOR UPDATE
          `,
          [couponCode]
        );

      if (!coupons.length) {

        await connection.rollback();

        return res.status(400).json({
          message: "Invalid coupon"
        });
      }

      const coupon =
        coupons[0];

      if (
        coupon.expires_at &&
        new Date() >
          new Date(
            coupon.expires_at
          )
      ) {

        await connection.rollback();

        return res.status(400).json({
          message: "Coupon expired"
        });
      }

      if (
        coupon.used_count >=
        coupon.usage_limit
      ) {

        await connection.rollback();

        return res.status(400).json({
          message:
            "Coupon limit reached"
        });
      }

      if (
        subtotal <
        coupon.min_order
      ) {

        await connection.rollback();

        return res.status(400).json({
          message:
            `Minimum order ₹${coupon.min_order} required`
        });
      }

      const [usage] =
        await connection.query(
          `
          SELECT COUNT(*) AS count
          FROM coupon_usage
          WHERE user_id=?
          AND coupon_id=?
          `,
          [
            userId,
            coupon.id
          ]
        );

      if (
        usage[0].count >=
        coupon.per_user_limit
      ) {

        await connection.rollback();

        return res.status(400).json({
          message:
            "Coupon already used"
        });
      }

      if (
        coupon.type === "flat"
      ) {
        discount =
          coupon.value;
      }

      if (
        coupon.type === "percent"
      ) {

        discount =
          subtotal *
          (
            coupon.value /
            100
          );

        if (
          coupon.max_discount > 0
        ) {
          discount =
            Math.min(
              discount,
              coupon.max_discount
            );
        }
      }

      if (
        coupon.type ===
        "delivery"
      ) {
        discount =
          DELIVERY_FEE;
      }

      discount = Number(
        discount.toFixed(2)
      );

      discount = Math.min(
        discount,
        subtotal
      );

      try {

        await connection.query(
          `
          INSERT INTO coupon_usage
          (
            user_id,
            coupon_id
          )
          VALUES (?, ?)
          `,
          [
            userId,
            coupon.id
          ]
        );

      } catch {
        await connection.rollback();
        return res.status(400).json({
          message:
            "Coupon already used"
        });
      }

      await connection.query(
        `
        UPDATE coupons
        SET used_count =
          used_count + 1
        WHERE id=?
        `,
        [coupon.id]
      );
    }

    /* =========================
       TOTALS
    ========================= */
    const gst = Number(
      (
        subtotal *
        GST_RATE
      ).toFixed(2)
    );

    const calculatedTotal =
      subtotal +
      gst +
      DELIVERY_FEE +
      PLATFORM_FEE +
      PACKING_FEE +
      tip -
      discount;

    const finalTotal =
      Number(
        Math.max(
          0,
          calculatedTotal
        ).toFixed(2)
      );

    /* =========================
       SAVE ORDER
    ========================= */
    const pricing = {
      subtotal,
      gst,
      delivery_fee:
        DELIVERY_FEE,
      platform_fee:
        PLATFORM_FEE,
      packing_fee:
        PACKING_FEE,
      tip,
      discount,
      total: finalTotal
    };

    const [result] =
      await connection.query(
        `
        INSERT INTO pending_orders
        (
          user_id,
          idempotency_key,
          cart_data,
          user_details,
          pricing,
          notes,
          expires_at
        )
        VALUES
        (?,?,?,?,?,?, DATE_ADD(NOW(), INTERVAL 15 MINUTE)
        )
        `,
        [
          userId,
          idempotencyKey,
          JSON.stringify(cart),
          JSON.stringify({
            name,
            phone,
            address
          }),
          JSON.stringify(
            pricing
          ),
          notes
        ]
      );

    await connection.commit();

    return res.json({
      success: true,
      pendingOrderId:
        result.insertId,
      total: finalTotal
    });

  } catch (err) {

    await connection.rollback();

    console.error(
      "Order Error:",
      err
    );

    return res.status(500).json({
      message:
        "Failed to initiate order"
    });

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

    /* =========================
       VALIDATE ORDER ID
    ========================= */
    const orderId = Number(req.params.id);

    if (
      !Number.isInteger(orderId) ||
      orderId <= 0
    ) {
      return res.status(400).json({
        message: "Invalid order id"
      });
    }

    /* =========================
       FETCH ORDER
       Ownership + Expiry Check
    ========================= */
    const [[pending]] =
      await db.query(
        `
        SELECT
          id,
          cart_data,
          user_details,
          pricing,
          notes,
          expires_at
        FROM pending_orders
        WHERE id=?
        AND user_id=?
        AND expires_at > NOW()
        LIMIT 1
        `,
        [
          orderId,
          req.user.id
        ]
      );

    if (!pending) {
      return res.status(404).json({
        message: "Order not found"
      });
    }

    /* =========================
       SAFE JSON PARSE
    ========================= */
    let pricing;
    let cartData;
    let userDetails;

    try {

      pricing =
        typeof pending.pricing === "string"
          ? JSON.parse(pending.pricing)
          : pending.pricing;

      cartData =
        typeof pending.cart_data === "string"
          ? JSON.parse(pending.cart_data)
          : pending.cart_data;

      userDetails =
        typeof pending.user_details === "string"
          ? JSON.parse(pending.user_details)
          : pending.user_details;

    } catch (err) {

      console.error(
        "Pending Order JSON Error:",
        err
      );

      return res.status(500).json({
        message:
          "Corrupted order data"
      });
    }

    /* =========================
       VERIFY PRICING
    ========================= */
    if (
      !pricing ||
      typeof pricing !== "object"
    ) {
      return res.status(500).json({
        message:
          "Pricing data missing"
      });
    }

    const total =
      Number(pricing.total);

    if (
      Number.isNaN(total) ||
      total < 0
    ) {
      return res.status(500).json({
        message:
          "Invalid pricing data"
      });
    }

    /* =========================
       RESPONSE
       (No internal fields)
    ========================= */
    return res.json({
      success: true,
      order: {
        id: pending.id,
        total,

        pricing: {
          subtotal:
            Number(
              pricing.subtotal || 0
            ),
          gst:
            Number(
              pricing.gst || 0
            ),
          delivery_fee:
            Number(
              pricing.delivery_fee || 0
            ),
          platform_fee:
            Number(
              pricing.platform_fee || 0
            ),
          packing_fee:
            Number(
              pricing.packing_fee || 0
            ),
          tip:
            Number(
              pricing.tip || 0
            ),
          discount:
            Number(
              pricing.discount || 0
            ),
          total
        },

        cart: Array.isArray(
          cartData
        )
          ? cartData
          : [],

        customer: {
          name:
            userDetails?.name || "",
          phone:
            userDetails?.phone || "",
          address:
            userDetails?.address || ""
        },

        notes:
          pending.notes || "",

        expiresAt:
          pending.expires_at
      }
    });

  } catch (err) {

    console.error(
      "Pending Order Fetch Error:",
      err
    );
    return res.status(500).json({
      message:
        "Failed to fetch pending order"
    });
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
      `
      SELECT product_id, name, qty, price
      FROM order_items
      WHERE order_id=?
      `,
      [order.id]
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
  const orderId = String(req.params.id).trim();

  if (!orderId) {
    return res.status(400).json({
      message: "Invalid order id"
    });
  }

  let { reason } = req.body;

  reason = String(reason || "").trim();

  /* =========================
     REFUND REASON VALIDATION
  ========================= */
  if (
    reason.length < 10 ||
    reason.length > 1000
  ) {
    return res.status(400).json({
      message:
        "Refund reason must be between 10 and 1000 characters"
    });
  }

  const connection =
    await db.getConnection();

  try {

    await connection.beginTransaction();

    /* =========================
       LOCK ORDER ROW
    ========================= */
    const [[order]] =
      await connection.query(
        `
        SELECT
          order_id,
          status,
          delivered_at,
          refund_requested_at
        FROM orders
        WHERE order_id=?
        AND user_id=?
        FOR UPDATE
        `,
        [
          orderId,
          req.session.user.id
        ]
      );

    if (!order) {

      await connection.rollback();

      return res.status(404).json({
        message: "Order not found"
      });
    }

    /* =========================
       DUPLICATE REFUND CHECK
    ========================= */
    if (
      order.status ===
      "refund_requested"
    ) {

      await connection.rollback();

      return res.status(400).json({
        message:
          "Refund already requested"
      });
    }

    if (
      order.status ===
      "refunded"
    ) {

      await connection.rollback();

      return res.status(400).json({
        message:
          "Order already refunded"
      });
    }

    /* =========================
       STATUS VALIDATION
    ========================= */
    if (
      order.status !==
      "delivered"
    ) {

      await connection.rollback();

      return res.status(400).json({
        message:
          "Refund not allowed"
      });
    }

    /* =========================
       DELIVERY TIME CHECK
    ========================= */
    if (!order.delivered_at) {

      await connection.rollback();

      return res.status(400).json({
        message:
          "Delivery information missing"
      });
    }

    const deliveredTime =
      new Date(
        order.delivered_at
      ).getTime();

    const now = Date.now();

    if (
      Number.isNaN(
        deliveredTime
      )
    ) {

      await connection.rollback();

      return res.status(500).json({
        message:
          "Invalid delivery timestamp"
      });
    }

    if (
      now - deliveredTime >
      SIX_HOURS
    ) {

      await connection.rollback();

      return res.status(403).json({
        message:
          "Refund window expired (6 hours)"
      });
    }

    /* =========================
       UPDATE ORDER
    ========================= */
    await connection.query(
      `
      UPDATE orders
      SET
        status='refund_requested',
        refund_reason=?,
        refund_requested_at=NOW()
      WHERE order_id=?
      `,
      [
        reason,
        orderId
      ]
    );

    await connection.commit();

    /* =========================
       ADMIN NOTIFICATION
       AFTER COMMIT
    ========================= */
    try {

      const io =
        req.app.get("io");

      if (io) {

        io.emit(
          "refund-requested",
          {
            order_id:
              orderId,
            user_id:
              req.session.user.id,
            requested_at:
              new Date()
          }
        );
      }

    } catch (notifyErr) {

      console.error(
        "Refund notification error:",
        notifyErr
      );
    }

    return res.json({
      success: true,
      message:
        "Refund request submitted successfully"
    });

  } catch (err) {
    await connection.rollback();
    console.error(
      "Refund Error:",
      err
    );

    return res.status(500).json({
      message:
        "Refund request failed"
    });
  } finally {
    connection.release();
  }
});

/* =====================================
   REORDER (ADD ITEMS BACK TO CART)
   POST /api/orders/reorder
===================================== */
router.post("/reorder", auth, async (req, res) => {

  const { items } = req.body;

  if (
    !Array.isArray(items) ||
    items.length === 0 ||
    items.length > 100
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid items"
    });
  }

  const connection = await db.getConnection();

  try {

    await connection.beginTransaction();

    const userId = req.session.user.id;

    for (const item of items) {

      const productId = Number(item.product_id);
      const qty = Number(item.qty);

      /* =========================
         VALIDATION
      ========================= */
      if (
        !Number.isInteger(productId) ||
        productId < 1
      ) {
        continue;
      }

      if (
        !Number.isInteger(qty) ||
        qty < 1 ||
        qty > 20
      ) {
        continue;
      }

      /* =========================
         FETCH PRODUCT
      ========================= */
      const [[product]] =
        await connection.query(
          `
          SELECT
            id,
            name,
            price,
            offer_price,
            stock_qty,
            availability,
            is_active
          FROM products
          WHERE id=?
          LIMIT 1
          `,
          [productId]
        );

      /* =========================
         PRODUCT VALIDATION
      ========================= */
      if (
        !product ||
        !product.is_active ||
        product.availability !== "in_stock"
      ) {
        continue;
      }

      const finalPrice =
        product.offer_price ||
        product.price;

      const allowedQty =
        Math.min(
          qty,
          product.stock_qty,
          20
        );

      if (allowedQty < 1) {
        continue;
      }

      /* =========================
         EXISTING CART ITEM
      ========================= */
      const [[existing]] =
        await connection.query(
          `
          SELECT
            id,
            qty
          FROM cart
          WHERE user_id=?
          AND product_id=?
          LIMIT 1
          `,
          [
            userId,
            productId
          ]
        );

      /* =========================
         UPDATE EXISTING
      ========================= */
      if (existing) {

        const newQty =
          Math.min(
            existing.qty + allowedQty,
            product.stock_qty,
            20
          );

        await connection.query(
          `
          UPDATE cart
          SET
            qty=?,
            price=?,
            name=?
          WHERE id=?
          `,
          [
            newQty,
            finalPrice,
            product.name,
            existing.id
          ]
        );

      }

      /* =========================
         INSERT NEW
      ========================= */
      else {

        await connection.query(
          `
          INSERT INTO cart
          (
            user_id,
            product_id,
            name,
            price,
            qty
          )
          VALUES
          (
            ?,
            ?,
            ?,
            ?,
            ?
          )
          `,
          [
            userId,
            product.id,
            product.name,
            finalPrice,
            allowedQty
          ]
        );
      }
    }

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: "Items added to cart"
    });

  } catch (err) {

    await connection.rollback();

    console.error(
      "Reorder Error:",
      err
    );

    return res.status(500).json({
      success: false,
      message: "Reorder failed"
    });

  } finally {

    connection.release();
  }
});

module.exports = router;