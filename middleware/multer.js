const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");

// Configure Cloudinary Storage for Multer
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "profile_pics",
    allowed_formats: ["jpg", "jpeg", "png"],
    transformation: [{ width: 150, height: 150, crop: "fill" }],
  },
});

// Ensure only image files are uploaded
const fileFilter = (req, file, cb) => {
  if (!file) {
    //console.log("🚨 No file uploaded!");
    return cb(new Error("No file provided"), false);
  }
  if (!file.mimetype.startsWith("image/")) {
    //console.log("🚨 Invalid file type:", file.mimetype);
    return cb(new Error("Only JPG, JPEG, PNG files are allowed"), false);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 100 * 1024 }, // 100KB Limit
});

module.exports = upload;
