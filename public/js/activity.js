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

/* =====================================
   BOOKING REALTIME REFRESH
===================================== */
let bookingReloadTimer = null;

function refreshBookingsRealtime() {
  clearTimeout(bookingReloadTimer);
  bookingReloadTimer = setTimeout(() => {
    if (bookingsTab &&
        bookingsTab.classList.contains("active")) {

      loadBookings();

    }
  }, 250);
}

/************************************************************
 * SOCKET.IO CONNECTION
 ************************************************************/
const socket = io({
  withCredentials: true
});

socket.on("connect", () => {
  console.log(
    "✅ Socket connected:",
    socket.id
  );

  if ( bookingsTab && bookingsTab.classList.contains("active")) {
    loadBookings();
  }
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

/* =====================================
   BOOKING REALTIME
===================================== */
socket.on("bookingUpdated", data => {
    console.log(
      "📅 Booking Updated:",
      data
    );
    refreshBookingsRealtime();
  }
);

/* Legacy Support */
socket.on("newBooking", data => {
    console.log(
      "📅 New Booking:",
      data
    );
    refreshBookingsRealtime();
  }
);

socket.on("bookingCreated", data => {
    console.log(
      "📅 Booking Created:",
      data
    );
    refreshBookingsRealtime();
  }
);

socket.on("bookingConfirmed", data => {
    console.log(
      "📅 Booking Confirmed:",
      data
    );
    refreshBookingsRealtime();
  }
);

socket.on("bookingCompleted", data => {
    console.log(
      "📅 Booking Completed:",
      data
    );
    refreshBookingsRealtime();
  }
);

socket.on("bookingCancelled", data => {
    console.log(
      "📅 Booking Cancelled:",
      data
    );
    refreshBookingsRealtime();
  }
);

socket.on("bookingStatusUpdated", data => {
    console.log(
      "📅 Booking Status:",
      data
    );
    refreshBookingsRealtime();
  }
);

socket.on("bookingPaid", data => {
    console.log(
      "📅 Booking Paid:",
      data
    );
    refreshBookingsRealtime();
  }
);

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

function getBookingExtraFields(eventType, extras = {}) {
  switch (eventType) {
    case "dinner":
      return [
        {
          label: "Dining Type",
          value: extras.diningType
        },
        {
          label: "Seating Preference",
          value: extras.seatingPreference
        }
      ];

    case "karaoke":
      return [
        {
          label: "Team Name",
          value: extras.teamName
        },
        {
          label: "Song Category",
          value: extras.songCategory
        }
      ];

    case "openmic":
      return [
        {
          label: "Performance Type",
          value: extras.performanceType
        },
        {
          label: "Duration",
          value: extras.duration
        },
        {
          label: "Portfolio",
          value: extras.portfolioLink
        }
      ];

    case "tasting":
      return [
        {
          label: "Package",
          value: extras.packageType
        },
        {
          label: "Diet Preference",
          value: extras.dietPreference
        }
      ];

    case "get":
      return [
        {
          label: "Group Name",
          value: extras.groupName
        },
        {
          label: "DJ Required",
          value: extras.djRequired
        },
        {
          label: "Games Arrangement",
          value: extras.gamesArrangement
        }
      ];

    case "private":
      return [
        {
          label: "Category",
          value: extras.eventCategory
        },
        {
          label: "DJ Required",
          value: extras.djRequired
        },
        {
          label: "Custom Cake",
          value: extras.customCakeRequired
        },
        {
          label: "Catering",
          value: extras.cateringType
        }
      ];

    default:
      return [];
  }
}

function renderBookingExtraFields( eventType, extras = {}) {
  const fields =
    getBookingExtraFields(
      eventType,
      extras
    );

  if (!fields.length) {
    return "";
  }

  return fields
    .filter(
      f =>
        f.value !== undefined &&
        f.value !== null &&
        f.value !== ""
    )
    .map(
      f => `
        <div>
          <strong>${f.label}:</strong>
        </div>

        <div>
          ${labelize(
            String(f.value)
          )}
        </div>
      `
    )
    .join("");
}

async function startBookingPayment(bookingId, amount){
  const confirmPay =
    await showConfirmModal(
      `Proceed to pay ₹${amount.toFixed(2)} for this booking?`,
      "Booking Payment"
    );

  if(!confirmPay){
    return;
  }

  showToast(
    `<i class="fa-solid fa-calendar-check"></i>
    Preparing secure payment...
    Please wait.`,
    "info"
  );

  setTimeout(()=>{
    window.location.href =
      `payment.html?type=booking&id=${bookingId}`;
  },800);
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
          ? `<button class="btn-secondary" disabled>Reorder Disabled</button>`
          : `<button class="btn-secondary"
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

/************************************************************
 * RENDER Booking CARD
 ************************************************************/
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

    <div class="booking-summary">
      <div style="display:flex;justify-content:space-between;">
        <span>Total</span>
        <span>₹${total.toFixed(2)}</span>
      </div>

      <div class="summary-row paid">
        <span>Paid</span>
        <span>₹${paid.toFixed(2)}</span>
      </div>

      <div class="summary-row ${remaining > 0 ? "remaining-due" : "remaining-clear"}">
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
              onclick="startBookingPayment('${booking.booking_id}', ${remaining.toFixed(2)})"> 
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
    const originalText = btn.innerHTML;
    btn.disabled = true;

    btn.innerHTML = `
      <i class="fa-solid fa-spinner fa-spin"></i>
      Processing...
    `;

    showToast(
      `<i class="fa-solid fa-credit-card"></i>
      Payment is being processed.
      Please wait...`,
      "info"
    );

    const result = await safeFetch(
      "/api/payment/confirm",
      {
        method: "POST",
        headers: {
          "Content-Type":
          "application/json"
        },
        body: JSON.stringify({
          type: "order",
          id,
          method: "online"
        })
      }
    );

    if (!result) {
      btn.disabled = false;
      btn.innerHTML = originalText;
      showToast(
        `<i class="fa-solid fa-triangle-exclamation"></i>
        Payment could not be completed.`,
        "warning"
      );
      return;
    }

    btn.innerHTML = `
      <i class="fa-solid fa-circle-check"></i>
      Paid
    `;

    showToast(
      `<i class="fa-solid fa-circle-check"></i>
      Payment completed successfully.`,
      "success"
    );

    setTimeout(() => {
      loadOrders();
    }, 800);
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
          <div class="refund-detail-box refund-success">
            <strong class="refund-title success">
              💰 Refund Completed
            </strong>

            <div class="refund-row">
              <span>Refunded Amount</span>
              <span class="amount-success">
                ₹${refundableAmount.toFixed(2)}
              </span>
            </div>

            <div class="refund-note">
              Order was cancelled by admin. Refund credited successfully.
            </div>
          </div>
        `;
      }

      /* Refund Processing */
      return `
        <div class="refund-detail-box refund-processing">
          <strong>Order Cancelled by Admin</strong>

          <p class="refund-message">
            Your payment will be refunded to your original payment method.
          </p>

          <div class="refund-note">
            Refund usually takes 24–48 working hours.
          </div>
        </div>
      `;
    }

    /* COD Order */
    return `
      <div class="refund-detail-box refund-danger">
        ❌ Order cancelled by admin.
      </div>
    `;
  }

  /* 2. User Cancelled COD Order */
  if (order.status === "cancelled" && isCOD) {
    return `
      <div class="refund-detail-box refund-warning">
        <strong>Order Cancelled</strong>

        <p class="refund-message">
          Your order has been cancelled successfully.
        </p>
      </div>
    `;
  }

  /* 3. Refund Pending */
  if (order.status === "cancelled" && order.payment_status !== "refunded") {
    return `
      <div class="refund-detail-box refund-processing">
        <strong>Order Cancelled</strong>

        <p class="refund-message">
          Refund is being processed to your original payment method.
        </p>
      </div>
    `;
  }

  /* 4. Refund Completed */
  if (order.payment_status === "refunded" && !isCOD) {
    return `
      <div class="refund-detail-box refund-success">
        <strong class="refund-title success">
          💰 Refund Completed
        </strong>

        <div class="refund-row">
          <span>Refunded Amount</span>
          <span class="amount-success">
            ₹${refundableAmount.toFixed(2)}
          </span>
        </div>

        <div class="refund-row amount-danger">
          <span>Non-Refundable Charges</span>
          <span>₹${nonRefundable.toFixed(2)}</span>
        </div>

        <div class="refund-note">
          Platform, packing, delivery & GST fees are non-refundable.<br>
          Amount credited within 24–48 working hours.
        </div>
      </div>
    `;
  }

  /* 5. Refund Rejected */
  if (order.status === "refund_rejected") {
    return `
      <div class="refund-detail-box refund-rejected">
        <strong>
          Refund Request Rejected
        </strong>

        <p class="refund-message">
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
    <p><strong>Ordered By:</strong> ${order.name ? labelize(order.name) : "Not Provided.."}</p>
    <p><strong>Address:</strong> ${order.address ? labelize(order.address) : "Not Provided.."}</p>
    <p><strong>Status:</strong> ${labelize(order.status)}</p>
    <p><strong>Payment Status:</strong> ${labelize(order.payment_status)}</p>
    <p><strong>Order Notes:</strong> ${order.notes ? labelize(order.notes) : "No Demand.."}</p>

    <table>
      <tr>
        <th>Item</th>
        <th>Qty</th>
        <th>Price</th>
      </tr>

      ${(order.items || []).map(i => `
        <tr>
          <td>${i.name}</td>
          <td>${i.qty}</td>
          <td>₹${(i.qty * i.price).toFixed(2)}</td>
        </tr>
      `).join("")}
    </table>

    <div class="price-breakdown">

      <div class="price-row">
        <span>Subtotal</span>
        <span>₹${Number(order.subtotal).toFixed(2)}</span>
      </div>

      <div class="price-row">
        <span>GST</span>
        <span>₹${gst.toFixed(2)}</span>
      </div>

      <div class="price-row">
        <span>Platform Fee (Non refundable)</span>
        <span>₹${platformFee.toFixed(2)}</span>
      </div>

      <div class="price-row">
        <span>Packing & Handling Fee (Non refundable)</span>
        <span>₹${packingFee.toFixed(2)}</span>
      </div>

      <div class="price-row">
        <span>Delivery Fee</span>
        <span>₹${deliveryFee.toFixed(2)}</span>
      </div>

      <div class="price-row">
        <span>Tip</span>
        <span>₹${Number(order.tip).toFixed(2)}</span>
      </div>

      ${
        Number(order.discount) > 0
          ? `
            <div class="price-row discount-row">
              <span>Discount</span>
              <span>-₹${Number(order.discount).toFixed(2)}</span>
            </div>
          `
          : ""
      }

      <hr class="price-divider">

      <div class="price-row total-row">
        <span>Total</span>
        <span>₹${total.toFixed(2)}</span>
      </div>

    </div>
    
    ${
      ["pending","confirmed","preparing"].includes(order.status)
        ? `
          <div class="cancel-order-wrap">
            <button class="btn danger cancel-order-btn"
              data-action="cancel"
              data-id="${order.order_id}"
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
  modal.style.display = "flex";

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
      <div class="refund-card">
        <div id="refundTimerText" class="refund-timer-text">
          ⏳ Refund expires in <strong></strong>
        </div>

        <textarea id="refundReason" class="refund-reason" placeholder="Reason (minimum 10 characters)" rows="3"></textarea>

        <button class="btn warning refund-request-btn" data-action="refund" data-id="${order.order_id}">
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

/*================================================
  VIEW BOOKING DETAILS
================================================*/
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

  const notes=
    extras.notes||
    extras.specialRequest||
    extras.songRequest||
    extras.description||
    "No special notes provided";

  modalContent.innerHTML = `
    <div class="booking-details">
      <div class="booking-header">
        <h5 class="booking-title">
          Booking Status
        </h5>

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

      <div class="booking-grid">

        <div><strong>Booking ID:</strong></div>
        <div>${booking.booking_id}</div>

        <div><strong>Event Type:</strong></div>
        <div>${labelize(booking.event_type)}</div>

        ${
          booking.event_category
            ? `
              <div><strong>Event Category:</strong></div>
              <div>${labelize(booking.event_category)}</div>
            `
            : ""
        }

        <div><strong>Event Date:</strong></div>
        <div>${eventDate}</div>

        <div><strong>Event Time:</strong></div>
        <div>${booking.event_time || "-"}</div>

        <div><strong>Guests:</strong></div>
        <div>${booking.guest_count||"-"}</div>

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

        ${renderBookingExtraFields(
          booking.event_type,
          extras
        )}
      </div>

      <hr class="booking-divider">

      <div>
        <strong>Special Notes:</strong>
        <div class="booking-notes">
          ${notes}
        </div>
      </div>

      <hr class="booking-divider">

      <div class="booking-payment-box">

        <div class="booking-payment-row">
          <span><strong>Total Amount</strong></span>
          <span>₹${total.toFixed(2)}</span>
        </div>

        <div class="booking-payment-row paid">
          <span><strong>Paid</strong></span>
          <span>₹${paid.toFixed(2)}</span>
        </div>

        <div class="booking-payment-row ${remaining > 0 ? "remaining-due" : "remaining-clear"}">
          <span><strong>Remaining</strong></span>
          <span>₹${remaining.toFixed(2)}</span>
        </div>
      </div>

      ${
        showPayButton
          ? `
            <div class="booking-action-wrap">

              <button
                class="btn primary"
                onclick="window.location.href='payment.html?type=booking&id=${booking.booking_id}'"
              >
                Pay Remaining ₹${remaining.toFixed(2)}
              </button>

            </div>
          `
          : isCancelled && isRefunded
              ? `
                <div class="booking-refund-box">

                  ${
                    cancelledBy === "admin"
                      ? "🛠 Cancelled by Admin"
                      : "❌ Cancelled by You"
                  }

                  <div class="booking-refund-amount">
                    💰 Refund Amount: ₹${refundableAmount.toFixed(2)}
                  </div>

                  <div class="booking-refund-note">
                    Platform fee ₹${platformFee.toFixed(2)} (10% non-refundable).<br>
                    You will receive the refunded amount in your account within 24 to 48 working hours.
                  </div>

                </div>
              `
              : `
                <div class="booking-paid-status">
                  ${isFullyPaid ? "Fully Paid" : ""}
                </div>
              `
      }

    </div>
  `;

  modal.style.display = "flex";
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

/*=== CANCEL BOOKING (User Mode) ===*/
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