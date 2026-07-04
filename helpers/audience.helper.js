const crypto = require("crypto");

/* Generate Pending Audience Booking ID Example: PAB-7F42A91C PAB-91D4C3A2 */
function generatePendingAudienceId() {
  const date = new Date()
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "");

  return `PAB-${date}-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
}

/* Generate the next Audience Booking ID Example:  AUD000001  AUD000002  AUD000003 */
async function generateAudienceBookingId(connection) {
  const [rows] = await connection.query(`
    SELECT id
    FROM audience_bookings
    ORDER BY id DESC
    LIMIT 1
    FOR UPDATE
  `);

  const nextNumber =
    rows.length === 0
      ? 1
      : Number(rows[0].id) + 1;

  return `AUD${String(nextNumber).padStart(6, "0")}`;
}

const VALID_EVENTS = new Set([
  "dinner",
  "get",
  "karaoke",
  "openmic",
  "tasting",
  "private"
]);

/* ======================================================
   GLOBAL VALIDATORS
====================================================== */
function validateName(name) {
  if (typeof name !== "string") return false;

  const value = name.trim();

  return (
    value.length >= 2 &&
    value.length <= 100 &&
    /^[A-Za-z\s.'-]+$/.test(value)
  );
}

function validateEmail(email) {
  if (typeof email !== "string") return false;

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function validatePhone(phone) {
  if (typeof phone !== "string") return false;

  return /^[6-9]\d{9}$/.test(phone.trim());
}

function normalizeAudienceData(data = {}) {
  return {
    bookingId:
      String(data.bookingId || "")
        .trim(),

    eventType:
      String(data.eventType || "")
        .trim()
        .toLowerCase(),

    eventCategory:
      String(data.eventCategory || "")
        .trim(),

    eventDate:
      String(data.eventDate || "")
        .trim(),

    eventTime:
      String(data.eventTime || "")
        .trim(),

    audienceCount:
      Math.max(
        1,
        Number.parseInt(
          data.audienceCount,
          10
        ) || 0
      ),

    fullName:
      String(data.fullName || "")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 100),

    email:
      String(data.email || "")
        .trim()
        .toLowerCase()
        .slice(0, 255),

    phone:
      String(data.phone || "")
        .replace(/\D/g, "")
        .slice(0, 15),

    audienceData:
      typeof data.audienceData === "object"
        && data.audienceData !== null
          ? data.audienceData
          : {},

    extras:
      Array.isArray(data.extras)
        ? data.extras
            .filter(Boolean)
            .slice(0, 20)
        : [],

    specialRequest:
      String(
        data.specialRequest || ""
      )
        .trim()
        .slice(0, 500),

    notes:
      String(data.notes || "")
        .trim()
        .slice(0, 500)
  };
}

/*------------ Validate Audience Booking -------------*/
function validateAudienceBooking(data = {}) {

  const errors = [];

  /* ==========================
     BOOKING ID
  ========================== */
  if (
    !data.bookingId ||
    typeof data.bookingId !== "string"
  ) {
    errors.push("Booking ID is required.");
  }

  /* ==========================
     FULL NAME
  ========================== */
  if (!validateName(data.fullName)) {
    errors.push(
      "Please enter a valid full name."
    );
  }

  /* ==========================
     EMAIL
  ========================== */
  if (!validateEmail(data.email)) {
    errors.push(
      "Please enter a valid email address."
    );
  }

  /* ==========================
     PHONE
  ========================== */
  if (!validatePhone(data.phone)) {
    errors.push(
      "Please enter a valid 10-digit mobile number."
    );
  }

  /* ==========================
     AUDIENCE COUNT
  ========================== */
  const audienceCount = Number.parseInt(
    data.audienceCount,
    10
  );

  if (
    !Number.isInteger(audienceCount) ||
    audienceCount < 1 ||
    audienceCount > 20
  ) {
    errors.push(
      "Audience count must be between 1 and 20."
    );
  }

  /* ==========================
     SPECIAL REQUEST
  ========================== */
  if (
    data.specialRequest &&
    String(data.specialRequest).length > 500
  ) {
    errors.push(
      "Special request cannot exceed 500 characters."
    );
  }

  /* ==========================
     NOTES
  ========================== */
  if (
    data.notes &&
    String(data.notes).length > 1000
  ) {
    errors.push(
      "Notes cannot exceed 1000 characters."
    );
  }

  /* ==========================
     EVENT CATEGORY
  ========================== */
  if (
    data.eventCategory &&
    data.eventCategory !== "audience"
  ) {
    errors.push(
      "Invalid event category."
    );
  }

  return {
    valid: errors.length === 0,
    errors
  };

}

/* Calculate audience booking price */
function calculateAudiencePrice(data = {}) {

  const {
    ticketPrice,
    audienceCount
  } = data;

  const price = Number(ticketPrice);

  if (
    !Number.isFinite(price) ||
    price < 0
  ) {
    throw new Error("Invalid ticket price");
  }

  const count = Number.parseInt(
    audienceCount,
    10
  );

  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > 100
  ) {
    throw new Error("Invalid audience count");
  }

  const total = price * count;

  return {
    ticketPrice: price,
    audienceCount: count,
    subtotal: total,
    total,
    currency: "INR"
  };
}

/* Build audience-specific JSON data */
function buildAudienceExtras(data = {}) {
  const sanitizeText = (value, max = 500) =>
    String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .replace(/[<>]/g, "")
      .slice(0, max);

  const sanitizeArray = (value, max = 20) => {
    if (!Array.isArray(value)) {
      return [];
    }

    return [
      ...new Set(
        value
          .map(item =>
            String(item)
              .trim()
              .toLowerCase()
          )
          .filter(Boolean)
      )
    ].slice(0, max);
  };

  return {
    specialRequest:
      sanitizeText(
        data.specialRequest,
        500
      ),

    notes:
      sanitizeText(
        data.notes,
        500
      ),

    extras:
      sanitizeArray(
        data.extras,
        20
      ),

    metadata: {
      createdAt: new Date().toISOString(),
      source: "audience_booking"
    }
  };
}

function calculateExpiry(minutes = 10) {
  const safeMinutes =
    Number.isInteger(minutes)
      ? minutes
      : Number.parseInt(
          minutes,
          10
        );

  const expiryMinutes =
    Math.min(
      Math.max(
        safeMinutes || 10,
        1
      ),
      30
    );

  const now = Date.now();
  return new Date(
    now + (expiryMinutes * 60 * 1000)
  );
}

async function checkDuplicateAudienceBooking(connection, userId, bookingId) {

  if (!userId || !bookingId) {
    throw new Error(
      "User ID and Booking ID are required"
    );
  }

  /* ==========================
     CHECK PENDING BOOKINGS
  ========================== */
  const [pending] =
    await connection.query(
      `
      SELECT
        id,
        status,
        expires_at
      FROM pending_audience_bookings
      WHERE
        user_id = ?
        AND booking_id = ?
        AND status IN (
          'pending',
          'processing'
        )
        AND expires_at > NOW()
      LIMIT 1
      `,
      [
        userId,
        bookingId
      ]
    );

  if (pending.length) {
    return {
      exists: true,
      source: "pending",
      // Pending booking ID
      bookingId: pending[0].id,
      status: pending[0].status,
      expiresAt: pending[0].expires_at,
      reason: "ACTIVE_PENDING_EXISTS"
    };
  }

  /* ==========================
     CHECK CONFIRMED BOOKINGS
  ========================== */
  const [confirmed] =
    await connection.query(
      `
      SELECT
        audience_booking_id,
        status,
        payment_status
      FROM audience_bookings
      WHERE
        user_id = ?
        AND booking_id = ?
        AND status NOT IN (
          'cancelled'
        )
      LIMIT 1
      `,
      [
        userId,
        bookingId
      ]
    );

  if (confirmed.length) {
    return {
      exists: true,
      source: "confirmed",
      bookingId: confirmed[0].audience_booking_id,
      status: confirmed[0].status,
      paymentStatus: confirmed[0].payment_status,
      reason: "BOOKING_ALREADY_EXISTS"
    };
  }

  /* ==========================
     NO DUPLICATE
  ========================== */
  return {
    exists: false,
    source: null,
    bookingId: null,
    status: null,
    paymentStatus: null,
    expiresAt: null,
    reason: null
  };
}

/*-------------- FETCH ACTIVE AUDIENCE EVENT --------------------*/
async function getAudienceEvent(connection, bookingId) {

  if (!bookingId) {
    throw new Error("Booking ID is required");
  }

  const [rows] = await connection.query(
    `
    SELECT
      b.booking_id,
      b.event_type,
      b.event_date,
      b.event_time,
      b.assigned_address,
      b.status,

      e.audience_ticket_price,
      e.audience_capacity,
      e.audience_booked,
      e.audience_booking_enabled,
      e.audience_booking_open

    FROM bookings b

    INNER JOIN event_settings e
      ON b.booking_id = e.booking_id

    WHERE
      b.booking_id = ?
      AND b.status = 'confirmed'

    LIMIT 1
    FOR UPDATE
    `,
    [bookingId]
  );

  if (!rows.length) {
    return {
      success: false,
      code: "EVENT_NOT_FOUND",
      message: "Audience event not found."
    };
  }

  const event = rows[0];

  if (!Number(event.audience_booking_enabled)) {
    return {
      success: false,
      code: "BOOKING_DISABLED",
      message: "Audience booking is disabled."
    };
  }

  if (!Number(event.audience_booking_open)) {
    return {
      success: false,
      code: "BOOKING_CLOSED",
      message: "Audience booking is closed."
    };
  }

  const capacity = Math.max(
    0,
    Number(event.audience_capacity) || 0
  );

  const booked = Math.max(
    0,
    Number(event.audience_booked) || 0
  );

  const availableSeats = Math.max(
    0,
    capacity - booked
  );

  if (availableSeats <= 0) {
    return {
      success: false,
      code: "EVENT_FULL",
      message: "Audience booking is full."
    };
  }

  return {
    success: true,
    event: {
      bookingId: event.booking_id,
      eventType: event.event_type,
      eventDate: event.event_date,
      eventTime: event.event_time,
      address: event.assigned_address,

      ticketPrice: Number(event.audience_ticket_price) || 0,

      capacity,
      bookedSeats: booked,
      availableSeats
    }
  };
}

/* Format audience booking response */
function formatAudienceResponse(data = {}) {
  let audienceData = {};

  try {
    audienceData =
      typeof data.audience_data ===
      "string"
        ? JSON.parse(
            data.audience_data
          )
        : (
            data.audience_data ||
            {}
          );
  }
  catch {
    audienceData = {};
  }

  return {
    audienceBookingId:
      data.audience_booking_id || null,

    pendingId:
      data.id || null,

    bookingId:
      data.booking_id || null,

    userId:
      data.user_id || null,

    event: {
      type:
        data.event_type || null,

      category:
        data.event_category || null,

      date:
        data.event_date
          ? new Date(data.event_date)
              .toISOString()
              .split("T")[0]
          : null,

      time:
        data.event_time || null
    },

    customer: {
      fullName:
        data.full_name || null,

      email:
        data.email || null,

      phone:
        data.phone || null
    },

    audience: {
      count:
        Number(
          data.audience_count
        ) || 0,

      details: audienceData
    },

    pricing: {
      ticketPrice:
        Number(
          data.ticket_price
        ) || 0,

      total:
        Number(
          data.total
        ) || 0,

      currency:
        data.currency
        || "INR"
    },

    payment: {
      status:
        data.payment_status || "pending"
    },

    status:
      data.status || "pending",

    expiresAt:
      data.expires_at
        ? new Date(
            data.expires_at
          )
            .toISOString()
        : null,

    createdAt:
      data.created_at
        ? new Date(
            data.created_at
          )
            .toISOString()
        : null,

    updatedAt:
      data.updated_at
        ? new Date(
            data.updated_at
          )
            .toISOString()
        : null
  };
}

/* TICKET VALIDATORS */
function validateAudienceBookingId(audienceBookingId) {
  if (typeof audienceBookingId !== "string") {
    return false;
  }

  return /^AUD\d{6}$/.test(
    audienceBookingId.trim()
  );
}

function validateTicketStatus(status) {
  if (typeof status !== "string") {
    return false;
  }

  return [
    "confirmed",
    "completed",
    "cancelled"
  ].includes(
    status.trim().toLowerCase()
  );
}

module.exports = {
  generatePendingAudienceId,
  generateAudienceBookingId,
  normalizeAudienceData,
  validateAudienceBooking,
  calculateAudiencePrice,
  calculateExpiry,
  buildAudienceExtras,
  checkDuplicateAudienceBooking,
  getAudienceEvent,
  formatAudienceResponse,
  validateAudienceBookingId,
  validateTicketStatus
};