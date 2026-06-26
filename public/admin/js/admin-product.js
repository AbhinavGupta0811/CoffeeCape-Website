/* =====================================
   DOM ELEMENTS
===================================== */
const productForm = document.getElementById("productForm");
const productsTable =document.querySelector("#productsTable tbody");
let editMode = false;
let editingProductId = null;
const socket = io();

/* =====================================
   CATEGORY SWITCHER
===================================== */
const categories = [
  {
    key: "hot-beverages",
    label: "Hot Beverages"
  },
  {
    key: "cold-beverages",
    label: "Cold Beverages"
  },
  {
    key: "refreshment-drinks",
    label: "Refreshment Drinks"
  },
  {
    key: "refreshments",
    label: "Refreshments"
  },
  {
    key: "desserts",
    label: "Desserts"
  },
  {
    key: "burgers",
    label: "Burgers"
  },
  {
    key: "fries",
    label: "Fries"
  },
  {
    key: "combos",
    label: "Combos"
  }
];

let currentCategoryIndex = 0;

const activeCategoryName =
  document.getElementById(
    "activeCategoryName"
  );

const prevCategory =
  document.getElementById(
    "prevCategory"
  );

const nextCategory =
  document.getElementById(
    "nextCategory"
  );

/* =====================================
   API BASE
===================================== */
const API = "/api/admin/products";
function escapeHTML(str) {
  return str
    ?.replace(/&/g, "&amp;")
    ?.replace(/</g, "&lt;")
    ?.replace(/>/g, "&gt;")
    ?.replace(/"/g, "&quot;")
    ?.replace(/'/g, "&#039;");
}

/* =====================================
   INITIALIZE
===================================== */
document.addEventListener(
  "DOMContentLoaded",
  () => {

    loadProducts();
    initCategorySwitcher();
    initForm();
  }
);

/* =====================================
   LIVE SOCKET UPDATES
===================================== */
socket.on(
  "productAdded",
  () => {

    loadProducts();

    showToast(
      "New Product Added",
      "success"
    );
  }
);

socket.on(
  "productUpdated",
  () => {

    loadProducts();

    showToast(
      "Product Updated",
      "success"
    );
  }
);

socket.on(
  "productDeleted",
  () => {

    loadProducts();

    showToast(
      "Product Deleted",
      "success"
    );
  }
);

socket.on(
  "productAvailabilityUpdated",
  () => {

    loadProducts();

    showToast(
      "Availability Updated",
      "success"
    );
  }
);

/* =====================================
   API REQUEST
===================================== */
async function apiRequest(
  url,
  method = "GET",
  data = null
) {

  try {

    const options = {
      method,
      credentials: "include"
    };

    if (
      data &&
      !(data instanceof FormData)
    ) {

      options.headers = {
        "Content-Type":
          "application/json"
      };

      options.body =
        JSON.stringify(data);

    } else if (data) {

      options.body = data;
    }

    const res =
      await fetch(url, options);

    const result =
      await res.json();

    if (!res.ok) {
      throw new Error(
        result.message ||
        "Request failed"
      );
    }

    return result;

  } catch (err) {

    console.error(err);

    showToast(
      err.message,
      "error"
    );

    return null;
  }
}

/* =====================================
   ALL PRODUCTS STORE
===================================== */
let allProducts = [];

/* =====================================
   LOAD ALL PRODUCTS
===================================== */
async function loadProducts() {

  const res =
    await apiRequest(API);

  if (
    !res ||
    !Array.isArray(res.products)
  ) return;

  allProducts =
    res.products;

  updateCategoryView();
}

/* =====================================
   CATEGORY VIEW
===================================== */
function updateCategoryView() {

  const current =
    categories[currentCategoryIndex];

  activeCategoryName.textContent =
    current.label;

  const filteredProducts =
    allProducts.filter(
      product =>
        product.category === current.key
    );

  renderProducts(
    filteredProducts
  );
}

/* =====================================
   CATEGORY SWITCHER
===================================== */
function initCategorySwitcher() {

  prevCategory.addEventListener(
    "click",
    () => {

      currentCategoryIndex--;

      if (
        currentCategoryIndex < 0
      ) {

        currentCategoryIndex =
          categories.length - 1;
      }

      updateCategoryView();
    }
  );

  nextCategory.addEventListener(
    "click",
    () => {

      currentCategoryIndex++;

      if (
        currentCategoryIndex >=
        categories.length
      ) {

        currentCategoryIndex = 0;
      }

      updateCategoryView();
    }
  );
}

/* =====================================
   RENDER PRODUCTS
===================================== */
function renderProducts(products) {

  if (!products.length) {

    productsTable.innerHTML = `
      <tr>
        <td colspan="6" class="empty-cell">
          No products found
        </td>
      </tr>
    `;

    return;
  }

  productsTable.innerHTML =
    products.map(product => {

      const image =
        product.image
          ? product.image
          : "/assets/default-food.png";

      const inStock =
        product.availability === "in_stock";

      return `
        <tr>

          <td>
            <img
              src="${image}"
              class="product-thumb"
              alt="${escapeHTML(product.name)}"
              onerror="this.src='/assets/default-food.png'"
            >
          </td>

          <td>
            ${escapeHTML(product.name)}
          </td>

          <td>
            ${escapeHTML(product.category)}
          </td>

          <td>
            ₹${product.price}
          </td>

          <td>
            <span class="status ${
              inStock
                ? "active"
                : "blocked"
            }">
              ${
                inStock
                  ? "In Stock"
                  : "Out Of Stock"
              }
            </span>
          </td>

          <td class="action-buttons">

            <button
              class="btn-primary"
              onclick='editProduct(${JSON.stringify(product)})'
            >
              Edit
            </button>

            <button
              class="btn-view"
              onclick="toggleAvailability(${product.id}, '${product.availability}')"
            >
              Toggle
            </button>

            <button
              class="btn-danger"
              onclick="deleteProduct(${product.id})"
            >
              Delete
            </button>

          </td>

        </tr>
      `;

    }).join("");
}

/* =====================================
   EDIT PRODUCT
===================================== */
function editProduct(product) {
  console.log("Editing product:", product);
  editMode = true;
  editingProductId = product.id;

  if (productForm.name) {
    productForm.name.value = product.name || "";
  }

  if (productForm.category) {
    productForm.category.value = product.category || "";
  }

  if (productForm.subcategory) {
    productForm.subcategory.value = product.subcategory || "";
  }

  if (productForm.price) {
    productForm.price.value = product.price || "";
  }

  if (productForm.offer_price) {
    productForm.offer_price.value = product.offer_price || "";
  }

  if (productForm.stock_qty) {
    productForm.stock_qty.value = product.stock_qty || "";
  }

  if (productForm.prep_time) {
    productForm.prep_time.value = product.prep_time || "";
  }

  if (productForm.badge) {
    productForm.badge.value = product.badge || "";
  }

  // Availability field is currently removed from HTML
  if (productForm.availability) {
    productForm.availability.value =
      product.availability || "in_stock";
  }

  const descriptionField =
    productForm.querySelector(
      "textarea[name='description']"
    );

  if (descriptionField) {
    descriptionField.value =
      product.description || "";
  }

  const submitBtn =
    productForm.querySelector(
      "button[type='submit']"
    );

  if (submitBtn) {
    submitBtn.innerHTML = `
      <i class="fa-solid fa-pen"></i>
      Update Product
    `;
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

}

/* =====================================
   INIT FORM
===================================== */
function initForm() {

  if (!productForm) return;

  productForm.addEventListener(
    "submit",
    async e => {

      e.preventDefault();

      const formData =
        new FormData(productForm);

      const url = editMode

        ? `${API}/${editingProductId}`
        : `${API}/add`;

      const method =
        editMode
          ? "PUT"
          : "POST";

      const res =
        await apiRequest(
          url,
          method,
          formData
        );

      if (!res) return;

      showToast(
        editMode
          ? "Product Updated"
          : "Product Added",
        "success"
      );

      productForm.reset();

      editMode = false;

      editingProductId = null;

      const submitBtn =
        productForm.querySelector("button[type='submit']");

      submitBtn.innerHTML = `
        <i class="fa-solid fa-plus"></i>
        Add Product
      `;

      loadProducts();
    }
  );
}

/* =====================================
   DELETE PRODUCT
===================================== */
async function deleteProduct(id) {

  const confirmDelete =
    confirm(
      "Delete this product?"
    );

  if (!confirmDelete) return;

  const res =
    await apiRequest(
      `${API}/${id}`,
      "DELETE"
    );

  if (!res) return;

  showToast(
    "Product Deleted",
    "success"
  );

  loadProducts();
}

/* =====================================
   TOGGLE AVAILABILITY
===================================== */
async function toggleAvailability(
  id,
  current
) {

  const availability =
    current === "in_stock"

    ? "out_of_stock"

    : "in_stock";

  const res =
    await apiRequest(
      `${API}/availability/${id}`,
      "PATCH",
      { availability }
    );

  if (!res) return;

  showToast(
    "Availability Updated",
    "success"
  );

  loadProducts();
}

/* =====================================
   TOAST
===================================== */
let toastTimeout;

function showToast(
  message,
  type = "success"
) {

  let toast =
    document.querySelector(".toast");

  if (!toast) {

    toast =
      document.createElement("div");

    toast.className =
      "toast";

    document.body.appendChild(
      toast
    );
  }

  clearTimeout(
    toastTimeout
  );

  toast.className =
    `toast ${type}`;

  toast.textContent =
    message;

  toast.style.display =
    "block";

  requestAnimationFrame(() => {

    toast.classList.add(
      "show"
    );
  });

  toastTimeout = setTimeout(() => {
    toast.classList.remove(
      "show"
    );

    setTimeout(() => {
      toast.style.display =
        "none";
      }, 300);
    }, 2500);
}