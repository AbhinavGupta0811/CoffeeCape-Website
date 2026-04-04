/* =========================
   API CONFIG (TOP)
========================= */
const API = {
  GET_MESSAGES: "/api/admin/contact",
  MARK_READ: "/api/admin/contact/read/",
  DELETE_MESSAGE: "/api/admin/contact/"
};

/* =========================
   DOM ELEMENTS
========================= */
const tableBody = document.querySelector("#messagesTable tbody");
const modal = document.getElementById("messageModal");
const modalContent = document.getElementById("modalContent");
const closeModalBtn = document.getElementById("closeModal");
const backBtn = document.getElementById("backBtn");

/* =========================
   NAVIGATION
========================= */
if (backBtn) {
  backBtn.addEventListener("click", () => {
    window.location.href = "/admin/dashboard.html";
  });
}

if (closeModalBtn) {
  closeModalBtn.addEventListener("click", () => {
    modal.style.display = "none";
  });
}

/* =========================
   LOAD ALL MESSAGES
========================= */
async function loadMessages() {

  if (!tableBody) return; // <-- IMPORTANT FIX

  try {

    const res = await fetch(API.GET_MESSAGES, {
      credentials: "include"
    });

    if (!res.ok) throw new Error("Request failed");

    const result = await res.json();

    const messages = Array.isArray(result)
      ? result
      : result.messages || [];

    tableBody.innerHTML = "";

    if (messages.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center;color:#6b7280;padding:30px">
            No contact messages found
          </td>
        </tr>
      `;
      return;
    }

    messages.forEach(msg => {

      const row = document.createElement("tr");

      row.innerHTML = `
        <td>${msg.name}</td>
        <td>${msg.email}</td>
        <td>${msg.subject}</td>
        <td>
          <span class="badge ${msg.is_read ? "read" : "unread"}">
            ${msg.is_read ? "Read" : "Unread"}
          </span>
        </td>
        <td class="actions">
          <button class="btn-view" data-view="${msg.id}">View</button>
          ${
            !msg.is_read
              ? `<button class="btn-warning" data-read="${msg.id}">Mark Read</button>`
              : ""
          }
          <button class="btn-danger" data-delete="${msg.id}">Delete</button>
        </td>
      `;

      tableBody.appendChild(row);
    });

  } catch (err) {

    console.error("Failed to load messages:", err);

    if (!tableBody) return;

    tableBody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center;color:#dc2626;padding:30px">
          Failed to load messages
        </td>
      </tr>
    `;
  }
}

/* =========================
   TABLE ACTION HANDLER
========================= */
if (tableBody) {

  tableBody.addEventListener("click", async (e) => {

    const viewId = e.target.dataset.view;
    const readId = e.target.dataset.read;
    const deleteId = e.target.dataset.delete;

    /* VIEW MESSAGE */
    if (viewId) {
      try {

        const res = await fetch(API.GET_MESSAGES, {
          credentials: "include"
        });

        const result = await res.json();

        const messages = Array.isArray(result)
          ? result
          : result.messages || [];

        const msg = messages.find(m => m.id == viewId);

        if (!msg) return;

        modalContent.innerHTML = `
          <p><strong>Name:</strong> ${msg.name}</p>
          <p><strong>Email:</strong> ${msg.email}</p>
          <p><strong>Subject:</strong> ${msg.subject}</p>
          <hr>
          <p>${msg.message}</p>
        `;

       modal.classList.add("active");

        /* Auto mark as read */
        if (!msg.is_read) {
          await fetch(API.MARK_READ + viewId, { 
            method: "PUT",
            credentials: "include"
          });
          loadMessages();
        }

      } catch (err) {
        console.error("View message error:", err);
      }
    }

    /* MARK AS READ */
    if (readId) {
      try {
        await fetch(API.MARK_READ + readId, { 
          method: "PUT",
          credentials: "include"
        });
        loadMessages();
      } catch (err) {
        console.error("Mark read error:", err);
      }
    }

    /* DELETE MESSAGE */
    if (deleteId) {
      if (!confirm("Are you sure you want to delete this message?")) return;

      try {
        await fetch(API.DELETE_MESSAGE + deleteId, {
          method: "DELETE",
          credentials: "include"
        });
        loadMessages();
      } catch (err) {
        console.error("Delete message error:", err);
      }
    }

  });
}

/* =========================
   INIT
========================= */
document.addEventListener("DOMContentLoaded", () => {
  loadMessages();
});