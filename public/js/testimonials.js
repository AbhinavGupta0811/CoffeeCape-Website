const API_BASE = "/api/reviews";

let testimonialsEl;
let emptyState;
let form;
let reviewInput;
let filterButtons;
let selectedRating = 0;
let reviewsCache = [];

document.addEventListener("DOMContentLoaded", () => {
  testimonialsEl = document.getElementById("testimonials");
  emptyState = document.getElementById("emptyState");
  form = document.getElementById("reviewForm");
  reviewInput = document.getElementById("reviewInput");
  filterButtons = document.querySelectorAll(".filter button");

  initStars();
  initFilters();
  initLikes();
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
    <span>${message}</span>
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
  const data = await safeFetch(API_BASE);
  if (!data) return;
  reviewsCache = data;
  renderReviews(reviewsCache);
}

/* ===================== RENDER ===================== */
function renderReviews(reviews) {
  testimonialsEl.innerHTML = "";
  emptyState.style.display = reviews.length ? "none" : "block";

  reviews.forEach(r => testimonialsEl.appendChild(createCard(r)));
}

/* ===================== CARD ===================== */
function createCard(r) {
  const el = document.createElement("article");
  el.className = "review";
  el.dataset.id = r.id;

  let avatar = r.avatar || "assets/user-default.png";

  if (
    avatar &&
    !avatar.startsWith("/") &&
    !avatar.startsWith("assets/")
  ){
    avatar = "/" + avatar;
  }

  el.innerHTML = `
    <div class="review-header">
      <img src="${avatar}" alt="avatar">
      <div>
        <h3>${escapeHTML(r.name)} ${r.verified ? "✔" : ""}</h3>
        <span>${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</span>
        <small>${new Date(r.created_at).toDateString()}</small>
      </div>
    </div>
    <p>${escapeHTML(r.comment)}</p>
    <button class="like-btn">
      👍 <span>${r.likes}</span>
    </button>
  `;

  return el;
}

/* ===================== SUBMIT ===================== */
async function submitReview(e) {
  e.preventDefault();

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
          "Content-Type":
          "application/json"
        },

        body: JSON.stringify({
          rating:
          selectedRating,
          comment:
          reviewInput
          .value
          .trim()
        })
      }
    );

  if (!review) {

    submitBtn.disabled =
      false;

    submitBtn.innerHTML =
      originalText;

    return;
  }

  submitBtn.innerHTML = `
    <i class="fa-solid fa-circle-check"></i>
    Submitted
  `;

  reviewsCache.unshift(
    review
  );

  renderReviews(
    reviewsCache
  );

  form.reset();

  selectedRating = 0;

  document.querySelectorAll(".star-input span").forEach(
    star =>
      star.classList.remove(
        "active"
      )
  );

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
  document.querySelectorAll(".star-input span").forEach(s => {
    s.onclick = () => {
      selectedRating = Number(s.dataset.value);
      document.querySelectorAll(".star-input span")
        .forEach(x => x.classList.toggle("active", x.dataset.value <= selectedRating));
    };
  });
}

/* ===================== FILTER ===================== */
function initFilters() {
  filterButtons.forEach(btn => {
    btn.onclick = () => {
      const v = btn.dataset.filter;
      renderReviews(v === "all" ? reviewsCache : reviewsCache.filter(r => r.rating == v));
    };
  });
}

/* ===================== LIKES ===================== */
function initLikes() {
  document.addEventListener("click", async e => {
    const btn = e.target.closest(".like-btn");
    if (!btn) return;

    const card = btn.closest(".review");
    const count = btn.querySelector("span");

    if (!card.dataset.id) return;

    const res = await safeFetch(`${API_BASE}/${card.dataset.id}/like`, {
      method: "PATCH"
    });

    if (res) {
      count.textContent = Number(count.textContent) + 1;
      showToast("Thanks for liking!", "success");
    }
  });
}

/* ===================== HELPERS ===================== */
function escapeHTML(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}