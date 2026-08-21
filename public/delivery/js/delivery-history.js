const historyList =
    document.getElementById("historyList");

const historyPagination =
    document.getElementById(
        "historyPagination"
    );

const completedCount =
    document.getElementById(
        "completedCount"
    );

const profileButton =
    document.getElementById(
        "profileButton"
    );

const profileMenu =
    document.getElementById(
        "profileMenu"
    );

const logoutButton =
    document.getElementById(
        "logoutButton"
    );


/* =================================
   STATE
================================= */

let currentPage = 1;

const PAGE_LIMIT = 10;


/* =================================
   PROFILE MENU
================================= */

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


/* =================================
   AUTH CHECK
================================= */

async function checkAuthentication() {

    try {

        const response =
            await fetch(
                "/api/delivery/auth/me",
                {
                    method: "GET",
                    credentials: "include"
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


/* =================================
   LOAD HISTORY
================================= */

async function loadHistory() {

    showLoading();


    try {

        const params =
            new URLSearchParams();


        params.set(
            "page",
            currentPage
        );


        params.set(
            "limit",
            PAGE_LIMIT
        );


        params.set(
            "status",
            "delivered"
        );


        const response = await fetch(
            `/api/delivery/assignments?${params.toString()}`,
            {
                method: "GET",
                credentials: "include",
                headers: {
                    Accept: "application/json"
                },
                cache: "no-store"
            }
        );


        const data =
            await response.json();


        if (
            !response.ok ||
            !data.success
        ) {

            throw new Error(
                data.message ||
                "Unable to load history."
            );
        }


        const deliveries = data.assignments || [];
        renderHistory(deliveries);


        updateCompletedCount(
            data.pagination
        );


        renderPagination(
            data.pagination
        );


    } catch (error) {

        console.error(
            "History loading error:",
            error
        );

        showError();
    }
}


/* =================================
   RENDER HISTORY
================================= */

function renderHistory(
    deliveries
) {

    if (!deliveries.length) {

        historyList.innerHTML = `
            <div class="history-empty">

                <div class="history-empty-icon">
                    🕘
                </div>

                <h3>
                    No completed deliveries
                </h3>

                <p>
                    Your completed deliveries
                    will appear here.
                </p>

            </div>
        `;

        return;
    }


    historyList.innerHTML =
        deliveries
            .map(
                createHistoryCard
            )
            .join("");
}


/* =================================
   HISTORY CARD
================================= */

function createHistoryCard(
    delivery
) {

    return `
        <article class="history-card">

            <div class="history-card-top">

                <div>

                    <div class="history-order-id">
                        ${escapeHTML(
                            delivery.orderId
                        )}
                    </div>

                    <div class="history-customer">
                        ${escapeHTML(
                            delivery.customerName ||
                            "Customer"
                        )}
                    </div>

                </div>


                <span class="history-status">
                    Delivered ✓
                </span>

            </div>


            <div class="history-info">

                <div class="history-info-row">

                    <span class="history-info-icon">
                        📍
                    </span>

                    <span>
                        ${escapeHTML(
                            delivery.address ||
                            "Address unavailable"
                        )}
                    </span>

                </div>


                <div class="history-info-row">

                    <span class="history-info-icon">
                        🕘
                    </span>

                    <span>
                        ${formatDate(
                            delivery.deliveredAt
                        )}
                    </span>

                </div>

            </div>


            <div class="history-card-footer">

                <span class="history-total">
                    ${formatCurrency(
                        delivery.total
                    )}
                </span>


                <a
                    href="
                        delivery-details.html?id=${
                            encodeURIComponent(
                                delivery.assignmentId
                            )
                        }
                    "
                    class="history-view-button"
                >
                    View Details
                </a>

            </div>

        </article>
    `;
}


/* =================================
   COMPLETED COUNT
================================= */

function updateCompletedCount(
    paginationData
) {

    if (!paginationData) {

        completedCount.textContent =
            "0";

        return;
    }


    /*
     * Supports either:
     *
     * total
     * totalItems
     */

    const total =
        Number(
            paginationData.total ??
            paginationData.totalItems ??
            0
        );


    completedCount.textContent =
        total.toLocaleString("en-IN");
}


/* =================================
   PAGINATION
================================= */

function renderPagination(
    paginationData
) {

    historyPagination.innerHTML =
        "";


    if (!paginationData) {
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


    if (totalPages <= 1) {
        return;
    }


    const previousButton =
        document.createElement(
            "button"
        );

    previousButton.textContent =
        "‹";

    previousButton.disabled =
        page <= 1;


    previousButton.addEventListener(
        "click",
        () => {

            currentPage =
                page - 1;

            loadHistory();

            scrollToTop();

        }
    );


    historyPagination.appendChild(
        previousButton
    );


    for (
        let pageNumber = 1;
        pageNumber <= totalPages;
        pageNumber++
    ) {

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


        button.textContent =
            pageNumber;


        button.classList.toggle(
            "active",
            pageNumber === page
        );


        button.addEventListener(
            "click",
            () => {

                currentPage =
                    pageNumber;

                loadHistory();

                scrollToTop();

            }
        );


        historyPagination.appendChild(
            button
        );
    }


    const nextButton =
        document.createElement(
            "button"
        );


    nextButton.textContent =
        "›";


    nextButton.disabled =
        page >= totalPages;


    nextButton.addEventListener(
        "click",
        () => {

            currentPage =
                page + 1;

            loadHistory();

            scrollToTop();

        }
    );


    historyPagination.appendChild(
        nextButton
    );
}


/* =================================
   LOADING
================================= */

function showLoading() {

    historyList.innerHTML = `
        <div class="loading-card">

            <div class="loading-spinner"></div>

            <span>
                Loading history...
            </span>

        </div>
    `;
}


/* =================================
   ERROR
================================= */

function showError() {

    historyList.innerHTML = `
        <div class="history-empty">

            <div class="history-empty-icon">
                ⚠️
            </div>

            <h3>
                Couldn't load history
            </h3>

            <p>
                Please refresh the page
                and try again.
            </p>

        </div>
    `;
}


/* =================================
   DATE
================================= */

function formatDate(
    value
) {

    if (!value) {
        return "Date unavailable";
    }


    const date =
        new Date(value);


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return "Date unavailable";
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


/* =================================
   CURRENCY
================================= */

function formatCurrency(
    value
) {

    return Number(
        value || 0
    ).toLocaleString(
        "en-IN",
        {
            style: "currency",
            currency: "INR"
        }
    );
}


/* =================================
   HTML ESCAPE
================================= */

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


/* =================================
   SCROLL
================================= */

function scrollToTop() {

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


/* =================================
   LOGOUT
================================= */

logoutButton.addEventListener(
    "click",
    async () => {

        logoutButton.disabled = true;


        try {

            const response =
                await fetch(
                    "/api/delivery/auth/logout",
                    {
                        method: "POST",

                        credentials: "include"
                    }
                );


            if (!response.ok) {

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


/* =================================
   INITIALIZE
================================= */

async function initialize() {

    const authenticated =
        await checkAuthentication();


    if (!authenticated) {
        return;
    }


    await loadHistory();
}


initialize();