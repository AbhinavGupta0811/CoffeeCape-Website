const form = document.getElementById("forgotForm");
const emailInput = document.getElementById("email");
const sendBtn = document.getElementById("sendBtn");
const toast = document.getElementById("toast");

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function showToast(msg, type="info") {
  toast.innerHTML = msg;
  toast.className = `toast show ${type}`;
  setTimeout(() => toast.classList.remove("show"), 3000);
}

form.addEventListener("submit", async e => {
  e.preventDefault();

  const email = emailInput.value.trim();

  if (!email) {
    return showToast(`<i class="fa-solid fa-triangle-exclamation"style="margin-right:6px;"></i> Email is required..`, "warning");
  }

  if (!emailRegex.test(email)) {
    return showToast(`<i class="fa-solid fa-triangle-exclamation"style="margin-right:6px;"></i> Invalid email format..`, "warning");
  }

  sendBtn.disabled = true;
  sendBtn.textContent = "Sending OTP...";

  try {
    const res = await fetch("/api/password/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include", // 🔥 Important if using sessions
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
        `<i class="fa-solid fa-lock" style="margin-right:6px;"></i> Unauthorized request.`,
        "error"
      );
      return;
    }

    if (res.status === 403) {
      showToast(
        `<i class="fa-solid fa-circle-xmark" style="margin-right:6px;"></i> Access denied.`,
        "error"
      );
      return;
    }

    if (res.status === 404) {
      showToast(
        `<i class="fa-solid fa-triangle-exclamation" style="margin-right:6px;"></i> Email not registered.`,
        "warning"
      );
      return;
    }

    if (res.status === 429) {
      showToast(
        `<i class="fa-solid fa-triangle-exclamation" style="margin-right:6px;"></i> Too many attempts. Try again later.`,
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
        data.message || `<i class="fa-solid fa-circle-xmark" style="margin-right:6px;"></i> Failed to send OTP.`,
        "error"
      );
      return;
    }

    sessionStorage.setItem("resetEmail", email);

    showToast(
      `<i class="fa-solid fa-circle-check" style="margin-right:6px;"></i> OTP sent to your email.`,
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
      `<i class="fa-solid fa-circle-xmark" style="margin-right:6px;"></i> Server error.`,
      "error"
    );
  }
});