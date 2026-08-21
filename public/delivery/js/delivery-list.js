"use strict";

/*
=========================================================
 COFFEECAPE DELIVERY LIST
=========================================================

Responsibilities:

1. Verify delivery-boy authentication
2. Protect page from unauthenticated access
3. Load delivery assignments
4. Filter deliveries by status
5. Render delivery cards
6. Open delivery details using assignmentId
7. Handle pagination
8. Handle logout
9. Handle loading / empty / error states
10. Escape dynamic HTML

IMPORTANT ID RULE:

assignmentId
    -> Delivery assignment ID
    -> Used for:
       - delivery-details.html?id=
       - GET /api/delivery/:assignmentId

orderDbId
    -> Database order ID
    -> Used by OTP APIs only

orderId
    -> Human-readable order number
=========================================================
*/


/* =====================================================
   DOM ELEMENTS
===================================================== */

const deliveryList =
    document.getElementById("deliveryList");

const pagination =
    document.getElementById("pagination");

const filterButtons =
    document.querySelectorAll(".filter-button");

const profileButton =
    document.getElementById("profileButton");

const profileMenu =
    document.getElementById("profileMenu");

const logoutButton =
    document.getElementById("logoutButton");


/* =====================================================
   STATE
===================================================== */

let currentStatus = "all";

let currentPage = 1;

const PAGE_LIMIT = 10;


/* =====================================================
   SAFE DOM CHECK
===================================================== */

function elementExists(element) {
    return (
        element !== null &&
        element !== undefined
    );
}


/* =====================================================
   PROFILE MENU
===================================================== */

if (
    elementExists(profileButton) &&
    elementExists(profileMenu)
) {

    profileButton.addEventListener(
        "click",
        () => {

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


/* =====================================================
   AUTHENTICATION CHECK
===================================================== */

async function checkAuthentication() {

    try {

        const response =
            await fetch(
                "/api/delivery/auth/me",
                {
                    method: "GET",
                    credentials: "include",
                    headers: {
                        Accept:
                            "application/json"
                    },
                    cache: "no-store"
                }
            );


        if (!response.ok) {

            window.location.href =
                "login.html";

            return false;
        }


        const data =
            await response.json();


        if (
            !data.success ||
            !data.user
        ) {

            window.location.href =
                "login.html";

            return false;
        }


        /*
        Force password change protection.
        */

        if (
            data.user.forcePasswordChange
        ) {

            window.location.href =
                "change-password.html";

            return false;
        }


        return true;

    } catch (error) {

        console.error(
            "Authentication check failed:",
            error
        );


        window.location.href =
            "login.html";


        return false;
    }
}


/* =====================================================
   LOAD DELIVERIES
===================================================== */

async function loadDeliveries() {

    showLoading();


    try {

        const params =
            new URLSearchParams();


        params.set(
            "page",
            String(currentPage)
        );


        params.set(
            "limit",
            String(PAGE_LIMIT)
        );


        /*
        Only send status when
        "all" is not selected.
        */

        if (
            currentStatus !== "all"
        ) {

            params.set(
                "status",
                currentStatus
            );

        }


        const response =
            await fetch(
                `/api/delivery/assignments?${params.toString()}`,
                {
                    method: "GET",
                    credentials: "include",
                    headers: {
                        Accept:
                            "application/json"
                    },
                    cache: "no-store"
                }
            );


        /*
        Handle expired session.
        */

        if (
            response.status === 401 ||
            response.status === 403
        ) {

            window.location.href =
                "login.html";

            return;
        }


        const data =
            await response.json();


        if (
            !response.ok ||
            !data.success
        ) {

            throw new Error(
                data.message ||
                "Unable to load deliveries."
            );
        }


        const deliveries =
            Array.isArray(
                data.assignments
            )
                ? data.assignments
                : [];


        renderDeliveries(
            deliveries
        );


        renderPagination(
            data.pagination
        );


    } catch (error) {

        console.error(
            "Delivery list error:",
            error
        );


        showError();
    }
}


/* =====================================================
   RENDER DELIVERIES
===================================================== */

function renderDeliveries(
    deliveries
) {

    if (
        !Array.isArray(deliveries) ||
        deliveries.length === 0
    ) {

        deliveryList.innerHTML = `
            <div class="delivery-empty">

                <div class="delivery-empty-icon">
                    📦
                </div>

                <h3>
                    No deliveries found
                </h3>

                <p>
                    There are no deliveries matching
                    the selected filter.
                </p>

            </div>
        `;

        return;
    }


    deliveryList.innerHTML =
        deliveries
            .map(
                createDeliveryCard
            )
            .join("");
}


/* =====================================================
   DELIVERY CARD
===================================================== */

function createDeliveryCard(
    delivery
) {

    /*
    -----------------------------------------------------
    IMPORTANT
    -----------------------------------------------------

    The details page expects:

        delivery-details.html?id=assignmentId

    Therefore NEVER use:

        delivery.id
        delivery.orderDbId
        delivery.orderId

    here for the details URL.

    Use:

        delivery.assignmentId
    -----------------------------------------------------
    */


    const assignmentId =
        delivery.assignmentId ??
        delivery.assignment_id ??
        null;


    const orderId =
        delivery.orderId ??
        delivery.order_id ??
        "—";


    const customerName =
        delivery.customerName ??
        delivery.customer_name ??
        delivery.name ??
        "Customer";


    const status =
        String(
            delivery.status ??
            delivery.delivery_status ??
            ""
        );


    const address =
        delivery.address ??
        "Address unavailable";


    const phone =
        delivery.phone ??
        null;


    const total =
        delivery.total ??
        0;


    /*
    -----------------------------------------------------
    Details URL
    -----------------------------------------------------

    assignmentId is the ONLY ID used here.
    -----------------------------------------------------
    */

    const detailsUrl =
        assignmentId
            ? `delivery-details.html?id=${encodeURIComponent(
                  assignmentId
              )}`
            : "#";


    return `
        <article
            class="delivery-list-card"
        >

            <!-- =========================================
                 TOP
            ========================================== -->

            <div class="delivery-list-top">

                <div>

                    <div
                        class="delivery-list-order"
                    >
                        ${escapeHTML(
                            orderId
                        )}
                    </div>


                    <div
                        class="delivery-list-customer"
                    >
                        ${escapeHTML(
                            customerName
                        )}
                    </div>

                </div>


                <span
                    class="
                        delivery-list-status
                        ${escapeHTML(status)}
                    "
                >
                    ${escapeHTML(
                        formatStatus(status)
                    )}
                </span>

            </div>


            <!-- =========================================
                 DETAILS
            ========================================== -->

            <div
                class="delivery-list-details"
            >

                <!-- ADDRESS -->

                <div
                    class="delivery-detail-row"
                >

                    <span
                        class="delivery-detail-icon"
                        aria-hidden="true"
                    >
                        📍
                    </span>

                    <span>
                        ${escapeHTML(
                            address
                        )}
                    </span>

                </div>


                <!-- PHONE -->

                ${
                    phone
                        ? `
                            <div
                                class="delivery-detail-row"
                            >

                                <span
                                    class="delivery-detail-icon"
                                    aria-hidden="true"
                                >
                                    📞
                                </span>

                                <a
                                    href="tel:${encodeURIComponent(
                                        phone
                                    )}"
                                >
                                    ${escapeHTML(
                                        phone
                                    )}
                                </a>

                            </div>
                        `
                        : ""
                }

            </div>


            <!-- =========================================
                 FOOTER
            ========================================== -->

            <div
                class="delivery-list-footer"
            >

                <span
                    class="delivery-total"
                >
                    ₹${formatMoney(total)}
                </span>


                ${
                    assignmentId
                        ? `
                            <a
                                href="${detailsUrl}"
                                class="delivery-view-button"
                            >
                                View Details
                            </a>
                        `
                        : `
                            <button
                                type="button"
                                class="delivery-view-button"
                                disabled
                            >
                                Details Unavailable
                            </button>
                        `
                }

            </div>

        </article>
    `;
}


/* =====================================================
   STATUS FORMAT
===================================================== */

function formatStatus(
    status
) {

    const statusMap = {

        /*
        Backend assignment status
        */

        assigned:
            "Assigned",

        accepted:
            "Accepted",

        picked_up:
            "Picked Up",

        out_for_delivery:
            "Out for Delivery",

        delivered:
            "Delivered",


        /*
        Compatibility with
        existing order statuses.
        */

        confirmed:
            "Assigned",

        preparing:
            "Preparing"

    };


    const normalized =
        String(
            status || ""
        ).toLowerCase();


    if (
        statusMap[normalized]
    ) {

        return statusMap[
            normalized
        ];
    }


    return normalized
        .replaceAll(
            "_",
            " "
        )
        .replace(
            /\b\w/g,
            char =>
                char.toUpperCase()
        );
}


/* =====================================================
   MONEY
===================================================== */

function formatMoney(
    value
) {

    const amount =
        Number(value || 0);


    return amount.toLocaleString(
        "en-IN",
        {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }
    );
}


/* =====================================================
   PAGINATION
===================================================== */

function renderPagination(
    paginationData
) {

    if (
        !elementExists(pagination)
    ) {
        return;
    }


    pagination.innerHTML =
        "";


    if (
        !paginationData
    ) {
        return;
    }


    const page =
        Number(
            paginationData.page || 1
        );


    const totalPages =
        Number(
            paginationData.totalPages || 1
        );


    if (
        totalPages <= 1
    ) {
        return;
    }


    /* =========================================
       PREVIOUS
    ========================================== */

    const previousButton =
        document.createElement(
            "button"
        );


    previousButton.type =
        "button";


    previousButton.textContent =
        "‹";


    previousButton.disabled =
        page <= 1;


    previousButton.setAttribute(
        "aria-label",
        "Previous page"
    );


    previousButton.addEventListener(
        "click",
        () => {

            if (
                page <= 1
            ) {
                return;
            }


            currentPage =
                page - 1;


            loadDeliveries();


            window.scrollTo({
                top: 0,
                behavior: "smooth"
            });

        }
    );


    pagination.appendChild(
        previousButton
    );


    /* =========================================
       PAGE NUMBERS
    ========================================== */

    for (
        let pageNumber = 1;
        pageNumber <= totalPages;
        pageNumber++
    ) {

        /*
        Avoid huge pagination lists.
        */

        if (
            totalPages > 7 &&
            Math.abs(
                pageNumber - page
            ) > 2 &&
            pageNumber !== 1 &&
            pageNumber !== totalPages
        ) {

            continue;
        }


        const button =
            document.createElement(
                "button"
            );


        button.type =
            "button";


        button.textContent =
            String(pageNumber);


        button.classList.toggle(
            "active",
            pageNumber === page
        );


        button.setAttribute(
            "aria-label",
            `Page ${pageNumber}`
        );


        if (
            pageNumber === page
        ) {

            button.setAttribute(
                "aria-current",
                "page"
            );

        }


        button.addEventListener(
            "click",
            () => {

                if (
                    pageNumber === page
                ) {
                    return;
                }


                currentPage =
                    pageNumber;


                loadDeliveries();


                window.scrollTo({
                    top: 0,
                    behavior: "smooth"
                });

            }
        );


        pagination.appendChild(
            button
        );
    }


    /* =========================================
       NEXT
    ========================================== */

    const nextButton =
        document.createElement(
            "button"
        );


    nextButton.type =
        "button";


    nextButton.textContent =
        "›";


    nextButton.disabled =
        page >= totalPages;


    nextButton.setAttribute(
        "aria-label",
        "Next page"
    );


    nextButton.addEventListener(
        "click",
        () => {

            if (
                page >= totalPages
            ) {
                return;
            }


            currentPage =
                page + 1;


            loadDeliveries();


            window.scrollTo({
                top: 0,
                behavior: "smooth"
            });

        }
    );


    pagination.appendChild(
        nextButton
    );
}


/* =====================================================
   FILTERS
===================================================== */

filterButtons.forEach(
    (button) => {

        button.addEventListener(
            "click",
            () => {

                /*
                Remove active state
                from all filters.
                */

                filterButtons.forEach(
                    item => {

                        item.classList.remove(
                            "active"
                        );

                    }
                );


                /*
                Activate clicked filter.
                */

                button.classList.add(
                    "active"
                );


                /*
                Read filter status.
                */

                currentStatus =
                    button.dataset.status ||
                    "all";


                /*
                Reset pagination.
                */

                currentPage =
                    1;


                /*
                Reload deliveries.
                */

                loadDeliveries();

            }
        );

    }
);


/* =====================================================
   LOADING STATE
===================================================== */

function showLoading() {

    if (
        !elementExists(deliveryList)
    ) {
        return;
    }


    deliveryList.innerHTML = `
        <div class="loading-card">

            <div
                class="loading-spinner"
            ></div>

            <span>
                Loading deliveries...
            </span>

        </div>
    `;
}


/* =====================================================
   ERROR STATE
===================================================== */

function showError() {

    if (
        !elementExists(deliveryList)
    ) {
        return;
    }


    deliveryList.innerHTML = `
        <div class="delivery-empty">

            <div
                class="delivery-empty-icon"
            >
                ⚠️
            </div>

            <h3>
                Couldn't load deliveries
            </h3>

            <p>
                Please refresh the page and try again.
            </p>

        </div>
    `;
}


/* =====================================================
   HTML ESCAPE
===================================================== */

function escapeHTML(
    value
) {

    return String(
        value ?? ""
    )
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );
}


/* =====================================================
   LOGOUT
===================================================== */

if (
    elementExists(logoutButton)
) {

    logoutButton.addEventListener(
        "click",
        async () => {

            logoutButton.disabled =
                true;


            try {

                const response =
                    await fetch(
                        "/api/delivery/auth/logout",
                        {
                            method: "POST",
                            credentials: "include",
                            headers: {
                                Accept:
                                    "application/json"
                            }
                        }
                    );


                if (
                    !response.ok
                ) {

                    throw new Error(
                        "Logout failed."
                    );
                }


                window.location.href =
                    "login.html";


            } catch (error) {

                console.error(
                    "Logout error:",
                    error
                );


                logoutButton.disabled =
                    false;


                alert(
                    "Unable to logout. Please try again."
                );

            }

        }
    );

}


/* =====================================================
   INITIALIZE
===================================================== */

async function initialize() {

    const authenticated =
        await checkAuthentication();


    if (
        !authenticated
    ) {
        return;
    }


    await loadDeliveries();
}


/* =====================================================
   START
===================================================== */

initialize();