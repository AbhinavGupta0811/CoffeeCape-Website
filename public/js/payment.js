(() => {
  /* =====================================
     CONFIG
  ====================================== */
  const PAYMENT_API = "/api/payment/confirm";
  const ORDER_API = "/api/orders";
  const PENDING_BOOKING_API = "/api/booking/pending";
  const PENDING_AUDIENCE_API = "/api/audience/pending";
  const AUDIENCE_PAYMENT_API = "/api/audience/payment";
  
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
    PROFESSIONAL TOAST SYSTEM
  ===================================== */
  function showToast(message, type = "info") {
    let toast = document.getElementById("toast");

    if (!toast) {
      toast = document.createElement("div");
      toast.id = "toast";

      toast.style.cssText = `
        position: fixed;
        bottom: 100px;
        right: 20px;
        min-width: 280px;
        max-width: 380px;
        padding: 14px 18px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        gap: 12px;
        color: #fff;
        font-size: 14px;
        font-weight: 500;
        font-family: inherit;
        box-shadow: 0 10px 30px rgba(0,0,0,.25);
        opacity: 0;
        transform: translateX(100%);
        transition: all .35s ease;
        z-index: 99999;
        overflow: hidden;
      `;

      document.body.appendChild(toast);
    }

    const styles = {
      success: {
        bg: "#16a34a",
        icon: "fa-circle-check"
      },
      error: {
        bg: "#dc2626",
        icon: "fa-circle-xmark"
      },
      warning: {
        bg: "#f59e0b",
        icon: "fa-triangle-exclamation"
      },
      info: {
        bg: "#2563eb",
        icon: "fa-circle-info"
      }
    };

    const current = styles[type] || styles.info;

    toast.style.background = current.bg;

    toast.innerHTML = `
      <div style=" width:32px; height:32px; border-radius:50%; background:rgba(255,255,255,.2);
        display:flex;
        align-items:center;
        justify-content:center;
        flex-shrink:0;
      ">
        <i class="fa-solid ${current.icon}"></i>
      </div>

      <div style=" flex:1; line-height:1.4; word-break:break-word;">
        ${message}
      </div>
    `;

    // Show
    toast.style.opacity = "1";
    toast.style.transform = "translateX(0)";

    clearTimeout(toast._timer);

    // Hide
    toast._timer = setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(100%)";
    }, 3000);
  }
  
  /* =====================================
     GET TYPE + ID
  ====================================== */
  const params = new URLSearchParams(window.location.search);
  const type = (params.get("type") || "order").trim().toLowerCase();
  const VALID_PAYMENT_TYPES = new Set([
    "order",
    "booking",
    "audience"
  ]);

  if (!VALID_PAYMENT_TYPES.has(type)) {
    throw new Error(
      `Unsupported payment type: ${type}`
    );
  }
  const orderId = params.get("id") || params.get("orderId");

  if (!orderId) {
    showToast("Invalid payment reference", "error");
    payBtn.disabled = true;
    setTimeout(() => window.location.href = "checkout.html", 1500);
    return;
  }

  /* =====================================
     RELOAD / RE-ACCESS PROTECTION
     Blocks intentional page reloads (F5, Ctrl+R, reload button,
     location.reload()) and blocks re-entry via back/forward
     navigation or bfcache restore, for this order/booking id.

     NOTE: This is a client-side UX safeguard only, scoped to the
     current tab's sessionStorage. It stops a casual reload/back
     from re-showing the form, but it is NOT a substitute for
     server-side protection — the backend must still invalidate
     or consume the pending order/booking token once payment is
     confirmed, so a resubmitted request can never double-charge.
  ====================================== */
  const guardKey = `pay_guard_${type}_${orderId}`;

  function blockPaymentAccess(reason) {
    try {
      sessionStorage.setItem(guardKey, "blocked");
    } catch (e) {
      // sessionStorage unavailable (e.g. private mode) - fall through to redirect anyway
    }
    window.location.replace(`error.html?type=${reason}`);
  }

  const navEntry = performance.getEntriesByType("navigation")[0];
  const navType = navEntry
    ? navEntry.type
    : (performance.navigation && performance.navigation.type === 1 ? "reload" : "navigate");

  const guardState = sessionStorage.getItem(guardKey);

  if (guardState === "blocked") {
    blockPaymentAccess("session-expired");
    return;
  }

  if (navType === "reload") {
    blockPaymentAccess("reload-detected");
    return;
  }

  if (guardState === "visited") {
    // Page was already opened once this session (fresh navigate, back/forward, etc.)
    blockPaymentAccess("session-expired");
    return;
  }

  sessionStorage.setItem(guardKey, "visited");

  // Catches the case where the browser restores this page from bfcache
  // (e.g. pressing back) without re-running the script from scratch.
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) {
      blockPaymentAccess("session-expired");
    }
  });

  // Guard passed for this load - safe to reveal the page now.
  document.documentElement.classList.remove("pay-guard-pending");

  function generateDisplayOrderId(id) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let random = "";

    for (let i = 0; i < 6; i++) {
      random += chars.charAt(
        Math.floor(
          Math.random() * chars.length
        )
      );
    }

    return `CCO-${random}-${id}`;
  }
  
  let displayOrderId =
    sessionStorage.getItem(
      "displayOrderId"
    );

  if (!displayOrderId) {

    displayOrderId =
      generateDisplayOrderId(
        orderId
      );

    sessionStorage.setItem(
      "displayOrderId",
      displayOrderId
    );
  }

  orderIdEl.textContent = displayOrderId;

  /* =====================================
     SHOW CORRECT FORM
  ====================================== */
  if (type === "booking" || type === "audience") {
    if (orderSection) {
      orderSection.style.display = "none";
    }
    if (bookingSection) {
      bookingSection.style.display = "block";
    }

  }
  else {
    if (bookingSection) {
        bookingSection.style.display = "none";
    }
    if (orderSection) {
        orderSection.style.display = "block";
    }
  }

  /* =====================================
     LOAD ORDER / BOOKING AMOUNT
  ====================================== */
  async function loadOrderAmount() {
    payAmountEl.textContent = "Loading...";
    payBtn.disabled = true;

    try {
      let endpoint;
    
      if (type === "audience") {
        endpoint = `${PENDING_AUDIENCE_API}/${orderId}`;
      } else if(type === "booking") {
        if (orderId.startsWith("PBK-")) {
          endpoint = `${PENDING_BOOKING_API}/${orderId}`;
        }
        else if (orderId.startsWith("EVT-")) {
          endpoint = `/api/booking/details/${orderId}`;
        }
        else {
          throw new Error( "Invalid booking reference");
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
      if (type === "booking" || type === "audience") {
        let booking;

        /* 🔥 STEP 1: Detect source */
        if (data.pending) {

          booking = data.pending;

          /* ==========================
            TOTAL AMOUNT
          ========================== */
          const total =
            Number(
              booking.total ??
              booking.pricing?.total
            ) || 0;

          if (total <= 0) {
            throw new Error(
              "Invalid booking amount"
            );
          }

          /* ==========================
            EXPIRY
          ========================== */
          const expiry =
            new Date(
              booking.expiresAt ??
              booking.expires_at
            );

          if (
            !Number.isNaN(expiry.getTime()) &&
            new Date() > expiry
          ) {

            showToast(
              "Booking session expired",
              "error"
            );
            payBtn.disabled = true;
            return;
          }

          /* ==========================
            PAYMENT CALCULATION
          ========================== */
          if (type === "audience") {
            amount = total;
          }
          else {
            amount =
              Number(
                (total * 0.5).toFixed(2)
              );
          }

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
        const order = data.order || data;
        const total = Number(order.total) || 0;

        if (total <= 0) {
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
     VALIDATION
  ====================================== */
  const upiRegex = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/;

  function getSelectedMethod() {
    if (type === "booking" || type === "audience") {
      return document.querySelector(
        "input[name='bookingMethod']:checked"
      )?.value;
    }
    return document.querySelector(
      "input[name='orderMethod']:checked"
    )?.value;
  }

  function getUpiInput() {
    if (type === "booking" || type === "audience") {
      return document.querySelector(
        "#bookingPaymentSection input[name='upiId']"
      );
    }
    return document.querySelector(
      "#orderPaymentSection input[name='upiId']"
    );
  }

  function getCardInput() {
    if (type === "booking" || type === "audience") {
      return document.querySelector(
        "#bookingPaymentSection input[name='cardNumber']"
      );
    }
    return document.querySelector(
      "#orderPaymentSection input[name='cardNumber']"
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
      /* API CALL */
      const apiEndpoint =
        type === "audience"
            ? AUDIENCE_PAYMENT_API
            : PAYMENT_API;

      const res = await fetch(apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(
          type === "audience"
          ? {
              pendingId: orderId,
              paymentMethod: method,
              paymentId: `AUDPAY-${Date.now()}`,
              amount: parseFloat(
                payAmountEl.textContent.replace(
                  /[^\d.]/g,
                  ""
                )
              )
            }
          : {
              id: orderId,
              type,
              method
            }
        )
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
        if (type === "audience") {
          showToast(
            data.message || "Audience payment failed.",
            "error"
          );
        } else {
          showToast(
            data.message || "Payment failed.",
            "error"
          );
        }

        resetButton();
        payBtn.disabled = false;
        return;
      }

      /* =========================
        SUCCESS
      ========================= */
      showToast("Payment successful", "success");

      let finalReference;
      if (type === "audience") {
        finalReference = data.booking?.audienceBookingId || data.booking?.bookingId || data.bookingId || data.id;
      }
      else if (type === "booking") {
        finalReference = data.bookingId || data.id;
      }
      else {
        finalReference = data.orderId || data.id;
      }  

      setTimeout(() => {
        if (type === "audience") {
          window.location.href =
            `my-activity.html?booking=${encodeURIComponent(finalReference)}`;
        }
        else if (type === "booking") {
          window.location.href =
            `booking-success.html?bookingId=${encodeURIComponent(finalReference)}`;
        }
        else {
          window.location.href = 
            `success.html?orderId=${encodeURIComponent(finalReference)}`;
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
    if (type === "audience") {
      window.location.href = "audience-booking.html";
    }
    else if (type === "booking") {
      window.location.href = "booking.html";
    }
    else {
      window.location.href = "checkout.html";
    }
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