"use strict";


/* =====================================================
   CONFIGURATION
===================================================== */

const API_BASE_URL = "";


/*
 * Maximum time allowed for one authentication request.
 *
 * This prevents the UI from remaining stuck forever if
 * the server becomes unavailable.
 */
const REQUEST_TIMEOUT = 15000;


/* =====================================================
   LOGIN ELEMENTS
===================================================== */

const loginForm =
    document.getElementById("deliveryLoginForm");

const employeeIdInput =
    document.getElementById("employeeId");

const passwordInput =
    document.getElementById("password");

const togglePassword =
    document.getElementById("togglePassword");

const loginButton =
    document.getElementById("loginButton");

const loginButtonText =
    document.getElementById("loginButtonText");

const loginSpinner =
    document.getElementById("loginSpinner");

const loginMessage =
    document.getElementById("loginMessage");

const employeeIdError =
    document.getElementById("employeeIdError");

const passwordError =
    document.getElementById("passwordError");


/* =====================================================
   REGISTER ELEMENTS
===================================================== */

const registerForm =
    document.getElementById("deliveryRegisterForm");

const registerNameInput =
    document.getElementById("registerName");

const registerEmailInput =
    document.getElementById("registerEmail");

const registerPhoneInput =
    document.getElementById("registerPhone");

const registerPasswordInput =
    document.getElementById("registerPassword");

const registerConfirmPasswordInput =
    document.getElementById("registerConfirmPassword");

const toggleRegisterPassword =
    document.getElementById("toggleRegisterPassword");

const toggleRegisterConfirmPassword =
    document.getElementById(
        "toggleRegisterConfirmPassword"
    );

const registerButton =
    document.getElementById("registerButton");

const registerButtonText =
    document.getElementById("registerButtonText");

const registerSpinner =
    document.getElementById("registerSpinner");

const registerMessage =
    document.getElementById("registerMessage");

const registerNameError =
    document.getElementById("registerNameError");

const registerEmailError =
    document.getElementById("registerEmailError");

const registerPhoneError =
    document.getElementById("registerPhoneError");

const registerPasswordError =
    document.getElementById("registerPasswordError");

const registerConfirmPasswordError =
    document.getElementById(
        "registerConfirmPasswordError"
    );


/* =====================================================
   AUTH TAB ELEMENTS
===================================================== */

const loginTab =
    document.getElementById("loginTab");

const registerTab =
    document.getElementById("registerTab");

const loginSection =
    document.getElementById("loginSection");

const registerSection =
    document.getElementById("registerSection");

const backToLogin =
    document.getElementById("backToLogin");


/* =====================================================
   BASIC ELEMENT SAFETY CHECK
===================================================== */

/*
 * If the HTML is accidentally missing an expected
 * authentication element, stop the script instead of
 * producing confusing "null" errors later.
 */

const requiredElements = [
    loginForm,
    employeeIdInput,
    passwordInput,
    togglePassword,
    loginButton,
    loginButtonText,
    loginSpinner,
    loginMessage,
    employeeIdError,
    passwordError,

    registerForm,
    registerNameInput,
    registerEmailInput,
    registerPhoneInput,
    registerPasswordInput,
    registerConfirmPasswordInput,
    toggleRegisterPassword,
    toggleRegisterConfirmPassword,
    registerButton,
    registerButtonText,
    registerSpinner,
    registerMessage,
    registerNameError,
    registerEmailError,
    registerPhoneError,
    registerPasswordError,
    registerConfirmPasswordError,

    loginTab,
    registerTab,
    loginSection,
    registerSection,
    backToLogin
];


if (
    requiredElements.some(
        element => !element
    )
) {

    console.error(
        "Delivery authentication UI is incomplete."
    );

    throw new Error(
        "Required delivery authentication elements are missing."
    );
}


/* =====================================================
   REQUEST HELPER
===================================================== */

/*
 * Secure frontend request helper.
 *
 * Security responsibilities here:
 *
 * - credentials: include
 *   Keeps session-cookie authentication working.
 *
 * - Content-Type
 *   Explicit JSON request.
 *
 * - AbortController
 *   Prevents requests from hanging indefinitely.
 *
 * - No credentials are stored in localStorage.
 * - No password is logged.
 */

async function authenticatedFetch(
    url,
    options = {}
) {

    const controller =
        new AbortController();

    const timeoutId =
        setTimeout(
            () => controller.abort(),
            REQUEST_TIMEOUT
        );


    try {

        const response =
            await fetch(
                url,
                {
                    ...options,

                    credentials: "include",

                    signal:
                        controller.signal
                }
            );


        return response;

    } finally {

        clearTimeout(timeoutId);
    }
}


/* =====================================================
   AUTH MODE
===================================================== */

function showLogin() {

    loginSection.classList.remove(
        "hidden"
    );

    registerSection.classList.add(
        "hidden"
    );

    loginTab.classList.add(
        "active"
    );

    registerTab.classList.remove(
        "active"
    );


    clearRegisterErrors();

    clearRegisterMessage();


    /*
     * Focus after the section becomes visible.
     */

    setTimeout(
        () => employeeIdInput.focus(),
        50
    );
}


function showRegister() {

    registerSection.classList.remove(
        "hidden"
    );

    loginSection.classList.add(
        "hidden"
    );

    registerTab.classList.add(
        "active"
    );

    loginTab.classList.remove(
        "active"
    );


    clearLoginErrors();

    clearLoginMessage();


    setTimeout(
        () => registerNameInput.focus(),
        50
    );
}


/* =====================================================
   TAB EVENTS
===================================================== */

loginTab.addEventListener(
    "click",
    showLogin
);


registerTab.addEventListener(
    "click",
    showRegister
);


backToLogin.addEventListener(
    "click",
    event => {

        event.preventDefault();

        showLogin();
    }
);


/* =====================================================
   PASSWORD VISIBILITY
===================================================== */

function setupPasswordToggle(
    button,
    input
) {

    button.addEventListener(
        "click",
        () => {

            const isPassword =
                input.type === "password";


            input.type =
                isPassword
                    ? "text"
                    : "password";


            button.textContent =
                isPassword
                    ? "Hide"
                    : "Show";


            button.setAttribute(
                "aria-label",
                isPassword
                    ? "Hide password"
                    : "Show password"
            );
        }
    );
}


setupPasswordToggle(
    togglePassword,
    passwordInput
);


setupPasswordToggle(
    toggleRegisterPassword,
    registerPasswordInput
);


setupPasswordToggle(
    toggleRegisterConfirmPassword,
    registerConfirmPasswordInput
);


/* =====================================================
   LOGIN MESSAGES
===================================================== */

function showLoginMessage(
    message,
    type = "error"
) {

    loginMessage.textContent =
        message;

    loginMessage.className =
        `form-message ${type}`;
}


function clearLoginMessage() {

    loginMessage.textContent = "";

    loginMessage.className =
        "form-message";
}


/* =====================================================
   REGISTER MESSAGES
===================================================== */

function showRegisterMessage(
    message,
    type = "error"
) {

    /*
     * textContent is intentionally used instead of
     * innerHTML so server messages cannot inject HTML.
     */

    registerMessage.textContent =
        message;

    registerMessage.className =
        `form-message ${type}`;
}


function clearRegisterMessage() {

    registerMessage.textContent = "";

    registerMessage.className =
        "form-message";
}


/* =====================================================
   LOGIN FIELD ERRORS
===================================================== */

function clearLoginErrors() {

    employeeIdError.textContent = "";

    passwordError.textContent = "";


    employeeIdInput.classList.remove(
        "input-error"
    );

    passwordInput.classList.remove(
        "input-error"
    );
}


/* =====================================================
   REGISTER FIELD ERRORS
===================================================== */

function clearRegisterErrors() {

    registerNameError.textContent = "";

    registerEmailError.textContent = "";

    registerPhoneError.textContent = "";

    registerPasswordError.textContent = "";

    registerConfirmPasswordError.textContent =
        "";


    registerNameInput.classList.remove(
        "input-error"
    );

    registerEmailInput.classList.remove(
        "input-error"
    );

    registerPhoneInput.classList.remove(
        "input-error"
    );

    registerPasswordInput.classList.remove(
        "input-error"
    );

    registerConfirmPasswordInput.classList.remove(
        "input-error"
    );
}


/* =====================================================
   LOGIN VALIDATION
===================================================== */

function validateLogin() {

    clearLoginErrors();

    let valid = true;


    const employeeId =
        employeeIdInput.value
            .trim();


    const password =
        passwordInput.value;


    if (!employeeId) {

        employeeIdError.textContent =
            "Delivery ID or email is required.";

        employeeIdInput.classList.add(
            "input-error"
        );

        valid = false;
    }


    if (!password) {

        passwordError.textContent =
            "Password is required.";

        passwordInput.classList.add(
            "input-error"
        );

        valid = false;
    }


    return valid;
}


/* =====================================================
   REGISTRATION VALIDATION
===================================================== */

function validateRegistration() {

    clearRegisterErrors();

    clearRegisterMessage();

    let valid = true;


    const name =
        registerNameInput.value
            .trim()
            .replace(/\s+/g, " ");


    const email =
        registerEmailInput.value
            .trim()
            .toLowerCase();


    const phone =
        registerPhoneInput.value
            .trim();


    const password =
        registerPasswordInput.value;


    const confirmPassword =
        registerConfirmPasswordInput.value;


    /* ================================================
       NAME
    ================================================= */

    if (!name) {

        registerNameError.textContent =
            "Full name is required.";

        registerNameInput.classList.add(
            "input-error"
        );

        valid = false;

    } else if (name.length < 2) {

        registerNameError.textContent =
            "Please enter a valid full name.";

        registerNameInput.classList.add(
            "input-error"
        );

        valid = false;

    } else if (name.length > 100) {

        registerNameError.textContent =
            "Name must not exceed 100 characters.";

        registerNameInput.classList.add(
            "input-error"
        );

        valid = false;

    } else if (
        /[\x00-\x1F\x7F]/.test(name)
    ) {

        registerNameError.textContent =
            "Please enter a valid full name.";

        registerNameInput.classList.add(
            "input-error"
        );

        valid = false;
    }


    /* ================================================
       EMAIL
    ================================================= */

    const emailPattern =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


    if (!email) {

        registerEmailError.textContent =
            "Email address is required.";

        registerEmailInput.classList.add(
            "input-error"
        );

        valid = false;

    } else if (
        email.length > 255
    ) {

        registerEmailError.textContent =
            "Email address is too long.";

        registerEmailInput.classList.add(
            "input-error"
        );

        valid = false;

    } else if (
        !emailPattern.test(email)
    ) {

        registerEmailError.textContent =
            "Please enter a valid email address.";

        registerEmailInput.classList.add(
            "input-error"
        );

        valid = false;
    }


    /* ================================================
       PHONE
    ================================================= */

    const phoneDigits =
        phone.replace(
            /\D/g,
            ""
        );


    if (!phone) {

        registerPhoneError.textContent =
            "Phone number is required.";

        registerPhoneInput.classList.add(
            "input-error"
        );

        valid = false;

    } else if (
        phoneDigits.length < 10 ||
        phoneDigits.length > 15
    ) {

        registerPhoneError.textContent =
            "Please enter a valid phone number.";

        registerPhoneInput.classList.add(
            "input-error"
        );

        valid = false;
    }


    /* ================================================
       PASSWORD
    ================================================= */

    if (!password) {

        registerPasswordError.textContent =
            "Password is required.";

        registerPasswordInput.classList.add(
            "input-error"
        );

        valid = false;

    } else if (
        password.length < 8
    ) {

        registerPasswordError.textContent =
            "Password must be at least 8 characters.";

        registerPasswordInput.classList.add(
            "input-error"
        );

        valid = false;

    } else if (
        password.length > 128
    ) {

        registerPasswordError.textContent =
            "Password must not exceed 128 characters.";

        registerPasswordInput.classList.add(
            "input-error"
        );

        valid = false;
    }


    /* ================================================
       CONFIRM PASSWORD
    ================================================= */

    if (!confirmPassword) {

        registerConfirmPasswordError.textContent =
            "Please confirm your password.";

        registerConfirmPasswordInput.classList.add(
            "input-error"
        );

        valid = false;

    } else if (
        password !== confirmPassword
    ) {

        registerConfirmPasswordError.textContent =
            "Passwords do not match.";

        registerConfirmPasswordInput.classList.add(
            "input-error"
        );

        valid = false;
    }


    return valid;
}


/* =====================================================
   LOGIN BUTTON STATE
===================================================== */

function setLoginLoading(
    isLoading
) {

    loginButton.disabled =
        isLoading;


    loginButtonText.textContent =
        isLoading
            ? "Signing in..."
            : "Login";


    loginSpinner.classList.toggle(
        "hidden",
        !isLoading
    );
}


/* =====================================================
   REGISTER BUTTON STATE
===================================================== */

function setRegisterLoading(
    isLoading
) {

    registerButton.disabled =
        isLoading;


    registerButtonText.textContent =
        isLoading
            ? "Creating account..."
            : "Create Account";


    registerSpinner.classList.toggle(
        "hidden",
        !isLoading
    );
}


/* =====================================================
   LOGIN API
===================================================== */

loginForm.addEventListener(
    "submit",
    async event => {

        event.preventDefault();


        clearLoginMessage();


        if (!validateLogin()) {
            return;
        }


        /*
         * Normalize the login identifier.
         */

        const employeeId =
            employeeIdInput.value
                .trim()
                .toUpperCase();


        const password =
            passwordInput.value;


        setLoginLoading(true);


        try {

            const response =
                await authenticatedFetch(
                    `${API_BASE_URL}/api/delivery/auth/login`,
                    {

                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify({
                                employeeId,
                                password
                            })
                    }
                );


            let data;


            try {

                data =
                    await response.json();

            } catch {

                data = {
                    success: false,
                    message:
                        "Invalid server response."
                };
            }


            /* ========================================
               LOGIN FAILURE
            ======================================== */

            if (
                !response.ok ||
                !data.success
            ) {

                showLoginMessage(
                    data.message ||
                    "Unable to login. Please check your credentials."
                );

                return;
            }


            /* ========================================
               FORCE PASSWORD CHANGE
            ======================================== */

            if (
                data.forcePasswordChange
            ) {

                showLoginMessage(
                    "Login successful. Please change your password.",
                    "success"
                );


                /*
                 * Small delay allows the user to see
                 * the acknowledgement.
                 */

                setTimeout(
                    () => {

                        window.location.href =
                            "change-password.html";

                    },
                    500
                );

                return;
            }


            /* ========================================
               NORMAL LOGIN SUCCESS
            ======================================== */

            showLoginMessage(
                "Login successful. Redirecting...",
                "success"
            );


            setTimeout(
                () => {
                    window.location.href = "dashboard.html";
                },
                500
            );


        } catch (error) {

            console.error(
                "Delivery login request failed:",
                error.message
            );


            if (
                error.name === "AbortError"
            ) {

                showLoginMessage(
                    "The server took too long to respond. Please try again."
                );

            } else {

                showLoginMessage(
                    "Unable to connect to the server. Please try again."
                );
            }


        } finally {

            setLoginLoading(false);
        }
    }
);


/* =====================================================
   REGISTRATION API
===================================================== */

registerForm.addEventListener(
    "submit",
    async event => {

        event.preventDefault();


        clearRegisterMessage();


        /*
         * Frontend validation is only for user experience.
         *
         * The backend performs its own complete
         * validation and must never trust this result.
         */

        if (!validateRegistration()) {

            showRegisterMessage(
                "Please correct the highlighted fields."
            );

            return;
        }


        /*
         * Normalize non-sensitive fields.
         *
         * Passwords are intentionally NOT trimmed or
         * transformed because changing a password before
         * sending it would change what the user entered.
         */

        const name =
            registerNameInput.value
                .trim()
                .replace(/\s+/g, " ");


        const email =
            registerEmailInput.value
                .trim()
                .toLowerCase();


        /*
         * Send the phone as entered.
         *
         * The backend performs its own normalization.
         */

        const phone =
            registerPhoneInput.value
                .trim();


        const password =
            registerPasswordInput.value;


        const confirmPassword =
            registerConfirmPasswordInput.value;


        setRegisterLoading(true);


        try {

            /* ========================================
               SEND REGISTRATION REQUEST
            ======================================== */

            const response =
                await authenticatedFetch(
                    `${API_BASE_URL}/api/delivery/auth/register`,
                    {

                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify({

                                name,

                                email,

                                phone,

                                password,

                                confirmPassword

                            })
                    }
                );


            let data;


            try {

                data =
                    await response.json();

            } catch {

                data = {
                    success: false,
                    message:
                        "Invalid server response."
                };
            }


            /* ========================================
               REGISTRATION FAILED
            ======================================== */

            if (
                !response.ok ||
                !data.success
            ) {

                showRegisterMessage(
                    data.message ||
                    "Unable to create your delivery account."
                );

                return;
            }


            /* ========================================
               EMAIL NOT SENT
            ======================================== */

            if (
                data.emailSent === false
            ) {

                /*
                 * Account exists, but email failed.
                 *
                 * Do NOT tell the user that registration
                 * completely failed.
                 */

                showRegisterMessage(
                    data.message ||
                    "Your account was created, but we could not send the confirmation email.",
                    "error"
                );


                /*
                 * We do not expose the password or any
                 * sensitive registration information.
                 *
                 * The generated Delivery ID may be displayed
                 * only because the backend intentionally
                 * returned it for this purpose.
                 */

                if (
                    data.user &&
                    data.user.employeeId
                ) {

                    showRegistrationAccountInfo(
                        data.user.employeeId,
                        false
                    );
                }


                clearRegistrationSensitiveFields();

                return;
            }


            /* ========================================
               REGISTRATION SUCCESS
            ======================================== */

            if (
                data.emailSent === true
            ) {

                showRegisterMessage(
                    data.message ||
                    "Account created successfully. Your Delivery ID has been sent to your email.",
                    "success"
                );


                /*
                 * Display only the generated Delivery ID.
                 *
                 * Never display or store the password.
                 */

                if (
                    data.user &&
                    data.user.employeeId
                ) {

                    showRegistrationAccountInfo(
                        data.user.employeeId,
                        true
                    );
                }


                /*
                 * Clear sensitive fields immediately.
                 */

                clearRegistrationSensitiveFields();


                /*
                 * Keep the user on the registration page
                 * long enough to read the acknowledgement.
                 *
                 * Then return them to login.
                 */

                setTimeout(
                    () => {

                        showLogin();


                        /*
                         * Put the generated ID into the login
                         * field so the user doesn't have to type
                         * it manually.
                         *
                         * This is not a credential and is not
                         * persisted to storage.
                         */

                        if (
                            data.user &&
                            data.user.employeeId
                        ) {

                            employeeIdInput.value =
                                data.user.employeeId;
                        }


                        showLoginMessage(
                            "Registration successful. Your Delivery ID has been sent to your registered email.",
                            "success"
                        );

                    },
                    2500
                );

                return;
            }


            /* ========================================
               UNEXPECTED SUCCESS RESPONSE
            ======================================== */

            showRegisterMessage(
                "Account created successfully. Please check your registered email.",
                "success"
            );


            clearRegistrationSensitiveFields();


        } catch (error) {

            console.error(
                "Delivery registration request failed:",
                error.message
            );


            /* ========================================
               TIMEOUT
            ======================================== */

            if (
                error.name === "AbortError"
            ) {

                showRegisterMessage(
                    "The registration request timed out. Please try again."
                );

                return;
            }


            /* ========================================
               NETWORK FAILURE
            ======================================== */

            showRegisterMessage(
                "Unable to connect to the server. Please try again."
            );


        } finally {

            setRegisterLoading(false);
        }
    }
);


/* =====================================================
   REGISTRATION ACCOUNT ACKNOWLEDGEMENT
===================================================== */

function showRegistrationAccountInfo(
    employeeId,
    emailSent
) {

    /*
     * We create a normal text element instead of using
     * innerHTML with server-controlled values.
     */

    const existing =
        document.getElementById(
            "registrationAccountInfo"
        );


    if (existing) {
        existing.remove();
    }


    const info =
        document.createElement("div");


    info.id =
        "registrationAccountInfo";


    info.className =
        "form-message success";


    info.style.marginTop =
        "12px";


    const title =
        document.createElement("strong");


    title.textContent =
        emailSent
            ? "Your Delivery ID:"
            : "Your generated Delivery ID:";


    const idElement =
        document.createElement("div");


    idElement.textContent =
        employeeId;


    idElement.style.marginTop =
        "6px";


    idElement.style.fontWeight =
        "700";


    idElement.style.letterSpacing =
        "0.5px";


    info.appendChild(title);

    info.appendChild(idElement);


    registerForm.appendChild(info);
}


/* =====================================================
   CLEAR REGISTRATION SENSITIVE DATA
===================================================== */

function clearRegistrationSensitiveFields() {

    /*
     * Passwords are sensitive.
     *
     * Clear them immediately after the request finishes.
     */

    registerPasswordInput.value =
        "";

    registerConfirmPasswordInput.value =
        "";


    /*
     * Keep name/email/phone temporarily available if
     * the user needs to understand what account was created.
     *
     * They are not authentication secrets.
     */
}


/* =====================================================
   REAL-TIME REGISTER ERROR CLEANUP
===================================================== */

registerNameInput.addEventListener(
    "input",
    () => {

        registerNameInput.classList.remove(
            "input-error"
        );

        registerNameError.textContent =
            "";
    }
);


registerEmailInput.addEventListener(
    "input",
    () => {

        registerEmailInput.classList.remove(
            "input-error"
        );

        registerEmailError.textContent =
            "";
    }
);


registerPhoneInput.addEventListener(
    "input",
    () => {

        registerPhoneInput.classList.remove(
            "input-error"
        );

        registerPhoneError.textContent =
            "";
    }
);


registerPasswordInput.addEventListener(
    "input",
    () => {

        registerPasswordInput.classList.remove(
            "input-error"
        );

        registerPasswordError.textContent =
            "";

        /*
         * If the confirmation field already has
         * a value, re-check password matching.
         */

        if (
            registerConfirmPasswordInput.value
        ) {

            if (
                registerPasswordInput.value !==
                registerConfirmPasswordInput.value
            ) {

                registerConfirmPasswordError.textContent =
                    "Passwords do not match.";

                registerConfirmPasswordInput.classList.add(
                    "input-error"
                );

            } else {

                registerConfirmPasswordError.textContent =
                    "";

                registerConfirmPasswordInput.classList.remove(
                    "input-error"
                );
            }
        }
    }
);


registerConfirmPasswordInput.addEventListener(
    "input",
    () => {

        registerConfirmPasswordInput.classList.remove(
            "input-error"
        );

        registerConfirmPasswordError.textContent =
            "";


        if (
            registerConfirmPasswordInput.value &&
            registerPasswordInput.value !==
            registerConfirmPasswordInput.value
        ) {

            registerConfirmPasswordError.textContent =
                "Passwords do not match.";

            registerConfirmPasswordInput.classList.add(
                "input-error"
            );
        }
    }
);


/* =====================================================
   LOGIN REAL-TIME ERROR CLEANUP
===================================================== */

employeeIdInput.addEventListener(
    "input",
    () => {

        employeeIdInput.classList.remove(
            "input-error"
        );

        employeeIdError.textContent =
            "";
    }
);


passwordInput.addEventListener(
    "input",
    () => {

        passwordInput.classList.remove(
            "input-error"
        );

        passwordError.textContent =
            "";
    }
);


/* =====================================================
   PREVENT ACCIDENTAL DOUBLE SUBMISSION
===================================================== */

/*
 * The submit buttons are disabled while their respective
 * requests are running.
 *
 * This is already handled by setLoginLoading() and
 * setRegisterLoading().
 *
 * We intentionally do NOT globally disable both forms,
 * because login and registration are separate views.
 */


/* =====================================================
   INITIAL AUTH STATE
===================================================== */
showLogin();