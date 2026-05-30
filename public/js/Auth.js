/************************************************************
 * GLOBAL STATE
 ************************************************************/
let currentEmail = localStorage.getItem("verifyEmail") || "";

/************************************************************
 * ELEMENTS
 ************************************************************/
const loginBox = document.getElementById("login-box");
const registerBox = document.getElementById("register-box");
const otpBox = document.getElementById("otp-box");
const toast = document.getElementById("toast");
const otpInputs = document.querySelectorAll(".otp-input");

/************************************************************
 * TOAST
 ************************************************************/
function showToast(message, type = "success", duration = 3000) {
  const icons = {
    success: "fa-circle-check",
    error: "fa-circle-xmark",
    warning: "fa-triangle-exclamation",
    info: "fa-circle-info"
  };

  toast.className = `toast show ${type}`;
  toast.innerHTML = `
    <i class="fa-solid ${icons[type]}" style="margin-right:8px;"></i>
    ${message}
  `;

  setTimeout(() => {
    toast.className = "toast";
  }, duration);
}

/************************************************************
 * VALIDATIONS
 ************************************************************/
const nameRegex = /^[A-Za-z]{2,}$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const phoneRegex = /^[0-9]{10,15}$/;
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

/************************************************************
 * PASSWORD TOGGLE
 ************************************************************/
document.querySelectorAll(".toggle-eye").forEach(icon => {
  icon.addEventListener("click", () => {
    const input = document.getElementById(icon.dataset.target);
    input.type = input.type === "password" ? "text" : "password";
    icon.classList.toggle("fa-eye-slash");
  });
});

/************************************************************
 * SWITCH FORMS
 ************************************************************/
document.getElementById("showRegister").onclick = () => {
  loginBox.classList.add("hidden");
  registerBox.classList.remove("hidden");
};

document.getElementById("showLogin").onclick = () => {
  registerBox.classList.add("hidden");
  loginBox.classList.remove("hidden");
};

/************************************************************
 * LOGIN
 ************************************************************/
document.getElementById("loginForm").addEventListener("submit", async e => {
  e.preventDefault();

  const btn = e.target.querySelector("button");
  btn.disabled = true;

  const email = e.target.email.value.trim();
  const password = e.target.password.value.trim();

  if (!emailRegex.test(email)) {
    btn.disabled = false;
    return showToast("Invalid email format", "warning");
  }

  if (password.length < 8) {
    btn.disabled = false;
    return showToast("Password must be at least 8 characters", "warning");
  }

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password })
    });

    const result = await res.json();

    if (res.status === 401) {
      btn.disabled = false;
      return showToast("Invalid email or password", "error");
    }

    /* 🔥 UNVERIFIED USER HANDLING */
    if (res.status === 403 && result.requireVerification) {
      currentEmail = email;
      localStorage.setItem("verifyEmail", email);

      showToast("Please verify your email first", "warning");

      loginBox.classList.add("hidden");
      otpBox.classList.remove("hidden");

      btn.disabled = false;
      return;
    }

    if (!result.success) {
      btn.disabled = false;
      return showToast(result.message || "Login failed", "error");
    }

    loginConfirmedRedirect(2, result.user.role);

  } catch {
    showToast("Network error occurred", "error");
  }

  btn.disabled = false;
});

/************************************************************
 * GOOGLE LOGIN HANDLER
 ************************************************************/
async function handleGoogleLogin(response) {

  if (!response || !response.credential) {
    showToast("Google authentication failed", "error");
    return;
  }

  try {

    const res = await fetch("/api/auth/google", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify({
        credential: response.credential
      })
    });

    let data;

    try {
      data = await res.json();
    } catch {
      throw new Error("Invalid server response");
    }

    if (!res.ok) {
      showToast(data.message || "Google login failed", "error");
      return;
    }

    if (!data.success) {
      showToast(data.message || "Authentication failed", "error");
      return;
    }

    // 🔥 IMPORTANT: Clear any OTP state
    localStorage.removeItem("verifyEmail");
    currentEmail = "";

    showToast("Google login successful!", "success");

    // 🔁 Redirect based on role
    setTimeout(() => {

      if (data.user.role === "admin") {
        window.location.href = "/admin/dashboard.html";
      } else {
        window.location.href = "/Index.html";
      }

    }, 1000);

  } catch (err) {
    console.error("Google login error:", err);
    showToast("Server error. Please try again.", "error");
  }
}

/************************************************************
 * REGISTER
 ************************************************************/
document.getElementById("registerForm").addEventListener("submit", async e => {
  e.preventDefault();

  const btn = e.target.querySelector("button");
  btn.disabled = true;

  const firstName = e.target.firstName.value.trim();
  const lastName = e.target.lastName.value.trim();
  const email = e.target.email.value.trim();
  const phone = e.target.phone.value.trim();
  const password = e.target.password.value.trim();
  const confirmPassword = document.getElementById("confPass").value.trim();

  if (!nameRegex.test(firstName) || !nameRegex.test(lastName)) {
    btn.disabled = false;
    return showToast("Invalid name format", "warning");
  }

  if (!emailRegex.test(email)) {
    btn.disabled = false;
    return showToast("Invalid email address", "warning");
  }

  if (!phoneRegex.test(phone)) {
    btn.disabled = false;
    return showToast("Invalid phone number", "warning");
  }

  if (!passwordRegex.test(password)) {
    btn.disabled = false;
    return showToast("Password must include upper, lower & number", "warning");
  }

  if (password !== confirmPassword) {
    btn.disabled = false;
    return showToast("Passwords do not match", "warning");
  }

  try {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        password
      })
    });

    const result = await res.json();

    /* 🔥 KEY FIX */
    if (result.requireVerification) {
      currentEmail = email;
      localStorage.setItem("verifyEmail", email);

      showToast(result.message || "OTP sent", "info");

      registerBox.classList.add("hidden");
      otpBox.classList.remove("hidden");

      btn.disabled = false;
      return;
    }

    if (!result.success) {
      btn.disabled = false;
      return showToast(result.message || "Registration failed", "error");
    }

  } catch {
    showToast("Server error", "error");
  }

  btn.disabled = false;
});

/************************************************************
 * OTP INPUT LOGIC
 ************************************************************/
otpInputs.forEach((input, index) => {
  input.addEventListener("input", () => {
    input.value = input.value.replace(/[^0-9]/g, "");
    if (input.value && index < otpInputs.length - 1) {
      otpInputs[index + 1].focus();
    }
  });

  input.addEventListener("keydown", e => {
    if (e.key === "Backspace" && !input.value && index > 0) {
      otpInputs[index - 1].focus();
    }
  });
});

/************************************************************
 * OTP SUBMIT
 ************************************************************/
document.getElementById("otpForm")?.addEventListener("submit", async e => {
  e.preventDefault();

  const otp = Array.from(otpInputs).map(i => i.value).join("");

  if (otp.length !== 6) {
    return showToast("Enter complete 6-digit OTP", "warning");
  }

  try {
    const res = await fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: currentEmail, otp })
    });

    const result = await res.json();

    if (!result.success) {
      return showToast(result.message, "error");
    }

    showToast("Email verified successfully!", "success");

    localStorage.removeItem("verifyEmail");
    currentEmail = "";

    otpInputs.forEach(i => i.value = "");
    otpBox.classList.add("hidden");
    loginBox.classList.remove("hidden");

  } catch {
    showToast("Server error", "error");
  }
});

/************************************************************
 * RESEND OTP
 ************************************************************/
document.getElementById("resendOtp")?.addEventListener("click", async () => {

  if (!currentEmail) {
    return showToast("Email not found. Please login/register again.", "error");
  }

  try {
    const res = await fetch("/api/auth/resend-otp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email: currentEmail })
    });

    const result = await res.json();

    if (!result.success) {
      return showToast(result.message || "Failed to resend OTP", "error");
    }

    showToast("OTP resent successfully", "success");

  } catch {
    showToast("Server error", "error");
  }

});

/************************************************************
 * LOGIN REDIRECT
 ************************************************************/
function loginConfirmedRedirect(role = "user") {
  if (role === "admin") {
    showToast("Login successful! Redirecting to admin dashboard...", "success", 2000);

    setTimeout(() => {
      window.location.href = "/admin/dashboard.html";
    }, 2000);

  } else {
    showToast("Login successful! Redirecting...", "success", 2000);

    setTimeout(() => {
      window.location.href = "/Index.html";
    }, 2000);
  }
}