"use strict";

const express = require("express");
const router = express.Router();
const pool = require("../../db");
const {
    requireDeliveryAuth
} = require("../../middleware/delivery.auth.middleware");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const {
    sendDeliveryOTPEmail
} = require("../../mailer");

const MAX_OTP_ATTEMPTS = 5;
const OTP_EXPIRY_MINUTES = 5;

function generateDeliveryOTP() {
    return crypto.randomInt(100000, 1000000).toString();
}

function formatDelivery(row) {
    const customerName =
        [
            row.customer_first_name,
            row.customer_last_name
        ]
            .filter(Boolean)
            .join(" ")
            .trim() ||
        row.name ||
        "Customer";

    return {
        assignmentId: row.assignment_id,

        orderDbId:
            row.order_db_id || row.id,

        orderId:
            row.order_id,

        customerUserId:
            row.customer_user_id || null,

        customerName,

        customerEmail:
            row.customer_email || null,

        phone:
            row.phone || null,

        address:
            row.address || "Address unavailable",

        status:
            row.delivery_status,

        orderStatus:
            row.order_status,

        total:
            Number(row.total || 0),

        items:
            Array.isArray(row.items)
                ? row.items
                : [],

        paymentMethod:
            row.payment_method || null,

        paymentStatus:
            row.payment_status || null,

        createdAt:
            row.created_at || null,

        assignedAt:
            row.assigned_at || null,

        pickedUpAt:
            row.picked_up_at || null,

        outForDeliveryAt:
            row.out_for_delivery_at || null,

        deliveredAt:
            row.delivered_at ||
            row.order_delivered_at ||
            null
    };
}
async function getDeliveryAssignment(
    connection,
    assignmentId,
    deliveryUserId,
    lock = false
) {
    const lockClause = lock
        ? "FOR UPDATE"
        : "";

    const [rows] = await connection.query(
        `
        SELECT
            da.id AS assignment_id,
            da.order_id,
            da.delivery_user_id,
            da.status AS delivery_status,
            da.assigned_at,
            da.picked_up_at,
            da.out_for_delivery_at,
            da.delivered_at,

            o.id AS order_db_id,
            o.order_id,
            o.name,
            o.phone,
            o.address,
            o.status AS order_status,
            o.total,
            o.payment_method,
            o.payment_status,
            o.created_at,
            o.delivered_at AS order_delivered_at,

            u.id AS customer_user_id,
            u.first_name AS customer_first_name,
            u.last_name AS customer_last_name,
            u.email AS customer_email

        FROM delivery_assignments da

        INNER JOIN orders o
            ON o.id = da.order_id

        INNER JOIN users u
            ON u.id = o.user_id

        WHERE da.id = ?
        AND da.delivery_user_id = ?

        LIMIT 1

        ${lockClause}
        `,
        [
            assignmentId,
            deliveryUserId
        ]
    );

    if (!rows.length) {
        return null;
    }

    const row = rows[0];

    /*
     * Get all products/items belonging to this order.
     */
    const [itemRows] = await connection.query(
        `
        SELECT
            oi.id,
            oi.order_id,
            oi.product_id,
            oi.name,
            oi.price,
            oi.qty

        FROM order_items oi

        WHERE oi.order_id = ?

        ORDER BY oi.id ASC
        `,
        [
            row.order_db_id
        ]
    );

    /*
     * Convert database items into the format
     * expected by the delivery-details frontend.
     */
    row.items = itemRows.map((item) => {
        const price = Number(item.price || 0);
        const quantity = Number(item.qty || 0);

        return {
            id: item.id,
            productId: item.product_id,
            name: item.name || "Item",
            price: price,
            quantity: quantity,
            total: price * quantity
        };
    });

    /*
     * If orders.total is missing/null/zero,
     * calculate the total from order_items.
     *
     * Otherwise keep the official order total.
     */
    const calculatedItemsTotal = row.items.reduce(
        (sum, item) => {
            return sum + Number(item.total || 0);
        },
        0
    );

    if (
        row.total === null ||
        row.total === undefined ||
        Number(row.total) === 0
    ) {
        row.total = calculatedItemsTotal;
    }

    return row;
}

/*
=========================================================
GET DELIVERY DASHBOARD
GET /api/delivery/dashboard
=========================================================
*/

router.get(
    "/dashboard",
    requireDeliveryAuth,
    async (req, res) => {
        try {
            const deliveryUserId =
                req.deliveryUser.id;

            const [statsRows] =
                await pool.query(
                    `
                    SELECT
                        COALESCE(
                            SUM(
                                da.status = 'assigned'
                            ),
                            0
                        ) AS assigned,

                        COALESCE(
                            SUM(
                                da.status = 'picked_up'
                            ),
                            0
                        ) AS picked_up,

                        COALESCE(
                            SUM(
                                da.status = 'out_for_delivery'
                            ),
                            0
                        ) AS out_for_delivery,

                        COALESCE(
                            SUM(
                                da.status = 'delivered'
                                AND DATE(da.delivered_at) = CURDATE()
                            ),
                            0
                        ) AS delivered

                    FROM delivery_assignments da

                    WHERE da.delivery_user_id = ?

                    AND (
                        DATE(da.assigned_at) = CURDATE()
                        OR DATE(da.delivered_at) = CURDATE()
                    )
                    `,
                    [deliveryUserId]
                );

            const stats =
                statsRows[0] || {};

            const [currentRows] =
                await pool.query(
                    `
                    SELECT
                        da.id AS assignment_id,
                        da.order_id,
                        da.delivery_user_id,
                        da.status AS delivery_status,
                        da.assigned_at,
                        da.picked_up_at,
                        da.out_for_delivery_at,
                        da.delivered_at,

                        o.id AS order_db_id,
                        o.order_id,
                        o.name,
                        o.phone,
                        o.address,
                        o.status AS order_status,
                        o.total,
                        o.payment_method,
                        o.payment_status,
                        o.created_at,
                        o.delivered_at AS order_delivered_at,

                        u.id AS customer_user_id,
                        u.first_name AS customer_first_name,
                        u.last_name AS customer_last_name,
                        u.email AS customer_email

                    FROM delivery_assignments da

                    INNER JOIN orders o
                        ON o.id = da.order_id

                    INNER JOIN users u
                        ON u.id = o.user_id

                    WHERE da.delivery_user_id = ?

                    AND da.status IN (
                        'assigned',
                        'picked_up',
                        'out_for_delivery'
                    )

                    ORDER BY
                        CASE da.status
                            WHEN 'out_for_delivery' THEN 1
                            WHEN 'picked_up' THEN 2
                            WHEN 'assigned' THEN 3
                            ELSE 4
                        END,
                        da.assigned_at ASC

                    LIMIT 1
                    `,
                    [deliveryUserId]
                );

            const [todayRows] =
                await pool.query(
                    `
                    SELECT
                        da.id AS assignment_id,
                        da.order_id,
                        da.delivery_user_id,
                        da.status AS delivery_status,
                        da.assigned_at,
                        da.picked_up_at,
                        da.out_for_delivery_at,
                        da.delivered_at,

                        o.id AS order_db_id,
                        o.order_id,
                        o.name,
                        o.phone,
                        o.address,
                        o.status AS order_status,
                        o.total,
                        o.payment_method,
                        o.payment_status,
                        o.created_at,
                        o.delivered_at AS order_delivered_at,

                        u.id AS customer_user_id,
                        u.first_name AS customer_first_name,
                        u.last_name AS customer_last_name,
                        u.email AS customer_email

                    FROM delivery_assignments da

                    INNER JOIN orders o
                        ON o.id = da.order_id

                    INNER JOIN users u
                        ON u.id = o.user_id

                    WHERE da.delivery_user_id = ?

                    AND (
                        DATE(da.assigned_at) = CURDATE()
                        OR DATE(da.delivered_at) = CURDATE()
                    )

                    ORDER BY
                        CASE da.status
                            WHEN 'assigned' THEN 1
                            WHEN 'picked_up' THEN 2
                            WHEN 'out_for_delivery' THEN 3
                            WHEN 'delivered' THEN 4
                            WHEN 'cancelled' THEN 5
                            ELSE 6
                        END,
                        da.assigned_at DESC

                    LIMIT 20
                    `,
                    [deliveryUserId]
                );

            return res.status(200).json({
                success: true,

                dashboard: {
                    stats: {
                        assigned:
                            Number(
                                stats.assigned || 0
                            ),

                        pickedUp:
                            Number(
                                stats.picked_up || 0
                            ),

                        outForDelivery:
                            Number(
                                stats.out_for_delivery || 0
                            ),

                        delivered:
                            Number(
                                stats.delivered || 0
                            )
                    },

                    currentDelivery:
                        currentRows.length
                            ? formatDelivery(
                                currentRows[0]
                            )
                            : null,

                    todayDeliveries:
                        todayRows.map(
                            formatDelivery
                        )
                }
            });

        } catch (error) {
            console.error(
                "Delivery dashboard error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to load delivery dashboard."
            });
        }
    }
);


/*
=========================================================
GET DELIVERY ASSIGNMENTS
GET /api/delivery/assignments
=========================================================
*/

router.get(
    "/assignments",
    requireDeliveryAuth,
    async (req, res) => {
        try {
            const deliveryUserId =
                req.deliveryUser.id;

            const status =
                String(
                    req.query.status || ""
                ).trim();

            const page =
                Math.max(
                    parseInt(
                        req.query.page,
                        10
                    ) || 1,
                    1
                );

            const limit =
                Math.min(
                    Math.max(
                        parseInt(
                            req.query.limit,
                            10
                        ) || 10,
                        1
                    ),
                    50
                );

            const offset =
                (page - 1) * limit;

            const allowedStatuses = [
                "assigned",
                "picked_up",
                "out_for_delivery",
                "delivered",
                "cancelled"
            ];

            if (
                status &&
                !allowedStatuses.includes(
                    status
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid delivery status."
                });
            }

            const whereParams = [
                deliveryUserId
            ];

            let statusCondition = "";

            if (status) {
                statusCondition =
                    "AND da.status = ?";

                whereParams.push(
                    status
                );
            }

            const [countRows] =
                await pool.query(
                    `
                    SELECT
                        COUNT(*) AS total

                    FROM delivery_assignments da

                    INNER JOIN orders o
                        ON o.id = da.order_id

                    WHERE da.delivery_user_id = ?
                    ${statusCondition}
                    `,
                    whereParams
                );

            const total =
                Number(
                    countRows[0]?.total || 0
                );

            const totalPages =
                total > 0
                    ? Math.ceil(
                        total / limit
                    )
                    : 1;

            const safePage =
                Math.min(
                    page,
                    totalPages
                );

            const safeOffset =
                (safePage - 1) * limit;

            const dataParams = [
                deliveryUserId
            ];

            if (status) {
                dataParams.push(
                    status
                );
            }

            dataParams.push(
                limit,
                safeOffset
            );

            const [rows] =
                await pool.query(
                    `
                    SELECT
                        da.id AS assignment_id,
                        da.order_id,
                        da.delivery_user_id,
                        da.status AS delivery_status,
                        da.assigned_at,
                        da.picked_up_at,
                        da.out_for_delivery_at,
                        da.delivered_at,

                        o.id AS order_db_id,
                        o.order_id,
                        o.name,
                        o.phone,
                        o.address,
                        o.status AS order_status,
                        o.total,
                        o.payment_method,
                        o.payment_status,
                        o.created_at,
                        o.delivered_at AS order_delivered_at,

                        u.id AS customer_user_id,
                        u.first_name AS customer_first_name,
                        u.last_name AS customer_last_name,
                        u.email AS customer_email

                    FROM delivery_assignments da

                    INNER JOIN orders o
                        ON o.id = da.order_id

                    INNER JOIN users u
                        ON u.id = o.user_id

                    WHERE da.delivery_user_id = ?
                    ${statusCondition}

                    ORDER BY
                        CASE da.status
                            WHEN 'assigned' THEN 1
                            WHEN 'picked_up' THEN 2
                            WHEN 'out_for_delivery' THEN 3
                            WHEN 'delivered' THEN 4
                            WHEN 'cancelled' THEN 5
                            ELSE 6
                        END,
                        da.assigned_at DESC

                    LIMIT ? OFFSET ?
                    `,
                    dataParams
                );

            return res.status(200).json({
                success: true,

                assignments:
                    rows.map(
                        formatDelivery
                    ),

                pagination: {
                    page: safePage,
                    limit,
                    total,
                    totalPages
                }
            });

        } catch (error) {
            console.error(
                "Delivery assignments error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to load delivery assignments."
            });
        }
    }
);


/*
=========================================================
GET SINGLE DELIVERY ASSIGNMENT
GET /api/delivery/:assignmentId
=========================================================
*/

router.get(
    "/:id",
    requireDeliveryAuth,
    async (req, res) => {
        try {
            const deliveryUserId =
                req.deliveryUser.id;

            const assignmentId =
                Number(
                    req.params.id
                );

            if (
                !Number.isInteger(
                    assignmentId
                ) ||
                assignmentId <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid assignment ID."
                });
            }

            const connection =
                await pool.getConnection();

            try {
                const row =
                    await getDeliveryAssignment(
                        connection,
                        assignmentId,
                        deliveryUserId
                    );

                if (!row) {
                    return res.status(404).json({
                        success: false,
                        message:
                            "Delivery assignment not found."
                    });
                }

                return res.status(200).json({
                    success: true,
                    assignment:
                        formatDelivery(row)
                });

            } finally {
                connection.release();
            }

        } catch (error) {
            console.error(
                "Delivery assignment details error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to load delivery assignment."
            });
        }
    }
);


/*
=========================================================
ACCEPT DELIVERY
PATCH /api/delivery/:assignmentId/accept
assigned → picked_up
=========================================================
*/

router.patch(
    "/:id/accept",
    requireDeliveryAuth,
    async (req, res) => {
        const connection =
            await pool.getConnection();

        try {
            const deliveryUserId =
                req.deliveryUser.id;

            const assignmentId =
                Number(
                    req.params.id
                );

            if (
                !Number.isInteger(
                    assignmentId
                ) ||
                assignmentId <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid assignment ID."
                });
            }

            await connection.beginTransaction();

            const [rows] =
                await connection.query(
                    `
                    SELECT
                        da.id,
                        da.order_id,
                        da.delivery_user_id,
                        da.status

                    FROM delivery_assignments da

                    WHERE da.id = ?
                    AND da.delivery_user_id = ?

                    FOR UPDATE
                    `,
                    [
                        assignmentId,
                        deliveryUserId
                    ]
                );

            if (!rows.length) {
                await connection.rollback();

                return res.status(404).json({
                    success: false,
                    message:
                        "Delivery assignment not found."
                });
            }

            const assignment =
                rows[0];

            if (
                assignment.status !==
                "assigned"
            ) {
                await connection.rollback();

                return res.status(409).json({
                    success: false,
                    message:
                        `Delivery cannot be accepted from ${assignment.status} status.`
                });
            }

            const [updateResult] =
                await connection.query(
                    `
                    UPDATE delivery_assignments

                    SET
                        status = 'picked_up',
                        picked_up_at = NOW()

                    WHERE id = ?
                    AND delivery_user_id = ?
                    AND status = 'assigned'
                    `,
                    [
                        assignmentId,
                        deliveryUserId
                    ]
                );

            if (
                updateResult.affectedRows !== 1
            ) {
                await connection.rollback();

                return res.status(409).json({
                    success: false,
                    message:
                        "Delivery assignment was changed by another request."
                });
            }

            /*
            orders.delivery_user_id should already
            be assigned by Admin.

            We do not overwrite it unnecessarily.
            */

            await connection.commit();

            return res.status(200).json({
                success: true,
                message:
                    "Delivery accepted successfully.",

                assignment: {
                    id:
                        assignmentId,

                    orderId:
                        assignment.order_id,

                    status:
                        "picked_up"
                }
            });

        } catch (error) {
            try {
                await connection.rollback();
            } catch (_) {}

            console.error(
                "Accept delivery error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to accept delivery."
            });

        } finally {
            connection.release();
        }
    }
);


/*
=========================================================
START DELIVERY
PATCH /api/delivery/:assignmentId/start
picked_up → out_for_delivery
=========================================================
*/

router.patch(
    "/:id/start",
    requireDeliveryAuth,
    async (req, res) => {
        const connection =
            await pool.getConnection();

        try {
            const deliveryUserId =
                req.deliveryUser.id;

            const assignmentId =
                Number(
                    req.params.id
                );

            if (
                !Number.isInteger(
                    assignmentId
                ) ||
                assignmentId <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid assignment ID."
                });
            }

            await connection.beginTransaction();

            const [rows] =
                await connection.query(
                    `
                    SELECT
                        da.id,
                        da.order_id,
                        da.delivery_user_id,
                        da.status,

                        o.status AS order_status

                    FROM delivery_assignments da

                    INNER JOIN orders o
                        ON o.id = da.order_id

                    WHERE da.id = ?
                    AND da.delivery_user_id = ?

                    FOR UPDATE
                    `,
                    [
                        assignmentId,
                        deliveryUserId
                    ]
                );

            if (!rows.length) {
                await connection.rollback();

                return res.status(404).json({
                    success: false,
                    message:
                        "Delivery assignment not found."
                });
            }

            const assignment =
                rows[0];

            if (
                assignment.status !==
                "picked_up"
            ) {
                await connection.rollback();

                return res.status(409).json({
                    success: false,
                    message:
                        `Delivery cannot be started from ${assignment.status} status.`
                });
            }

            /*
            The order should be ready for pickup
            before the delivery boy starts delivery.

            We allow already out_for_delivery only
            when the assignment itself is picked_up,
            so the state transition remains controlled.
            */

            if (
                assignment.order_status !==
                "ready_for_pickup"
            ) {
                await connection.rollback();

                return res.status(409).json({
                    success: false,
                    message:
                        `Order cannot start delivery from "${assignment.order_status}" status.`
                });
            }

            const [assignmentUpdate] =
                await connection.query(
                    `
                    UPDATE delivery_assignments

                    SET
                        status = 'out_for_delivery',
                        out_for_delivery_at = NOW()

                    WHERE id = ?
                    AND delivery_user_id = ?
                    AND status = 'picked_up'
                    `,
                    [
                        assignmentId,
                        deliveryUserId
                    ]
                );

            if (
                assignmentUpdate.affectedRows !== 1
            ) {
                await connection.rollback();

                return res.status(409).json({
                    success: false,
                    message:
                        "Delivery assignment was changed by another request."
                });
            }

            const [orderUpdate] =
                await connection.query(
                    `
                    UPDATE orders

                    SET
                        status = 'out_for_delivery'

                    WHERE id = ?
                    AND delivery_user_id = ?
                    AND status = 'ready_for_pickup'
                    `,
                    [
                        assignment.order_id,
                        deliveryUserId
                    ]
                );

            if (
                orderUpdate.affectedRows !== 1
            ) {
                await connection.rollback();

                return res.status(409).json({
                    success: false,
                    message:
                        "Order status could not be updated."
                });
            }

            await connection.commit();

            return res.status(200).json({
                success: true,
                message:
                    "Delivery started successfully.",

                assignment: {
                    id:
                        assignmentId,

                    orderId:
                        assignment.order_id,

                    status:
                        "out_for_delivery"
                }
            });

        } catch (error) {
            try {
                await connection.rollback();
            } catch (_) {}

            console.error(
                "Start delivery error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to start delivery."
            });

        } finally {
            connection.release();
        }
    }
);


/*
=========================================================
SEND DELIVERY OTP
POST /api/delivery/:orderId/send-otp

IMPORTANT:
This endpoint uses ORDER DATABASE ID,
not assignment ID.

Example:
POST /api/delivery/31/send-otp
=========================================================
*/

router.post(
    "/:id/send-otp",
    requireDeliveryAuth,
    async (req, res) => {
        const connection =
            await pool.getConnection();

        try {
            const orderId =
                Number(
                    req.params.id
                );

            const deliveryUserId =
                req.deliveryUser.id;

            if (
                !Number.isInteger(
                    orderId
                ) ||
                orderId <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid order ID."
                });
            }

            await connection.beginTransaction();

            const [rows] =
                await connection.query(
                    `
                    SELECT
                        o.id,
                        o.order_id,
                        o.name,
                        o.status,
                        o.delivery_user_id,

                        da.id AS assignment_id,
                        da.status AS assignment_status,

                        u.email AS customer_email,
                        u.first_name AS customer_first_name,
                        u.last_name AS customer_last_name

                    FROM orders o

                    INNER JOIN delivery_assignments da
                        ON da.order_id = o.id

                    INNER JOIN users u
                        ON u.id = o.user_id

                    WHERE o.id = ?
                    AND o.delivery_user_id = ?
                    AND da.delivery_user_id = ?

                    FOR UPDATE
                    `,
                    [
                        orderId,
                        deliveryUserId,
                        deliveryUserId
                    ]
                );

            if (!rows.length) {
                await connection.rollback();

                return res.status(404).json({
                    success: false,
                    message:
                        "Delivery order not found."
                });
            }

            const order =
                rows[0];

            if (
                order.assignment_status !==
                "out_for_delivery"
            ) {
                await connection.rollback();

                return res.status(409).json({
                    success: false,
                    message:
                        "OTP can only be generated for an out-for-delivery assignment."
                });
            }

            if (
                order.status !==
                "out_for_delivery"
            ) {
                await connection.rollback();

                return res.status(409).json({
                    success: false,
                    message:
                        "OTP can only be generated when the order is out for delivery."
                });
            }

            if (
                !order.customer_email
            ) {
                await connection.rollback();

                return res.status(400).json({
                    success: false,
                    message:
                        "Customer email is unavailable."
                });
            }

            const otp =
                generateDeliveryOTP();

            const otpHash =
                await bcrypt.hash(
                    otp,
                    12
                );

            await connection.query(
                `
                UPDATE orders

                SET
                    delivery_otp_hash = ?,
                    delivery_otp_expires_at =
                        DATE_ADD(
                            NOW(),
                            INTERVAL ${OTP_EXPIRY_MINUTES} MINUTE
                        ),
                    delivery_otp_attempts = 0

                WHERE id = ?
                AND delivery_user_id = ?
                AND status = 'out_for_delivery'
                `,
                [
                    otpHash,
                    orderId,
                    deliveryUserId
                ]
            );

            await connection.commit();

            /*
            IMPORTANT:
            The transaction is committed before email sending
            so SMTP failure does not leave a database transaction
            open.

            The OTP remains valid for the configured expiry.
            */

            try {
                /*
                sendDeliveryOTPEmail is imported from
                ../../mailer at the top of this file.

                Defensive guard kept in case the mailer
                module is refactored and the export is
                renamed/removed.
                */

                if (
                    typeof sendDeliveryOTPEmail !==
                    "function"
                ) {
                    console.error(
                        "sendDeliveryOTPEmail is not defined."
                    );

                    return res.status(500).json({
                        success: false,
                        message:
                            "Delivery OTP email service is not configured."
                    });
                }

                const customerName =
                    [
                        order.customer_first_name,
                        order.customer_last_name
                    ]
                        .filter(Boolean)
                        .join(" ")
                        .trim() ||
                    order.name ||
                    "Customer";

                await sendDeliveryOTPEmail({
                    to: order.customer_email,
                    customerName,
                    orderId: order.order_id,
                    otp
                });

            } catch (emailError) {
                console.error(
                    "Delivery OTP email failed:",
                    emailError
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to send the delivery OTP."
                });
            }

            return res.status(200).json({
                success: true,
                message:
                    "Delivery OTP has been sent to the customer."
            });

        } catch (error) {
            try {
                await connection.rollback();
            } catch (_) {}

            console.error(
                "Send delivery OTP error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to send delivery OTP."
            });

        } finally {
            connection.release();
        }
    }
);


/*
=========================================================
VERIFY DELIVERY OTP
POST /api/delivery/:orderId/verify-otp

ORDER ID IS USED HERE.

Successful verification updates:

1. orders.status = delivered
2. orders.delivered_at
3. delivery_assignments.status = delivered
4. delivery_assignments.delivered_at

All inside ONE transaction.
=========================================================
*/

router.post(
    "/:id/verify-otp",
    requireDeliveryAuth,
    async (req, res) => {
        const connection =
            await pool.getConnection();

        try {
            const orderId =
                Number(
                    req.params.id
                );

            const deliveryUserId =
                req.deliveryUser.id;

            const otp =
                String(
                    req.body?.otp || ""
                ).trim();

            if (
                !Number.isInteger(
                    orderId
                ) ||
                orderId <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid order ID."
                });
            }

            if (
                !/^\d{6}$/.test(
                    otp
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Enter a valid 6-digit OTP."
                });
            }

            await connection.beginTransaction();

            const [rows] =
                await connection.query(
                    `
                    SELECT
                        o.id,
                        o.order_id,
                        o.status,
                        o.delivery_user_id,
                        o.delivery_otp_hash,
                        o.delivery_otp_expires_at,
                        o.delivery_otp_attempts,

                        da.id AS assignment_id,
                        da.status AS assignment_status

                    FROM orders o

                    INNER JOIN delivery_assignments da
                        ON da.order_id = o.id

                    WHERE o.id = ?
                    AND o.delivery_user_id = ?
                    AND da.delivery_user_id = ?

                    FOR UPDATE
                    `,
                    [
                        orderId,
                        deliveryUserId,
                        deliveryUserId
                    ]
                );

            if (!rows.length) {
                await connection.rollback();

                return res.status(404).json({
                    success: false,
                    message:
                        "Delivery order not found."
                });
            }

            const order =
                rows[0];

            if (
                order.status !==
                "out_for_delivery"
            ) {
                await connection.rollback();

                return res.status(409).json({
                    success: false,
                    message:
                        "This delivery is not ready for completion."
                });
            }

            if (
                order.assignment_status !==
                "out_for_delivery"
            ) {
                await connection.rollback();

                return res.status(409).json({
                    success: false,
                    message:
                        "This delivery assignment is not ready for completion."
                });
            }

            if (
                !order.delivery_otp_hash ||
                !order.delivery_otp_expires_at
            ) {
                await connection.rollback();

                return res.status(400).json({
                    success: false,
                    message:
                        "No active delivery OTP exists. Please request a new OTP."
                });
            }

            const attempts =
                Number(
                    order.delivery_otp_attempts ||
                    0
                );

            if (
                attempts >=
                MAX_OTP_ATTEMPTS
            ) {
                await connection.rollback();

                return res.status(429).json({
                    success: false,
                    message:
                        "Too many incorrect OTP attempts. Please request a new OTP."
                });
            }

            const expiresAt =
                new Date(
                    order.delivery_otp_expires_at
                );

            if (
                Number.isNaN(
                    expiresAt.getTime()
                ) ||
                expiresAt <= new Date()
            ) {
                await connection.rollback();

                return res.status(410).json({
                    success: false,
                    message:
                        "The delivery OTP has expired. Please request a new OTP."
                });
            }

            const otpValid =
                await bcrypt.compare(
                    otp,
                    order.delivery_otp_hash
                );

            if (!otpValid) {
                const newAttempts =
                    attempts + 1;

                await connection.query(
                    `
                    UPDATE orders

                    SET
                        delivery_otp_attempts = ?

                    WHERE id = ?
                    AND delivery_user_id = ?
                    `,
                    [
                        newAttempts,
                        orderId,
                        deliveryUserId
                    ]
                );

                await connection.commit();

                const remainingAttempts =
                    Math.max(
                        MAX_OTP_ATTEMPTS -
                        newAttempts,
                        0
                    );

                return res.status(400).json({
                    success: false,

                    message:
                        remainingAttempts > 0
                            ? `Incorrect OTP. ${remainingAttempts} attempt(s) remaining.`
                            : "Incorrect OTP. Please request a new OTP.",

                    remainingAttempts
                });
            }

            /*
            OTP IS VALID.

            Update the ORDER.
            */

            const [orderUpdate] =
                await connection.query(
                    `
                    UPDATE orders

                    SET
                        status = 'delivered',
                        delivered_at = NOW(),
                        delivery_otp_hash = NULL,
                        delivery_otp_expires_at = NULL,
                        delivery_otp_attempts = 0

                    WHERE id = ?
                    AND delivery_user_id = ?
                    AND status = 'out_for_delivery'
                    `,
                    [
                        orderId,
                        deliveryUserId
                    ]
                );

            if (
                orderUpdate.affectedRows !== 1
            ) {
                await connection.rollback();

                return res.status(409).json({
                    success: false,
                    message:
                        "Order could not be completed."
                });
            }

            /*
            Update the DELIVERY ASSIGNMENT.

            This was missing from the old implementation.
            */

            const [assignmentUpdate] =
                await connection.query(
                    `
                    UPDATE delivery_assignments

                    SET
                        status = 'delivered',
                        delivered_at = NOW()

                    WHERE id = ?
                    AND order_id = ?
                    AND delivery_user_id = ?
                    AND status = 'out_for_delivery'
                    `,
                    [
                        order.assignment_id,
                        orderId,
                        deliveryUserId
                    ]
                );

            if (
                assignmentUpdate.affectedRows !== 1
            ) {
                await connection.rollback();

                return res.status(409).json({
                    success: false,
                    message:
                        "Delivery assignment could not be completed."
                });
            }

            await connection.commit();

            return res.status(200).json({
                success: true,
                message:
                    "Delivery completed successfully.",

                delivery: {
                    assignmentId:
                        order.assignment_id,

                    orderDbId:
                        order.id,

                    orderId:
                        order.order_id,

                    status:
                        "delivered"
                }
            });

        } catch (error) {
            try {
                await connection.rollback();
            } catch (_) {}

            console.error(
                "Verify delivery OTP error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to verify delivery OTP."
            });

        } finally {
            connection.release();
        }
    }
);


module.exports = router;