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
 * VIDEO SLIDER (HERO)
 * Four slides: autoplay every 6s, fade transition,
 * prev/next arrows, dot navigation, pause on hover.
 ************************************************************/
document.addEventListener("DOMContentLoaded", () => {
    const slides    = document.querySelectorAll(".video-slide");
    const dots      = document.querySelectorAll(".slider-dot");
    const prevBtn   = document.getElementById("sliderPrev");
    const nextBtn   = document.getElementById("sliderNext");

    if (!slides.length) return;

    let current   = 0;
    let autoTimer = null;
    const INTERVAL = 6000;

    /* ---- Activate a slide by index ---- */
    function goTo(index) {
        // Pause video on current slide
        const prevVideo = slides[current].querySelector(".slide-video");
        if (prevVideo) prevVideo.pause();

        // Deactivate current
        slides[current].classList.remove("active");
        dots[current]?.classList.remove("active");

        // Advance index
        current = (index + slides.length) % slides.length;

        // Activate new slide
        slides[current].classList.add("active");
        dots[current]?.classList.add("active");

        // Play video on new slide
        const nextVideo = slides[current].querySelector(".slide-video");
        if (nextVideo) {
            nextVideo.currentTime = 0;
            nextVideo.play().catch(() => {
                /* Autoplay blocked — video stays muted/paused, overlay is still visible */
            });
        }
    }

    /* ---- Auto-advance ---- */
    function startAuto() {
        autoTimer = setInterval(() => goTo(current + 1), INTERVAL);
    }

    function stopAuto() {
        clearInterval(autoTimer);
    }

    /* ---- Controls ---- */
    prevBtn?.addEventListener("click", () => { stopAuto(); goTo(current - 1); startAuto(); });
    nextBtn?.addEventListener("click", () => { stopAuto(); goTo(current + 1); startAuto(); });

    dots.forEach(dot => {
        dot.addEventListener("click", () => {
            stopAuto();
            goTo(Number(dot.dataset.index));
            startAuto();
        });
    });

    /* ---- Pause on hover ---- */
    const slider = document.getElementById("videoSlider");
    slider?.addEventListener("mouseenter", stopAuto);
    slider?.addEventListener("mouseleave", startAuto);

    /* ---- Keyboard ---- */
    document.addEventListener("keydown", e => {
        if (e.key === "ArrowLeft")  { stopAuto(); goTo(current - 1); startAuto(); }
        if (e.key === "ArrowRight") { stopAuto(); goTo(current + 1); startAuto(); }
    });

    /* ---- Touch swipe ---- */
    let touchStartX = 0;
    slider?.addEventListener("touchstart", e => { touchStartX = e.changedTouches[0].clientX; }, { passive: true });
    slider?.addEventListener("touchend",   e => {
        const diff = touchStartX - e.changedTouches[0].clientX;
        if (Math.abs(diff) < 40) return;
        stopAuto();
        goTo(diff > 0 ? current + 1 : current - 1);
        startAuto();
    });

    /* ---- Boot ---- */
    goTo(0);
    startAuto();
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

/************************************************************
 * STATS STRIP — Animated Counters
 * Counts each .stat-number up from 0 to its data-target
 * once the stats section scrolls into view.
 ************************************************************/
document.addEventListener("DOMContentLoaded", () => {
    const statsSection = document.getElementById("stats");
    const counters      = document.querySelectorAll(".stat-number");

    if (!statsSection || !counters.length) return;

    const DURATION = 1800; // ms

    function animateCounter(el) {
        const target = Number(el.dataset.target) || 0;
        const start  = performance.now();

        function tick(now) {
            const progress = Math.min((now - start) / DURATION, 1);
            // ease-out for a natural deceleration
            const eased = 1 - Math.pow(1 - progress, 3);
            const value = Math.floor(eased * target);

            el.textContent = value.toLocaleString("en-IN");

            if (progress < 1) {
                requestAnimationFrame(tick);
            } else {
                el.textContent = target.toLocaleString("en-IN");
            }
        }

        requestAnimationFrame(tick);
    }

    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                counters.forEach(animateCounter);
                obs.disconnect();
            }
        });
    }, { threshold: 0.4 });

    observer.observe(statsSection);
});

/************************************************************
 * ACTIVITIES — Filter Chips
 * Shows/hides event cards by data-category based on the
 * selected filter chip, without touching the booking modal.
 ************************************************************/
document.addEventListener("DOMContentLoaded", () => {
    const chips = document.querySelectorAll(".filter-chip");
    const cards = document.querySelectorAll(".activity-card");
    const emptyState = document.getElementById("activityEmpty");

    if (!chips.length || !cards.length) return;

    chips.forEach(chip => {
        chip.addEventListener("click", () => {
            chips.forEach(c => c.classList.remove("active"));
            chip.classList.add("active");

            const filter = chip.dataset.filter;
            let visibleCount = 0;

            cards.forEach(card => {
                const match = filter === "all" || card.dataset.category === filter;
                card.classList.toggle("is-hidden", !match);
                if (match) visibleCount++;
            });

            if (emptyState) {
                emptyState.hidden = visibleCount !== 0;
            }
        });
    });
});

/************************************************************
 * FAQ — Accordion
 * Toggles one answer open at a time and keeps aria-expanded
 * in sync for accessibility.
 ************************************************************/
document.addEventListener("DOMContentLoaded", () => {
    const faqQuestions = document.querySelectorAll(".faq-question");
    if (!faqQuestions.length) return;

    faqQuestions.forEach(button => {
        button.addEventListener("click", () => {
            const isOpen = button.getAttribute("aria-expanded") === "true";

            faqQuestions.forEach(other => other.setAttribute("aria-expanded", "false"));

            button.setAttribute("aria-expanded", isOpen ? "false" : "true");
        });
    });
});

document.addEventListener("DOMContentLoaded", () => {
  const galleryItems  = document.querySelectorAll(".gallery-item");
  const galleryImages = document.querySelectorAll(".gallery-image");
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightboxImg");
  const lightboxcloseBtn = document.querySelector(".lightbox-close");
  const nextBtn = document.querySelector(".lightbox-nav.next");
  const prevBtn = document.querySelector(".lightbox-nav.prev");

  if (!galleryItems.length || !galleryImages.length || !lightbox) return;

  let currentIndex = 0;

  function showImage() {
    lightboxImg.src = galleryImages[currentIndex].src;
    lightboxImg.alt = galleryImages[currentIndex].alt || "";
  }

  // Open lightbox — listen on the whole tile (image + hover overlay)
  // so clicks anywhere on the card, including the overlay caption/
  // zoom icon that sit above the image, still open the lightbox.
  galleryItems.forEach((item, index) => {
    item.addEventListener("click", () => {
      currentIndex = index;
      showImage();
      lightbox.classList.add("active");
    });
  });

  // Next image
  nextBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    currentIndex = (currentIndex + 1) % galleryImages.length;
    showImage();
  });

  // Previous image
  prevBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    currentIndex = (currentIndex - 1 + galleryImages.length) % galleryImages.length;
    showImage();
  });

  // Close button
  lightboxcloseBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
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