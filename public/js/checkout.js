(() => {
  /* =========================
     API ENDPOINTS
  ========================= */
  const CART_API = "/api/cart";
  const ORDER_API = "/api/orders";

  /* =========================
     PRICING CONFIG
  ========================= */
  const GST_RATE = 0.05;
  const DELIVERY_FEE = 40;
  const FREE_DELIVERY_ABOVE = 2999;
  const PLATFORM_FEE = 10;
  const PACKING_FEE = 10;
  /* =========================
     STATE
  ========================= */
  let cart = [];
  let subtotal = 0;
  let discount = 0;
  let gst = 0;
  let delivery = 0;
  let tip = 0;
  let platform_fee = PLATFORM_FEE;
  let packing_fee = PACKING_FEE;
  let total = 0; 
  let isSubmittingOrder = false;

  /* =========================
     DOM ELEMENTS
  ========================= */
  const summaryBox = document.getElementById("summaryBox");
  const subtotalText = document.getElementById("subtotalText");
  const gstText = document.getElementById("gstText");
  const deliveryText = document.getElementById("deliveryText");
  const discountText = document.getElementById("discountText");
  const tipText = document.getElementById("tipText");
  const totalText = document.getElementById("totalText");
  const payAmount = document.getElementById("payAmount");

  const payNowBtn = document.getElementById("payNowBtn");
  const backBtn = document.getElementById("backBtn");
  const applyCouponBtn = document.getElementById("applyCouponBtn");
  const removeCouponBtn = document.getElementById("removeCouponBtn");
  const couponInput = document.getElementById("couponCode");

  const confirmModal = document.getElementById("confirmModal");
  const cancelConfirm = document.getElementById("cancelConfirm");
  const confirmProceed = document.getElementById("confirmProceed");

  /* =========================
     API HELPER
  ========================= */
  async function apiRequest(url, method = "GET", data = null) {
    try {
      const options = {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include"
      };

      if (data) options.body = JSON.stringify(data);

      const res = await fetch(url, options);
      const json = await res.json().catch(() => ({}));

      if (res.status === 401) {
        window.location.href = "error.html?type=unauthorized";
        return null;
      }

      if (res.status === 403) {
        showToast(`<i class="fa-solid fa-lock" style="margin-right:6px;"></i> Access forbidden`, "error");
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
        throw new Error(json.message || "Request failed");
      }

      return json;

    } catch (err) {
      console.error("Network/API error:", err);
      window.location.href = "error.html?type=network";
      return null;
    }
  }

  /* IDEMPOTENCY KEY */
  function generateIdempotencyKey() {
    return (
      "order_" +
      Date.now() +
      "_" +
      Math.random().toString(36).substring(2, 12)
    );
  }

  let checkoutKey = sessionStorage.getItem("checkoutKey");

  if (!checkoutKey) {
    checkoutKey = generateIdempotencyKey();
    sessionStorage.setItem("checkoutKey", checkoutKey);
  }

  /* =========================
     TOAST
  ========================= */
  function showToast(message, type = "info") {
    const toast = document.getElementById("toast");
    if (!toast) return;

    toast.className = `toast ${type}`;
    toast.innerHTML = message;

    toast.classList.remove("show");
    void toast.offsetWidth;
    toast.classList.add("show");

    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.classList.remove("show");
    }, 2500);
  }

  /* =========================
     LOAD CART
  ========================= */
  async function loadCart() {
    try {
      const res = await apiRequest(CART_API);
      
      // FIX: Check if res exists before accessing properties
      if (!res) return; 

      cart = res.cart || [];

      if (!cart.length) {
        summaryBox.innerHTML = `<p><i class="fa-solid fa-cart-shopping" style="margin-right:6px;"></i> Your cart is empty</p>`;
        payNowBtn.disabled = true;
        showToast(`<i class="fa-solid fa-triangle-exclamation"style="margin-right:6px;"></i> Your cart is empty`, "warning");
        return;
      }

      renderSummary();
      calculateSubtotal();
      updateTotals();

    } catch (err) {
      summaryBox.innerHTML = `<p><i class="fa-solid fa-lock" style="margin-right:6px;"></i> Please login to continue</p>`;
      payNowBtn.disabled = true;
      showToast(`<i class="fa-solid fa-triangle-exclamation"style="margin-right:6px;"></i> Please login to continue`, "warning");
    }
  }

  /* =========================
     RENDER CART ITEMS
  ========================= */
  function renderSummary() {
    summaryBox.innerHTML = "";

    cart.forEach(item => {
      const row = document.createElement("div");
      row.className = "item";
      row.innerHTML = `
        <span>${item.name} × ${item.qty}</span>
        <strong>₹${(item.price * item.qty).toFixed(2)}</strong>
      `;
      summaryBox.appendChild(row);
    });
  }

  /* =========================
     CALCULATIONS
  ========================= */
  function calculateSubtotal() {
    subtotal = cart.reduce((sum, i) => {
      return sum + (Number(i.price) * Number(i.qty));
    }, 0);

    subtotal = Number(subtotal.toFixed(2));
  }

  function updateTotals() {
    gst = Number((subtotal * GST_RATE).toFixed(2));
    delivery = subtotal >= FREE_DELIVERY_ABOVE ? 0 : DELIVERY_FEE;
    total =
      subtotal +
      gst +
      delivery +
      platform_fee +
      packing_fee +
      tip -
      discount;

    total = Number(Math.max(0, total).toFixed(2));

    subtotalText.textContent = `₹${subtotal.toFixed(2)}`;
    gstText.textContent = `₹${gst.toFixed(2)}`;
    deliveryText.textContent = `₹${delivery.toFixed(2)}`;
    discountText.textContent = `-₹${discount.toFixed(2)}`;
    tipText.textContent = `₹${tip.toFixed(2)}`;

    document.getElementById("platformFeeText").textContent = `₹${platform_fee.toFixed(2)}`;
    document.getElementById("packingFeeText").textContent = `₹${packing_fee.toFixed(2)}`;
    totalText.textContent = `₹${total.toFixed(2)}`;
    payAmount.textContent = `₹${total.toFixed(2)}`;
  }

  /* =========================
     TIP HANDLING
  ========================= */
  document.querySelectorAll(".tip-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tip-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      tip = +btn.dataset.tip || 0;
      updateTotals();
    });
  });

  const customTip = document.getElementById("customTip");
  customTip?.addEventListener("input", () => {
    document.querySelectorAll(".tip-btn").forEach(b => b.classList.remove("active"));
    tip = +customTip.value || 0;
    updateTotals();
  });

  /* =========================
     PLACE ORDER
  ========================= */
  async function placeOrder() {
    if (isSubmittingOrder) return;
    isSubmittingOrder = true;
    const name = document.getElementById("name").value.trim();
    const phone = document.getElementById("phone").value.trim();
    const address = document.getElementById("address").value.trim();
    const notes = document.getElementById("notes")?.value.trim() || "";

    if (!name || !phone || !address) {
      showToast(`<i class="fa-solid fa-triangle-exclamation" style="margin-right:6px;"></i> Please fill all delivery details`, "warning");
      return;
    }
    const phoneRegex = /^[6-9]\d{9}$/;

    if (!phoneRegex.test(phone)) {
      showToast(
        `<i class="fa-solid fa-circle-xmark"></i> Invalid phone number`,
        "error"
      );
      return;
    }

    if (!cart.length) {
      showToast(`<i class="fa-solid fa-cart-shopping"></i> Cart is empty`, "warning");
      return;
    }

    payNowBtn.disabled = true;
    showToast(`<i class="fa-solid fa-circle-info"></i> Placing your order...`, "info");

    try {
      const orderPayload = {
        name,
        phone,
        address,
        notes,
        tip: Number(tip.toFixed(2)),
        couponCode: couponInput.value.trim().toUpperCase(),
        idempotencyKey: checkoutKey
      };

      const res = await apiRequest(ORDER_API, "POST", orderPayload);

      if (!res || !res.success) {
        payNowBtn.disabled = false;
        showToast(res?.message || "Order failed", "error");
        return;
      }

      showToast(`<i class="fa-solid fa-circle-check"></i> Order placed successfully`, "success");
      sessionStorage.removeItem("checkoutKey");

      setTimeout(() => {
        window.location.href = `payment.html?type=order&id=${res.pendingOrderId}`;
      }, 1200);
      
    } catch (err) {
      console.error(err);
      showToast("Order failed", "error");
    } finally {
      payNowBtn.disabled = false;
      isSubmittingOrder = false;
    }
  }
  
  /* =========================
     EVENTS
  ========================= */
  payNowBtn.addEventListener("click", () => {
    // Basic validation before showing modal
    if (!cart.length) return;
    confirmModal.classList.remove("hidden");
  });

  cancelConfirm.addEventListener("click", () => {
    confirmModal.classList.add("hidden");
  });

  confirmProceed.addEventListener("click", async () => {
    confirmModal.classList.add("hidden");
    await placeOrder();
  });

  backBtn.addEventListener("click", () => 
    window.location.href = "cart.html"
  );

  document.addEventListener("DOMContentLoaded", loadCart);
})(); 