"use strict";

/*==================================================
    FOOTER DOM ELEMENTS
==================================================*/
let footer;
let footerYear;
let downloadButtons;
let socialLinks;
let appStoreLink;
let playStoreLink;
let footerSocialLinks;

/*==================================================
    INITIALIZE DOM REFERENCES
==================================================*/
function initializeFooterElements() {
    footer = document.querySelector(".footer");
    footerYear = document.getElementById("footerYear");
    downloadButtons =  document.querySelectorAll(".footer-download a");
    socialLinks = document.querySelectorAll(".footer-social a");
}

/*==================================================
    COPYRIGHT YEAR
==================================================*/
/* Update Footer Copyright Year */
function updateFooterYear() {
    if (!footerYear) {
        return;
    }
    footerYear.textContent = new Date().getFullYear();
}

/*==================================================
    DOWNLOAD BUTTONS
==================================================*/
/* Initialize Download Button References */
function initializeDownloadButtons() {
    appStoreLink =  document.getElementById("appStoreLink");
    playStoreLink = document.getElementById("playStoreLink");

    if (appStoreLink) {
        appStoreLink.addEventListener(
            "click",
            handleAppStoreClick
        );
    }

    if (playStoreLink) {
        playStoreLink.addEventListener(
            "click",
            handlePlayStoreClick
        );
    }
}

/* App Store Click */
function handleAppStoreClick(event) {
    const href = appStoreLink?.getAttribute("href");
    if (!href || href === "#") {
        event.preventDefault();
        console.info(
            "App Store link has not been configured yet."
        );
        return;
    }
}

/* Google Play Click */
function handlePlayStoreClick(event) {
    const href = playStoreLink?.getAttribute("href");
    if (!href || href === "#") {

        event.preventDefault();

        console.info(
            "Google Play link has not been configured yet."
        );
        return;
    }
}

/*==================================================
    SOCIAL MEDIA LINKS
==================================================*/
/* Initialize Social Links */
function initializeSocialLinks() {
    footerSocialLinks = document.querySelectorAll(".footer-social a");

    footerSocialLinks.forEach(link => {
        link.addEventListener(
            "click",
            handleSocialLinkClick
        );
    });
}

/* Social Link Click Handler */
function handleSocialLinkClick(event) {
    const link = event.currentTarget;
    const href = link.getAttribute("href");

    // Link not configured
    if (!href || href === "#") {
        event.preventDefault();

        console.info(
            "Social media link has not been configured yet."
        );
        return;
    }

    // Basic URL validation
    try {
        new URL(href);
    } catch {
        event.preventDefault();

        console.warn(
            "Invalid social media URL:",
            href
        );
    }
}

/*==================================================
    FOOTER INITIALIZATION
==================================================*/
let footerInitialized = false;

/**
 -> Initialize Footer Component
 -> Call this ONLY after footer.html
 -> has been inserted into the DOM.
 */
function initFooter() {
    // Prevent duplicate initialization
    if (footerInitialized) {
        return;
    }

    /*------------------------------
        DOM References
    ------------------------------*/
    initializeFooterElements();

    /*------------------------------
        Dynamic Copyright Year
    ------------------------------*/
    updateFooterYear();

    /*------------------------------
        Download Buttons
    ------------------------------*/
    initializeDownloadButtons();

    /*------------------------------
        Social Media Links
    ------------------------------*/
    initializeSocialLinks();
    footerInitialized = true;

    console.log("✅ Footer initialized successfully.");
}