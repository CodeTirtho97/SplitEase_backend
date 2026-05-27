const multer = require("multer");
const cloudinary = require("../config/cloudinary");

// Custom Multer storage engine for cloudinary@2.x (multer-storage-cloudinary only supports v1)
class CloudinaryStorage {
  _handleFile(req, file, cb) {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "profile_pics",
        allowed_formats: ["jpg", "jpeg", "png"],
        transformation: [{ width: 150, height: 150, crop: "fill" }],
      },
      (error, result) => {
        if (error) return cb(error);
        cb(null, {
          path: result.secure_url,     // consumed by profileService as file.path
          filename: result.public_id,
          size: result.bytes,
        });
      }
    );

    file.stream.pipe(uploadStream);
  }

  _removeFile(req, file, cb) {
    if (file.filename) {
      cloudinary.uploader.destroy(file.filename, cb);
    } else {
      cb(null);
    }
  }
}

const fileFilter = (req, file, cb) => {
  if (!file) {
    return cb(new Error("No file provided"), false);
  }
  if (!file.mimetype.startsWith("image/")) {
    return cb(new Error("Only JPG, JPEG, PNG files are allowed"), false);
  }
  cb(null, true);
};

const upload = multer({
  storage: new CloudinaryStorage(),
  fileFilter,
  limits: { fileSize: 100 * 1024 }, // 100KB
});

module.exports = upload;
