/* ======================================================
   BOOKING SOCKET SERVICE
   Centralized Booking Event Emitter
====================================================== */

const BOOKING_EVENT = "bookingUpdated";

/* ======================================================
   BUILD SAFE PAYLOAD
====================================================== */

function buildBookingPayload(data = {}) {
  return {
    bookingId: data.bookingId || null,

    userId: data.userId || null,

    status: data.status || null,

    payment_status:
      data.payment_status || null,

    assigned_address:
      data.assigned_address || null,

    cancelled_by:
      data.cancelled_by || null,

    paid_amount:
      Number(data.paid_amount) || 0,

    timestamp:
      data.timestamp ||
      new Date().toISOString(),

    version: 1
  };
}

/* ======================================================
   EMIT BOOKING UPDATE
====================================================== */

function emitBookingUpdate(io, booking = {}) {

  if (!io) {
    console.warn(
      "[Booking Socket] io unavailable"
    );
    return;
  }

  const payload =
    buildBookingPayload(
      booking
    );

  /* ==========================
     USER ROOM
  ========================== */

  if (payload.userId) {

    io.to(
      `user_${payload.userId}`
    ).emit(
      BOOKING_EVENT,
      payload
    );

  }

  /* ==========================
     ADMIN ROOM
  ========================== */

  io.to(
    "admin_room"
  ).emit(
    BOOKING_EVENT,
    payload
  );

}

/* ======================================================
   DEVELOPMENT LOGGER
====================================================== */

function logBookingSocket(data = {}) {

  console.log(
    "\n=============================="
  );

  console.log(
    "BOOKING SOCKET EVENT"
  );

  console.log(
    "Booking:",
    data.bookingId
  );

  console.log(
    "User:",
    data.userId
  );

  console.log(
    "Status:",
    data.status
  );

  console.log(
    "Payment:",
    data.payment_status
  );

  console.log(
    "Time:",
    data.timestamp
  );

  console.log(
    "==============================\n"
  );

}

/* ======================================================
   SAFE EMITTER
====================================================== */

function sendBookingUpdate(
  io,
  booking
) {

  const payload =
    buildBookingPayload(
      booking
    );

  logBookingSocket(
    payload
  );

  emitBookingUpdate(
    io,
    payload
  );

}

/* ======================================================
   EXPORTS
====================================================== */

module.exports = {

  BOOKING_EVENT,

  buildBookingPayload,

  emitBookingUpdate,

  sendBookingUpdate

};