/************************************************************
 * API PATHS
*************************************************************/
const API = {
  USERS_STATS: "/api/admin/users/stats",
  USERS: "/api/admin/users",
  USER_DETAILS: id => `/api/admin/users/${id}`,
  LOGOUT: "/api/admin/logout",
  LOGIN_PAGE: "/Auth.html"
};

/************************************************************
 * ELEMENTS
 ************************************************************/
const usersTableBody = document.querySelector("#usersTable tbody");
const logoutBtn = document.getElementById("logoutBtn");

/************************************************************
 * LOAD USERS
 ************************************************************/
async function loadUsers() {
  if (!usersTableBody) return;
  try {
    const res = await fetch(API.USERS, {
      credentials: "include"
    });

    if (res.status === 401) {
      location.href = API.LOGIN_PAGE;
      return;
    }
    const data = await res.json();
    usersTableBody.innerHTML = "";

    if (!data.users.length) {
      usersTableBody.innerHTML = `
        <tr>
          <td colspan="6" class="empty">
            No users found
          </td>
        </tr>
      `;
      return;
    }

    data.users.forEach(u => {
      const isBlocked = u.status === "blocked";
      usersTableBody.insertAdjacentHTML("beforeend", `
        <tr>

          <td>US00${u.id}</td>
          <td>${u.first_name} ${u.last_name}</td>
          <td>${u.email}</td>
          <td>${u.phone || "Not Provided"}</td>
          <td>${u.role.toUpperCase()}</td>
          <td>${new Date(u.created_at).toLocaleDateString()}</td>

          <td>
            <span class="status ${u.status}">
              ${u.status}
            </span>
          </td>

          <td>

            <button class="btn-view" data-user-id="${u.id}">
              View
            </button>

            ${
              u.email.toLowerCase() === "admin@coffeecape.com"
              ? `
                <button class="btn-secondary" disabled>
                  Protected
                </button>
              `
              : `
                <button
                  class="${isBlocked ? "btn-primary" : "btn-danger"}"
                  data-action="toggle-user"
                  data-id="${u.id}"
                  data-status="${u.status}"
                >
                  ${isBlocked ? "Activate" : "Block"}
                </button>
              `
            }
          </td>
        </tr>
      `);
    });
  } catch (err) {
    console.error("Load users error:", err);
    usersTableBody.innerHTML = `
      <tr>
        <td colspan="6" class="empty">
          Failed to load users
        </td>
      </tr>
    `;
  }
}

/************************************************************
 * USERS TABLE EVENTS (VIEW + BLOCK / ACTIVATE)
 ************************************************************/
if (usersTableBody) {
  usersTableBody.addEventListener("click", async e => {
    /* ===== VIEW USER DETAILS ===== */
    const viewBtn = e.target.closest(".btn-view");
    if (viewBtn) {
      const userId = viewBtn.dataset.userId;
      try {
        const res = await fetch(API.USER_DETAILS(userId), {
          credentials: "include"
        });
        if (res.status === 401) {
          location.href = API.LOGIN_PAGE;
          return;
        }

        const data = await res.json();
        if (!data.success || !data.user) {
          alert("Failed to load user details");
          return;
        }
        const u = data.user;
        document.getElementById("userDetailContent").innerHTML = `
          <p><strong>First Name:</strong> ${u.first_name || "-"}</p>
          <p><strong>Last Name:</strong> ${u.last_name || "-"}</p>
          <p><strong>Email:</strong> ${u.email}</p>
          <p><strong>Phone:</strong> ${u.phone || "-"}</p>

          <hr>

          <p><strong>Street:</strong> ${u.street || "-"}</p>
          <p><strong>City:</strong> ${u.city || "-"}</p>
          <p><strong>ZIP:</strong> ${u.zip || "-"}</p>
          <p><strong>Country:</strong> ${u.country || "-"}</p>

          <hr>

          <p><strong>Joined:</strong> ${new Date(u.created_at).toLocaleString()}</p>
        `;
        document.getElementById("userDetailModal").classList.add("active");
      } catch (err) {
        console.error("User detail fetch error:", err);
        alert("Error loading user details");
      }
      document.getElementById("closeUserModal")?.addEventListener("click", ()=>{
        document.getElementById("userDetailModal").classList.remove("active");
      });
    }

    /* ===== BLOCK / ACTIVATE USER ===== */
    const toggleBtn = e.target.closest("[data-action='toggle-user']");
    if (toggleBtn) {
      const userId = toggleBtn.dataset.id;
      const currentStatus = toggleBtn.dataset.status;

      const newStatus =
        currentStatus === "active" ? "blocked" : "active";

      if (!confirm(`Are you sure you want to ${newStatus} this user?`)) {
        return;
      }

      try {
        const res = await fetch(`/api/admin/users/${userId}/status`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status: newStatus })
        });

        if (!res.ok) {
          alert("Failed to update user status");
          return;
        }

        loadUsers(); // refresh
      } catch (err) {
        console.error("Toggle user error:", err);
        alert("Server error");
      }
    }
  });
}

/************************************************************
 * INIT
 ************************************************************/
document.addEventListener("DOMContentLoaded",()=>{
  loadUsers();
});