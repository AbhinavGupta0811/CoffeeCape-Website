const form =
    document.getElementById("changePasswordForm");

const currentPassword =
    document.getElementById("currentPassword");

const newPassword =
    document.getElementById("newPassword");

const confirmPassword =
    document.getElementById("confirmPassword");

const currentPasswordError =
    document.getElementById("currentPasswordError");

const newPasswordError =
    document.getElementById("newPasswordError");

const confirmPasswordError =
    document.getElementById("confirmPasswordError");

const message =
    document.getElementById("changePasswordMessage");

const button =
    document.getElementById("changePasswordButton");

const buttonText =
    document.getElementById("changePasswordButtonText");

const spinner =
    document.getElementById("changePasswordSpinner");


/* =================================
   PASSWORD VISIBILITY
================================= */

document
    .querySelectorAll(".password-toggle")
    .forEach((button) => {

        button.addEventListener("click", () => {

            const targetId =
                button.dataset.target;

            const input =
                document.getElementById(targetId);

            const show =
                input.type === "password";

            input.type =
                show ? "text" : "password";

            button.textContent =
                show ? "Hide" : "Show";

        });

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
        newPassword.value;

    const lengthValid =
        value.length >= 8;

    const uppercaseValid =
        /[A-Z]/.test(value);

    const lowercaseValid =
        /[a-z]/.test(value);

    const numberValid =
        /[0-9]/.test(value);


    lengthRule.classList.toggle(
        "valid",
        lengthValid
    );

    uppercaseRule.classList.toggle(
        "valid",
        uppercaseValid
    );

    lowercaseRule.classList.toggle(
        "valid",
        lowercaseValid
    );

    numberRule.classList.toggle(
        "valid",
        numberValid
    );
}


newPassword.addEventListener(
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
   ERRORS
================================= */

function clearErrors() {

    currentPasswordError.textContent = "";

    newPasswordError.textContent = "";

    confirmPasswordError.textContent = "";
}


/* =================================
   VALIDATION
================================= */

function validateForm() {

    clearErrors();

    let valid = true;

    const current =
        currentPassword.value;

    const newPass =
        newPassword.value;

    const confirm =
        confirmPassword.value;


    if (!current) {

        currentPasswordError.textContent =
            "Current password is required.";

        valid = false;
    }


    if (!newPass) {

        newPasswordError.textContent =
            "New password is required.";

        valid = false;

    } else if (newPass.length < 8) {

        newPasswordError.textContent =
            "Password must contain at least 8 characters.";

        valid = false;

    } else if (!/[A-Z]/.test(newPass)) {

        newPasswordError.textContent =
            "Password must contain an uppercase letter.";

        valid = false;

    } else if (!/[a-z]/.test(newPass)) {

        newPasswordError.textContent =
            "Password must contain a lowercase letter.";

        valid = false;

    } else if (!/[0-9]/.test(newPass)) {

        newPasswordError.textContent =
            "Password must contain a number.";

        valid = false;
    }


    if (!confirm) {

        confirmPasswordError.textContent =
            "Please confirm your new password.";

        valid = false;

    } else if (newPass !== confirm) {

        confirmPasswordError.textContent =
            "Passwords do not match.";

        valid = false;
    }


    return valid;
}


/* =================================
   BUTTON STATE
================================= */

function setLoading(isLoading) {

    button.disabled =
        isLoading;

    buttonText.textContent =
        isLoading
            ? "Changing password..."
            : "Change Password";

    spinner.classList.toggle(
        "hidden",
        !isLoading
    );
}


/* =================================
   CHECK AUTHENTICATION
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

            return null;
        }

        const data =
            await response.json();

        if (!data.success) {

            window.location.href =
                "login.html";

            return null;
        }

        return data.user;

    } catch (error) {

        console.error(
            "Authentication check failed:",
            error
        );

        window.location.href =
            "login.html";

        return null;
    }
}


/* =================================
   CHANGE PASSWORD
================================= */

form.addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();

        clearMessage();

        if (!validateForm()) {
            return;
        }

        setLoading(true);

        try {

            const response =
                await fetch(
                    "/api/delivery/auth/change-password",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        credentials: "include",

                        body: JSON.stringify({
                            currentPassword:
                                currentPassword.value,

                            newPassword:
                                newPassword.value
                        })
                    }
                );


            const data =
                await response.json();


            if (!response.ok || !data.success) {

                showMessage(
                    data.message ||
                    "Unable to change password."
                );

                return;
            }


            showMessage(
                "Password changed successfully. Redirecting...",
                "success"
            );


            /*
             * Give the user a moment to see
             * the success message.
             */

            setTimeout(() => {

                window.location.href =
                    "dashboard.html";

            }, 800);


        } catch (error) {

            console.error(
                "Change password error:",
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

/* =================================
   INITIAL AUTH CHECK
================================= */
checkAuthentication();