const express = require("express");
const db = require("../db");
const adminMiddleware = require("../middleware/admin.middleware");
const createUploader = require("../middleware/upload.middleware");
const router = express.Router();
const productUpload = createUploader("products");

/* =====================================
   ADMIN PROTECTION
===================================== */
router.use(adminMiddleware);

/* =====================================
   GET ALL PRODUCTS
===================================== */
router.get("/", async (req, res) => {

  try {

    const [products] =
      await db.query(`
        SELECT
          id,
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

    console.error(
      "Fetch products error:",
      err
    );

    res.status(500).json({
      success: false,
      message:
        "Failed to fetch products"
    });
  }
});

/* =====================================
   GET PRODUCTS BY CATEGORY
===================================== */
router.get("/", async (req, res) => {

  try {

    const { category } =
      req.query;

    let query = `
      SELECT
        id,
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
    `;

    let values = [];

    /* =========================
       CATEGORY FILTER
    ========================= */
    if (category) {

      query += `
        WHERE category = ?
      `;

      values.push(category);
    }

    query += `
      ORDER BY id DESC
    `;

    const [products] =
      await db.query(
        query,
        values
      );

    res.status(200).json({
      success: true,
      products
    });

  } catch (err) {

    console.error(
      "Fetch products error:",
      err
    );

    res.status(500).json({
      success: false,
      message:
        "Failed to fetch products"
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
      if (
        !category ||
        !name ||
        !price
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Required fields missing"
        });
      }

      /* =========================
         IMAGE
      ========================= */
      const image =
        req.file
        ? `/uploads/products/${req.file.filename}`
        : null;

      /* =========================
         SLUG
      ========================= */
      const slug =
        name
          .toLowerCase()
          .trim()
          .replace(
            /[^a-z0-9]+/g,
            "-"
          )
          .replace(
            /(^-|-$)/g,
            ""
          );

      /* =========================
         INSERT PRODUCT
      ========================= */
      const [result] =
        await db.query(
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
            Number(price),
            offer_price
              ? Number(offer_price)
              : null,
            image,
            Number(stock_qty || 100),
            availability || "in_stock",
            badge || null,
            Number(prep_time || 15),
            true
          ]
        );

      const io = req.app.get("io");
      io.emit(
        "productAdded",
        {
          productId:
            result.insertId
        }
      );

      res.status(201).json({

        success: true,

        message:
          "Product added successfully",

        productId:
          result.insertId
      });

    } catch (err) {

      console.error(
        "Add product error:",
        err
      );

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

      const id =
        Number(req.params.id);

      if (!id) {

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

      const slug =
        name
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");

      let imageQuery = "";
      let imageValue = [];

      if (req.file) {

        imageQuery =
          ", image = ?";

        imageValue = [
          `/uploads/products/${req.file.filename}`
        ];
      }

      const [result] =
        await db.query(
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
            Number(price),
            offer_price
              ? Number(offer_price)
              : null,
            Number(stock_qty || 0),
            availability,
            badge || null,
            Number(prep_time || 15),

            ...imageValue,

            id
          ]
        );

      if (!result.affectedRows) {

        return res.status(404).json({
          success: false,
          message:
            "Product not found"
        });
      }

      const io = req.app.get("io");
      io.emit(
        "productUpdated",
        { id }
      );

      res.status(200).json({
        success: true,
        message:
          "Product updated successfully"
      });

    } catch (err) {

      console.error(
        "Update product error:",
        err
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to update product"
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

      const id =
        Number(req.params.id);

      if (!id) {

        return res.status(400).json({
          success: false,
          message: "Invalid ID"
        });
      }

      const [result] =
        await db.query(
          `
          DELETE FROM products
          WHERE id = ?
          `,
          [id]
        );

      if (!result.affectedRows) {

        return res.status(404).json({
          success: false,
          message:
            "Product not found"
        });
      }

      const io = req.app.get("io");
      io.emit(
        "productDeleted",
        { id }
      );

      res.status(200).json({
        success: true,
        message:
          "Product deleted successfully"
      });

    } catch (err) {

      console.error(
        "Delete product error:",
        err
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to delete product"
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

      const id =
        Number(req.params.id);

      const { availability } =
        req.body;

      if (!id) {

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
          message:
            "Invalid availability"
        });
      }

      const [result] =
        await db.query(
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
          message:
            "Product not found"
        });
      }
      
      const io = req.app.get("io");
      io.emit(
        "productAvailabilityUpdated",
        {
          id,
          availability
        }
      );

      res.status(200).json({
        success: true,
        message:
          "Availability updated"
      });

    } catch (err) {

      console.error(
        "Availability update error:",
        err
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to update availability"
      });
    }
  }
);

module.exports = router;