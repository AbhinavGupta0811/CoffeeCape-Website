"use strict";

/*
=========================================================
 COFFEECAPE DELIVERY DASHBOARD
=========================================================

Frontend responsibilities:

1. Verify delivery-boy authentication
2. Protect dashboard from unauthenticated access
3. Protect forced-password-change accounts
4. Load delivery dashboard data
5. Render delivery statistics
6. Render current delivery
7. Render today's deliveries
8. Accept assigned delivery
9. Start picked-up delivery
10. Open delivery details
11. Refresh dashboard after state changes
12. Handle logout
13. Handle loading / empty / error states
14. Escape dynamic HTML
15. Prevent duplicate actions
16. Keep assignmentId and orderId separate

Authentication:
    Cookie/session based

API base:
    /api/delivery

Dashboard:
    GET /api/delivery/dashboard

Accept:
    PATCH /api/delivery/deliveries/:assignmentId/accept

Start:
    PATCH /api/delivery/deliveries/:assignmentId/start

Auth:
    GET  /api/delivery/auth/me
    POST /api/delivery/auth/logout
=========================================================
*/


/* =====================================================
   CONFIGURATION
===================================================== */

const API_BASE = "/api/delivery";

const DASHBOARD_ENDPOINT =
    `${API_BASE}/dashboard`;

const AUTH_ME_ENDPOINT =
    `${API_BASE}/auth/me`;

const LOGOUT_ENDPOINT =
    `${API_BASE}/auth/logout`;

const ACCEPT_ENDPOINT =
    (assignmentId) =>
        `${API_BASE}/${encodeURIComponent(
            assignmentId
        )}/accept`;

const START_ENDPOINT =
    (assignmentId) =>
        `${API_BASE}/${encodeURIComponent(
            assignmentId
        )}/start`;


/*
Refresh interval.

This keeps the dashboard reasonably fresh when
admin assigns a new delivery while the delivery boy
is already logged in.

10 seconds is a reasonable starting point.

If you don't want automatic refresh, set to 0.
*/

const REFRESH_INTERVAL = 10000;


/*
=========================================================
 DOM ELEMENTS
=========================================================
*/

const welcomeName =
    document.getElementById("welcomeName");

const employeeIdElement =
    document.getElementById("employeeId");

const assignedCount =
    document.getElementById("assignedCount");

const pickedCount =
    document.getElementById("pickedCount");

const transitCount =
    document.getElementById("transitCount");

const deliveredCount =
    document.getElementById("deliveredCount");

const currentDelivery =
    document.getElementById("currentDelivery");

const todayDeliveries =
    document.getElementById("todayDeliveries");

const profileButton =
    document.getElementById("profileButton");

const profileMenu =
    document.getElementById("profileMenu");

const logoutButton =
    document.getElementById("logoutButton");


/*
=========================================================
 STATE
=========================================================
*/

let currentUser = null;

let dashboardData = null;

let isDashboardLoading = false;

let isLoggingOut = false;

let actionInProgress = new Set();

let refreshTimer = null;


/*
=========================================================
 SAFE DOM HELPERS
=========================================================
*/

function elementExists(element) {
    return element !== null &&
        element !== undefined;
}


function setText(element, value) {

    if (!elementExists(element)) {
        return;
    }

    element.textContent =
        String(value ?? "");
}


/*
=========================================================
 HTML ESCAPING
=========================================================
*/

function escapeHTML(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


/*
=========================================================
 NUMBER HELPERS
=========================================================
*/

function safeNumber(value) {

    const number =
        Number(value);

    return Number.isFinite(number)
        ? number
        : 0;
}


/*
=========================================================
 MONEY FORMAT
=========================================================
*/

function formatMoney(value) {

    return safeNumber(value)
        .toLocaleString(
            "en-IN",
            {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }
        );
}


/*
=========================================================
 DATE FORMAT
=========================================================
*/

function formatDate(value) {

    if (!value) {
        return "—";
    }

    const date =
        new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "—";
    }

    return date.toLocaleString(
        "en-IN",
        {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        }
    );
}


/*
=========================================================
 STATUS FORMAT
=========================================================
*/

function formatStatus(status) {

    const statusMap = {

        assigned:
            "Assigned",

        picked_up:
            "Picked Up",

        out_for_delivery:
            "Out for Delivery",

        delivered:
            "Delivered"
    };


    if (
        Object.prototype.hasOwnProperty.call(
            statusMap,
            status
        )
    ) {

        return statusMap[status];
    }


    return String(status || "")
        .replaceAll("_", " ")
        .replace(
            /\b\w/g,
            char => char.toUpperCase()
        );
}


/*
=========================================================
 STATUS DESCRIPTION
=========================================================
*/

function getStatusDescription(status) {

    const descriptions = {

        assigned:
            "This delivery has been assigned to you.",

        picked_up:
            "You have accepted and picked up this order.",

        out_for_delivery:
            "This order is currently out for delivery.",

        delivered:
            "This order has been successfully delivered."
    };


    return descriptions[status] ||
        "Delivery status unavailable.";
}


/*
=========================================================
 STATUS CLASS
=========================================================
*/

function getStatusClass(status) {

    const allowed = [
        "assigned",
        "picked_up",
        "out_for_delivery",
        "delivered"
    ];


    return allowed.includes(status)
        ? status
        : "";
}


/*
=========================================================
 AUTHENTICATION
=========================================================
*/

async function loadCurrentUser() {

    try {

        const response =
            await fetch(
                AUTH_ME_ENDPOINT,
                {
                    method: "GET",
                    credentials: "include",
                    headers: {
                        "Accept":
                            "application/json"
                    },
                    cache: "no-store"
                }
            );


        /*
        Session expired / unauthorized.
        */

        if (
            response.status === 401 ||
            response.status === 403
        ) {

            redirectToLogin();

            return null;
        }


        if (!response.ok) {

            throw new Error(
                `Authentication failed: ${response.status}`
            );
        }


        const data =
            await response.json();


        if (
            !data.success ||
            !data.user
        ) {

            redirectToLogin();

            return null;
        }


        /*
        Forced password change must be
        handled before dashboard access.
        */

        if (
            data.user.forcePasswordChange
        ) {

            window.location.href =
                "change-password.html";

            return null;
        }


        currentUser =
            data.user;


        return currentUser;

    } catch (error) {

        console.error(
            "Delivery authentication error:",
            error
        );


        redirectToLogin();

        return null;
    }
}


/*
=========================================================
 LOGIN REDIRECT
=========================================================
*/

function redirectToLogin() {

    /*
    Prevent redirect loops.
    */

    if (
        window.location.pathname
            .toLowerCase()
            .includes("login")
    ) {

        return;
    }


    window.location.href =
        "login.html";
}


/*
=========================================================
 RENDER USER
=========================================================
*/

function renderUser(user) {

    if (!user) {
        return;
    }


    const name =
        user.name ||
        user.fullName ||
        "Delivery Partner";


    const employeeId =
        user.employeeId ||
        user.employee_id ||
        "—";


    setText(
        welcomeName,
        `Good day, ${name} 👋`
    );


    setText(
        employeeIdElement,
        `Employee ID: ${employeeId}`
    );


    /*
    Optional profile elements.
    These won't cause errors if your HTML
    doesn't contain them.
    */

    const profileName =
        document.getElementById(
            "profileName"
        );

    const profileEmployeeId =
        document.getElementById(
            "profileEmployeeId"
        );


    setText(
        profileName,
        name
    );


    setText(
        profileEmployeeId,
        employeeId
    );
}


/*
=========================================================
 PROFILE MENU
=========================================================
*/

function initializeProfileMenu() {

    if (
        !profileButton ||
        !profileMenu
    ) {

        return;
    }


    profileButton.addEventListener(
        "click",
        (event) => {

            event.stopPropagation();

            profileMenu.classList.toggle(
                "hidden"
            );
        }
    );


    document.addEventListener(
        "click",
        (event) => {

            if (
                !profileMenu.contains(
                    event.target
                ) &&
                !profileButton.contains(
                    event.target
                )
            ) {

                profileMenu.classList.add(
                    "hidden"
                );
            }
        }
    );
}


/*
=========================================================
 GENERIC API RESPONSE PARSER
=========================================================
*/

async function parseApiResponse(response) {

    let data = null;

    try {

        data =
            await response.json();

    } catch (error) {

        data = null;
    }


    if (!response.ok) {

        const message =
            data?.message ||
            `Request failed with status ${response.status}`;

        const apiError =
            new Error(message);

        apiError.status =
            response.status;

        apiError.data =
            data;

        throw apiError;
    }


    if (
        data &&
        data.success === false
    ) {

        const apiError =
            new Error(
                data.message ||
                "Request failed."
            );

        apiError.status =
            response.status;

        apiError.data =
            data;

        throw apiError;
    }


    return data;
}


/*
=========================================================
 DASHBOARD API
=========================================================
*/

async function loadDashboardData(
    options = {}
) {

    const {
        showLoading = true
    } = options;


    if (isDashboardLoading) {

        return;
    }


    isDashboardLoading = true;


    if (showLoading) {

        showDashboardLoading();
    }


    try {

        const response =
            await fetch(
                DASHBOARD_ENDPOINT,
                {
                    method: "GET",
                    credentials: "include",
                    headers: {
                        "Accept":
                            "application/json"
                    },
                    cache: "no-store"
                }
            );


        /*
        Session expired during dashboard
        request.
        */

        if (
            response.status === 401 ||
            response.status === 403
        ) {

            redirectToLogin();

            return;
        }


        const data =
            await parseApiResponse(
                response
            );


        if (
            !data ||
            !data.dashboard
        ) {

            throw new Error(
                "Invalid dashboard response."
            );
        }


        dashboardData =
            normalizeDashboard(
                data.dashboard
            );


        renderDashboard(
            dashboardData
        );


    } catch (error) {

        console.error(
            "Dashboard loading error:",
            error
        );


        if (showLoading) {

            showDashboardError(
                error.message
            );
        }

    } finally {

        isDashboardLoading =
            false;
    }
}


/*
=========================================================
 NORMALIZE DASHBOARD
=========================================================
*/

function normalizeDashboard(
    dashboard
) {

    const stats =
        dashboard.stats || {};


    return {

        stats: {

            assigned:
                safeNumber(
                    stats.assigned
                ),

            pickedUp:
                safeNumber(
                    stats.pickedUp ??
                    stats.picked_up
                ),

            outForDelivery:
                safeNumber(
                    stats.outForDelivery ??
                    stats.out_for_delivery
                ),

            delivered:
                safeNumber(
                    stats.delivered
                )
        },


        currentDelivery:
            dashboard.currentDelivery
                ? normalizeDelivery(
                    dashboard.currentDelivery
                )
                : null,


        todayDeliveries:
            Array.isArray(
                dashboard.todayDeliveries
            )
                ? dashboard.todayDeliveries
                    .map(normalizeDelivery)
                : []
    };
}


/*
=========================================================
 NORMALIZE DELIVERY
=========================================================
*/

function normalizeDelivery(delivery) {
    return {
        // Delivery assignment primary key
        assignmentId:
            delivery.assignmentId ??
            delivery.assignment_id ??
            null,

        // Order database primary key
        orderDbId:
            delivery.orderDbId ??
            delivery.order_db_id ??
            delivery.id ??
            null,

        // Human-readable order ID
        orderId:
            delivery.orderId ??
            delivery.order_id ??
            "—",

        customerName:
            delivery.customerName ??
            delivery.customer_name ??
            delivery.name ??
            "Customer",

        phone:
            delivery.phone ??
            null,

        address:
            delivery.address ??
            "Address unavailable",

        status:
            delivery.status ??
            delivery.delivery_status ??
            "unknown",

        orderStatus:
            delivery.orderStatus ??
            delivery.order_status ??
            null,

        total:
            safeNumber(delivery.total),

        paymentMethod:
            delivery.paymentMethod ??
            delivery.payment_method ??
            null,

        paymentStatus:
            delivery.paymentStatus ??
            delivery.payment_status ??
            null,

        createdAt:
            delivery.createdAt ??
            delivery.created_at ??
            null,

        assignedAt:
            delivery.assignedAt ??
            delivery.assigned_at ??
            null,

        pickedUpAt:
            delivery.pickedUpAt ??
            delivery.picked_up_at ??
            null,

        outForDeliveryAt:
            delivery.outForDeliveryAt ??
            delivery.out_for_delivery_at ??
            null,

        deliveredAt:
            delivery.deliveredAt ??
            delivery.delivered_at ??
            null
    };
}

/*
=========================================================
 RENDER COMPLETE DASHBOARD
=========================================================
*/

function renderDashboard(
    dashboard
) {

    if (!dashboard) {
        return;
    }


    renderStats(
        dashboard.stats
    );


    renderCurrentDelivery(
        dashboard.currentDelivery
    );


    renderTodayDeliveries(
        dashboard.todayDeliveries
    );
}


/*
=========================================================
 RENDER STATISTICS
=========================================================
*/

function renderStats(
    stats
) {

    setText(
        assignedCount,
        stats.assigned
    );


    setText(
        pickedCount,
        stats.pickedUp
    );


    setText(
        transitCount,
        stats.outForDelivery
    );


    setText(
        deliveredCount,
        stats.delivered
    );
}


/*
=========================================================
 CURRENT DELIVERY
=========================================================
*/

function renderCurrentDelivery(
    delivery
) {

    if (!elementExists(currentDelivery)) {
        return;
    }


    if (!delivery) {

        currentDelivery.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">
                    🛵
                </div>

                <h4>
                    No active delivery
                </h4>

                <p>
                    Your assigned delivery will
                    appear here when available.
                </p>
            </div>
        `;

        return;
    }


    currentDelivery.innerHTML =
        createDeliveryCard(
            delivery,
            true
        );
}


/*
=========================================================
 TODAY'S DELIVERIES
=========================================================
*/

function renderTodayDeliveries(
    deliveries
) {

    if (!elementExists(todayDeliveries)) {
        return;
    }


    if (
        !Array.isArray(deliveries) ||
        deliveries.length === 0
    ) {

        todayDeliveries.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">
                    📦
                </div>

                <h4>
                    No deliveries today
                </h4>

                <p>
                    Assigned deliveries will
                    appear here.
                </p>
            </div>
        `;

        return;
    }


    /*
    Keep dashboard compact.
    Full history remains available
    from delivery-list.html.
    */

    todayDeliveries.innerHTML =
        deliveries
            .slice(0, 5)
            .map(
                delivery =>
                    createDeliveryCard(
                        delivery,
                        false
                    )
            )
            .join("");
}


/*
=========================================================
 DELIVERY CARD
=========================================================
*/

function createDeliveryCard(
    delivery,
    isCurrent = false
) {

    const status =
        delivery.status || "unknown";


    const statusClass =
        getStatusClass(status);


    const statusText =
        formatStatus(status);


    const description =
        getStatusDescription(
            status
        );


    const assignmentId = delivery.assignmentId;
    const orderDbId = delivery.orderDbId

    let primaryAction = "";


    /*
    ASSIGNED
    -------------------------------------
    Delivery boy must accept it.
    */

    if (
        status === "assigned"
    ) {

        if (assignmentId) {

            primaryAction = `
                <button
                    type="button"
                    class="delivery-action"
                    data-action="accept"
                    data-assignment-id="${escapeHTML(
                        assignmentId
                    )}"
                >
                    Accept Delivery
                </button>
            `;

        } else {

            primaryAction = `
                <button
                    type="button"
                    class="delivery-action"
                    disabled
                >
                    Assignment Unavailable
                </button>
            `;
        }
    }


    /*
    PICKED UP
    -------------------------------------
    Delivery boy can start route.
    */

    else if (
        status === "picked_up"
    ) {

        if (assignmentId) {

            primaryAction = `
                <button
                    type="button"
                    class="delivery-action"
                    data-action="start"
                    data-assignment-id="${escapeHTML(
                        assignmentId
                    )}"
                >
                    Start Delivery
                </button>
            `;

        } else {

            primaryAction = `
                <button
                    type="button"
                    class="delivery-action"
                    disabled
                >
                    Assignment Unavailable
                </button>
            `;
        }
    }


    /*
    OUT FOR DELIVERY
    -------------------------------------
    Details page handles OTP completion.
    */

    else if (
        status === "out_for_delivery"
    ) {

        primaryAction = `
            <a
                class="delivery-action"
                href="delivery-details.html?id=${encodeURIComponent(
                    assignmentId
                )}"
            >
                Continue Delivery
            </a>
        `;
    }


    /*
    DELIVERED
    */

    else if (
        status === "delivered"
    ) {

        primaryAction = `
            <a
                class="delivery-action secondary"
                href="delivery-details.html?id=${encodeURIComponent(
                    assignmentId
                )}"
            >
                View Details
            </a>
        `;
    }


    /*
    UNKNOWN
    */

    else {

        primaryAction = `
            <a
                class="delivery-action secondary"
                href="delivery-details.html?id=${encodeURIComponent(
                   assignmentId
                )}"
            >
                View Details
            </a>
        `;
    }


    return `
        <article
            class="
                delivery-card
                ${isCurrent ? "current-delivery-card" : ""}
            "
            data-delivery-id="${escapeHTML(
                assignmentId
            )}"
            data-assignment-id="${escapeHTML(
                assignmentId
            )}"
        >

            <div class="delivery-card-top">

                <div class="delivery-card-heading">

                    <div class="delivery-order-id">
                        ${escapeHTML(
                            delivery.orderId
                        )}
                    </div>

                    <div class="delivery-customer">
                        ${escapeHTML(
                            delivery.customerName
                        )}
                    </div>

                </div>


                <span
                    class="
                        delivery-status
                        ${escapeHTML(statusClass)}
                    "
                    title="${escapeHTML(
                        description
                    )}"
                >
                    ${escapeHTML(
                        statusText
                    )}
                </span>

            </div>


            <div class="delivery-card-details">

                <div class="delivery-detail">

                    <span
                        class="delivery-detail-icon"
                        aria-hidden="true"
                    >
                        📍
                    </span>

                    <span>
                        ${escapeHTML(
                            delivery.address
                        )}
                    </span>

                </div>


                ${
                    delivery.phone
                        ? `
                            <div
                                class="delivery-detail"
                            >

                                <span
                                    class="delivery-detail-icon"
                                    aria-hidden="true"
                                >
                                    📞
                                </span>

                                <a
                                    href="tel:${encodeURIComponent(
                                        delivery.phone
                                    )}"
                                >
                                    ${escapeHTML(
                                        delivery.phone
                                    )}
                                </a>

                            </div>
                        `
                        : ""
                }


                <div class="delivery-detail">

                    <span
                        class="delivery-detail-icon"
                        aria-hidden="true"
                    >
                        💰
                    </span>

                    <span>
                        ₹${formatMoney(
                            delivery.total
                        )}
                    </span>

                </div>

            </div>


            <div class="delivery-card-meta">

                <span>
                    ${escapeHTML(
                        description
                    )}
                </span>

                ${
                    delivery.assignedAt
                        ? `
                            <span>
                                Assigned:
                                ${escapeHTML(
                                    formatDate(
                                        delivery.assignedAt
                                    )
                                )}
                            </span>
                        `
                        : ""
                }

            </div>


            <div class="delivery-card-bottom">

                <div class="delivery-card-status-info">

                    ${
                        delivery.paymentStatus
                            ? `
                                <span>
                                    Payment:
                                    ${escapeHTML(
                                        String(
                                            delivery.paymentStatus
                                        )
                                            .replaceAll(
                                                "_",
                                                " "
                                            )
                                    )}
                                </span>
                            `
                            : ""
                    }

                </div>


                <div class="delivery-actions">

                    ${primaryAction}


                    <a
                        class="
                            delivery-action
                            secondary
                        "
                        href="delivery-details.html?id=${encodeURIComponent(
                            assignmentId
                        )}"
                    >
                        View Details
                    </a>

                </div>

            </div>

        </article>
    `;
}


/*
=========================================================
 EVENT DELEGATION
=========================================================
*/

function initializeDeliveryActions() {

    /*
    Dashboard container.
    */

    const containers = [
        currentDelivery,
        todayDeliveries
    ];


    containers.forEach(
        container => {

            if (!container) {
                return;
            }


            container.addEventListener(
                "click",
                async (event) => {

                    const button =
                        event.target.closest(
                            "button[data-action]"
                        );


                    if (!button) {
                        return;
                    }


                    const action =
                        button.dataset.action;


                    const assignmentId =
                        button.dataset.assignmentId;


                    if (!assignmentId) {

                        showToast(
                            "Delivery assignment ID is missing.",
                            "error"
                        );

                        return;
                    }


                    if (
                        action === "accept"
                    ) {

                        await acceptDelivery(
                            assignmentId,
                            button
                        );

                        return;
                    }


                    if (
                        action === "start"
                    ) {

                        await startDelivery(
                            assignmentId,
                            button
                        );

                        return;
                    }

                }
            );
        }
    );
}


/*
=========================================================
 ACCEPT DELIVERY
=========================================================
*/

async function acceptDelivery(
    assignmentId,
    button = null
) {

    const actionKey =
        `accept:${assignmentId}`;


    /*
    Prevent duplicate requests.
    */

    if (
        actionInProgress.has(
            actionKey
        )
    ) {

        return;
    }


    actionInProgress.add(
        actionKey
    );


    const originalText =
        button
            ? button.textContent
            : "Accept Delivery";


    if (button) {

        button.disabled = true;

        button.textContent =
            "Accepting...";
    }


    try {

        const response =
            await fetch(
                ACCEPT_ENDPOINT(
                    assignmentId
                ),
                {
                    method: "PATCH",
                    credentials: "include",
                    headers: {
                        "Accept":
                            "application/json"
                    }
                }
            );


        if (
            response.status === 401 ||
            response.status === 403
        ) {

            redirectToLogin();

            return;
        }


        const data =
            await parseApiResponse(
                response
            );


        showToast(
            data.message ||
            "Delivery accepted successfully.",
            "success"
        );


        /*
        Immediately reload the dashboard
        so status becomes picked_up.
        */

        await loadDashboardData({
            showLoading: false
        });


    } catch (error) {

        console.error(
            "Accept delivery error:",
            error
        );


        showToast(
            error.message ||
            "Unable to accept delivery.",
            "error"
        );


        if (button) {

            button.disabled = false;

            button.textContent =
                originalText;
        }

    } finally {

        actionInProgress.delete(
            actionKey
        );
    }
}


/*
=========================================================
 START DELIVERY
=========================================================
*/

async function startDelivery(
    assignmentId,
    button = null
) {

    const actionKey =
        `start:${assignmentId}`;


    /*
    Prevent duplicate requests.
    */

    if (
        actionInProgress.has(
            actionKey
        )
    ) {

        return;
    }


    actionInProgress.add(
        actionKey
    );


    const originalText =
        button
            ? button.textContent
            : "Start Delivery";


    if (button) {

        button.disabled = true;

        button.textContent =
            "Starting...";
    }


    try {

        const response =
            await fetch(
                START_ENDPOINT(
                    assignmentId
                ),
                {
                    method: "PATCH",
                    credentials: "include",
                    headers: {
                        "Accept":
                            "application/json"
                    }
                }
            );


        if (
            response.status === 401 ||
            response.status === 403
        ) {

            redirectToLogin();

            return;
        }


        const data =
            await parseApiResponse(
                response
            );


        showToast(
            data.message ||
            "Delivery started successfully.",
            "success"
        );


        /*
        Status should now be:
            out_for_delivery
        */

        await loadDashboardData({
            showLoading: false
        });


    } catch (error) {

        console.error(
            "Start delivery error:",
            error
        );


        showToast(
            error.message ||
            "Unable to start delivery.",
            "error"
        );


        if (button) {

            button.disabled = false;

            button.textContent =
                originalText;
        }

    } finally {

        actionInProgress.delete(
            actionKey
        );
    }
}


/*
=========================================================
 LOADING STATE
=========================================================
*/

function showDashboardLoading() {

    if (elementExists(currentDelivery)) {

        currentDelivery.innerHTML = `
            <div class="loading-card">

                <div
                    class="loading-spinner"
                    aria-hidden="true"
                ></div>

                <span>
                    Loading current delivery...
                </span>

            </div>
        `;
    }


    if (elementExists(todayDeliveries)) {

        todayDeliveries.innerHTML = `
            <div class="loading-card">

                <div
                    class="loading-spinner"
                    aria-hidden="true"
                ></div>

                <span>
                    Loading deliveries...
                </span>

            </div>
        `;
    }


    /*
    Reset statistics while loading.
    */

    setText(
        assignedCount,
        "—"
    );

    setText(
        pickedCount,
        "—"
    );

    setText(
        transitCount,
        "—"
    );

    setText(
        deliveredCount,
        "—"
    );
}


/*
=========================================================
 ERROR STATE
=========================================================
*/

function showDashboardError(
    message = ""
) {

    const safeMessage =
        message ||
        "Unable to load deliveries.";


    if (elementExists(currentDelivery)) {

        currentDelivery.innerHTML = `
            <div class="empty-state">

                <div class="empty-icon">
                    ⚠️
                </div>

                <h4>
                    Couldn't load dashboard
                </h4>

                <p>
                    ${escapeHTML(
                        safeMessage
                    )}
                </p>

                <button
                    type="button"
                    class="delivery-action"
                    id="retryDashboardButton"
                >
                    Try Again
                </button>

            </div>
        `;


        const retryButton =
            document.getElementById(
                "retryDashboardButton"
            );


        if (retryButton) {

            retryButton.addEventListener(
                "click",
                () => {

                    loadDashboardData({
                        showLoading: true
                    });

                }
            );
        }
    }


    if (elementExists(todayDeliveries)) {

        todayDeliveries.innerHTML = `
            <div class="empty-state">

                <div class="empty-icon">
                    ⚠️
                </div>

                <h4>
                    Deliveries unavailable
                </h4>

                <p>
                    Please try again.
                </p>

            </div>
        `;
    }
}


/*
=========================================================
 TOAST SYSTEM
=========================================================
*/

function showToast(
    message,
    type = "info"
) {

    /*
    If the project already has a toast system,
    use it instead.
    */

    if (
        typeof window.showToast === "function" &&
        window.showToast !== showToast
    ) {

        window.showToast(
            message,
            type
        );

        return;
    }


    let container =
        document.getElementById(
            "deliveryToastContainer"
        );


    if (!container) {

        container =
            document.createElement(
                "div"
            );

        container.id =
            "deliveryToastContainer";

        container.className =
            "delivery-toast-container";

        document.body.appendChild(
            container
        );
    }


    const toast =
        document.createElement(
            "div"
        );


    toast.className =
        `delivery-toast ${type}`;


    toast.textContent =
        String(message);


    container.appendChild(
        toast
    );


    requestAnimationFrame(
        () => {

            toast.classList.add(
                "show"
            );
        }
    );


    setTimeout(
        () => {

            toast.classList.remove(
                "show"
            );


            setTimeout(
                () => {

                    toast.remove();

                },
                300
            );

        },
        3500
    );
}


/*
=========================================================
 LOGOUT
=========================================================
*/

async function logout() {

    if (isLoggingOut) {
        return;
    }


    isLoggingOut = true;


    if (logoutButton) {

        logoutButton.disabled =
            true;

        logoutButton.textContent =
            "Logging out...";
    }


    stopAutoRefresh();


    try {

        const response =
            await fetch(
                LOGOUT_ENDPOINT,
                {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "Accept":
                            "application/json"
                    }
                }
            );


        /*
        Even if the server says the session
        is already gone, redirecting to login
        is the correct final state.
        */

        if (
            response.ok ||
            response.status === 401 ||
            response.status === 403
        ) {

            window.location.href =
                "login.html";

            return;
        }


        const data =
            await response.json()
                .catch(
                    () => ({})
                );


        throw new Error(
            data.message ||
            "Logout failed."
        );


    } catch (error) {

        console.error(
            "Logout error:",
            error
        );


        showToast(
            error.message ||
            "Unable to logout. Please try again.",
            "error"
        );


        isLoggingOut =
            false;


        if (logoutButton) {

            logoutButton.disabled =
                false;

            logoutButton.textContent =
                "Logout";
        }


        /*
        If logout failed, restart
        automatic refresh.
        */

        startAutoRefresh();
    }
}


/*
=========================================================
 LOGOUT EVENT
=========================================================
*/

function initializeLogout() {

    if (!logoutButton) {
        return;
    }


    logoutButton.addEventListener(
        "click",
        async (event) => {

            event.preventDefault();

            await logout();
        }
    );
}


/*
=========================================================
 AUTO REFRESH
=========================================================
*/

function startAutoRefresh() {

    if (
        REFRESH_INTERVAL <= 0
    ) {

        return;
    }


    stopAutoRefresh();


    refreshTimer =
        setInterval(
            async () => {

                /*
                Don't refresh while:
                - another request is running
                - user is logging out
                - browser tab is hidden
                */

                if (
                    isDashboardLoading ||
                    isLoggingOut ||
                    document.hidden
                ) {

                    return;
                }


                await loadDashboardData({
                    showLoading: false
                });

            },
            REFRESH_INTERVAL
        );
}


function stopAutoRefresh() {

    if (refreshTimer) {

        clearInterval(
            refreshTimer
        );

        refreshTimer = null;
    }
}


/*
=========================================================
 PAGE VISIBILITY
=========================================================
*/

function initializeVisibilityHandling() {

    document.addEventListener(
        "visibilitychange",
        async () => {

            /*
            User returned to the dashboard.
            Immediately refresh current data.
            */

            if (
                !document.hidden &&
                !isDashboardLoading &&
                !isLoggingOut
            ) {

                await loadDashboardData({
                    showLoading: false
                });
            }

        }
    );
}


/*
=========================================================
 ONLINE / OFFLINE HANDLING
=========================================================
*/

function initializeNetworkHandling() {

    window.addEventListener(
        "offline",
        () => {

            showToast(
                "You are offline. Dashboard updates are paused.",
                "error"
            );
        }
    );


    window.addEventListener(
        "online",
        async () => {

            showToast(
                "Connection restored.",
                "success"
            );


            await loadDashboardData({
                showLoading: false
            });
        }
    );
}


/*
=========================================================
 BEFORE UNLOAD
=========================================================
*/

window.addEventListener(
    "beforeunload",
    () => {

        stopAutoRefresh();
    }
);


/*
=========================================================
 INITIALIZATION
=========================================================
*/

async function initializeDashboard() {

    try {

        /*
        Initialize UI behavior first.
        */

        initializeProfileMenu();

        initializeLogout();

        initializeDeliveryActions();

        initializeVisibilityHandling();

        initializeNetworkHandling();


        /*
        Authenticate first.
        Never load delivery data before
        authentication succeeds.
        */

        const user =
            await loadCurrentUser();


        if (!user) {

            return;
        }


        /*
        Render logged-in delivery user.
        */

        renderUser(
            user
        );


        /*
        Load dashboard data.
        */

        await loadDashboardData({
            showLoading: true
        });


        /*
        Start background refresh only
        after successful initialization.
        */

        startAutoRefresh();


    } catch (error) {

        console.error(
            "Dashboard initialization error:",
            error
        );


        showDashboardError(
            "Unable to initialize dashboard."
        );
    }
}


/*
=========================================================
 START APPLICATION
=========================================================
*/

if (
    document.readyState === "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        initializeDashboard
    );

} else {

    initializeDashboard();
}