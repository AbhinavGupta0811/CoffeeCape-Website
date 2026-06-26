/* =====================================================
   BOOKING EVENT CONFIG
===================================================== */
const BOOKING_EVENT_CONFIG = {

  dinner: {
    extras: [
      "diningType",
      "seatingPreference",
      "specialRequest"
    ]
  },

  karaoke: {
    extras: [
      "teamName",
      "songCategory",
      "songRequest"
    ]
  },

  openmic: {
    extras: [
      "performanceType",
      "duration",
      "portfolioLink",
      "description"
    ]
  },

  tasting: {
    extras: [
      "packageType",
      "dietPreference",
      "notes"
    ]
  },

  get: {
    extras: [
      "groupName",
      "djRequired",
      "gamesArrangement",
      "notes"
    ]
  },

  private: {
    extras: [
      "djRequired",
      "customCakeRequired",
      "cateringType",
      "notes"
    ]
  }

};

/* =====================================================
   CORE BOOKING DATA
===================================================== */
function extractCoreBooking(data = {}) {

  return {

    event_type:
      data.eventType || null,

    event_category:
      data.eventCategory || null,

    event_date:
      data.eventDate ||
      data.reservationDate ||
      null,

    event_time:
      data.eventTime || null,

    guest_count:
      Number(
        data.guestCount ||
        data.participants ||
        1
      ),

    full_name:
      data.fullName || null,

    email:
      data.email || null,

    phone:
      data.phone || null,

    total:
      Number(data.total) || 0

  };

}

/* =====================================================
   EVENT SPECIFIC EXTRAS
===================================================== */
function buildBookingExtras(
  eventType,
  data = {}
) {

  const config =
    BOOKING_EVENT_CONFIG[eventType];

  if (!config) {
    return {};
  }

  const extras = {};

  config.extras.forEach(field => {

    if (
      data[field] !== undefined &&
      data[field] !== null &&
      data[field] !== ""
    ) {
      extras[field] = data[field];
    }

  });

  return extras;

}

/* =====================================================
   SAFE PARSE BOOKING DATA
===================================================== */
function safeParseBookingData(value) {

  try {

    if (!value) {
      return {};
    }

    return typeof value === "string"
      ? JSON.parse(value)
      : value;

  }

  catch {

    return {};

  }

}

/* =====================================================
   FORMAT BOOKING RESPONSE
===================================================== */
function formatBookingResponse(
  booking = {}
) {

  return {

    ...booking,

    booking_data:
      safeParseBookingData(
        booking.booking_data
      )

  };

}

/* =====================================================
   EXPORTS
===================================================== */
module.exports = {
  BOOKING_EVENT_CONFIG,
  formatBookingResponse,
  extractCoreBooking,
  buildBookingExtras
};