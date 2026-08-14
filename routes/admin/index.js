const express = require('express');

const router = express.Router();

// Admin route modules
const adminRoutes = require('./admin.routes');
const adminUserRoutes = require('./admin.user.routes');
const adminOrdersRoutes = require('./admin.orders.routes');
const adminProductsRoutes = require('./admin.products.routes');
const adminContactRoutes = require('./admin.contact.routes');
const adminBookingRoutes = require('./admin.booking.routes');

// Mount admin routes
router.use('/', adminRoutes);
router.use('/users', adminUserRoutes);
router.use('/orders', adminOrdersRoutes);
router.use('/products', adminProductsRoutes);
router.use('/contact', adminContactRoutes);
router.use('/bookings', adminBookingRoutes);

module.exports = router;