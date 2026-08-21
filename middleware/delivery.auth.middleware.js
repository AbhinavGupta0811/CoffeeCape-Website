const pool = require("../db");

async function requireDeliveryAuth(req, res, next) {
    try {
        if (!req.session || !req.session.deliveryUser) {
            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });
        }

        const sessionUser = req.session.deliveryUser;

        const [rows] = await pool.query(
            `
            SELECT
                id,
                employee_id,
                name,
                email,
                phone,
                status,
                auth_version,
                force_password_change
            FROM delivery_users
            WHERE id = ?
            LIMIT 1
            `,
            [sessionUser.id]
        );

        const deliveryUser = rows[0];

        /*
         * Account no longer exists.
         */
        if (!deliveryUser) {
            return destroyDeliverySession(
                req,
                res,
                "Authentication required."
            );
        }

        /*
         * Account has been disabled/suspended.
         */
        if (deliveryUser.status !== "active") {
            return destroyDeliverySession(
                req,
                res,
                "Your delivery account is no longer active."
            );
        }

        /*
         * Password reset / security event invalidated
         * the existing session.
         */
        if (
            Number(deliveryUser.auth_version) !==
            Number(sessionUser.authVersion)
        ) {
            return destroyDeliverySession(
                req,
                res,
                "Your session has expired. Please log in again."
            );
        }

        /*
         * Attach fresh database-backed identity.
         */
        req.deliveryUser = {
            id: deliveryUser.id,
            employeeId: deliveryUser.employee_id,
            name: deliveryUser.name,
            email: deliveryUser.email,
            phone: deliveryUser.phone,

            authVersion:
                Number(
                    deliveryUser.auth_version
                ),

            forcePasswordChange:
                Boolean(
                    deliveryUser.force_password_change
                )
        };

        next();

    } catch (error) {
        console.error(
            "Delivery authentication middleware error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to verify authentication."
        });
    }
}


function destroyDeliverySession(req, res, message) {
    req.session.destroy((err) => {
        if (err) {
            console.error(
                "Delivery session destruction error:",
                err
            );
        }
    });

    return res.status(401).json({
        success: false,
        message
    });
}

module.exports = {
    requireDeliveryAuth
};