"use strict";
document.addEventListener("DOMContentLoaded", () => {
    const API_BASE = "/api/delivery/auth";
    const state = {
        user: null,
        originalProfile: null,
        isLoading: false,
        isSavingProfile: false,
        isChangingPassword: false,
        isLoggingOut: false
    };
    const elements = {
        backButton: document.getElementById("backButton"),
        profileForm: document.getElementById("profileForm"),
        fullName: document.getElementById("fullName"),
        email: document.getElementById("email"),
        phone: document.getElementById("phone"),
        deliveryId: document.getElementById("deliveryId"),
        profileName: document.getElementById("profileName"),
        profileEmployeeId: document.getElementById("profileEmployeeId"),
        profileAvatar: document.getElementById("profileAvatar"),
        accountStatus: document.getElementById("accountStatus"),
        securityAccountStatus: document.getElementById("securityAccountStatus"),
        securityDeliveryId: document.getElementById("securityDeliveryId"),
        cancelProfileButton: document.getElementById("cancelProfileButton"),
        saveProfileButton: document.getElementById("saveProfileButton"),
        changePasswordForm: document.getElementById("changePasswordForm"),
        currentPassword: document.getElementById("currentPassword"),
        newPassword: document.getElementById("newPassword"),
        confirmPassword: document.getElementById("confirmPassword"),
        clearPasswordButton: document.getElementById("clearPasswordButton"),
        changePasswordButton: document.getElementById("changePasswordButton"),
        passwordLengthRequirement: document.getElementById("passwordLengthRequirement"),
        passwordDifferentRequirement: document.getElementById("passwordDifferentRequirement"),
        passwordMatchRequirement: document.getElementById("passwordMatchRequirement"),
        logoutButton: document.getElementById("logoutButton"),
        logoutModal: document.getElementById("logoutModal"),
        cancelLogoutButton: document.getElementById("cancelLogoutButton"),
        confirmLogoutButton: document.getElementById("confirmLogoutButton"),
        profileLoader: document.getElementById("profileLoader"),
        toastContainer: document.getElementById("toastContainer"),
        fullNameError: document.getElementById("fullNameError"),
        emailError: document.getElementById("emailError"),
        phoneError: document.getElementById("phoneError"),
        currentPasswordError: document.getElementById("currentPasswordError"),
        newPasswordError: document.getElementById("newPasswordError"),
        confirmPasswordError: document.getElementById("confirmPasswordError")
    };
    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
    function normalizeText(value) {
        return String(value || "").trim().replace(/\s+/g, " ");
    }
    function normalizeEmail(value) {
        return String(value || "").trim().toLowerCase();
    }
    function normalizePhone(value) {
        return String(value || "").replace(/\D/g, "");
    }
    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }
    function isValidPhone(phone) {
        return phone.length >= 10 && phone.length <= 15;
    }
    function isValidName(name) {
        return name.length >= 2 && name.length <= 100 && !/[\x00-\x1F\x7F]/.test(name);
    }
    function isValidPassword(password) {
        return password.length >= 8 && BufferSafeByteLength(password) <= 72;
    }
    function BufferSafeByteLength(value) {
        try {
            return new TextEncoder().encode(String(value)).length;
        } catch (error) {
            return unescape(encodeURIComponent(String(value))).length;
        }
    }
    async function parseResponse(response) {
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
            try {
                return await response.json();
            } catch (error) {
                return {
                    success: false,
                    message: "The server returned an invalid response."
                };
            }
        }
        const text = await response.text();
        return {
            success: false,
            message: text || "Unexpected server response."
        };
    }
    async function apiRequest(url, options = {}) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        try {
            const response = await fetch(url, {
                ...options,
                credentials: "include",
                headers: {
                    Accept: "application/json",
                    ...(options.body ? { "Content-Type": "application/json" } : {}),
                    ...(options.headers || {})
                },
                signal: controller.signal
            });
            const data = await parseResponse(response);
            return {
                response,
                data,
                ok: response.ok
            };
        } catch (error) {
            if (error.name === "AbortError") {
                throw new Error("The request took too long. Please check your connection and try again.");
            }
            throw new Error("Unable to connect to the server. Please check your connection and try again.");
        } finally {
            clearTimeout(timeoutId);
        }
    }
    function showLoader(message = "Loading your profile...") {
        if (!elements.profileLoader) return;
        const messageElement = elements.profileLoader.querySelector("p");
        if (messageElement) {
            messageElement.textContent = message;
        }
        elements.profileLoader.classList.add("active");
        elements.profileLoader.setAttribute("aria-hidden", "false");
    }
    function hideLoader() {
        if (!elements.profileLoader) return;
        elements.profileLoader.classList.remove("active");
        elements.profileLoader.setAttribute("aria-hidden", "true");
    }
    function getToastIcon(type) {
        const icons = {
            success: "fa-circle-check",
            error: "fa-circle-exclamation",
            warning: "fa-triangle-exclamation",
            info: "fa-circle-info"
        };
        return icons[type] || icons.info;
    }
    function showToast(message, type = "info", duration = 4000) {
        if (!elements.toastContainer) return;
        const toast = document.createElement("div");
        toast.className = `toast ${type}`;
        toast.setAttribute("role", type === "error" ? "alert" : "status");
        toast.innerHTML = `
            <div class="toast-icon">
                <i class="fa-solid ${getToastIcon(type)}"></i>
            </div>
            <div class="toast-message">${escapeHtml(message)}</div>
            <button type="button" class="toast-close" aria-label="Close notification">
                <i class="fa-solid fa-xmark"></i>
            </button>
        `;
        const closeButton = toast.querySelector(".toast-close");
        let removeTimer = null;
        const removeToast = () => {
            if (removeTimer) clearTimeout(removeTimer);
            toast.style.opacity = "0";
            toast.style.transform = "translateX(18px)";
            toast.style.transition = "opacity 0.2s ease, transform 0.2s ease";
            setTimeout(() => toast.remove(), 200);
        };
        closeButton.addEventListener("click", removeToast);
        elements.toastContainer.appendChild(toast);
        removeTimer = setTimeout(removeToast, duration);
    }
    function clearFieldError(input, errorElement) {
        if (!input || !errorElement) return;
        input.closest(".input-wrapper")?.classList.remove("input-error");
        errorElement.textContent = "";
    }
    function setFieldError(input, errorElement, message) {
        if (!input || !errorElement) return;
        input.closest(".input-wrapper")?.classList.add("input-error");
        errorElement.textContent = message;
    }
    function clearProfileErrors() {
        clearFieldError(elements.fullName, elements.fullNameError);
        clearFieldError(elements.email, elements.emailError);
        clearFieldError(elements.phone, elements.phoneError);
    }
    function clearPasswordErrors() {
        clearFieldError(elements.currentPassword, elements.currentPasswordError);
        clearFieldError(elements.newPassword, elements.newPasswordError);
        clearFieldError(elements.confirmPassword, elements.confirmPasswordError);
    }
    function setButtonLoading(button, loading, loadingText, defaultText) {
        if (!button) return;
        if (loading) {
            button.disabled = true;
            button.classList.add("button-loading");
            button.dataset.originalHtml = button.innerHTML;
            button.innerHTML = `
                <i class="fa-solid fa-spinner"></i>
                <span>${escapeHtml(loadingText)}</span>
            `;
            return;
        }
        button.disabled = false;
        button.classList.remove("button-loading");
        button.innerHTML = button.dataset.originalHtml || `
            <i class="fa-solid fa-floppy-disk"></i>
            <span>${escapeHtml(defaultText)}</span>
        `;
        delete button.dataset.originalHtml;
    }
    function updateProfileHeader(user) {
        const name = normalizeText(user.name) || "Delivery Partner";
        const employeeId = String(user.employeeId || "").trim() || "N/A";
        const status = String(user.status || "active").trim().toLowerCase();
        elements.profileName.textContent = name;
        elements.profileEmployeeId.textContent = employeeId;
        elements.securityDeliveryId.textContent = employeeId;
        elements.securityAccountStatus.textContent = formatStatus(status);
        elements.profileAvatar.textContent = getInitials(name);
        elements.profileAvatar.innerHTML = getInitials(name)
            ? `<span>${escapeHtml(getInitials(name))}</span>`
            : `<i class="fa-solid fa-user"></i>`;
        updateAccountStatus(status);
    }
    function getInitials(name) {
        const words = normalizeText(name).split(" ").filter(Boolean);
        if (!words.length) return "";
        if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
        return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
    }
    function formatStatus(status) {
        const normalized = String(status || "").toLowerCase();
        if (normalized === "active") return "Active";
        if (normalized === "inactive") return "Inactive";
        if (normalized === "suspended") return "Suspended";
        if (normalized === "blocked") return "Blocked";
        return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : "Unknown";
    }
    function updateAccountStatus(status) {
        const normalized = String(status || "active").toLowerCase();
        const isActive = normalized === "active";
        elements.accountStatus.className = `account-status ${isActive ? "active" : ""}`;
        elements.accountStatus.innerHTML = `
            <i class="fa-solid fa-circle"></i>
            <span>${escapeHtml(formatStatus(normalized))}</span>
        `;
    }
    function populateProfile(user) {
        elements.fullName.value = normalizeText(user.name);
        elements.email.value = normalizeEmail(user.email);
        elements.phone.value = normalizePhone(user.phone);
        elements.deliveryId.value = String(user.employeeId || "");
        updateProfileHeader(user);
    }
    function captureOriginalProfile() {
        state.originalProfile = {
            name: elements.fullName.value,
            email: elements.email.value,
            phone: elements.phone.value
        };
    }
    function restoreOriginalProfile() {
        if (!state.originalProfile) return;
        elements.fullName.value = state.originalProfile.name;
        elements.email.value = state.originalProfile.email;
        elements.phone.value = state.originalProfile.phone;
        clearProfileErrors();
        removeInputSuccessStates();
    }
    function removeInputSuccessStates() {
        [elements.fullName, elements.email, elements.phone].forEach((input) => {
            input?.closest(".input-wrapper")?.classList.remove("input-success");
        });
    }
    function hasProfileChanges() {
        if (!state.originalProfile) return false;
        return (
            normalizeText(elements.fullName.value) !== state.originalProfile.name ||
            normalizeEmail(elements.email.value) !== state.originalProfile.email ||
            normalizePhone(elements.phone.value) !== state.originalProfile.phone
        );
    }
    function validateProfileForm() {
        clearProfileErrors();
        let valid = true;
        const name = normalizeText(elements.fullName.value);
        const email = normalizeEmail(elements.email.value);
        const phone = normalizePhone(elements.phone.value);
        if (!name) {
            setFieldError(elements.fullName, elements.fullNameError, "Full name is required.");
            valid = false;
        } else if (!isValidName(name)) {
            setFieldError(elements.fullName, elements.fullNameError, "Please enter a valid name.");
            valid = false;
        }
        if (!email) {
            setFieldError(elements.email, elements.emailError, "Email address is required.");
            valid = false;
        } else if (email.length > 255 || !isValidEmail(email)) {
            setFieldError(elements.email, elements.emailError, "Please enter a valid email address.");
            valid = false;
        }
        if (!phone) {
            setFieldError(elements.phone, elements.phoneError, "Phone number is required.");
            valid = false;
        } else if (!isValidPhone(phone)) {
            setFieldError(elements.phone, elements.phoneError, "Please enter a valid phone number.");
            valid = false;
        }
        return {
            valid,
            values: { name, email, phone }
        };
    }
    function validatePasswordForm() {
        clearPasswordErrors();
        const currentPassword = elements.currentPassword.value;
        const newPassword = elements.newPassword.value;
        const confirmPassword = elements.confirmPassword.value;
        let valid = true;
        if (!currentPassword) {
            setFieldError(elements.currentPassword, elements.currentPasswordError, "Current password is required.");
            valid = false;
        }
        if (!newPassword) {
            setFieldError(elements.newPassword, elements.newPasswordError, "New password is required.");
            valid = false;
        } else if (newPassword.length < 8) {
            setFieldError(elements.newPassword, elements.newPasswordError, "Password must be at least 8 characters long.");
            valid = false;
        } else if (BufferSafeByteLength(newPassword) > 72) {
            setFieldError(elements.newPassword, elements.newPasswordError, "Password must not exceed 72 bytes.");
            valid = false;
        }
        if (!confirmPassword) {
            setFieldError(elements.confirmPassword, elements.confirmPasswordError, "Please confirm your new password.");
            valid = false;
        } else if (newPassword !== confirmPassword) {
            setFieldError(elements.confirmPassword, elements.confirmPasswordError, "Passwords do not match.");
            valid = false;
        }
        if (currentPassword && newPassword && currentPassword === newPassword) {
            setFieldError(elements.newPassword, elements.newPasswordError, "New password must be different from the current password.");
            valid = false;
        }
        return {
            valid,
            values: {
                currentPassword,
                newPassword
            }
        };
    }
    function updatePasswordRequirements() {
        const currentPassword = elements.currentPassword.value;
        const newPassword = elements.newPassword.value;
        const confirmPassword = elements.confirmPassword.value;
        const lengthValid = newPassword.length >= 8 && BufferSafeByteLength(newPassword) <= 72;
        const differentValid = Boolean(newPassword) && Boolean(currentPassword) && newPassword !== currentPassword;
        const matchValid = Boolean(newPassword) && Boolean(confirmPassword) && newPassword === confirmPassword;
        setRequirementState(elements.passwordLengthRequirement, lengthValid);
        setRequirementState(elements.passwordDifferentRequirement, differentValid);
        setRequirementState(elements.passwordMatchRequirement, matchValid);
    }
    function setRequirementState(element, valid) {
        if (!element) return;
        element.classList.toggle("valid", valid);
        const icon = element.querySelector("i");
        if (!icon) return;
        icon.className = valid
            ? "fa-solid fa-circle-check"
            : "fa-solid fa-circle";
    }
    async function loadProfile() {
        if (state.isLoading) return;
        state.isLoading = true;
        showLoader("Loading your profile...");
        try {
            const result = await apiRequest(`${API_BASE}/me`, {
                method: "GET"
            });
            if (!result.ok || !result.data?.success || !result.data?.user) {
                if (result.response.status === 401) {
                    handleUnauthorized("Your delivery session has expired. Please log in again.");
                    return;
                }
                throw new Error(result.data?.message || "Unable to retrieve your delivery profile.");
            }
            state.user = result.data.user;
            populateProfile(state.user);
            captureOriginalProfile();
            if (Boolean(state.user.forcePasswordChange)) {
                showToast("For account security, please change your password.", "warning", 6000);
                setTimeout(() => {
                    elements.changePasswordForm?.scrollIntoView({
                        behavior: "smooth",
                        block: "center"
                    });
                }, 300);
            }
        } catch (error) {
            console.error("Delivery profile load error:", error);
            showToast(error.message || "Unable to load your profile.", "error", 6000);
        } finally {
            state.isLoading = false;
            hideLoader();
        }
    }
    async function saveProfile(event) {
        event.preventDefault();
        if (state.isSavingProfile) return;
        const validation = validateProfileForm();
        if (!validation.valid) {
            showToast("Please correct the highlighted fields.", "error");
            return;
        }
        if (!hasProfileChanges()) {
            showToast("There are no profile changes to save.", "info");
            return;
        }
        state.isSavingProfile = true;
        setButtonLoading(elements.saveProfileButton, true, "Saving...", "Save Changes");
        try {
            const result = await apiRequest(`${API_BASE}/profile`, {
                method: "PUT",
                body: JSON.stringify(validation.values)
            });
            if (!result.ok || !result.data?.success) {
                if (result.response.status === 401) {
                    handleUnauthorized("Your delivery session has expired. Please log in again.");
                    return;
                }
                throw new Error(result.data?.message || "Unable to update your profile.");
            }
            const updatedUser = result.data.user || {
                ...state.user,
                ...validation.values
            };
            state.user = {
                ...state.user,
                ...updatedUser
            };
            populateProfile(state.user);
            captureOriginalProfile();
            removeInputSuccessStates();
            [elements.fullName, elements.email, elements.phone].forEach((input) => {
                input.closest(".input-wrapper")?.classList.add("input-success");
            });
            showToast(result.data.message || "Profile updated successfully.", "success");
            setTimeout(removeInputSuccessStates, 1800);
        } catch (error) {
            console.error("Delivery profile update error:", error);
            showToast(error.message || "Unable to update your profile.", "error", 6000);
        } finally {
            state.isSavingProfile = false;
            setButtonLoading(elements.saveProfileButton, false, "Saving...", "Save Changes");
        }
    }
    async function changePassword(event) {
        event.preventDefault();
        if (state.isChangingPassword) return;
        const validation = validatePasswordForm();
        if (!validation.valid) {
            updatePasswordRequirements();
            showToast("Please correct the password fields.", "error");
            return;
        }
        state.isChangingPassword = true;
        setButtonLoading(elements.changePasswordButton, true, "Changing...", "Change Password");
        try {
            const result = await apiRequest(`${API_BASE}/change-password`, {
                method: "POST",
                body: JSON.stringify(validation.values)
            });
            if (!result.ok || !result.data?.success) {
                if (result.response.status === 401) {
                    showToast(result.data?.message || "Your current password is incorrect.", "error", 5000);
                    return;
                }
                if (result.response.status === 400) {
                    showToast(result.data?.message || "Please check your password details.", "error", 5000);
                    return;
                }
                throw new Error(result.data?.message || "Unable to change your password.");
            }
            clearPasswordForm();
            showToast(
                result.data.message || "Password changed successfully. Please log in again.",
                "success",
                6000
            );
            setTimeout(() => {
                window.location.href = "/delivery/login.html";
            }, 1800);
        } catch (error) {
            console.error("Delivery password change error:", error);
            showToast(error.message || "Unable to change your password.", "error", 6000);
        } finally {
            state.isChangingPassword = false;
            setButtonLoading(elements.changePasswordButton, false, "Changing...", "Change Password");
        }
    }
    function clearPasswordForm() {
        elements.currentPassword.value = "";
        elements.newPassword.value = "";
        elements.confirmPassword.value = "";
        clearPasswordErrors();
        updatePasswordRequirements();
    }
    function togglePasswordVisibility(button) {
        const targetId = button.dataset.target;
        const input = document.getElementById(targetId);
        if (!input) return;
        const shouldShow = input.type === "password";
        input.type = shouldShow ? "text" : "password";
        const icon = button.querySelector("i");
        if (icon) {
            icon.className = shouldShow
                ? "fa-solid fa-eye-slash"
                : "fa-solid fa-eye";
        }
        button.setAttribute(
            "aria-label",
            shouldShow ? "Hide password" : "Show password"
        );
    }
    function openLogoutModal() {
        if (state.isLoggingOut) return;
        elements.logoutModal.classList.add("active");
        elements.logoutModal.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
    }
    function closeLogoutModal() {
        elements.logoutModal.classList.remove("active");
        elements.logoutModal.setAttribute("aria-hidden", "true");
        document.body.style.overflow = "";
    }
    async function logout() {
        if (state.isLoggingOut) return;
        state.isLoggingOut = true;
        setButtonLoading(elements.confirmLogoutButton, true, "Signing Out...", "Sign Out");
        try {
            const result = await apiRequest(`${API_BASE}/logout`, {
                method: "POST"
            });
            if (!result.ok || !result.data?.success) {
                if (result.response.status === 401) {
                    window.location.href = "/delivery/login.html";
                    return;
                }
                throw new Error(result.data?.message || "Unable to sign out.");
            }
            showToast(result.data.message || "Logged out successfully.", "success", 2500);
            setTimeout(() => {
                window.location.href = "/delivery/login.html";
            }, 700);
        } catch (error) {
            console.error("Delivery logout error:", error);
            showToast(error.message || "Unable to complete logout.", "error", 5000);
        } finally {
            state.isLoggingOut = false;
            setButtonLoading(elements.confirmLogoutButton, false, "Signing Out...", "Sign Out");
        }
    }
    function handleUnauthorized(message) {
        closeLogoutModal();
        showToast(message, "warning", 4500);
        setTimeout(() => {
            window.location.href = "/delivery/login.html";
        }, 1400);
    }
    function handleBackNavigation() {
        if (window.history.length > 1) {
            window.history.back();
            return;
        }
        window.location.href = "/delivery/dashboard.html";
    }
    function bindInputValidation() {
        elements.fullName?.addEventListener("input", () => {
            clearFieldError(elements.fullName, elements.fullNameError);
        });
        elements.email?.addEventListener("input", () => {
            clearFieldError(elements.email, elements.emailError);
        });
        elements.phone?.addEventListener("input", () => {
            elements.phone.value = elements.phone.value.replace(/\D/g, "");
            clearFieldError(elements.phone, elements.phoneError);
        });
        elements.currentPassword?.addEventListener("input", () => {
            clearFieldError(elements.currentPassword, elements.currentPasswordError);
            updatePasswordRequirements();
        });
        elements.newPassword?.addEventListener("input", () => {
            clearFieldError(elements.newPassword, elements.newPasswordError);
            updatePasswordRequirements();
        });
        elements.confirmPassword?.addEventListener("input", () => {
            clearFieldError(elements.confirmPassword, elements.confirmPasswordError);
            updatePasswordRequirements();
        });
    }
    function bindPasswordToggles() {
        document.querySelectorAll(".password-toggle").forEach((button) => {
            button.addEventListener("click", () => togglePasswordVisibility(button));
        });
    }
    function bindEvents() {
        elements.profileForm?.addEventListener("submit", saveProfile);
        elements.changePasswordForm?.addEventListener("submit", changePassword);
        elements.cancelProfileButton?.addEventListener("click", () => {
            if (hasProfileChanges()) {
                restoreOriginalProfile();
                showToast("Profile changes were discarded.", "info");
                return;
            }
            showToast("There are no changes to discard.", "info");
        });
        elements.clearPasswordButton?.addEventListener("click", () => {
            clearPasswordForm();
            showToast("Password fields cleared.", "info");
        });
        elements.logoutButton?.addEventListener("click", openLogoutModal);
        elements.cancelLogoutButton?.addEventListener("click", closeLogoutModal);
        elements.confirmLogoutButton?.addEventListener("click", logout);
        elements.backButton?.addEventListener("click", handleBackNavigation);
        elements.logoutModal?.addEventListener("click", (event) => {
            if (event.target === elements.logoutModal) {
                closeLogoutModal();
            }
        });
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && elements.logoutModal.classList.contains("active")) {
                closeLogoutModal();
            }
        });
        window.addEventListener("pageshow", () => {
            updatePasswordRequirements();
        });
    }
    function initialize() {
        bindEvents();
        bindInputValidation();
        bindPasswordToggles();
        updatePasswordRequirements();
        loadProfile();
    }
    initialize();
});