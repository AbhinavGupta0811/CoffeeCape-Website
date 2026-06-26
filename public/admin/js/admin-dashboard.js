/************************************************************
 * API PATHS
 ************************************************************/
const API = {
  USERS_STATS:    "/api/admin/users/stats",
  ORDERS_STATS:   "/api/admin/orders/stats",
  USERS:          "/api/admin/users",
  USER_DETAILS:   id => `/api/admin/users/${encodeURIComponent(id)}`,
  ORDERS:         "/api/admin/orders",
  ORDER_DETAILS:  id => `/api/admin/orders/${encodeURIComponent(id)}`,
  UPDATE_STATUS:  id => `/api/admin/orders/${encodeURIComponent(id)}/status`,
  CANCEL_ORDER:   id => `/api/admin/orders/${encodeURIComponent(id)}/cancel`,
  REFUND_APPROVE: id => `/api/admin/orders/${encodeURIComponent(id)}/refund`,
  REFUND_REJECT:  id => `/api/admin/orders/${encodeURIComponent(id)}/refund/reject`,
  USER_STATUS:    id => `/api/admin/users/${encodeURIComponent(id)}/status`,
  BOOKINGS_STATS: "/api/admin/bookings/stats",
  CONTACT:        "/api/admin/contact",
  LOGOUT:         "/api/admin/logout",
  LOGIN_PAGE:     "/Auth.html"
};

/************************************************************
 * CONSTANTS
 ************************************************************/
const FINAL_STATUSES = ["cancelled", "refunded", "delivered", "refund_rejected"];

/************************************************************
 * XSS PREVENTION — escapeHTML
 * Must be used on ALL user-generated content before rendering
 ************************************************************/
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

/************************************************************
 * SAFE FETCH WRAPPER
 * Handles 401/403 redirects and validates res.ok before returning data
 ************************************************************/
async function safeFetch(url, options = {}) {
  const defaultOptions = { credentials: "include" };
  const mergedOptions = { ...defaultOptions, ...options };

  const res = await fetch(url, mergedOptions);

  if (res.status === 401) {
    location.href = API.LOGIN_PAGE;
    throw new Error("Unauthorized");
  }

  if (res.status === 403) {
    throw new Error("Forbidden: You do not have permission to perform this action.");
  }

  if (!res.ok) {
    let errMsg = `Request failed: ${res.status}`;
    try {
      const errData = await res.json();
      errMsg = errData.message || errMsg;
    } catch (_) { /* ignore parse error */ }
    throw new Error(errMsg);
  }

  return res.json();
}

/************************************************************
 * CHART REGISTRY
 * Tracks and destroys existing Chart.js instances before re-creating
 ************************************************************/
const chartRegistry = {};

function safeCreateChart(canvasId, config) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  // Destroy previous instance to prevent memory leaks and canvas reuse errors
  if (chartRegistry[canvasId]) {
    chartRegistry[canvasId].destroy();
    chartRegistry[canvasId] = null;
  }

  chartRegistry[canvasId] = new Chart(canvas, config);
}

/************************************************************
 * SOCKET.IO CONNECTION (ADMIN)
 ************************************************************/
let socket;

function initSocket() {
  socket = io(window.location.origin, {
    transports: ["websocket"],
    withCredentials: true
  });

  socket.on("connect", () => {
    console.log("✅ Admin Socket Connected:", socket.id);
  });

  socket.on("connect_error", (err) => {
    console.error("❌ Socket connection error:", err.message);
  });

  socket.on("new-order", () => {
    loadOrders();
    loadStats();
    loadPendingReminders();
    fetchAnalytics();
  });

  socket.on("order-status-updated", () => {
    loadOrders();
    loadStats();
    loadPendingReminders();
    fetchAnalytics();
  });

  socket.on("disconnect", () => {
    console.warn("⚠️ Admin socket disconnected");
  });
}

/************************************************************
 * ELEMENTS
 ************************************************************/
const totalUsersEl      = document.getElementById("totalUsers");
const todayUsersEl      = document.getElementById("todayUsers");
const activeUsersEl     = document.getElementById("activeUsers");
const todayOrdersEl     = document.getElementById("todayOrders");
const todayRevenueEl    = document.getElementById("todayRevenue");
const usersTableBody    = document.querySelector("#usersTable tbody");
const ordersTableBody   = document.querySelector("#ordersTable tbody");
const emptyState        = document.getElementById("emptyState");
const contactReminderBox = document.getElementById("contactReminderBox");
const modal             = document.getElementById("orderModal");
const modalContent      = document.getElementById("orderModalContent");
const closeModalBtn     = document.getElementById("closeOrderModal");
const logoutBtn         = document.getElementById("logoutBtn");
const activeBtn         = document.getElementById("activeOrdersBtn");
const pastBtn           = document.getElementById("pastOrdersBtn");

/************************************************************
 * DEFAULT STATE
 ************************************************************/
let currentOrderType = "active";

/************************************************************
 * HELPERS
 ************************************************************/
const labelize = text =>
  text.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

/************************************************************
 * LOAD STATS
 ************************************************************/
async function loadStats() {
  try {
    const [users, orders] = await Promise.all([
      safeFetch(API.USERS_STATS),
      safeFetch(API.ORDERS_STATS)
    ]);

    if (totalUsersEl)   totalUsersEl.textContent   = users.totalUsers   ?? 0;
    if (todayUsersEl)   todayUsersEl.textContent   = users.todayUsers   ?? 0;
    if (activeUsersEl)  activeUsersEl.textContent  = users.activeUsers  ?? 0;
    if (todayOrdersEl)  todayOrdersEl.textContent  = orders.todayOrders ?? 0;
    if (todayRevenueEl) todayRevenueEl.textContent = orders.todayRevenue ?? 0;

  } catch (err) {
    if (err.message !== "Unauthorized") {
      console.error("Load stats error:", err);
    }
  }
}

/************************************************************
 * LOAD USERS
 ************************************************************/
async function loadUsers() {
  if (!usersTableBody) return;

  try {
    const data = await safeFetch(API.USERS);

    usersTableBody.innerHTML = "";

    if (!data.users || !data.users.length) {
      usersTableBody.innerHTML = `
        <tr>
          <td colspan="8" class="empty">No users found</td>
        </tr>
      `;
      return;
    }

    data.users.forEach(u => {
      const isBlocked = u.status === "blocked";

      // Protect admin by role flag, not hardcoded email
      const isProtected = !!u.is_main_admin;

      // All user-generated content is escaped before insertion
      const safeId        = escapeHTML(u.id);
      const safeName      = `${escapeHTML(u.first_name)} ${escapeHTML(u.last_name)}`;
      const safeEmail     = escapeHTML(u.email);
      const safePhone     = escapeHTML(u.phone || "N/A");
      const safeRole      = escapeHTML(u.role.toUpperCase());
      const safeStatus    = escapeHTML(u.status);
      const safeCreatedAt = new Date(u.created_at).toLocaleDateString();

      const actionCell = isProtected
        ? `<button class="btn-secondary" disabled>Protected</button>`
        : `
          <button
            class="${isBlocked ? "btn-primary" : "btn-danger"}"
            data-action="toggle-user"
            data-id="${safeId}"
            data-status="${safeStatus}"
          >
            ${isBlocked ? "Activate" : "Block"}
          </button>
        `;

      usersTableBody.insertAdjacentHTML("beforeend", `
        <tr>
          <td>#${safeId}</td>
          <td>${safeName}</td>
          <td>${safeEmail}</td>
          <td>${safePhone}</td>
          <td>${safeRole}</td>
          <td>${safeCreatedAt}</td>
          <td>
            <span class="status ${safeStatus}">${safeStatus}</span>
          </td>
          <td>
            <button class="btn-view" data-user-id="${safeId}">View</button>
            ${actionCell}
          </td>
        </tr>
      `);
    });

  } catch (err) {
    if (err.message !== "Unauthorized") {
      console.error("Load users error:", err);
      usersTableBody.innerHTML = `
        <tr>
          <td colspan="8" class="empty">Failed to load users</td>
        </tr>
      `;
    }
  }
}

/************************************************************
 * LOAD ORDERS
 ************************************************************/
async function loadOrders() {
  try {
    const data = await safeFetch(`${API.ORDERS}?type=${encodeURIComponent(currentOrderType)}`);
    renderOrders(data.orders || []);
  } catch (err) {
    if (err.message !== "Unauthorized" && ordersTableBody) {
      console.error("Load orders error:", err);
      ordersTableBody.innerHTML = `
        <tr>
          <td colspan="8" class="empty">Failed to load orders</td>
        </tr>
      `;
    }
  }
}

/************************************************************
 * RENDER ORDERS
 ************************************************************/
function renderOrders(orders) {
  if (!ordersTableBody) return;

  ordersTableBody.innerHTML = "";
  if (emptyState) emptyState.style.display = "none";

  if (!orders.length) {
    if (emptyState) emptyState.style.display = "block";
    return;
  }

  orders.forEach(order => {
    const isFinal = FINAL_STATUSES.includes(order.status);
    const isRefundRequest = order.status === "refund_requested";

    // Escape all user-generated data
    const safeOrderDbId    = escapeHTML(order.id);
    const safeOrderId      = escapeHTML(order.order_id);
    const safeName         = escapeHTML(order.name);
    const safeEmail        = escapeHTML(order.customer_email);
    const safeTotal        = escapeHTML(order.total);
    const safeStatus       = escapeHTML(order.status);
    const safePayStatus    = escapeHTML(order.payment_status);
    const safeCancelledBy  = escapeHTML(order.cancelled_by || "unknown");

    let actionButtons = "";

    if (isFinal) {
      actionButtons = `<span class="status completed">Final Order</span>`;
    } else if (isRefundRequest) {
      actionButtons = `
        <button class="btn-warning" data-action="approve-refund" data-id="${safeOrderDbId}">Approve</button>
        <button class="btn-danger"  data-action="reject-refund"  data-id="${safeOrderDbId}">Reject</button>
      `;
    } else if (order.status === "pending") {
      actionButtons = `
        <button class="btn-primary" data-action="approve" data-id="${safeOrderDbId}">Approve</button>
        <button class="btn-danger"  data-action="cancel"  data-id="${safeOrderDbId}">Cancel</button>
      `;
    } else if (order.status === "confirmed") {
      actionButtons = `
        <button class="btn-primary" data-action="next" data-next="preparing" data-id="${safeOrderDbId}">
          Start Preparing
        </button>
      `;
    } else if (order.status === "preparing") {
      actionButtons = `
        <button class="btn-primary" data-action="next" data-next="out_for_delivery" data-id="${safeOrderDbId}">
          Send For Delivery
        </button>
      `;
    } else if (order.status === "out_for_delivery") {
      actionButtons = `
        <button class="btn-primary" data-action="next" data-next="delivered" data-id="${safeOrderDbId}">
          Mark Delivered
        </button>
      `;
    }

    ordersTableBody.insertAdjacentHTML("beforeend", `
      <tr>
        <td>${safeOrderId}</td>
        <td>${safeName}</td>
        <td>${safeEmail}</td>
        <td>₹${safeTotal}</td>
        <td>
          <span class="status ${safeStatus}">${labelize(safeStatus)}</span>
        </td>
        <td>
          <span class="status ${safePayStatus}">${labelize(safePayStatus)}</span>
        </td>
        <td>
          ${
            order.status === "cancelled"
              ? `<span class="status cancelled">${labelize(safeCancelledBy)}</span>`
              : "None"
          }
        </td>
        <td>
          <div class="update-actions">
            <button class="btn-view" data-action="view" data-id="${safeOrderDbId}">View</button>
            ${actionButtons}
          </div>
        </td>
      </tr>
    `);
  });
}

/************************************************************
 * ORDERS TABLE EVENTS
************************************************************/
if (ordersTableBody) {
  ordersTableBody.addEventListener("click", async e => {

    const viewBtn         = e.target.closest("[data-action='view']");
    const approveBtn      = e.target.closest("[data-action='approve']");
    const nextBtn         = e.target.closest("[data-action='next']");
    const cancelBtn       = e.target.closest("[data-action='cancel']");
    const approveRefundBtn = e.target.closest("[data-action='approve-refund']");
    const rejectRefundBtn  = e.target.closest("[data-action='reject-refund']");

    if (viewBtn) {
      openOrderModal(viewBtn.dataset.id);
    }

    if (approveBtn) {
      if (!confirm("Approve this order?")) return;
      try {
        await safeFetch(API.UPDATE_STATUS(approveBtn.dataset.id), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "confirmed" })
        });
        loadOrders();
      } catch (err) {
        console.error("Approve error:", err);
        alert(err.message || "Failed to approve order");
      }
    }

    if (nextBtn) {
      const nextStatus = nextBtn.dataset.next;
      try {
        await safeFetch(API.UPDATE_STATUS(nextBtn.dataset.id), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus })
        });
        loadOrders();
      } catch (err) {
        console.error("Next status error:", err);
        alert(err.message || "Failed to update order status");
      }
    }

    if (cancelBtn) {
      if (!confirm("Cancel this order?")) return;
      try {
        await safeFetch(API.CANCEL_ORDER(cancelBtn.dataset.id), {
          method: "POST"
        });
        loadOrders();
      } catch (err) {
        console.error("Cancel error:", err);
        alert(err.message || "Failed to cancel order");
      }
    }

    if (approveRefundBtn) {
      if (!confirm("Approve refund for this order?")) return;
      try {
        await safeFetch(API.REFUND_APPROVE(approveRefundBtn.dataset.id), {
          method: "POST"
        });
        loadOrders();
      } catch (err) {
        console.error("Approve refund error:", err);
        alert(err.message || "Failed to approve refund");
      }
    }

    if (rejectRefundBtn) {
      const reason = prompt("Enter reason for rejecting refund:");
      if (!reason || reason.trim().length < 5) {
        alert("Rejection reason must be at least 5 characters");
        return;
      }
      try {
        await safeFetch(API.REFUND_REJECT(rejectRefundBtn.dataset.id), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: reason.trim() })
        });
        loadOrders();
      } catch (err) {
        console.error("Reject refund error:", err);
        alert(err.message || "Failed to reject refund");
      }
    }

  });
}

/************************************************************
 * USERS TABLE EVENTS (VIEW + BLOCK / ACTIVATE)
 ************************************************************/
if (usersTableBody) {
  usersTableBody.addEventListener("click", async e => {

    /* ===== VIEW USER DETAILS ===== */
    const viewBtn = e.target.closest(".btn-view");
    if (viewBtn) {
      const userId = viewBtn.dataset.userId;
      try {
        const data = await safeFetch(API.USER_DETAILS(userId));

        if (!data.success || !data.user) {
          alert("Failed to load user details");
          return;
        }

        const u = data.user;

        // All user fields escaped before innerHTML insertion
        const detailContent = document.getElementById("userDetailContent");
        if (detailContent) {
          detailContent.innerHTML = `
            <p><strong>First Name:</strong> ${escapeHTML(u.first_name || "-")}</p>
            <p><strong>Last Name:</strong>  ${escapeHTML(u.last_name  || "-")}</p>
            <p><strong>Email:</strong>      ${escapeHTML(u.email)}</p>
            <p><strong>Phone:</strong>      ${escapeHTML(u.phone || "-")}</p>
            <hr>
            <p><strong>Street:</strong>  ${escapeHTML(u.street  || "-")}</p>
            <p><strong>City:</strong>    ${escapeHTML(u.city    || "-")}</p>
            <p><strong>ZIP:</strong>     ${escapeHTML(u.zip     || "-")}</p>
            <p><strong>Country:</strong> ${escapeHTML(u.country || "-")}</p>
            <hr>
            <p><strong>Joined:</strong> ${new Date(u.created_at).toLocaleString()}</p>
          `;
        }

        const userDetailModal = document.getElementById("userDetailModal");
        if (userDetailModal) {
          userDetailModal.classList.add("active");

          // Attach close handler once (use { once: true } to avoid accumulation)
          const closeBtn = document.getElementById("closeUserModal");
          if (closeBtn) {
            closeBtn.addEventListener("click", () => {
              userDetailModal.classList.remove("active");
            }, { once: true });
          }
        }

      } catch (err) {
        if (err.message !== "Unauthorized") {
          console.error("User detail fetch error:", err);
          alert(err.message || "Error loading user details");
        }
      }
    }

    /* ===== BLOCK / ACTIVATE USER ===== */
    const toggleBtn = e.target.closest("[data-action='toggle-user']");
    if (toggleBtn) {
      const userId        = toggleBtn.dataset.id;
      const currentStatus = toggleBtn.dataset.status;
      const newStatus     = currentStatus === "active" ? "blocked" : "active";

      if (!confirm(`Are you sure you want to ${newStatus} this user?`)) return;

      try {
        await safeFetch(API.USER_STATUS(userId), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus })
        });
        loadUsers();
      } catch (err) {
        if (err.message !== "Unauthorized") {
          console.error("Toggle user error:", err);
          alert(err.message || "Failed to update user status");
        }
      }
    }

  });
}

/************************************************************
 * ORDER DETAIL MODAL
 * All user-generated content escaped with escapeHTML()
 ************************************************************/
async function openOrderModal(orderId) {
  try {
    const data = await safeFetch(API.ORDER_DETAILS(orderId));
    const order = data.order;

    if (!order) {
      alert("Order not found");
      return;
    }

    // Escape all user-supplied fields
    const safeOrderId      = escapeHTML(order.order_id);
    const safeName         = escapeHTML(order.name);
    const safePhone        = escapeHTML(order.phone);
    const safeStatus       = labelize(escapeHTML(order.status));
    const safePayStatus    = labelize(escapeHTML(order.payment_status));
    const safePayMethod    = labelize(escapeHTML(order.payment_method));
    const safeAddress      = escapeHTML(order.address);
    const safeRefundReason = escapeHTML(order.refund_reason || "");
    const safeNotes        = escapeHTML(order.notes || "");

    const itemRows = (order.items || []).map(i => `
      <tr>
        <td>${escapeHTML(i.name)}</td>
        <td>${escapeHTML(String(i.qty))}</td>
        <td>₹${(Number(i.qty) * Number(i.price)).toFixed(2)}</td>
      </tr>
    `).join("");

    const discountRow = Number(order.discount) > 0
      ? `
        <div style="display:flex;justify-content:space-between;color:#dc2626;">
          <span>Discount</span>
          <span>-₹${Number(order.discount).toFixed(2)}</span>
        </div>
      `
      : "";

    const refundBox = safeRefundReason
      ? `
        <div class="refund-detail-box" style="
          margin-top:14px;
          padding:12px;
          border-left:4px solid #f59e0b;
          background:#fff7ed;
          border-radius:6px;
        ">
          <strong>Refund Reason:</strong>
          <p style="margin-top:6px;color:#92400e;">${safeRefundReason}</p>
        </div>
      `
      : "";

    const notesBox = safeNotes
      ? `<p><strong>Notes:</strong> ${safeNotes}</p>`
      : "";

    modalContent.innerHTML = `
      <p><strong>Order ID:</strong>       ${safeOrderId}</p>
      <p><strong>Name:</strong>           ${safeName}</p>
      <p><strong>Phone:</strong>          ${safePhone}</p>
      <p><strong>Status:</strong>         ${safeStatus}</p>
      <p><strong>Payment Status:</strong> ${safePayStatus}</p>
      <p><strong>Payment Method:</strong> ${safePayMethod}</p>
      <p><strong>Address:</strong>        ${safeAddress}</p>
      <p><strong>Date:</strong>           ${new Date(order.created_at).toLocaleString()}</p>
      ${notesBox}

      <table>
        <tr><th>Item</th><th>Qty</th><th>Price</th></tr>
        ${itemRows}
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
          <span>₹${Number(order.gst).toFixed(2)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;">
          <span>Delivery Fee</span>
          <span>₹${Number(order.delivery_fee).toFixed(2)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;">
          <span>Tip</span>
          <span>₹${Number(order.tip).toFixed(2)}</span>
        </div>
        ${discountRow}
        <hr style="margin:8px 0;">
        <div style="display:flex;justify-content:space-between;font-weight:700;">
          <span>Total</span>
          <span>₹${Number(order.total).toFixed(2)}</span>
        </div>
      </div>

      ${refundBox}
    `;

    modal.classList.add("active");

  } catch (err) {
    if (err.message !== "Unauthorized") {
      console.error("Open order modal error:", err);
      alert(err.message || "Failed to load order details");
    }
  }
}

/************************************************************
 * PENDING ORDER REMINDERS
 ************************************************************/
const reminderBox = document.getElementById("orderReminderBox");

async function loadPendingReminders() {
  if (!reminderBox) return;

  try {
    const data = await safeFetch(`${API.ORDERS}?type=active`);

    const pendingOrders = (data.orders || []).filter(o =>
      ["pending", "confirmed", "preparing"].includes(o.status)
    );

    if (!pendingOrders.length) {
      reminderBox.innerHTML = `
        <div class="empty-reminder">No pending orders right now</div>
      `;
      return;
    }

    reminderBox.innerHTML = pendingOrders.map(order => `
      <div class="reminder-item">
        <div>
          <strong>#${escapeHTML(String(order.id))}</strong> — ${escapeHTML(order.customer_email)}
        </div>
        <span class="status ${escapeHTML(order.status)}">
          ${labelize(escapeHTML(order.status))}
        </span>
      </div>
    `).join("");

  } catch (err) {
    if (err.message !== "Unauthorized") {
      console.error("Reminder load error:", err);
      if (reminderBox) reminderBox.innerHTML = "Failed to load reminders";
    }
  }
}

/************************************************************
 * CONTACT MESSAGE REMINDER
 ************************************************************/
async function loadContactReminders() {
  if (!contactReminderBox) return;

  try {
    const messages = await safeFetch(API.CONTACT);

    const unread = Array.isArray(messages)
      ? messages.filter(m => !m.is_read)
      : [];

    contactReminderBox.innerHTML = "";

    if (!unread.length) {
      contactReminderBox.innerHTML = `
        <div class="empty-reminder">No new messages</div>
      `;
      return;
    }

    // Escape name and subject before rendering
    unread.slice(0, 5).forEach(msg => {
      contactReminderBox.insertAdjacentHTML("beforeend", `
        <div class="reminder-item">
          <div>
            <strong>${escapeHTML(msg.name)}</strong><br>
            <span style="font-size:13px;color:#64748b">
              ${escapeHTML(msg.subject)}
            </span>
          </div>
          <span class="status pending">New</span>
        </div>
      `);
    });

  } catch (err) {
    if (err.message !== "Unauthorized") {
      console.error("Contact reminder error:", err);
      if (contactReminderBox) contactReminderBox.innerHTML = "Failed to load messages";
    }
  }
}

/************************************************************
 * UI CONTROLS
 ************************************************************/
if (closeModalBtn) {
  closeModalBtn.addEventListener("click", () => {
    modal.classList.remove("active");
  });
}

function setActiveFilter(button) {
  if (activeBtn) activeBtn.classList.remove("active");
  if (pastBtn)   pastBtn.classList.remove("active");
  button.classList.add("active");
}

if (activeBtn) {
  activeBtn.addEventListener("click", () => {
    currentOrderType = "active";
    setActiveFilter(activeBtn);
    loadOrders();
  });
}

if (pastBtn) {
  pastBtn.addEventListener("click", () => {
    currentOrderType = "past";
    setActiveFilter(pastBtn);
    loadOrders();
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      await safeFetch(API.LOGOUT, { method: "POST" });
    } catch (_) { /* ignore — redirect regardless */ }
    location.href = API.LOGIN_PAGE;
  });
}

/************************************************************
 * ANALYTICS — uses safeCreateChart to prevent duplicate instances
 ************************************************************/
async function fetchAnalytics() {
  try {
    const stats = await safeFetch(API.ORDERS_STATS);
    if (!stats) return;

    generateRevenueChart(stats.revenueByDay   || []);
    generateOrdersChart(stats.ordersByDay     || []);
    generateStatusChart(stats.statusCount     || {});
    generateTopItemsChart(stats.topItems      || []);
  } catch (err) {
    if (err.message !== "Unauthorized") {
      console.error("Analytics load error:", err);
    }
  }
}

async function fetchBookingAnalytics() {
  try {
    const stats = await safeFetch(API.BOOKINGS_STATS);
    if (!stats || !stats.success) return;

    generateBookingGrowthChart(stats.bookingByDay   || []);
    generateBookingStatusChart(stats.bookingStatus  || {});
    generateBookingRevenueChart(stats.bookingRevenue || 0);
  } catch (err) {
    if (err.message !== "Unauthorized") {
      console.error("Booking analytics error:", err);
    }
  }
}

/* ============================
   CHART GENERATORS
   All use safeCreateChart to destroy previous instances first
============================ */
function generateRevenueChart(data) {
  if (!data.length) return;
  safeCreateChart("revenueChart", {
    type: "line",
    data: {
      labels: data.map(d => d.day),
      datasets: [{
        label: "Revenue",
        data: data.map(d => d.total),
        borderWidth: 2,
        tension: 0.4
      }]
    }
  });
}

function generateOrdersChart(data) {
  if (!data || !data.length) return;
  safeCreateChart("ordersChart", {
    type: "bar",
    data: {
      labels: data.map(d => d.day),
      datasets: [{
        label: "Orders",
        data: data.map(d => d.count)
      }]
    }
  });
}

function generateStatusChart(data) {
  safeCreateChart("statusChart", {
    type: "pie",
    data: {
      labels: Object.keys(data),
      datasets: [{
        data: Object.values(data)
      }]
    }
  });
}

function generateTopItemsChart(data) {
  if (!data.length) return;
  safeCreateChart("itemsChart", {
    type: "bar",
    data: {
      labels: data.map(i => i.name),
      datasets: [{
        label: "Sold Qty",
        data: data.map(i => i.qty)
      }]
    }
  });
}

function generateBookingGrowthChart(data) {
  if (!data.length) return;
  safeCreateChart("bookingGrowthChart", {
    type: "line",
    data: {
      labels: data.map(d => d.day),
      datasets: [{
        label: "Bookings",
        data: data.map(d => d.count),
        borderWidth: 2,
        tension: 0.4
      }]
    }
  });
}

function generateBookingStatusChart(data) {
  safeCreateChart("bookingStatusChart", {
    type: "doughnut",
    data: {
      labels: Object.keys(data),
      datasets: [{
        data: Object.values(data)
      }]
    }
  });
}

function generateBookingRevenueChart(amount) {
  safeCreateChart("bookingRevenueChart", {
    type: "bar",
    data: {
      labels: ["Completed Booking Revenue"],
      datasets: [{
        label: "Revenue",
        data: [amount]
      }]
    }
  });
}

/************************************************************
 * INIT
 ************************************************************/
document.addEventListener("DOMContentLoaded", () => {
  initSocket();
  fetchAnalytics();
  loadStats();
  loadUsers();
  loadOrders();
  loadPendingReminders();
  loadContactReminders();
  fetchBookingAnalytics();
});