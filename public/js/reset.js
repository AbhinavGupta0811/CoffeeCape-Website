/* ---------- DOM ELEMENTS ---------- */
const toast = document.getElementById("toast");

const otpForm = document.getElementById("otpForm");
const passwordForm = document.getElementById("passwordForm");
const title = document.getElementById("title");

const inputs = document.querySelectorAll(".otp");
const verifyBtn = document.getElementById("verifyBtn");
const resendBtn = document.getElementById("resendBtn");
const time = document.getElementById("time");

const passwordInput = document.getElementById("password");
const confirmInput = document.getElementById("confirm");
const resetBtn = document.getElementById("resetPassword");

/* ---------- EMAIL CHECK ---------- */
const email = sessionStorage.getItem("resetEmail");

if (!email) {
  window.location.href = "Forgot-password.html";
}

/* ==========================================
   TOAST
========================================== */
function showToast(message, type = "error") {

  const icons = {
    success: '<i class="fa-solid fa-circle-check"></i>',
    error: '<i class="fa-solid fa-circle-xmark"></i>',
    warning: '<i class="fa-solid fa-triangle-exclamation"></i>',
    info: '<i class="fa-solid fa-circle-info"></i>'
  };

  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-message">${message}</span>
  `;

  toast.className = `toast show ${type}`;

  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

/* ==========================================
   OTP AUTO NAVIGATION
========================================== */
inputs.forEach((input, index) => {

  input.addEventListener("input", () => {
    input.value = input.value.replace(/[^0-9]/g, "");

    if (input.value && index < inputs.length - 1) {
      inputs[index + 1].focus();
    }
  });

  input.addEventListener("keydown", e => {
    if (e.key === "Backspace" && !input.value && index > 0) {
      inputs[index - 1].focus();
    }
  });

});

/* ==========================================
   TIMER
========================================== */
let seconds = 60;

const interval = setInterval(() => {
  seconds--;
  time.textContent = seconds;

  if (seconds <= 0) {
    clearInterval(interval);
    resendBtn.disabled = false;
  }
}, 1000);

/* ==========================================
   VERIFY OTP
========================================== */
verifyBtn.addEventListener("click", async () => {

  const otp = [...inputs].map(i => i.value).join("");

  if (otp.length !== 6) {
    return showToast("Enter valid 6-digit OTP", "warning");
  }

  verifyBtn.disabled = true;
  verifyBtn.textContent = "Verifying...";

  try {
    const res = await fetch("/api/password/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, otp })
    });

    const data = await res.json();

    if (!data.success) {
      throw new Error(data.message);
    }

    // Switch UI
    otpForm.classList.remove("active");
    passwordForm.classList.add("active");
    title.textContent = "Reset Password";

  } catch (err) {
    showToast(err.message || "OTP verification failed");
    verifyBtn.disabled = false;
    verifyBtn.textContent = "Verify OTP";
  }

});

/* ==========================================
   RESEND OTP
========================================== */
resendBtn.addEventListener("click", async () => {

  resendBtn.disabled = true;
  resendBtn.textContent = "Sending...";

  try {
    const res = await fetch("/api/password/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });

    const data = await res.json();

    if (!data.success) {
      throw new Error(data.message);
    }

    showToast("OTP sent again", "success");
    location.reload();

  } catch (err) {
    showToast(err.message || "Failed to resend OTP");
    resendBtn.disabled = false;
    resendBtn.textContent = "Resend OTP";
  }

});

/* ==========================================
   PASSWORD TOGGLE
========================================== */
document.querySelectorAll(".toggle-password").forEach(icon => {
  icon.addEventListener("click", () => {
    const input = document.getElementById(icon.dataset.target);
    input.type = input.type === "password" ? "text" : "password";
  });
});

/* ==========================================
   PASSWORD VALIDATION
========================================== */
const strongPassword =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}$/;

/* ==========================================
   RESET PASSWORD
========================================== */
resetBtn.addEventListener("click", async () => {

  const password = passwordInput.value.trim();
  const confirm = confirmInput.value.trim();

  if (!strongPassword.test(password)) {
    return showToast(
      "Password must be 8+ chars with upper, lower & special character", "warning"
    );
  }

  if (password !== confirm) {
    return showToast("Passwords do not match", "warning");
  }

  resetBtn.disabled = true;
  resetBtn.textContent = "Resetting...";

  try {
    const res = await fetch("/api/password/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (!data.success) {
      throw new Error(data.message);
    }

    sessionStorage.removeItem("resetEmail");

    showToast("Password reset successful", "success");

    setTimeout(() => {
      window.location.href = "Auth.html";
    }, 2000);

  } catch (err) {
    showToast(err.message || "Reset failed");
    resetBtn.disabled = false;
    resetBtn.textContent = "Reset Password";
  } 
});