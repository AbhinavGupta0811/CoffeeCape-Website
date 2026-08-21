// Collapsible sidebar
(() => {
  const sidebar = document.getElementById("adminSidebar");
  const sidebarToggle = document.getElementById("sidebarToggle");
  const sidebarClose = document.getElementById("sidebarClose");
  const sidebarOverlay = document.getElementById("sidebarOverlay");
  if (!sidebar || !sidebarToggle || !sidebarClose || !sidebarOverlay) return;
  function setSidebarState(open) {
    sidebar.classList.toggle("open", open);
    sidebarOverlay.classList.toggle("active", open);
    document.body.classList.toggle("sidebar-open", open);
    sidebarToggle.setAttribute("aria-expanded", String(open));
    sidebar.setAttribute("aria-hidden", String(!open));
    sidebarOverlay.setAttribute("aria-hidden", String(!open));
  }
  sidebarToggle.addEventListener("click", () => {
    const isOpen = sidebar.classList.contains("open");
    setSidebarState(!isOpen);
  });
  sidebarClose.addEventListener("click", () => setSidebarState(false));
  sidebarOverlay.addEventListener("click", () => setSidebarState(false));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && sidebar.classList.contains("open")) {
      setSidebarState(false);
    }
  });
  sidebar.querySelectorAll("nav a").forEach(link => {
    link.addEventListener("click", () => setSidebarState(false));
  });
})();

/************************************************************
  API PATHS
************************************************************/
const API = {
  ORDERS: "/api/admin/orders",
  ORDER_DETAILS: id => `/api/admin/orders/${id}`,
  UPDATE_STATUS: id => `/api/admin/orders/${id}/status`,
  CANCEL_ORDER: id => `/api/admin/orders/${id}/cancel`,
  REFUND_APPROVE: id => `/api/admin/orders/${id}/refund`,
  REFUND_REJECT: id => `/api/admin/orders/${id}/refund/reject`,
  DELIVERY_BOYS: "/api/admin/orders/delivery-boys",
  ASSIGN_DELIVERY: id => `/api/admin/orders/${id}/assign-delivery`,
  DELIVERY_ASSIGNMENT: id => `/api/admin/orders/${id}/delivery-assignment`,
  REASSIGN_DELIVERY: id => `/api/admin/orders/${id}/reassign-delivery`,
  LOGIN_PAGE: "/Auth.html"
};

/************************************************************
  CONSTANTS
************************************************************/
const FINAL_STATUSES = ["cancelled", "refunded", "delivered", "refund_rejected"];

/************************************************************
  ELEMENTS
************************************************************/
const ordersTableBody = document.getElementById("ordersTableBody");
const emptyState = document.getElementById("emptyState");
const modal = document.getElementById("orderModal");
const modalContent = document.getElementById("orderModalContent");
const closeModalBtn = document.getElementById("closeOrderModal");
const todayOrdersEl = document.getElementById("todayOrders");
const totalRevenueEl = document.getElementById("totalRevenue");
const pendingOrdersEl = document.getElementById("pendingOrders");
const processingOrdersEl = document.getElementById("processingOrders");
const deliveredOrdersEl = document.getElementById("deliveredOrders");
const refundRequestsEl = document.getElementById("refundRequests");
const activeBtn = document.getElementById("activeOrdersBtn");
const pastBtn = document.getElementById("pastOrdersBtn");
const deliveryAssignmentModal = document.getElementById("deliveryAssignmentModal");
const closeDeliveryAssignmentModalBtn = document.getElementById("closeDeliveryAssignmentModal");
const cancelDeliveryAssignment = document.getElementById("cancelDeliveryAssignment");
const confirmDeliveryAssignment = document.getElementById("confirmDeliveryAssignment");
const deliveryBoySelect = document.getElementById("deliveryBoySelect");
const assignmentOrderInfo = document.getElementById("assignmentOrderInfo");
const assignmentModalTitle = document.getElementById("assignmentModalTitle");

let assignmentOrderId = null;
let assignmentMode = "assign";

/************************************************************
  STATE
************************************************************/
let currentOrderType = "active";
let deliveryBoys = [];

/************************************************************
  HELPERS
************************************************************/
function labelize(text) {
  return String(text || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/************************************************************
  SOCKET.IO CONNECTION
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

  socket.on("connect_error", err => {
    console.error("❌ Socket connection error:", err.message);
  });

  socket.on("new-order", async data => {
    console.log("📦 New Order:", data);
    await loadOrders();
    await loadAllOrderStats();
    if (typeof loadPendingReminders === "function") {
      loadPendingReminders();
    }
    if (typeof fetchAnalytics === "function") {
      fetchAnalytics();
    }
  });

  socket.on("order-status-updated", async data => {
    console.log("🔄 Status Updated:", data);
    await loadOrders();
    await loadAllOrderStats();
    if (typeof loadPendingReminders === "function") {
      loadPendingReminders();
    }
    if (typeof fetchAnalytics === "function") {
      fetchAnalytics();
    }
  });
}

/************************************************************
  ORDER STATS
************************************************************/
async function loadAllOrderStats() {
  try {
    const res = await fetch(`${API.ORDERS}?type=all`, {
      credentials: "include"
    });

    if (res.status === 401) {
      window.location.href = API.LOGIN_PAGE;
      return;
    }

    const data = await res.json();
    updateOrderStats(data.orders || []);
  } catch (err) {
    console.error("Stats error:", err);
  }
}

function updateOrderStats(orders = []) {
  const today = new Date();
  let todayOrders = 0;
  let totalRevenue = 0;
  let pendingOrders = 0;
  let processingOrders = 0;
  let deliveredOrders = 0;
  let refundRequests = 0;

  orders.forEach(order => {
    const orderDate = new Date(order.created_at);
    const isToday =
      orderDate.getDate() === today.getDate() &&
      orderDate.getMonth() === today.getMonth() &&
      orderDate.getFullYear() === today.getFullYear();

    if (isToday) {
      todayOrders++;
    }

    if (
      order.payment_status === "paid" ||
      order.payment_status === "completed"
    ) {
      totalRevenue += Number(order.total || 0);
    }

    if (order.status === "pending") {
      pendingOrders++;
    }

    if (
      order.status === "confirmed" ||
      order.status === "preparing" ||
      order.status === "ready_for_pickup" ||
      order.status === "out_for_delivery"
    ) {
      processingOrders++;
    }

    if (order.status === "delivered") {
      deliveredOrders++;
    }

    if (order.status === "refund_requested") {
      refundRequests++;
    }
  });

  if (todayOrdersEl) {
    todayOrdersEl.textContent = todayOrders;
  }

  if (totalRevenueEl) {
    totalRevenueEl.textContent = `₹${totalRevenue.toLocaleString("en-IN")}`;
  }

  if (pendingOrdersEl) {
    pendingOrdersEl.textContent = pendingOrders;
  }

  if (processingOrdersEl) {
    processingOrdersEl.textContent = processingOrders;
  }

  if (deliveredOrdersEl) {
    deliveredOrdersEl.textContent = deliveredOrders;
  }

  if (refundRequestsEl) {
    refundRequestsEl.textContent = refundRequests;
  }
}

/************************************************************
  LOAD ORDERS
************************************************************/
async function loadOrders() {
  try {
    const res = await fetch(`${API.ORDERS}?type=${currentOrderType}`, {
      credentials: "include"
    });

    if (res.status === 401) {
      window.location.href = API.LOGIN_PAGE;
      return;
    }

    const data = await res.json();
    renderOrders(data.orders || []);
  } catch (err) {
    console.error("Orders load error:", err);
  }
}

/************************************************************
  LOAD DELIVERY BOYS
************************************************************/
async function loadDeliveryBoys() {
  try {
    const response = await fetch(API.DELIVERY_BOYS, {
      method: "GET",
      credentials: "include"
    });

    if (response.status === 401) {
      window.location.href = API.LOGIN_PAGE;
      return;
    }

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(
        data.message || "Unable to load delivery boys."
      );
    }

    deliveryBoys = Array.isArray(data.deliveryBoys)
      ? data.deliveryBoys
      : [];
  } catch (error) {
    console.error("Delivery boys loading error:", error);
    deliveryBoys = [];
  }
}

/************************************************************
  GET DELIVERY ASSIGNMENT
************************************************************/
async function getDeliveryAssignment(orderId) {
  try {
    const response = await fetch(
      API.DELIVERY_ASSIGNMENT(orderId),
      {
        method: "GET",
        credentials: "include"
      }
    );

    if (response.status === 401) {
      window.location.href = API.LOGIN_PAGE;
      return null;
    }

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(
        data.message || "Unable to fetch assignment."
      );
    }

    return data.assignment || null;
  } catch (error) {
    console.error("Assignment fetch error:", error);
    return null;
  }
}

/************************************************************
  POPULATE DELIVERY BOYS
************************************************************/
function populateDeliveryBoys() {
  if (!deliveryBoySelect) return;

  deliveryBoySelect.innerHTML = `
    <option value="">Select delivery boy</option>
  `;

  if (!deliveryBoys.length) {
    deliveryBoySelect.innerHTML = `
      <option value="">No active delivery boys available</option>
    `;
    return;
  }

  deliveryBoys.forEach(deliveryBoy => {
    const option = document.createElement("option");
    option.value = deliveryBoy.id;
    option.textContent =
      `${deliveryBoy.name} — ${deliveryBoy.employee_id}`;
    deliveryBoySelect.appendChild(option);
  });
}

/************************************************************
  OPEN DELIVERY ASSIGNMENT MODAL
************************************************************/
async function openDeliveryAssignmentModal(orderId, mode = "assign") {
  if (!deliveryAssignmentModal) return;

  assignmentOrderId = Number(orderId);
  assignmentMode = mode;

  try {
    const orderResponse = await fetch(
      API.ORDER_DETAILS(orderId),
      {
        credentials: "include"
      }
    );

    if (orderResponse.status === 401) {
      window.location.href = API.LOGIN_PAGE;
      return;
    }

    const orderData = await orderResponse.json();

    if (!orderResponse.ok || !orderData.success) {
      alert(
        orderData.message ||
        "Unable to load order."
      );
      return;
    }

    const order = orderData.order;

    assignmentOrderInfo.innerHTML = `
      <p><strong>Order ID:</strong> ${escapeHTML(order.order_id)}</p>
      <p><strong>Customer:</strong> ${escapeHTML(order.name)}</p>
      <p><strong>Total:</strong> ₹${Number(order.total || 0).toFixed(2)}</p>
      <p><strong>Address:</strong> ${escapeHTML(order.address)}</p>
    `;

    populateDeliveryBoys();

    if (mode === "reassign") {
      const assignment = await getDeliveryAssignment(orderId);

      if (assignment) {
        deliveryBoySelect.value =
          String(assignment.delivery_user_id);
      }

      if (assignmentModalTitle) {
        assignmentModalTitle.textContent =
          "Reassign Delivery Boy";
      }

      confirmDeliveryAssignment.textContent = "Reassign";
    } else {
      if (assignmentModalTitle) {
        assignmentModalTitle.textContent =
          "Assign Delivery Boy";
      }

      confirmDeliveryAssignment.textContent = "Assign";
    }

    deliveryAssignmentModal.classList.add("active");
  } catch (error) {
    console.error(
      "Open delivery assignment modal error:",
      error
    );

    alert(
      error.message ||
      "Unable to open delivery assignment."
    );
  }
}

/************************************************************
  RENDER ORDERS
************************************************************/
function renderOrders(orders) {
  if (!ordersTableBody) return;

  ordersTableBody.innerHTML = "";
  if (emptyState) {
    emptyState.style.display = "none";
  }

  if (!orders.length) {
    if (emptyState) {
      emptyState.style.display = "block";
    }
    return;
  }

  orders.forEach(order => {
    const isFinal = FINAL_STATUSES.includes(order.status);
    const isRefundRequest = order.status === "refund_requested";
    let actionButtons = "";

    if (isFinal) {
      actionButtons = `
        <span class="status completed">Final Order</span>
      `;
    } else if (isRefundRequest) {
      actionButtons = `
        <button class="btn-warning" data-action="approve-refund" data-id="${order.id}">
          Approve
        </button>
        <button class="btn-danger" data-action="reject-refund" data-id="${order.id}">
          Reject
        </button>
      `;
    } else if (order.status === "pending") {
      actionButtons = `
        <button class="btn-primary" data-action="approve" data-id="${order.id}">
          Approve
        </button>
        <button class="btn-danger" data-action="cancel" data-id="${order.id}">
          Cancel
        </button>
      `;
    } else if (order.status === "confirmed") {
      actionButtons = `
        <button class="btn-primary" data-action="next" data-next="preparing" data-id="${order.id}">
          Start Preparing
        </button>
      `;
    } else if (order.status === "preparing") {
      actionButtons = `
        <button class="btn-primary" data-action="next" data-next="ready_for_pickup" data-id="${order.id}">
          Mark Ready
        </button>
      `;
    } else if (order.status === "ready_for_pickup") {
      actionButtons = `
        <button class="btn-primary" data-action="assign-delivery" data-id="${order.id}">
          <i class="fa-solid fa-motorcycle"></i>
          Assign Delivery
        </button>
      `;
    } else if (order.status === "out_for_delivery") {
      actionButtons = `
        <span class="status out_for_delivery">
          Delivery Assigned
        </span>
        <button class="btn-secondary" data-action="reassign-delivery" data-id="${order.id}">
          Reassign
        </button>
      `;
    }

    ordersTableBody.insertAdjacentHTML("beforeend", `
      <tr>
        <td>${escapeHTML(order.order_id)}</td>
        <td>${escapeHTML(order.name)}</td>
        <td>${escapeHTML(order.customer_email)}</td>
        <td>₹${Number(order.total || 0).toFixed(2)}</td>
        <td>
          <span class="status ${escapeHTML(order.status)}">
            ${labelize(order.status)}
          </span>
        </td>
        <td>
          <span class="status ${escapeHTML(order.payment_status)}">
            ${labelize(order.payment_status)}
          </span>
        </td>
        <td>
          ${
            order.status === "cancelled"
              ? `<span class="status cancelled">${labelize(order.cancelled_by || "unknown")}</span>`
              : "None"
          }
        </td>
        <td>
          <button class="btn-view" data-action="view" data-id="${order.id}">
            View
          </button>
          ${actionButtons}
        </td>
      </tr>
    `);
  });
}

/************************************************************
  TABLE EVENTS
************************************************************/
if (ordersTableBody) {
  ordersTableBody.addEventListener("click", async e => {
    const viewBtn =
      e.target.closest("[data-action='view']");
    const approveBtn =
      e.target.closest("[data-action='approve']");
    const nextBtn =
      e.target.closest("[data-action='next']");
    const cancelBtn =
      e.target.closest("[data-action='cancel']");
    const approveRefundBtn =
      e.target.closest("[data-action='approve-refund']");
    const rejectRefundBtn =
      e.target.closest("[data-action='reject-refund']");
    const assignDeliveryBtn =
      e.target.closest("[data-action='assign-delivery']");
    const reassignDeliveryBtn =
      e.target.closest("[data-action='reassign-delivery']");

    if (assignDeliveryBtn) {
      await loadDeliveryBoys();
      await openDeliveryAssignmentModal(
        assignDeliveryBtn.dataset.id,
        "assign"
      );
      return;
    }

    if (reassignDeliveryBtn) {
      await loadDeliveryBoys();
      await openDeliveryAssignmentModal(
        reassignDeliveryBtn.dataset.id,
        "reassign"
      );
      return;
    }

    if (viewBtn) {
      await openOrderModal(viewBtn.dataset.id);
      return;
    }

    if (approveBtn) {
      if (!confirm("Approve this order?")) return;

      try {
        const response = await fetch(
          API.UPDATE_STATUS(approveBtn.dataset.id),
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json"
            },
            credentials: "include",
            body: JSON.stringify({
              status: "confirmed"
            })
          }
        );

        const data = await response.json();

        if (!response.ok || data.success === false) {
          throw new Error(
            data.message || "Unable to approve order."
          );
        }

        await loadOrders();
        await loadAllOrderStats();
      } catch (error) {
        console.error("Approve order error:", error);
        alert(error.message || "Unable to approve order.");
      }

      return;
    }

    if (nextBtn) {
      const nextStatus = nextBtn.dataset.next;

      if (nextStatus === "preparing") {
        if (!confirm("Start preparing this order?")) return;
      }

      if (nextStatus === "ready_for_pickup") {
        if (!confirm("Mark this order as ready for pickup?")) return;
      }

      try {
        const response = await fetch(
          API.UPDATE_STATUS(nextBtn.dataset.id),
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json"
            },
            credentials: "include",
            body: JSON.stringify({
              status: nextStatus
            })
          }
        );

        const data = await response.json();

        if (!response.ok || data.success === false) {
          throw new Error(
            data.message ||
            "Unable to update order status."
          );
        }

        await loadOrders();
        await loadAllOrderStats();
      } catch (error) {
        console.error("Status update error:", error);
        alert(
          error.message ||
          "Unable to update order status."
        );
      }

      return;
    }

    if (cancelBtn) {
      if (!confirm("Cancel this order?")) return;

      try {
        const response = await fetch(
          API.CANCEL_ORDER(cancelBtn.dataset.id),
          {
            method: "POST",
            credentials: "include"
          }
        );

        const data = await response.json();

        if (!response.ok || data.success === false) {
          throw new Error(
            data.message || "Unable to cancel order."
          );
        }

        await loadOrders();
        await loadAllOrderStats();
      } catch (error) {
        console.error("Cancel order error:", error);
        alert(error.message || "Unable to cancel order.");
      }

      return;
    }

    if (approveRefundBtn) {
      if (!confirm("Approve refund for this order?")) return;

      try {
        const response = await fetch(
          API.REFUND_APPROVE(approveRefundBtn.dataset.id),
          {
            method: "POST",
            credentials: "include"
          }
        );

        const data = await response.json();

        if (!response.ok || data.success === false) {
          throw new Error(
            data.message || "Unable to approve refund."
          );
        }

        await loadOrders();
        await loadAllOrderStats();
      } catch (error) {
        console.error("Approve refund error:", error);
        alert(error.message || "Unable to approve refund.");
      }

      return;
    }

    if (rejectRefundBtn) {
      const reason = prompt(
        "Enter reason for rejecting refund:"
      );

      if (!reason || reason.trim().length < 5) {
        alert(
          "Rejection reason must be at least 5 characters"
        );
        return;
      }

      try {
        const response = await fetch(
          API.REFUND_REJECT(rejectRefundBtn.dataset.id),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            credentials: "include",
            body: JSON.stringify({
              reason: reason.trim()
            })
          }
        );

        const data = await response.json();

        if (!response.ok || data.success === false) {
          throw new Error(
            data.message ||
            "Unable to reject refund."
          );
        }

        await loadOrders();
        await loadAllOrderStats();
      } catch (error) {
        console.error("Reject refund error:", error);
        alert(
          error.message ||
          "Unable to reject refund."
        );
      }

      return;
    }
  });
}

/************************************************************
  CONFIRM DELIVERY ASSIGNMENT
************************************************************/
if (confirmDeliveryAssignment) {
  confirmDeliveryAssignment.addEventListener(
    "click",
    async () => {
      if (!assignmentOrderId) return;

      const deliveryUserId =
        Number(deliveryBoySelect.value);

      if (
        !deliveryUserId ||
        Number.isNaN(deliveryUserId)
      ) {
        alert("Please select a delivery boy.");
        return;
      }

      confirmDeliveryAssignment.disabled = true;
      confirmDeliveryAssignment.textContent =
        assignmentMode === "reassign"
          ? "Reassigning..."
          : "Assigning...";

      try {
        const endpoint =
          assignmentMode === "reassign"
            ? API.REASSIGN_DELIVERY(assignmentOrderId)
            : API.ASSIGN_DELIVERY(assignmentOrderId);

        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          credentials: "include",
          body: JSON.stringify({
            delivery_user_id: deliveryUserId
          })
        });

        if (response.status === 401) {
          window.location.href = API.LOGIN_PAGE;
          return;
        }

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(
            data.message ||
            "Assignment failed."
          );
        }

        closeDeliveryAssignmentModal();

        await loadOrders();
        await loadAllOrderStats();

        alert(
          assignmentMode === "reassign"
            ? "Delivery reassigned successfully."
            : "Order assigned successfully."
        );
      } catch (error) {
        console.error(
          "Delivery assignment error:",
          error
        );

        alert(
          error.message ||
          "Unable to assign delivery."
        );
      } finally {
        confirmDeliveryAssignment.disabled = false;
        confirmDeliveryAssignment.textContent =
          assignmentMode === "reassign"
            ? "Reassign"
            : "Assign";
      }
    }
  );
}

/************************************************************
  ORDER MODAL
************************************************************/
async function openOrderModal(orderId) {
  try {
    const res = await fetch(
      API.ORDER_DETAILS(orderId),
      {
        credentials: "include"
      }
    );

    if (res.status === 401) {
      window.location.href = API.LOGIN_PAGE;
      return;
    }

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(
        data.message || "Unable to load order."
      );
    }

    const order = data.order;

    modalContent.innerHTML = `
      <p><strong>Order ID:</strong> ${escapeHTML(order.order_id)}</p>
      <p><strong>Name:</strong> ${escapeHTML(order.name)}</p>
      <p><strong>Phone:</strong> ${escapeHTML(order.phone)}</p>
      <p><strong>Status:</strong> ${labelize(order.status)}</p>
      <p><strong>Payment Status:</strong> ${labelize(order.payment_status)}</p>
      <p><strong>Payment Method:</strong> ${labelize(order.payment_method)}</p>
      <p><strong>Address:</strong> ${escapeHTML(order.address)}</p>
      <p><strong>Date:</strong> ${new Date(order.created_at).toLocaleString()}</p>
      <p><strong>Preparation Note:</strong> ${order.notes ? escapeHTML(labelize(order.notes)) : "No Demand"}</p>
      <table>
        <tr>
          <th>Item</th>
          <th>Qty</th>
          <th>Price</th>
        </tr>
        ${order.items.map(i => `
          <tr>
            <td>${escapeHTML(i.name)}</td>
            <td>${Number(i.qty || 0)}</td>
            <td>₹${(Number(i.qty || 0) * Number(i.price || 0)).toFixed(2)}</td>
          </tr>
        `).join("")}
      </table>
      <div class="price-breakdown" style="margin:12px 0;padding:12px;background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;font-size:14px;">
        <div style="display:flex;justify-content:space-between;">
          <span>Subtotal</span>
          <span>₹${Number(order.subtotal || 0).toFixed(2)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;">
          <span>GST</span>
          <span>₹${Number(order.gst || 0).toFixed(2)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;">
          <span>Delivery Fee</span>
          <span>₹${Number(order.delivery_fee || 0).toFixed(2)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;">
          <span>Tip</span>
          <span>₹${Number(order.tip || 0).toFixed(2)}</span>
        </div>
        ${
          Number(order.discount || 0) > 0
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
          <span>₹${Number(order.total || 0).toFixed(2)}</span>
        </div>
      </div>
      ${
        order.refund_reason
          ? `
            <div class="refund-detail-box" style="margin-top:14px;padding:12px;border-left:4px solid #f59e0b;background:#fff7ed;border-radius:6px;">
              <strong>Refund Reason:</strong>
              <p style="margin-top:6px;color:#92400e;">
                ${escapeHTML(order.refund_reason)}
              </p>
            </div>
          `
          : ""
      }
    `;

    modal.classList.add("active");
  } catch (error) {
    console.error("Order modal error:", error);
    alert(
      error.message ||
      "Unable to load order details."
    );
  }
}

/************************************************************
  CLOSE ORDER MODAL
************************************************************/
if (closeModalBtn) {
  closeModalBtn.addEventListener("click", () => {
    modal.classList.remove("active");
  });
}

/************************************************************
  CLOSE DELIVERY ASSIGNMENT MODAL
************************************************************/
function closeDeliveryAssignmentModal() {
  if (deliveryAssignmentModal) {
    deliveryAssignmentModal.classList.remove("active");
  }

  assignmentOrderId = null;

  if (deliveryBoySelect) {
    deliveryBoySelect.value = "";
  }
}

if (closeDeliveryAssignmentModalBtn) {
  closeDeliveryAssignmentModalBtn.addEventListener(
    "click",
    closeDeliveryAssignmentModal
  );
}

if (cancelDeliveryAssignment) {
  cancelDeliveryAssignment.addEventListener(
    "click",
    closeDeliveryAssignmentModal
  );
}

if (deliveryAssignmentModal) {
  deliveryAssignmentModal.addEventListener(
    "click",
    event => {
      if (event.target === deliveryAssignmentModal) {
        closeDeliveryAssignmentModal();
      }
    }
  );
}

/************************************************************
  FILTER BUTTONS
************************************************************/
function setActiveFilter(btn) {
  if (activeBtn) {
    activeBtn.classList.remove("active");
  }

  if (pastBtn) {
    pastBtn.classList.remove("active");
  }

  if (btn) {
    btn.classList.add("active");
  }
}

if (activeBtn) {
  activeBtn.addEventListener("click", async () => {
    currentOrderType = "active";
    setActiveFilter(activeBtn);
    await loadOrders();
  });
}

if (pastBtn) {
  pastBtn.addEventListener("click", async () => {
    currentOrderType = "past";
    setActiveFilter(pastBtn);
    await loadOrders();
  });
}

/************************************************************
  EXPORT ORDERS
************************************************************/
const exportOrdersBtn =
  document.getElementById("exportOrdersBtn");

if (exportOrdersBtn) {
  exportOrdersBtn.addEventListener("click", () => {
    window.location.href =
      "/api/admin/orders/export";
  });
}

/************************************************************
  INIT
************************************************************/
document.addEventListener(
  "DOMContentLoaded",
  async () => {
    initSocket();
    await loadDeliveryBoys();
    await loadAllOrderStats();
    await loadOrders();
  }
);