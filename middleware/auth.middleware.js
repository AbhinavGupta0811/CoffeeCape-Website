/**
 * Auth Middleware – protects only private routes
 */
module.exports = (req, res, next) => {
  try {
    const publicRoutes = [
      "/api/auth/login",
      "/api/auth/register",
      "/api/password/forgot",
      "/api/password/verify-otp",
      "/api/password/reset"
    ];

    if (publicRoutes.includes(req.originalUrl)) {
      return next(); // 🔓 allow public access
    }

    if (!req.session || !req.session.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    req.user = req.session.user;
    next();

  } catch (err) {
    console.error("AUTH MIDDLEWARE ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Auth middleware failed"
    });
  }
};