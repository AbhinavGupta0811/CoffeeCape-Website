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
    const categoryMap = {
      "hot-beverages": "Hot Beverages",
      "cold-beverages": "Cold Beverages",
      "refreshment-drinks": "Refreshment Drinks",
      "refreshment-snacks": "Refreshment Snacks",
      "special-food-combo": "Special Food Combo",
      "special-desserts": "Special Desserts",
      "burgers": "Burgers",
      "fries": "Fries"
    };

    const categorySlug = decodeURIComponent(req.params.category)
      .trim()
      .toLowerCase();

    const category = categoryMap[categorySlug];

    console.log("PRODUCT CATEGORY REQUEST:", {
      slug: categorySlug,
      databaseCategory: category
    });

    if (!category) {
      return res.status(400).json({
        success: false,
        message: "Invalid category",
        received: req.params.category
      });
    }

    const [products] = await db.query(
      `
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
        rating,
        is_featured
      FROM products
      WHERE category = ?
        AND is_active = TRUE
        AND availability = 'in_stock'
      ORDER BY id DESC
      `,
      [category]
    );

    console.log("PRODUCT CATEGORY RESULT:", {
      category,
      count: products.length
    });

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
router.get("/:product_id", async (req, res) => {

  try {
    const { product_id } = req.params;

    if (
      !/^[A-Z]{3}[0-9]{5}$/.test(product_id)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid product id"
      });
    }

    const [products] = await db.query(
      `
      SELECT id,
        product_id,
        category,
        subcategory,
        name,
        description,
        price,
        offer_price,
        image,
        availability,
        badge,
        prep_time,
        rating,
        is_featured
      FROM products
      WHERE product_id = ?
      AND is_active = TRUE
      LIMIT 1
      `,
      [req.params.product_id]
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