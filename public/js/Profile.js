/* ===============================
 DOM ELEMENTS
=============================== */
const viewMode = document.getElementById("viewMode");
const editMode = document.getElementById("editMode");
const editBtn = document.getElementById("editBtn");
const saveBtn = document.getElementById("saveBtn");
const cancelBtn = document.getElementById("cancelBtn");
const toast = document.getElementById("toast");

const vFirst = document.getElementById("vFirst");
const vLast = document.getElementById("vLast");
const vPhone = document.getElementById("vPhone");
const vEmail = document.getElementById("vEmail");
const vStreet = document.getElementById("vStreet");
const vCity = document.getElementById("vCity");
const vZip = document.getElementById("vZip");
const vCountry = document.getElementById("vCountry");

const eFirst = document.getElementById("eFirst");
const eLast = document.getElementById("eLast");
const ePhone = document.getElementById("ePhone");
const eEmail = document.getElementById("eEmail");
const eStreet = document.getElementById("eStreet");
const eCity = document.getElementById("eCity");
const eZip = document.getElementById("eZip");
const eCountry = document.getElementById("eCountry");

/* AVATAR */
const avatarBox = document.getElementById("avatarBox");
const avatarInput = document.getElementById("avatarInput");
const avatarImg = document.getElementById("avatarImg");
const avatarText = document.getElementById("avatarText");

/* REGEX */
const nameRegex = /^[A-Za-z]{2,}$/;
const phoneRegex = /^[6-9]\d{9}$/;
const zipRegex = /^\d{4,8}$/;

/* ===============================
   TOAST
   =============================== */
function showToast(msg, type = "info") {
  toast.innerHTML = msg;
  toast.className = `toast show ${type}`;
  setTimeout(() => toast.classList.remove("show"), 3000);
}

/* ===============================
   SAFE FETCH WRAPPER
=============================== */
async function safeFetch(url, options = {}) {
  try {
    const res = await fetch(url, {
      credentials: "include",
      ...options
    });

    let data = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }

    if (res.status === 401) {
      window.location.href = "error.html?type=unauthorized";
      return null;
    }

    if (res.status === 403) {
      showToast(`<i class="fa-solid fa-lock" style="margin-right:6px;"></i> Access denied`, "error");
      return null;
    }

    if (res.status === 404) {
      window.location.href = "error.html?type=notfound";
      return null;
    }

    if (res.status === 409) {
      showToast(`<i class="fa-solid fa-triangle-exclamation" style="margin-right:6px;"></i> Conflict detected`, "warning");
      return null;
    }

    if (res.status === 500) {
      window.location.href = "error.html?type=server";
      return null;
    }

    if (!res.ok) {
      throw new Error(data.message || "Request failed");
    }

    return data;

  } catch (err) {
    console.error("API Error:", err);

    if (!navigator.onLine) {
      window.location.href = "error.html?type=network";
      return null;
    }

    showToast(`<i class="fa-solid fa-circle-xmark" style="margin-right:6px;"></i> Server error`, "error");
    return null;
  }
}

/* ===============================
   LOAD PROFILE (DETAILS + AVATAR)
   =============================== */
async function loadProfile() {
  try {
    const user = await safeFetch("/api/profile");
    if (!user) return;

    /* PROFILE DETAILS */
    document.getElementById("fullName").textContent =
      `${user.first_name} ${user.last_name}`;
    document.getElementById("emailText").textContent = user.email;

    vFirst.textContent = user.first_name;
    vLast.textContent = user.last_name;
    vPhone.textContent = user.phone;
    vEmail.textContent = user.email;
    vStreet.textContent = user.street || "-";
    vCity.textContent = user.city || "-";
    vZip.textContent = user.zip || "-";
    vCountry.textContent = user.country || "-";

    eFirst.value = user.first_name;
    eLast.value = user.last_name;
    ePhone.value = user.phone;
    eEmail.value = user.email;
    eStreet.value = user.street || "";
    eCity.value = user.city || "";
    eZip.value = user.zip || "";
    eCountry.value = user.country || "";

    /* ===============================
       AVATAR – ALWAYS DISPLAY
       =============================== */
    if (user.profile_image && avatarImg && avatarText) {
      avatarImg.src = user.profile_image + "?v=" + Date.now(); // cache safe
      avatarImg.style.display = "block";
      avatarText.style.display = "none";
    } else if (avatarText) {
      avatarText.textContent = user.first_name?.[0] || "U";
    }

  } catch {
    showToast(`<i class="fa-solid fa-circle-xmark" style="margin-right:6px;"></i> Please login again`, "error");
    setTimeout(() => (window.location.href = "Auth.html"), 1500);
  }
}

/* ===============================
   EDIT PROFILE
   =============================== */
editBtn.onclick = () => {
  viewMode.classList.add("hidden");
  editMode.classList.remove("hidden");
};

cancelBtn.onclick = () => {
  editMode.classList.add("hidden");
  viewMode.classList.remove("hidden");
  showToast(`<i class="fa-solid fa-circle-info" style="margin-right:6px;"></i> Edit cancelled`, "info");
};

saveBtn.onclick = async () => {
  const payload = {
    first_name: eFirst.value.trim(),
    last_name: eLast.value.trim(),
    phone: ePhone.value.trim(),
    street: eStreet.value.trim(),
    city: eCity.value.trim(),
    zip: eZip.value.trim(),
    country: eCountry.value.trim()
  };

  if (!nameRegex.test(payload.first_name))
    return showToast(`<i class="fa-solid fa-triangle-exclamation"style="margin-right:6px;"></i> Invalid first name`, "error");

  if (!nameRegex.test(payload.last_name))
    return showToast(`<i class="fa-solid fa-triangle-exclamation"style="margin-right:6px;"></i> Invalid last name`, "error");

  if (!phoneRegex.test(payload.phone))
    return showToast(`<i class="fa-solid fa-triangle-exclamation"style="margin-right:6px;"></i> Invalid phone number`, "error");

  if (payload.zip && !zipRegex.test(payload.zip))
    return showToast(`<i class="fa-solid fa-triangle-exclamation"style="margin-right:6px;"></i> Invalid ZIP code`, "error");

  saveBtn.disabled = true;

  const data = await safeFetch("/api/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!data) {
    saveBtn.disabled = false;
    return;
  }

  if (!data.success) return showToast(data.message || `<i class="fa-solid fa-circle-xmark" style="margin-right:6px;"></i> Update failed`, "error");

  showToast(`<i class="fa-solid fa-circle-check" style="margin-right:6px;"></i> Profile updated successfully`, "success");
  editMode.classList.add("hidden");
  viewMode.classList.remove("hidden");
  loadProfile();
};

/* ===============================
   AVATAR CLICK → UPLOAD → PERSIST
   =============================== */
if (avatarBox && avatarInput && avatarImg && avatarText) {

  avatarBox.addEventListener("click", () => avatarInput.click());

  avatarInput.addEventListener("change", async () => {
    const file = avatarInput.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/"))
      return showToast(`<i class="fa-solid fa-triangle-exclamation"style="margin-right:6px;"></i> Only image files allowed`, "warning");

    if (file.size > 10 * 1024 * 1024)
      return showToast(`<i class="fa-solid fa-triangle-exclamation"style="margin-right:6px;"></i> Image must be under 10MB`, "warning");

    /* PREVIEW */
    avatarImg.src = URL.createObjectURL(file);
    avatarImg.style.display = "block";
    avatarText.style.display = "none";

    /* UPLOAD */
    try {
      const formData = new FormData();
      formData.append("profile_image", file);

      const data = await safeFetch("/api/profile/upload-image", {
        method: "POST",
        body: formData
      });

      if (!data) return;

      if (!data.success)
        return showToast(data.message || `<i class="fa-solid fa-circle-xmark" style="margin-right:6px;"></i> Upload failed`, "error");

      avatarImg.src = data.profile_image + "?v=" + Date.now();
      showToast(`<i class="fa-solid fa-circle-check" style="margin-right:6px;"></i> Profile image updated`, "success");

    } catch {
      showToast(`<i class="fa-solid fa-circle-xmark" style="margin-right:6px;"></i> Image upload failed`, "error");
    }
  });
}

/* ===============================
   INIT
   =============================== */
loadProfile();