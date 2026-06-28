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

  /*
    SECURITY: Coupon validation is handled server-side only.
    Never store coupon codes or discount values in client JS —
    they are visible to anyone who opens DevTools.
  */
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
  const platformFeeText = document.getElementById("platformFeeText");
  const packingFeeText = document.getElementById("packingFeeText");

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
        showToast('Access forbidden', "error");
        return null;
      }

      if (res.status === 404) {
        window.location.href = "error.html?type=notfound";
        return null;
      }

      if (res.status === 409) {
        showToast('Conflict detected', "warning");
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

  async function loadUserProfile(){
    const data = await apiRequest("/api/auth/me");
    if(!data || !data.success){
      return;
    }

    const user = data.user;
    const fullName = [
      user.first_name,
      user.last_name
    ]
    .filter(Boolean)
    .join(" ");

    const address = [
      user.street,
      user.city,
      user.zip,
      user.country
    ]
    .filter(Boolean)
    .join(", ");

    document.getElementById("name").value = fullName;
    document.getElementById("phone").value = user.phone || "";
    document.getElementById("address").value = address;
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
  function showToast(message,type="info"){
    const toast=document.getElementById("toast");

    if(!toast) return;

    const icons={
      success:"fa-circle-check",
      error:"fa-circle-xmark",
      warning:"fa-triangle-exclamation",
      info:"fa-circle-info"
    };

    const icon=icons[type]||icons.info;

    toast.className=`toast ${type}`;

    toast.innerHTML=`
      <span class="toast-icon">
        <i class="fa-solid ${icon}"></i>
      </span>

      <span class="toast-message">
        ${message}
      </span>
    `;

    toast.classList.remove("show");
    void toast.offsetWidth;
    toast.classList.add("show");

    clearTimeout(toast._timer);

    toast._timer=setTimeout(()=>{
      toast.classList.remove("show");
    },3000);
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
        showToast('Your cart is empty', "warning");
        updateTotals();
        return;
      }

      renderSummary();
      calculateSubtotal();
      updateTotals();

    } catch (err) {
      summaryBox.innerHTML = `<p><i class="fa-solid fa-lock" style="margin-right:6px;"></i> Please login to continue</p>`;
      payNowBtn.disabled = true;
      showToast('Please login to continue', "warning");
    }
  }

  /* =========================
     XSS SANITIZER
     Escape untrusted strings before
     injecting into innerHTML.
  ========================= */
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.appendChild(document.createTextNode(String(str || "")));
    return div.innerHTML;
  }

  /* =========================
     RENDER CART ITEMS
  ========================= */
  function renderSummary() {
    summaryBox.innerHTML = "";

    cart.forEach(item => {
      const row = document.createElement("div");

      /* Sanitize all server-supplied strings */
      const safeName  = escapeHtml(item.name);
      const safeRating = escapeHtml(item.rating || "4.8");
      const safeBadge  = escapeHtml(item.badge  || "Fresh");

      const image =
        item.image ||
        item.image_url ||
        item.product_image ||
        "assets/default-food.png";

      /* Whitelist image src to same-origin or known CDN */
      const safeImage = /^(https?:\/\/|\/|assets\/)/.test(image)
        ? image
        : "assets/default-food.png";

      const qty = Number(item.qty) || 1;
      const price = Number(item.price) || 0;
      const total = (price * qty).toFixed(2);

      row.className = "item";

      row.innerHTML = `
        <div class="item-left">

          <div class="item-image">
            <img
              src="${safeImage}"
              alt="${safeName}"
              onerror="this.src='assets/default-food.png'"
            >
          </div>

          <div class="item-details">
            <h4>${safeName}</h4>

            <p>
              ⭐ ${safeRating} • ${safeBadge}
            </p>

            <p>
              Qty : ${qty}
            </p>
          </div>

        </div>

        <div class="item-price">

          <strong>
            ₹${total}
          </strong>

          <span>
            ₹${price.toFixed(2)} each
          </span>

        </div>
      `;

      summaryBox.appendChild(row);
    });
  }

  /* =========================
     CALCULATIONS
  ========================= */
  function calculateSubtotal() {
    subtotal = cart.reduce((sum, i) => {
      const price = Number(i.price) || 0;
      const qty = Number(i.qty) || 0;
      return sum + (price * qty);
    }, 0);

    subtotal = Number(subtotal.toFixed(2));
  }

  function updateTotals() {
    gst = Number((subtotal * GST_RATE).toFixed(2));

    delivery =
      subtotal >= FREE_DELIVERY_ABOVE
        ? 0
        : DELIVERY_FEE;

    total =
      subtotal +
      gst +
      platform_fee +
      packing_fee +
      delivery +
      tip -
      discount;

    total = Math.max(0, total);
    total = Number(total.toFixed(2));

    if (subtotalText) {
      subtotalText.textContent =
        `₹${subtotal.toFixed(2)}`;
    }

    if (gstText) {
      gstText.textContent =
        `₹${gst.toFixed(2)}`;
    }

    if (platformFeeText) {
      platformFeeText.textContent =
        `₹${platform_fee.toFixed(2)}`;
    }

    if (packingFeeText) {
      packingFeeText.textContent =
        `₹${packing_fee.toFixed(2)}`;
    }

    if (deliveryText) {
      deliveryText.textContent =
        `₹${delivery.toFixed(2)}`;
    }

    if (tipText) {
      tipText.textContent =
        `₹${tip.toFixed(2)}`;
    }

    if (discountText) {
      discountText.textContent =
        `-₹${discount.toFixed(2)}`;
    }

    if (totalText) {
      totalText.textContent =
        `₹${total.toFixed(2)}`;
    }

    if (payAmount) {
      payAmount.textContent =
        `₹${total.toFixed(2)}`;
    }
  }

  /* =========================
     TIP HANDLING
  ========================= */
  function bindTipEvents() {
    const tipButtons =
      document.querySelectorAll(".tip-btn");

    tipButtons.forEach(btn => {
      btn.addEventListener("click", () => {

        tipButtons.forEach(button => {
          button.classList.remove("active");
        });

        btn.classList.add("active");

        const customTip =
          document.getElementById("customTip");

        if (customTip) {
          customTip.value = "";
        }

        tip = Number(btn.dataset.tip) || 0;

        updateTotals();
      });
    });
  }

  function bindCustomTip() {
    const customTip =
      document.getElementById("customTip");

    if (!customTip) {
      return;
    }

    customTip.addEventListener("input", () => {

      document
        .querySelectorAll(".tip-btn")
        .forEach(btn => {
          btn.classList.remove("active");
        });

      let value =
        Number(customTip.value);

      if (isNaN(value) || value < 0) {
        value = 0;
      }

      if (value > 1000) {
        value = 1000;
        customTip.value = 1000;
      }

      tip = value;

      updateTotals();
    });
  }

  function resetTip() {
    tip = 0;

    document
      .querySelectorAll(".tip-btn")
      .forEach(btn => {
        btn.classList.remove("active");
      });

    const customTip =
      document.getElementById("customTip");

    if (customTip) {
      customTip.value = "";
    }

    updateTotals();
  }

  function initializeTipSystem() {
    bindTipEvents();
    bindCustomTip();
  }

  /* =========================
     COUPON — server validated
     The server is the single source
     of truth for coupon validity.
     We only preview the code here;
     the real discount is calculated
     server-side when the order is placed.
  ========================= */
  async function applyCoupon() {
    const code = couponInput?.value.trim().toUpperCase();

    if (!code) {
      showToast("Enter coupon code", "warning");
      return;
    }

    /* Basic format guard before hitting the server */
    if (!/^[A-Z0-9]{3,20}$/.test(code)) {
      showToast("Invalid coupon format", "error");
      discount = 0;
      updateTotals();
      return;
    }

    /*
      Send to server for validation.
      Endpoint should return { valid, discount, message }
      We apply the server-returned discount to the UI preview.
    */
    try {
      applyCouponBtn.disabled = true;

      const res = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code, subtotal })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.valid) {
        discount = 0;
        updateTotals();
        showToast(data.message || "Invalid coupon", "error");
        return;
      }

      discount = Number(data.discount) || 0;
      updateTotals();
      showToast("Coupon applied ✓", "success");

    } catch {
      discount = 0;
      updateTotals();
      showToast("Could not validate coupon", "error");
    } finally {
      applyCouponBtn.disabled = false;
    }
  }

  function removeCoupon() {
    discount = 0;

    if (couponInput) {
      couponInput.value = "";
    }

    updateTotals();

    showToast(
      'Coupon removed',
      "info"
    );
  }

  function fillCoupon(code) {
    if (!couponInput) {
      return;
    }

    couponInput.value = code;
    applyCoupon();
  }

  function bindCouponEvents() {
    applyCouponBtn?.addEventListener(
      "click",
      applyCoupon
    );

    removeCouponBtn?.addEventListener(
      "click",
      removeCoupon
    );
  }

  function initializeCheckout() {
    initializeTipSystem();
    bindCouponEvents();
    loadUserProfile();
    loadCart();
  }
  
  /* =========================
     PLACE ORDER
  ========================= */
  function validateName() {
    const name =
      document.getElementById("name")?.value.trim() || "";

    if (!name) {
      showToast(
        'Please enter your name',
        "warning"
      );

      return false;
    }

    if (name.length < 3) {
      showToast(
        'Name must be at least 3 characters',
        "warning"
      );

      return false;
    }

    if (!/^[A-Za-z\s]+$/.test(name)) {
      showToast(
        'Invalid name',
        "warning"
      );

      return false;
    }

    return true;
  }

  function validatePhone() {
    const phone =
      document.getElementById("phone")?.value.trim() || "";

    if (!phone) {
      showToast(
        'Please enter phone number',
        "warning"
      );

      return false;
    }

    if (!/^[6-9]\d{9}$/.test(phone)) {
      showToast(
        `Invalid phone number`,
        "warning"
      );

      return false;
    }

    return true;
  }

  function validateAddress() {
    const address =
      document.getElementById("address")?.value.trim() || "";

    if (!address) {
      showToast(
        'Please enter delivery address',
        "warning"
      );

      return false;
    }

    if (address.length < 10) {
      showToast(
        'Address is too short (min 10 characters)',
        "warning"
      );

      return false;
    }

    if (address.length > 300) {
      showToast(
        'Address is too long (max 300 characters)',
        "warning"
      );

      return false;
    }

    return true;
  }

  function validateDeliveryForm() {
    if (!validateName()) {
      return false;
    }

    if (!validatePhone()) {
      return false;
    }

    if (!validateAddress()) {
      return false;
    }

    return true;
  }

  async function processCheckout(){

    if(isSubmittingOrder){
      return;
    }

    if(!validateDeliveryForm()){
      return;
    }

    if(!cart || cart.length===0){
      showToast(
        "Your cart is empty",
        "warning"
      );
      return;
    }

    calculateSubtotal();
    updateTotals();

    const confirmTotal=
      document.getElementById("confirmTotal");

    if(confirmTotal){
      confirmTotal.textContent=
        `₹${total.toFixed(2)}`;
    }

    if(confirmModal){
      confirmModal.classList.remove("hidden");
    }
  }

  async function confirmCheckout(){

    if(isSubmittingOrder){
      return;
    }

    if(!validateDeliveryForm()){
      return;
    }

    if(!cart || cart.length===0){

      showToast(
        "Your cart is empty",
        "warning"
      );

      confirmModal?.classList.add("hidden");

      return;
    }

    confirmModal?.classList.add("hidden");

    await placeOrder();
  }

  async function placeOrder() {

    /* =========================
      DUPLICATE REQUEST PROTECTION
    ========================= */
    if (isSubmittingOrder) {
      return;
    }

    confirmModal?.classList.add(
      "hidden"
    );
    
    /* =========================
      VALIDATE FORM AGAIN
    ========================= */
    if (!validateDeliveryForm()) {
      confirmProceed.disabled = false;
      return;
    }

    /* =========================
      LOCAL CART VALIDATION
    ========================= */
    if (!cart || cart.length === 0) {

      showToast(
        "Your cart is empty",
        "warning"
      );

      confirmProceed.disabled = false;

      return;
    }

    isSubmittingOrder = true;

    payNowBtn.disabled = true;
    confirmProceed.disabled = true;

    const name =
      document.getElementById("name")?.value.trim() || "";

    const phone =
      document.getElementById("phone")?.value.trim() || "";

    const address =
      document.getElementById("address")?.value.trim() || "";

    const notes =
      document.getElementById("notes")?.value.trim() || "";

    updateTotals();

    showToast(
      "Verifying cart...",
      "info"
    );


    try {

      /* =========================
        FETCH LATEST CART
      ========================= */
      const latestCartRes =
        await apiRequest(CART_API);

      if (
        !latestCartRes ||
        !latestCartRes.cart
      ) {

        showToast(
          "Unable to verify cart",
          "error"
        );

        return;
      }

      /* =========================
        EMPTY CART CHECK
      ========================= */
      if (
        latestCartRes.cart.length === 0
      ) {

        showToast(
          "Your cart is empty",
          "warning"
        );

        renderSummary();

        return;
      }

      /* =========================
        CART CHANGE DETECTION
      ========================= */
      const localCartString =
        JSON.stringify(cart);

      const serverCartString =
        JSON.stringify(latestCartRes.cart);

      if (
        localCartString !==
        serverCartString
      ) {

        cart = latestCartRes.cart;

        renderSummary();
        calculateSubtotal();
        updateTotals();

        showToast(
          "Your cart was updated. Please review your order.",
          "warning"
        );

        return;
      }

      /* =========================
        RECALCULATE TOTALS
      ========================= */
      cart = latestCartRes.cart;

      calculateSubtotal();
      updateTotals();

      showToast(
        "Placing your order...",
        "info"
      );

      /* =========================
        ORDER PAYLOAD
      ========================= */
      const orderPayload = {
        name,
        phone,
        address,
        notes,
        tip: Number(tip.toFixed(2)),
        couponCode:
          couponInput?.value
            .trim()
            .toUpperCase() || "",
        idempotencyKey: checkoutKey
      };

      /* =========================
        CREATE PENDING ORDER
      ========================= */
      const res = await apiRequest(
        ORDER_API,
        "POST",
        orderPayload
      );

      if (!res || !res.success) {

        showToast(
          res?.message ||
          "Failed to place order",
          "error"
        );

        return;
      }

      /* =========================
        SUCCESS
      ========================= */
      showToast(
        "Order placed successfully",
        "success"
      );

      /*
        IMPORTANT:

        Keep checkoutKey until
        payment success page confirms
        payment completion.

        Do NOT remove it here.
      */

      setTimeout(() => {

        window.location.href =
          `payment.html?type=order&id=${res.pendingOrderId}`;

      }, 1200);

    } catch (err) {

      console.error(
        "Place Order Error:",
        err
      );

      showToast(
        "Failed to place order. Please try again.",
        "error"
      );

    } finally {
      /*
        Reset submission lock only if we did NOT successfully
        redirect to payment.html. Using a dedicated flag is
        more reliable than inspecting window.location.href,
        which may not reflect the new URL synchronously.
      */
      if (!isSubmittingOrder || !window.location.href.includes("payment.html")) {
        isSubmittingOrder = false;
        payNowBtn.disabled = false;
        confirmProceed.disabled = false;
      }
    }
  }

  /* =========================
     EVENTS
  ========================= */
  payNowBtn?.addEventListener(
    "click",
    () => {
      if(isSubmittingOrder){
        return;
      }

      processCheckout();
    }
  );

  cancelConfirm?.addEventListener("click",()=>{

    confirmModal?.classList.add("hidden");

    payNowBtn.disabled=false;

    confirmProceed.disabled=false;

  });

  confirmModal?.addEventListener(
    "click",
    e=>{

      if(e.target===confirmModal){

        confirmModal.classList.add(
          "hidden"
        );

        payNowBtn.disabled=false;

        confirmProceed.disabled=false;
      }

    }
  );

  confirmProceed?.addEventListener(
    "click",
    async()=>{

      if(confirmProceed.disabled){
        return;
      }

      confirmProceed.disabled=true;
      await confirmCheckout();

    }
  );

  backBtn?.addEventListener("click", () => 
    window.location.href = "cart.html"
  );

  document.addEventListener("keydown", e => {
    if (
      e.key === "Escape" &&
      confirmModal &&
      !confirmModal.classList.contains("hidden")
    ) {
      confirmModal.classList.add("hidden");
      payNowBtn.disabled = false;
      confirmProceed.disabled = false;
    }
  });

  document.addEventListener("DOMContentLoaded", () => {
    initializeCheckout();
  });
})();