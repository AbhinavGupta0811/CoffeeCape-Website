const nodemailer = require("nodemailer");

/* =====================================================
   ENVIRONMENT VALIDATION
===================================================== */
if (!process.env.MAIL_USER || !process.env.MAIL_PASS) {
  console.warn("⚠ MAIL_USER or MAIL_PASS not defined in environment variables");
}

/* =====================================================
   TRANSPORT CONFIGURATION (GMAIL SMTP)
===================================================== */
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
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
   SAFE MAIL WRAPPER
===================================================== */
async function safeSendMail(options) {
  try {
    const info = await transporter.sendMail({
      from: `"CoffeeCape Support" <${process.env.MAIL_USER}>`,
      ...options
    });

    return { success: true, info };
  } catch (error) {
    console.error("📧 Mail Error:", error.message);
    return { success: false, error };
  }
}

/* =====================================================
   Verification OTP EMAIL TEMPLATE
===================================================== */
function generateOtpTemplate(otp) {
  return `
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
        ${otp}
      </h1>

      <p style="color:#555;">
        This OTP is valid for <strong>10 minutes</strong>.
      </p>

      <hr>

      <p style="font-size:12px;color:#888;">
        If you did not request this, please ignore this email.
      </p>
    </div>
  `;
}

/* =====================================================
   SEND OTP MAIL
===================================================== */
async function sendOtpVerifiedMail(to, otp) {
  return safeSendMail({
    to,
    subject: "🔐 Email Verification OTP",
    html: generateOtpTemplate(otp)
  });
}

/* =====================================================
   Reset OTP EMAIL TEMPLATE
===================================================== */
function generateOtpTemplate(otp) {
  return `
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
        ${otp}
      </h1>

      <p style="color:#555;">
        This OTP is valid for <strong>10 minutes</strong>.
      </p>

      <hr>

      <p style="font-size:12px;color:#888;">
        If you did not request this, please ignore this email.
      </p>
    </div>
  `;
}

/* =====================================================
   SEND OTP MAIL
===================================================== */
async function sendOtpMail(to, otp) {
  return safeSendMail({
    to,
    subject: "🔐 Password Reset OTP",
    html: generateOtpTemplate(otp)
  });
}

/* =====================================================
   CONTACT → ADMIN MAIL
===================================================== */
async function sendContactToAdmin({ name, email, subject, message }) {
  return safeSendMail({
    to: process.env.ADMIN_EMAIL,
    subject: `📩 New Contact Message: ${subject}`,
    html: `
      <div style="font-family:Arial;padding:20px">
        <h2 style="color:#2c7a7b;">New Contact Message</h2>

        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Subject:</strong> ${subject}</p>

        <hr>

        <div style="background:#f5f7fa;padding:15px;border-radius:8px;">
          ${message}
        </div>
      </div>
    `
  });
}

/* =====================================================
   CONTACT CONFIRMATION → USER
===================================================== */
async function sendContactConfirmation({ name, email, message }) {
  return safeSendMail({
    to: email,
    subject: "✅ We received your message",
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
          Thank You, ${name}!
        </h2>

        <p>We have successfully received your message.</p>
        <p>Our support team will get back to you within <strong>24 hours</strong>.</p>

        <hr>

        <p><strong>Your Message:</strong></p>
        <div style="background:#f9fafb;padding:12px;border-radius:8px;">
          ${message}
        </div>

        <br>

        <p style="font-size:13px;color:#666;">
          Regards,<br>
          CoffeeCape Support Team
        </p>
      </div>
    `
  });
}

/* =====================================================
   GENERIC MAIL FUNCTION
===================================================== */
async function sendMail({ to, subject, html, text }) {
  return safeSendMail({
    to,
    subject,
    html,
    text
  });
}

/* =====================================================
   PAYMENT BILL TEMPLATE
===================================================== */
function generateBillTemplate(order) {

  const itemsHtml = order.items.map(item => `
    <tr>
      <td style="padding:8px 0;">${item.name}</td>
      <td style="text-align:center;">${item.qty}</td>
      <td style="text-align:right;">₹${item.price}</td>
      <td style="text-align:right;">
        ₹${(item.price * item.qty).toFixed(2)}
      </td>
    </tr>
  `).join("");

  return `
    <div style="font-family:Arial;max-width:700px;margin:auto;padding:20px;border:1px solid #eee;border-radius:12px;">
      <h2 style="color:#2c7a7b;text-align:center;">
        🧾 CoffeeCape Payment Receipt
      </h2>

      <hr>
      <p><strong>Order ID:</strong> ${order.order_id}</p>
      <p><strong>Customer Name:</strong> ${order.name}</p>
      <p><strong>Phone:</strong> ${order.phone}</p>
      <p><strong>Delivery Address:</strong> ${order.address}</p>
      <p><strong>Order Date:</strong> ${new Date(order.created_at).toLocaleString()}</p>
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
      <p>Subtotal: ₹${order.subtotal}</p>
      <p>GST (5%): ₹${order.gst}</p>
      <p>Delivery Fee: ₹${order.delivery_fee}</p>
      <p>Platform Fee: ₹${order.platform_fee}</p>
      <p>Packing Fee: ₹${order.packing_fee}</p>
      <p>Tip: ₹${order.tip}</p>
      <p>Discount: ₹${order.discount}</p>

      <h3 style="color:#2c7a7b;">
        Grand Total: ₹${order.total}
      </h3>

      <hr>
      <p><strong>Payment Method:</strong> ${order.payment_method}</p>
      <p><strong>Payment Status:</strong> Paid ✅</p>
      <hr>

      <p style="color:#666;">
        Thank you for ordering with CoffeeCape ☕<br>
        We hope to serve you again soon!
      </p>

    </div>
  `;
}

/* =====================================================
   SEND PAYMENT BILL
===================================================== */
async function sendPaymentBill(userEmail, order) {
  return safeSendMail({
    to: userEmail,
    subject: `🧾 Your CoffeeCape Receipt - Order: ${order.order_id}`,
    html: generateBillTemplate(order)
  });
}

/* =====================================================
   BOOKING PAYMENT BILL TEMPLATE
===================================================== */
function generateBookingBillTemplate(booking) {

  return `
    <div style="font-family:Arial;max-width:700px;margin:auto;padding:20px;border:1px solid #eee;border-radius:12px;">
      <h2 style="color:#2c7a7b;text-align:center;">
        📅 CoffeeCape Booking Receipt
      </h2>

      <hr>
      <p><strong>Booking ID:</strong> ${booking.booking_id}</p>
      <p><strong>Customer Name:</strong> ${booking.full_name}</p>
      <p><strong>Phone:</strong> ${booking.phone}</p>
      <p><strong>Email:</strong> ${booking.email}</p>
      <hr>

      <h3>📍 Booking Details</h3>
      <p><strong>Event Date:</strong> ${new Date(booking.event_date).toDateString()}</p>
      <p><strong>Time Slot:</strong> ${booking.event_time}</p>
      <p><strong>Event Type:</strong> ${booking.event_type}</p>
      <p><strong>No. of Guests:</strong> ${booking.guestCount}</p>
      <p><strong>Special Request:</strong> ${booking.specialRequest || "None"}</p>

      <hr>
      <h3>💰 Payment Breakdown</h3>
      <p>Total Amount: ₹${booking.total}</p>
      <p>Amount Paid: ₹${booking.paid_amount}</p>
      <p>Remaining Amount: ₹${(booking.total - booking.paid_amount).toFixed(2)}</p>
      <hr>

      <p><strong>Payment Method:</strong> ${booking.payment_method}</p>
      <p><strong>Payment Status:</strong> ${booking.payment_status}</p>
      <p><strong>Booking Status:</strong> ${booking.status}</p>
      <hr>

      <p style="color:#666;">
        🎉 Your booking is confirmed at CoffeeCape!<br>
        We look forward to hosting you.<br><br>
        For any assistance, contact our support team.
      </p>

    </div>
  `;
}

/* =====================================================
   SEND BOOKING RECEIPT
===================================================== */
async function sendBookingPaymentBill(userEmail, booking) {
  return safeSendMail({
    to: userEmail,
    subject: `📅 Your CoffeeCape Booking Receipt - Booking: ${booking.booking_id}`,
    html: generateBookingBillTemplate(booking)
  });
}

/* =====================================================
   BOOKING CONFIRMED TEMPLATE (WITH ADDRESS)
===================================================== */
function generateBookingConfirmedTemplate(booking) {
  return `
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
            Hi <strong>${booking.full_name || "Guest"}</strong>,
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
            <p><strong>📌 Booking ID:</strong> ${booking.booking_id}</p>
            <p><strong>📅 Event Date:</strong> ${new Date(booking.event_date).toDateString()}</p>
            <p><strong>⏰ Time:</strong> ${booking.event_time}</p>

            <!-- 🔥 MAIN LINE -->
            <p style="color:#dc2626;">
              <strong>📍 Assigned Address:</strong><br>
              ${booking.assigned_address}
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
}

/* =====================================================
   REVIEW THANK YOU TEMPLATE
===================================================== */
function generateReviewThankYouTemplate(name, rating) {
  return `
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

      <p>Hi <strong>${name}</strong>,</p>

      <p>
        We truly appreciate you taking the time to share your experience with 
        <strong>CoffeeCape</strong>.
      </p>

      <p style="font-size:18px;">
        <strong>Your Rating:</strong> ${"⭐".repeat(rating)}
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
}

/* =====================================================
   SEND REVIEW THANK YOU MAIL
===================================================== */
async function sendReviewThankYouMail(to, name, rating) {
  return safeSendMail({
    to,
    subject: "☕ Thank You for Your CoffeeCape Review!",
    html: generateReviewThankYouTemplate(name, rating)
  });
}

module.exports = {sendOtpMail,sendContactToAdmin,sendContactConfirmation,sendMail,sendPaymentBill,sendReviewThankYouMail,sendOtpVerifiedMail,sendBookingPaymentBill,generateBookingConfirmedTemplate};