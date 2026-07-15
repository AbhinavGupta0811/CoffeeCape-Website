const API_BASE = "/api/reviews";
const LIKED_STORAGE_KEY = "cc_liked_reviews";

let testimonialsEl;
let emptyState;
let form;
let nameInput;
let reviewInput;
let charCountEl;
let starInput;
let filterButtons;
let sortSelect;
let searchInput;
let ticketPreviewEl;

let selectedRating = 0;
let reviewsCache = [];
let likedIds = loadLikedIds();

let currentFilter = "all";
let currentSort = "newest";
let currentSearch = "";

document.addEventListener("DOMContentLoaded", () => {
  testimonialsEl = document.getElementById("testimonials");
  emptyState = document.getElementById("emptyState");
  form = document.getElementById("reviewForm");
  nameInput = document.getElementById("nameInput");
  reviewInput = document.getElementById("reviewInput");
  charCountEl = document.getElementById("charCount");
  starInput = document.getElementById("starInput");
  filterButtons = document.querySelectorAll("#filterGroup button");
  sortSelect = document.getElementById("sortSelect");
  searchInput = document.getElementById("searchInput");
  ticketPreviewEl = document.getElementById("ticketPreview");

  initStars();
  initFilters();
  initSort();
  initSearch();
  initLikes();
  initCharCounter();
  updateTicketPreview();
  loadReviews();

  form.addEventListener("submit", submitReview);
});

/*==========Toast Notification=========== */
function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");

  const icons = {
    success: "fa-circle-check",
    error: "fa-circle-xmark",
    warning: "fa-triangle-exclamation",
    info: "fa-circle-info"
  };

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <i class="fa-solid ${icons[type]}"></i>
    <span>${escapeHTML(message)}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(100%)";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/* ============== SAFE FETCH WRAPPER ============ */
async function safeFetch(url, options = {}) {
  try {
    const res = await fetch(url, {
      credentials: "include",
      ...options
    });

    let data = {};
    try {
      data = await res.json();
    } catch {}

    /* AUTH REQUIRED */
    if (res.status === 401) {
      showToast("Please login to submit a review.", "warning");
      setTimeout(() => {
        window.location.href = "Auth.html";
      }, 1500);
      return null;
    }

    if (res.status === 403) {
      showToast(data.message || "Access denied", "error");
      return null;
    }

    if (res.status === 409) {
      showToast("You have already submitted a review.", "warning");
      return null;
    }

    if (!res.ok) {
      showToast(data.message || "Request failed", "error");
      return null;
    }

    return data;

  } catch (err) {
    console.error("API error:", err);

    if (!navigator.onLine) {
      window.location.href = "error.html?type=network";
      return null;
    }

    showToast(
      "Server error. Please try again later.",
      "error"
    );
    return null;
  }
}

/* ===================== LOAD ===================== */
async function loadReviews() {
  renderSkeletons(4);

  const data = await safeFetch(API_BASE);

  if (!data) {
    testimonialsEl.innerHTML = "";
    return;
  }

  reviewsCache = Array.isArray(data) ? data : [];
  renderBreakdown(reviewsCache);
  applyView();
}

/* ===================== SKELETONS ===================== */
function renderSkeletons(count) {
  testimonialsEl.innerHTML = "";
  emptyState.hidden = true;

  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    el.className = "ticket-skeleton";
    testimonialsEl.appendChild(el);
  }
}

/* ===================== RATING BREAKDOWN ===================== */
function renderBreakdown(reviews) {
  const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };

  reviews.forEach(r => {
    const rating = Math.round(Number(r.rating)) || 0;
    if (counts[rating] !== undefined) counts[rating]++;
  });

  const total = reviews.length;

  document.querySelectorAll(".breakdown-row").forEach(row => {
    const star = row.dataset.star;
    const pct = total ? Math.round((counts[star] / total) * 100) : 0;

    row.querySelector(".cup-fill").style.setProperty("--fill", `${pct}%`);
    row.querySelector(".breakdown-pct").textContent = `${pct}%`;
  });

  if (total) {
    const avg = reviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) / total;
    const gauge = document.getElementById("ratingGauge");
    gauge.style.setProperty("--pct", Math.round((avg / 5) * 100));
    gauge.querySelector(".gauge-copy strong").textContent = avg.toFixed(1);
  }
}

/* ===================== VIEW (filter + search + sort) ===================== */
function applyView() {
  let list = [...reviewsCache];

  if (currentFilter !== "all") {
    list = list.filter(r => String(Math.round(Number(r.rating))) === currentFilter);
  }

  if (currentSearch) {
    const q = currentSearch.toLowerCase();
    list = list.filter(r =>
      (r.comment || "").toLowerCase().includes(q) ||
      (r.name || "").toLowerCase().includes(q)
    );
  }

  if (currentSort === "highest") {
    list.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0));
  } else if (currentSort === "liked") {
    list.sort((a, b) => (Number(b.likes) || 0) - (Number(a.likes) || 0));
  } else {
    list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  renderReviews(list);
}

/* ===================== RENDER ===================== */
function renderReviews(reviews) {
  testimonialsEl.innerHTML = "";
  emptyState.hidden = reviews.length > 0;

  reviews.forEach(r => testimonialsEl.appendChild(createTicket(r)));
}

/* ===================== TICKET NUMBER ===================== */
function ticketNumber(id) {
  if (id === undefined || id === null || id === "") return "No. ----";

  const asNumber = Number(id);
  if (Number.isFinite(asNumber)) {
    return `No. ${String(asNumber).padStart(4, "0")}`;
  }

  const tail = String(id).replace(/[^a-zA-Z0-9]/g, "").slice(-4).toUpperCase();
  return `No. ${tail.padStart(4, "0")}`;
}

/* ===================== TICKET CARD ===================== */
function createTicket(r, { preview = false } = {}) {
  const el = document.createElement("article");
  el.className = "ticket";
  if (r.id !== undefined) el.dataset.id = r.id;

  let avatar = r.avatar || "assets/user-default.png";

  if (
    avatar &&
    !avatar.startsWith("/") &&
    !avatar.startsWith("assets/") &&
    !avatar.startsWith("http")
  ) {
    avatar = "/" + avatar;
  }

  const rating = Math.max(0, Math.min(5, Math.round(Number(r.rating)) || 0));
  const dateLabel = r.created_at
    ? new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "Draft";

  const liked = !preview && likedIds.has(String(r.id));

  el.innerHTML = `
    <div class="ticket-perf"></div>
    <div class="ticket-head">
      <span class="ticket-no">${preview ? "No. ----" : ticketNumber(r.id)}</span>
      <span class="ticket-stamp">${"★".repeat(rating)}${rating || ""}</span>
    </div>
    <div class="ticket-body">
      <div class="ticket-person">
        <img src="${avatar}" alt="">
        <div>
          <h3>${escapeHTML(r.name || "Your name")} ${r.verified ? '<i class="fa-solid fa-circle-check verified" title="Verified customer"></i>' : ""}</h3>
          <small>${dateLabel}</small>
        </div>
      </div>
      <p class="ticket-quote">${escapeHTML(r.comment || "Your review will appear here as you type...")}</p>
    </div>
    ${preview ? "" : `
    <div class="ticket-foot">
      <button class="like-btn${liked ? " liked" : ""}" ${liked ? "disabled" : ""} aria-label="Like this review">
        <i class="fa-solid fa-mug-hot"></i> <span>${Number(r.likes) || 0}</span>
      </button>
    </div>`}
  `;

  return el;
}

/* ===================== LIVE PREVIEW ===================== */
function updateTicketPreview() {
  if (!ticketPreviewEl) return;

  const draft = {
    id: null,
    name: nameInput?.value.trim(),
    rating: selectedRating,
    comment: reviewInput?.value.trim(),
    verified: false,
    created_at: new Date().toISOString()
  };

  ticketPreviewEl.innerHTML = "";
  ticketPreviewEl.appendChild(createTicket(draft, { preview: true }));
}

/* ===================== SUBMIT ===================== */
async function submitReview(e) {
  e.preventDefault();

  const name = nameInput.value.trim();

  if (!name || name.length < 2) {
    showToast("Please enter your full name", "warning");
    return;
  }

  if (!selectedRating) {
    showToast(
      "Please select a rating",
      "warning"
    );
    return;
  }

  if (!reviewInput.value.trim()) {
    showToast(
      "Please enter your review",
      "warning"
    );
    return;
  }

  const submitBtn =
    form.querySelector(
      "button[type='submit']"
    );

  const originalText = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `
    <i class="fa-solid fa-spinner fa-spin"></i>
    Submitting...
  `;

  showToast(
    "☕ Sharing your CoffeeCape experience...",
    "info"
  );

  const review =
    await safeFetch(
      API_BASE,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name,
          rating: selectedRating,
          comment: reviewInput.value.trim()
        })
      }
    );

  if (!review) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;
    return;
  }

  submitBtn.innerHTML = `
    <i class="fa-solid fa-circle-check"></i>
    Submitted
  `;

  reviewsCache.unshift(review);
  renderBreakdown(reviewsCache);
  applyView();

  form.reset();
  selectedRating = 0;

  document.querySelectorAll(".star-input span").forEach(
    star => star.classList.remove("active")
  );

  updateCharCounter();
  updateTicketPreview();

  showToast(
    "❤️ Thank you! Your review has been submitted successfully.",
    "success"
  );

  setTimeout(() => {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;
  }, 1000);
}

/* ===================== STARS ===================== */
function initStars() {
  const stars = document.querySelectorAll(".star-input span");

  function setRating(value) {
    selectedRating = value;
    stars.forEach(x => x.classList.toggle("active", Number(x.dataset.value) <= selectedRating));
    updateTicketPreview();
  }

  stars.forEach(s => {
    s.addEventListener("click", () => setRating(Number(s.dataset.value)));
    s.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setRating(Number(s.dataset.value));
      }
    });
  });
}

/* ===================== FILTER ===================== */
function initFilters() {
  filterButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      filterButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentFilter = btn.dataset.filter;
      applyView();
    });
  });
}

/* ===================== SORT ===================== */
function initSort() {
  sortSelect?.addEventListener("change", () => {
    currentSort = sortSelect.value;
    applyView();
  });
}

/* ===================== SEARCH ===================== */
function initSearch() {
  let debounceTimer;
  searchInput?.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      currentSearch = searchInput.value.trim();
      applyView();
    }, 200);
  });
}

/* ===================== CHAR COUNTER ===================== */
function initCharCounter() {
  reviewInput?.addEventListener("input", () => {
    updateCharCounter();
    updateTicketPreview();
  });
  nameInput?.addEventListener("input", updateTicketPreview);
}

function updateCharCounter() {
  if (!charCountEl || !reviewInput) return;
  const len = reviewInput.value.length;
  charCountEl.textContent = len;
  charCountEl.parentElement.classList.toggle("near-limit", len >= 450);
}

/* ===================== LIKES ===================== */
function loadLikedIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem(LIKED_STORAGE_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function saveLikedIds() {
  try {
    localStorage.setItem(LIKED_STORAGE_KEY, JSON.stringify([...likedIds]));
  } catch {
    // localStorage unavailable (e.g. private mode) - likes just won't persist across reloads
  }
}

function initLikes() {
  document.addEventListener("click", async e => {
    const btn = e.target.closest(".like-btn");
    if (!btn || btn.disabled) return;

    const card = btn.closest(".ticket");
    const count = btn.querySelector("span");
    const id = card?.dataset.id;

    if (!id || likedIds.has(id)) return;

    btn.disabled = true;

    const res = await safeFetch(`${API_BASE}/${id}/like`, {
      method: "PATCH"
    });

    if (res) {
      count.textContent = Number(count.textContent) + 1;
      btn.classList.add("liked");
      likedIds.add(id);
      saveLikedIds();
      showToast("Thanks for liking!", "success");
    } else {
      btn.disabled = false;
    }
  });
}

/* ===================== HELPERS ===================== */
function escapeHTML(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}