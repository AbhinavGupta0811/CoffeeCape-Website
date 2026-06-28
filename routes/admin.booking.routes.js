const express = require("express");
const router = express.Router();
const db = require("../db");
const adminMiddleware = require("../middleware/admin.middleware");
const { sendBookingUpdate } = require("../services/booking.socket");
const { exportBookingsCSV } = require("../services/exportController");
const { sendMail, generateBookingConfirmedTemplate } = require("../mailer");

/* ===================================================
   CONSTANTS
=================================================== */
const BOOKING_FLOW = ["pending", "confirmed", "completed"];
const FINAL_STATES = ["completed", "cancelled"];

/* ===================================================
   HELPERS
=================================================== */
function safeJSONParse(value) {
  try {
    if (!value) return {};
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return {};
  }
}

function isValidTransition(current, next) {
  const currentIndex = BOOKING_FLOW.indexOf(current);
  const nextIndex = BOOKING_FLOW.indexOf(next);

  if (currentIndex === -1 || nextIndex === -1) return false;
  return nextIndex === currentIndex + 1;
}

/* ===================================================
   BOOKING STATS
=================================================== */
router.get("/stats", adminMiddleware, async (req, res) => {
  try {

    /* ===============================
       BASIC STATS
    =============================== */
    const [[total]] = await db.query(
      "SELECT COUNT(*) AS count FROM bookings"
    );

    const [[today]] = await db.query(
      "SELECT COUNT(*) AS count FROM bookings WHERE DATE(created_at)=CURDATE()"
    );

    const [[revenue]] = await db.query(
      "SELECT SUM(total) AS amount FROM bookings WHERE status='completed'"
    );

    /* ===============================
       BOOKINGS BY DAY
    =============================== */
    const [byDay] = await db.query(`
      SELECT DATE(created_at) AS day, COUNT(*) AS count
      FROM bookings
      GROUP BY day
      ORDER BY day
    `);

    /* ===============================
       STATUS COUNT
    =============================== */
    const [statusRows] = await db.query(`
      SELECT status, COUNT(*) AS count
      FROM bookings
      GROUP BY status
    `);

    const statusCount = {};
    statusRows.forEach(r => {
      statusCount[r.status] = r.count;
    });

    /* ===============================
       NEW FIELDS (IMPORTANT 🔥)
    =============================== */
    const pendingBookings = statusCount.pending || 0;
    const confirmedBookings = statusCount.confirmed || 0;

    /* ===============================
       FINAL RESPONSE
    =============================== */
    return res.json({
      success: true,

      totalBookings: total.count || 0,
      todayBookings: today.count || 0,
      bookingRevenue: Number(revenue.amount) || 0,

      /* ✅ NEW DIRECT FIELDS */
      pendingBookings,
      confirmedBookings,

      /* KEEP OLD FOR SAFETY */
      bookingStatus: statusCount,

      bookingByDay: byDay
    });

  } catch (err) {
    console.error("Booking stats error:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to load stats"
    });
  }
});

/* ===================================================
   GET ALL BOOKINGS (ADMIN)
=================================================== */
router.get("/", adminMiddleware, async (req, res) => {
  try {

    const [rows] = await db.query(
      "SELECT * FROM bookings ORDER BY created_at DESC"
    );

    const bookings = rows.map(row => ({
      ...row,
      booking_data: safeJSONParse(row.booking_data)
    }));

    return res.json({
      success: true,
      count: bookings.length,
      bookings
    });

  } catch (err) {
    console.error("Admin fetch error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to load bookings"
    });
  }
});

/* ===================================================
   Export the Bookings
=================================================== */
router.get(
  "/export",
  adminMiddleware,
  exportBookingsCSV
);

/* ===================================================
   GET SINGLE BOOKING
=================================================== */
router.get("/:id", adminMiddleware, async (req, res) => {
  try {

    const bookingId = req.params.id;

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: "Booking ID required"
      });
    }

    const [[booking]] = await db.query(
      "SELECT * FROM bookings WHERE booking_id=?",
      [bookingId]
    );

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }

    booking.booking_data = safeJSONParse(booking.booking_data);

    return res.json({
      success: true,
      booking
    });

  } catch (err) {
    console.error("Booking detail error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch booking"
    });
  }
});

/* ===================================================
   UPDATE STATUS (STRICT FLOW)
=================================================== */
router.put("/:id/status", adminMiddleware, async (req, res) => {
  try {

    const io = req.app.get("io");
    const bookingId = req.params.id;
    const { status } = req.body;

    if (!BOOKING_FLOW.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status"
      });
    }

    const [[booking]] = await db.query(
      "SELECT booking_id, user_id, status, payment_status, paid_amount FROM bookings WHERE booking_id=?",
      [bookingId]
    );

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }

    if (FINAL_STATES.includes(booking.status)) {
      return res.status(403).json({
        success: false,
        message: "Final bookings cannot be modified"
      });
    }

    if (!isValidTransition(booking.status, status)) {
      return res.status(403).json({
        success: false,
        message: "Invalid status transition"
      });
    }

    await db.query(
      "UPDATE bookings SET status=?, updated_at=NOW() WHERE booking_id=?",
      [status, bookingId]
    );

    if (io) {
      sendBookingUpdate(io,{
        bookingId,
        userId:
          booking.user_id,
        status,
        payment_status:
          booking.payment_status,
        paid_amount:
          booking.paid_amount || 0
      });

      /* Legacy */

      io.to(`user_${booking.user_id}`)
        .emit(
          "bookingStatusUpdated",
          {
            bookingId,
            status
          }
        );

      io.to("admin_room")
        .emit(
          "bookingUpdated",
          {
            bookingId,
            status
          }
        );
    }

    return res.json({
      success: true,
      bookingId,
      status
    });

  } catch (err) {
    console.error("Status update error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to update status"
    });
  }
});

/* ===================================================
   COMPLETE BOOKING
=================================================== */
router.put("/:id/complete", adminMiddleware, async (req, res) => {
  try {

    const io = req.app.get("io");
    const bookingId = req.params.id;

    const [[booking]] = await db.query(
      "SELECT booking_id, user_id, status, payment_status, paid_amount FROM bookings WHERE booking_id=?",
      [bookingId]
    );

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }

    if (booking.status !== "confirmed") {
      return res.status(403).json({
        success: false,
        message: "Only confirmed bookings can be completed"
      });
    }

    await db.query(
      `UPDATE bookings
       SET status='completed',
       updated_at=NOW()
       WHERE booking_id=?`,
      [bookingId]
    );

    if (io) {
      sendBookingUpdate(io,{
        bookingId,
        userId:
          booking.user_id,
        status:
          "completed",
        payment_status:
          "completed",
        paid_amount:
          booking.paid_amount || 0
      });

      /* Legacy */
      io.to(`user_${booking.user_id}`)
        .emit(
          "bookingCompleted",
          {
            bookingId,
            status:"completed",
            payment_status:
            "completed"
          }
        );
    }

    return res.json({
      success: true,
      bookingId,
      status: "completed"
    });

  } catch (err) {
    console.error("Complete booking error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to complete booking"
    });
  }
});

/* ===================================================
   ADMIN CANCEL (TRANSACTION SAFE)
=================================================== */
router.put("/:id/cancel", adminMiddleware, async (req, res) => {

  const connection = await db.getConnection();

  try {
    const io = req.app.get("io");
    const bookingId = req.params.id;

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: "Booking ID required"
      });
    }

    await connection.beginTransaction();

    /* 🔒 LOCK BOOKING ROW */
    const [[booking]] = await connection.query(
      `SELECT booking_id, user_id, status,
       payment_status, paid_amount
       FROM bookings
       WHERE booking_id = ?
       FOR UPDATE`,
      [bookingId]
    );

    if (!booking) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }

    /* 🚫 Prevent cancelling final states */
    if (booking.status === "completed" || booking.status === "cancelled") {
      await connection.rollback();
      return res.status(403).json({
        success: false,
        message: "Final bookings cannot be cancelled"
      });
    }

    /* 💰 Determine Refund Logic */
    const wasPaid = Number(booking.paid_amount) > 0;

    let newPaymentStatus = booking.payment_status;

    if (wasPaid) {
      newPaymentStatus = "refunded";
    } else {
      newPaymentStatus = "pending";
    }

    /* 📝 Update Booking */
    await connection.query(
      `UPDATE bookings
       SET status = 'cancelled',
          cancelled_by = 'admin',
          payment_status = ?,
          updated_at = NOW()
       WHERE booking_id = ?`,
      [newPaymentStatus, bookingId]
    );

    await connection.commit();

    if (io) {
      sendBookingUpdate(io,{
        bookingId,
        userId:
          booking.user_id,
        status:
          "cancelled",
        payment_status:
          newPaymentStatus,
        cancelled_by:
          "admin",
        paid_amount:
          booking.paid_amount
      });

      /* Legacy */
      io.to(`user_${booking.user_id}`)
        .emit(
          "bookingCancelled",
          {
            bookingId,
            status:
            "cancelled",
            payment_status:
            newPaymentStatus
          }
        );

      io.to("admin_room")
        .emit(
          "bookingUpdated",
          {
            bookingId,
            status:
            "cancelled",
            payment_status:
            newPaymentStatus
          }
        );
    }

    return res.json({
      success: true,
      bookingId,
      status: "cancelled",
      payment_status: newPaymentStatus
    });

  } catch (err) {
    await connection.rollback();
    console.error("Admin cancel error:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to cancel booking"
    });

  } finally {
    connection.release();
  }
});

/* ===================================================
   ACCEPT BOOKING (ADMIN)
=================================================== */
router.put("/:id/accept", adminMiddleware, async (req, res) => {
  try {

    const io = req.app.get("io");
    const bookingId = req.params.id;
    const { assigned_address } = req.body;

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: "Booking ID required"
      });
    }

    if (!assigned_address || assigned_address.trim().length < 5) {
      return res.status(400).json({
        success: false,
        message: "Valid assigned address is required"
      });
    }

    /* FIXED QUERY (EMAIL + NAME INCLUDED) */
    const [[booking]] = await db.query(
      `SELECT booking_id, user_id, status, email, full_name, event_date, event_time, 
       payment_status, paid_amount
       FROM bookings
       WHERE booking_id=?`,
      [bookingId]
    );

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }

    if (booking.status !== "pending") {
      return res.status(403).json({
        success: false,
        message: "Only pending bookings can be accepted"
      });
    }

    /* ===============================
       UPDATE BOOKING
    =============================== */
    await db.query(
      `UPDATE bookings
       SET status='confirmed',
           assigned_address=?,
           updated_at=NOW()
       WHERE booking_id=?`,
      [assigned_address.trim(), bookingId]
    );

    /* ===============================
       SEND CONFIRMATION MAIL
    =============================== */
    if (booking.email) {

      console.log("📧 Sending mail to:", booking.email);

      const html = generateBookingConfirmedTemplate({
        ...booking,
        assigned_address: assigned_address.trim()
      });

      try {
        await sendMail({
          to: booking.email,
          subject: "🎉 Booking Confirmed with Address | CoffeeCape",
          html
        });

        console.log("✅ Mail sent successfully");

      } catch (mailErr) {
        console.error("❌ Mail failed:", mailErr.message);
      }
    }

    /* ===============================
      SOCKET EVENTS
    =============================== */
    if (io) {

      /* New unified event */
      sendBookingUpdate(io, {
        bookingId,
        userId: booking.user_id,
        status: "confirmed",
        payment_status: booking.payment_status,
        assigned_address:
          assigned_address.trim(),
        cancelled_by: null,
        paid_amount:
          booking.paid_amount || 0
      });

      /* Legacy compatibility */
      io.to(`user_${booking.user_id}`)
        .emit("bookingConfirmed", {
          bookingId,
          status: "confirmed",
          assigned_address:
            assigned_address.trim()
        });

      io.to("admin_room")
        .emit("bookingUpdated", {
          bookingId,
          status: "confirmed"
        });

    }

    return res.json({
      success: true,
      bookingId,
      status: "confirmed",
      assigned_address: assigned_address.trim()
    });

  } catch (err) {
    console.error("Accept booking error:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to accept booking"
    });
  }
});

module.exports = router;