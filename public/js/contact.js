/* =========================
   API CONFIG (TOP OF FILE)
========================= */
const API = {
  CONTACT_SUBMIT: "/api/contact"
};

/* =========================
   LIMITS
========================= */
const LIMITS = {
  SUBJECT_MIN: 3,
  SUBJECT_MAX: 100,
  MESSAGE_MIN: 10,
  MESSAGE_MAX: 2000
};

/* =========================
   TOAST NOTIFICATION
========================= */
function showToast(message, type = "info") {
  const container =
    document.getElementById(
      "toast-container"
    );

  if (!container) return;

  const toast =
    document.createElement("div");

  toast.className =
    `toast ${type}`;

  const msg =
    document.createElement("div");

  msg.textContent =
    message;

  const close =
    document.createElement("span");

  close.textContent =
    "×";

  close.onclick =
    () => toast.remove();

  toast.append(
    msg,
    close
  );

  container.appendChild(
    toast
  );

  setTimeout(() => {
    toast.remove();
  }, 4000);
}

/* =========================
   HELPERS
========================= */
function clean(value) {
  return String(
    value || ""
  ).trim();
}

function validate(subject, message) {

  if (!subject ) {
    return "Subject is required";
  }

  if (
    subject.length <
      LIMITS.SUBJECT_MIN ||
    subject.length >
      LIMITS.SUBJECT_MAX
  ) {
    return "Subject must be 3–100 characters";
  }

  if (
    message.length <
      LIMITS.MESSAGE_MIN
  ) {
    return "Message must be at least 10 characters";
  }

  if (
    message.length >
      LIMITS.MESSAGE_MAX
  ) {
    return "Message cannot exceed 2000 characters";
  }

  return null;
}

/* =========================
   CONTACT FORM SCRIPT
========================= */
document.addEventListener("DOMContentLoaded", async () => {
    const form = document.getElementById("contactForm");

    if (!form) return;
    const submitBtn = form.querySelector("button");
    const nameInput = form.querySelector("input[name='name']");
    const emailInput = form.querySelector("input[name='email']");
    const subjectInput = form.querySelector("input[name='subject']");
    const messageInput = form.querySelector("textarea[name='message']");

    /* =========================
      LOAD LOGGED-IN USER
    ========================= */
    try {
      const res = await fetch(
        "/api/auth/me",
        {
          credentials: "include"
        }
      );

      let data = {};

      try {
        data = await res.json();
      } catch {
        data = {};
      }

      /* NOT LOGGED IN */
      if (res.status === 401) {
        showToast(
          "Please login first",
          "warning"
        );

        setTimeout(() => {
          location.href =
            "Auth.html";
        }, 1500);

        return;
      }

      /* SERVER ERROR */
      if (res.status === 500) {
        location.href = "error.html?type=server";
        return;
      }

      /* VALID USER */
      if ( res.ok && data.success && data.user) {
        if (nameInput) {
          const fullName = [data.user.first_name, data.user.last_name].filter(Boolean).join(" ");
          nameInput.value = fullName || "";
          nameInput.readOnly = true;
        }
        if (emailInput) {
          emailInput.value = data.user.email || "";
          emailInput.readOnly = true;
        }
      }
    } catch (err) {
      console.error(
        "User fetch failed:",
        err
      );

      if (!navigator.onLine) {
        location.href = "error.html?type=network";
      }
    }

    /* MESSAGE LIMIT */
    if (messageInput) {
      messageInput.maxLength =
        LIMITS.MESSAGE_MAX;
    }

    /* AUTO FILL */
    const params =
      new URLSearchParams(
        location.search
      );

    if (params.get("message")){
      messageInput.value = clean( params.get("message"));
    }

    if (
      [...params.keys()]
        .length
    ) {

      history.replaceState(
        {},
        document.title,
        location.pathname
      );

    }

    /* -------------------------
       FORM SUBMIT
    ------------------------- */
    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        if (submitBtn.disabled) return;

        const subject =
          clean(
            subjectInput?.value
          );

        const message =
          clean(
            messageInput?.value
          );

        const error =
          validate(
            subject,
            message
          );

        if (error) {
          showToast(
            error,
            "warning"
          );
          return;
        }

        submitBtn.disabled = true;

        const oldText =
          submitBtn.textContent;

        submitBtn.textContent =
          "Sending...";

        try {

          const controller =
            new AbortController();

          const timeout =
            setTimeout(
              () =>
                controller.abort(),
              15000
            );

          const response =
            await fetch(
              API.CONTACT_SUBMIT,
              {
                method:
                  "POST",

                headers:
                {
                  "Content-Type":
                    "application/json"
                },

                credentials:
                  "include",

                signal:
                  controller.signal,

                body:
                  JSON.stringify(
                    {
                      subject,
                      message
                    }
                  )
              }
            );

          clearTimeout(timeout);

          let result = {};

          try {
            result = await response.json();
          } catch {}

          /* LOGIN */
          if (response.status === 401) {
            showToast(
              "Please login first",
              "warning"
            );

            setTimeout(
              () => {
                location.href =
                  "Auth.html";
              },
              1500
            );
            return;
          }

          /* VALIDATION */
          if (result.errors) {
            showToast(
              result.errors.join(
                ", "
              ),
              "warning"
            );
            return;
          }

          /* DUPLICATE */
          if (response.status === 409) {
            showToast(
              "Duplicate message detected",
              "warning"
            );
            return;
          }

          /* RATE LIMIT */
          if (response.status === 429) {
            showToast(
              result.message ||
                "Too many requests",
              "warning"
            );
            return;
          }

          /* SERVER */
          if (response.status === 500) {
            location.href =
              "error.html?type=server";
            return;
          }

          if (!response.ok) {
            throw new Error(
              result.message
            );
          }

          showToast(
            "Message sent successfully. Our team will contact you soon.",
            "success"
          );

          const savedName = nameInput.value;
          const savedEmail = emailInput.value;

          form.reset();

          nameInput.value = savedName;
          emailInput.value = savedEmail;

          nameInput.readOnly = true;
          emailInput.readOnly = true;

        } catch (error) {
          console.error(
            "Contact API Error:",
            error
          );

          if (!navigator.onLine) {
            location.href =
              "error.html?type=network";
            return;
          }

          showToast(
            "Failed to send message. Please try again later.",
            "error"
          );

        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = oldText;
        }
      }
    );
  }
);

/* =========================
   HOME BUTTON
========================= */
if (typeof floatingHomeBtn !== "undefined") {
  floatingHomeBtn.onclick = () => {
    location.href = "index.html";
  };
}