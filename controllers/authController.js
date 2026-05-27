const {
  signupUser,
  loginUser,
  logoutUser,
  processGoogleAuth,
  forgotPassword,
  resetPassword,
} = require("../services/authService");

const signup = async (req, res, next) => {
  try {
    const result = await signupUser(req.body);
    res.status(201).json({ message: "User registered successfully", ...result });
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const result = await loginUser(req.body);
    res.json({ message: "Login successful", ...result });
  } catch (error) {
    next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    await logoutUser(req.user.id);
    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    next(error);
  }
};

const googleCallback = async (req, res, _next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Google authentication failed" });
    }

    const frontendUrl =
      process.env.NODE_ENV === "production"
        ? process.env.FRONTEND_URL
        : "http://localhost:3000";

    const { user, token } = await processGoogleAuth(req.user.user, req.user.token);
    const encodedUser = Buffer.from(JSON.stringify(user)).toString("base64");

    return res.redirect(
      `${frontendUrl}/auth/google/callback?token=${token}&userData=${encodedUser}`
    );
  } catch (error) {
    const frontendUrl =
      process.env.NODE_ENV === "production"
        ? process.env.FRONTEND_URL
        : "http://localhost:3000";
    return res.redirect(`${frontendUrl}/login?error=auth_failed`);
  }
};

const forgotPasswordHandler = async (req, res, next) => {
  try {
    const frontendUrl =
      process.env.NODE_ENV === "production"
        ? process.env.FRONTEND_URL
        : "http://localhost:3000";
    await forgotPassword({ email: req.body.email, frontendUrl });
    // Always return 200 to prevent email enumeration
    res.status(200).json({
      message: "If that email is registered, a reset link has been sent.",
    });
  } catch (error) {
    next(error);
  }
};

const resetPasswordHandler = async (req, res, next) => {
  try {
    await resetPassword(req.body);
    res.json({ message: "Password reset successful! Redirecting to login..." });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  signup,
  login,
  logout,
  googleCallback,
  forgotPasswordHandler,
  resetPasswordHandler,
};
