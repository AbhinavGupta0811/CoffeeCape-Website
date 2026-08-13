const multer = require("multer");
const path = require("path");
const fs = require("fs");

const createUploader = (folder = "general") => {
  const uploadDir = path.join(
    __dirname,
    "../public/uploads",
    folder
  );

  /* Create directory if it doesn't exist */
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, {
      recursive: true
    });
  }

  const storage = multer.diskStorage({

    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },

    filename: (req, file, cb) => {

      const ext = path
        .extname(file.originalname)
        .toLowerCase();

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

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    if (!allowedTypes.includes(file.mimetype)) {

      return cb(
        new Error(
          "Only JPG, PNG and WEBP images are allowed"
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

const adminProfileUploadDir = path.join(
  __dirname,
  "../public/uploads/profiles"
);

/* Create admin profile directory */
if (!fs.existsSync(adminProfileUploadDir)) {
  fs.mkdirSync(adminProfileUploadDir, {
    recursive: true
  });
}

const adminProfileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(
      null,
      adminProfileUploadDir
    );
  },

  filename: (req, file, cb) => {
    const ext = path
      .extname(file.originalname)
      .toLowerCase();
    const adminId = req.user?.id || "unknown";

    const filename =
      `admin-${adminId}-${Date.now()}${ext}`;
    cb(null, filename);
  }
});

const adminProfileFileFilter = (
  req,
  file,
  cb
) => {

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp"
  ];

  if (!allowedTypes.includes(file.mimetype)) {

    return cb(
      new Error(
        "Only JPG, PNG and WEBP images are allowed"
      ),
      false
    );

  }

  cb(null, true);

};

const adminProfileUpload = multer({
  storage: adminProfileStorage,
  fileFilter: adminProfileFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

module.exports = createUploader;
module.exports.createUploader = createUploader;
module.exports.adminProfileUpload = adminProfileUpload;