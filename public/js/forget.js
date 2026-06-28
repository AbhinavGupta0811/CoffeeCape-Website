const form = document.getElementById("forgotForm");
const emailInput = document.getElementById("email");
const sendBtn = document.getElementById("sendBtn");
const toast = document.getElementById("toast");

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* ================= TOAST ================= */
function showToast(message, type = "info") {
  const icons = {
    success: "fa-solid fa-circle-check",
    error: "fa-solid fa-circle-xmark",
    warning: "fa-solid fa-triangle-exclamation",
    info: "fa-solid fa-circle-info",
    loading: "fa-solid fa-spinner fa-spin"
  };

  const icon = icons[type] || icons.info;

  toast.innerHTML = `
    <div class="toast-content">
      <i class="${icon}"></i>
      <span>${message}</span>
    </div>
  `;

  toast.className = `toast show ${type}`;

  clearTimeout(
    toast.hideTimer
  );

  toast.hideTimer =
    setTimeout(() => {
      toast.classList.remove(
        "show"
    );
  }, 3000);
}

form.addEventListener("submit", async e => {
  e.preventDefault();

  const email = emailInput.value.trim();

  if (!email) {
    return showToast("Email is required..", "warning");
  }

  if (!emailRegex.test(email)) {
    return showToast("Invalid email format..", "warning");
  }

  sendBtn.disabled = true;
  sendBtn.textContent = "Sending OTP...";

  try {
    const res = await fetch("/api/password/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include", // Important if using sessions
      body: JSON.stringify({ email })
    });

    let data = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }

    if (res.status === 401) {
      showToast(
        "Unauthorized request.",
        "error"
      );
      return;
    }

    if (res.status === 403) {
      showToast(
        "Access denied.",
        "error"
      );
      return;
    }

    if (res.status === 404) {
      showToast(
        "Email not registered.",
        "warning"
      );
      return;
    }

    if (res.status === 429) {
      showToast(
        "Too many attempts. Try again later.",
        "warning"
      );
      return;
    }

    if (res.status === 500) {
      window.location.href = "error.html?type=server";
      return;
    }

    if (!res.ok || !data.success) {
      showToast(
        data.message || "Failed to send OTP.",
        "error"
      );
      return;
    }

    sessionStorage.setItem("resetEmail", email);

    showToast(
      "OTP sent to your email.",
      "success"
    );

    setTimeout(() => {
      location.href = "reset-password.html";
    }, 1500);

  } catch (err) {

    console.error("Forgot password error:", err);

    if (!navigator.onLine) {
      window.location.href = "error.html?type=network";
      return;
    }

    showToast(
      "Server error.",
      "error"
    );
  }
});