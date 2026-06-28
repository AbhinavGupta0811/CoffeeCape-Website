/************************************************************
 * AUTH HELPERS
 ************************************************************/
async function getSessionUser() {
  try {
    const res = await fetch("/api/auth/me", {
      credentials: "include"
    });

    let data = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }

    if (res.status === 401) {
      return null; // Not logged in
    }

    if (res.status === 403) {
      showToast("Access denied", "error");
      return null;
    }

    if (res.status === 500) {
      window.location.href = "error.html?type=server";
      return null;
    }

    if (!res.ok || !data.success) {
      return null;
    }

    return data.user;

  } catch (err) {
    console.error("Session check failed:", err);

    if (!navigator.onLine) {
      window.location.href = "error.html?type=network";
    }

    return null;
  }
}

/************************************************************
 * NAVBAR AUTH STATE
 ************************************************************/
document.addEventListener("DOMContentLoaded", async () => {
  const signInBtn = document.getElementById("sign-in-btn");
  const profileDropdown = document.getElementById("profile-dropdown");
  const profileNameBtn = document.getElementById("profile-name");
  const profilePopup = document.getElementById("profilePopup");
  const popupName = document.getElementById("popupName");
  const logoutBtn = document.getElementById("logoutBtn");
  const closePopup = document.getElementById("closePopup");
  const navProfileImg = document.getElementById("navProfileImg");

  const user = await getSessionUser();

  if (user) {
    // Logged in
    signInBtn.style.display = "none";
    profileDropdown.style.display = "block";

    // const displayName = user.email.split("@")[0];
    const displayName = user.first_name || "User";
    document.getElementById("user-firstname").innerText = displayName;
    popupName.innerText = displayName;

    /* ===============================
        DISPLAY PROFILE IMAGE (FINAL)
    =============================== */
    if (navProfileImg && user.profile_image) {
      navProfileImg.src = user.profile_image + "?v=" + Date.now(); 
    } else if (navProfileImg) {
      navProfileImg.src = "assets/user-default.png"; 
    }

    // Toggle popup
    profileNameBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      profilePopup.style.display =
        profilePopup.style.display === "block" ? "none" : "block";
    });

    closePopup.addEventListener("click", () => {
      profilePopup.style.display = "none";
    });

    logoutBtn.addEventListener("click", async () => {
      try {
        const res = await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "include"
        });

        if (!res.ok) {
          throw new Error("Logout failed");
        }

        showToast("Logged out successfully", "success");

        setTimeout(() => {
          window.location.href = "Auth.html";
        }, 800);

      } catch (err) {
        console.error("Logout error:", err);

        if (!navigator.onLine) {
          window.location.href = "error.html?type=network";
          return;
        }

        showToast("Logout failed", "error");
      }
    });

    // Close popup when clicking outside
    window.addEventListener("click", (e) => {
      if (!profilePopup.contains(e.target) && e.target !== profileNameBtn) {
        profilePopup.style.display = "none";
      }
    });

  } else {
    // Not logged in
    signInBtn.style.display = "block";
    profileDropdown.style.display = "none";
  }
});


/************************************************************
 * MOBILE MENU TOGGLE
 ************************************************************/
const menu = document.getElementById("nav-menu");
const openBtn = document.getElementById("menu-open-button");
const closeBtn = document.getElementById("menu-close-button");

openBtn?.addEventListener("click", () => {
  menu.classList.add("active");
});

closeBtn?.addEventListener("click", () => {
  menu.classList.remove("active");
});

/************************************************************
 * SWIPER (TESTIMONIALS)
 ************************************************************/
if (typeof Swiper !== "undefined") {
  new Swiper(".slider-wrapper", {
    loop: true,
    grabCursor: true,
    spaceBetween: 25,
    slidesPerView: 1,
    pagination: {
      el: ".swiper-pagination",
      clickable: true,
    },
    navigation: {
      nextEl: ".swiper-button-next",
      prevEl: ".swiper-button-prev",
    },
    breakpoints: {
      768: { slidesPerView: 2 },
      1200: { slidesPerView: 3 },
    },
  });
}

/* =====================================
   PROFESSIONAL GLOBAL TOAST SYSTEM
===================================== */

(function(){const style = document.createElement("style");
  style.innerHTML = `
    .toast-container{
      position:fixed;
      bottom:30px;
      right:30px;
      display:flex;
      flex-direction:column;
      gap:12px;
      z-index:9999;
    }

    .toast{
      min-width:260px;
      padding:14px 18px;
      border-radius:12px;
      font-size:14px;
      display:flex;
      align-items:center;
      gap:10px;
      box-shadow:0 10px 30px rgba(0,0,0,.15);
      color:#fff;
      opacity:0;
      transform:translateX(40px);
      transition:.3s ease;
    }

    .toast.show{
      opacity:1;
      transform:translateX(0);
    }

    .toast.success{background:#1db954;}
    .toast.error{background:#e63946;}
    .toast.warning{background:#f4b400;color:#000;}
    .toast.info{background:#317ad4;}

    .toast i{
      font-size:16px;
    }
  `;
  document.head.appendChild(style);

  // Create container automatically
  const container = document.createElement("div");
  container.className = "toast-container";
  document.body.appendChild(container);

  // Icon mapping
  const icons = {
    success: "fa-solid fa-circle-check",
    error: "fa-solid fa-circle-xmark",
    warning: "fa-solid fa-triangle-exclamation",
    info: "fa-solid fa-circle-info"
  };

  // Global function
  window.showToast = function(message, type="info"){

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;

    const icon = document.createElement("i");
    icon.className = icons[type] || icons.info;

    const text = document.createElement("span");
    text.textContent = message;

    toast.appendChild(icon);
    toast.appendChild(text);
    container.appendChild(toast);

    setTimeout(()=> toast.classList.add("show"), 10); 

    setTimeout(()=>{
      toast.classList.remove("show");
      setTimeout(()=> toast.remove(), 300);
    }, 3000);
  };
})();

/************************************************************
 * CONTACT FORM (MAIN LANDING PAGE)
************************************************************/
document.addEventListener("DOMContentLoaded", () => {
  const landingForm =
    document.getElementById(
      "landingContactForm"
    );

  if (!landingForm) return;

  landingForm.addEventListener(
    "submit",
    (e) => {
      e.preventDefault();

      const message =
        landingForm.message.value.trim();

      if (!message) {
        showToast(
          "Please enter your message",
          "warning"
        );
        return;
      }

      if (message.length < 10) {
        showToast(
          "Message should be at least 10 characters",
          "warning"
        );
        return;
      }

      if (message.length > 2000) {
        showToast(
          "Message is too long",
          "warning"
        );
        return;
      }

      const params =
        new URLSearchParams({
          message
        });

      window.location.href =
        `contact.html?${params.toString()}`;
    }
  );
});

/************************************************************
 * SMOOTH SCROLL
 ************************************************************/
document.querySelectorAll("a[href^='#']").forEach(anchor => {
  anchor.addEventListener("click", function (e) {
    const href = this.getAttribute("href");
    if (!href || href.length <= 1) return;
    const target = document.getElementById(href.substring(1));
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  });
});

document.addEventListener("DOMContentLoaded", () => {
  const galleryImages = document.querySelectorAll(".gallery-image");
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightboxImg");
  const lightboxcloseBtn = document.querySelector(".lightbox-close");
  const nextBtn = document.querySelector(".lightbox-nav.next");
  const prevBtn = document.querySelector(".lightbox-nav.prev");

  if (!galleryImages.length || !lightbox) return;

  let currentIndex = 0;

  function showImage() {
    lightboxImg.src = galleryImages[currentIndex].src;
  }

  // Open lightbox
  galleryImages.forEach((img, index) => {
    img.addEventListener("click", () => {
      currentIndex = index;
      showImage();
      lightbox.classList.add("active");
    });
  });

  // Next image
  nextBtn?.addEventListener("click", () => {
    currentIndex = (currentIndex + 1) % galleryImages.length;
    showImage();
  });

  // Previous image
  prevBtn?.addEventListener("click", () => {
    currentIndex = (currentIndex - 1 + galleryImages.length) % galleryImages.length;
    showImage();
  });

  // Close button
  lightboxcloseBtn?.addEventListener("click", () => {
    lightbox.classList.remove("active");
  });

  // Close when clicking outside image
  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) {
      lightbox.classList.remove("active");
    }
  });

  // Keyboard controls
  document.addEventListener("keydown", (e) => {
    if (!lightbox.classList.contains("active")) return;

    if (e.key === "ArrowRight") nextBtn?.click();
    if (e.key === "ArrowLeft") prevBtn?.click();
    if (e.key === "Escape") lightbox.classList.remove("active");
  });
});

/* =====================================================
     SCROLL TO TOP
===================================================== */
const scrollTopBtn = document.getElementById("scrollTopBtn");

if (scrollTopBtn) {
  window.addEventListener("scroll", () => {
    if (window.scrollY > 300) {
      scrollTopBtn.classList.add("show");
    } else {
      scrollTopBtn.classList.remove("show");
    }
  });

  scrollTopBtn.addEventListener("click", () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  });
}

/* ==========================================================
   BOOKING CHOICE MODAL
========================================================== */
(() => {
    const modal = document.getElementById("bookingChoiceModal");
    if (!modal) return;
    const closeBtn = document.getElementById("bookingChoiceClose");
    const title = document.getElementById("bookingChoiceTitle");
    const description = document.getElementById("bookingChoiceDescription");
    const icon = document.getElementById("bookingEventIcon");

    const body = document.getElementById("bookingChoiceBody");
    const participantBtn = document.getElementById("participantBookingBtn");
    const audienceBtn = document.getElementById("audienceBookingBtn");
    let selectedEvent = "";

    /* =====================================================
       EVENT CONFIGURATION
    ===================================================== */
    const EVENTS = {
      karaoke: {
        title: "Karaoke Night",
        icon: "🎤",
        description: "Sing your favorite songs or simply enjoy the performances.",
        audience: true
      },

      openmic: {
        title: "Open Mic Night",
        icon: "🎙️",
        description: "Take the stage or enjoy talented performers from the audience.",
        audience: true
      },

      tasting: {
        title: "Coffee Tasting Event",
        icon: "☕",
        description: "Experience premium coffee tasting with our expert baristas.",
        audience: true
      },

      dinner: {
        title: "Dinner Night",
        icon: "🍽️",
        description: "Reserve your table and enjoy an unforgettable dining experience.",
        audience: false
      },

      get: {
        title: "Friendly Get-Together",
        icon: "🤝",
        description: "Spend quality time with friends in a relaxing coffee atmosphere.",
        audience: false
      },

      private: {
        title: "Private Celebration",
        icon: "🎂",
        description: "Celebrate birthdays, anniversaries and special occasions with us.",
        audience: false
      }
    };

    /* =====================================================
       OPEN MODAL
    ===================================================== */
    document.querySelectorAll(".book-now-btn").forEach(button => {
        button.addEventListener("click", (e) => {
          e.preventDefault();

          selectedEvent = button.dataset.event;
          const event = EVENTS[selectedEvent];

          if (!event) {
            console.error(
              "[BOOKING MODAL] Invalid event:",
              selectedEvent
            );
            window.location.href = "error.html?type=invalid-event";
            return;
          }

          title.textContent = event.title;
          description.textContent = event.description;
          icon.textContent = event.icon;
          if (event.audience) {
            body.classList.remove("participant-only");
          } else {
            body.classList.add("participant-only");
          }

          modal.classList.add("active");
          modal.setAttribute("aria-hidden", "false");
          document.body.style.overflow = "hidden";
        });
    });

    /* =====================================================
       CLOSE MODAL
    ===================================================== */
    function closeModal() {
      modal.classList.remove("active");
      modal.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    }

    closeBtn.addEventListener("click", closeModal);

    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (
        e.key === "Escape" &&
        modal.classList.contains("active")
      ) {
        closeModal();
      }
    });

    /* =====================================================
       PARTICIPANT
    ===================================================== */
    participantBtn.addEventListener("click", () => {
      window.location.href =
        `booking.html?event=${selectedEvent}`;
    });

    /* =====================================================
       AUDIENCE
    ===================================================== */
    audienceBtn.addEventListener("click", () => {
      window.location.href =
        `audience-booking.html?event=${selectedEvent}`;
    });
})();