"use strict";
/*==================================================
    COMPONENT PATHS
==================================================*/
const COMPONENT_PATHS = {
    header: "components/header.html",
    footer: "components/footer.html"
};

/*==================================================
    DOM CONTAINERS
==================================================*/
let headerContainer;
let footerContainer;

/*==================================================
    COMPONENT LOADER
==================================================*/
/**
 * Load HTML component into a container
 * @param {string} componentPath
 * @param {HTMLElement} container
 * @returns {Promise<boolean>}
 */
async function loadComponent(componentPath, container) {
    if (!container) {
        console.warn("Component container not found.");
        return false;
    }

    try {
        const response = await fetch(componentPath, {
            cache: "no-cache"
        });

        if (!response.ok) {
            throw new Error(
                `Failed to load component (${response.status})`
            );
        }

        const html = await response.text();
        container.innerHTML = html;
        return true;

    } catch (error) {
        console.error(
            `Error loading ${componentPath}:`,
            error
        );

        container.innerHTML = `
            <div class="component-error">
                Unable to load component.
            </div>
        `;
        return false;
    }
}

/*==================================================
    LOAD HEADER
==================================================*/
async function loadHeader() {
    headerContainer = document.getElementById("header-container");

    const loaded = await loadComponent(
        COMPONENT_PATHS.header,
        headerContainer
    );

    if (!loaded) return false;

    // Initialize Header
    if (typeof initHeader === "function") {
        initHeader();
    }
    await initializeAuthUI();

    return true;
}

/*==================================================
    LOAD FOOTER
==================================================*/
async function loadFooter() {
    footerContainer = document.getElementById("footer-container");

    if (!footerContainer) {
        return true;
    }

    const loaded = await loadComponent(
        COMPONENT_PATHS.footer,
        footerContainer
    );

    if (!loaded) {
        return false;
    }

    // Initialize Footer
    if (typeof initFooter === "function") {
        initFooter();
    }

    return true;
}

/*==================================================
    INITIALIZE COMPONENTS
==================================================*/
/* Initialize all common components */
async function initializeComponents() {
    try {
        // Load Header
        const headerLoaded = await loadHeader();
        if (!headerLoaded) {
            console.warn("Header failed to load.");
        }

        // Load Footer
        const footerLoaded = await loadFooter();
        if (!footerLoaded) {
            console.warn("Footer failed to load.");
        }

        return true;
    } catch (error) {
        console.error(
            "Component initialization failed:",
            error
        );

        return false;
    }
}

/*==================================================
    AUTHENTICATION UI
==================================================*/
/* Check current login status */
async function initializeAuthUI() {
    const signInButton = document.getElementById("sign-in-btn");
    const profileDropdown = document.getElementById("profile-dropdown");
    const userFirstname = document.getElementById("user-firstname");
    const popupName = document.getElementById("popupName");
    const profileImage = document.getElementById("navProfileImg");
    const logoutBtn = document.getElementById("logoutBtn");
    const profilePopup = document.getElementById("profilePopup");
    if (!signInButton || !profileDropdown || !userFirstname || !popupName || !profileImage) {
        console.warn("Authentication elements not found.");
        return;
    }

    try {
        const response = await fetch("/api/auth/me", {
            method: "GET",
            credentials: "include",
            headers: {
                Accept: "application/json"
            }
        });

        let data = {};
        try {
            data = await response.json();
        }
        catch {
            data = {};
        }

        if (!response.ok || !data.success || !data.user) {
            showGuestUI();
            return;
        }

        const user = data.user;
        const displayName =
            user.first_name || "User";

        userFirstname.textContent = displayName;
        popupName.textContent = displayName;

        profileImage.src =
            user.profile_image
                ? user.profile_image + "?v=" + Date.now()
                : "assets/user-default.png";

        signInButton.hidden = true;
        profileDropdown.hidden = false;

        /*=============================
            LOGOUT
        =============================*/
        if (logoutBtn && !logoutBtn.dataset.initialized) {
            logoutBtn.dataset.initialized = "true";
            logoutBtn.addEventListener("click", async () => {
                try {
                    const res = await fetch("/api/auth/logout", {
                        method: "POST",
                        credentials: "include"
                    });

                    if (!res.ok) {
                        throw new Error("Logout failed");
                    }

                    window.location.href = "Auth.html";
                }
                catch (error) {
                    console.error(
                        "Logout failed:",
                        error
                    );

                    if (!navigator.onLine) {
                        window.location.href =
                            "error.html?type=network";
                        return;
                    }

                    if (typeof showToast === "function") {
                        showToast(
                            "Logout failed",
                            "error"
                        );
                    }
                }
            });
        }

        if (profilePopup) {
            profilePopup.hidden = true;
        }
    }
    catch (error) {
        console.error(
            "Authentication check failed:",
            error
        );

        showGuestUI();
    }
}

/*==================================================
    SHOW GUEST UI
==================================================*/
function showGuestUI() {
    const signInButton =
        document.getElementById("sign-in-btn");

    const profileDropdown =
        document.getElementById("profile-dropdown");

    const profilePopup =
        document.getElementById("profilePopup");

    if (signInButton) {
        signInButton.hidden = false;
    }

    if (profileDropdown) {
        profileDropdown.hidden = true;
    }

    if (profilePopup) {
        profilePopup.hidden = true;
    }
}

/*==================================================
    APPLICATION STARTUP
==================================================*/
let applicationInitialized = false;

/* Initialize Common Application */
async function initializeApplication() {
    if (applicationInitialized) {
        return;
    }

    try {
        await initializeComponents();
        applicationInitialized = true;
        console.log("✅ Common components initialized successfully.");
    } catch (error) {
        console.error(
            "Application initialization failed:",
            error
        );
    }
}

/*==================================================
    DOM READY
==================================================*/
document.addEventListener(
    "DOMContentLoaded",
    initializeApplication
);