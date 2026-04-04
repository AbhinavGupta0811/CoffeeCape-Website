/************************************************************
 * ELEMENTS
 ************************************************************/
const toast = document.getElementById("toast");

const saveProfileBtn = document.getElementById("saveProfileBtn");
const changePasswordBtn = document.getElementById("changePasswordBtn");

const firstNameInput = document.getElementById("firstName");
const lastNameInput = document.getElementById("lastName");
const phoneInput = document.getElementById("phone");

const currentPasswordInput = document.getElementById("currentPassword");
const newPasswordInput = document.getElementById("newPassword");
const confirmPasswordInput = document.getElementById("confirmPassword");

const profilePreview = document.getElementById("profilePreview");
const emailField = document.getElementById("emailField");

const profileImageInput = document.getElementById("profileImage");

const emailNotifications = document.getElementById("emailNotifications");
const orderNotifications = document.getElementById("orderNotifications");
const messageNotifications = document.getElementById("messageNotifications");

const siteNameInput = document.getElementById("siteName");
const supportEmailInput = document.getElementById("supportEmail");
const contactNumberInput = document.getElementById("contactNumber");

const themeMode = document.getElementById("themeMode");

const logoutAllBtn = document.getElementById("logoutAllBtn");

const deleteAccountBtn = document.getElementById("deleteAccountBtn");
const deleteModal = document.getElementById("deleteModal");
const cancelDelete = document.getElementById("cancelDelete");
const confirmDelete = document.getElementById("confirmDelete");
const deletePassword = document.getElementById("deletePassword");


/************************************************************
 * TOAST FUNCTION
 ************************************************************/
function showToast(message, type = "success") {

  if (!toast) return;

  toast.className = `toast ${type}`;
  toast.textContent = message;
  toast.style.display = "block";

  setTimeout(() => {
    toast.style.display = "none";
  }, 3000);

}


/************************************************************
 * LOAD ADMIN PROFILE
 ************************************************************/
document.addEventListener("DOMContentLoaded", loadProfile);

async function loadProfile() {

  try {

    const res = await fetch("/api/admin/profile", {
      credentials: "include"
    });

    if (!res.ok) throw new Error("Failed to fetch profile");

    const data = await res.json();

    firstNameInput.value = data.first_name || "";
    lastNameInput.value = data.last_name || "";
    phoneInput.value = data.phone || "";
    emailField.textContent = data.email || "N/A";

    profilePreview.src = data.profile_image
      ? `/uploads/profile/${data.profile_image}`
      : "/assets/user-default.png";

  } catch (err) {

    console.error("Profile load error:", err);
    showToast("Failed to load profile", "error");

  }

}


/************************************************************
 * PROFILE IMAGE UPLOAD
 ************************************************************/
if (profileImageInput) {

  profileImageInput.addEventListener("change", async (e) => {

    const file = e.target.files[0];

    if (!file) return;

    const formData = new FormData();
    formData.append("image", file);

    try {

      const res = await fetch("/api/admin/profile-image", {
        method: "POST",
        credentials: "include",
        body: formData
      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        return showToast("Upload failed", "error");
      }

      profilePreview.src = `/uploads/profile/${result.image}`;
      showToast("Profile image updated");

    } catch (err) {

      console.error(err);
      showToast("Upload error", "error");

    }

  });

}


/************************************************************
 * UPDATE PROFILE
 ************************************************************/
if (saveProfileBtn) {

  saveProfileBtn.addEventListener("click", async () => {

    const first_name = firstNameInput.value.trim();
    const last_name = lastNameInput.value.trim();
    const phone = phoneInput.value.trim();

    if (!first_name || !last_name) {
      return showToast("Name fields cannot be empty", "error");
    }

    try {

      const res = await fetch("/api/admin/profile", {

        method: "PUT",

        headers: { "Content-Type": "application/json" },

        credentials: "include",

        body: JSON.stringify({ first_name, last_name, phone })

      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        return showToast(result.message || "Update failed", "error");
      }

      showToast("Profile updated successfully");

    } catch (err) {

      console.error(err);
      showToast("Server error", "error");

    }

  });

}


/************************************************************
 * CHANGE PASSWORD
 ************************************************************/
if (changePasswordBtn) {

  changePasswordBtn.addEventListener("click", async () => {

    const currentPassword = currentPasswordInput.value.trim();
    const newPassword = newPasswordInput.value.trim();
    const confirmPassword = confirmPasswordInput.value.trim();

    if (!currentPassword || !newPassword || !confirmPassword) {
      return showToast("All password fields required", "error");
    }

    if (newPassword.length < 8) {
      return showToast("Password must be at least 8 characters", "error");
    }

    if (newPassword !== confirmPassword) {
      return showToast("Passwords do not match", "error");
    }

    try {

      const res = await fetch("/api/admin/change-password", {

        method: "PUT",

        headers: { "Content-Type": "application/json" },

        credentials: "include",

        body: JSON.stringify({ currentPassword, newPassword })

      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        return showToast(result.message || "Password change failed", "error");
      }

      showToast("Password updated successfully");

      currentPasswordInput.value = "";
      newPasswordInput.value = "";
      confirmPasswordInput.value = "";

    } catch (err) {

      console.error(err);
      showToast("Server error", "error");

    }

  });

}


/************************************************************
 * NOTIFICATION SETTINGS
 ************************************************************/
const saveNotificationBtn = document.getElementById("saveNotificationBtn");

if (saveNotificationBtn) {

  saveNotificationBtn.addEventListener("click", async () => {

    const settings = {
      email: emailNotifications?.checked,
      orders: orderNotifications?.checked,
      messages: messageNotifications?.checked
    };

    try {

      const res = await fetch("/api/admin/notifications", {

        method: "PUT",

        credentials: "include",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify(settings)

      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        return showToast("Failed to save notifications", "error");
      }

      showToast("Notification settings saved");

    } catch (err) {

      console.error(err);
      showToast("Server error", "error");

    }

  });

}


/************************************************************
 * WEBSITE SETTINGS
 ************************************************************/
const saveWebsiteBtn = document.getElementById("saveWebsiteBtn");

if (saveWebsiteBtn) {

  saveWebsiteBtn.addEventListener("click", async () => {

    const siteSettings = {
      siteName: siteNameInput?.value,
      supportEmail: supportEmailInput?.value,
      contactNumber: contactNumberInput?.value
    };

    try {

      const res = await fetch("/api/admin/settings", {

        method: "PUT",

        credentials: "include",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify(siteSettings)

      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        return showToast("Update failed", "error");
      }

      showToast("Website settings updated");

    } catch (err) {

      console.error(err);
      showToast("Server error", "error");

    }

  });

}


/************************************************************
 * THEME SETTINGS
 ************************************************************/
const saveThemeBtn = document.getElementById("saveThemeBtn");

if (saveThemeBtn) {

  saveThemeBtn.addEventListener("click", async () => {

    const theme = themeMode.value;

    try {

      await fetch("/api/admin/theme", {

        method: "PUT",

        credentials: "include",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({ theme })

      });

      document.documentElement.setAttribute("data-theme", theme);
      localStorage.setItem("adminTheme", theme);

      showToast("Theme updated");

    } catch (err) {

      console.error(err);
      showToast("Theme save failed", "error");

    }

  });

}


/************************************************************
 * LOGOUT ALL DEVICES
 ************************************************************/
if (logoutAllBtn) {

  logoutAllBtn.addEventListener("click", async () => {

    if (!confirm("Logout from all devices?")) return;

    try {

      const res = await fetch("/api/admin/logout-all", {
        method: "POST",
        credentials: "include"
      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        return showToast("Logout failed", "error");
      }

      window.location.href = "/admin/login.html";

    } catch (err) {

      console.error(err);
      showToast("Server error", "error");

    }

  });

}


/************************************************************
 * DELETE ACCOUNT MODAL
 ************************************************************/
if (deleteAccountBtn) {

  deleteAccountBtn.addEventListener("click", () => {

    deleteModal.classList.add("active");
    deletePassword.value = "";

  });

}

if (cancelDelete) {

  cancelDelete.addEventListener("click", () => {
    deleteModal.classList.remove("active");
  });

}

if (confirmDelete) {

  confirmDelete.addEventListener("click", async () => {

    const password = deletePassword.value.trim();

    if (!password) {
      return showToast("Password required", "error");
    }

    try {

      confirmDelete.disabled = true;
      confirmDelete.textContent = "Deleting...";

      const res = await fetch("/api/admin/account", {

        method: "DELETE",

        credentials: "include",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({ password })

      });

      const result = await res.json();

      if (!res.ok || !result.success) {

        confirmDelete.disabled = false;
        confirmDelete.textContent = "Delete Account";

        return showToast(result.message || "Delete failed", "error");

      }

      showToast("Account deleted successfully");

      setTimeout(() => {
        window.location.href = "/Auth.html";
      }, 1500);

    } catch (err) {

      console.error(err);

      confirmDelete.disabled = false;
      confirmDelete.textContent = "Delete Account";

      showToast("Server error", "error");

    }

  });

}