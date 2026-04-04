/* ================================
   API CONFIG
================================ */
const API_BASE_URL = "/api/booking";
const BOOKING_ENDPOINT = `${API_BASE_URL}/create-pending`;
const AVAILABILITY_ENDPOINT = `${API_BASE_URL}/availability`;

const PRICING = {
  dinner: { base: 4999, perGuest: 350 },
  karaoke: { base: 2499, perGuest: 200 },
  openmic: { base: 999, perGuest: 0 },
  tasting: { base: 2499, perGuest: 400 },
  get: { base: 2499, perGuest: 250 },
  private: { base: 3999, perGuest: 450 }
};

const ADDONS = {
  djRequired: 1500,
  gamesArrangement: 800,
  customCakeRequired: 1200
};

const GST_PERCENT = 18;

/* ================================
   PAGE INIT
================================ */
document.addEventListener("DOMContentLoaded", async () => {

  const isAuth = await checkAuthentication();
  if (!isAuth) return;

  initPricing();
  activateTabFromURL();
  initTabEvents();
  enableRealtimeValidation();
  handleForms();
  blockPastDates();
});

/* ================================
   AUTH
================================ */
async function checkAuthentication() {
  try {
    const response = await fetch("/api/auth/me", {
      credentials: "include"
    });

    if (!response.ok) {
      showToast("Please login as User", "warning");
      redirectToLogin();
      return false;
    }

    return true;
  } catch {
    redirectToLogin();
    return false;
  }
}

function redirectToLogin() {
  setTimeout(() => {
    window.location.href = "Auth.html";
  }, 1500);
}

/* ================================
   BLOCK PAST DATES
================================ */
function blockPastDates() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];

  document.querySelectorAll(
    "input[name='eventDate'], input[name='reservationDate']"
  ).forEach(input => {
    input.setAttribute("min", todayStr);
  });
}

/* ================================
   TAB SYSTEM
================================ */
function activateTabFromURL() {
  const params = new URLSearchParams(window.location.search);
  const event = params.get("event");
  if (!event) return;

  const trigger = document.querySelector(`[data-bs-target="#${event}"]`);
  if (trigger) new bootstrap.Tab(trigger).show();
}

function initTabEvents() {
  document.querySelectorAll(".nav-link[data-bs-toggle='pill']")
    .forEach(tab => {
      tab.addEventListener("shown.bs.tab", (event) => {
        const targetId =
          event.target.getAttribute("data-bs-target").replace("#", "");
        window.history.replaceState(null, "", `?event=${targetId}`);
        updatePricing();
      });
    });
}

/* ================================
   VALIDATION
================================ */
function enableRealtimeValidation() {
  document.querySelectorAll("input, select")
    .forEach(input => {
      input.addEventListener("input", () => validateField(input));
      input.addEventListener("blur", () => validateField(input));
    });
}

function validateField(input) {
  input.classList.remove("is-valid", "is-invalid");

  if (input.required && !input.value.trim()) {
    input.classList.add("is-invalid");
    return false;
  }

  if (input.type === "email" && input.value) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(input.value)) {
      input.classList.add("is-invalid");
      return false;
    }
  }

  if (input.name === "phone" && input.value) {
    const cleaned = input.value.replace(/\D/g, "");
    if (cleaned.length !== 10) {
      input.classList.add("is-invalid");
      return false;
    }
  }

  if ((input.name === "eventDate" || input.name === "reservationDate") && input.value) {
    const selected = new Date(input.value);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (selected < today) {
      input.classList.add("is-invalid");
      return false;
    }
  }

  input.classList.add("is-valid");
  return true;
}

function validateForm(form) {
  let valid = true;
  form.querySelectorAll("input, select")
    .forEach(input => {
      if (!validateField(input)) valid = false;
    });
  return valid;
}

/* ================================
   PRICING
================================ */
function initPricing() {
  document.addEventListener("input", updatePricing);
  document.addEventListener("change", updatePricing);
  updatePricing();
}

function updatePricing() {

  const activeTab = document.querySelector(".tab-pane.show.active");
  if (!activeTab) return;

  const form = activeTab.querySelector("form");
  if (!form) return;

  const eventType = activeTab.id;
  const config = PRICING[eventType];
  if (!config) return;

  /* ===============================
     GUEST COUNT
  =============================== */
  const guests =
    parseInt(form.querySelector("[name='guestCount']")?.value) ||
    parseInt(form.querySelector("[name='participants']")?.value) ||
    0;

  /* ===============================
     ADD-ONS CALCULATION
  =============================== */
  let addonTotal = 0;

  Object.keys(ADDONS).forEach(key => {
    const field = form.querySelector(`[name='${key}']`);
    if (field && field.value === "yes") {
      addonTotal += ADDONS[key];
    }
  });

  /* ===============================
     PRICE CALCULATION (PROFESSIONAL)
  =============================== */

  const baseGuests = config.base + guests * config.perGuest;
  const subtotal = baseGuests + addonTotal;
  const gstAmount = (subtotal * GST_PERCENT) / 100;
  const grandTotal = subtotal + gstAmount;

  /* ===============================
     UPDATE UI
  =============================== */

  const baseEl = form.querySelector(".basePrice");
  const addonEl = form.querySelector(".addonPrice");
  const gstEl = form.querySelector(".gstPrice");
  const totalEl = form.querySelector(".totalPrice");
  const totalInput = form.querySelector(".totalPriceInput");

  if (baseEl) baseEl.innerText = baseGuests.toFixed(2);
  if (addonEl) addonEl.innerText = addonTotal.toFixed(2);
  if (gstEl) gstEl.innerText = gstAmount.toFixed(2);
  if (totalEl) totalEl.innerText = grandTotal.toFixed(2);
  if (totalInput) totalInput.value = grandTotal.toFixed(2);
}

function calculateTotal(eventType, data) {
  const config = PRICING[eventType];
  if (!config) return 0;

  const guests =
    parseInt(data.guestCount) ||
    parseInt(data.participants) ||
    0;

  let addonTotal = 0;
  Object.keys(ADDONS).forEach(key => {
    if (data[key] === "yes") {
      addonTotal += ADDONS[key];
    }
  });

  const subtotal = config.base + guests * config.perGuest + addonTotal;
  const gst = (subtotal * GST_PERCENT) / 100;

  return Number((subtotal + gst).toFixed(2));
}

/* ================================
   FORM HANDLING
================================ */
function handleForms() {

  let pendingFormData = null;
  let pendingEventType = null;

  document.querySelectorAll(".tab-pane form")
    .forEach(form => {

      form.addEventListener("submit", async (e) => {
        e.preventDefault();

        if (!validateForm(form)) {
          showToast("Please fill all required fields correctly", "danger");
          return;
        }

        const activeTab =
          document.querySelector(".tab-pane.show.active");

        pendingEventType = activeTab?.id;

        const rawData =
          Object.fromEntries(new FormData(form).entries());

        pendingFormData =
          normalizeBookingData(pendingEventType, rawData);

        const modal = new bootstrap.Modal(
          document.getElementById("permissionModal")
        );
        modal.show();
      });

    });

  /* ===============================
     CONFIRM BUTTON CLICK
  =============================== */
  const confirmBtn = document.getElementById("confirmProceedBtn");

  confirmBtn.addEventListener("click", async () => {

    if (!pendingFormData) return;

    try {

      const selectedDate = new Date(pendingFormData.eventDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (selectedDate < today) {
        showToast("Past dates are not allowed", "danger");
        return;
      }

      await checkAvailability(pendingFormData);

      const res = await fetch(BOOKING_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(pendingFormData)
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.message);

      window.location.href =
        `payment.html?type=booking&id=${result.pendingId}`;

    } catch (err) {
      showToast(err.message, "danger");
    }

  });

}

/* ================================
   DATA NORMALIZER
================================ */
function normalizeBookingData(eventType, raw) {

  return {
    eventType,
    fullName: raw.fullName || "",
    phone: raw.phone || "",
    email: raw.email || "",
    eventDate: raw.eventDate || raw.reservationDate || "",
    eventTime: raw.eventTime || "",
    guestCount: raw.guestCount || raw.participants || 1,
    total: calculateTotal(eventType, raw),
    booking_data: raw
  };
}

/* ================================
   AVAILABILITY
================================ */
async function checkAvailability(data) {

  const params = new URLSearchParams({
    eventType: data.eventType,
    eventDate: data.eventDate,
    eventTime: data.eventTime
  });

  const res = await fetch(
    `${AVAILABILITY_ENDPOINT}?${params}`,
    { credentials: "include" }
  );

  const result = await res.json();

  if (!result.available) {
    throw new Error("Selected slot is not available");
  }
}

/* ================================
   CANCEL BOOKING
================================ */
async function cancelBooking(bookingId) {

  try {
    const response = await fetch(
      `/api/booking/cancel/${bookingId}`,
      { method: "PUT", credentials: "include" }
    );

    if (response.status === 401) {
      redirectToLogin();
      return;
    }

    const result = await response.json();
    if (!response.ok)
      throw new Error(result.message || "Cancel failed");

    showToast("Booking cancelled successfully", "success");

  } catch (err) {
    showToast(err.message, "danger");
  }
}

/* ================================
   TOAST
================================ */
function showToast(message, type = "primary") {

  const toastEl = document.getElementById("appToast");

  if (!toastEl) {
    alert(message);
    return;
  }

  const toastBody = toastEl.querySelector(".toast-body");

  toastEl.className =
    `toast align-items-center text-bg-${type} border-0`;

  toastBody.innerHTML = message;

  new bootstrap.Toast(toastEl, {
    delay: 3000
  }).show();
}
floatingHomeBtn.onclick = () => {
  location.href = "index.html";
};