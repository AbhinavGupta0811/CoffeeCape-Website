const form =
    document.getElementById("resetPasswordForm");

const employeeIdInput =
    document.getElementById("employeeId");

const resetCodeInput =
    document.getElementById("resetCode");

const newPasswordInput =
    document.getElementById("newPassword");

const confirmPasswordInput =
    document.getElementById("confirmPassword");

const employeeIdError =
    document.getElementById("employeeIdError");

const resetCodeError =
    document.getElementById("resetCodeError");

const newPasswordError =
    document.getElementById("newPasswordError");

const confirmPasswordError =
    document.getElementById("confirmPasswordError");

const message =
    document.getElementById("resetPasswordMessage");

const button =
    document.getElementById("resetPasswordButton");

const buttonText =
    document.getElementById("resetPasswordButtonText");

const spinner =
    document.getElementById("resetPasswordSpinner");


/* =================================
   EMPLOYEE ID FROM PREVIOUS PAGE
================================= */

const savedEmployeeId =
    sessionStorage.getItem(
        "deliveryResetEmployeeId"
    );

if (savedEmployeeId) {

    employeeIdInput.value =
        savedEmployeeId;

} else {

    /*
     * No reset flow was started.
     */
    window.location.href =
        "forgot-password.html";
}


/* =================================
   PASSWORD VISIBILITY
================================= */

document
    .querySelectorAll(".password-toggle")
    .forEach((button) => {

        button.addEventListener(
            "click",
            () => {

                const input =
                    document.getElementById(
                        button.dataset.target
                    );

                const show =
                    input.type === "password";

                input.type =
                    show
                        ? "text"
                        : "password";

                button.textContent =
                    show
                        ? "Hide"
                        : "Show";
            }
        );

    });


/* =================================
   PASSWORD RULES
================================= */

const lengthRule =
    document.getElementById("lengthRule");

const uppercaseRule =
    document.getElementById("uppercaseRule");

const lowercaseRule =
    document.getElementById("lowercaseRule");

const numberRule =
    document.getElementById("numberRule");


function updatePasswordRules() {

    const value =
        newPasswordInput.value;


    lengthRule.classList.toggle(
        "valid",
        value.length >= 8
    );

    uppercaseRule.classList.toggle(
        "valid",
        /[A-Z]/.test(value)
    );

    lowercaseRule.classList.toggle(
        "valid",
        /[a-z]/.test(value)
    );

    numberRule.classList.toggle(
        "valid",
        /[0-9]/.test(value)
    );
}


newPasswordInput.addEventListener(
    "input",
    updatePasswordRules
);


/* =================================
   MESSAGE
================================= */

function showMessage(
    text,
    type = "error"
) {

    message.textContent =
        text;

    message.className =
        `form-message ${type}`;
}


/* =================================
   VALIDATION
================================= */

function validateForm() {

    employeeIdError.textContent = "";
    resetCodeError.textContent = "";
    newPasswordError.textContent = "";
    confirmPasswordError.textContent = "";

    let valid = true;


    const employeeId =
        employeeIdInput.value
            .trim()
            .toUpperCase();

    const resetCode =
        resetCodeInput.value
            .trim();

    const newPassword =
        newPasswordInput.value;

    const confirmPassword =
        confirmPasswordInput.value;


    if (!employeeId) {

        employeeIdError.textContent =
            "Employee ID is required.";

        valid = false;
    }


    if (!/^\d{6}$/.test(resetCode)) {

        resetCodeError.textContent =
            "Enter the 6-digit reset code.";

        valid = false;
    }


    if (!newPassword) {

        newPasswordError.textContent =
            "New password is required.";

        valid = false;

    } else if (newPassword.length < 8) {

        newPasswordError.textContent =
            "Password must contain at least 8 characters.";

        valid = false;

    } else if (!/[A-Z]/.test(newPassword)) {

        newPasswordError.textContent =
            "Password must contain an uppercase letter.";

        valid = false;

    } else if (!/[a-z]/.test(newPassword)) {

        newPasswordError.textContent =
            "Password must contain a lowercase letter.";

        valid = false;

    } else if (!/[0-9]/.test(newPassword)) {

        newPasswordError.textContent =
            "Password must contain a number.";

        valid = false;
    }


    if (!confirmPassword) {

        confirmPasswordError.textContent =
            "Please confirm your password.";

        valid = false;

    } else if (
        newPassword !== confirmPassword
    ) {

        confirmPasswordError.textContent =
            "Passwords do not match.";

        valid = false;
    }


    return valid;
}


/* =================================
   LOADING
================================= */

function setLoading(isLoading) {

    button.disabled =
        isLoading;

    buttonText.textContent =
        isLoading
            ? "Resetting..."
            : "Reset Password";

    spinner.classList.toggle(
        "hidden",
        !isLoading
    );
}


/* =================================
   SUBMIT
================================= */

form.addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();

        if (!validateForm()) {
            return;
        }


        const employeeId =
            employeeIdInput.value
                .trim()
                .toUpperCase();

        const resetCode =
            resetCodeInput.value
                .trim();

        const newPassword =
            newPasswordInput.value;


        setLoading(true);


        try {

            const response =
                await fetch(
                    "/api/delivery/auth/reset-password",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        credentials: "include",

                        body: JSON.stringify({
                            employeeId,
                            resetCode,
                            newPassword
                        })
                    }
                );


            const data =
                await response.json();


            if (!response.ok || !data.success) {

                showMessage(
                    data.message ||
                    "Unable to reset password."
                );

                return;
            }


            /*
             * Reset flow is finished.
             */

            sessionStorage.removeItem(
                "deliveryResetEmployeeId"
            );


            showMessage(
                "Password reset successfully. Redirecting to login...",
                "success"
            );


            setTimeout(() => {

                window.location.href =
                    "login.html";

            }, 1000);


        } catch (error) {

            console.error(
                "Reset password error:",
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