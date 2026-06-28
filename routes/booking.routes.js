const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const verifyToken = require("../middleware/auth.middleware");
const { extractCoreBooking, buildBookingExtras, formatBookingResponse } = require("../helpers/booking.helper");
const { calculateBookingPrice } = require("../helpers/bookingPricing");
const pool = require("../db");

/* ======================================================
   UTILITY HELPERS
====================================================== */
function safeJSONParse(value) {
  try {
    if (!value) return {};
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return {};
  }
}

function normalizeBookingData(data) {
  let cleaned = { ...data };

  // Remove nested booking_data if frontend mistakenly sends it
  if (cleaned.booking_data && typeof cleaned.booking_data === "object") {
    cleaned = { ...cleaned, ...cleaned.booking_data };
    delete cleaned.booking_data;
  }

  return cleaned;
}

/* ======================================================
   CHECK AVAILABILITY
====================================================== */
router.get("/availability", verifyToken, async (req, res) => {
  try {
    const { eventType, eventDate, eventTime } = req.query;

    if (!eventType || !eventDate || !eventTime) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields"
      });
    }

    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM bookings
       WHERE event_type = ?
       AND event_date = ?
       AND event_time = ?
       AND payment_status = 'completed'`, 
      [eventType, eventDate, eventTime]
    );

    const limit = 5;
    const booked = rows[0].total;

    return res.json({
      success: true,
      available: booked < limit,
      booked,
      remaining: Math.max(0, limit - booked)
    });

  } catch (err) {
    console.error("Availability error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to check availability"
    });
  }
});

/* ======================================================
   CREATE PENDING BOOKING
====================================================== */
router.post("/create-pending", verifyToken, async (req, res) => {

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction(); // 🔥 ADDED

    const userId = req.user?.id;
    const rawData = req.body;

    const data = normalizeBookingData(rawData); // 🔥 CLEAN DATA
    const core = extractCoreBooking(data);

    const extras = buildBookingExtras(
      core.event_type,
      data
    );

    /* =====================================
      BACKEND PRICE CALCULATION
    ===================================== */
    const pricing =
      calculateBookingPrice(
        core.event_type,
        {
          guestCount:
            core.guest_count,

          ...extras
        }
      );

    if (pricing.total <= 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message:
          "Invalid booking price"
      });
    }

    if ( !core.event_type || !core.event_date || !core.event_time) {
      return res.status(400).json({
        success: false,
        message: "Missing required booking fields"
      });
    }

    const eventDateObj = new Date(core.event_date);
    const today = new Date();
    today.setHours(0,0,0,0);

    if (isNaN(eventDateObj.getTime()) || eventDateObj < today) {
      return res.status(400).json({
        success: false,
        message: "Invalid or past event date"
      });
    }

    /* SLOT CHECK (ONLY PAID BOOKINGS) */
    const [slotCheck] = await connection.execute(
      `SELECT COUNT(*) AS total
       FROM bookings
       WHERE event_type = ?
       AND event_date = ?
       AND event_time = ?
       AND payment_status = 'completed'`,
      [core.event_type, core.event_date, core.event_time]
    );

    if (slotCheck[0].total >= 5) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: "Slot is full"
      });
    }

    /* 🔥 SAFE UNIQUE ID */
    const pendingId = "PBK-" + uuidv4().slice(0, 8).toUpperCase();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await connection.execute(
      `INSERT INTO pending_bookings
       (id, user_id, event_type, event_category, event_date, event_time, guest_count,
        full_name, email, phone, booking_data, total, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
      pendingId,
      userId,
      core.event_type,
      core.event_category,
      core.event_date,
      core.event_time,
      core.guest_count,
      core.full_name,
      core.email,
      core.phone,
      JSON.stringify({
        event: extras, pricing}),
      pricing.total,
      expiresAt
      ]
    );

    await connection.commit(); 

    return res.status(201).json({
      success:true,
      pendingId,
      expiresAt,
      total: pricing.total
    });

  } catch (err) {
    await connection.rollback(); 
    console.error("Pending booking error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to create pending booking"
    });
  } finally {
    connection.release();
  }
});

/* ======================================================
   GET PENDING BOOKING
====================================================== */
router.get("/pending/:id", verifyToken, async (req, res) => {

  const connection = await pool.getConnection();

  try {

    const { id } = req.params;

    const [[pending]] = await connection.query(
      `SELECT *
       FROM pending_bookings
       WHERE id = ? AND user_id = ?`,
      [id, req.user.id]
    );

    if (!pending) {
      return res.status(404).json({
        success: false,
        message: "Pending booking not found"
      });
    }

    return res.json({
      success: true,
      pending
    });

  } catch (err) {
    console.error("Get pending booking error:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  } finally {
    connection.release(); 
  }
});

/* ======================================================
   GET USER BOOKINGS
====================================================== */
router.get("/user/all", verifyToken, async (req, res) => {
  try {

    const userId = req.user?.id;

    const [rows] = await pool.execute(
      `SELECT *
       FROM bookings
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [userId]
    );

    const bookings = rows.map(row => {
      const booking = formatBookingResponse(row);
      booking.event_date = booking.event_date
        ? new Date(booking.event_date)
            .toISOString()
            .split("T")[0]
        : null;

      return booking;
    });

    return res.json({
      success: true,
      bookings
    });

  } catch (err) {
    console.error("Get bookings error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch bookings"
    });
  }
});

/* ======================================================
   GET SINGLE BOOKING
====================================================== */
router.get("/details/:id", verifyToken, async (req, res) => {
  try {

    const userId = req.user?.id;
    const bookingId = req.params.id;

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: "Booking ID is required"
      });
    }

    const [rows] = await pool.execute(
      `SELECT *
       FROM bookings
       WHERE booking_id = ? AND user_id = ?
       LIMIT 1`,
      [bookingId, userId]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }

    const booking= formatBookingResponse(rows[0]);

    return res.json({
      success: true,
      booking
    });

  } catch (err) {
    console.error("Booking details error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch booking details"
    });
  }
});

/* ======================================================
   CANCEL BOOKING
====================================================== */
router.put("/cancel/:bookingId", verifyToken, async (req, res) => {
  try {
    const io = req.app.get("io");
    const { bookingId } = req.params;
    const userId = req.user?.id;

    if (!userId || !bookingId) {
      return res.status(400).json({
        success: false,
        message: "Invalid request"
      });
    }

    const [result] = await pool.execute(
      `
      UPDATE bookings
      SET status = 'cancelled',
          payment_status = 'refunded',
          cancelled_by = 'user',
          updated_at = NOW()
      WHERE booking_id = ?
      AND user_id = ?
      AND status IN ('pending','confirmed') 
      AND TIMESTAMPDIFF(HOUR, created_at, NOW()) <= 24
      `,
      [bookingId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(403).json({
        success: false,
        message: "Cancellation not allowed"
      });
    }

    if (io) {
      io.to("admin_room").emit("bookingCancelled", { bookingId, userId });
      io.to(`user_${userId}`).emit("bookingCancelled", {
        bookingId,
        status: "cancelled"
      });
    }

    return res.json({
      success: true,
      bookingId,
      status: "cancelled"
    });

  } catch (err) {
    console.error("Cancel booking error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});

module.exports = router;