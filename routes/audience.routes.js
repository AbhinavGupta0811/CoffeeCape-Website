const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/auth.middleware");
const { sendAudiencePaymentMail } = require("../mailer");
const {
  generatePendingAudienceId,
  generateAudienceBookingId,
  normalizeAudienceData,
  validateAudienceBooking,
  calculateAudiencePrice,
  buildAudienceExtras,
  calculateExpiry,
  checkDuplicateAudienceBooking,
  getAudienceEvent,
  formatAudienceResponse
} = require("../helpers/audience.helper");
const pool = require("../db");


/* ======================================================
   GET ACTIVE AUDIENCE EVENT
====================================================== */
router.get("/event/:eventType", async (req, res) => {
  try {

    /* INPUT VALIDATION */
    const eventType = String(req.params.eventType || "").trim().toLowerCase();
    const allowedEvents = new Set([
      "openmic",
      "karaoke",
      "tasting"
    ]);

    if (!allowedEvents.has(eventType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid event type."
      });
    }

    /* ==========================================
       FETCH ACTIVE EVENT
    ========================================== */
    const [rows] = await pool.execute(
      `
      SELECT
        b.booking_id,
        b.event_type,
        b.event_date,
        b.event_time,
        b.assigned_address,
        e.audience_ticket_price,
        e.audience_capacity,
        e.audience_booked,
        e.audience_booking_enabled,
        e.audience_booking_open
      FROM bookings b
      INNER JOIN event_settings e
      ON b.booking_id=e.booking_id
      WHERE
        b.event_type=?
      AND b.status='confirmed'
      AND e.audience_booking_enabled=1
      AND e.audience_booking_open=1
      AND b.event_date>=CURDATE()
      ORDER BY
        b.event_date ASC,
        b.event_time ASC
      LIMIT 1
      `,
      [eventType]
    );

    /* EVENT NOT FOUND */
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        code: "NO_EVENT",
        message: "No upcoming event scheduled."
      });
    }

    const event = rows[0];

    /* SAFE NUMERIC VALUES */
    const capacity = Math.max(
      0, Number(event.audience_capacity) || 0
    );

    const bookedSeats = Math.max(
      0, Number(event.audience_booked) || 0
    );

    const availableSeats = Math.max(
      0, capacity - bookedSeats
    );

    const ticketPrice = Math.max(
      0, Number(event.audience_ticket_price) || 0
    );

    /* SOLD OUT */
    if (availableSeats <= 0) {
      return res.status(409).json({
        success: false,
        code: "EVENT_FULL",
        message: "Audience booking is full."
      });
    }

    /* SUCCESS RESPONSE */
    return res.status(200).json({
      success: true,
      event: {
        bookingId: event.booking_id,
        eventType: event.event_type,
        eventDate: event.event_date,
        eventTime: event.event_time,
        address: event.assigned_address,
        ticketPrice,
        capacity,
        bookedSeats,
        availableSeats
      }
    });
  }
  catch (err) {
    console.error("[AUDIENCE EVENT ERROR]", err);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch event."
    });
  }
});

/* ======================================================
   CREATE PENDING AUDIENCE BOOKING
====================================================== */
router.post("/create-pending", verifyToken, async (req, res) => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const userId = req.user?.id;

      if (!userId) {
        await connection.rollback();

        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      /* ==========================
         NORMALIZE
      ========================== */
      const payload = normalizeAudienceData(req.body);

      if (!payload.eventCategory) {
        payload.eventCategory = "audience";
      }

      /* ==========================
         VALIDATE
      ========================== */
      const validation = validateAudienceBooking(payload);

      if (!validation.valid) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          errors:
            validation.errors
        });
      }

      /* ==========================
         DUPLICATE CHECK
      ========================== */
      const duplicate =
        await checkDuplicateAudienceBooking(
          connection,
          userId,
          payload.bookingId
        );

      if (duplicate.exists) {
        await connection.rollback();
        return res.status(409).json({
          success: false,
          code: duplicate.reason,
          message: "Audience booking already exists"
        });
      }

      /* ==========================
        FETCH EVENT FROM DATABASE
      ========================== */
      const eventResult = await getAudienceEvent(
        connection,
        payload.bookingId
      );

      if (!eventResult.success) {
        await connection.rollback();

        return res.status(400).json({
          success: false,
          code: eventResult.code,
          message: eventResult.message
        });
      }

      const event = eventResult.event;

      /* ==========================
         IDS
      ========================== */
      const pendingId = generatePendingAudienceId();

      /* ==========================
         PRICE
      ========================== */
      const pricing = calculateAudiencePrice({
        ticketPrice: event.ticketPrice,
        audienceCount: payload.audienceCount
      });

      /* ==========================
         EXTRAS
      ========================== */
      const audienceData = buildAudienceExtras(payload);

      /* ==========================
         EXPIRY
      ========================== */
      const expiresAt = calculateExpiry();

      /* ==========================
         INSERT PENDING
      ========================== */
      await connection.execute(
        `
        INSERT INTO
        pending_audience_bookings
        (
          id,
          booking_id,
          user_id,
          event_type,
          event_category,
          event_date,
          event_time,
          audience_count,
          full_name,
          email,
          phone,
          audience_data,
          ticket_price,
          total,
          status,
          expires_at
        )
        VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          pendingId,
          payload.bookingId,
          userId,
          event.eventType,
          payload.eventCategory,
          event.eventDate,
          event.eventTime,
          pricing.audienceCount,
          payload.fullName,
          payload.email,
          payload.phone,
          JSON.stringify(audienceData),
          pricing.ticketPrice,
          pricing.total,
          "pending",
          expiresAt
        ]
      );

      await connection.commit();

      return res.status(201).json({
        success: true,
        pending: formatAudienceResponse({
          id: pendingId,
          booking_id: payload.bookingId,
          user_id: userId,
          event_type: event.eventType,
          event_category: payload.eventCategory,
          event_date: event.eventDate,
          event_time: event.eventTime,
          audience_count: pricing.audienceCount,
          full_name: payload.fullName,
          email: payload.email,
          phone: payload.phone,
          audience_data: audienceData,
          ticket_price: pricing.ticketPrice,
          total: pricing.total,
          status: "pending",
          expires_at: expiresAt,
          created_at: new Date(),
          updated_at: new Date()
        })
      });
    }
    catch (err) {
      await connection.rollback();
      console.error(
        "Create Pending Audience Error:", err
      );

      return res.status(500).json({
        success: false,
        message: "Failed to create pending booking"
      });
    }
    finally {
      connection.release();
    }
  }
);

/* ======================================================
   GET PENDING AUDIENCE BOOKING
====================================================== */
router.get("/pending/:pendingId", verifyToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const userId = req.user?.id;
    const { pendingId } = req.params;

    if (!pendingId) {
      return res.status(400).json({
        success: false,
        message: "Pending ID is required."
      });
    }

    /* ==========================
       GET PENDING BOOKING
    ========================== */
    const [rows] = await connection.execute(
      `
      SELECT *
      FROM pending_audience_bookings
      WHERE
        id = ?
        AND user_id = ?
      LIMIT 1
      `,
      [
        pendingId,
        userId
      ]
    );

    if (!rows.length) {

      return res.status(404).json({
        success: false,
        message: "Pending booking not found."
      });

    }

    const pending = rows[0];

    /* ==========================
       EXPIRY CHECK
    ========================== */
    if (new Date(pending.expires_at) < new Date()) {
      return res.status(410).json({
        success: false,
        message: "Pending booking has expired."
      });
    }

    /* ==========================
       SUCCESS
    ========================== */
    return res.status(200).json({
      success: true,
      pending: formatAudienceResponse(pending)
    });
  }

  catch (err) {
    console.error(
      "Get Pending Audience Error:",
      err
    );

    return res.status(500).json({
      success: false,
      message: "Failed to fetch pending booking."
    });
  }
  finally {
    connection.release();
  }
});

/* ======================================================
   AUDIENCE PAYMENT
====================================================== */
router.post("/payment", verifyToken, async (req, res) => {

  const {
    pendingId,
    paymentId,
    paymentMethod,
    amount
  } = req.body;

  /* ==========================
     INPUT VALIDATION
  ========================== */
  if (!pendingId) {
    return res.status(400).json({
      success: false,
      message: "Pending ID is required."
    });
  }

  if (!paymentId) {
    return res.status(400).json({
      success: false,
      message: "Payment ID is required."
    });
  }

  if (!paymentMethod) {
    return res.status(400).json({
      success: false,
      message: "Payment method is required."
    });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const userId = req.user?.id;

    /* ==========================
       GET PENDING BOOKING
    ========================== */
    const [pendingRows] =
      await connection.execute(
        `
        SELECT *
        FROM pending_audience_bookings
        WHERE
          id=?
          AND user_id=?
        LIMIT 1
        FOR UPDATE
        `,
        [
          pendingId,
          userId
        ]
      );

    if (!pendingRows.length) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message:
          "Pending booking not found"
      });
    }

    const pending = pendingRows[0];

    /* ==========================
      FETCH LIVE EVENT
    ========================== */
    const eventResult = await getAudienceEvent(
      connection,
      pending.booking_id
    );

    if (!eventResult.success) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        code: eventResult.code,
        message: eventResult.message
      });
    }

    const event = eventResult.event;

    /* ==========================
       STATUS CHECK
    ========================== */
    if (pending.status !== "pending") {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: "Booking already processed"
      });
    }

    /* ==========================
       EXPIRY CHECK
    ========================== */
    if (new Date(pending.expires_at) < new Date()) {
      await connection.execute(
        `
        UPDATE
        pending_audience_bookings
        SET
        status='expired'
        WHERE id=?
        `,
        [pendingId]
      );
      await connection.commit();
      return res.status(410).json({
        success: false,
        message: "Pending booking expired"
      });
    }

    /* ==========================
      VERIFY TICKET PRICE
    ========================== */
    if (Number(event.ticketPrice) !== Number(pending.ticket_price)) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        code: "PRICE_CHANGED",
        message:
          "Ticket price has changed. Please book again."
      });
    }

    /* ==========================
       AMOUNT VERIFY
    ========================== */
    const expectedTotal = event.ticketPrice * pending.audience_count;
    if (Number(amount) !== expectedTotal || Number(pending.total) !== expectedTotal) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        code: "INVALID_AMOUNT",
        message: "Amount verification failed."
      });
    }

    /* ==========================
       GENERATE BOOKING ID
    ========================== */
    const audienceBookingId = await generateAudienceBookingId(connection);

    /* ==========================
       INSERT MAIN BOOKING
    ========================== */
    await connection.execute(
      `
      INSERT INTO
      audience_bookings
      (
        audience_booking_id,
        booking_id,
        user_id,
        event_type,
        event_category,
        event_date,
        event_time,
        audience_count,
        full_name,
        email,
        phone,
        audience_data,
        ticket_price,
        total,
        payment_id,
        payment_status,
        status
      )
      VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        audienceBookingId,
        pending.booking_id,
        pending.user_id,
        pending.event_type,
        pending.event_category,
        pending.event_date,
        pending.event_time,
        pending.audience_count,
        pending.full_name,
        pending.email,
        pending.phone,
        pending.audience_data,
        pending.ticket_price,
        pending.total,
        paymentId,
        "paid",
        "confirmed"
      ]
    );

    /* ==========================
      UPDATE BOOKED SEATS
    ========================== */
    const [seatUpdate] = await connection.execute(
      `
      UPDATE event_settings
      SET
        audience_booked = audience_booked + ?
      WHERE
        booking_id = ?
        AND audience_booked + ? <= audience_capacity
      `,
      [
        pending.audience_count,
        pending.booking_id,
        pending.audience_count
      ]
    );

    if (seatUpdate.affectedRows === 0) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        code: "EVENT_FULL",
        message: "Not enough seats available."
      });
    }

    /* ==========================
       UPDATE PENDING
    ========================== */
    await connection.execute(
      `
      UPDATE
      pending_audience_bookings
      SET status='paid'
      WHERE id=?
      `,
      [pendingId]
    );

    /* ==========================
       DELETE PENDING
    ========================== */
    await connection.execute(
      `
      DELETE
      FROM
      pending_audience_bookings
      WHERE id=?
      `,
      [pendingId]
    );

    /* ==========================
       GET CREATED BOOKING
    ========================== */
    const [bookingRows] =
      await connection.execute(
        `
        SELECT *
        FROM audience_bookings
        WHERE
        audience_booking_id=?
        LIMIT 1
        `,
        [audienceBookingId]
      );

    await connection.commit();
    const booking = bookingRows[0];

    /* ==========================
      SEND ACKNOWLEDGEMENT MAIL
    ========================== */
    try {
      const mailResult = await sendAudiencePaymentMail(booking.email, booking);

      if (!mailResult.success) {
        console.error(
          "Audience acknowledgement mail failed:",
          mailResult.error?.message
        );
      }
    }
    catch(mailError){
      // Never affect payment success
      console.error(
        "Audience acknowledgement exception:",
        mailError.message
      );
    }

    return res.status(200).json({
      success: true,
      booking: formatAudienceResponse(booking)
    });
  }
  catch (err) {
    if (connection) {
      await connection.rollback();
    }
    
    console.error(
      "Audience Payment Error:",
      err
    );

    return res.status(500).json({
      success: false,
      message: "Payment processing failed"
    });
  }
  finally {
    connection.release();
  }
  
});

/* ======================================================
   PAYMENT FAILED
====================================================== */
router.post("/payment-failed", verifyToken, async (req, res) => {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();
      const userId = req.user?.id;

      const {
        pendingId,
        paymentId = null,
        reason = "Payment failed"
      } = req.body;

      if (!pendingId) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message:
            "Pending ID is required"
        });
      }

      /* ==========================
         GET PENDING
      ========================== */
      const [rows] =
        await connection.execute(
          `
          SELECT *
          FROM
          pending_audience_bookings
          WHERE
            id=?
            AND user_id=?
          LIMIT 1
          FOR UPDATE
          `,
          [
            pendingId,
            userId
          ]
        );

      if (!rows.length) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message:
            "Pending booking not found"
        });
      }

      const pending = rows[0];

      /* ==========================
         STATUS VALIDATION
      ========================== */
      if (pending.status === "paid") {
        await connection.rollback();
        return res.status(409).json({
          success: false,
          message: "Payment already completed"
        });
      }

      if (pending.status === "failed") {
        await connection.rollback();
        return res.status(409).json({
          success: false,
          message: "Payment already failed"
        });
      }

      if (pending.status === "expired") {
        await connection.rollback();
        return res.status(410).json({
          success: false,
          message: "Pending booking expired"
        });
      }

      /* ==========================
         UPDATE FAILURE
      ========================== */
      await connection.execute(
        `
        UPDATE
          pending_audience_bookings
        SET
          status=?,
          payment_reference=?,
          updated_at=NOW()
        WHERE
          id=?
        `,
        [
          "failed",
          paymentId,
          pendingId
        ]
      );

      await connection.commit();

      return res.status(200).json({
        success: true,
        pending: {
          pendingId,
          status: "failed",
          paymentId,
          reason:
            String(reason)
              .trim()
              .slice(0, 300)
        },
        message: "Payment marked as failed"
      });
    }

    catch (err) {
      await connection.rollback();

      console.error(
        "Payment Failed Error:",
        err
      );

      return res.status(500).json({
        success: false,
        message: "Failed to process payment failure"
      });
    }
    finally {
      connection.release();
    }
  }
);

/* ======================================================
   CANCEL PENDING BOOKING
====================================================== */
router.delete("/pending/:pendingId", verifyToken, async (req, res) => {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();
      const userId = req.user?.id;

      const {
        pendingId
      } = req.params;

      if (!pendingId) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: "Pending ID is required"
        });
      }

      /* ==========================
         GET PENDING BOOKING
      ========================== */
      const [rows] =
        await connection.execute(
          `
          SELECT *
          FROM
          pending_audience_bookings
          WHERE
            id=?
            AND user_id=?
          LIMIT 1
          FOR UPDATE
          `,
          [
            pendingId,
            userId
          ]
        );

      if (!rows.length) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message:
            "Pending booking not found"
        });
      }

      const pending = rows[0];

      /* ==========================
         STATUS VALIDATION
      ========================== */
      if (pending.status === "paid") {
        await connection.rollback();
        return res.status(409).json({
          success: false,
          message: "Paid booking cannot be cancelled"
        });
      }

      if (
        pending.status ===
        "cancelled"
      ) {

        await connection.rollback();

        return res.status(409).json({
          success: false,
          message:
            "Booking already cancelled"
        });

      }

      if (
        pending.status ===
        "expired"
      ) {

        await connection.rollback();

        return res.status(410).json({
          success: false,
          message:
            "Booking already expired"
        });

      }

      /* ==========================
         CANCEL BOOKING
      ========================== */
      await connection.execute(
        `
        UPDATE
          pending_audience_bookings
        SET
          status='cancelled',
          updated_at=NOW()
        WHERE
          id=?
        `,
        [pendingId]
      );

      await connection.commit();

      return res.status(200).json({
        success: true,
        pending: {
          pendingId,
          status: "cancelled"
        },
        message: "Pending booking cancelled successfully"
      });
    }

    catch (err) {
      await connection.rollback();
      console.error(
        "Cancel Pending Error:",
        err
      );

      return res.status(500).json({
        success: false,
        message: "Failed to cancel pending booking"
      });
    }
    finally {
      connection.release();
    }
  }
);

/* ======================================================
   MY AUDIENCE BOOKINGS
====================================================== */
router.get("/my", verifyToken, async (req, res) => {
    const connection = await pool.getConnection();
    try {
      const userId = req.user?.id;

      const page =
        Math.max(
          Number(
            req.query.page
          ) || 1,
          1
        );

      const limit =
        Math.min(
          Math.max(
            Number(
              req.query.limit
            ) || 10,
            1
          ),
          50
        );

      const offset =
        (
          page - 1
        ) * limit;

      const status =
        req.query.status
          ?.trim()
          ?.toLowerCase();

      let where =
        `
        WHERE
        user_id=?
        `;

      const params =
        [userId];

      if (status) {
        where +=
          `
          AND status=?
          `;
        params.push(
          status
        );
      }

      /* ==========================
         TOTAL COUNT
      ========================== */
      const [countRows] =
        await connection.execute(
          `
          SELECT
            COUNT(*) AS total
          FROM
            audience_bookings
          ${where}
          `,
          params
        );

      const total =
        countRows[0]
          .total;

      /* ==========================
         GET BOOKINGS
      ========================== */
      const [rows] =
        await connection.execute(
          `
          SELECT *
          FROM
            audience_bookings
          ${where}
          ORDER BY
            created_at DESC
          LIMIT ?
          OFFSET ?
          `,
          [
            ...params,
            limit,
            offset
          ]
        );

      const bookings =
        rows.map(
          booking =>
            formatAudienceResponse(
              booking
            )
        );

      return res.status(200).json({
          success: true,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
          },
          bookings
        });
    }
    catch (err) {
      console.error(
        "Get My Audience Error:",
        err
      );

      return res.status(500).json({
        success: false,
        message: "Failed to fetch audience bookings"
      });
    }
    finally {
      connection.release();
    }
  }
);

/* ======================================================
   SINGLE AUDIENCE BOOKING
====================================================== */
router.get("/:audienceBookingId", verifyToken, async (req, res) => {
    const connection = await pool.getConnection();

    try {
      const userId = req.user?.id;
      const {
        audienceBookingId
      } = req.params;

      if (!audienceBookingId) {
        return res.status(400).json({
          success: false,
          message: "Audience booking ID is required"
        });
      }

      /* ==========================
         GET BOOKING
      ========================== */
      const [rows] =
        await connection.execute(
          `
          SELECT *
          FROM
            audience_bookings
          WHERE
            audience_booking_id=?
            AND user_id=?
          LIMIT 1
          `,
          [
            audienceBookingId,
            userId
          ]
        );

      if (!rows.length) {
        return res.status(404).json({
          success: false,
          message: "Audience booking not found"
        });
      }

      const booking = rows[0];

      return res.status(200).json({
        success: true,
        booking: formatAudienceResponse(booking)
      });
    }
    catch (err) {
      console.error(
        "Get Audience Booking Error:",
        err
      );

      return res.status(500).json({
        success: false,
        message: "Failed to fetch booking"
      });
    }
    finally {
      connection.release();
    }
  }
);

/* ======================================================
   CANCEL AUDIENCE BOOKING
====================================================== */
router.patch("/:audienceBookingId/cancel", verifyToken, async (req, res) => {
    const connection = await pool.getConnection();
    try {

      await connection.beginTransaction();
      const userId = req.user?.id;

      const {
        audienceBookingId
      } = req.params;

      if (!audienceBookingId) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: "Audience booking ID is required"
        });
      }

      /* ==========================
         GET BOOKING
      ========================== */
      const [rows] =
        await connection.execute(
          `
          SELECT *
          FROM
            audience_bookings
          WHERE
            audience_booking_id=?
            AND user_id=?
          LIMIT 1
          FOR UPDATE
          `,
          [
            audienceBookingId,
            userId
          ]
        );

      if (!rows.length) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: "Audience booking not found"
        });
      }

      const booking = rows[0];

      /* ==========================
         STATUS VALIDATION
      ========================== */
      if (booking.status === "cancelled") {
        await connection.rollback();
        return res.status(409).json({
          success: false,
          message: "Booking already cancelled"
        });
      }

      if (booking.status === "completed") {
        await connection.rollback();
        return res.status(409).json({
          success: false,
          message: "Completed booking cannot be cancelled"
        });
      }

      if (booking.payment_status !== "paid") {
        await connection.rollback();
        return res.status(409).json({
          success: false,
          message: "Only paid bookings can be cancelled"
        });
      }

      /* ==========================
         REFUND ELIGIBILITY
      ========================== */
      const eventDate =
        new Date(
          booking.event_date
        );

      const now = new Date();
      const hoursDiff =
        (
          eventDate -
          now
        ) /
        (
          1000 *
          60 *
          60
        );

      const refundEligible = hoursDiff >= 24;

      /* ==========================
         CANCEL BOOKING
      ========================== */
      await connection.execute(
        `
        UPDATE
          audience_bookings
        SET
          status=?,
          updated_at=NOW()
        WHERE
          audience_booking_id=?
        `,
        [
          "cancelled",
          audienceBookingId
        ]
      );

      /* ==========================
        RELEASE BOOKED SEATS
      ========================== */
      await connection.execute(
        `
        UPDATE event_settings
        SET
          audience_booked =
            GREATEST(
              audience_booked - ?,
              0
            )
        WHERE
          booking_id = ?
        `,
        [
          booking.audience_count,
          booking.booking_id
        ]
      );

      /* ==========================
         GET UPDATED
      ========================== */
      const [updated] =
        await connection.execute(
          `
          SELECT *
          FROM
            audience_bookings
          WHERE
            audience_booking_id=?
          LIMIT 1
          `,
          [audienceBookingId]
        );

      await connection.commit();

      return res.status(200).json({
        success: true,
        refundEligible,
        booking:
          formatAudienceResponse(
            updated[0]
          ),

        message:
          refundEligible
            ? "Booking cancelled. Refund eligible."
            : "Booking cancelled."
      });
    }

    catch (err) {
      await connection.rollback();
      console.error(
        "Cancel Audience Error:",
        err
      );
      return res.status(500).json({
        success: false,
        message: "Failed to cancel booking"
      });
    }

    finally {
      connection.release();
    }
  }
);

module.exports = router;