(() => {
  /* =====================================
     CONFIG
  ====================================== */
  const PAYMENT_API = "/api/payment/confirm";
  const ORDER_API = "/api/orders";
  const PENDING_BOOKING_API = "/api/booking/pending";

  /* =====================================
     DOM REFERENCES
  ====================================== */
  const payBtn = document.getElementById("payBtn");
  const backBtn = document.getElementById("backBtn");

  const orderIdEl =
    document.getElementById("orderId") ||
    document.getElementById("referenceId");

  const payAmountEl = document.getElementById("payAmount");
  const payAmountBtn = document.getElementById("payAmountBtn");

  const orderSection = document.getElementById("orderPaymentSection");
  const bookingSection = document.getElementById("bookingPaymentSection");

  if (!payBtn || !orderIdEl || !payAmountEl) {
    console.error("Payment page required elements missing.");
    return;
  }

  /* =====================================
     GET TYPE + ID
  ====================================== */
  const params = new URLSearchParams(window.location.search);
  const type = params.get("type") || "order";
  const orderId = params.get("id") || params.get("orderId");

  if (!orderId) {
    showToast("Invalid payment reference", "error");
    payBtn.disabled = true;
    setTimeout(() => window.location.href = "checkout.html", 1500);
    return;
  }

  orderIdEl.textContent = orderId;

  /* =====================================
     SHOW CORRECT FORM
  ====================================== */
  if (type === "booking") {
    orderSection && (orderSection.style.display = "none");
    bookingSection && (bookingSection.style.display = "block");
  } else {
    bookingSection && (bookingSection.style.display = "none");
    orderSection && (orderSection.style.display = "block");
  }

  /* =====================================
     LOAD ORDER / BOOKING AMOUNT
  ====================================== */
  async function loadOrderAmount() {
    payAmountEl.textContent = "Loading...";
    payBtn.disabled = true;

    try {
      let endpoint;
      
      if (type === "booking") {

        if (orderId.startsWith("PBK-")) {
          endpoint = `${PENDING_BOOKING_API}/${orderId}`;
        } else if (orderId.startsWith("EVT-")) {
          endpoint = `/api/booking/details/${orderId}`;
        } else {
          throw new Error("Invalid booking reference");
        }

      } else {
        endpoint = `${ORDER_API}/pending/${orderId}`;
      }

      const res = await fetch(endpoint, {
        credentials: "include"
      });

      const data = await res.json();

      if (res.status === 401) {
        window.location.href = "error.html?type=unauthorized";
        return;
      }

      if (res.status === 404) {
        showToast("Reference not found", "error");
        payAmountEl.textContent = "--";
        return;
      }

      if (!res.ok) {
        throw new Error(data.message || "Failed to load data");
      }

      let amount = 0;

      /* ===================================
        BOOKING PAYMENT LOGIC (FIXED)
      =================================== */
      if (type === "booking") {
        let booking;

        /* 🔥 STEP 1: Detect source */
        if (data.pending) {
          booking = data.pending;

          const total = Number(booking.total) || 0;

          if (!total || total <= 0) {
            throw new Error("Invalid booking amount");
          }

          // ⏳ expiry check
          const expiry = new Date(booking.expires_at);
          if (new Date() > expiry) {
            showToast("Booking session expired", "error");
            payBtn.disabled = true;
            return;
          }

          // 🔥 FIRST PAYMENT → 50%
          amount = Number((total * 0.5).toFixed(2));

        } else {

          booking = data.booking || data;

          const total = Number(booking.total) || 0;
          const paid = Number(booking.paid_amount) || 0;

          if (paid >= total) {
            showToast("Booking already fully paid", "success");
            payAmountEl.textContent = "0.00";
            payAmountBtn.textContent = "0.00";
            payBtn.disabled = true;
            return;
          }

          // 🔥 SECOND PAYMENT → remaining
          amount = Number((total - paid).toFixed(2));
        }
      }

      /* ===================================
        ORDER PAYMENT LOGIC
      =================================== */
      else {

        const total = Number(data.total) || 0;

        if (!total || total <= 0) {
          throw new Error("Invalid order amount");
        }

        amount = total;
      }

      if (amount <= 0) {
        showToast("Nothing to pay", "warning");
        payAmountEl.textContent = "0.00";
        payAmountBtn.textContent = "0.00";
        payBtn.disabled = true;
        return;
      }

      /* ===================================
        DISPLAY
      =================================== */

      payAmountEl.textContent = amount.toFixed(2);
      payAmountBtn.textContent = amount.toFixed(2);
      payBtn.disabled = false;

    } catch (err) {

      console.error("Payment Load Error:", err);

      payAmountEl.textContent = "--";
      showToast(err.message || "Failed to load payment amount", "error");
    }
  }

  loadOrderAmount();

  /* =====================================
     TOAST SYSTEM
  ====================================== */
  function showToast(message, type = "info") {
    let toast = document.getElementById("toast");

    if (!toast) {
      toast = document.createElement("div");
      toast.id = "toast";
      toast.style.cssText = `
        position:fixed;
        bottom:100px;
        right:24px;
        padding:12px 18px;
        border-radius:10px;
        color:#fff;
        font-size:14px;
        opacity:0;
        transition:.3s;
        z-index:9999;
      `;
      document.body.appendChild(toast);
    }

    toast.style.background =
      type === "success" ? "#1db954" :
      type === "error" ? "#e63946" :
      type === "warning" ? "#f4b400" :
      "#317ad4";

    toast.innerHTML = message;
    toast.style.opacity = "1";

    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.style.opacity = "0";
    }, 2500);
  }

  /* =====================================
     VALIDATION
  ====================================== */
  const upiRegex = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/;

  function getSelectedMethod() {
    return document.querySelector(
      type === "booking"
        ? "input[name='bookingMethod']:checked"
        : "input[name='orderMethod']:checked"
    )?.value;
  }

  function getUpiInput() {
    return document.querySelector(
      type === "booking"
        ? "#bookingPaymentSection input[name='upiId']"
        : "#orderPaymentSection input[name='upiId']"
    );
  }

  function getCardInput() {
    return document.querySelector(
      type === "booking"
        ? "#bookingPaymentSection input[name='cardNumber']"
        : "#orderPaymentSection input[name='cardNumber']"
    );
  }

  function validateUPI() {
    if (getSelectedMethod() !== "upi") return true;

    const value = getUpiInput()?.value?.trim();
    if (!upiRegex.test(value)) {
      showToast("Enter valid UPI ID", "warning");
      return false;
    }
    return true;
  }

  function validateCard() {
    if (getSelectedMethod() !== "card") return true;

    const number = getCardInput()?.value?.replace(/\s/g, "");
    if (!number || number.length !== 16 || !luhnCheck(number)) {
      showToast("Enter valid card number", "warning");
      return false;
    }
    return true;
  }

  /* =====================================
     LUHN CHECK
  ====================================== */
  function luhnCheck(num) {
    let sum = 0, double = false;
    for (let i = num.length - 1; i >= 0; i--) {
      let digit = parseInt(num[i]);
      if (double) digit = digit * 2 > 9 ? digit * 2 - 9 : digit * 2;
      sum += digit;
      double = !double;
    }
    return sum % 10 === 0;
  }

  /* =====================================
     CARD AUTO FORMAT (DYNAMIC)
  ====================================== */
  document.addEventListener("input", e => {
    if (e.target.name === "cardNumber") {
      let value = e.target.value.replace(/\D/g, "").substring(0, 16);
      e.target.value = value.replace(/(.{4})/g, "$1 ").trim();
    }
  });

  /* =====================================
     PAYMENT CONFIRM
  ====================================== */
  async function confirmPayment(method) {
    try {

      /* =========================
        API CALL
      ========================= */
      const res = await fetch(PAYMENT_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          id: orderId,   // pendingOrderId
          type,
          method
        })
      });

      let data = {};
      try {
        data = await res.json();
      } catch (e) {
        console.warn("Invalid JSON response");
      }

      /* =========================
        STATUS HANDLING
      ========================= */
      if (res.status === 401) {
        window.location.href = "error.html?type=unauthorized";
        return;
      }

      if (res.status === 403) {
        showToast("Payment not allowed", "error");
        resetButton();
        payBtn.disabled = false;
        return;
      }

      if (res.status === 404) {
        showToast("Order not found or expired", "error");
        resetButton();
        payBtn.disabled = false;
        return;
      }

      if (res.status === 409) {
        showToast("Payment already processed", "warning");
        resetButton();
        payBtn.disabled = false;
        return;
      }

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Payment failed");
      }

      /* =========================
        SUCCESS
      ========================= */
      showToast("Payment successful", "success");

      const finalOrderId = data.id;   

      setTimeout(() => {

        if (type === "booking") {
          window.location.href = `booking-success.html?bookingId=${finalOrderId}`;
        } else {
          window.location.href = `success.html?orderId=${finalOrderId}`;
        }

      }, 1200);

    } catch (err) {

      console.error("Payment Error:", err);

      if (!navigator.onLine) {
        window.location.href = "error.html?type=network";
        return;
      }

      showToast(err.message || "Payment failed. Try again.", "error");

      payBtn.disabled = false;
      resetButton();
    }
  }

  /* =====================================
     BUTTON CONTROL
  ====================================== */
  const originalBtnHTML = payBtn.innerHTML;

  function showSpinner() {
    payBtn.innerHTML = `<i class="fa fa-spinner fa-spin"></i> Processing...`;
  }

  function resetButton() {
    payBtn.innerHTML = originalBtnHTML;
  }

  function handlePay() {
    if (payBtn.disabled) return;

    const method = getSelectedMethod();

    if (!method) {
      showToast("Select payment method", "warning");
      return;
    }

    if (!validateUPI() || !validateCard()) return;

    payBtn.disabled = true;
    showSpinner();
    confirmPayment(method);
  }

  payBtn.addEventListener("click", handlePay);

  /* =====================================
     BACK BUTTON
  ====================================== */
  backBtn?.addEventListener("click", () => {
    window.location.href =
      type === "booking" ? "booking.html" : "checkout.html";
  });

  /* =====================================
     METHOD ACTIVE UI
  ====================================== */
  document.querySelectorAll(".method input").forEach(radio => {
    radio.addEventListener("change", () => {
      radio.closest("form")
        ?.querySelectorAll(".method-card")
        .forEach(card => card.classList.remove("active"));

      radio.closest(".method-card")
        ?.classList.add("active");
    });
  });

})();