const multer = require("multer");
const path = require("path");
const fs = require("fs");

const createUploader = (folder = "general") => {

  const UPLOAD_DIR = path.join(
    __dirname,
    `../public/uploads/${folder}`
  );

  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }

  const storage = multer.diskStorage({

    destination: (req, file, cb) => {
      cb(null, UPLOAD_DIR);
    },

    filename: (req, file, cb) => {

      const ext = path.extname(
        file.originalname
      ).toLowerCase();

      let filename;

      if (req.user?.id) {

        filename =
          `user_${req.user.id}_${Date.now()}${ext}`;

      } else {

        filename =
          `${folder}_${Date.now()}${ext}`;
      }

      cb(null, filename);
    }
  });

  const fileFilter = (req, file, cb) => {

    if (
      !file.mimetype.startsWith("image/")
    ) {

      return cb(
        new Error(
          "Only image files are allowed"
        ),
        false
      );
    }

    cb(null, true);
  };

  return multer({

    storage,

    fileFilter,

    limits: {
      fileSize: 5 * 1024 * 1024
    }
  });
};

module.exports = createUploader;