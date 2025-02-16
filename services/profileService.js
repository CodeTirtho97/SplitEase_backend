const User = require("../models/User");
const cloudinary = require("../config/cloudinary");

// Upload Profile Picture to Cloudinary
const updateProfilePic = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!req.file)
      return res.status(400).json({ message: "No image uploaded" });

    // Upload image to Cloudinary
    const result = await cloudinary.uploader
      .upload_stream(
        {
          folder: "profile_pictures",
          transformation: [{ width: 150, height: 150, crop: "fill" }],
        },
        async (error, result) => {
          if (error)
            return res
              .status(500)
              .json({ message: "Cloudinary Upload Error", error });

          user.profilePic = result.secure_url; // Store Cloudinary URL
          await user.save();

          res.json({
            message: "Profile picture updated successfully",
            profilePic: user.profilePic,
          });
        }
      )
      .end(req.file.buffer); // Convert file buffer to stream and upload
  } catch (error) {
    res.status(500).json({ error: "Server Error", details: error.message });
  }
};

// Fetch User Profile (Including Profile Pic)
const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      fullName: user.fullName,
      email: user.email,
      gender: user.gender || "", // Google users might not have gender
      profilePic: user.profilePic || "", // Google users will have profilePic
      friends: user.friends,
      paymentMethods: user.paymentMethods,
      groups: user.groups,
    });
  } catch (error) {
    res.status(500).json({ error: "Server Error", details: error.message });
  }
};

module.exports = { updateProfilePic, getUserProfile };
