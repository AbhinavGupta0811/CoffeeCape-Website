const express = require("express");
const db = require("../../db");
const adminMiddleware = require("../../middleware/admin.middleware");
const createUploader = require("../../middleware/upload.middleware");

const router = express.Router();
const productUpload = createUploader("products");

router.use(adminMiddleware);

/* =====================================
   CATEGORY MAP
===================================== */
const categoryPrefixes = {
  "Hot Beverages": "HB",
  "Cold Beverages": "CB",
  "Refreshment Drinks": "RD",
  "Refreshment Snacks": "RS",
  "Special Food Combo": "SC",
  "Special Desserts": "SD",
  "Burgers": "BG",
  "Fries": "FR"
};

const allowedCategories = Object.keys(categoryPrefixes);

/* =====================================
   GET ALL PRODUCTS
===================================== */
router.get("/", async (req, res) => {
  try {
    const [products] = await db.query(`
      SELECT
        id,
        product_id,
        category,
        subcategory,
        name,
        description,
        price,
        offer_price,
        image,
        stock_qty,
        availability,
        badge,
        prep_time,
        is_active,
        created_at
      FROM products
      ORDER BY id DESC
    `);

    res.status(200).json({
      success: true,
      products
    });
  } catch (err) {
    console.error("Fetch products error:", err);

    res.status(500).json({
      success: false,
      message: "Failed to fetch products"
    });
  }
});

/* =====================================
   ADD PRODUCT
===================================== */
router.post(
  "/add",
  productUpload.single("image"),
  async (req, res) => {
    try {
      const {
        category,
        subcategory,
        name,
        description,
        price,
        offer_price,
        stock_qty,
        availability,
        badge,
        prep_time
      } = req.body;

      /* =========================
         VALIDATION
      ========================= */
      if (!category || !name || price === undefined || price === "") {
        return res.status(400).json({
          success: false,
          message: "Required fields missing"
        });
      }

      if (!allowedCategories.includes(category)) {
        return res.status(400).json({
          success: false,
          message: "Invalid product category"
        });
      }

      const numericPrice = Number(price);

      if (!Number.isFinite(numericPrice) || numericPrice < 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid product price"
        });
      }

      let numericOfferPrice = null;

      if (
        offer_price !== undefined &&
        offer_price !== null &&
        offer_price !== ""
      ) {
        numericOfferPrice = Number(offer_price);

        if (
          !Number.isFinite(numericOfferPrice) ||
          numericOfferPrice < 0
        ) {
          return res.status(400).json({
            success: false,
            message: "Invalid offer price"
          });
        }
      }

      const numericStockQty =
        stock_qty === undefined ||
        stock_qty === null ||
        stock_qty === ""
          ? 100
          : Number(stock_qty);

      if (!Number.isFinite(numericStockQty) || numericStockQty < 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid stock quantity"
        });
      }

      const numericPrepTime =
        prep_time === undefined ||
        prep_time === null ||
        prep_time === ""
          ? 15
          : Number(prep_time);

      if (!Number.isFinite(numericPrepTime) || numericPrepTime < 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid preparation time"
        });
      }

      const finalAvailability =
        availability || "in_stock";

      if (
        ![
          "in_stock",
          "out_of_stock"
        ].includes(finalAvailability)
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid availability"
        });
      }

      /* =========================
         IMAGE
      ========================= */
      const image = req.file
        ? `/uploads/products/${req.file.filename}`
        : null;

      /* =========================
         SLUG
      ========================= */
      const slug = name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

      /* =========================
         INSERT PRODUCT
      ========================= */
      const [result] = await db.query(
        `
        INSERT INTO products (
          category,
          subcategory,
          name,
          slug,
          description,
          price,
          offer_price,
          image,
          stock_qty,
          availability,
          badge,
          prep_time,
          is_active
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          category,
          subcategory || null,
          name,
          slug,
          description || null,
          numericPrice,
          numericOfferPrice,
          image,
          numericStockQty,
          finalAvailability,
          badge || null,
          numericPrepTime,
          true
        ]
      );

      /* =========================
         GENERATE PRODUCT ID
      ========================= */
      const prefix = categoryPrefixes[category];

      const [[lastProduct]] = await db.query(
        `
        SELECT product_id
        FROM products
        WHERE product_id LIKE ?
        ORDER BY id DESC
        LIMIT 1
        `,
        [`${prefix}%`]
      );

      let nextNumber = 1;

      if (lastProduct?.product_id) {
        const lastNumber = parseInt(
          lastProduct.product_id.slice(prefix.length),
          10
        );

        if (Number.isFinite(lastNumber)) {
          nextNumber = lastNumber + 1;
        }
      }

      const product_id =
        `${prefix}${String(nextNumber).padStart(6, "0")}`;

      /* =========================
         UPDATE PRODUCT ID
      ========================= */
      await db.query(
        `
        UPDATE products
        SET product_id = ?
        WHERE id = ?
        `,
        [
          product_id,
          result.insertId
        ]
      );

      /* =========================
         SOCKET EVENT
      ========================= */
      const io = req.app.get("io");

      if (io) {
        io.emit("productAdded", {
          id: result.insertId,
          product_id
        });
      }

      /* =========================
         RESPONSE
      ========================= */
      res.status(201).json({
        success: true,
        message: "Product added successfully",
        id: result.insertId,
        product_id
      });
    } catch (err) {
      console.error("Add product error:", err);

      res.status(500).json({
        success: false,
        message:
          err.message ||
          "Failed to add product"
      });
    }
  }
);

/* =====================================
   UPDATE PRODUCT
===================================== */
router.put(
  "/:id",
  productUpload.single("image"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);

      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid ID"
        });
      }

      const {
        category,
        subcategory,
        name,
        description,
        price,
        offer_price,
        stock_qty,
        availability,
        badge,
        prep_time
      } = req.body;

      /* =========================
         VALIDATION
      ========================= */
      if (!category || !name || price === undefined || price === "") {
        return res.status(400).json({
          success: false,
          message: "Required fields missing"
        });
      }

      if (!allowedCategories.includes(category)) {
        return res.status(400).json({
          success: false,
          message: "Invalid product category"
        });
      }

      const numericPrice = Number(price);

      if (!Number.isFinite(numericPrice) || numericPrice < 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid product price"
        });
      }

      let numericOfferPrice = null;

      if (
        offer_price !== undefined &&
        offer_price !== null &&
        offer_price !== ""
      ) {
        numericOfferPrice = Number(offer_price);

        if (
          !Number.isFinite(numericOfferPrice) ||
          numericOfferPrice < 0
        ) {
          return res.status(400).json({
            success: false,
            message: "Invalid offer price"
          });
        }
      }

      const numericStockQty =
        stock_qty === undefined ||
        stock_qty === null ||
        stock_qty === ""
          ? 0
          : Number(stock_qty);

      if (!Number.isFinite(numericStockQty) || numericStockQty < 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid stock quantity"
        });
      }

      const numericPrepTime =
        prep_time === undefined ||
        prep_time === null ||
        prep_time === ""
          ? 15
          : Number(prep_time);

      if (!Number.isFinite(numericPrepTime) || numericPrepTime < 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid preparation time"
        });
      }

      const finalAvailability =
        availability || "in_stock";

      if (
        ![
          "in_stock",
          "out_of_stock"
        ].includes(finalAvailability)
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid availability"
        });
      }

      /* =========================
         SLUG
      ========================= */
      const slug = name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

      /* =========================
         IMAGE
      ========================= */
      let imageQuery = "";
      let imageValue = [];

      if (req.file) {
        imageQuery = ", image = ?";
        imageValue = [
          `/uploads/products/${req.file.filename}`
        ];
      }

      /* =========================
         UPDATE PRODUCT
      ========================= */
      const [result] = await db.query(
        `
        UPDATE products
        SET
          category = ?,
          subcategory = ?,
          name = ?,
          slug = ?,
          description = ?,
          price = ?,
          offer_price = ?,
          stock_qty = ?,
          availability = ?,
          badge = ?,
          prep_time = ?
          ${imageQuery}
        WHERE id = ?
        `,
        [
          category,
          subcategory || null,
          name,
          slug,
          description || null,
          numericPrice,
          numericOfferPrice,
          numericStockQty,
          finalAvailability,
          badge || null,
          numericPrepTime,
          ...imageValue,
          id
        ]
      );

      if (!result.affectedRows) {
        return res.status(404).json({
          success: false,
          message: "Product not found"
        });
      }

      /* =========================
         SOCKET EVENT
      ========================= */
      const io = req.app.get("io");

      if (io) {
        io.emit("productUpdated", {
          id
        });
      }

      res.status(200).json({
        success: true,
        message: "Product updated successfully"
      });
    } catch (err) {
      console.error("Update product error:", err);

      res.status(500).json({
        success: false,
        message: "Failed to update product"
      });
    }
  }
);

/* =====================================
   DELETE PRODUCT
===================================== */
router.delete(
  "/:id",
  async (req, res) => {
    try {
      const id = Number(req.params.id);

      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid ID"
        });
      }

      const [result] = await db.query(
        `
        DELETE FROM products
        WHERE id = ?
        `,
        [id]
      );

      if (!result.affectedRows) {
        return res.status(404).json({
          success: false,
          message: "Product not found"
        });
      }

      /* =========================
         SOCKET EVENT
      ========================= */
      const io = req.app.get("io");

      if (io) {
        io.emit("productDeleted", {
          id
        });
      }

      res.status(200).json({
        success: true,
        message: "Product deleted successfully"
      });
    } catch (err) {
      console.error("Delete product error:", err);

      res.status(500).json({
        success: false,
        message: "Failed to delete product"
      });
    }
  }
);

/* =====================================
   TOGGLE AVAILABILITY
===================================== */
router.patch(
  "/availability/:id",
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { availability } = req.body;

      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid ID"
        });
      }

      if (
        ![
          "in_stock",
          "out_of_stock"
        ].includes(availability)
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid availability"
        });
      }

      const [result] = await db.query(
        `
        UPDATE products
        SET availability = ?
        WHERE id = ?
        `,
        [
          availability,
          id
        ]
      );

      if (!result.affectedRows) {
        return res.status(404).json({
          success: false,
          message: "Product not found"
        });
      }

      /* =========================
         SOCKET EVENT
      ========================= */
      const io = req.app.get("io");

      if (io) {
        io.emit(
          "productAvailabilityUpdated",
          {
            id,
            availability
          }
        );
      }

      res.status(200).json({
        success: true,
        message: "Availability updated"
      });
    } catch (err) {
      console.error(
        "Availability update error:",
        err
      );

      res.status(500).json({
        success: false,
        message: "Failed to update product availability"
      });
    }
  }
);

module.exports = router;