const express = require("express");
const db = require("../db");
const auth = require("../middleware/auth.middleware");
const createUploader = require("../middleware/upload.middleware");
const imageUpload = createUploader("profile");
const fs = require("fs");

const router = express.Router();

/* GET PROFILE */
router.get("/", auth, async (req, res) => {
  try {
    const userId = req.user.id; // SESSION ONLY

    const [[user]] = await db.query(
      `SELECT
          id,
          first_name,
          last_name,
          email,
          phone,
          street,
          city,
          zip,
          country,
          profile_image,
          created_at
        FROM users
        WHERE id = ?`,
      [userId]
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    let profileImage = "assets/user-default.png";

    if(user.profile_image){

      if(
        user.profile_image.startsWith("http")
      ){

        profileImage =
        user.profile_image;

      }else if(
        user.profile_image.startsWith("/uploads/")
      ){

        profileImage =
        user.profile_image;

      }else{

        profileImage =
        `/uploads/profile/${user.profile_image}`;
      }
    }

    user.profile_image = profileImage;
    res.json(user);

  } catch (err) {
    console.error("GET PROFILE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* UPDATE PROFILE */
router.put("/", auth, async (req, res) => {
  try {
    const userId = req.user.id; // SESSION ONLY

    const {
      first_name,
      last_name,
      phone,
      street,
      city,
      zip,
      country
    } = req.body;

    const [result] = await db.query(
      `UPDATE users SET
        first_name = ?,
        last_name  = ?,
        phone      = ?,
        street     = ?,
        city       = ?,
        zip        = ?,
        country    = ?
       WHERE id = ?`,
      [
        first_name,
        last_name,
        phone,
        street,
        city,
        zip,
        country,
        userId
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // 🔥 Sync session user name
    if (req.session.user) {
      req.session.user.first_name = first_name;
      // req.session.user.last_name = last_name;
    }

    res.json({
      success: true,
      message: "Profile updated successfully",
      first_name
    });
  } catch (err) {
    console.error("UPDATE PROFILE ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Profile update failed"
    });
  }
});

/* UPLOAD PROFILE IMAGE */
router.post("/upload-image", auth, imageUpload.single("profile_image"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No image uploaded" });
      }

      const imagePath = `/uploads/profile/${req.file.filename}`;
      const userId = req.user.id;

      /* OPTIONAL: DELETE OLD IMAGE */
      const [[user]] = await db.query(
        "SELECT profile_image FROM users WHERE id = ?",
        [userId]
      );

      if (user?.profile_image) {
        const oldPath = `public${user.profile_image}`;
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }

      /* SAVE NEW IMAGE PATH */
      await db.query(
        "UPDATE users SET profile_image = ? WHERE id = ?",
        [imagePath, userId]
      );

      // 🔥 ADD THIS
      if (req.session.user) {
        req.session.user.profile_image = imagePath;
      }

      res.json({
        success: true,
        message: "Profile image uploaded",
        profile_image: imagePath
      });
    } catch (err) {
      console.error("UPLOAD ERROR:", err);
      res.status(500).json({ message: "Image upload failed" });
    }
  }
);

module.exports = router;