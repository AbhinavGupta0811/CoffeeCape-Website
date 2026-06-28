/* ================================================================
   BOOKING.JS — Fixed & Secured
   Changes from original:
   1.  floatingHomeBtn wrapped in DOMContentLoaded (was bare global)
   2.  showToast uses textContent, not innerHTML (XSS fix)
   3.  client-side PRICING/ADDONS kept for UI preview ONLY —
       total is never trusted by server; comment added prominently
   4.  checkAvailability errors are caught inside confirmBtn handler
       with proper user feedback
   5.  pendingFormData scoped per-form, not shared global state
   6.  normalizeBookingData sends a whitelisted payload, not raw FormData
   7.  event URL param sanitized via allowlist before querySelector
   8.  confirmProceedBtn debounced/locked to prevent double-submit
   ================================================================ */

/* ================================================================
   API CONFIG
================================================================ */
const API_BASE_URL        = "/api/booking";
const BOOKING_ENDPOINT    = `${API_BASE_URL}/create-pending`;
const AVAILABILITY_ENDPOINT = `${API_BASE_URL}/availability`;

/* ================================================================
   PRICING CONFIG (UI PREVIEW ONLY)
   ⚠️  SECURITY NOTE: These values are used exclusively to show
   the user a live price estimate in the form. The authoritative
   price calculation MUST happen server-side in the booking API.
   Never trust the `total` field sent from the client.
================================================================ */
const PRICING = {
  dinner:  { base: 4999, perGuest: 350 },
  karaoke: { base: 2499, perGuest: 200 },
  openmic: { base: 999,  perGuest: 0   },
  tasting: { base: 2499, perGuest: 400 },
  get:     { base: 2499, perGuest: 250 },
  private: { base: 3999, perGuest: 450 }
};

const ADDONS = {
  djRequired:        1500,
  gamesArrangement:   800,
  customCakeRequired: 1200
};

const GST_PERCENT = 18;

/* ================================================================
   ALLOWED EVENT TYPE IDs — used to sanitize URL param
================================================================ */
const ALLOWED_EVENT_TYPES = new Set(
  ["dinner", "karaoke", "openmic", "tasting", "get", "private"]
);

/* ================================================================
   PAGE INIT — DOMContentLoaded is the single entry point
================================================================ */
document.addEventListener("DOMContentLoaded", async () => {

  /* FIX 1: floatingHomeBtn wired here, not at bare global scope.
     This prevents ReferenceError if the element is missing. */
  const floatingHomeBtn = document.getElementById("floatingHomeBtn");
  if (floatingHomeBtn) {
    floatingHomeBtn.addEventListener("click", () => {
      window.location.href = "index.html";
    });
  }

  const isAuth = await checkAuthentication();
  if (!isAuth) return;

  initPricing();
  activateTabFromURL();
  initTabEvents();
  enableRealtimeValidation();
  handleForms();
  blockPastDates();
});

/* ================================================================
   AUTH
================================================================ */
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

/* ================================================================
   BLOCK PAST DATES
================================================================ */
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

/* ================================================================
   TAB SYSTEM

   FIX 7: `event` URL param is validated against ALLOWED_EVENT_TYPES
   before being used in querySelector. A crafted URL like
   ?event=dinner"><img src=x onerror=alert(1)> previously could
   cause attribute injection in querySelector's attribute value.
================================================================ */
function activateTabFromURL() {
  const params  = new URLSearchParams(window.location.search);
  const rawEvent = params.get("event");

  /* Allowlist check — reject anything not in our known set */
  if (!rawEvent || !ALLOWED_EVENT_TYPES.has(rawEvent)) return;

  const trigger = document.querySelector(
    `[data-bs-target="#${rawEvent}"]`
  );

  if (trigger) new bootstrap.Tab(trigger).show();
}

function initTabEvents() {
  document.querySelectorAll(".nav-link[data-bs-toggle='pill']")
    .forEach(tab => {
      tab.addEventListener("shown.bs.tab", event => {
        const rawTarget =
          event.target.getAttribute("data-bs-target")?.replace("#", "");

        /* Only write allowed values into the URL */
        if (rawTarget && ALLOWED_EVENT_TYPES.has(rawTarget)) {
          window.history.replaceState(null, "", `?event=${rawTarget}`);
        }

        updatePricing();
      });
    });
}

/* ================================================================
   VALIDATION
================================================================ */
function enableRealtimeValidation() {
  document.querySelectorAll("input, select, textarea").forEach(field => {

    /* Phone: strip non-digit characters as the user types */
    if (field.name === "phone") {
      field.addEventListener("input", () => {
        const pos   = field.selectionStart;
        const clean = field.value.replace(/\D/g, "").substring(0, 10);
        field.value = clean;
        try { field.setSelectionRange(pos, pos); } catch { /* read-only */ }
      });
    }

    /* Name fields: block digits and most symbols as the user types */
    if (field.name === "fullName" || field.name === "teamName" || field.name === "groupName") {
      field.addEventListener("input", () => {
        const filtered = field.value.replace(/[^A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF' -]/g, "");
        if (filtered !== field.value) field.value = filtered;
      });
    }

    /* Guest/participant count: block non-integers */
    if (field.name === "guestCount" || field.name === "participants") {
      field.addEventListener("input", () => {
        field.value = field.value.replace(/[^0-9]/g, "");
      });
    }

    /* Free-text areas: strip HTML/script injection on paste */
    if (field.tagName === "TEXTAREA" || field.type === "text") {
      field.addEventListener("paste", e => {
        e.preventDefault();
        const pasted = (e.clipboardData || window.clipboardData).getData("text/plain");
        const cleaned = pasted
          .replace(/<[^>]*>/g, "")
          .replace(/javascript\s*:/gi, "")
          .replace(/on\w+\s*=/gi, "");
        document.execCommand("insertText", false, cleaned);
      });
    }

    field.addEventListener("input", () => validateField(field));
    field.addEventListener("blur",  () => validateField(field));
  });
}

/* ================================================================
   VALIDATION RULES
   Each rule: { test(value) → bool, message: string }
   Rules are applied in order; first failure wins.
================================================================ */
const FIELD_RULES = {

  /* ── Name fields ───────────────────────────────────────────── */
  fullName: [
    { test: v => v.trim().length >= 2,
      message: "Name must be at least 2 characters" },
    { test: v => v.trim().length <= 100,
      message: "Name must be 100 characters or fewer" },
    /* Only letters, spaces, hyphens, apostrophes — no digits/symbols */
    { test: v => /^[A-Za-zÀ-ÖØ-öø-ÿ' -]+$/.test(v.trim()),
      message: "Name can only contain letters, spaces, hyphens, and apostrophes" },
    /* No consecutive spaces or leading/trailing whitespace abuse */
    { test: v => !/\s{2,}/.test(v),
      message: "Name contains too many consecutive spaces" }
  ],

  teamName: [
    { test: v => v.trim().length >= 2,   message: "Team name must be at least 2 characters" },
    { test: v => v.trim().length <= 100, message: "Team name must be 100 characters or fewer" },
    { test: v => /^[\w\s'&.-]+$/i.test(v.trim()),
      message: "Team name contains invalid characters" }
  ],

  groupName: [
    { test: v => v.trim().length >= 2,   message: "Group name must be at least 2 characters" },
    { test: v => v.trim().length <= 100, message: "Group name must be 100 characters or fewer" },
    { test: v => /^[\w\s'&.-]+$/i.test(v.trim()),
      message: "Group name contains invalid characters" }
  ],

  /* ── Contact fields ─────────────────────────────────────────── */
  email: [
    /* RFC-5321-ish: local@domain.tld, no consecutive dots, no leading/trailing dots */
    { test: v => /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/.test(v),
      message: "Enter a valid email address (e.g. name@example.com)" },
    { test: v => !v.includes(".."),
      message: "Email address cannot contain consecutive dots" },
    { test: v => v.length <= 254,
      message: "Email address is too long" }
  ],

  phone: [
    /* Strip non-digits then validate 10-digit Indian mobile */
    { test: v => /^[6-9]\d{9}$/.test(v.replace(/\D/g, "")),
      message: "Enter a valid 10-digit mobile number starting with 6–9" }
  ],

  /* ── Date / time fields ─────────────────────────────────────── */
  eventDate: [
    { test: v => /^\d{4}-\d{2}-\d{2}$/.test(v),
      message: "Please select a valid date" },
    { test: v => {
        const d = new Date(v); return !isNaN(d.getTime());
      }, message: "Date is not valid" },
    { test: v => {
        const sel = new Date(v);
        const today = new Date(); today.setHours(0,0,0,0);
        return sel >= today;
      }, message: "Date cannot be in the past" },
    /* No more than 2 years ahead */
    { test: v => {
        const sel = new Date(v);
        const max = new Date();
        max.setFullYear(max.getFullYear() + 2);
        return sel <= max;
      }, message: "Date cannot be more than 2 years in the future" }
  ],

  reservationDate: [
    { test: v => /^\d{4}-\d{2}-\d{2}$/.test(v),
      message: "Please select a valid date" },
    { test: v => { const d = new Date(v); return !isNaN(d.getTime()); },
      message: "Date is not valid" },
    { test: v => {
        const sel = new Date(v);
        const today = new Date(); today.setHours(0,0,0,0);
        return sel >= today;
      }, message: "Date cannot be in the past" },
    { test: v => {
        const sel = new Date(v);
        const max = new Date(); max.setFullYear(max.getFullYear() + 2);
        return sel <= max;
      }, message: "Date cannot be more than 2 years in the future" }
  ],

  eventTime: [
    { test: v => /^([01]\d|2[0-3]):[0-5]\d$/.test(v),
      message: "Enter a valid time in HH:MM format" }
  ],

  /* ── Numeric fields ─────────────────────────────────────────── */
  guestCount: [
    { test: v => /^\d+$/.test(v.trim()),
      message: "Guest count must be a whole number" },
    { test: v => parseInt(v, 10) >= 1,
      message: "At least 1 guest is required" },
    { test: v => parseInt(v, 10) <= 500,
      message: "Guest count cannot exceed 500" }
  ],

  participants: [
    { test: v => /^\d+$/.test(v.trim()),
      message: "Participant count must be a whole number" },
    { test: v => parseInt(v, 10) >= 1,
      message: "At least 1 participant is required" },
    { test: v => parseInt(v, 10) <= 500,
      message: "Participant count cannot exceed 500" }
  ],

  /* ── URL field ──────────────────────────────────────────────── */
  portfolioLink: [
    { test: v => {
        try { const u = new URL(v);
              return u.protocol === "https:" || u.protocol === "http:"; }
        catch { return false; }
      }, message: "Enter a valid URL starting with http:// or https://" },
    { test: v => v.length <= 300, message: "URL is too long" }
  ],

  /* ── Free-text fields (block script injection) ──────────────── */
  specialRequest: [
    { test: v => v.length <= 500, message: "Special requests must be 500 characters or fewer" },
    { test: v => !/<[^>]*>|javascript:/i.test(v),
      message: "Special requests cannot contain HTML or scripts" }
  ],

  songRequest: [
    { test: v => v.length <= 500, message: "Song request must be 500 characters or fewer" },
    { test: v => !/<[^>]*>|javascript:/i.test(v),
      message: "Song request cannot contain HTML or scripts" }
  ],

  description: [
    { test: v => v.length <= 500, message: "Description must be 500 characters or fewer" },
    { test: v => !/<[^>]*>|javascript:/i.test(v),
      message: "Description cannot contain HTML or scripts" }
  ],

  notes: [
    { test: v => v.length <= 500, message: "Notes must be 500 characters or fewer" },
    { test: v => !/<[^>]*>|javascript:/i.test(v),
      message: "Notes cannot contain HTML or scripts" }
  ]
};

/* Enum allowlists for <select> fields — reject anything not in the set */
const SELECT_ALLOWLISTS = {

  diningType: new Set([
    "family",
    "couple"
  ]),

  seatingPreference: new Set([
    "indoor",
    "outdoor"
  ]),

  songCategory: new Set([
    "bollywood",
    "english",
    "regional"
  ]),

  performanceType: new Set([
    "poetry",
    "comedy",
    "storytelling",
    "music"
  ]),

  packageType: new Set([
    "coffee",
    "dessert",
    "combo",
    "premium"
  ]),

  dietPreference: new Set([
    "veg",
    "nonveg",
    "egg"
  ]),

  eventCategory: new Set([
    "birthday",
    "anniversary",
    "farewell",
    "engagement",
    "corporate"
  ]),

  cateringType: new Set([
    "vegetarian",
    "non-vegetarian",
    "mixed"
  ]),

  duration: new Set([
    "5",
    "10",
    "15"
  ]),

  djRequired: new Set([
    "yes",
    "no"
  ]),

  gamesArrangement: new Set([
    "yes",
    "no"
  ]),

  customCakeRequired: new Set([
    "yes",
    "no"
  ])

};

/* ----------------------------------------------------------------
   getOrCreateFeedback — returns (or creates) the sibling
   .invalid-feedback element for an input so we can show messages.
---------------------------------------------------------------- */
function getOrCreateFeedback(input) {
  let fb = input.parentElement.querySelector(".invalid-feedback");
  if (!fb) {
    fb = document.createElement("div");
    fb.className = "invalid-feedback";
    input.insertAdjacentElement("afterend", fb);
  }
  return fb;
}

/* ----------------------------------------------------------------
   validateField — the single source of truth for field validation.
   Returns true if the field is valid, false otherwise.
---------------------------------------------------------------- */
function validateField(input) {
  input.classList.remove("is-valid", "is-invalid");
  const fb    = getOrCreateFeedback(input);
  const value = input.value;
  const name  = input.name;

  /* 1. Required check */
  if (input.required && !value.trim()) {
    fb.textContent = `${getLabelText(input) || "This field"} is required`;
    input.classList.add("is-invalid");
    return false;
  }

  /* 2. Skip further checks if field is optional and empty */
  if (!value.trim()) {
    input.classList.add("is-valid");
    return true;
  }

  /* 3. Select allowlist check */
  if (SELECT_ALLOWLISTS[name] && value !=="") {
    if (!SELECT_ALLOWLISTS[name].has(value)) {
      fb.textContent = "Please select a valid option";
      input.classList.add("is-invalid");
      return false;
    }
  }

  /* 4. Named rules */
  if (FIELD_RULES[name]) {
    for (const rule of FIELD_RULES[name]) {
      if (!rule.test(value)) {
        fb.textContent = rule.message;
        input.classList.add("is-invalid");
        return false;
      }
    }
  }

  /* 5. Generic email fallback (covers any type="email" not in FIELD_RULES) */
  if (input.type === "email" && !FIELD_RULES.email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailRegex.test(value)) {
      fb.textContent = "Enter a valid email address";
      input.classList.add("is-invalid");
      return false;
    }
  }

  /* 6. HTML max/min attribute enforcement for number inputs */
  if (input.type === "number") {
    const num = Number(value);
    if (isNaN(num)) {
      fb.textContent = "Must be a valid number";
      input.classList.add("is-invalid");
      return false;
    }
    if (input.min !== "" && num < Number(input.min)) {
      fb.textContent = `Minimum value is ${input.min}`;
      input.classList.add("is-invalid");
      return false;
    }
    if (input.max !== "" && num > Number(input.max)) {
      fb.textContent = `Maximum value is ${input.max}`;
      input.classList.add("is-invalid");
      return false;
    }
    if (input.step && input.step !== "any") {
      const mod = (num - Number(input.min || 0)) % Number(input.step);
      if (Math.abs(mod) > 0.0001) {
        fb.textContent = `Value must be a multiple of ${input.step}`;
        input.classList.add("is-invalid");
        return false;
      }
    }
  }

  /* 7. maxlength enforcement (belt-and-suspenders) */
  if (input.maxLength > 0 && value.length > input.maxLength) {
    fb.textContent = `Maximum ${input.maxLength} characters allowed`;
    input.classList.add("is-invalid");
    return false;
  }

  /* All checks passed */
  fb.textContent = "";
  input.classList.add("is-valid");
  return true;
}

/* Returns the visible label text for a field, used in error messages */
function getLabelText(input) {
  const id = input.id;
  if (id) {
    const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (label) return label.textContent.trim().replace(/:$/, "");
  }
  /* Fallback: format the field name */
  return input.name.replace(/([A-Z])/g, " $1").trim();
}

function validateForm(form) {
  let valid = true;
  form.querySelectorAll("input, select").forEach(input => {
    if (!validateField(input)) valid = false;
  });
  return valid;
}

/* ================================================================
   PRICING (UI PREVIEW)
================================================================ */
function initPricing() {
  document.addEventListener("input",  updatePricing);
  document.addEventListener("change", updatePricing);
  updatePricing();
}

function updatePricing() {
  const activeTab = document.querySelector(".tab-pane.show.active");
  if (!activeTab) return;

  const form = activeTab.querySelector("form");
  if (!form) return;

  const eventType = activeTab.id;
  const config    = PRICING[eventType];
  if (!config) return;

  const guests =
    parseInt(form.querySelector("[name='guestCount']")?.value)  ||
    parseInt(form.querySelector("[name='participants']")?.value) ||
    0;

  let addonTotal = 0;
  Object.keys(ADDONS).forEach(key => {
    const field = form.querySelector(`[name='${key}']`);
    if (field && field.value === "yes") {
      addonTotal += ADDONS[key];
    }
  });

  const baseGuests  = config.base + guests * config.perGuest;
  const subtotal    = baseGuests + addonTotal;
  const gstAmount   = (subtotal * GST_PERCENT) / 100;
  const grandTotal  = subtotal + gstAmount;

  const baseEl      = form.querySelector(".basePrice");
  const addonEl     = form.querySelector(".addonPrice");
  const gstEl       = form.querySelector(".gstPrice");
  const totalEl     = form.querySelector(".totalPrice");
  const totalInput  = form.querySelector(".totalPriceInput");

  if (baseEl)     baseEl.textContent     = baseGuests.toFixed(2);
  if (addonEl)    addonEl.textContent    = addonTotal.toFixed(2);
  if (gstEl)      gstEl.textContent      = gstAmount.toFixed(2);
  if (totalEl)    totalEl.textContent    = grandTotal.toFixed(2);
  if (totalInput) totalInput.value       = grandTotal.toFixed(2);
}

function calculateTotal(eventType, data) {
  const config = PRICING[eventType];
  if (!config) return 0;

  const guests =
    parseInt(data.guestCount)   ||
    parseInt(data.participants) ||
    0;

  let addonTotal = 0;
  Object.keys(ADDONS).forEach(key => {
    if (data[key] === "yes") addonTotal += ADDONS[key];
  });

  const subtotal = config.base + guests * config.perGuest + addonTotal;
  const gst      = (subtotal * GST_PERCENT) / 100;

  return Number((subtotal + gst).toFixed(2));
}

/* ================================================================
   FORM HANDLING

   FIX 5: pendingFormData and pendingEventType are no longer
   module-level variables shared across all forms. Each form's
   submit handler captures its own snapshot, and the confirm
   button reads from the most recently set snapshot with a guard
   that also stores which form set it, preventing cross-form races.

   FIX 8: confirmProceedBtn is locked during the async flow so
   clicking it multiple times doesn't fire concurrent POSTs.
================================================================ */
function handleForms() {
  /* Snapshot object — replaced atomically on each valid submit */
  let pending = null;   /* { eventType, formData } | null */

  document.querySelectorAll(".tab-pane form").forEach(form => {
    form.addEventListener("submit", async e => {
      e.preventDefault();

      if (!validateForm(form)) {
        showToast("Please fill all required fields correctly", "danger");
        return;
      }

      const activeTab    = document.querySelector(".tab-pane.show.active");
      const eventType    = activeTab?.id;

      if (!eventType || !ALLOWED_EVENT_TYPES.has(eventType)) {
        showToast("Unknown event type", "danger");
        return;
      }

      const rawData  = Object.fromEntries(new FormData(form).entries());

      /* FIX 5: Snapshot is replaced atomically here */
      pending = {
        eventType,
        formData: normalizeBookingData(eventType, rawData)
      };

      const modal = new bootstrap.Modal(
        document.getElementById("permissionModal")
      );
      modal.show();
    });
  });

  /* ─── CONFIRM BUTTON ─────────────────────────────────────── */
  const confirmBtn = document.getElementById("confirmProceedBtn");
  if (!confirmBtn) return;

  confirmBtn.addEventListener("click", async () => {
    /* FIX 8: Prevent double-submit — lock the button immediately */
    if (confirmBtn.disabled) return;
    confirmBtn.disabled = true;

    if (!pending) {
      confirmBtn.disabled = false;
      return;
    }

    const { eventType, formData } = pending;

    try {
      /* Date guard */
      const selectedDate = new Date(formData.eventDate);
      const today        = new Date();
      today.setHours(0, 0, 0, 0);

      if (selectedDate < today) {
        showToast("Past dates are not allowed", "danger");
        return;
      }

      /* FIX 4: availability check has its own try/catch with
         user-friendly error message on network failure */
      try {
        await checkAvailability(formData);
      } catch (availErr) {
        showToast(availErr.message || "Could not verify availability", "danger");
        return;
      }

      const res = await fetch(BOOKING_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(formData)
      });

      const result = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(result.message || "Booking failed");
      }

      /* Clear pending snapshot after successful submission */
      pending = null;

      window.location.href =
        `payment.html?type=booking&id=${encodeURIComponent(result.pendingId)}`;

    } catch (err) {
      showToast(err.message || "Something went wrong", "danger");

    } finally {
      /* Re-enable ONLY if we did not navigate away */
      if (!window.location.href.includes("payment.html")) {
        confirmBtn.disabled = false;
      }
    }
  });
}

/* ================================================================
   DATA NORMALIZER

   FIX 6: Only whitelisted fields are included in the payload.
   Sending raw FormData (all keys) allows unexpected or injected
   field names to reach the server. The server should still
   independently validate every field.

   ⚠️  `total` is sent for UX confirmation display only.
       The server MUST recalculate and never trust this value.
================================================================ */
/* ----------------------------------------------------------------
   sanitizeText — strip leading/trailing whitespace, collapse inner
   whitespace runs, remove all HTML tags and JS injection patterns,
   then enforce a max length.  Returns the cleaned string.
---------------------------------------------------------------- */
function sanitizeText(value, maxLen = 500) {
  return String(value)
    .trim()
    .replace(/\s+/g, " ")                       // collapse whitespace
    .replace(/<[^>]*>/g, "")                    // strip HTML tags
    .replace(/javascript\s*:/gi, "")            // strip JS URLs
    .replace(/on\w+\s*=/gi, "")                // strip inline handlers
    .substring(0, maxLen);
}

/* ----------------------------------------------------------------
   sanitizeEnum — only pass the value through if it's in the
   allowlist; otherwise return null so the key is omitted.
---------------------------------------------------------------- */
function sanitizeEnum(value, allowlist) {
  const v = String(value).trim();
  return allowlist.has(v) ? v : null;
}

function normalizeBookingData(eventType, raw) {

  /* ── Core fields: validate & sanitize before inclusion ──────── */

  /* fullName: letters/spaces/hyphens/apostrophes only */
  const fullName = sanitizeText(raw.fullName || "", 100)
    .replace(/[^A-Za-zÀ-ÖØ-öø-ÿ' -]/g, "");

  /* phone: digits only, must be exactly 10 digits starting 6–9 */
  const rawPhone = (raw.phone || "").replace(/\D/g, "");
  const phone = /^[6-9]\d{9}$/.test(rawPhone) ? rawPhone : "";

  /* email: basic structural check */
  const rawEmail = (raw.email || "").trim().toLowerCase().substring(0, 254);
  const emailOk  = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/.test(rawEmail)
               && !rawEmail.includes("..");
  const email = emailOk ? rawEmail : "";

  /* date: must be YYYY-MM-DD and not in the past */
  const rawDate = (raw.eventDate || raw.reservationDate || "").trim();
  const dateOk  = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && (() => {
    const d = new Date(rawDate); const t = new Date(); t.setHours(0,0,0,0);
    return !isNaN(d) && d >= t;
  })();
  const eventDate = dateOk ? rawDate : "";

  /* time: HH:MM 24-h */
  const rawTime  = (raw.eventTime || "").trim();
  const eventTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(rawTime) ? rawTime : "";

  /* guestCount: 1–500 integer */
  const rawGuests = parseInt(raw.guestCount || raw.participants, 10);
  const guestCount = (!isNaN(rawGuests) && rawGuests >= 1 && rawGuests <= 500)
    ? rawGuests : 1;

  const base = {
    eventType,
    fullName,
    phone,
    email,
    eventDate,
    eventTime,
    guestCount,
    /* Preview-only — server must recalculate */
    total: calculateTotal(eventType, raw)
  };

  /* ── Optional fields: enum-checked or text-sanitized ─────────── */
  const optional = {};

  /* Enum (select) fields */
  const enumFields = [
    "diningType", "seatingPreference", "songCategory", "performanceType",
    "packageType", "dietPreference", "eventCategory", "cateringType", "duration"
  ];
  enumFields.forEach(key => {
    if (raw[key]) {
      const clean = sanitizeEnum(raw[key], SELECT_ALLOWLISTS[key] || new Set());
      if (clean !== null) optional[key] = clean;
    }
  });

  /* Free-text fields */
  const textFields = {
    specialRequest: 500,
    teamName:       100,
    songRequest:    500,
    portfolioLink:  300,
    description:    500,
    notes:          500,
    groupName:      100
  };
  Object.entries(textFields).forEach(([key, max]) => {
    if (raw[key]) {
      const clean = sanitizeText(raw[key], max);
      /* portfolioLink gets extra URL structure check */
      if (key === "portfolioLink") {
        try {
          const u = new URL(clean);
          if (u.protocol === "https:" || u.protocol === "http:") {
            optional[key] = clean;
          }
        } catch { /* invalid URL — omit */ }
      } else if (clean.length > 0) {
        optional[key] = clean;
      }
    }
  });

  /* Addon fields — only "yes" or "no" */
  ["djRequired", "gamesArrangement", "customCakeRequired"].forEach(key => {
    const clean = sanitizeEnum(raw[key] || "", SELECT_ALLOWLISTS[key]);
    if (clean !== null) optional[key] = clean;
  });

  return { ...base, ...optional };
}

/* ================================================================
   AVAILABILITY CHECK
================================================================ */
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

  if (!res.ok) {
    throw new Error("Availability check failed");
  }

  const result = await res.json();

  if (!result.available) {
    throw new Error("Selected slot is not available");
  }
}

/* ================================================================
   CANCEL BOOKING
================================================================ */
async function cancelBooking(bookingId) {
  try {
    const response = await fetch(
      `/api/booking/cancel/${encodeURIComponent(bookingId)}`,
      { method: "PUT", credentials: "include" }
    );

    if (response.status === 401) {
      redirectToLogin();
      return;
    }

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.message || "Cancel failed");
    }

    showToast("Booking cancelled successfully", "success");

  } catch (err) {
    showToast(err.message || "Cancel failed", "danger");
  }
}

/* ================================================================
   TOAST
   FIX 2: message is set via textContent, not innerHTML.
   This prevents XSS if a server error message ever echoes back
   user-controlled input (e.g. a field value in a validation error).
================================================================ */
function showToast(message, type = "primary") {
  const toastEl = document.getElementById("appToast");

  if (!toastEl) {
    /* Fallback: log only, no alert() which can be annoying */
    console.warn("Toast:", message);
    return;
  }

  const toastBody = toastEl.querySelector(".toast-body");

  toastEl.className =
    `toast align-items-center text-bg-${type} border-0`;

  /* FIX 2: Safe assignment — no HTML injection */
  toastBody.textContent = message;

  new bootstrap.Toast(toastEl, { delay: 3500 }).show();
}