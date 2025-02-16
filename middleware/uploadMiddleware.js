const multer = require("multer");

// Multer Storage Config (Temporary Storage Before Uploading to Cloudinary)
const storage = multer.memoryStorage(); // Store image in memory

// File Filter - Allow only JPG, JPEG, PNG
const fileFilter = (req, file, cb) => {
  if (file.mimetype === "image/jpeg" || file.mimetype === "image/png") {
    cb(null, true);
  } else {
    cb(new Error("Only .jpg, .jpeg, and .png formats are allowed!"), false);
  }
};

// Multer Upload Config
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 100 * 1024 }, // 100 KB limit
});

module.exports = upload;
