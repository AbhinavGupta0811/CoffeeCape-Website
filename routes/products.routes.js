const express = require("express");
const db = require("../db");

const router = express.Router();

/* =====================================
   GET ALL PRODUCTS
===================================== */
router.get("/", async (req, res) => {

  try {

    const [products] = await db.query(
      `
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
        rating,
        is_featured
      FROM products
      WHERE is_active = TRUE
      AND availability = 'in_stock'
      ORDER BY id DESC
      `
    );

    res.status(200).json({
      success: true,
      products
    });

  } catch (err) {

    console.error("Products fetch error:", err);

    res.status(500).json({
      success: false,
      message: "Failed to fetch products"
    });
  }
});

/* =====================================
   GET PRODUCTS BY CATEGORY
===================================== */
router.get("/category/:category", async (req, res) => {

  try {
    const { category } = req.params;
    const allowedCategories = [
      "hot-beverages",
      "cold-beverages",
      "refreshment-drinks",
      "refreshments",
      "desserts",
      "burgers",
      "fries",
      "combos"
    ];

    if (
      !allowedCategories.includes(category)
    ) {

      return res.status(400).json({
        success: false,
        message: "Invalid category"
      });
    }

    const [products] = await db.query(
      `
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
        rating,
        is_featured
      FROM products
      WHERE
        category = ?
        AND is_active = TRUE
        AND availability = 'in_stock'
      ORDER BY id DESC
      `,
      [category]
    );

    res.status(200).json({
      success: true,
      products
    });

  } catch (err) {

    console.error("Category fetch error:", err);

    res.status(500).json({
      success: false,
      message: "Failed to fetch category products"
    });
  }
});

/* =====================================
   GET SINGLE PRODUCT
===================================== */
router.get("/:id", async (req, res) => {

  try {

    const [products] = await db.query(
      `
      SELECT * FROM products
      WHERE id = ?
      AND is_active = TRUE
      LIMIT 1
      `,
      [req.params.id]
    );

    if (!products.length) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    res.status(200).json({
      success: true,
      product: products[0]
    });

  } catch (err) {

    console.error("Single product fetch error:", err);

    res.status(500).json({
      success: false,
      message: "Failed to fetch product"
    });
  }
});

module.exports = router;