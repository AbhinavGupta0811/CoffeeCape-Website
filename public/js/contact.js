/* =========================
   API CONFIG (TOP OF FILE)
========================= */
const API = {
  CONTACT_SUBMIT: "/api/contact"
};

/* =========================
   TOAST NOTIFICATION
========================= */
function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div>${message}</div>
    <span>&times;</span>
  `;

  container.appendChild(toast);

  toast.querySelector("span").onclick = () => toast.remove();

  setTimeout(() => {
    toast.remove();
  }, 4000);
}

/* =========================
   CONTACT FORM SCRIPT
========================= */
document.addEventListener("DOMContentLoaded", () => {

  // ✅ TARGET SPECIFIC FORM
  const form = document.getElementById("contactForm");

  // 🔐 SAFETY GUARD (prevents your error)
  if (!form) return;

  const submitBtn = form.querySelector("button");

  /* =========================
     AUTO-FILL FROM REDIRECT
  ========================= */
  const params = new URLSearchParams(window.location.search);

  if (params.get("name")) {
    form.querySelector("input[name='name']").value = params.get("name");
  }

  if (params.get("email")) {
    form.querySelector("input[name='email']").value = params.get("email");
  }

  if (params.get("message")) {
    form.querySelector("textarea[name='message']").value = params.get("message");
  }

  // Optional: clean URL after autofill
  if ([...params.keys()].length) {
    history.replaceState({}, document.title, window.location.pathname);
  }

  /* -------------------------
     FORM SUBMIT
  ------------------------- */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    /* -------------------------
       GET FORM VALUES (SAFE)
    ------------------------- */
    const name = form.querySelector("input[name='name']").value.trim();
    const email = form.querySelector("input[name='email']").value.trim();
    const subject =
      form.querySelector("input[name='subject']")?.value.trim() || "";
    const message = form.querySelector("textarea[name='message']").value.trim();

    /* -------------------------
       FRONTEND VALIDATION
    ------------------------- */
    if (!name || !email || !message) {
      showToast(`<i class="fa-solid fa-triangle-exclamation"style="margin-right:6px;"></i> All required fields are required`, "warning");
      return;
    }

    if (message.length < 10) {
      showToast(`<i class="fa-solid fa-triangle-exclamation"style="margin-right:6px;"></i> Message must be at least 10 characters long`, "warning");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showToast(`<i class="fa-solid fa-triangle-exclamation"style="margin-right:6px;"></i> Please enter a valid email address`, "warning");
      return;
    }

    /* -------------------------
       BUTTON LOADING STATE
    ------------------------- */
    submitBtn.disabled = true;
    submitBtn.textContent = "Sending...";

    try {
      const response = await fetch(API.CONTACT_SUBMIT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", 
        body: JSON.stringify({
          name,
          email,
          subject,
          message
        })
      });

      let result = {};
      try {
        result = await response.json();
      } catch {
        result = {};
      }

      if (response.status === 401) {
        showToast(
          `<i class="fa-solid fa-lock" style="margin-right:6px;"></i> Please login to send a message.`,
          "warning"
        );
        setTimeout(() => {
          window.location.href = "Auth.html";
        }, 1500);
        return;
      }

      if (response.status === 403) {
        showToast(
          `<i class="fa-solid fa-circle-xmark" style="margin-right:6px;"></i> Access denied.`,
          "error"
        );
        return;
      }

      if (response.status === 404) {
        window.location.href = "error.html?type=notfound";
        return;
      }

      if (response.status === 409) {
        showToast(
          `<i class="fa-solid fa-triangle-exclamation" style="margin-right:6px;"></i> Duplicate submission detected.`,
          "warning"
        );
        return;
      }

      if (response.status === 500) {
        window.location.href = "error.html?type=server";
        return;
      }

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to send message");
      }

      showToast(
        `<i class="fa-solid fa-circle-check" style="margin-right:6px;"></i> Message sent successfully. Our team will contact you soon.`,
        "success"
      );

      form.reset();
    } catch (error) {
      console.error("Contact API Error:", error);

      if (!navigator.onLine) {
        window.location.href = "error.html?type=network";
        return;
      }
      
      showToast(
        `<i class="fa-solid fa-circle-xmark" style="margin-right:6px;"></i> Failed to send message. Please try again later.`,
        "error"
      );
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit";
    }
  });
});
floatingHomeBtn.onclick = () => {
  location.href = "index.html";
};