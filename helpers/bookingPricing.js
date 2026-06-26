/* =====================================================
   BOOKING PRICING ENGINE
===================================================== */
const EVENT_PRICING = {

  dinner: {
    base: 4999,
    perGuest: 350
  },

  karaoke: {
    base: 2499,
    perGuest: 200
  },

  openmic: {
    base: 999,
    perGuest: 0
  },

  tasting: {
    base: 2499,
    perGuest: 400
  },

  get: {
    base: 2499,
    perGuest: 250
  },

  private: {
    base: 3999,
    perGuest: 450
  }

};

const ADDON_PRICING = {

  djRequired: 1500,

  gamesArrangement: 800,

  customCakeRequired: 1200

};

const GST_PERCENT = 18;

/* ============================================
   SAFE NUMBER
============================================ */
function safeNumber(value) {

  const num = Number(value);

  if (
    Number.isNaN(num) ||
    num < 0
  ) {
    return 0;
  }

  return num;
}

/* ============================================
   SAFE YES/NO
============================================ */
function isEnabled(value) {

  return (
    String(value).toLowerCase() === "yes"
  );

}

/* ============================================
   CALCULATE BOOKING PRICE
============================================ */
function calculateBookingPrice(
  eventType,
  bookingData = {}
) {

  const config =
    EVENT_PRICING[eventType];

  if (!config) {
    throw new Error(
      "Invalid event type"
    );
  }

  const guests = Math.max(
    safeNumber(
      bookingData.guestCount ||
      bookingData.participants
    ),
    0
  );

  /* Base */

  const basePrice =
    config.base;

  /* Guest Charges */

  const guestCharges =
    guests *
    config.perGuest;

  /* Addons */

  let addonTotal = 0;

  const addonBreakdown = {};

  Object.entries(
    ADDON_PRICING
  ).forEach(([key, price]) => {

    if (
      isEnabled(
        bookingData[key]
      )
    ) {

      addonTotal += price;

      addonBreakdown[key] =
        price;
    }

  });

  /* Subtotal */

  const subtotal =
    basePrice +
    guestCharges +
    addonTotal;

  /* GST */

  const gst =
    Number(
      (
        subtotal *
        GST_PERCENT /
        100
      ).toFixed(2)
    );

  /* Total */

  const total =
    Number(
      (
        subtotal +
        gst
      ).toFixed(2)
    );

  return {

    eventType,

    guests,

    basePrice,

    guestCharges,

    addonBreakdown,

    addonTotal,

    subtotal,

    gstPercent:
      GST_PERCENT,

    gst,

    total
  };
}

module.exports = {
  EVENT_PRICING,
  ADDON_PRICING,
  GST_PERCENT,
  calculateBookingPrice
};