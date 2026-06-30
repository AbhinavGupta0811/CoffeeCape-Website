(() => {
  "use strict";

  /* =====================================================
     CONFIG
     - eventType / bookingId / ticketPrice / maxSeats should
       ideally be injected server-side (e.g. via a small JSON
       blob rendered into the page) or passed as query params
       from events.html → event-details.html → here.
     - Falls back to scraping the static demo markup so the
       page still works standalone.
  ===================================================== */
  const API_BASE = "/api/audience";

  const qs = new URLSearchParams(window.location.search);

  const EVENT_DETAILS = {
    openmic: {
      title: "Open Mic Night",
      description: "Take the stage or enjoy talented performers from the audience.",
      image: "assets/open-mic-night.png"
    },

    karaoke: {
      title: "Karaoke Night",
      description: "Sing your favourite songs and cheer for amazing performers.",
      image: "assets/karaoke.jpg"
    },

    tasting: {
      title: "Coffee Tasting Event",
      description: "Experience premium coffee tasting with our expert baristas.",
      image: "assets/tasting-event.png"
    }
  };

  const els = {
    // Hero / info (read-only display, already rendered server-side)
    ticketPriceEl: document.getElementById("ticketPrice"),
    ticketPriceCardEl: document.getElementById("ticketPriceCard"),
    availableSeatsEl: document.getElementById("availableSeats"),
    maxAvailableSeatsEl: document.getElementById("maxAvailableSeats"),
    availableSeatCountEl: document.getElementById("availableSeatCount"),
    availabilityWarningEl: document.getElementById("availabilityWarning"),
    eventNameEl: document.getElementById("eventName"),
    eventDateEl: document.getElementById("eventDate"),
    eventTimeEl: document.getElementById("eventTime"),

    /* ---------- Hero ---------- */
    eventLocationEl: document.getElementById("eventLocation"),
    eventDescriptionEl: document.getElementById("eventDescription"),
    eventImageEl: document.getElementById("eventImage"),

    /* ---------- Event Info Card ---------- */
    venueNameEl: document.getElementById("venueName"),
    eventDateCardEl: document.getElementById("eventDateCard"),
    eventTimeCardEl: document.getElementById("eventTimeCard"),

    /* ---------- Summary ---------- */
    summaryEventNameEl: document.getElementById("summaryEventName"),
    summaryEventImageEl: document.getElementById("summaryEventImage"),

    // Form
    form: document.getElementById("audienceBookingForm"),
    fullName: document.getElementById("fullName"),
    email: document.getElementById("email"),
    phone: document.getElementById("phone"),

    seatCount: document.getElementById("seatCount"),
    decreaseSeat: document.getElementById("decreaseSeat"),
    increaseSeat: document.getElementById("increaseSeat"),

    specialRequest: document.getElementById("specialRequest"),
    specialRequestCount: document.getElementById("specialRequestCount"),
    bookingNotes: document.getElementById("bookingNotes"),
    notesCount: document.getElementById("notesCount"),

    acceptTerms: document.getElementById("acceptTerms"),
    continuePaymentBtn: document.getElementById("continuePaymentBtn"),

    // Summary sidebar
    summaryTicketPrice: document.getElementById("summaryTicketPrice"),
    summarySeatCount: document.getElementById("summarySeatCount"),
    summarySubtotal: document.getElementById("summarySubtotal"),
    summaryTax: document.getElementById("summaryTax"),
    summaryTotal: document.getElementById("summaryTotal"),

    // Modal
    modalOverlay: document.getElementById("confirmBookingModal"),
    closeConfirmModal: document.getElementById("closeConfirmModal"),
    cancelBookingBtn: document.getElementById("cancelBookingBtn"),
    confirmBookingBtn: document.getElementById("confirmBookingBtn"),
    confirmEventName: document.getElementById("confirmEventName"),
    confirmSeatCount: document.getElementById("confirmSeatCount"),
    confirmTotal: document.getElementById("confirmTotal"),

    // Overlays
    loadingOverlay: document.getElementById("loadingOverlay"),
    toastContainer: document.getElementById("toastContainer")
  };

  const TAX_RATE = 0.18; // booking summary currently shows ₹0 tax; adjust if GST applies

  const state = {
    eventType:
      (
        qs.get("event") ||
        qs.get("eventType") ||
        "openmic"
      ).toLowerCase(),
    bookingId: null,
    ticketPrice: 0,
    maxSeats: 0,
    seatCount: 1,
    pendingId: null,
    submitting: false,
    isLoggedIn: false
  };

  /* =====================================================
     VALIDATION (mirrors backend audience.helper.js rules)
  ===================================================== */
  const validators = {
    fullName(value) {
      const v = value.trim();
      if (!v) return "Full name is required";
      if (v.length < 2) return "Name must be at least 2 characters";
      if (!/^[A-Za-z\s.'-]+$/.test(v)) return "Name contains invalid characters";
      return "";
    },
    email(value) {
      const v = value.trim();
      if (!v) return "Email is required";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "Enter a valid email address";
      return "";
    },
    phone(value) {
      const v = value.trim();
      if (!v) return "Mobile number is required";
      if (!/^[6-9]\d{9}$/.test(v)) return "Enter a valid 10-digit Indian mobile number";
      return "";
    }
  };

  function showFieldError(input, message) {
    const errorEl = input.parentElement.querySelector(".input-error");
    if (errorEl) errorEl.textContent = message;
    input.classList.toggle("invalid", Boolean(message));
  }

  function validateField(input, validatorName) {
    const message = validators[validatorName](input.value);
    showFieldError(input, message);
    return !message;
  }

  function validateAllFields() {
    const nameOk = validateField(els.fullName, "fullName");
    const emailOk = validateField(els.email, "email");
    const phoneOk = validateField(els.phone, "phone");
    return nameOk && emailOk && phoneOk;
  }

  /* =====================================================
     SEAT STEPPER
  ===================================================== */
  function renderSeatStepper() {
    els.seatCount.value = state.seatCount;
    els.decreaseSeat.disabled = state.seatCount <= 1;
    els.increaseSeat.disabled = state.seatCount >= state.maxSeats;
  }

  function setSeatCount(next) {
    const clamped = Math.min(Math.max(1, next), Math.max(1, state.maxSeats));
    if (clamped === state.seatCount) return;
    state.seatCount = clamped;
    renderSeatStepper();
    updateSummary();
  }

  els.decreaseSeat?.addEventListener("click", () => setSeatCount(state.seatCount - 1));
  els.increaseSeat?.addEventListener("click", () => setSeatCount(state.seatCount + 1));

  /* =====================================================
     CHARACTER COUNTERS
  ===================================================== */
  function bindCounter(textarea, counterEl) {
    if (!textarea || !counterEl) return;
    const max = Number(textarea.getAttribute("maxlength")) || 0;
    const update = () => {
      const len = textarea.value.length;
      counterEl.textContent = len;
      counterEl.parentElement.classList.toggle("limit-reached", max > 0 && len >= max);
    };
    textarea.addEventListener("input", update);
    update();
  }

  bindCounter(els.specialRequest, els.specialRequestCount);
  bindCounter(els.bookingNotes, els.notesCount);

  /* =====================================================
     PRICING SUMMARY
  ===================================================== */
  function updateSummary() {
    const subtotal = state.ticketPrice * state.seatCount;
    const tax = Math.round(subtotal * TAX_RATE);
    const total = subtotal + tax;

    if (els.summaryTicketPrice) els.summaryTicketPrice.textContent = state.ticketPrice;
    if (els.summarySeatCount) els.summarySeatCount.textContent = state.seatCount;
    if (els.summarySubtotal) els.summarySubtotal.textContent = subtotal;
    if (els.summaryTax) els.summaryTax.textContent = tax;
    if (els.summaryTotal) els.summaryTotal.textContent = total;

    return { subtotal, tax, total };
  }

  /* =====================================================
     SEAT AVAILABILITY WARNING
  ===================================================== */
  function renderAvailabilityWarning() {
    if (!els.availabilityWarningEl) return;
    if (state.maxSeats <= 10) {
      els.availabilityWarningEl.hidden = false;
      els.availabilityWarningEl.textContent =
        state.maxSeats === 0
          ? "Sold out — booking closed."
          : "Hurry! Seats are filling fast.";
    } else {
      els.availabilityWarningEl.hidden = true;
    }
  }

  /* =====================================================
     CONTINUE BUTTON ENABLE/DISABLE
  ===================================================== */
  function canSubmit() {
    return (
      state.isLoggedIn &&
      els.fullName.value.trim() &&
      els.email.value.trim() &&
      els.phone.value.trim() &&
      els.acceptTerms.checked &&
      state.maxSeats > 0 &&
      !state.submitting
    );
  }

  function refreshSubmitState() {
    els.continuePaymentBtn.disabled = !canSubmit();
  }

  [els.fullName, els.email, els.phone].forEach((input) => {
    input?.addEventListener("input", refreshSubmitState);
  });
  els.acceptTerms?.addEventListener("change", refreshSubmitState);

  els.fullName?.addEventListener("blur", () => validateField(els.fullName, "fullName"));
  els.email?.addEventListener("blur", () => validateField(els.email, "email"));
  els.phone?.addEventListener("blur", () => validateField(els.phone, "phone"));

  /* =====================================================
     TOASTS
  ===================================================== */
  function showToast(message, type = "success", duration = 4000) {
    if (!els.toastContainer) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    const icon = document.createElement("i");

    switch (type) {
      case "success":
        icon.className = "bi bi-check-circle-fill";
        break;

      case "error":
        icon.className = "bi bi-x-circle-fill";
        break;

      default:
        icon.className = "bi bi-exclamation-triangle-fill";
    }

    const text = document.createElement("span");
    text.textContent = String(message);
    toast.appendChild(icon);
    toast.appendChild(text);

    els.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, duration);
  }

  /* =====================================================
     LOADING OVERLAY
  ===================================================== */
  function setLoading(isLoading, text) {
    if (!els.loadingOverlay) return;
    els.loadingOverlay.hidden = !isLoading;
    if (isLoading && text) {
      const h3 = els.loadingOverlay.querySelector("h3");
      if (h3) h3.textContent = text;
    }
  }

  /* =====================================================
     CONFIRMATION MODAL
  ===================================================== */
  function openModal(totals) {
    els.confirmEventName.textContent = els.eventNameEl?.textContent.trim() || "Event";
    els.confirmSeatCount.textContent = state.seatCount;
    els.confirmTotal.textContent = totals.total;
    els.modalOverlay.setAttribute("aria-hidden", "false");
    els.modalOverlay.hidden = false;
  }

  function closeModal() {
    els.modalOverlay.setAttribute("aria-hidden", "true");
    setTimeout(() => { els.modalOverlay.hidden = true; }, 200);
  }

  els.closeConfirmModal?.addEventListener("click", closeModal);
  els.cancelBookingBtn?.addEventListener("click", closeModal);
  els.modalOverlay?.addEventListener("click", (e) => {
    if (e.target === els.modalOverlay) closeModal();
  });

  /* =====================================================
     API HELPERS
  ===================================================== */
  async function apiRequest(path, options = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      credentials: "include", // sends the auth cookie/session for verifyToken middleware
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    let data;
    try {
      data = await res.json();
    } catch {
      data = { success: false, message: "Unexpected server response" };
    }

    if (!res.ok || !data.success) {
      const err = new Error(data.message || "Request failed");
      err.status = res.status;
      err.payload = data;
      throw err;
    }

    return data;
  }

  function buildBookingPayload() {
    return {
      bookingId: state.bookingId,
      eventType: state.eventType,
      eventCategory: "audience",
      eventDate: els.eventDateEl?.getAttribute("data-iso") || els.eventDateEl?.textContent.trim() || "",
      eventTime: els.eventTimeEl?.getAttribute("data-24h") || "19:00",
      audienceCount: state.seatCount,
      fullName: els.fullName.value,
      email: els.email.value,
      phone: els.phone.value,
      extras: [],
      specialRequest: els.specialRequest.value,
      notes: els.bookingNotes.value
    };
  }

  /* =====================================================
     RENDER STATIC EVENT DETAILS (from URL param, instant)
     Populates hero title / description / image immediately
     without waiting for the API, so Karaoke / Open Mic /
     Tasting each show the correct content straight away.
  ===================================================== */
  function renderStaticEventDetails() {
    const eventConfig = EVENT_DETAILS[state.eventType];
    if (!eventConfig) return;

    if (els.eventNameEl) {
      els.eventNameEl.textContent = eventConfig.title;
    }

    if (els.eventDescriptionEl) {
      els.eventDescriptionEl.textContent = eventConfig.description;
    }

    if (els.eventImageEl && eventConfig.image) {
      els.eventImageEl.src  = eventConfig.image;
      els.eventImageEl.alt  = eventConfig.title;
    }

    if (els.summaryEventNameEl) {
      els.summaryEventNameEl.textContent = eventConfig.title;
    }

    if (els.summaryEventImageEl && eventConfig.image) {
      els.summaryEventImageEl.src = eventConfig.image;
      els.summaryEventImageEl.alt = eventConfig.title;
    }

    // Update breadcrumb / page title so the browser tab also reflects the event
    document.title = `${eventConfig.title} — Audience Booking | CoffeeCape`;
  }

  /* =====================================================
    CHECK LOGIN STATUS
  ===================================================== */
  async function checkLoginStatus() {
    try {
      const response = await fetch("/api/auth/me", {
          credentials: "include"
      });
      
      state.isLoggedIn = response.ok;
    } catch {
      state.isLoggedIn = false;
    }
  }

  /* =====================================================
    LOAD LIVE AUDIENCE EVENT
  ===================================================== */
  async function loadAudienceEvent() {

    setLoading(true, "Loading Event...");

    try {

      const data = await apiRequest(
        `/event/${encodeURIComponent(state.eventType)}`
      );

      const event = data.event;
      console.log("Query Event:", state.eventType);
      console.log("Database Event:", event.eventType);
      console.log("API Response:", event);

      const eventConfig =
        EVENT_DETAILS[event.eventType] || {
          title: event.eventType,
          description: "",
          image: ""
        };

      /* ==========================
        FORMAT DATE & TIME
      ========================== */

      const formattedDate = new Date(event.eventDate)
        .toLocaleDateString("en-IN", {
          day: "numeric",
          month: "long",
          year: "numeric"
        });

      const formattedTime = new Date(
        `1970-01-01T${event.eventTime}`
      ).toLocaleTimeString("en-IN", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true
      });

      /* ==========================
        UPDATE STATE
      ========================== */

      state.bookingId = event.bookingId;
      state.ticketPrice = Number(event.ticketPrice) || 0;
      state.maxSeats = Number(event.availableSeats) || 0;

      if (event.availableSeats <= 0) {

        state.seatCount = 0;

        if (els.continuePaymentBtn) {
          els.continuePaymentBtn.disabled = true;
          els.continuePaymentBtn.textContent = "Sold Out";
        }

      }

      /* ==========================
        HERO SECTION
      ========================== */

      if (els.eventNameEl) {
        els.eventNameEl.textContent = eventConfig.title;
      }

      if (els.eventDescriptionEl) {
        els.eventDescriptionEl.textContent =
          eventConfig.description;
      }

      if (
        els.eventImageEl &&
        eventConfig.image
      ) {
        els.eventImageEl.src =
          eventConfig.image;

        els.eventImageEl.alt =
          eventConfig.title;
      }

      if (els.eventLocationEl) {
        els.eventLocationEl.textContent =
          event.address || "Not Available";
      }

      if (els.eventDateEl) {
        els.eventDateEl.textContent =
          formattedDate;

        els.eventDateEl.dataset.iso =
          event.eventDate;
      }

      if (els.eventTimeEl) {
        els.eventTimeEl.textContent =
          formattedTime;

        els.eventTimeEl.dataset.time =
          event.eventTime;
      }

      /* ==========================
        EVENT INFORMATION CARD
      ========================== */

      if (els.venueNameEl) {
        els.venueNameEl.textContent =
          event.address || "Not Available";
      }

      if (els.eventDateCardEl) {
        els.eventDateCardEl.textContent =
          formattedDate;
      }

      if (els.eventTimeCardEl) {
        els.eventTimeCardEl.textContent =
          formattedTime;
      }

      /* ==========================
        BOOKING SUMMARY
      ========================== */

      if (els.summaryEventNameEl) {
        els.summaryEventNameEl.textContent =
          eventConfig.title;
      }

      if (
        els.summaryEventImageEl &&
        eventConfig.image
      ) {
        els.summaryEventImageEl.src =
          eventConfig.image;

        els.summaryEventImageEl.alt =
          eventConfig.title;
      }

      /* ==========================
        PRICING
      ========================== */

      if (els.ticketPriceEl) {
        els.ticketPriceEl.textContent =
          state.ticketPrice;
      }

      if (els.ticketPriceCardEl) {
        els.ticketPriceCardEl.textContent =
          state.ticketPrice;
      }

      if (els.availableSeatsEl) {
        els.availableSeatsEl.textContent =
          event.availableSeats;
      }

      if (els.maxAvailableSeatsEl) {
        els.maxAvailableSeatsEl.textContent =
          event.availableSeats;
      }

      if (els.availableSeatCountEl) {
        els.availableSeatCountEl.textContent =
          `${event.availableSeats} / ${event.capacity}`;
      }

      renderSeatStepper();
      renderAvailabilityWarning();
      updateSummary();
      refreshSubmitState();

    }

    catch (err) {
      if (err.status === 404) {
        if (els.eventNameEl) {
          els.eventNameEl.textContent = "No Upcoming Event";
        }

        if (els.eventDescriptionEl) {
          els.eventDescriptionEl.textContent =
            "There is currently no scheduled audience event.";
        }

        if (els.eventLocationEl) {
          els.eventLocationEl.textContent = "-";
        }

        if (els.eventDateEl) {
          els.eventDateEl.textContent = "-";
        }

        if (els.eventTimeEl) {
          els.eventTimeEl.textContent = "-";
        }

        if (els.ticketPriceEl) {
          els.ticketPriceEl.textContent = "--";
        }

        if (els.ticketPriceCardEl) {
          els.ticketPriceCardEl.textContent = "--";
        }

        if (els.availableSeatsEl) {
          els.availableSeatsEl.textContent = "0";
        }

        if (els.availableSeatCountEl) {
          els.availableSeatCountEl.textContent = "0 / 0";
        }

        if (els.continuePaymentBtn) {
          els.continuePaymentBtn.disabled = true;
          els.continuePaymentBtn.textContent = "No Upcoming Event";
          els.continuePaymentBtn.classList.add("disabled");
        }

        return;
      }

      console.error("Load Audience Event Error:", err);

      showToast(
        err.message || "Unable to load event.",
        "error"
      );

      if (els.continuePaymentBtn) {
        els.continuePaymentBtn.disabled = true;
      }
    }

    finally {
      setLoading(false);
    }
  }

  /* =====================================================
     BOOKING WORKFLOW
  ===================================================== */
  els.form?.addEventListener("submit", (e) => {
    e.preventDefault();

    if (!validateAllFields()) {
      showToast("Please fix the highlighted fields", "error");
      return;
    }

    if (!els.acceptTerms.checked) {
      showToast("Please accept the Terms & Conditions", "error");
      return;
    }

    const totals = updateSummary();
    openModal(totals);
  });

  els.confirmBookingBtn?.addEventListener("click", async () => {
    if (state.submitting) return;
    state.submitting = true;
    refreshSubmitState();
    closeModal();
    setLoading(true, "Creating Your Booking...");

    try {
      const payload = buildBookingPayload();
      const result = await apiRequest("/create-pending",
        {
          method: "POST",
          body: payload
        }
      );

      console.log(result);
      const pending = result.pending;
      state.pendingId = pending.pendingId;

      window.location.href =
      `payment.html?type=audience&id=${encodeURIComponent(
        pending.pendingId
      )}`;

      return;
    } catch (err) {
      setLoading(false);
      state.submitting = false;
      refreshSubmitState();

      if (err.status === 409) {
        showToast(err.payload?.message || "You already have a booking for this event", "error");
      } else if (err.payload?.errors?.length) {
        showToast(err.payload.errors[0], "error");
      } else {
        showToast(err.message || "Could not create booking", "error");
      }
    }
  });


  

  /* =====================================================
     INIT
  ===================================================== */
  async function init() {
    renderStaticEventDetails();   // show event title/image/description instantly
    renderSeatStepper();
    await checkLoginStatus();
    await loadAudienceEvent();    // then enrich with live API data (price, seats…)
    if (!state.isLoggedIn && els.continuePaymentBtn) {
      els.continuePaymentBtn.disabled = true;
      els.continuePaymentBtn.textContent = "Login to Continue";
    }
  }

  init();
})();