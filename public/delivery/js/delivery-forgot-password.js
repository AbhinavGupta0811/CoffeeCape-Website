const form =
    document.getElementById("forgotPasswordForm");

const employeeIdInput =
    document.getElementById("employeeId");

const employeeIdError =
    document.getElementById("employeeIdError");

const message =
    document.getElementById("forgotPasswordMessage");

const button =
    document.getElementById("sendCodeButton");

const buttonText =
    document.getElementById("sendCodeButtonText");

const spinner =
    document.getElementById("sendCodeSpinner");


/* =================================
   MESSAGE
================================= */

function showMessage(
    text,
    type = "error"
) {
    message.textContent = text;

    message.className =
        `form-message ${type}`;
}


function clearMessage() {

    message.textContent = "";

    message.className =
        "form-message";
}


/* =================================
   VALIDATION
================================= */

function validateForm() {

    employeeIdError.textContent = "";

    const employeeId =
        employeeIdInput.value
            .trim()
            .toUpperCase();

    if (!employeeId) {

        employeeIdError.textContent =
            "Employee ID is required.";

        return false;
    }

    if (employeeId.length > 30) {

        employeeIdError.textContent =
            "Invalid Employee ID.";

        return false;
    }

    return true;
}


/* =================================
   LOADING
================================= */

function setLoading(isLoading) {

    button.disabled =
        isLoading;

    buttonText.textContent =
        isLoading
            ? "Sending..."
            : "Send Reset Code";

    spinner.classList.toggle(
        "hidden",
        !isLoading
    );
}


/* =================================
   FORM SUBMIT
================================= */

form.addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();

        clearMessage();

        if (!validateForm()) {
            return;
        }

        const employeeId =
            employeeIdInput.value
                .trim()
                .toUpperCase();

        setLoading(true);

        try {

            const response =
                await fetch(
                    "/api/delivery/auth/forgot-password",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        credentials: "include",

                        body: JSON.stringify({
                            employeeId
                        })
                    }
                );


            const data =
                await response.json();


            /*
             * The backend intentionally returns
             * a generic response so we don't reveal
             * whether the employee account exists.
             */

            if (!response.ok) {

                showMessage(
                    data.message ||
                    "Unable to process your request."
                );

                return;
            }


            showMessage(
                "If the account exists, a reset code has been sent to the registered email.",
                "success"
            );


            /*
             * Keep the Employee ID in the next page.
             *
             * This is NOT authentication data.
             * It is only workflow state.
             */

            sessionStorage.setItem(
                "deliveryResetEmployeeId",
                employeeId
            );


            /*
             * Move to OTP page after a short delay.
             */

            setTimeout(() => {

                window.location.href =
                    "reset-password.html";

            }, 1000);


        } catch (error) {

            console.error(
                "Forgot password error:",
                error
            );

            showMessage(
                "Unable to connect to the server. Please try again."
            );

        } finally {

            setLoading(false);
        }
    }
);