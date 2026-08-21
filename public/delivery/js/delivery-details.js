"use strict";

/*
=========================================================
 COFFEECAPE DELIVERY DETAILS
=========================================================

ID SYSTEM
---------------------------------------------------------

URL:
    delivery-details.html?id=ASSIGNMENT_ID

assignmentId:
    Used for:
        GET   /api/delivery/:assignmentId
        PATCH /api/delivery/:assignmentId/accept
        PATCH /api/delivery/:assignmentId/start

orderDbId:
    Used ONLY for:
        POST /api/delivery/:orderDbId/send-otp
        POST /api/delivery/:orderDbId/verify-otp

orderId:
    Human-readable order number.

=========================================================
*/


/* =====================================================
   URL
===================================================== */

const params =
    new URLSearchParams(
        window.location.search
    );


/*
The URL contains ASSIGNMENT ID.

Example:

delivery-details.html?id=12
*/

const assignmentId =
    params.get("id");


/* =====================================================
   DOM ELEMENTS
===================================================== */

const otpModal =
    document.getElementById(
        "otpModal"
    );

const closeOtpModal =
    document.getElementById(
        "closeOtpModal"
    );

const cancelOtpButton =
    document.getElementById(
        "cancelOtpButton"
    );

const sendDeliveryOtpButton =
    document.getElementById(
        "sendDeliveryOtpButton"
    );

const otpSentMessage =
    document.getElementById(
        "otpSentMessage"
    );

const otpVerificationSection =
    document.getElementById(
        "otpVerificationSection"
    );

const deliveryOtp =
    document.getElementById(
        "deliveryOtp"
    );

const deliveryOtpError =
    document.getElementById(
        "deliveryOtpError"
    );

const verifyDeliveryOtpButton =
    document.getElementById(
        "verifyDeliveryOtpButton"
    );

const pageLoading =
    document.getElementById(
        "pageLoading"
    );

const pageError =
    document.getElementById(
        "pageError"
    );

const errorMessage =
    document.getElementById(
        "errorMessage"
    );

const retryButton =
    document.getElementById(
        "retryButton"
    );

const detailsContent =
    document.getElementById(
        "detailsContent"
    );

const headerOrderId =
    document.getElementById(
        "headerOrderId"
    );

const orderStatus =
    document.getElementById(
        "orderStatus"
    );

const statusDescription =
    document.getElementById(
        "statusDescription"
    );

const orderIdElement =
    document.getElementById(
        "orderId"
    );

const orderDate =
    document.getElementById(
        "orderDate"
    );

const paymentStatus =
    document.getElementById(
        "paymentStatus"
    );

const paymentMethod =
    document.getElementById(
        "paymentMethod"
    );

const orderTotal =
    document.getElementById(
        "orderTotal"
    );

const customerName =
    document.getElementById(
        "customerName"
    );

const callCustomerButton =
    document.getElementById(
        "callCustomerButton"
    );

const deliveryAddress =
    document.getElementById(
        "deliveryAddress"
    );

const orderItems =
    document.getElementById(
        "orderItems"
    );

const itemsTotal =
    document.getElementById(
        "itemsTotal"
    );

const deliveryActionButton =
    document.getElementById(
        "deliveryActionButton"
    );

const backButton =
    document.getElementById(
        "backButton"
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


/* =====================================================
   STATE
===================================================== */

let currentDelivery =
    null;

let isLoadingDelivery =
    false;

let actionInProgress =
    false;


/* =====================================================
   SAFE ELEMENT CHECK
===================================================== */

function elementExists(
    element
) {

    return (
        element !== null &&
        element !== undefined
    );
}


/* =====================================================
   AUTHENTICATION
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


        if (
            response.status === 401 ||
            response.status === 403
        ) {

            window.location.href =
                "login.html";

            return false;
        }


        if (
            !response.ok
        ) {

            throw new Error(
                "Authentication check failed."
            );
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


/* =====================================================
   BACK BUTTON
===================================================== */

if (
    elementExists(backButton)
) {

    backButton.addEventListener(
        "click",
        () => {

            if (
                document.referrer &&
                document.referrer.includes(
                    window.location.origin
                )
            ) {

                history.back();

                return;
            }


            window.location.href =
                "delivery-list.html";
        }
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
   LOAD DELIVERY DETAILS
===================================================== */

async function loadDeliveryDetails() {

    /*
    Prevent duplicate loading.
    */

    if (
        isLoadingDelivery
    ) {
        return;
    }


    /*
    URL ID is assignment ID.
    */

    if (
        !assignmentId
    ) {

        showError(
            "No delivery was specified."
        );

        return;
    }


    isLoadingDelivery =
        true;


    showLoading();


    try {

        const response =
            await fetch(
                `/api/delivery/${encodeURIComponent(
                    assignmentId
                )}`,
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
        Session expired.
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
                "Unable to load delivery."
            );
        }


        if (
            !data.assignment
        ) {

            throw new Error(
                "Delivery data was not returned."
            );
        }


        /*
        Store the complete delivery object.

        NOTE: the backend (GET /api/delivery/:id)
        returns this payload under `assignment`,
        not `delivery`.

        This contains:

        assignmentId
        orderDbId
        orderId
        status
        customerName
        etc.
        */

        currentDelivery =
            data.assignment;


        renderDelivery(
            currentDelivery
        );


    } catch (error) {

        console.error(
            "Delivery details error:",
            error
        );


        showError(
            error.message ||
            "Unable to load delivery."
        );

    } finally {

        isLoadingDelivery =
            false;
    }
}


/* =====================================================
   RENDER DELIVERY
===================================================== */

function renderDelivery(
    delivery
) {

    if (
        !delivery
    ) {
        showError(
            "Delivery information is unavailable."
        );

        return;
    }


    /*
    Hide loading/error.
    */

    if (
        elementExists(pageLoading)
    ) {

        pageLoading.classList.add(
            "hidden"
        );
    }


    if (
        elementExists(pageError)
    ) {

        pageError.classList.add(
            "hidden"
        );
    }


    if (
        elementExists(detailsContent)
    ) {

        detailsContent.classList.remove(
            "hidden"
        );
    }


    const status =
        String(
            delivery.status ||
            delivery.delivery_status ||
            ""
        );


    /*
    -----------------------------------------------------
    HEADER
    -----------------------------------------------------
    */

    if (
        elementExists(headerOrderId)
    ) {

        headerOrderId.textContent =
            delivery.orderId ||
            delivery.order_id ||
            "--";
    }


    /*
    -----------------------------------------------------
    STATUS
    -----------------------------------------------------
    */

    if (
        elementExists(orderStatus)
    ) {

        orderStatus.textContent =
            formatStatus(
                status
            );


        orderStatus.className =
            `large-status ${escapeClassName(
                status
            )}`;
    }


    if (
        elementExists(statusDescription)
    ) {

        statusDescription.textContent =
            getStatusDescription(
                status
            );
    }


    /*
    -----------------------------------------------------
    ORDER
    -----------------------------------------------------
    */

    if (
        elementExists(orderIdElement)
    ) {

        orderIdElement.textContent =
            delivery.orderId ||
            delivery.order_id ||
            "--";
    }


    if (
        elementExists(orderDate)
    ) {

        orderDate.textContent =
            formatDate(
                delivery.createdAt ??
                delivery.created_at
            );
    }


    if (
        elementExists(paymentStatus)
    ) {

        paymentStatus.textContent =
            formatPaymentStatus(
                delivery.paymentStatus ??
                delivery.payment_status
            );
    }


    if (
        elementExists(paymentMethod)
    ) {

        paymentMethod.textContent =
            formatPaymentMethod(
                delivery.paymentMethod ??
                delivery.payment_method
            );
    }


    if (
        elementExists(orderTotal)
    ) {

        orderTotal.textContent =
            formatCurrency(
                delivery.total
            );
    }


    /*
    -----------------------------------------------------
    CUSTOMER
    -----------------------------------------------------
    */

    if (
        elementExists(customerName)
    ) {

        customerName.textContent =
            delivery.customerName ||
            delivery.customer_name ||
            "Customer";
    }


    if (
        elementExists(callCustomerButton)
    ) {

        if (
            delivery.phone
        ) {

            callCustomerButton.href =
                `tel:${encodeURIComponent(
                    delivery.phone
                )}`;


            callCustomerButton.classList.remove(
                "hidden"
            );

        } else {

            callCustomerButton.classList.add(
                "hidden"
            );
        }
    }


    /*
    -----------------------------------------------------
    ADDRESS
    -----------------------------------------------------
    */

    if (
        elementExists(deliveryAddress)
    ) {

        deliveryAddress.textContent =
            delivery.address ||
            "Address unavailable";
    }


    /*
    -----------------------------------------------------
    ORDER ITEMS
    -----------------------------------------------------
    */

    renderOrderItems(
        Array.isArray(
            delivery.items
        )
            ? delivery.items
            : []
    );


    /*
    -----------------------------------------------------
    ACTION BUTTON
    -----------------------------------------------------
    */

    configureDeliveryAction(
        delivery
    );
}


/* =====================================================
   ORDER ITEMS
===================================================== */

function renderOrderItems(
    items
) {

    if (
        !elementExists(orderItems)
    ) {
        return;
    }


    if (
        !Array.isArray(items) ||
        items.length === 0
    ) {

        orderItems.innerHTML = `
            <p class="delivery-address">
                No item details available.
            </p>
        `;


        if (
            elementExists(itemsTotal)
        ) {

            itemsTotal.textContent =
                "₹0.00";
        }


        return;
    }


    orderItems.innerHTML =
        items
            .map(
                (item) => {

                    const name =
                        item.name ??
                        item.productName ??
                        item.product_name ??
                        "Item";


                    const quantity =
                        Number(
                            item.quantity || 1
                        );


                    const price =
                        Number(
                            item.total ??
                            item.price ??
                            0
                        );


                    return `
                        <div class="order-item">

                            <div
                                class="order-item-info"
                            >

                                <div
                                    class="order-item-name"
                                >
                                    ${escapeHTML(
                                        name
                                    )}
                                </div>


                                <div
                                    class="order-item-meta"
                                >
                                    Qty:
                                    ${quantity}
                                </div>

                            </div>


                            <div
                                class="order-item-price"
                            >
                                ${formatCurrency(
                                    price
                                )}
                            </div>

                        </div>
                    `;
                }
            )
            .join("");


    const total =
        items.reduce(
            (
                sum,
                item
            ) => {

                return (
                    sum +
                    Number(
                        item.total ??
                        item.price ??
                        0
                    )
                );

            },
            0
        );


    if (
        elementExists(itemsTotal)
    ) {

        itemsTotal.textContent =
            formatCurrency(
                total
            );
    }
}


/* =====================================================
   DELIVERY ACTION
===================================================== */

function configureDeliveryAction(
    delivery
) {

    if (
        !elementExists(
            deliveryActionButton
        )
    ) {
        return;
    }


    /*
    Reset previous action.
    */

    deliveryActionButton.onclick =
        null;


    deliveryActionButton.disabled =
        true;


    const status =
        String(
            delivery.status ||
            delivery.delivery_status ||
            ""
        );


    const currentAssignmentId =
        delivery.assignmentId ??
        delivery.assignment_id ??
        assignmentId;


    switch (
        status
    ) {

        /*
        -------------------------------------------------
        ASSIGNED
        -------------------------------------------------
        */

        case "assigned":

            deliveryActionButton.textContent =
                "Accept Delivery";


            if (
                currentAssignmentId
            ) {

                deliveryActionButton.disabled =
                    false;


                deliveryActionButton.onclick =
                    () =>
                        acceptDelivery(
                            currentAssignmentId
                        );
            }

            break;


        /*
        -------------------------------------------------
        PICKED UP
        -------------------------------------------------
        */

        case "picked_up":

            deliveryActionButton.textContent =
                "Start Delivery";


            if (
                currentAssignmentId
            ) {

                deliveryActionButton.disabled =
                    false;


                deliveryActionButton.onclick =
                    () =>
                        startDelivery(
                            currentAssignmentId
                        );
            }

            break;


        /*
        -------------------------------------------------
        OUT FOR DELIVERY
        -------------------------------------------------
        */

        case "out_for_delivery":

            deliveryActionButton.textContent =
                "Complete Delivery";


            /*
            OTP requires ORDER DATABASE ID,
            not assignment ID.
            */

            if (
                getOrderDbId(
                    delivery
                )
            ) {

                deliveryActionButton.disabled =
                    false;


                deliveryActionButton.onclick =
                    () =>
                        openOtpModal(
                            delivery
                        );
            }

            break;


        /*
        -------------------------------------------------
        DELIVERED
        -------------------------------------------------
        */

        case "delivered":

            deliveryActionButton.textContent =
                "Delivered";


            deliveryActionButton.disabled =
                true;

            break;


        /*
        -------------------------------------------------
        UNKNOWN
        -------------------------------------------------
        */

        default:

            deliveryActionButton.textContent =
                "Unavailable";


            deliveryActionButton.disabled =
                true;
    }
}


/* =====================================================
   ACCEPT DELIVERY
===================================================== */

async function acceptDelivery(
    assignmentId
) {

    if (
        !assignmentId ||
        actionInProgress
    ) {
        return;
    }


    actionInProgress =
        true;


    deliveryActionButton.disabled =
        true;


    deliveryActionButton.textContent =
        "Accepting...";


    try {

        const response =
            await fetch(
                `/api/delivery/${encodeURIComponent(
                    assignmentId
                )}/accept`,
                {
                    method: "PATCH",
                    credentials: "include",
                    headers: {
                        Accept:
                            "application/json"
                    }
                }
            );


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
                "Unable to accept delivery."
            );
        }


        await loadDeliveryDetails();


    } catch (error) {

        console.error(
            "Accept delivery error:",
            error
        );


        alert(
            error.message ||
            "Unable to accept delivery."
        );


        if (
            currentDelivery
        ) {

            configureDeliveryAction(
                currentDelivery
            );
        }

    } finally {

        actionInProgress =
            false;
    }
}


/* =====================================================
   START DELIVERY
===================================================== */

async function startDelivery(
    assignmentId
) {

    if (
        !assignmentId ||
        actionInProgress
    ) {
        return;
    }


    actionInProgress =
        true;


    deliveryActionButton.disabled =
        true;


    deliveryActionButton.textContent =
        "Starting...";


    try {

        const response =
            await fetch(
                `/api/delivery/${encodeURIComponent(
                    assignmentId
                )}/start`,
                {
                    method: "PATCH",
                    credentials: "include",
                    headers: {
                        Accept:
                            "application/json"
                    }
                }
            );


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
                "Unable to start delivery."
            );
        }


        await loadDeliveryDetails();


    } catch (error) {

        console.error(
            "Start delivery error:",
            error
        );


        alert(
            error.message ||
            "Unable to start delivery."
        );


        if (
            currentDelivery
        ) {

            configureDeliveryAction(
                currentDelivery
            );
        }

    } finally {

        actionInProgress =
            false;
    }
}


/* =====================================================
   GET ORDER DATABASE ID
===================================================== */

function getOrderDbId(
    delivery
) {

    if (
        !delivery
    ) {
        return null;
    }


    /*
    Preferred backend property.
    */

    const value =
        delivery.orderDbId ??
        delivery.order_db_id ??
        null;


    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {

        return null;
    }


    return value;
}


/* =====================================================
   OPEN OTP MODAL
===================================================== */

function openOtpModal(
    delivery
) {

    if (
        !elementExists(otpModal)
    ) {
        return;
    }


    /*
    IMPORTANT:

    Store ORDER DATABASE ID.

    Do NOT store assignmentId here.
    */

    const orderDbId =
        getOrderDbId(
            delivery
        );


    if (
        !orderDbId
    ) {

        alert(
            "Order database ID is missing."
        );

        return;
    }


    otpModal.dataset.orderDbId =
        String(
            orderDbId
        );


    /*
    Reset modal state.
    */

    otpModal.classList.remove(
        "hidden"
    );


    if (
        elementExists(
            otpSentMessage
        )
    ) {

        otpSentMessage.classList.add(
            "hidden"
        );

        otpSentMessage.textContent =
            "";
    }


    if (
        elementExists(
            otpVerificationSection
        )
    ) {

        otpVerificationSection.classList.add(
            "hidden"
        );
    }


    if (
        elementExists(
            deliveryOtp
        )
    ) {

        deliveryOtp.value =
            "";
    }


    if (
        elementExists(
            deliveryOtpError
        )
    ) {

        deliveryOtpError.textContent =
            "";
    }


    if (
        elementExists(
            sendDeliveryOtpButton
        )
    ) {

        sendDeliveryOtpButton.disabled =
            false;

        sendDeliveryOtpButton.textContent =
            "Send OTP";
    }


    if (
        elementExists(
            verifyDeliveryOtpButton
        )
    ) {

        verifyDeliveryOtpButton.disabled =
            false;

        verifyDeliveryOtpButton.textContent =
            "Verify & Complete";
    }
}


/* =====================================================
   CLOSE OTP MODAL
===================================================== */

function closeOtpModalHandler() {

    if (
        !elementExists(otpModal)
    ) {
        return;
    }


    otpModal.classList.add(
        "hidden"
    );


    if (
        elementExists(
            deliveryOtp
        )
    ) {

        deliveryOtp.value =
            "";
    }


    if (
        elementExists(
            deliveryOtpError
        )
    ) {

        deliveryOtpError.textContent =
            "";
    }


    delete otpModal.dataset.orderDbId;
}


if (
    elementExists(closeOtpModal)
) {

    closeOtpModal.addEventListener(
        "click",
        closeOtpModalHandler
    );
}


if (
    elementExists(cancelOtpButton)
) {

    cancelOtpButton.addEventListener(
        "click",
        closeOtpModalHandler
    );
}


/* =====================================================
   SEND OTP
===================================================== */

if (
    elementExists(
        sendDeliveryOtpButton
    )
) {

    sendDeliveryOtpButton.addEventListener(
        "click",
        async () => {

            /*
            IMPORTANT:

            OTP endpoint expects
            ORDER DATABASE ID.
            */

            const orderDbId =
                otpModal?.dataset?.orderDbId;


            if (
                !orderDbId
            ) {

                showOtpError(
                    "Order database ID is missing."
                );

                return;
            }


            sendDeliveryOtpButton.disabled =
                true;


            sendDeliveryOtpButton.textContent =
                "Sending...";


            try {

                const response =
                    await fetch(
                        `/api/delivery/${encodeURIComponent(
                            orderDbId
                        )}/send-otp`,
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
                        "Unable to send OTP."
                    );
                }


                if (
                    elementExists(
                        otpSentMessage
                    )
                ) {

                    otpSentMessage.textContent =
                        data.message ||
                        "OTP has been sent to the customer's registered email.";


                    otpSentMessage.classList.remove(
                        "hidden"
                    );
                }


                if (
                    elementExists(
                        otpVerificationSection
                    )
                ) {

                    otpVerificationSection.classList.remove(
                        "hidden"
                    );
                }


                sendDeliveryOtpButton.textContent =
                    "OTP Sent";


                if (
                    elementExists(
                        deliveryOtp
                    )
                ) {

                    deliveryOtp.focus();
                }


            } catch (error) {

                console.error(
                    "Send delivery OTP error:",
                    error
                );


                showOtpError(
                    error.message ||
                    "Unable to send OTP."
                );


                sendDeliveryOtpButton.disabled =
                    false;


                sendDeliveryOtpButton.textContent =
                    "Send OTP";
            }
        }
    );
}


/* =====================================================
   OTP INPUT
===================================================== */

if (
    elementExists(
        deliveryOtp
    )
) {

    deliveryOtp.addEventListener(
        "input",
        () => {

            deliveryOtp.value =
                deliveryOtp.value
                    .replace(
                        /\D/g,
                        ""
                    )
                    .slice(
                        0,
                        6
                    );


            if (
                elementExists(
                    deliveryOtpError
                )
            ) {

                deliveryOtpError.textContent =
                    "";
            }

        }
    );

}


/* =====================================================
   VERIFY OTP
===================================================== */

if (
    elementExists(
        verifyDeliveryOtpButton
    )
) {

    verifyDeliveryOtpButton.addEventListener(
        "click",
        async () => {

            /*
            OTP verification uses
            ORDER DATABASE ID.
            */

            const orderDbId =
                otpModal?.dataset?.orderDbId;


            const otp =
                deliveryOtp
                    ? deliveryOtp.value.trim()
                    : "";


            if (
                elementExists(
                    deliveryOtpError
                )
            ) {

                deliveryOtpError.textContent =
                    "";
            }


            if (
                !orderDbId
            ) {

                showOtpError(
                    "Order database ID is missing."
                );

                return;
            }


            if (
                !/^\d{6}$/.test(
                    otp
                )
            ) {

                showOtpError(
                    "Enter the 6-digit OTP."
                );


                if (
                    elementExists(
                        deliveryOtp
                    )
                ) {

                    deliveryOtp.focus();
                }


                return;
            }


            verifyDeliveryOtpButton.disabled =
                true;


            verifyDeliveryOtpButton.textContent =
                "Verifying...";


            try {

                const response =
                    await fetch(
                        `/api/delivery/${encodeURIComponent(
                            orderDbId
                        )}/verify-otp`,
                        {
                            method: "POST",
                            credentials: "include",
                            headers: {
                                "Content-Type":
                                    "application/json",

                                Accept:
                                    "application/json"
                            },
                            body:
                                JSON.stringify({
                                    otp
                                })
                        }
                    );


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
                        "Unable to verify OTP."
                    );
                }


                /*
                OTP verified successfully.

                Backend should now have:

                orders.status
                    = delivered

                delivery_assignments.status
                    = delivered
                */


                closeOtpModalHandler();


                await loadDeliveryDetails();


            } catch (error) {

                console.error(
                    "Verify delivery OTP error:",
                    error
                );


                showOtpError(
                    error.message ||
                    "Unable to verify OTP."
                );


                if (
                    elementExists(
                        deliveryOtp
                    )
                ) {

                    deliveryOtp.value =
                        "";

                    deliveryOtp.focus();
                }


            } finally {

                verifyDeliveryOtpButton.disabled =
                    false;


                verifyDeliveryOtpButton.textContent =
                    "Verify & Complete";
            }
        }
    );
}


/* =====================================================
   OTP ERROR
===================================================== */

function showOtpError(
    message
) {

    if (
        elementExists(
            deliveryOtpError
        )
    ) {

        deliveryOtpError.textContent =
            String(
                message ||
                "An error occurred."
            );
    }
}


/* =====================================================
   STATUS FORMAT
===================================================== */

function formatStatus(
    status
) {

    const statusMap = {

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
        old order statuses.
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
        statusMap[
            normalized
        ]
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
   STATUS DESCRIPTION
===================================================== */

function getStatusDescription(
    status
) {

    const descriptionMap = {

        assigned:
            "This delivery has been assigned to you.",

        accepted:
            "You have accepted this delivery.",

        picked_up:
            "The order has been picked up and is ready for delivery.",

        out_for_delivery:
            "This order is currently on the way.",

        delivered:
            "This order has already been delivered.",

        confirmed:
            "This delivery has been assigned to you.",

        preparing:
            "The restaurant is preparing this order."
    };


    const normalized =
        String(
            status || ""
        ).toLowerCase();


    return (
        descriptionMap[
            normalized
        ] ||
        "Delivery status unavailable."
    );
}


/* =====================================================
   PAYMENT STATUS
===================================================== */

function formatPaymentStatus(
    status
) {

    if (
        !status
    ) {
        return "--";
    }


    return String(
        status
    )
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
   PAYMENT METHOD
===================================================== */

function formatPaymentMethod(
    method
) {

    if (
        !method
    ) {
        return "--";
    }


    return String(
        method
    )
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
   DATE
===================================================== */

function formatDate(
    value
) {

    if (
        !value
    ) {
        return "--";
    }


    const date =
        new Date(
            value
        );


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return "--";
    }


    return date.toLocaleString(
        "en-IN",
        {
            day:
                "2-digit",

            month:
                "short",

            year:
                "numeric",

            hour:
                "2-digit",

            minute:
                "2-digit"
        }
    );
}


/* =====================================================
   CURRENCY
===================================================== */

function formatCurrency(
    value
) {

    const amount =
        Number(
            value || 0
        );


    return amount.toLocaleString(
        "en-IN",
        {
            style:
                "currency",

            currency:
                "INR"
        }
    );
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
   CLASS NAME ESCAPE
===================================================== */

function escapeClassName(
    value
) {

    return String(
        value ?? ""
    )
        .replace(
            /[^a-zA-Z0-9_-]/g,
            ""
        );
}


/* =====================================================
   LOADING
===================================================== */

function showLoading() {

    if (
        elementExists(
            pageLoading
        )
    ) {

        pageLoading.classList.remove(
            "hidden"
        );
    }


    if (
        elementExists(
            pageError
        )
    ) {

        pageError.classList.add(
            "hidden"
        );
    }


    if (
        elementExists(
            detailsContent
        )
    ) {

        detailsContent.classList.add(
            "hidden"
        );
    }
}


/* =====================================================
   ERROR
===================================================== */

function showError(
    message
) {

    if (
        elementExists(
            pageLoading
        )
    ) {

        pageLoading.classList.add(
            "hidden"
        );
    }


    if (
        elementExists(
            detailsContent
        )
    ) {

        detailsContent.classList.add(
            "hidden"
        );
    }


    if (
        elementExists(
            pageError
        )
    ) {

        pageError.classList.remove(
            "hidden"
        );
    }


    if (
        elementExists(
            errorMessage
        )
    ) {

        errorMessage.textContent =
            message ||
            "Unable to load delivery.";
    }
}


/* =====================================================
   RETRY
===================================================== */

if (
    elementExists(
        retryButton
    )
) {

    retryButton.addEventListener(
        "click",
        () => {

            loadDeliveryDetails();

        }
    );
}


/* =====================================================
   LOGOUT
===================================================== */

if (
    elementExists(
        logoutButton
    )
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
                            method:
                                "POST",

                            credentials:
                                "include",

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


    await loadDeliveryDetails();
}


/* =====================================================
   START
===================================================== */

initialize();