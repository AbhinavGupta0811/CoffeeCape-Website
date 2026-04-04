/************************************************************
 * API ENDPOINTS
 ************************************************************/
const API_ORDERS = "/api/orders";
const API_CART_REORDER = "/api/orders/reorder";
const API_BOOKINGS = "/api/booking/user/all";

/************************************************************
 * CONSTANTS
 ************************************************************/
const STATUS_FLOW = [
  { key: "pending", label: "Order Placed" },
  { key: "confirmed", label: "Confirmed" },
  { key: "preparing", label: "Preparing" },
  { key: "out_for_delivery", label: "Out for Delivery" },
  { key: "delivered", label: "Delivered" }
];

const REFUND_FLOW = [
  { key: "delivered", label: "Delivered" },
  { key: "refund_requested", label: "Refund Requested" },
  { key: "refunded", label: "Refund Approved" },
  { key: "refund_rejected", label: "Refund Rejected" }
];

const NO_REORDER_STATUSES = ["cancelled", "refunded", "refund_rejected"];
const SIX_HOURS = 6 * 60 * 60 * 1000;
const PLATFORM_FEE_PERCENT = 10; // platform fee

/************************************************************
 * SOCKET.IO CONNECTION
 ************************************************************/
const socket = io({
  withCredentials: true
});

socket.on("connect", () => {
  console.log("✅ Socket connected:", socket.id);
});

socket.on("disconnect", () => {
  console.log("❌ Socket disconnected");
});

/* 🔥 NEW ORDER REAL-TIME */
socket.on("new-order", (data) => {
  console.log("📦 New order received:", data);
  loadOrders();
});

/* 🔥 STATUS UPDATE REAL-TIME */
socket.on("order-status-updated", (data) => {
  console.log("🔄 Order updated:", data);
  loadOrders();
});

/* 🔥 REFUND REAL-TIME */
socket.on("refund-requested", (data) => {
  console.log("💰 Refund requested:", data);
  loadOrders();
});

/* 🔥 Booking Events */
socket.on("newBooking", () => loadBookings());
socket.on("bookingCreated", () => loadBookings());
socket.on("bookingCancelled", () => loadBookings());
socket.on("bookingPaid", () => loadBookings());

/************************************************************
 * ELEMENTS
 ************************************************************/
const ordersContainer = document.getElementById("ordersContainer");
const modal = document.getElementById("orderModal");
const modalTitle = document.getElementById("modalTitle");
const modalContent = document.getElementById("modalContent");
const timelineBox = document.getElementById("statusTimeline");
const closeModalBtn = document.getElementById("closeModal");
const ordersTab = document.getElementById("ordersTab");
const bookingsTab = document.getElementById("bookingsTab");
let refundTimer = null;

/************************************************************
 * INIT
 ************************************************************/
document.addEventListener("DOMContentLoaded", () => {
  loadOrders();
});
function showToast(message, type = "info") {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.className = `toast ${type}`;
  toast.innerHTML = message;

  toast.classList.add("show");

  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

/************************************************************
 * HELPERS
 ************************************************************/
function labelize(text) {
  return text.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function formatRemainingTime(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(t / 3600)).padStart(2, "0");
  const m = String(Math.floor((t % 3600) / 60)).padStart(2, "0");
  const s = String(t % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function showConfirmModal(message, title = "Confirm Action") {
  return new Promise(resolve => {

    const modal = document.getElementById("confirmModal");
    const msg = document.getElementById("confirmMessage");
    const ttl = document.getElementById("confirmTitle");
    const okBtn = document.getElementById("confirmOk");
    const cancelBtn = document.getElementById("confirmCancel");

    msg.textContent = message;
    ttl.textContent = title;

    modal.style.display = "flex";

    const cleanup = () => {
      modal.style.display = "none";
      okBtn.onclick = null;
      cancelBtn.onclick = null;
    };

    okBtn.onclick = () => {
      cleanup();
      resolve(true);
    };

    cancelBtn.onclick = () => {
      cleanup();
      resolve(false);
    };
  });
}

/************************************************************
 * SAFE FETCH WRAPPER
 ************************************************************/
async function safeFetch(url, options = {}) {
  try {
    const res = await fetch(url, {
      credentials: "include",
      ...options
    });

    let data = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }

    /* ===== STATUS HANDLING ===== */

    if (res.status === 401) {
      window.location.href = "error.html?type=unauthorized";
      return null;
    }

    if (res.status === 403) {
      showToast(`<i class="fa-solid fa-lock" style="margin-right:6px;"></i> Access denied`, "error");
      return null;
    }

    if (res.status === 404) {
      window.location.href = "error.html?type=notfound";
      return null;
    }

    if (res.status === 409) {
      showToast(`<i class="fa-solid fa-triangle-exclamation" style="margin-right:6px;"></i> Conflict detected`, "warning");
      return null;
    }

    if (res.status === 500) {
      window.location.href = "error.html?type=server";
      return null;
    }

    if (!res.ok) {
      throw new Error(data.message || "Request failed");
    }

    return data;

  } catch (err) {
    console.error("API Error:", err);
    window.location.href = "error.html?type=network";
    return null;
  }
}

/************************************************************
 * LOAD ORDERS
 ************************************************************/
async function loadOrders() {
  const data = await safeFetch(API_ORDERS);
  if (!data || data.success === false) return;

  ordersContainer.innerHTML = "";

  if (!data.orders?.length) {
    ordersContainer.innerHTML = `<div class="empty">No orders found</div>`;
    return;
  }

  data.orders.forEach(renderOrder);
}

async function loadBookings() {

  ordersContainer.innerHTML = `
    <div class="empty">
      <i class="fa-solid fa-spinner fa-spin"></i>
      Loading your bookings...
    </div>
  `;

  const data = await safeFetch(API_BOOKINGS);
  if (!data || data.success === false) return;

  ordersContainer.innerHTML = "";

  if (!data.bookings?.length) {
    ordersContainer.innerHTML = `<div class="empty">No bookings found</div>`;
    return;
  }

  data.bookings.forEach(renderBooking);
}

/************************************************************
 * RENDER ORDER CARD
 ************************************************************/
function renderOrder(order) {
  const div = document.createElement("div");
  div.className = "order-card";

  const total = Number(order.total) || 0;
  const isDelivered = order.status === "delivered";
  const isPaid = total <= 0;

  const showPayButton = isDelivered && !isPaid ;

  div.innerHTML = `
    <div class="order-header">
      <div>Order: ${order.order_id}</div>
      <span class="status ${order.status}">
        ${labelize(order.status)}
      </span>
    </div>

    <div class="meta">
      ${new Date(order.created_at).toLocaleString()}
    </div>

    <div class="total">₹${total.toFixed(2)}</div>

    <div class="actions">

      <button class="btn primary"
        data-action="view"
        data-id="${order.order_id}">
        View
      </button>

      ${
        NO_REORDER_STATUSES.includes(order.status)
          ? `<button class="btn secondary" disabled>Reorder Disabled</button>`
          : `<button class="btn secondary"
               data-action="reorder"
               data-id="${order.order_id}">
               Reorder
             </button>`
      }
      
      ${
        showPayButton &&
        order.payment_method === "cod" &&
        order.payment_status === "pending"
          ? `<button class="btn success"
              data-action="pay-order"
              data-id="${order.order_id}">
              Pay ₹${total.toFixed(2)}
            </button>`
          : ""
      }
    </div>
  `;

  ordersContainer.appendChild(div);
}

function renderBooking(booking) {
  if (!booking) return;

  const total = Number(booking.total) || 0;
  const paid = Number(booking.paid_amount) || 0;
  const remaining = Math.max(0, total - paid);

  const status = booking.status || "pending";
  const paymentStatus = booking.payment_status || "pending";

  const eventDate = booking.event_date
    ? new Date(booking.event_date).toLocaleDateString("en-IN")
    : "-";

  const eventTime = booking.event_time || "-";
  const isCancelled = status === "cancelled";
  const isRefunded = paymentStatus === "refunded";
  const isFullyPaid = remaining <= 0;
  const showPayButton = status === "confirmed" && !isFullyPaid && !isCancelled && !isRefunded;

  /* =========================
     CANCEL LOGIC (User Mode)
  ========================= */

  const createdAt = booking.created_at
    ? new Date(booking.created_at).getTime()
    : null;

  const hoursPassed = createdAt
    ? (Date.now() - createdAt) / (1000 * 60 * 60)
    : 999;

  const canCancel =
    status !== "cancelled" &&
    status !== "completed" &&
    status !== "confirmed" &&
    hoursPassed <= 24;

  const div = document.createElement("div");
  div.className = "order-card";

  div.innerHTML = `
    <div class="order-header">
      <div>Booking: ${booking.booking_id}</div>
      <span class="status-badge ${status}">
        ${labelize(status)}
      </span>
    </div>

    <div class="meta">
      Event: ${labelize(booking.event_type || "-")}
    </div>

    <div class="meta">
      Date: ${eventDate} ${eventTime !== "-" ? `| ${eventTime}` : ""}
    </div>

    <div class="meta">
      Payment: ${labelize(paymentStatus)}
    </div>

    <div style="margin-top:10px;padding:10px;background:#f9fafb;border-radius:8px;font-size:14px;">
      <div style="display:flex;justify-content:space-between;">
        <span>Total</span>
        <span>₹${total.toFixed(2)}</span>
      </div>

      <div style="display:flex;justify-content:space-between;color:#16a34a;">
        <span>Paid</span>
        <span>₹${paid.toFixed(2)}</span>
      </div>

      <div style="display:flex;justify-content:space-between;
                  color:${remaining > 0 ? "#dc2626" : "#16a34a"};">
        <span>Remaining</span>
        <span>₹${remaining.toFixed(2)}</span>
      </div>
    </div>

    <div class="actions">

      <button class="btn primary"
        data-action="view-booking"
        data-id="${booking.booking_id}">
        View Details
      </button>

      ${
        showPayButton
          ? `<button class="btn success"
              onclick="window.location.href='payment.html?type=booking&id=${booking.booking_id}'">
              Pay Remaining ₹${remaining.toFixed(2)}
            </button>`
          : ""
      }

      ${
        canCancel
          ? `<button class="btn danger"
              data-action="cancel-booking"
              data-id="${booking.booking_id}">
              Cancel Booking
            </button>`
          : status === "cancelled"
            ? `<button class="btn secondary" disabled>Cancelled</button>`
            : `<button class="btn secondary" disabled>Cancellation Closed</button>`
      }
    </div>
  `;

  ordersContainer.appendChild(div);
}

/************************************************************
 * ORDER EVENTS
 ************************************************************/
ordersContainer.addEventListener("click", async (e) => {

  const btn = e.target.closest("button");
  if (!btn) return;

  const { action, id } = btn.dataset;

  if (action === "view") return viewOrder(id);

  if (action === "reorder") return reorder(id);

  if (action === "view-booking") return viewBooking(id);

  if (action === "cancel-booking") return cancelBooking(id);

  if (action === "pay-order") {

    const confirmPay = await showConfirmModal(
      "Confirm payment for this order?",
      "Pay Order"
    );

    if (!confirmPay) return;

    const result = await safeFetch("/api/payment/confirm", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        type: "order",
        id,
        method: "online"
      })
    });

    if (!result) {
      showToast("Payment already completed", "warning");
      btn.disabled = true;
      return;
    }

    showToast("Payment successful", "success");

    loadOrders();
  }

});

/* Refund & Cancellation UI */
function renderRefundSection(order, refundableAmount = 0, nonRefundable = 0) {

  const isCOD = order.payment_method === "cod";
  const isAdminCancelled = order.cancelled_by === "admin";

  /* 1. Admin Cancelled */
  if (order.status === "cancelled" && isAdminCancelled) {

    /* Online Payment */
    if (!isCOD) {

      /* Refund Completed */
      if (order.payment_status === "refunded") {
        return `
          <div class="refund-detail-box" style="
            margin-top:14px;
            padding:14px;
            background:#ecfdf5;
            border:1px solid #10b981;
            border-radius:10px;
            font-size:14px;
          ">
            <strong style="color:#065f46;">💰 Refund Completed</strong>

            <div style="display:flex;justify-content:space-between;margin-top:8px;">
              <span>Refunded Amount</span>
              <span style="color:#16a34a;font-weight:600;">
                ₹${refundableAmount.toFixed(2)}
              </span>
            </div>

            <div style="font-size:12px;margin-top:6px;color:#555;">
              Order was cancelled by admin. Refund credited successfully.
            </div>
          </div>
        `;
      }

      /* Refund Processing */
      return `
        <div class="refund-detail-box" style="
          margin-top:14px;
          padding:14px;
          background:#eff6ff;
          border:1px solid #3b82f6;
          border-radius:10px;
          font-size:14px;
          color:#1e3a8a;
        ">
          <strong>Order Cancelled by Admin</strong>

          <p style="margin-top:6px;">
            Your payment will be refunded to your original payment method.
          </p>

          <div style="font-size:12px;margin-top:6px;">
            Refund usually takes 24–48 working hours.
          </div>
        </div>
      `;
    }

    /* COD Order */
    return `
      <div class="refund-detail-box" style="
        margin-top:14px;
        padding:14px;
        background:#fee2e2;
        border:1px solid #ef4444;
        border-radius:10px;
        color:#7f1d1d;
        font-weight:600;
      ">
        ❌ Order cancelled by admin.
      </div>
    `;
  }

  /* 2. User Cancelled COD Order */
  if (order.status === "cancelled" && isCOD) {
    return `
      <div class="refund-detail-box" style="
        margin-top:14px;
        padding:14px;
        background:#fef3c7;
        border:1px solid #f59e0b;
        border-radius:10px;
        font-size:14px;
        color:#92400e;
      ">
        <strong>Order Cancelled</strong>
        <p style="margin-top:6px;">
          Your order has been cancelled successfully.
        </p>
      </div>
    `;
  }

  /* 3. Refund Pending */
  if (order.status === "cancelled" && order.payment_status !== "refunded") {
    return `
      <div class="refund-detail-box" style="
        margin-top:14px;
        padding:14px;
        background:#eff6ff;
        border:1px solid #3b82f6;
        border-radius:10px;
        font-size:14px;
        color:#1e3a8a;
      ">
        <strong>Order Cancelled</strong>
        <p style="margin-top:6px;">
          Refund is being processed to your original payment method.
        </p>
      </div>
    `;
  }

  /* 4. Refund Completed */
  if (order.payment_status === "refunded" && !isCOD) {
    return `
      <div class="refund-detail-box" style="
        margin-top:14px;
        padding:14px;
        background:#ecfdf5;
        border:1px solid #10b981;
        border-radius:10px;
        font-size:14px;
      ">

        <strong style="color:#065f46;">💰 Refund Completed</strong>

        <div style="display:flex;justify-content:space-between;margin-top:8px;">
          <span>Refunded Amount</span>
          <span style="color:#16a34a;font-weight:600;">
            ₹${refundableAmount.toFixed(2)}
          </span>
        </div>

        <div style="display:flex;justify-content:space-between;color:#dc2626;margin-top:4px;">
          <span>Non-Refundable Charges</span>
          <span>₹${nonRefundable.toFixed(2)}</span>
        </div>

        <div style="font-size:12px;margin-top:6px;color:#555;">
          Platform, packing, delivery & GST fees are non-refundable.<br>
          Amount credited within 24–48 working hours.
        </div>

      </div>
    `;
  }

  /* 5. Refund Rejected */
  if (order.status === "refund_rejected") {
    return `
      <div class="refund-detail-box" style="
        margin-top:14px;
        padding:14px;
        border:1px solid #c7bcbc;
        background:#fee2e2;
        border-radius:10px;
        font-size:14px;
        color:#991b1b;
      ">
        <strong>Refund Request Rejected</strong>
        <p style="margin-top:6px;">
          ${order.refund_reject_reason || "No reason provided"}
        </p>
      </div>
    `;
  }

  /* 6. Eligible for Refund Request */
  if (order.status === "delivered" && order.payment_status === "paid") {
    return `<div id="refundSection"></div>`;
  }

  /* Default */
  return "";
}

/************************************************************
 * VIEW ORDER DETAILS
 ************************************************************/
async function viewOrder(orderId) {

  modalTitle.innerText = "Order Details";

  timelineBox.style.display = "flex";
  timelineBox.style.flexDirection = "column";
  timelineBox.style.alignItems = "flex-start";

  const order = await safeFetch(`${API_ORDERS}/${orderId}`);
  if (!order) return;

  const gst = Number(order.gst) || 0;
  const platformFee = Number(order.platform_fee) || 0;
  const packingFee = Number(order.packing_fee) || 0;
  const deliveryFee = Number(order.delivery_fee) || 0;
  const total = Number(order.total) || 0;

  const nonRefundable = gst + platformFee + packingFee + deliveryFee;
  const refundableAmount = Math.max(0, total - nonRefundable);

  modalContent.innerHTML = `
    <p><strong>Ordered By:</strong> ${order.name ? labelize(order.name) : "N/A"}</p>
    <p><strong>Address :</strong> ${order.address ? labelize(order.address) : "N/A"}</p>
    <p><strong>Status:</strong> ${labelize(order.status)}</p>
    <p><strong>Payment Status:</strong> ${labelize(order.payment_status)}</p>
    <p><strong>Order Notes:</strong> ${order.notes ? labelize(order.notes) : "N/A"}</p>
    
    <table>
      <tr><th>Item</th><th>Qty</th><th>Price</th></tr>
      ${(order.items || []).map(i => `
        <tr>
          <td>${i.name}</td>
          <td>${i.qty}</td>
          <td>₹${(i.qty * i.price).toFixed(2)}</td>
        </tr>
      `).join("")}
    </table>

    <div class="price-breakdown" style="
      margin:12px 0;
      padding:12px;
      background:#f9fafb;
      border-radius:10px;
      border:1px solid #e5e7eb;
      font-size:14px;
    ">

      <div style="display:flex;justify-content:space-between;">
        <span>Subtotal</span>
        <span>₹${Number(order.subtotal).toFixed(2)}</span>
      </div>

      <div style="display:flex;justify-content:space-between;">
        <span>GST</span>
        <span>₹${gst.toFixed(2)}</span>
      </div>

      <div style="display:flex;justify-content:space-between;">
        <span>Platform Fee (Non refundable)</span>
        <span>₹${platformFee.toFixed(2)}</span>
      </div>

      <div style="display:flex;justify-content:space-between;">
        <span>Packing & Handling Fee (Non refundable)</span>
        <span>₹${packingFee.toFixed(2)}</span>
      </div>

      <div style="display:flex;justify-content:space-between;">
        <span>Delivery Fee</span>
        <span>₹${deliveryFee.toFixed(2)}</span>
      </div>

      <div style="display:flex;justify-content:space-between;">
        <span>Tip</span>
        <span>₹${Number(order.tip).toFixed(2)}</span>
      </div>

      ${
        Number(order.discount) > 0
          ? `
            <div style="display:flex;justify-content:space-between;color:#dc2626;">
              <span>Discount</span>
              <span>-₹${Number(order.discount).toFixed(2)}</span>
            </div>
          `
          : ""
      }

      <hr style="margin:8px 0;">

      <div style="display:flex;justify-content:space-between;font-weight:700;">
        <span>Total</span>
        <span>₹${total.toFixed(2)}</span>
      </div>

    </div>

    ${
      ["pending","confirmed","preparing"].includes(order.status)
      ? `
        <div style="margin-top:16px;text-align:right;">
          <button 
            class="btn danger"
            data-action="cancel"
            data-id="${order.order_id}"
            style="padding:10px 18px;border-radius:999px;font-weight:600;"
          >
            Cancel Order
          </button>
        </div>
      `
      : ""
    }

    ${renderRefundSection(order, refundableAmount, nonRefundable)}

  `;

  renderTimeline(order.status);
  modal.style.display = "block";

  /* ===============================
     REFUND TIMER
  =============================== */
  if (window.refundTimer) {
    clearInterval(window.refundTimer);
    window.refundTimer = null;
  }

  if (order.status === "delivered" && order.delivered_at) {

    const refundBox = document.getElementById("refundSection");
    const deliveredAt = new Date(order.delivered_at).getTime();

    if (!refundBox) return;

    refundBox.innerHTML = `
      <div class="refund-card" style="margin-top:14px;padding:14px;border:1px solid #e5e7eb;border-radius:10px;background:#fafafa;">

        <div id="refundTimerText" style="
          font-size:13px;
          color:#6b7280;
          margin-bottom:10px;
          display:flex;
          align-items:center;
          gap:6px;
        ">
          ⏳ Refund expires in <strong></strong>
        </div>

        <textarea
          id="refundReason"
          placeholder="Reason (minimum 10 characters)"
          rows="3"
          style="width:95%;resize:none;padding:10px;border-radius:8px;border:1px solid #d1d5db;font-size:14px;margin-bottom:12px;"
        ></textarea>

        <button
          class="btn warning"
          data-action="refund"
          data-id="${order.order_id}"
          style="width:100%;border-radius:999px;font-weight:600;padding:10px 0;"
        >
          Request Refund
        </button>

      </div>
    `;

    const timerText = refundBox.querySelector("#refundTimerText strong");

    function updateRefundTimer() {

      const remaining = SIX_HOURS - (Date.now() - deliveredAt);

      if (remaining <= 0) {
        refundBox.innerHTML = `<p class="muted">Refund window expired (6 hours)</p>`;
        clearInterval(refundTimer);
        refundTimer = null;
        return;
      }

      timerText.textContent = formatRemainingTime(remaining);
    }

    updateRefundTimer();
    refundTimer = setInterval(updateRefundTimer, 1000);
  }
}

async function viewBooking(bookingId) {

  if (!bookingId) {
    showToast("Invalid booking reference", "error");
    return;
  }

  modalTitle.innerText = "Booking Details";
  timelineBox.style.display = "none";

  const data = await safeFetch(`/api/booking/details/${bookingId}`);
  if (!data || !data.success) return;

  const booking = data.booking;
  const extras = booking.booking_data || {};

  // Support nested old data safely
  const nestedExtras =
    extras.booking_data && typeof extras.booking_data === "object"
      ? extras.booking_data
      : {};

  const total = Number(booking.total) || 0;
  const paid = Number(booking.paid_amount) || 0;
  const remaining = Math.max(0, total - paid);

  const cancelledBy = booking.cancelled_by || null;

  /* 5% platform fee deduction from total */
  const platformFee = Number((paid * PLATFORM_FEE_PERCENT) / 100);

  let refundableAmount = 0;

  if (
    booking.status === "cancelled" &&
    booking.payment_status === "refunded"
  ) {
    refundableAmount = Math.max(0, paid - platformFee);
  }

  const isCancelled = booking.status === "cancelled";
  const isRefunded = booking.payment_status === "refunded";
  const isFullyPaid = remaining <= 0;
  const showPayButton = booking.status === "confirmed" && !isFullyPaid && !isCancelled && !isRefunded;

  const eventDate = booking.event_date
    ? new Date(booking.event_date).toLocaleDateString("en-IN")
    : "-";

  const notes =
    extras.notes ||
    nestedExtras.notes ||
    extras.specialRequest ||
    nestedExtras.specialRequest ||
    "No special notes provided";

  modalContent.innerHTML = `
    <div style="padding:20px;font-size:14px;">

      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;">
        <h5 style="margin:0;font-size:20px">Booking Status</h5>
        <span class="status-badge ${booking.status}">
          ${
            booking.status === "cancelled"
              ? booking.cancelled_by === "admin"
                ? "Cancelled by Admin"
                : "Cancelled by You"
              : labelize(booking.status)
          }
        </span>
      </div>

      <hr>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">

        <div><strong>Booking ID:</strong></div>
        <div>${booking.booking_id}</div>

        <div><strong>Event Type:</strong></div>
        <div>${labelize(booking.event_type)}</div>

        <div><strong>Event Date:</strong></div>
        <div>${eventDate}</div>

        <div><strong>Event Time:</strong></div>
        <div>${booking.event_time || "-"}</div>

        <div><strong>Full Name:</strong></div>
        <div>${booking.full_name || "-"}</div>

        <div><strong>Email:</strong></div>
        <div>${booking.email || "-"}</div>

        <div><strong>Phone:</strong></div>
        <div>${booking.phone || "-"}</div>

        <div><strong>Assigned Address:</strong></div>
        <div>${booking.assigned_address || "Not Assigned Yet"}</div>

        <div><strong>Payment Status:</strong></div>
        <div>${labelize(booking.payment_status)}</div>

      </div>

      <hr style="margin:15px 0;">

      <div>
        <strong>Special Notes:</strong>
        <div style="margin-top:5px;color:#555;">
          ${notes}
        </div>
      </div>

      <hr style="margin:15px 0;">

      <div style="background:#f9fafb;padding:12px;border-radius:8px;">
        <div style="display:flex;justify-content:space-between;">
          <span><strong>Total Amount</strong></span>
          <span>₹${total.toFixed(2)}</span>
        </div>

        <div style="display:flex;justify-content:space-between;color:#16a34a;margin-top:5px;">
          <span><strong>Paid</strong></span>
          <span>₹${paid.toFixed(2)}</span>
        </div>

        <div style="display:flex;justify-content:space-between;
                    color:${remaining > 0 ? "#dc2626" : "#16a34a"};
                    margin-top:5px;">
          <span><strong>Remaining</strong></span>
          <span>₹${remaining.toFixed(2)}</span>
        </div>
      </div>

      ${
        showPayButton
          ? `<div style="margin-top:15px;text-align:right;">
              <button class="btn primary"
                onclick="window.location.href='payment.html?type=booking&id=${booking.booking_id}'">
                Pay Remaining ₹${remaining.toFixed(2)}
              </button>
            </div>`
          : isCancelled && isRefunded
              ? `
                <div style="
                  margin-top:15px;
                  padding:12px;
                  background:#ecfdf5;
                  color:#065f46;
                  border:1px solid #10b981;
                  border-radius:8px;
                  font-weight:600;
                ">
                  ${
                    cancelledBy === "admin"
                      ? "🛠 Cancelled by Admin"
                      : "❌ Cancelled by You"
                  }

                  <div style="margin-top:6px;">
                    💰 Refund Amount: ₹${refundableAmount.toFixed(2)}
                  </div>

                  <div style="font-size:12px;margin-top:5px;color:#555;">
                    Platform fee ₹${platformFee.toFixed(2)} (10% non-refundable).<br>
                    You will receive the refunded amount in your account within 24 to 48 hours in working days.
                  </div>
                </div>
              `
            : `<div style="margin-top:15px;text-align:right;color:#16a34a;font-weight:600;">
                ${isFullyPaid ? "Fully Paid" : ""}
              </div>`
      }
    </div>
  `;

  modal.style.display = "block";
}

/************************************************************
 * MODAL ACTIONS
 ************************************************************/
modalContent.addEventListener("click", async e => {
  const btn = e.target.closest("button");
  if (!btn) return;

  const { action, id } = btn.dataset;

  /* ===== CANCEL ORDER ===== */
  if (action === "cancel") {
    const confirmCancel = await showConfirmModal(
      "Are you sure you want to cancel this order?",
      "Cancel Order"
    );

    if (!confirmCancel) return;

    const result = await safeFetch(`${API_ORDERS}/${id}/cancel`, {
      method: "POST"
    });

    if (!result) return;

    showToast(`<i class="fa-solid fa-circle-check"></i> Order cancelled successfully`, "success");

    modal.style.display = "none";
    loadOrders();
    return;
  }

  /* ===== REFUND ===== */
  if (action === "refund") {

    const reason = document.getElementById("refundReason").value.trim();

    if (reason.length < 10) {
      showToast(`<i class="fa-solid fa-triangle-exclamation"></i> Reason must be at least 10 characters`, "warning");
      return;
    }

    const result = await safeFetch(`${API_ORDERS}/${id}/refund`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason })
    });

    if (!result) return;

    showToast(`<i class="fa-solid fa-circle-check"></i> Refund request submitted`, "success");

    modal.style.display = "none";
    loadOrders();
  }
});

async function cancelBooking(bookingId) {

  const confirmCancel = await showConfirmModal(
    "Are you sure you want to cancel this booking?",
    "Cancel Booking"
  );

  if (!confirmCancel) return;

  const result = await safeFetch(
    `/api/booking/cancel/${bookingId}`,
    { method: "PUT" }
  );

  if (!result) return;

  if (!result.success) {
    showToast(result.message || "Cancellation failed", "error");
    return;
  }

  showToast(result.message, "success");
  loadBookings();
}

/************************************************************
 * TIMELINE
 ************************************************************/
function renderTimeline(status) {

  timelineBox.innerHTML = "";

  const BLANK_STATUSES = ["cancelled"];

  /* ------------------------
     BLANK TIMELINE
  ------------------------ */
  if (BLANK_STATUSES.includes(status)) {

    STATUS_FLOW.forEach(s => {
      const div = document.createElement("div");
      div.className = "step";
      div.textContent = s.label;
      timelineBox.appendChild(div);
    });

    return;
  }

  /* ------------------------
     REFUND TIMELINE
  ------------------------ */
  if (
    status === "refund_requested" ||
    status === "refunded" ||
    status === "refund_rejected"
  ) {

    const index = REFUND_FLOW.findIndex(s => s.key === status);

    REFUND_FLOW.forEach((s, i) => {

      const div = document.createElement("div");
      div.className = "step";

      if (i < index) div.classList.add("done");

      if (i === index) {
        if (status === "refunded") div.classList.add("success");
        else if (status === "refund_rejected") div.classList.add("danger");
        else div.classList.add("active");
      }

      div.textContent = s.label;
      timelineBox.appendChild(div);
    });

    return;
  }

  /* ------------------------
     NORMAL ORDER TIMELINE
  ------------------------ */
  const index = STATUS_FLOW.findIndex(s => s.key === status);

  STATUS_FLOW.forEach((s, i) => {

    const div = document.createElement("div");
    div.className = "step";

    if (i < index) div.classList.add("done");
    if (i === index) div.classList.add("active");

    div.textContent = s.label;
    timelineBox.appendChild(div);
  });
}

/************************************************************
 * REORDER
 ************************************************************/
async function reorder(id) {

  const orderData = await safeFetch(`${API_ORDERS}/${id}`);
  if (!orderData || orderData.success === false) return;

  if (!Array.isArray(orderData.items) || !orderData.items.length) {
    showToast("No items found to reorder", "error");
    return;
  }

  const result = await safeFetch(API_CART_REORDER, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: orderData.items })
  });

  if (!result || result.success === false) {
    showToast(result?.message || "Reorder failed", "error");
    return;
  }

  location.href = "cart.html";
}

/************************************************************
 * MODAL CONTROLS
 ************************************************************/
closeModalBtn.addEventListener("click", () => {
  modal.style.display = "none";
  
  if (refundTimer) {
    clearInterval(refundTimer);
    refundTimer = null;
  }
});

floatingHomeBtn.onclick = () => {
  location.href = "index.html";
};

function setActiveTab(tab) {
  ordersTab.classList.remove("active");
  bookingsTab.classList.remove("active");
  tab.classList.add("active");
}

ordersTab.addEventListener("click", () => {
  if (refundTimer) {
    clearInterval(refundTimer);
    refundTimer = null;
  }
  setActiveTab(ordersTab);
  loadOrders();
});

bookingsTab.addEventListener("click", () => {
  setActiveTab(bookingsTab);
  loadBookings();
});