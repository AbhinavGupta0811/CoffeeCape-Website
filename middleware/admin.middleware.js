/**
 * Admin Authorization Middleware
 * Allows access only to authenticated admin users
 */
module.exports = function adminMiddleware(req, res, next) {
  try {

    if (!req.session || !req.session.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required. Please login."
      });
    }

    const user = req.session.user;

    const role = String(user.role || "").toLowerCase();

    if (role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin privileges required."
      });
    }

    req.user = user;
    next();

  } catch (error) {
    console.error("Admin Middleware Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal authorization error"
    });
  }
};