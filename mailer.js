const nodemailer = require("nodemailer");

/* =====================================================
   ENVIRONMENT VALIDATION
===================================================== */
if (!process.env.MAIL_USER || !process.env.MAIL_PASS) {
  console.warn("⚠️  MAIL_USER or MAIL_PASS not defined in environment variables");
}

/* =====================================================
   TRANSPORT CONFIGURATION (GMAIL SMTP)
===================================================== */
const transporter = nodemailer.createTransport({
  host:   "smtp.gmail.com",
  port:   587,
  secure: false, // STARTTLS on port 587

  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  },

  // Enforce TLS — rejects connections that downgrade to plaintext
  requireTLS: true,

  tls: {
    // Reject self-signed or invalid TLS certificates
    rejectUnauthorized: true,
    minVersion: "TLSv1.2"
  }
});

/* =====================================================
   VERIFY CONNECTION (DEV ONLY)
===================================================== */
if (process.env.NODE_ENV !== "production") {
  transporter.verify((err) => {
    if (err) {
      console.error("❌ SMTP Connection Error:", err.message);
    } else {
      console.log("✅ SMTP Server Ready");
    }
  });
}

/* =====================================================
   SECURITY HELPERS
===================================================== */
/**
 * escapeHTML — prevents XSS in all HTML email templates.
 * Must be applied to every user-supplied string before
 * interpolating it into an HTML template.
 */
function escapeHTML(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;")
    .replace(/'/g,  "&#x27;")
    .replace(/\//g, "&#x2F;");
}

/**
 * sanitizeMailHeader — prevents CRLF header injection.
 * Must be applied to every value that goes into `to` or `subject`.
 * Strips carriage returns, newlines, and null bytes that could
 * be used to inject extra mail headers.
 */
function sanitizeMailHeader(value) {
  if (!value) return "";
  return String(value)
    .replace(/[\r\n\0]/g, "")
    .trim()
    .slice(0, 500); // hard cap — prevents absurdly long headers
}

/* =====================================================
   SAFE MAIL WRAPPER
===================================================== */
async function safeSendMail(options) {
  try {
    // Sanitize headers on every outbound mail
    const sanitizedOptions = {
      ...options,
      from: `"CoffeeCape Support" <${process.env.MAIL_USER}>`,
      to:      sanitizeMailHeader(options.to),
      subject: sanitizeMailHeader(options.subject)
    };

    const info = await transporter.sendMail(sanitizedOptions);
    return { success: true, info };
  } catch (error) {
    // Never log the full error object — it may contain SMTP credentials
    console.error("📧 Mail Error:", error.message);
    return { success: false, error };
  }
}

/* =====================================================
   EMAIL VERIFICATION OTP TEMPLATE
   Separate from password-reset OTP — different intent,
   different subject line, different body copy.
===================================================== */
function generateVerificationOtpTemplate(otp) {
  // OTP itself is numeric — no escaping needed, but we enforce it anyway
  const safeOtp = escapeHTML(String(otp));

  return {
    html: `
      <div style="
        font-family:Arial, sans-serif;
        max-width:500px;
        margin:auto;
        padding:20px;
        border:1px solid #eee;
        border-radius:10px;
      ">
        <h2 style="color:#2c7a7b;text-align:center;">
          CoffeeCape Email Verification
        </h2>

        <p>Use the OTP below to verify your email address:</p>

        <h1 style="
          text-align:center;
          letter-spacing:6px;
          background:#f5f7fa;
          padding:15px;
          border-radius:8px;
        ">
          ${safeOtp}
        </h1>

        <p style="color:#555;">
          This OTP is valid for <strong>10 minutes</strong>.
        </p>

        <hr>

        <p style="font-size:12px;color:#888;">
          If you did not create a CoffeeCape account, please ignore this email.
        </p>
      </div>
    `,
    text: `Your CoffeeCape email verification OTP is: ${safeOtp}\n\nValid for 10 minutes.\n\nIf you did not request this, ignore this email.`
  };
}

/* =====================================================
   PASSWORD RESET OTP TEMPLATE
===================================================== */
function generatePasswordResetOtpTemplate(otp) {
  const safeOtp = escapeHTML(String(otp));

  return {
    html: `
      <div style="
        font-family:Arial, sans-serif;
        max-width:500px;
        margin:auto;
        padding:20px;
        border:1px solid #eee;
        border-radius:10px;
      ">
        <h2 style="color:#2c7a7b;text-align:center;">
          CoffeeCape Password Reset
        </h2>

        <p>Your One-Time Password (OTP) is:</p>

        <h1 style="
          text-align:center;
          letter-spacing:6px;
          background:#f5f7fa;
          padding:15px;
          border-radius:8px;
        ">
          ${safeOtp}
        </h1>

        <p style="color:#555;">
          This OTP is valid for <strong>10 minutes</strong>.
        </p>

        <hr>

        <p style="font-size:12px;color:#888;">
          If you did not request a password reset, please ignore this email.
        </p>
      </div>
    `,
    text: `Your CoffeeCape password reset OTP is: ${safeOtp}\n\nValid for 10 minutes.\n\nIf you did not request this, ignore this email.`
  };
}

/* =====================================================
   SEND EMAIL VERIFICATION OTP
===================================================== */
async function sendOtpVerifiedMail(to, otp) {
  // Never log OTP — it is a credential
  const template = generateVerificationOtpTemplate(otp);
  return safeSendMail({
    to,
    subject: "🔐 Email Verification OTP - CoffeeCape",
    html:    template.html,
    text:    template.text
  });
}

/* =====================================================
   SEND PASSWORD RESET OTP
===================================================== */
async function sendOtpMail(to, otp) {
  // Never log OTP — it is a credential
  const template = generatePasswordResetOtpTemplate(otp);
  return safeSendMail({
    to,
    subject: "🔐 Password Reset OTP - CoffeeCape",
    html:    template.html,
    text:    template.text
  });
}

/* =====================================================
   CONTACT → ADMIN MAIL
===================================================== */
async function sendContactToAdmin({ name, email, subject, message }) {
  // Escape all user-supplied fields before HTML interpolation
  const safeName    = escapeHTML(name);
  const safeEmail   = escapeHTML(email);
  const safeSubject = escapeHTML(subject);
  const safeMessage = escapeHTML(message);

  return safeSendMail({
    to:      process.env.ADMIN_EMAIL,
    subject: `📩 New Contact Message: ${sanitizeMailHeader(subject)}`,
    html: `
      <div style="font-family:Arial;padding:20px">
        <h2 style="color:#2c7a7b;">New Contact Message</h2>

        <p><strong>Name:</strong>    ${safeName}</p>
        <p><strong>Email:</strong>   ${safeEmail}</p>
        <p><strong>Subject:</strong> ${safeSubject}</p>

        <hr>

        <div style="background:#f5f7fa;padding:15px;border-radius:8px;white-space:pre-wrap;">
          ${safeMessage}
        </div>
      </div>
    `,
    text: `New Contact Message\n\nName: ${name}\nEmail: ${email}\nSubject: ${subject}\n\n${message}`
  });
}

/* =====================================================
   CONTACT CONFIRMATION → USER
===================================================== */
async function sendContactConfirmation({ name, email, message }) {
  const safeName    = escapeHTML(name);
  const safeMessage = escapeHTML(message);

  return safeSendMail({
    to:      email,
    subject: "✅ We received your message - CoffeeCape",
    html: `
      <div style="
        font-family:Arial;
        max-width:500px;
        margin:auto;
        padding:20px;
        border:1px solid #eee;
        border-radius:10px;
      ">
        <h2 style="color:#2c7a7b;">
          Thank You, ${safeName}!
        </h2>

        <p>We have successfully received your message.</p>
        <p>Our support team will get back to you within <strong>24 hours</strong>.</p>

        <hr>

        <p><strong>Your Message:</strong></p>
        <div style="background:#f9fafb;padding:12px;border-radius:8px;white-space:pre-wrap;">
          ${safeMessage}
        </div>

        <br>

        <p style="font-size:13px;color:#666;">
          Regards,<br>
          CoffeeCape Support Team
        </p>
      </div>
    `,
    text: `Hi ${name},\n\nWe received your message:\n\n${message}\n\nWe'll get back to you within 24 hours.\n\nRegards,\nCoffeeCape Support Team`
  });
}

/* =====================================================
   GENERIC MAIL FUNCTION
===================================================== */
async function sendMail({ to, subject, html, text }) {
  return safeSendMail({ to, subject, html, text });
}

/* =====================================================
   PAYMENT BILL TEMPLATE
===================================================== */
function generateBillTemplate(order) {
  const itemsHtml = (order.items || []).map(item => `
    <tr>
      <td style="padding:8px 0;">${escapeHTML(item.name)}</td>
      <td style="text-align:center;">${escapeHTML(String(item.qty))}</td>
      <td style="text-align:right;">₹${Number(item.price).toFixed(2)}</td>
      <td style="text-align:right;">
        ₹${(Number(item.price) * Number(item.qty)).toFixed(2)}
      </td>
    </tr>
  `).join("");

  const itemsText = (order.items || [])
    .map(i => `  ${i.name} x${i.qty} — ₹${(Number(i.price) * Number(i.qty)).toFixed(2)}`)
    .join("\n");

  const html = `
    <div style="font-family:Arial;max-width:700px;margin:auto;padding:20px;border:1px solid #eee;border-radius:12px;">
      <h2 style="color:#2c7a7b;text-align:center;">
        🧾 CoffeeCape Payment Receipt
      </h2>

      <hr>
      <p><strong>Order ID:</strong>          ${escapeHTML(order.order_id)}</p>
      <p><strong>Customer Name:</strong>     ${escapeHTML(order.name)}</p>
      <p><strong>Phone:</strong>             ${escapeHTML(order.phone)}</p>
      <p><strong>Delivery Address:</strong>  ${escapeHTML(order.address)}</p>
      <p><strong>Order Date:</strong>        ${new Date(order.created_at).toLocaleString()}</p>
      <hr>

      <h3 style="margin-bottom:10px;">🛒 Order Items</h3>
      <table width="100%" style="border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:1px solid #ddd;">
            <th align="left">Item</th>
            <th align="center">Qty</th>
            <th align="right">Price</th>
            <th align="right">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>
      <hr>

      <h3>💰 Price Breakdown</h3>
      <p>Subtotal:      ₹${Number(order.subtotal).toFixed(2)}</p>
      <p>GST (5%):      ₹${Number(order.gst).toFixed(2)}</p>
      <p>Delivery Fee:  ₹${Number(order.delivery_fee).toFixed(2)}</p>
      <p>Platform Fee:  ₹${Number(order.platform_fee).toFixed(2)}</p>
      <p>Packing Fee:   ₹${Number(order.packing_fee).toFixed(2)}</p>
      <p>Tip:           ₹${Number(order.tip).toFixed(2)}</p>
      <p>Discount:      ₹${Number(order.discount).toFixed(2)}</p>

      <h3 style="color:#2c7a7b;">
        Grand Total: ₹${Number(order.total).toFixed(2)}
      </h3>

      <hr>
      <p><strong>Payment Method:</strong> ${escapeHTML(order.payment_method)}</p>
      <p><strong>Payment Status:</strong> Paid ✅</p>
      <hr>

      <p style="color:#666;">
        Thank you for ordering with CoffeeCape ☕<br>
        We hope to serve you again soon!
      </p>
    </div>
  `;

  const text = `
    CoffeeCape Payment Receipt
    ==========================
    Order ID:        ${order.order_id}
    Customer Name:   ${order.name}
    Phone:           ${order.phone}
    Address:         ${order.address}
    Date:            ${new Date(order.created_at).toLocaleString()}

    Items:
    ${itemsText}

    Price Breakdown:
      Subtotal:     ₹${Number(order.subtotal).toFixed(2)}
      GST:          ₹${Number(order.gst).toFixed(2)}
      Delivery Fee: ₹${Number(order.delivery_fee).toFixed(2)}
      Platform Fee: ₹${Number(order.platform_fee).toFixed(2)}
      Packing Fee:  ₹${Number(order.packing_fee).toFixed(2)}
      Tip:          ₹${Number(order.tip).toFixed(2)}
      Discount:     ₹${Number(order.discount).toFixed(2)}
      Grand Total:  ₹${Number(order.total).toFixed(2)}

    Payment Method: ${order.payment_method}
    Payment Status: Paid

    Thank you for ordering with CoffeeCape!
  `.trim();

  return { html, text };
}

/* =====================================================
   SEND PAYMENT BILL
===================================================== */
async function sendPaymentBill(userEmail, order) {
  const template = generateBillTemplate(order);
  return safeSendMail({
    to:      userEmail,
    subject: `🧾 Your CoffeeCape Receipt - Order: ${sanitizeMailHeader(order.order_id)}`,
    html:    template.html,
    text:    template.text
  });
}

/* =====================================================
   BOOKING PAYMENT BILL TEMPLATE
===================================================== */
function generateBookingBillTemplate(booking) {
  const html = `
    <div style="font-family:Arial;max-width:700px;margin:auto;padding:20px;border:1px solid #eee;border-radius:12px;">
      <h2 style="color:#2c7a7b;text-align:center;">
        📅 CoffeeCape Booking Receipt
      </h2>

      <hr>
      <p><strong>Booking ID:</strong>       ${escapeHTML(booking.booking_id)}</p>
      <p><strong>Customer Name:</strong>    ${escapeHTML(booking.full_name)}</p>
      <p><strong>Phone:</strong>            ${escapeHTML(booking.phone)}</p>
      <p><strong>Email:</strong>            ${escapeHTML(booking.email)}</p>
      <hr>

      <h3>📍 Booking Details</h3>
      <p><strong>Event Date:</strong>       ${new Date(booking.event_date).toDateString()}</p>
      <p><strong>Time Slot:</strong>        ${escapeHTML(booking.event_time)}</p>
      <p><strong>Event Type:</strong>       ${escapeHTML(booking.event_type)}</p>
      <p><strong>No. of Guests:</strong>    ${escapeHTML(String(booking.guestCount))}</p>
      <p><strong>Special Request:</strong>  ${escapeHTML(booking.specialRequest || "None")}</p>

      <hr>
      <h3>💰 Payment Breakdown</h3>
      <p>Total Amount:     ₹${Number(booking.total).toFixed(2)}</p>
      <p>Amount Paid:      ₹${Number(booking.paid_amount).toFixed(2)}</p>
      <p>Remaining Amount: ₹${(Number(booking.total) - Number(booking.paid_amount)).toFixed(2)}</p>
      <hr>

      <p><strong>Payment Method:</strong> ${escapeHTML(booking.payment_method)}</p>
      <p><strong>Payment Status:</strong> ${escapeHTML(booking.payment_status)}</p>
      <p><strong>Booking Status:</strong> ${escapeHTML(booking.status)}</p>
      <hr>

      <p style="color:#666;">
        🎉 Your booking is confirmed at CoffeeCape!<br>
        We look forward to hosting you.<br><br>
        For any assistance, contact our support team.
      </p>
    </div>
  `;

  const text = `
    CoffeeCape Booking Receipt
    ==========================
    Booking ID:    ${booking.booking_id}
    Customer:      ${booking.full_name}
    Phone:         ${booking.phone}
    Email:         ${booking.email}

    Event Date:    ${new Date(booking.event_date).toDateString()}
    Time Slot:     ${booking.event_time}
    Event Type:    ${booking.event_type}
    Guests:        ${booking.guestCount}
    Special Request: ${booking.specialRequest || "None"}

    Total Amount:     ₹${Number(booking.total).toFixed(2)}
    Amount Paid:      ₹${Number(booking.paid_amount).toFixed(2)}
    Remaining Amount: ₹${(Number(booking.total) - Number(booking.paid_amount)).toFixed(2)}

    Payment Method: ${booking.payment_method}
    Payment Status: ${booking.payment_status}
    Booking Status: ${booking.status}

    Your booking is confirmed. We look forward to hosting you!
  `.trim();

  return { html, text };
}

/* =====================================================
   SEND BOOKING RECEIPT
===================================================== */
async function sendBookingPaymentBill(userEmail, booking) {
  const template = generateBookingBillTemplate(booking);
  return safeSendMail({
    to:      userEmail,
    subject: `📅 Your CoffeeCape Booking Receipt - Booking: ${sanitizeMailHeader(booking.booking_id)}`,
    html:    template.html,
    text:    template.text
  });
}

/* =====================================================
   BOOKING CONFIRMED TEMPLATE (WITH ASSIGNED ADDRESS)
===================================================== */
function generateBookingConfirmedTemplate(booking) {
  const html = `
    <div style="
      font-family:'Segoe UI', Arial, sans-serif;
      background:#f4f6f8;
      padding:30px;
    ">
      <div style="
        max-width:600px;
        margin:auto;
        background:#ffffff;
        border-radius:14px;
        overflow:hidden;
        box-shadow:0 10px 30px rgba(0,0,0,0.08);
      ">

        <!-- HEADER -->
        <div style="
          background:linear-gradient(135deg,#16a34a,#22c55e);
          color:#fff;
          padding:25px;
          text-align:center;
        ">
          <h1 style="margin:0;">🎉 Booking Confirmed</h1>
          <p style="margin:5px 0 0;">CoffeeCape</p>
        </div>

        <!-- BODY -->
        <div style="padding:25px;">

          <h2 style="color:#16a34a;">
            Your Booking is Successfully Confirmed!
          </h2>

          <p>
            Hi <strong>${escapeHTML(booking.full_name || "Guest")}</strong>,
          </p>

          <p>
            Great news! Your booking has been <b>confirmed</b>.
            Here are your final details:
          </p>

          <!-- DETAILS CARD -->
          <div style="
            background:#f9fafb;
            border-radius:10px;
            padding:18px;
            margin:20px 0;
            border:1px solid #eee;
          ">
            <p><strong>📌 Booking ID:</strong>   ${escapeHTML(booking.booking_id)}</p>
            <p><strong>📅 Event Date:</strong>   ${new Date(booking.event_date).toDateString()}</p>
            <p><strong>⏰ Time:</strong>          ${escapeHTML(booking.event_time)}</p>

            <p style="color:#dc2626;">
              <strong>📍 Assigned Address:</strong><br>
              ${escapeHTML(booking.assigned_address)}
            </p>
          </div>

          <!-- CTA -->
          <div style="text-align:center;margin:25px 0;">
            <a href="#" style="
              background:#16a34a;
              color:#fff;
              padding:12px 20px;
              border-radius:8px;
              text-decoration:none;
            ">
              View Booking Details
            </a>
          </div>

          <p style="font-size:13px;color:#666;">
            Please arrive on time. We look forward to hosting you ☕
          </p>

        </div>

        <!-- FOOTER -->
        <div style="
          background:#f1f5f9;
          padding:15px;
          text-align:center;
          font-size:12px;
          color:#777;
        ">
          © ${new Date().getFullYear()} CoffeeCape
        </div>

      </div>
    </div>
  `;

  const text = `
    Booking Confirmed — CoffeeCape
    ===============================
    Hi ${booking.full_name || "Guest"},

    Your booking has been confirmed!

    Booking ID:       ${booking.booking_id}
    Event Date:       ${new Date(booking.event_date).toDateString()}
    Time:             ${booking.event_time}
    Assigned Address: ${booking.assigned_address}

    Please arrive on time. We look forward to hosting you!

    © ${new Date().getFullYear()} CoffeeCape
  `.trim();

  return { html, text };
}

/* =====================================================
   REVIEW THANK YOU TEMPLATE
===================================================== */
function generateReviewThankYouTemplate(name, rating) {
  const safeName   = escapeHTML(name);
  const safeRating = Math.min(Math.max(parseInt(rating, 10) || 0, 0), 5);
  const stars      = "⭐".repeat(safeRating);

  const html = `
    <div style="
      font-family:Arial;
      max-width:600px;
      margin:auto;
      padding:30px;
      border:1px solid #eee;
      border-radius:12px;
      background:#ffffff;
    ">
      <h2 style="color:#2c7a7b;text-align:center;">
        ☕ Thank You for Your Review!
      </h2>

      <p>Hi <strong>${safeName}</strong>,</p>

      <p>
        We truly appreciate you taking the time to share your experience with
        <strong>CoffeeCape</strong>.
      </p>

      <p style="font-size:18px;">
        <strong>Your Rating:</strong> ${stars}
      </p>

      <p>
        Your feedback helps us improve and continue serving amazing coffee moments.
      </p>

      <hr style="margin:25px 0">

      <p style="font-size:13px;color:#777;text-align:center;">
        With gratitude,<br>
        CoffeeCape Team ☕
      </p>
    </div>
  `;

  const text = `Hi ${name},\n\nThank you for your review!\nYour rating: ${"★".repeat(safeRating)}\n\nWe appreciate your feedback!\n\nCoffeeCape Team`;

  return { html, text };
}

/* =====================================================
   SEND REVIEW THANK YOU MAIL
===================================================== */
async function sendReviewThankYouMail(to, name, rating) {
  const template = generateReviewThankYouTemplate(name, rating);
  return safeSendMail({
    to,
    subject: "☕ Thank You for Your CoffeeCape Review!",
    html:    template.html,
    text:    template.text
  });
}

/* =====================================================
   AUDIENCE PAYMENT ACKNOWLEDGEMENT TEMPLATE
===================================================== */
function generateAudiencePaymentTemplate(booking) {
  const html = `
    <div style="
      font-family:Arial;
      max-width:650px;
      margin:auto;
      padding:25px;
      border:1px solid #eee;
      border-radius:10px;
    ">

      <h2 style="color:#16a34a;text-align:center;">
        🎉 Audience Booking Confirmed
      </h2>

      <p>Hi <strong>${escapeHTML(booking.full_name)}</strong>,</p>

      <p>
        Your audience booking has been successfully confirmed.
      </p>

      <hr>

      <p><strong>Booking ID:</strong> ${escapeHTML(booking.audience_booking_id)}</p>
      <p><strong>Event:</strong> ${escapeHTML(booking.event_type)}</p>
      <p><strong>Category:</strong> ${escapeHTML(booking.event_category)}</p>
      <p><strong>Date:</strong> ${new Date(booking.event_date).toDateString()}</p>
      <p><strong>Time:</strong> ${escapeHTML(booking.event_time)}</p>
      <p><strong>Audience:</strong> ${booking.audience_count}</p>

      <hr>

      <h3 style="color:#16a34a">
        Payment Details
      </h3>

      <p><strong>Ticket Price:</strong> ₹${Number(booking.ticket_price).toFixed(2)}</p>
      <p><strong>Total Paid:</strong> ₹${Number(booking.total).toFixed(2)}</p>
      <p><strong>Payment Status:</strong> Paid ✅</p>

      <hr>

      <p style="color:#666">
        Please carry this email or your booking ID while attending the event.
      </p>

      <p>
        Thank you for choosing CoffeeCape.
      </p>

    </div>
  `;

  const text = `
    Audience Booking Confirmed
    Booking ID: ${booking.audience_booking_id}
    Event: ${booking.event_type}
    Category: ${booking.event_category}
    Date: ${new Date(booking.event_date).toDateString()}
    Time: ${booking.event_time}
    Audience: ${booking.audience_count}
    Ticket Price: ₹${booking.ticket_price}
    Total Paid: ₹${booking.total}
    Payment Status: Paid
    Thank you for choosing CoffeeCape.
  `;

  return { html, text };
}


/* =====================================================
   SEND AUDIENCE PAYMENT ACKNOWLEDGEMENT
===================================================== */
async function sendAudiencePaymentMail(email, booking){
  const template = generateAudiencePaymentTemplate(booking);
  return safeSendMail({
    to: email,

    subject: `🎟 Audience Booking Confirmed - ${sanitizeMailHeader(
      booking.audience_booking_id
    )}`,
    html: template.html,
    text: template.text
  });
}

/* =====================================================
   EXPORTS
===================================================== */
module.exports = {
  sendOtpMail,
  sendOtpVerifiedMail,
  sendContactToAdmin,
  sendContactConfirmation,
  sendMail,
  sendPaymentBill,
  sendBookingPaymentBill,
  generateBookingConfirmedTemplate,
  sendReviewThankYouMail,
  sendAudiencePaymentMail,
  // Exported for use in other modules that build custom templates
  escapeHTML,
  sanitizeMailHeader
};