/* =====================================================
   ADMIN BOOKINGS - COMPLETE PROFESSIONAL VERSION
===================================================== */
const API = "/api/admin/bookings";

const tableBody = document.getElementById("bookingsTableBody");
const modal = document.getElementById("bookingDetailModal");
const modalContent = document.getElementById("bookingDetailContent");
const closeModalBtn = document.getElementById("closeBookingModal");

/* =====================================================
   SOCKET.IO (ADMIN REAL-TIME) 
===================================================== */
const socket = io({
  withCredentials: true
});

/* Prevent reload spam */
let reloadTimeout = null;
function safeReload() {
  clearTimeout(reloadTimeout);
  reloadTimeout = setTimeout(() => {
    loadBookings();
  }, 300);
}

/* ===============================
   CONNECT / DISCONNECT
=============================== */
socket.on("connect", () => {
  console.log("🟢 Admin Socket Connected:", socket.id);
  socket.emit("joinAdminRoom");
});

socket.on("disconnect", () => {
  console.log("🔴 Admin Socket Disconnected");
});

/* ===============================
   COMMON FUNCTION
=============================== */
function refreshDashboard() {
  loadBookingStats(); // update cards
}

/* ===============================
   BOOKING SOCKET UPDATE
=============================== */
function handleBookingRealtime(data = {}) {
  if (!data.bookingId) {
    safeReload();
    return;
  }

  updateBookingRow(
    data.bookingId,
    data.status,
    data.payment_status || null
  );
  refreshDashboard();
}

/* ===============================
   REAL-TIME EVENTS
=============================== */
/* NEW BOOKING */
socket.on("newBooking", async (data) => {

  showToast("New booking received", "info");

  refreshDashboard(); // update stats

  if (!data?.bookingId) {
    safeReload();
    return;
  }

  try {
    const res = await fetch(`${API}/${data.bookingId}`, {
      credentials: "include"
    });

    const result = await res.json();

    if (res.ok && result.booking) {
      renderRow(result.booking);
    } else {
      safeReload();
    }

  } catch {
    safeReload();
  }
});

/* STATUS UPDATED */
socket.on( "bookingUpdated", data => {
    console.log(
      "📅 Booking Updated",
      data
    );
    handleBookingRealtime(data);
  }
);

/* CONFIRMED */
socket.on( "bookingConfirmed", data => {
    console.log(
      "Legacy bookingConfirmed"
    );

    if (!data.status) {
      data.status =
      "confirmed";
    }
    handleBookingRealtime(data);
  }
);

/* COMPLETED */
socket.on( "bookingCompleted", data => {
    console.log(
      "Legacy bookingCompleted"
    );

    data.status =
      "completed";

    data.payment_status =
      "completed";

    handleBookingRealtime(data);
  }
);

/* CANCELLED */
socket.on( "bookingCancelled", data => {
    console.log(
      "Legacy bookingCancelled"
    );

    data.status =
      "cancelled";

    handleBookingRealtime(data);
  }
);

function updateBookingRow(bookingId, newStatus, newPaymentStatus = null) {

  const buttons = document.querySelectorAll(`button[data-id="${bookingId}"]`);
  if (!buttons.length) {
    safeReload();
    return;
  }

  const row = buttons[0].closest("tr");
  if (!row) {
    safeReload();
    return;
  }

  /* ===== UPDATE STATUS ===== */
  if (newStatus) {
    const statusCell = row.querySelector(".status-cell");
    if (statusCell) {
      statusCell.innerHTML = `
        <span class="badge badge-${newStatus}">
          ${newStatus}
        </span>
      `;
    }
  }

  /* ===== UPDATE PAYMENT ===== */
  if (newPaymentStatus) {
    const paymentCell = row.querySelector(".payment-cell");

    const badgeClass =
      newPaymentStatus === "completed"
        ? "badge-paid"
        : newPaymentStatus === "refunded"
        ? "badge-refunded"
        : "badge-unpaid";

    if (paymentCell) {
      paymentCell.innerHTML = `
        <span class="badge ${badgeClass}">
          ${newPaymentStatus}
        </span>
      `;
    }
  }

  /* ===== UPDATE ACTION BUTTONS ===== */
  const actionCell = row.querySelector(".action-cell");

  if (actionCell) {

    if (newStatus === "confirmed") {
      actionCell.querySelector(".accept-btn")?.remove();
    }

    if (newStatus === "completed") {
      actionCell.innerHTML =
        `<button class="btn-secondary" disabled>completed</button>`;
    }

    if (newStatus === "cancelled") {
      actionCell.innerHTML =
        `<button class="btn-danger" disabled>cancelled</button>`;
    }
  }
}

/* =====================================================
   TOAST
===================================================== */
function showToast(message, type = "info") {
  let toast = document.getElementById("adminToast");

  if (!toast) {
    toast = document.createElement("div");
    toast.id = "adminToast";
    toast.style.cssText = `
      position: fixed;
      bottom: 25px;
      right: 25px;
      padding: 12px 18px;
      border-radius: 8px;
      color: #fff;
      font-size: 14px;
      z-index: 9999;
      opacity: 0;
      transition: .3s ease;
    `;
    document.body.appendChild(toast);
  }

  toast.style.background =
    type === "success" ? "#16a34a" :
    type === "error" ? "#dc2626" :
    "#2563eb";

  toast.innerText = message;
  toast.style.opacity = "1";

  setTimeout(() => toast.style.opacity = "0", 2500);
}

/* =====================================================
   HELPERS
===================================================== */

function formatCurrency(value) {
  return "₹" + Number(value || 0).toFixed(2);
}

function safeParseJSON(value) {
  try {
    return typeof value === "string" ? JSON.parse(value) : value || {};
  } catch {
    return {};
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatLabel(key) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^./, str => str.toUpperCase());
}

/* =====================================================
   LOAD BOOKINGS
===================================================== */
async function loadBookings() {

  tableBody.innerHTML = `
    <tr>
      <td colspan="10" style="text-align:center;">
        Loading bookings...
      </td>
    </tr>
  `;

  try {
    const res = await fetch(API, { credentials: "include" });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.message || "Failed to load bookings", "error");
      return;
    }

    const bookings = data.bookings || [];
    tableBody.innerHTML = "";

    if (!bookings.length) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="10" style="text-align:center;">
            No bookings found
          </td>
        </tr>
      `;
      return;
    }

    bookings.forEach(renderRow);

  } catch {
    showToast("Network error", "error");
  }
}

/* =====================================================
   BOOKING STATS (DASHBOARD CARDS)
===================================================== */

async function loadBookingStats() {
  try {
    const res = await fetch("/api/admin/bookings/stats", {
      credentials: "include"
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      showToast("Failed to load stats", "error");
      return;
    }

    /* ===============================
       SAFE VALUES
    =============================== */
    const todayBookings = data.todayBookings || 0;
    const revenue = data.bookingRevenue || 0;

    // ✅ Works with BOTH backend formats
    const pending =
      data.pendingBookings ??
      (data.bookingStatus ? data.bookingStatus.pending : 0) ?? 0;

    const confirmed =
      data.confirmedBookings ??
      (data.bookingStatus ? data.bookingStatus.confirmed : 0) ?? 0;

    /* ===============================
       UPDATE UI
    =============================== */
    const todayEl = document.getElementById("todayBookings");
    const revenueEl = document.getElementById("totalBookingRevenue");
    const pendingEl = document.getElementById("pendingBookings");
    const confirmedEl = document.getElementById("confirmedBookings");

    if (todayEl) todayEl.innerText = todayBookings;

    if (revenueEl)
      revenueEl.innerText =
        "₹" + Number(revenue).toLocaleString("en-IN");

    if (pendingEl) pendingEl.innerText = pending;

    if (confirmedEl) confirmedEl.innerText = confirmed;

  } catch (err) {
    console.error("Stats error:", err);
    showToast("Stats load failed", "error");
  }
}

/* =====================================================
   RENDER ROW
===================================================== */
function renderRow(b) {

  if (!b || !tableBody) return;

  /* ===============================
     SAFE booking_data (backend normalized)
  =============================== */
  const bookingData = b.booking_data || {};

  // Temporary legacy support (remove after DB cleanup)
  const nested =
    bookingData.booking_data && typeof bookingData.booking_data === "object"
      ? bookingData.booking_data
      : {};

  /* ===============================
     SAFE NUMBERS
  =============================== */
  const total = Number(b.total) || 0;
  const paidAmount = Number(b.paid_amount) || 0;
  const remaining = Math.max(0, total - paidAmount);

  /* ===============================
     SAFE DATE
  =============================== */
  const rawDate =
    b.event_date ||
    bookingData.eventDate ||
    nested.eventDate ||
    bookingData.reservationDate ||
    nested.reservationDate ||
    null;

  const eventDate = rawDate
    ? new Date(rawDate).toLocaleDateString("en-IN")
    : "-";

  /* ===============================
     SAFE BASIC FIELDS
  =============================== */
  const bookingId = b.booking_id || "-";

  const fullName =
    b.full_name ||
    bookingData.fullName ||
    nested.fullName ||
    "-";

  const eventType =
    b.event_type ||
    bookingData.eventType ||
    nested.eventType ||
    "-";

  const status = b.status || "pending";
  const paymentStatus = b.payment_status || "pending";

  /* ===============================
     BADGE CLASSES
  =============================== */
  const paymentBadgeClass =
    paymentStatus === "completed"
      ? "badge-paid"
      : paymentStatus === "refunded"
      ? "badge-refunded"
      : "badge-unpaid";

  /* ===============================
     BUILD ROW
  =============================== */
  const row = document.createElement("tr");

  row.innerHTML = `
    <td><strong>${escapeHtml(bookingId)}</strong></td>

    <td>${escapeHtml(fullName)}</td>

    <td>${escapeHtml(eventType)}</td>

    <td>${eventDate}</td>

    <td>${formatCurrency(total)}</td>

    <td>${formatCurrency(paidAmount)}</td>

    <td style="color:${remaining > 0 ? "#dc2626" : "#16a34a"};">
      ${formatCurrency(remaining)}
    </td>

    <td class="status-cell">
      <span class="badge badge-${status}">
        ${status}
      </span>
    </td>

    <td class="payment-cell">
      <span class="badge ${paymentBadgeClass}">
        ${paymentStatus}
      </span>
    </td>

    <td class="action-cell">

      <button class="btn-view"
        data-id="${bookingId}"
        data-action="view">
        View
      </button>

      ${
        status === "pending"
          ? `
          <button class="btn-primary"
            data-id="${bookingId}"
            data-action="accept">
            Accept
          </button>
          `
          : ""
      }

      ${
        status === "confirmed"
          ? `
          <button class="btn-secondary"
            data-id="${bookingId}"
            data-action="complete">
            Mark Completed
          </button>
          `
          : ""
      }

      ${
        status !== "cancelled" && status !== "completed"
          ? `
          <button class="btn-danger"
            data-id="${bookingId}"
            data-action="cancel">
            Cancel
          </button>
          `
          : `
          <button class="action-btn" disabled>
            ${status}
          </button>
          `
      }

    </td>
  `;

  tableBody.appendChild(row);
}

/* =====================================================
   VIEW BOOKING
===================================================== */
async function viewBooking(id) {

  if (!id) {
    showToast("Invalid booking ID", "error");
    return;
  }

  try {

    const res = await fetch(`${API}/${id}`, {
      credentials: "include"
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      showToast(data?.message || "Failed to load booking details", "error");
      return;
    }

    const b = data.booking;
    if (!b) {
      showToast("Booking data missing", "error");
      return;
    }

    /* ===============================
       SAFE booking_data
    =============================== */
    const rawData = b.booking_data || {};

    // Support legacy nested structure
    const nested =
      rawData.booking_data && typeof rawData.booking_data === "object"
        ? rawData.booking_data
        : {};

    const bookingData = {
      ...rawData,
      ...nested
    };

    delete bookingData.booking_data;

    /* ===============================
       SAFE VALUES
    =============================== */

    const total = Number(b.total) || 0;
    const paid = Number(b.paid_amount) || 0;
    const remaining = Math.max(0, total - paid);

    const eventDate =
      b.event_date
        ? new Date(b.event_date).toLocaleDateString("en-IN")
        : bookingData.eventDate || bookingData.reservationDate || "-";

    const eventTime =
      b.event_time ||
      bookingData.eventTime ||
      "-";

    const createdAt =
      b.created_at
        ? new Date(b.created_at).toLocaleString("en-IN")
        : "-";

    /* ===============================
       BUILD EXTRA FIELDS DYNAMICALLY
    =============================== */

    const excludedKeys = [
      "eventDate",
      "reservationDate",
      "eventTime",
      "fullName",
      "email",
      "phone",
      "totalPrice",
      "booking_data"
    ];

    let extraFieldsHTML = "";

    Object.keys(bookingData).forEach(key => {

      if (excludedKeys.includes(key)) return;

      const value = bookingData[key];

      if (value == null || value === "") return;

      extraFieldsHTML += `
        <div><strong>${formatLabel(key)}:</strong></div>
        <div>${escapeHtml(String(value))}</div>
      `;
    });

    /* ===============================
       BUILD MODAL UI
    =============================== */

    modalContent.innerHTML = `
      <div style="padding:20px;font-size:14px;">

        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;">
          <h5 style="margin:0;font-size:20px">Booking Status</h5>
          <span class="badge badge-${b.status || "pending"}">
            ${b.status || "pending"}
          </span>
        </div>

        <hr style="margin:15px 0;">

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">

          <div><strong>Booking ID:</strong></div>
          <div>${escapeHtml(b.booking_id || "-")}</div>

          <div><strong>Customer Name:</strong></div>
          <div>${escapeHtml(b.full_name || bookingData.fullName || "-")}</div>

          <div><strong>Email:</strong></div>
          <div>${escapeHtml(b.email || bookingData.email || "-")}</div>

          <div><strong>Phone:</strong></div>
          <div>${escapeHtml(b.phone || bookingData.phone || "-")}</div>

          <div><strong>Event Type:</strong></div>
          <div>${escapeHtml(b.event_type || "-")}</div>

          <div><strong>Event Date:</strong></div>
          <div>${eventDate}</div>

          <div><strong>Event Time:</strong></div>
          <div>${eventTime}</div>

          <div><strong>Assigned Address:</strong></div>
          <div>${escapeHtml(b.assigned_address || "Not Assigned")}</div>

          <div><strong>Payment Status:</strong></div>
          <div>${escapeHtml(b.payment_status || "-")}</div>

          <div><strong>Payment Method:</strong></div>
          <div>${escapeHtml(b.payment_method || "-")}</div>

          <div><strong>Cancelled By:</strong></div>
          <div>${escapeHtml(b.cancelled_by || "Unknown")}</div>

          <div><strong>Booked On:</strong></div>
          <div>${createdAt}</div>

        </div>

        <hr style="margin:20px 0;">

        <h6 style="margin-bottom:10px;font-size:18px">Event Configuration</h6>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          ${extraFieldsHTML || "<div>No additional details</div>"}
        </div>

        <hr style="margin:20px 0;">

        <div style="background:#f9fafb;padding:12px;border-radius:8px;">

          <div style="display:flex;justify-content:space-between;">
            <span><strong>Total Amount</strong></span>
            <span>${formatCurrency(total)}</span>
          </div>

          <div style="display:flex;justify-content:space-between;color:#16a34a;margin-top:5px;">
            <span><strong>Paid</strong></span>
            <span>${formatCurrency(paid)}</span>
          </div>

          <div style="display:flex;justify-content:space-between;
                      color:${remaining > 0 ? "#dc2626" : "#16a34a"};
                      margin-top:5px;">
            <span><strong>Remaining</strong></span>
            <span>${formatCurrency(remaining)}</span>
          </div>

        </div>

      </div>
    `;

    modal.classList.add("active");

  } catch (err) {
    console.error("Admin viewBooking error:", err);
    showToast("Network error while loading booking", "error");
  }
}
 
/* =====================================================
   ACTION HANDLERS
===================================================== */
async function acceptBooking(id, button) {
  const address = prompt("Enter booking place address:");

  if (!address || address.trim().length < 5) {
    showToast("Valid address required", "error");
    return;
  }

  button.disabled = true;
  button.innerText = "Accepting...";

  try {
    const res = await fetch(`${API}/${id}/accept`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assigned_address: address.trim() })
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.message || "Failed", "error");
      button.disabled = false;
      button.innerText = "Accept";
      return;
    }

    showToast("Booking confirmed", "success");

  } catch {
    showToast("Network error", "error");
    button.disabled = false;
    button.innerText = "Accept";
  }
}

async function completeBooking(id, button) {

  if (!confirm("Mark this booking as completed?")) return;

  button.disabled = true;
  button.innerText = "Updating...";

  try {
    const res = await fetch(`${API}/${id}/complete`, {
      method: "PUT",
      credentials: "include"
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.message || "Failed", "error");
      button.disabled = false;
      button.innerText = "Mark Completed";
      return;
    }

    showToast("Booking completed", "success");

  } catch {
    showToast("Network error", "error");
    button.disabled = false;
    button.innerText = "Mark Completed";
  }
}

async function cancelBooking(id, button) {

  if (!confirm("Cancel this booking and refund advance?")) return;

  button.disabled = true;
  button.innerText = "Cancelling...";

  try {
    const res = await fetch(`${API}/${id}/cancel`, {
      method: "PUT",
      credentials: "include"
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.message || "Cancellation failed", "error");
      button.disabled = false;
      button.innerText = "Cancel";
      return;
    }

    showToast("Booking cancelled & refunded", "success");

  } catch {
    showToast("Network error", "error");
    button.disabled = false;
    button.innerText = "Cancel";
  }
}

/* =====================================================
   EVENT LISTENER
===================================================== */
tableBody.addEventListener("click", (e) => {
  const button = e.target.closest("button");
  if (!button) return;

  const id = button.dataset.id;
  const action = button.dataset.action;

  if (action === "view") viewBooking(id);
  if (action === "accept") acceptBooking(id, button);
  if (action === "complete") completeBooking(id, button);
  if (action === "cancel") cancelBooking(id, button);
});

document.getElementById("exportBookingsBtn").addEventListener("click", () => {
  window.location.href = "/api/admin/bookings/export";
});

/* =====================================================
   MODAL CONTROLS
===================================================== */
closeModalBtn.onclick = () => modal.classList.remove("active");
window.onclick = (e) => {
  if (e.target === modal) modal.classList.remove("active");
};

/* =====================================================
   INIT
===================================================== */
document.addEventListener("DOMContentLoaded", () => {
  loadBookings();
  loadBookingStats(); 
});