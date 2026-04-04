/************************************************************
 * API PATHS
 ************************************************************/
const API = {
  USERS_STATS: "/api/admin/users/stats",
  ORDERS_STATS: "/api/admin/orders/stats",
  USERS: "/api/admin/users",
  USER_DETAILS: id => `/api/admin/users/${id}`,
  ORDERS: "/api/admin/orders",
  ORDER_DETAILS: id => `/api/admin/orders/${id}`,
  UPDATE_STATUS: id => `/api/admin/orders/${id}/status`,
  REFUND_APPROVE: id => `/api/admin/orders/${id}/refund`,
  REFUND_REJECT: id => `/api/admin/orders/${id}/refund/reject`,
  BOOKINGS_STATS: "/api/admin/bookings/stats",
  LOGOUT: "/api/admin/logout",
  LOGIN_PAGE: "/Auth.html"
};

/************************************************************
 * CONSTANTS
 ************************************************************/
const FINAL_STATUSES = ["cancelled", "refunded", "delivered", "refund_rejected"];

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

  socket.on("new-order", (data) => {
    console.log("📦 New Order:", data);
    loadOrders();
    loadStats();
    loadPendingReminders();
    fetchAnalytics();
  });

  socket.on("order-status-updated", (data) => {
    console.log("🔄 Status Updated:", data);
    loadOrders();
    loadStats();
    loadPendingReminders();
    fetchAnalytics();
  });
}

/************************************************************
 * ELEMENTS
 ************************************************************/
const totalUsersEl   = document.getElementById("totalUsers");
const todayUsersEl   = document.getElementById("todayUsers");
const activeUsersEl  = document.getElementById("activeUsers");
const todayOrdersEl  = document.getElementById("todayOrders");
const todayRevenueEl = document.getElementById("todayRevenue");

const usersTableBody  = document.querySelector("#usersTable tbody");
const ordersTableBody = document.querySelector("#ordersTable tbody");
const emptyState      = document.getElementById("emptyState");
const contactReminderBox = document.getElementById("contactReminderBox");

const modal         = document.getElementById("orderModal");
const modalContent  = document.getElementById("orderModalContent");
const closeModalBtn = document.getElementById("closeOrderModal");

const logoutBtn = document.getElementById("logoutBtn");
const activeBtn = document.getElementById("activeOrdersBtn");
const pastBtn   = document.getElementById("pastOrdersBtn");

/************************************************************
 * DEFAULT STATE
 * → load ALL orders after login
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
  const [uRes, oRes] = await Promise.all([
    fetch(API.USERS_STATS, { credentials: "include" }),
    fetch(API.ORDERS_STATS, { credentials: "include" })
  ]);

  if (uRes.status === 401) return location.href = API.LOGIN_PAGE;

  const users  = await uRes.json();
  const orders = await oRes.json();

  if (totalUsersEl)   totalUsersEl.textContent   = users.totalUsers ?? 0;
  if (todayUsersEl)   todayUsersEl.textContent   = users.todayUsers ?? 0;
  if (activeUsersEl)  activeUsersEl.textContent  = users.activeUsers ?? 0;
  if (todayOrdersEl)  todayOrdersEl.textContent  = orders.todayOrders ?? 0;
  if (todayRevenueEl) todayRevenueEl.textContent = orders.todayRevenue ?? 0;
}

/************************************************************
 * LOAD USERS
 ************************************************************/
async function loadUsers() {
  if (!usersTableBody) return;
  try {
    const res = await fetch(API.USERS, {
      credentials: "include"
    });

    if (res.status === 401) {
      location.href = API.LOGIN_PAGE;
      return;
    }
    const data = await res.json();
    usersTableBody.innerHTML = "";

    if (!data.users.length) {
      usersTableBody.innerHTML = `
        <tr>
          <td colspan="6" class="empty">
            No users found
          </td>
        </tr>
      `;
      return;
    }

    data.users.forEach(u => {
      const isBlocked = u.status === "blocked";
      usersTableBody.insertAdjacentHTML("beforeend", `
        <tr>

          <td>#${u.id}</td>
          <td>${u.first_name} ${u.last_name}</td>
          <td>${u.email}</td>
          <td>${u.phone || "N/A"}</td>
          <td>${u.role.toUpperCase()}</td>
          <td>${new Date(u.created_at).toLocaleDateString()}</td>

          <td>
            <span class="status ${u.status}">
              ${u.status}
            </span>
          </td>

          <td>

            <button class="btn-view" data-user-id="${u.id}">
              View
            </button>

            ${
              u.email.toLowerCase() === "admin@coffeecape.com"
              ? `
                <button class="btn-secondary" disabled>
                  Protected
                </button>
              `
              : `
                <button
                  class="${isBlocked ? "btn-primary" : "btn-danger"}"
                  data-action="toggle-user"
                  data-id="${u.id}"
                  data-status="${u.status}"
                >
                  ${isBlocked ? "Activate" : "Block"}
                </button>
              `
            }
          </td>
        </tr>
      `);
    });
  } catch (err) {
    console.error("Load users error:", err);
    usersTableBody.innerHTML = `
      <tr>
        <td colspan="6" class="empty">
          Failed to load users
        </td>
      </tr>
    `;
  }
}

/************************************************************
 * LOAD ORDERS
 ************************************************************/
async function loadOrders() {
  const res = await fetch(
    `${API.ORDERS}?type=${currentOrderType}`,
    { credentials: "include" }
  );

  if (res.status === 401) return location.href = API.LOGIN_PAGE;

  const data = await res.json();
  renderOrders(data.orders || []);
}

/************************************************************
 * RENDER ORDERS
 ************************************************************/
function renderOrders(orders) {
  if (!ordersTableBody) return;

  ordersTableBody.innerHTML = "";
  emptyState.style.display = "none";

  if (!orders.length) {
    emptyState.style.display = "block";
    return;
  }

  orders.forEach(order => {

    const isFinal = FINAL_STATUSES.includes(order.status);
    const isRefundRequest = order.status === "refund_requested";

    let actionButtons = "";

    if (isFinal) {
      actionButtons = `<span class="status completed">Final Order</span>`;
    }

    else if (isRefundRequest) {
      actionButtons = `
        <button class="btn-warning"
          data-action="approve-refund"
          data-id="${order.id}">
          Approve
        </button>

        <button class="btn-danger"
          data-action="reject-refund"
          data-id="${order.id}">
          Reject
        </button>
      `;
    }

    else if (order.status === "pending") {
      actionButtons = `
        <button class="btn-primary"
          data-action="approve"
          data-id="${order.id}">
          Approve
        </button>

        <button class="btn-danger"
          data-action="cancel"
          data-id="${order.id}">
          Cancel
        </button>
      `;
    }

    else if (order.status === "confirmed") {
      actionButtons = `
        <button class="btn-primary"
          data-action="next"
          data-next="preparing"
          data-id="${order.id}">
          Start Preparing
        </button>
      `;
    }

    else if (order.status === "preparing") {
      actionButtons = `
        <button class="btn-primary"
          data-action="next"
          data-next="out_for_delivery"
          data-id="${order.id}">
          Send For Delivery
        </button>
      `;
    }

    else if (order.status === "out_for_delivery") {
      actionButtons = `
        <button class="btn-primary"
          data-action="next"
          data-next="delivered"
          data-id="${order.id}">
          Mark Delivered
        </button>
      `;
    }

    ordersTableBody.insertAdjacentHTML("beforeend", `
      <tr>
        <td>${order.order_id}</td>
        <td>${order.name}</td>
        <td>${order.customer_email}</td>
        <td>₹${order.total}</td>

        <td>
          <span class="status ${order.status}">
            ${labelize(order.status)}
          </span>
        </td>

        <td>
          <span class="status ${order.payment_status}">
            ${labelize(order.payment_status)}
          </span>
        </td>

        <td>
          ${
            order.status === "cancelled"
              ? `<span class="status cancelled">
                  ${labelize(order.cancelled_by || "unknown")}
                </span>`
              : "None"
          }
        </td>

        <td>
          <div class="update-actions">

            <button class="btn-view"
              data-action="view"
              data-id="${order.id}">
              View
            </button>

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

    const viewBtn    = e.target.closest("[data-action='view']");
    const approveBtn = e.target.closest("[data-action='approve']");
    const nextBtn    = e.target.closest("[data-action='next']");
    const cancelBtn  = e.target.closest("[data-action='cancel']");
    const approveRefundBtn = e.target.closest("[data-action='approve-refund']");
    const rejectRefundBtn  = e.target.closest("[data-action='reject-refund']");

    if (viewBtn) {
      openOrderModal(viewBtn.dataset.id);
    }

    if (approveBtn) {
      if (!confirm("Approve this order?")) return;

      try {
        const res = await fetch(API.UPDATE_STATUS(approveBtn.dataset.id), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status: "confirmed" })
        });

        if (!res.ok) {
          const error = await res.text();
          console.error("Approve failed:", error);
          alert("Failed to approve order");
          return;
        }

        loadOrders();
      } catch (err) {
        console.error("Approve error:", err);
        alert("Server error");
      }
    }

    if (nextBtn) {
      const nextStatus = nextBtn.dataset.next;

      await fetch(API.UPDATE_STATUS(nextBtn.dataset.id), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: nextStatus })
      });

      loadOrders();
    }

    if (cancelBtn) {
      if (!confirm("Cancel this order?")) return;

      await fetch(`/api/admin/orders/${cancelBtn.dataset.id}/cancel`, {
        method: "POST",
        credentials: "include"
      });

      loadOrders();
    }

    if (approveRefundBtn) {
      if (!confirm("Approve refund for this order?")) return;
      await fetch(API.REFUND_APPROVE(approveRefundBtn.dataset.id), {
        method: "POST",
        credentials: "include"
      });
      loadOrders();
    }

    if (rejectRefundBtn) {
      const reason = prompt("Enter reason for rejecting refund:");
      if (!reason || reason.trim().length < 5) {
        alert("Rejection reason must be at least 5 characters");
        return;
      }
      await fetch(API.REFUND_REJECT(rejectRefundBtn.dataset.id), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason })
      });
      loadOrders();
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
        const res = await fetch(API.USER_DETAILS(userId), {
          credentials: "include"
        });
        if (res.status === 401) {
          location.href = API.LOGIN_PAGE;
          return;
        }

        const data = await res.json();
        if (!data.success || !data.user) {
          alert("Failed to load user details");
          return;
        }
        const u = data.user;
        document.getElementById("userDetailContent").innerHTML = `
          <p><strong>First Name:</strong> ${u.first_name || "-"}</p>
          <p><strong>Last Name:</strong> ${u.last_name || "-"}</p>
          <p><strong>Email:</strong> ${u.email}</p>
          <p><strong>Phone:</strong> ${u.phone || "-"}</p>

          <hr>

          <p><strong>Street:</strong> ${u.street || "-"}</p>
          <p><strong>City:</strong> ${u.city || "-"}</p>
          <p><strong>ZIP:</strong> ${u.zip || "-"}</p>
          <p><strong>Country:</strong> ${u.country || "-"}</p>

          <hr>

          <p><strong>Joined:</strong> ${new Date(u.created_at).toLocaleString()}</p>
        `;
        document.getElementById("userDetailModal").classList.add("active");
      } catch (err) {
        console.error("User detail fetch error:", err);
        alert("Error loading user details");
      }
      document.getElementById("closeUserModal")?.addEventListener("click", ()=>{
        document.getElementById("userDetailModal").classList.remove("active");
      });
    }

    /* ===== BLOCK / ACTIVATE USER ===== */
    const toggleBtn = e.target.closest("[data-action='toggle-user']");
    if (toggleBtn) {
      const userId = toggleBtn.dataset.id;
      const currentStatus = toggleBtn.dataset.status;

      const newStatus =
        currentStatus === "active" ? "blocked" : "active";

      if (!confirm(`Are you sure you want to ${newStatus} this user?`)) {
        return;
      }

      try {
        const res = await fetch(`/api/admin/users/${userId}/status`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status: newStatus })
        });

        if (!res.ok) {
          alert("Failed to update user status");
          return;
        }

        loadUsers(); // refresh
      } catch (err) {
        console.error("Toggle user error:", err);
        alert("Server error");
      }
    }
  });
}

/************************************************************
 * ORDER DETAIL MODAL
 ************************************************************/
async function openOrderModal(orderId) {
  const res = await fetch(API.ORDER_DETAILS(orderId), {
    credentials: "include"
  });

  const { order } = await res.json();

  modalContent.innerHTML = `
    <p><strong>Order ID:</strong> ${order.order_id}</p>
    <p><strong>Name:</strong> ${order.name}</p>
    <p><strong>Phone:</strong> ${order.phone}</p>
    <p><strong>Status:</strong> ${labelize(order.status)}</p>
    <p><strong>Payment Status:</strong> ${labelize(order.payment_status)}</p>
    <p><strong>Payment Method:</strong> ${labelize(order.payment_method)}</p>
    <p><strong>Address:</strong> ${order.address}</p>
    <p><strong>Date:</strong> ${new Date(order.created_at).toLocaleString()}</p>

    <table>
      <tr><th>Item</th><th>Qty</th><th>Price</th></tr>
      ${order.items.map(i => `
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
        <span>₹${Number(order.total).toFixed(2)}</span>
      </div>

    </div>

    ${
      order.refund_reason
        ? `
          <div class="refund-detail-box" style="
            margin-top:14px;
            padding:12px;
            border-left:4px solid #f59e0b;
            background:#fff7ed;
            border-radius:6px;
          ">
            <strong>Refund Reason:</strong>
            <p style="margin-top:6px;color:#92400e;">
              ${order.refund_reason}
            </p>
          </div>
        `
        : ""
    }
  `;
  
  modal.classList.add("active");
}

/************************************************************
 * PENDING ORDER REMINDERS
 ************************************************************/

const reminderBox = document.getElementById("orderReminderBox");

async function loadPendingReminders(){
  if(!reminderBox) return;

  try{
    const res = await fetch(API.ORDERS + "?type=active", {
      credentials:"include"
    });

    if(res.status === 401){
      location.href = API.LOGIN_PAGE;
      return;
    }

    const data = await res.json();

    // filter only pending / preparing orders
    const pendingOrders = (data.orders || []).filter(o =>
      o.status === "pending" || o.status === "confirmed" || o.status === "preparing"
    );

    if(!pendingOrders.length){
      reminderBox.innerHTML = `
        <div class="empty-reminder">
          No pending orders right now
        </div>
      `;
      return;
    }

    reminderBox.innerHTML = pendingOrders.map(order => `
      <div class="reminder-item">
        <div>
          <strong>#${order.id}</strong> — ${order.customer_email}
        </div>
        <span class="status ${order.status}">
          ${labelize(order.status)}
        </span>
      </div>
    `).join("");

  }catch(err){
    console.error("Reminder load error:", err);
    reminderBox.innerHTML = "Failed to load reminders";
  }
}

/************************************************************
 * CONTACT MESSAGE REMINDER (DASHBOARD ONLY)
 ************************************************************/
async function loadContactReminders(){
  if(!contactReminderBox) return
  try{

    const res = await fetch("/api/admin/contact", {
      credentials:"include"
    });

    if(res.status === 401){
      location.href = API.LOGIN_PAGE;
      return;
    }

    const messages = await res.json();

    // only unread messages
    const unread = messages.filter(m => !m.is_read);

    if(!unread.length){
      contactReminderBox.innerHTML = `
        <div class="empty-reminder">
          No new messages
        </div>
      `;
      return;
    }

    // show latest 5
    unread.slice(0,5).forEach(msg => {

      contactReminderBox.insertAdjacentHTML("beforeend",`
        <div class="reminder-item">
          <div>
            <strong>${msg.name}</strong><br>
            <span style="font-size:13px;color:#64748b">
              ${msg.subject}
            </span>
          </div>
          <span class="status pending">New</span>
        </div>
      `);

    });

  }catch(err){
    console.error("Contact reminder error:",err);
    contactReminderBox.innerHTML = "Failed to load messages";
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

function setActiveFilter(button){
  activeBtn.classList.remove("active");
  pastBtn.classList.remove("active");

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
    await fetch(API.LOGOUT, { method: "POST", credentials: "include" });
    location.href = API.LOGIN_PAGE;
  });
}

/* ============================
   REAL TIME DASHBOARD CHARTS
============================ */
async function fetchAnalytics() {
  try {
    const res = await fetch(API.ORDERS_STATS, {
      credentials: "include"
    });
    const stats = await res.json();
    if (!stats) return;

    generateRevenueChart(stats.revenueByDay || []);
    generateOrdersChart(stats.ordersByDay || []);
    generateStatusChart(stats.statusCount || {});
    generateTopItemsChart(stats.topItems || []);
  } catch (err) {
    console.error("Analytics load error:", err);
  }
}

async function fetchBookingAnalytics() {

  try {

    const res = await fetch(API.BOOKINGS_STATS, {
      credentials: "include"
    });

    if (res.status === 401) {
      location.href = API.LOGIN_PAGE;
      return;
    }

    const stats = await res.json();
    if (!stats.success) return;

    generateBookingGrowthChart(stats.bookingByDay || []);
    generateBookingStatusChart(stats.bookingStatus || {});
    generateBookingRevenueChart(stats.bookingRevenue || 0);

  } catch (err) {
    console.error("Booking analytics error:", err);
  }
}

/* ============================
   REVENUE OVER TIME
============================ */
function generateRevenueChart(data) {
  if (!data.length) return;
  new Chart(document.getElementById("revenueChart"), {
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

function generateBookingGrowthChart(data) {
  if (!data.length) return;

  new Chart(document.getElementById("bookingGrowthChart"), {
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

  new Chart(document.getElementById("bookingStatusChart"), {
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

  new Chart(document.getElementById("bookingRevenueChart"), {
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

/* ============================
   ORDERS PER DAY
============================ */
function generateTopItemsChart(data) {
  if (!data.length) return;
  new Chart(document.getElementById("itemsChart"), {
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

/* ============================
   ORDER STATUS DISTRIBUTION
============================ */
function generateStatusChart(data) {
  new Chart(document.getElementById("statusChart"), {
    type: "pie",
    data: {
      labels: Object.keys(data),
      datasets: [{
        data: Object.values(data)
      }]
    }
  });
}

/* ============================
   TOP SELLING ITEMS
============================ */
function generateOrdersChart(data) {
  if (!data || !data.length) return;
  new Chart(document.getElementById("ordersChart"), {
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