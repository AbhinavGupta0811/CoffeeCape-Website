/************************************************************
  API PATHS
************************************************************/
const API={
  ORDERS:"/api/admin/orders",
  ORDER_DETAILS:id=>`/api/admin/orders/${id}`,
  UPDATE_STATUS:id=>`/api/admin/orders/${id}/status`,
  CANCEL_ORDER:id=>`/api/admin/orders/${id}/cancel`,
  REFUND_APPROVE:id=>`/api/admin/orders/${id}/refund`,
  REFUND_REJECT:id=>`/api/admin/orders/${id}/refund/reject`,
  LOGIN_PAGE:"/Auth.html"
};

/************************************************************
  CONSTANTS
************************************************************/
const FINAL_STATUSES=["cancelled","refunded","delivered","refund_rejected"];

/************************************************************
  ELEMENTS
************************************************************/
const ordersTableBody=document.getElementById("ordersTableBody");
const emptyState=document.getElementById("emptyState");
const modal=document.getElementById("orderModal");
const modalContent=document.getElementById("orderModalContent");
const closeModalBtn=document.getElementById("closeOrderModal");
const todayOrdersEl=document.getElementById("todayOrders");
const totalRevenueEl=document.getElementById("totalRevenue");
const pendingOrdersEl=document.getElementById("pendingOrders");
const processingOrdersEl=document.getElementById("processingOrders");
const deliveredOrdersEl=document.getElementById("deliveredOrders");
const refundRequestsEl=document.getElementById("refundRequests");
const activeBtn=document.getElementById("activeOrdersBtn");
const pastBtn=document.getElementById("pastOrdersBtn");

/************************************************************
  STATE
************************************************************/
let currentOrderType="active";

/************************************************************
HELPERS
************************************************************/
function labelize(text){
  return text.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase());
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

  socket.on("new-order",async (data) => {
    console.log("📦 New Order:", data);
    loadOrders();
    loadAllOrderStats()
    loadPendingReminders();
    fetchAnalytics();
  });

  socket.on("order-status-updated",async (data) => {
    console.log("🔄 Status Updated:", data);
    loadOrders();
    loadAllOrderStats()
    loadPendingReminders();
    fetchAnalytics();
  });
}

/************************************************************
  ORDER STATS
************************************************************/
async function loadAllOrderStats(){

  try{

    const res = await fetch(
      `${API.ORDERS}?type=all`,
      {
        credentials:"include"
      }
    );

    const data = await res.json();

    updateOrderStats(data.orders || []);

  }catch(err){
    console.error("Stats error:",err);
  }

}

function updateOrderStats(orders=[]){

  const today=new Date();

  let todayOrders=0;
  let totalRevenue=0;
  let pendingOrders=0;
  let processingOrders=0;
  let deliveredOrders=0;
  let refundRequests=0;

  orders.forEach(order=>{

    const orderDate=new Date(order.created_at);

    const isToday=
    orderDate.getDate()===today.getDate() &&
    orderDate.getMonth()===today.getMonth() &&
    orderDate.getFullYear()===today.getFullYear();

    if(isToday){
      todayOrders++;
    }

    if(
      order.payment_status==="paid" ||
      order.payment_status==="completed"
      ){
      totalRevenue+=Number(order.total||0);
    }

    if(order.status==="pending"){
      pendingOrders++;
    }

    if(
      order.status==="confirmed" ||
      order.status==="preparing" ||
      order.status==="out_for_delivery"
      ){
      processingOrders++;
    }

    if(order.status==="delivered"){
      deliveredOrders++;
    }

    if(order.status==="refund_requested"){
      refundRequests++;
    }

  });

  if(todayOrdersEl){
    todayOrdersEl.textContent=todayOrders;
  }

  if(totalRevenueEl){
    totalRevenueEl.textContent=`₹${totalRevenue.toLocaleString("en-IN")}`;
  }

  if(pendingOrdersEl){
    pendingOrdersEl.textContent=pendingOrders;
  }

  if(processingOrdersEl){
    processingOrdersEl.textContent=processingOrders;
  }

  if(deliveredOrdersEl){
    deliveredOrdersEl.textContent=deliveredOrders;
  }

  if(refundRequestsEl){
    refundRequestsEl.textContent=refundRequests;
  }

}

/************************************************************
  LOAD ORDERS
************************************************************/
async function loadOrders(){
  try{
    const res=await fetch(`${API.ORDERS}?type=${currentOrderType}`,{
      credentials:"include"
    });

    if(res.status===401){
      location.href=API.LOGIN_PAGE;
      return;
    }

    const data=await res.json();
    const orders=data.orders||[];
    renderOrders(orders);

  }catch(err){
    console.error("Orders load error:",err);
  }

}

/************************************************************
  RENDER ORDERS
************************************************************/
function renderOrders(orders){

  if(!ordersTableBody)return;

  ordersTableBody.innerHTML="";
  emptyState.style.display="none";

  if(!orders.length){
    emptyState.style.display="block";
    return;
  }

  orders.forEach(order=>{
    const isFinal=FINAL_STATUSES.includes(order.status);
    const isRefundRequest=order.status==="refund_requested";

    let actionButtons="";

    if(isFinal){

    actionButtons=`<span class="status completed">Final Order</span>`;

    }

    else if(isRefundRequest){

    actionButtons=`
    <button class="btn-warning" data-action="approve-refund" data-id="${order.id}">
    Approve
    </button>

    <button class="btn-danger" data-action="reject-refund" data-id="${order.id}">
    Reject
    </button>
    `;

    }

    else if(order.status==="pending"){

    actionButtons=`
    <button class="btn-primary" data-action="approve" data-id="${order.id}">
    Approve
    </button>

    <button class="btn-danger" data-action="cancel" data-id="${order.id}">
    Cancel
    </button>
    `;

    }

    else if(order.status==="confirmed"){

    actionButtons=`
    <button class="btn-primary" data-action="next" data-next="preparing" data-id="${order.id}">
    Start Preparing
    </button>
    `;

    }

    else if(order.status==="preparing"){

    actionButtons=`
    <button class="btn-primary" data-action="next" data-next="out_for_delivery" data-id="${order.id}">
    Send For Delivery
    </button>
    `;

    }

    else if(order.status==="out_for_delivery"){

    actionButtons=`
    <button class="btn-primary" data-action="next" data-next="delivered" data-id="${order.id}">
    Mark Delivered
    </button>
    `;

    }

    ordersTableBody.insertAdjacentHTML("beforeend",`

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
    order.status==="cancelled"
    ?`<span class="status cancelled">${labelize(order.cancelled_by||"unknown")}</span>`
    :"None"
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
if(ordersTableBody){

  ordersTableBody.addEventListener("click",async e=>{

  const viewBtn=e.target.closest("[data-action='view']");
  const approveBtn=e.target.closest("[data-action='approve']");
  const nextBtn=e.target.closest("[data-action='next']");
  const cancelBtn=e.target.closest("[data-action='cancel']");
  const approveRefundBtn=e.target.closest("[data-action='approve-refund']");
  const rejectRefundBtn=e.target.closest("[data-action='reject-refund']");

  if(viewBtn){
    openOrderModal(viewBtn.dataset.id);
  }

  if(approveBtn){

    if(!confirm("Approve this order?"))return;

    await fetch(API.UPDATE_STATUS(approveBtn.dataset.id),{
      method:"PUT",
      headers:{"Content-Type":"application/json"},
      credentials:"include",
      body:JSON.stringify({status:"confirmed"})
    });

    await loadOrders();
    await loadAllOrderStats();

  }

  if(nextBtn){

    const nextStatus=nextBtn.dataset.next;

    await fetch(API.UPDATE_STATUS(nextBtn.dataset.id),{
      method:"PUT",
      headers:{"Content-Type":"application/json"},
      credentials:"include",
      body:JSON.stringify({status:nextStatus})
    });

    await loadOrders();
    await loadAllOrderStats();

  }

  if(cancelBtn){

    if(!confirm("Cancel this order?"))return;

    await fetch(API.CANCEL_ORDER(cancelBtn.dataset.id),{
    method:"POST",
    credentials:"include"
    });

    await loadOrders();
    await loadAllOrderStats();

  }

  if(approveRefundBtn){

    if(!confirm("Approve refund for this order?"))return;

    await fetch(API.REFUND_APPROVE(approveRefundBtn.dataset.id),{
    method:"POST",
    credentials:"include"
    });

    await loadOrders();
    await loadAllOrderStats();

  }

  if(rejectRefundBtn){

    const reason=prompt("Enter reason for rejecting refund:");

    if(!reason||reason.trim().length<5){
    alert("Rejection reason must be at least 5 characters");
    return;
  }

  await fetch(API.REFUND_REJECT(rejectRefundBtn.dataset.id),{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    credentials:"include",
    body:JSON.stringify({reason})
  });

  await loadOrders();
  await loadAllOrderStats();

  }

  });

}

/************************************************************
ORDER MODAL
************************************************************/
async function openOrderModal(orderId){

const res=await fetch(API.ORDER_DETAILS(orderId),{
  credentials:"include"
});

const {order}=await res.json();
modalContent.innerHTML = `
    <p><strong>Order ID:</strong> ${order.order_id}</p>
    <p><strong>Name:</strong> ${order.name}</p>
    <p><strong>Phone:</strong> ${order.phone}</p>
    <p><strong>Status:</strong> ${labelize(order.status)}</p>
    <p><strong>Payment Status:</strong> ${labelize(order.payment_status)}</p>
    <p><strong>Payment Method:</strong> ${labelize(order.payment_method)}</p>
    <p><strong>Address:</strong> ${order.address}</p>
    <p><strong>Date:</strong> ${new Date(order.created_at).toLocaleString()}</p>
    <p><strong>Preparation Note:</strong> ${order.notes ? labelize(order.notes) : "No Demand"}</p>
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
  CLOSE MODAL
************************************************************/
if(closeModalBtn){

  closeModalBtn.addEventListener("click",()=>{
  modal.classList.remove("active");
  });

}

/************************************************************
  FILTER BUTTONS
************************************************************/
function setActiveFilter(btn){

  activeBtn.classList.remove("active");
  pastBtn.classList.remove("active");

  btn.classList.add("active");

}

if(activeBtn){
  activeBtn.addEventListener("click", async()=>{
    currentOrderType="active";
    setActiveFilter(activeBtn);
    await loadOrders();
  });
}

if(pastBtn){
    pastBtn.addEventListener("click", async()=>{
    currentOrderType="past";
    setActiveFilter(pastBtn);
    await loadOrders();
  });
}

document
.getElementById("exportOrdersBtn")
.addEventListener("click", () => {
    window.location.href =
    "/api/admin/orders/export";
});

/************************************************************
  INIT
************************************************************/
document.addEventListener("DOMContentLoaded",()=>{
  loadAllOrderStats();
  loadOrders();
});