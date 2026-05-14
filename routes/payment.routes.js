const express = require("express");
const db = require("../db");
const auth = require("../middleware/auth.middleware");
const { sendPaymentBill, sendBookingPaymentBill } = require("../mailer");
const { v4: uuidv4 } = require("uuid");

const router = express.Router();

/* =====================================
   GENERATE RANDOM PUBLIC ORDER ID
===================================== */
function generateOrderId() {
  return "ORD-" + uuidv4().replace(/-/g, "").slice(0, 10).toUpperCase();
}

async function generateUniqueOrderId() {
  let orderId;
  let exists = true;

  while (exists) {
    orderId = generateOrderId();

    const [[row]] = await db.query(
      "SELECT order_id FROM orders WHERE order_id=?",
      [orderId]
    );

    if (!row) exists = false;
  }

  return orderId;
}

function safeParse(data) {
  try {
    return typeof data === "string" ? JSON.parse(data) : data;
  } catch {
    return null;
  }
}

function generateBookingId() {
  return "EVT-" + uuidv4().replace(/-/g, "").slice(0, 10).toUpperCase();
}

async function generateUniqueBookingId(connection) {
  let bookingId;
  let exists = true;

  while (exists) {
    bookingId = generateBookingId();

    const [[row]] = await connection.query(
      "SELECT booking_id FROM bookings WHERE booking_id=?",
      [bookingId]
    );

    if (!row) exists = false;
  }

  return bookingId;
}


router.post("/confirm", auth, async (req, res) => {

  const { id, orderId, type, method } = req.body;
  const paymentId = orderId || id;

  if (!paymentId || !method) {
    return res.status(400).json({ message: "Missing payment data" });
  }

  if (!["order", "booking"].includes(type)) {
    return res.status(400).json({ message: "Invalid payment type" });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    /* =========================
      ORDER PAYMENT 
    ========================= */
    if (type === "order") {
      try {

        const [[existingOrder]] = await connection.query(
          "SELECT * FROM orders WHERE order_id=? AND user_id=?",
          [paymentId, req.user.id]
        );

        if (existingOrder) {

          if (existingOrder.payment_status === "paid") {
            await connection.rollback();

            return res.status(409).json({
              message: "Order already paid"
            });
          }

          await connection.query(
            `
            UPDATE orders
            SET payment_status='paid',
                payment_method=?
            WHERE order_id=?
            `,
            [method, paymentId]
          );

          await connection.commit();

          const [[fullOrder]] = await db.query(
            `
            SELECT o.*, u.email
            FROM orders o
            JOIN users u ON o.user_id = u.id
            WHERE o.order_id=?
            `,
            [paymentId]
          );

          const [items] = await db.query(
            `
            SELECT name, qty, price
            FROM order_items
            WHERE order_id = (
              SELECT id FROM orders WHERE order_id=?
            )
            `,
            [paymentId]
          );

          try {
            await sendPaymentBill(fullOrder.email, {
              ...fullOrder,
              items
            });
          } catch (mailErr) {
            console.error("Receipt email failed:", mailErr);
          }

          return res.json({
            success: true,
            type: "order",
            id: paymentId,
            amount: Number(existingOrder.total),
            payment_status: "paid"
          });
        }

        const [[pending]] = await connection.query(
          `
          SELECT * 
          FROM pending_orders 
          WHERE id=? AND user_id=?
          `,
          [paymentId, req.user.id]
        );

        if (!pending) {
          await connection.rollback();

          return res.status(404).json({
            message: "Pending order not found"
          });
        }

        if (new Date() > new Date(pending.expires_at)) {
          await connection.rollback();

          return res.status(400).json({
            message: "Order expired"
          });
        }

        const cart = safeParse(pending.cart_data);
        const pricing = safeParse(pending.pricing);
        const userDetails = safeParse(pending.user_details);

        const notes = pending.notes || "";

        if (!cart || !pricing || !userDetails) {
          await connection.rollback();

          return res.status(500).json({
            message: "Invalid pending order data"
          });
        }

        if (
          pricing.subtotal == null ||
          pricing.gst == null ||
          pricing.total == null
        ) {
          await connection.rollback();

          return res.status(500).json({
            message: "Corrupted pricing data"
          });
        }

        const subtotal = Number(pricing.subtotal ?? 0);
        const gst = Number(pricing.gst ?? 0);

        const deliveryFee = Number(pricing.delivery_fee ?? 0);
        const platformFee = Number(pricing.platform_fee ?? 0);
        const packingFee = Number(pricing.packing_fee ?? 0);

        const tip = Number(pricing.tip ?? 0);
        const discount = Number(pricing.discount ?? 0);

        const total = Number(pricing.total ?? 0);

        console.log("Pricing Object:", pricing);

        const newOrderId = await generateUniqueOrderId();

        const paymentStatus =
          method === "cod"
            ? "pending"
            : "paid";

        const [orderResult] = await connection.query(
          `
          INSERT INTO orders
          (
            order_id,
            user_id,
            name,
            phone,
            address,
            notes,
            subtotal,
            gst,
            delivery_fee,
            platform_fee,
            packing_fee,
            tip,
            discount,
            total,
            status,
            payment_status,
            payment_method
          )
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          `,
          [
            newOrderId,
            req.user.id,

            userDetails.name,
            userDetails.phone,
            userDetails.address,

            notes,

            subtotal,
            gst,

            deliveryFee,
            platformFee,
            packingFee,

            tip,
            discount,

            total,

            "pending",
            paymentStatus,
            method
          ]
        );

        const internalId = orderResult.insertId;

        const itemsValues = cart.map(item => [
          internalId,
          item.name,
          item.price,
          item.qty
        ]);

        await connection.query(
          `
          INSERT INTO order_items
          (order_id, name, price, qty)
          VALUES ?
          `,
          [itemsValues]
        );

        await connection.query(
          "DELETE FROM cart WHERE user_id=?",
          [req.user.id]
        );

        await connection.query(
          "DELETE FROM pending_orders WHERE id=?",
          [paymentId]
        );

        await connection.commit();

        const [[fullOrder]] = await db.query(
          `
          SELECT o.*, u.email
          FROM orders o
          JOIN users u ON o.user_id = u.id
          WHERE o.order_id=?
          `,
          [newOrderId]
        );

        const [items] = await db.query(
          `
          SELECT name, qty, price
          FROM order_items
          WHERE order_id=?
          `,
          [internalId]
        );

        if (paymentStatus === "paid") {
          try {
            await sendPaymentBill(fullOrder.email, {
              ...fullOrder,
              items
            });
          } catch (mailErr) {
            console.error("Receipt email failed:", mailErr);
          }
        }

        return res.json({
          success: true,
          type: "order",
          id: newOrderId,
          amount: total,
          payment_status: paymentStatus
        });

      } catch (err) {

        await connection.rollback();

        console.error("Unified Payment Error:", err);

        return res.status(500).json({
          message: "Payment failed"
        });
      }
    }
    
   /* =========================
    BOOKING PAYMENT
  ========================= */
  if (type === "booking") {

    const io = req.app.get("io");

    let pending = null;
    let booking = null;

    /* =====================================
      FETCH BASED ON PAYMENT ID
    ===================================== */
    if (paymentId.startsWith("PBK-")) {

      const [[p]] = await connection.query(
        `
        SELECT *
        FROM pending_bookings
        WHERE id=? AND user_id=?
        `,
        [paymentId, req.user.id]
      );

      pending = p;

      if (!pending) {
        await connection.rollback();

        return res.status(404).json({
          message: "Pending booking not found"
        });
      }

      /* =====================================
        SESSION EXPIRY CHECK
      ===================================== */
      if (new Date() > new Date(pending.expires_at)) {

        await connection.query(
          `DELETE FROM pending_bookings WHERE id=?`,
          [paymentId]
        );

        await connection.rollback();

        return res.status(400).json({
          message: "Booking session expired"
        });
      }

    }

    /* =====================================
      SECOND PAYMENT FLOW
    ===================================== */
    else if (paymentId.startsWith("EVT-")) {

      const [[b]] = await connection.query(
        `
        SELECT *
        FROM bookings
        WHERE booking_id=? AND user_id=?
        FOR UPDATE
        `,
        [paymentId, req.user.id]
      );

      booking = b;

      if (!booking) {
        await connection.rollback();

        return res.status(404).json({
          message: "Booking not found"
        });
      }
    }

    else {

      await connection.rollback();

      return res.status(400).json({
        message: "Invalid booking ID"
      });
    }

    /* =====================================
      FIRST PAYMENT (CREATE BOOKING)
    ===================================== */
    if (pending) {

      /* =====================================
        SLOT LOCK
      ===================================== */
      const [[slotCheck]] = await connection.query(
        `
        SELECT COUNT(*) AS total
        FROM bookings
        WHERE event_type=?
        AND event_date=?
        AND event_time=?
        AND status IN ('pending','confirmed')
        FOR UPDATE
        `,
        [
          pending.event_type,
          pending.event_date,
          pending.event_time
        ]
      );

      if (slotCheck.total >= 5) {

        await connection.rollback();

        return res.status(409).json({
          message: "Selected slot is full"
        });
      }

      /* =====================================
        IDEMPOTENCY CHECK
      ===================================== */
      const [[existing]] = await connection.query(
        `
        SELECT booking_id
        FROM bookings
        WHERE user_id=?
        AND event_type=?
        AND event_date=?
        AND event_time=?
        AND status IN ('pending','confirmed')
        LIMIT 1
        `,
        [
          req.user.id,
          pending.event_type,
          pending.event_date,
          pending.event_time
        ]
      );

      if (existing) {

        await connection.rollback();

        return res.status(409).json({
          message: "Booking already exists for this slot"
        });
      }

      /* =====================================
        GENERATE BOOKING
      ===================================== */
      const bookingId =
        await generateUniqueBookingId(connection);

      const total =
        Number(pending.total) || 0;

      if (!total || total <= 0) {

        await connection.rollback();

        return res.status(400).json({
          message: "Invalid booking amount"
        });
      }

      /* =====================================
        ADVANCE PAYMENT (50%)
      ===================================== */
      const advance =
        Number((total * 0.5).toFixed(2));

      /* =====================================
        BOOKING DATA
      ===================================== */
      const bookingData =
        typeof pending.booking_data === "string"
          ? pending.booking_data
          : JSON.stringify(pending.booking_data);

      /* =====================================
        INSERT BOOKING
      ===================================== */
      await connection.query(
        `
        INSERT INTO bookings
        (
          booking_id,
          user_id,
          event_type,
          event_date,
          event_time,
          full_name,
          email,
          phone,
          booking_data,
          total,
          paid_amount,
          status,
          payment_status,
          payment_method
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          bookingId,
          pending.user_id,

          pending.event_type,
          pending.event_date,
          pending.event_time,

          pending.full_name,
          pending.email,
          pending.phone,

          bookingData,

          total,
          advance,

          "pending",
          "partial",

          method
        ]
      );

      /* =====================================
        DELETE PENDING BOOKING
      ===================================== */
      await connection.query(
        `
        DELETE FROM pending_bookings
        WHERE id=?
        `,
        [paymentId]
      );

      await connection.commit();

      /* =====================================
        FETCH FINAL BOOKING
      ===================================== */
      const [[fullBooking]] = await db.query(
        `
        SELECT b.*, u.email
        FROM bookings b
        JOIN users u ON b.user_id=u.id
        WHERE b.booking_id=?
        `,
        [bookingId]
      );

      /* =====================================
        EMAIL
      ===================================== */
      try {

        if (fullBooking?.email) {

          await sendBookingPaymentBill(
            fullBooking.email,
            fullBooking
          );
        }

      } catch (mailErr) {

        console.error(
          "Booking payment email failed:",
          mailErr
        );
      }

      /* =====================================
        SOCKET EVENTS
      ===================================== */
      if (io) {

        io.to("admin_room").emit(
          "newBooking",
          {
            bookingId,
            payment_status: "partial",
            status: "pending"
          }
        );

        io.to(`user_${req.user.id}`).emit(
          "bookingConfirmed",
          {
            bookingId,
            payment_status: "partial",
            status: "pending"
          }
        );
      }

      /* =====================================
        SUCCESS RESPONSE
      ===================================== */
      return res.json({
        success: true,
        type: "booking",
        id: bookingId,
        payment_status: "partial",
        status: "pending",
        paid_amount: advance,
        remaining_amount: Number(
          (total - advance).toFixed(2)
        )
      });
    }

    /* =====================================
      SECOND / FINAL PAYMENT
    ===================================== */
    if (booking) {

      const total =
        Number(booking.total) || 0;

      const alreadyPaid =
        Number(booking.paid_amount) || 0;

      /* =====================================
        ALREADY FULLY PAID
      ===================================== */
      if (alreadyPaid >= total) {

        await connection.rollback();

        return res.status(409).json({
          message: "Booking already fully paid"
        });
      }

      /* =====================================
        REMAINING PAYMENT
      ===================================== */
      const remaining =
        Number((total - alreadyPaid).toFixed(2));

      if (remaining <= 0) {

        await connection.rollback();

        return res.status(400).json({
          message: "Invalid remaining amount"
        });
      }

      /* =====================================
        UPDATE BOOKING
      ===================================== */
      await connection.query(
        `
        UPDATE bookings
        SET
          paid_amount=?,
          payment_status='paid',
          status='confirmed',
          payment_method=?
        WHERE booking_id=?
        `,
        [
          total,
          method,
          booking.booking_id
        ]
      );

      await connection.commit();

      /* =====================================
        FETCH UPDATED BOOKING
      ===================================== */
      const [[updatedBooking]] = await db.query(
        `
        SELECT b.*, u.email
        FROM bookings b
        JOIN users u ON b.user_id=u.id
        WHERE b.booking_id=?
        `,
        [booking.booking_id]
      );

      /* =====================================
        EMAIL
      ===================================== */
      try {

        if (updatedBooking?.email) {

          await sendBookingPaymentBill(
            updatedBooking.email,
            updatedBooking
          );
        }

      } catch (mailErr) {

        console.error(
          "Final booking payment email failed:",
          mailErr
        );
      }

      /* =====================================
        SOCKET EVENTS
      ===================================== */
      if (io) {

        io.to("admin_room").emit(
          "bookingUpdated",
          {
            bookingId: booking.booking_id,
            payment_status: "paid",
            status: "confirmed"
          }
        );

        io.to(`user_${req.user.id}`).emit(
          "bookingConfirmed",
          {
            bookingId: booking.booking_id,
            payment_status: "paid",
            status: "confirmed"
          }
        );
      }

      /* =====================================
        SUCCESS RESPONSE
      ===================================== */
      return res.json({
        success: true,
        type: "booking",
        id: booking.booking_id,
        payment_status: "paid",
        status: "confirmed",
        paid_amount: total,
        remaining_amount: 0
      });
    }
  }
    
  } catch (err) {
    await connection.rollback();
    console.error("Unified Payment Error:", err);
    return res.status(500).json({ message: "Payment failed" });

  } finally {
    connection.release();
  }
});

module.exports = router;