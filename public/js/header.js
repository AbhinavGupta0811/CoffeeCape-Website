"use strict";
/*==================================================
    DOM ELEMENTS
==================================================*/
let siteHeader;
let navMenu;
let menuOpenBtn;
let menuCloseBtn;
let profileDropdown;
let profilePopup;
let profileButton;
let closePopupBtn;
let menuOverlay;

/*==================================================
    INITIALIZE DOM REFERENCES
==================================================*/
function initializeHeaderElements() {
    siteHeader = document.querySelector(".site-header");
    navMenu = document.getElementById("nav-menu");
    menuOpenBtn = document.getElementById("menu-open-button");
    menuCloseBtn = document.getElementById("menu-close-button");
    profileDropdown = document.getElementById("profile-dropdown");
    profilePopup = document.getElementById("profilePopup");
    profileButton = document.getElementById("profile-name");
    closePopupBtn = document.getElementById("closePopup");
}

/*==================================================
    CREATE MOBILE OVERLAY
==================================================*/
function createMenuOverlay() {
    let overlay = document.querySelector(".menu-overlay");
    if (overlay) {
        menuOverlay = overlay;
        return;
    }
    overlay = document.createElement("div");
    overlay.className = "menu-overlay";
    document.body.appendChild(overlay);
    menuOverlay = overlay;
}

/*==================================================
    MOBILE MENU
==================================================*/
/* Open Mobile Menu */
function openMobileMenu() {
    if (!navMenu || !menuOverlay) return;
    navMenu.classList.add("active");
    menuOverlay.classList.add("active");
    document.body.classList.add("menu-open");
}

/* Close Mobile Menu */
function closeMobileMenu() {
    if (!navMenu || !menuOverlay) return;
    navMenu.classList.remove("active");
    menuOverlay.classList.remove("active");
    document.body.classList.remove("menu-open");
}

/* Close menu when a navigation link is clicked */
function handleMenuLinkClick(event) {
    const link = event.target.closest(".nav-link-main"); /* was .nav-link — doesn't exist in HTML */
    if (!link) return;
    if (window.innerWidth <= 991) {
        closeMobileMenu();
    }
}

/* Escape key closes menu */
function handleEscapeKey(event) {
    if (event.key !== "Escape") return;
    closeMobileMenu();
}

/* Desktop resize protection */
function handleWindowResize() {
    if (window.innerWidth > 991) {
        closeMobileMenu();
    }
}

/* Register Mobile Menu Events */
function initializeMobileMenu() {
    if (menuOpenBtn) {
        menuOpenBtn.addEventListener("click", openMobileMenu);
    }

    if (menuCloseBtn) {
        menuCloseBtn.addEventListener("click", closeMobileMenu);
    }

    if (menuOverlay) {
        menuOverlay.addEventListener("click", closeMobileMenu);
    }

    if (navMenu) {
        navMenu.addEventListener("click", handleMenuLinkClick);
    }
    document.addEventListener("keydown", handleEscapeKey);
    window.addEventListener("resize", handleWindowResize);
}

/*==================================================
    PROFILE POPUP
==================================================*/
/* Open Profile Popup */
function openProfilePopup() {
    if (!profilePopup) return;
    profilePopup.hidden = false;
}

/* Close Profile Popup */
function closeProfilePopup() {
    if (!profilePopup) return;
    profilePopup.hidden = true;
}

/* Toggle Popup */
function toggleProfilePopup(event) {
    event.stopPropagation();
    if (!profilePopup) return;
    profilePopup.hidden = !profilePopup.hidden;
}

/* Close popup when clicking outside */
function handleOutsidePopupClick(event) {
    if (!profilePopup || !profileButton) return;
    const clickedInsidePopup = profilePopup.contains(event.target);
    const clickedProfileButton = profileButton.contains(event.target);
    if (!clickedInsidePopup && !clickedProfileButton) {
        closeProfilePopup();
    }
}

/* Escape Key closes popup */
function handlePopupEscape(event) {
    if (event.key !== "Escape") return;
    closeProfilePopup();
}

/* Register Popup Events */
function initializeProfilePopup() {
    if (profileButton) {
        profileButton.addEventListener(
            "click",
            toggleProfilePopup
        );
    }

    if (closePopupBtn) {
        closePopupBtn.addEventListener(
            "click",
            closeProfilePopup
        );
    }

    document.addEventListener(
        "click",
        handleOutsidePopupClick
    );

    document.addEventListener(
        "keydown",
        handlePopupEscape
    );
}

/*==================================================
    STICKY HEADER
==================================================*/
const HEADER_SCROLL_OFFSET = 20;

/* Add shadow while scrolling */
function updateStickyHeader() {
    if (!siteHeader) return;

    if (window.scrollY > HEADER_SCROLL_OFFSET) {
        siteHeader.classList.add("scrolled");
    } else {
        siteHeader.classList.remove("scrolled");
    }
}

/*==================================================
    ACTIVE NAVIGATION
==================================================*/
/* Remove active class from all links */
function clearActiveNavigation() {
    document.querySelectorAll(".nav-link-main").forEach(link => { /* was .nav-link */
        link.classList.remove("active");
    });
}

/* Highlight current page */
function highlightCurrentPage() {
    clearActiveNavigation();
    const currentPage = window.location.pathname.split("/").pop() || "index.html";

    document
        .querySelectorAll(".nav-link-main") /* was .nav-link */
        .forEach(link => {
            const href = link.getAttribute("href");
            if (!href) return;

            // Home page
            if (currentPage === "index.html" && href === "index.html") {
                link.classList.add("active");
            }

            // Other pages
            else if (href === currentPage) {
                link.classList.add("active");
            }
        });
}

/* Highlight sections while scrolling */
function highlightCurrentSection() {
    const currentPage = window.location.pathname.split("/").pop() || "index.html";
    if (currentPage !== "index.html") return;

    const sections = [
        "about",
        "menu",
        "activities",
        "gallery"
    ];

    let currentSection = "";
    sections.forEach(id => {
        const section = document.getElementById(id);

        if (!section) return;

        const top = section.offsetTop - 120;
        const bottom = top + section.offsetHeight;

        if (window.scrollY >= top &&window.scrollY < bottom) {
            currentSection = id;
        }
    });

    if (!currentSection) {
        highlightCurrentPage();
        return;
    }

    clearActiveNavigation();

    const activeLink =
        document.querySelector(
            `.nav-link-main[href="index.html#${currentSection}"]` /* was .nav-link */
        );

    if (activeLink) {
        activeLink.classList.add("active");
    }
}

/* Scroll Handler */
function handleHeaderScroll() {
    updateStickyHeader();

    highlightCurrentSection();

}

/* Register Header Events */
function initializeStickyHeader() {
    updateStickyHeader();
    highlightCurrentPage();

    window.addEventListener(
        "scroll",
        handleHeaderScroll
    );
}

/*==================================================
    HEADER INITIALIZATION
==================================================*/
let headerInitialized = false;

/**
 -> Initialize Header Component
 -> Call this ONLY after header.html
 -> has been inserted into the DOM.
 */
function initHeader() {
    // Prevent duplicate initialization
    if (headerInitialized) {
        return;
    }

    /*------------------------------
        DOM References
    ------------------------------*/
    initializeHeaderElements();

    /*------------------------------
        Create Overlay
    ------------------------------*/
    createMenuOverlay();

    /*------------------------------
        Mobile Menu
    ------------------------------*/
    initializeMobileMenu();

    /*------------------------------
        Profile Popup
    ------------------------------*/
    initializeProfilePopup();

    /*------------------------------
        Sticky Header
    ------------------------------*/
    initializeStickyHeader();
    headerInitialized = true;
    console.log("✅ Header initialized successfully.");
}

/*==================================================
    DESTROY HEADER (Optional)
==================================================*/
/*
 -> Reserved for future cleanup.
 -> Useful if your project ever
 -> becomes a Single Page Application.
 */
function destroyHeader() {
    headerInitialized = false;
}