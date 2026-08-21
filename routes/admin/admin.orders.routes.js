const express = require("express");
const db = require("../../db");
const adminAuth = require("../../middleware/admin.middleware");
const { exportOrdersCSV } = require("../../services/exportController");

const router = express.Router();

/* =========================
   CONSTANTS
========================= */
const REASON_MIN_LENGTH = 3;
const REASON_MAX_LENGTH = 500;


/* =========================
   SAFE SOCKET EMITTER
========================= */
function emitSocket(req, event, data) {
  try {
    const io = req.app.get("io");

    if (io) {
      io.emit(event, data);
    }
  } catch (err) {
    console.error("Socket emit error:", err);
  }
}


/* =========================
   ORDER STATUS WORKFLOW
   Enforces valid transitions
   to prevent status skipping
========================= */
const STATUS_TRANSITIONS = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready_for_pickup"],
  ready_for_pickup: [],
  out_for_delivery: ["delivered"],
  refund_requested: ["refunded", "refund_rejected"]
};

function isValidTransition(currentStatus, nextStatus) {
  const allowed = STATUS_TRANSITIONS[currentStatus];

  return allowed && allowed.includes(nextStatus);
}


/* =========================
   ORDERS STATS
========================= */
router.get("/stats", adminAuth, async (req, res) => {
  try {

    const [[ordersRow]] = await db.query(
      "SELECT COUNT(*) AS count FROM orders WHERE DATE(created_at)=CURDATE()"
    );

    const [[revenueRow]] = await db.query(
      `
      SELECT SUM(total) AS amount
      FROM orders
      WHERE DATE(created_at)=CURDATE()
        AND status='delivered'
      `
    );

    const todayOrders = ordersRow.count || 0;
    const todayRevenue = Number(revenueRow.amount) || 0;

    const [revenueByDay] = await db.query(`
      SELECT DATE(created_at) AS day, SUM(total) AS total
      FROM orders
      WHERE status='delivered'
      GROUP BY day
      ORDER BY day
    `);

    const [ordersByDay] = await db.query(`
      SELECT DATE(created_at) AS day, COUNT(*) AS count
      FROM orders
      GROUP BY day
      ORDER BY day
    `);

    const [statusRows] = await db.query(`
      SELECT status, COUNT(*) AS count
      FROM orders
      GROUP BY status
    `);

    const statusCount = {};

    statusRows.forEach(r => {
      statusCount[r.status] = r.count;
    });

    const [topItems] = await db.query(`
      SELECT oi.name AS name, SUM(oi.qty) AS qty
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      GROUP BY oi.name
      ORDER BY qty DESC
      LIMIT 6
    `);

    res.json({
      success: true,
      todayOrders,
      todayRevenue,
      revenueByDay,
      ordersByDay,
      statusCount,
      topItems
    });

  } catch (err) {
    console.error("Stats error:", err);

    res.status(500).json({
      success: false
    });
  }
});


/* =========================
   Export The Orders
========================= */
router.get(
  "/export",
  exportOrdersCSV
);


/* =========================
   GET ORDERS
   ACTIVE / PAST / ALL
========================= */
router.get("/", adminAuth, async (req, res) => {
  try {

    const type = req.query.type || "active";

    const VALID_TYPES = [
      "active",
      "past",
      "all"
    ];

    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid type"
      });
    }

    const ACTIVE_STATUSES = [
      "pending",
      "confirmed",
      "preparing",
      "ready_for_pickup",
      "out_for_delivery",
      "refund_requested"
    ];

    const PAST_STATUSES = [
      "delivered",
      "cancelled",
      "refunded",
      "refund_rejected"
    ];

    let query = `
      SELECT 
        o.id,
        o.order_id,
        o.name,
        o.status,
        o.payment_status,
        o.cancelled_by,
        o.total,
        o.created_at,
        o.delivered_at,
        u.email AS customer_email
      FROM orders o
      JOIN users u ON o.user_id = u.id
    `;

    let params = [];

    if (type === "active") {

      query += " WHERE o.status IN (?)";

      params.push(ACTIVE_STATUSES);

    } else if (type === "past") {

      query += " WHERE o.status IN (?)";

      params.push(PAST_STATUSES);
    }

    query += " ORDER BY o.created_at DESC";

    const [orders] = await db.query(
      query,
      params
    );

    res.json({
      success: true,
      orders
    });

  } catch (err) {

    console.error(
      "Admin fetch orders error:",
      err
    );

    res.status(500).json({
      success: false,
      message: "Failed to fetch orders"
    });
  }
});

/* =========================================================
   DELIVERY BOYS
   GET ACTIVE DELIVERY BOYS
========================================================= */
router.get(
  "/delivery-boys",
  adminAuth,
  async (req, res) => {
    try {
      const [deliveryBoys] = await db.query(`
        SELECT
          id,
          employee_id,
          name,
          email,
          phone,
          status
        FROM delivery_users
        WHERE status = 'active'
        ORDER BY name ASC
      `);

      return res.json({
        success: true,
        deliveryBoys
      });

    } catch (err) {

      console.error(
        "Admin delivery boys fetch error:",
        err
      );

      return res.status(500).json({
        success: false,
        message: "Failed to fetch delivery boys"
      });
    }
  }
);

/* =========================================================
   ASSIGN ORDER TO DELIVERY BOY
========================================================= */
router.post(
  "/:id/assign-delivery",
  adminAuth,
  async (req, res) => {

    const connection =
      await db.getConnection();

    try {

      const orderId = parseInt(
        req.params.id,
        10
      );

      const deliveryUserId = parseInt(
        req.body.delivery_user_id,
        10
      );

      if (
        !orderId ||
        Number.isNaN(orderId)
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid order ID"
        });
      }

      if (
        !deliveryUserId ||
        Number.isNaN(deliveryUserId)
      ) {
        return res.status(400).json({
          success: false,
          message: "Delivery boy is required"
        });
      }


      await connection.beginTransaction();


      /* =====================================================
         LOCK ORDER
      ===================================================== */

      const [orderRows] =
        await connection.query(
          `
          SELECT
            id,
            order_id,
            status,
            payment_status,
            payment_method,
            delivery_user_id
          FROM orders
          WHERE id = ?
          FOR UPDATE
          `,
          [orderId]
        );


      if (!orderRows.length) {

        await connection.rollback();

        return res.status(404).json({
          success: false,
          message: "Order not found"
        });
      }


      const order = orderRows[0];


      /* =====================================================
         FINAL ORDER PROTECTION
      ===================================================== */

      if (
        [
          "delivered",
          "cancelled",
          "refunded",
          "refund_rejected"
        ].includes(order.status)
      ) {

        await connection.rollback();

        return res.status(409).json({
          success: false,
          message:
            "This order can no longer be assigned"
        });
      }


      /* =====================================================
         PAYMENT VALIDATION
      ===================================================== */

      const isCOD =
        order.payment_method === "cod" &&
        order.payment_status === "pending";

      const isPaidOnline =
        order.payment_status === "paid";

      if (
        !isCOD &&
        !isPaidOnline
      ) {

        await connection.rollback();

        return res.status(403).json({
          success: false,
          message:
            "Order payment is not completed"
        });
      }


      /* =====================================================
         LOCK DELIVERY USER
      ===================================================== */

      const [deliveryRows] =
        await connection.query(
          `
          SELECT
            id,
            employee_id,
            name,
            email,
            phone,
            status
          FROM delivery_users
          WHERE id = ?
          FOR UPDATE
          `,
          [deliveryUserId]
        );


      if (!deliveryRows.length) {

        await connection.rollback();

        return res.status(404).json({
          success: false,
          message: "Delivery boy not found"
        });
      }


      const deliveryBoy =
        deliveryRows[0];


      if (
        deliveryBoy.status !== "active"
      ) {

        await connection.rollback();

        return res.status(409).json({
          success: false,
          message:
            "This delivery boy is not active"
        });
      }


      /* =====================================================
         CHECK EXISTING ACTIVE ASSIGNMENT
      ===================================================== */

      const [existingAssignments] =
        await connection.query(
          `
          SELECT
            id,
            order_id,
            delivery_user_id,
            status,
            assigned_at
          FROM delivery_assignments
          WHERE order_id = ?
          AND status IN (
            'assigned',
            'picked_up',
            'out_for_delivery'
          )
          LIMIT 1
          FOR UPDATE
          `,
          [orderId]
        );


      if (existingAssignments.length) {

        await connection.rollback();

        return res.status(409).json({
          success: false,
          message:
            "This order is already assigned to a delivery boy",
          assignment:
            existingAssignments[0]
        });
      }


      /* =====================================================
         CREATE ASSIGNMENT
      ===================================================== */

      const assignedBy =
        req.admin?.id ||
        req.user?.id ||
        null;


      const [assignmentResult] =
        await connection.query(
          `
          INSERT INTO delivery_assignments (
            order_id,
            delivery_user_id,
            status,
            assigned_at,
            assigned_by
          )
          VALUES (
            ?,
            ?,
            'assigned',
            NOW(),
            ?
          )
          `,
          [
            orderId,
            deliveryUserId,
            assignedBy
          ]
        );


      /* =====================================================
         KEEP EXISTING DELIVERY SYSTEM COMPATIBLE
      ===================================================== */

      await connection.query(
        `
        UPDATE orders
        SET
          delivery_user_id = ?,
          status = 'out_for_delivery'
        WHERE id = ?
        `,
        [
          deliveryUserId,
          orderId
        ]
      );


      await connection.commit();


      /* =====================================================
         SOCKET EVENT
      ===================================================== */

      emitSocket(
        req,
        "delivery-assigned",
        {
          order_id: orderId,
          order_number: order.order_id,
          delivery_assignment_id:
            assignmentResult.insertId,

          delivery_boy: {
            id: deliveryBoy.id,
            employee_id:
              deliveryBoy.employee_id,
            name: deliveryBoy.name
          },

          status: "assigned"
        }
      );


      return res.status(201).json({

        success: true,

        message:
          "Order assigned successfully",

        assignment: {
          id:
            assignmentResult.insertId,

          order_id:
            orderId,

          order_number:
            order.order_id,

          delivery_user_id:
            deliveryBoy.id,

          employee_id:
            deliveryBoy.employee_id,

          delivery_boy_name:
            deliveryBoy.name,

          status:
            "assigned"
        }

      });

    } catch (err) {

      await connection.rollback();

      console.error(
        "Assign delivery error:",
        err
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to assign delivery"
      });

    } finally {

      connection.release();
    }
  }
);

/* =========================================================
   GET CURRENT DELIVERY ASSIGNMENT
========================================================= */
router.get(
  "/:id/delivery-assignment",
  adminAuth,
  async (req, res) => {

    try {

      const orderId =
        parseInt(
          req.params.id,
          10
        );


      if (
        !orderId ||
        Number.isNaN(orderId)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid order ID"
        });
      }


      const [rows] =
        await db.query(
          `
          SELECT
            da.id,
            da.order_id,
            da.delivery_user_id,
            da.status,
            da.assigned_at,
            da.picked_up_at,
            da.out_for_delivery_at,
            da.delivered_at,

            du.employee_id,
            du.name,
            du.email,
            du.phone

          FROM delivery_assignments da

          INNER JOIN delivery_users du
            ON du.id =
               da.delivery_user_id

          WHERE da.order_id = ?

          ORDER BY da.id DESC

          LIMIT 1
          `,
          [orderId]
        );


      return res.json({

        success: true,

        assignment:
          rows.length
            ? rows[0]
            : null

      });

    } catch (err) {

      console.error(
        "Get delivery assignment error:",
        err
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to fetch delivery assignment"
      });
    }
  }
);


/* =========================================================
   REASSIGN ORDER
========================================================= */
router.post(
  "/:id/reassign-delivery",
  adminAuth,
  async (req, res) => {

    const connection =
      await db.getConnection();

    try {

      const orderId =
        parseInt(
          req.params.id,
          10
        );

      const newDeliveryUserId =
        parseInt(
          req.body.delivery_user_id,
          10
        );


      if (
        !orderId ||
        Number.isNaN(orderId)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid order ID"
        });
      }


      if (
        !newDeliveryUserId ||
        Number.isNaN(newDeliveryUserId)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Delivery boy is required"
        });
      }


      await connection.beginTransaction();


      /* =====================================================
         LOCK ORDER
      ===================================================== */

      const [orders] =
        await connection.query(
          `
          SELECT
            id,
            order_id,
            status,
            delivery_user_id
          FROM orders
          WHERE id = ?
          FOR UPDATE
          `,
          [orderId]
        );


      if (!orders.length) {

        await connection.rollback();

        return res.status(404).json({
          success: false,
          message:
            "Order not found"
        });
      }


      const order =
        orders[0];


      if (
        [
          "delivered",
          "cancelled",
          "refunded",
          "refund_rejected"
        ].includes(order.status)
      ) {

        await connection.rollback();

        return res.status(409).json({
          success: false,
          message:
            "Final orders cannot be reassigned"
        });
      }


      /* =====================================================
         CHECK NEW DELIVERY BOY
      ===================================================== */

      const [deliveryUsers] =
        await connection.query(
          `
          SELECT
            id,
            employee_id,
            name,
            email,
            phone,
            status
          FROM delivery_users
          WHERE id = ?
          FOR UPDATE
          `,
          [newDeliveryUserId]
        );


      if (!deliveryUsers.length) {

        await connection.rollback();

        return res.status(404).json({
          success: false,
          message:
            "Delivery boy not found"
        });
      }


      const deliveryBoy =
        deliveryUsers[0];


      if (
        deliveryBoy.status !== "active"
      ) {

        await connection.rollback();

        return res.status(409).json({
          success: false,
          message:
            "Selected delivery boy is not active"
        });
      }


      /* =====================================================
         FIND ACTIVE ASSIGNMENT
      ===================================================== */

      const [assignments] =
        await connection.query(
          `
          SELECT
            id,
            delivery_user_id,
            status
          FROM delivery_assignments
          WHERE order_id = ?
          AND status IN (
            'assigned',
            'picked_up',
            'out_for_delivery'
          )
          LIMIT 1
          FOR UPDATE
          `,
          [orderId]
        );


      if (!assignments.length) {

        await connection.rollback();

        return res.status(409).json({
          success: false,
          message:
            "No active delivery assignment exists"
        });
      }


      const assignment =
        assignments[0];


      if (
        Number(
          assignment.delivery_user_id
        ) === Number(
          newDeliveryUserId
        )
      ) {

        await connection.rollback();

        return res.status(409).json({
          success: false,
          message:
            "Order is already assigned to this delivery boy"
        });
      }


      /* =====================================================
         CLOSE OLD ASSIGNMENT
      ===================================================== */

      await connection.query(
        `
        UPDATE delivery_assignments
        SET
          status = 'cancelled',
          updated_at = NOW()
        WHERE id = ?
        `,
        [assignment.id]
      );


      /* =====================================================
         CREATE NEW ASSIGNMENT
      ===================================================== */

      const assignedBy =
        req.admin?.id ||
        req.user?.id ||
        null;


      const [newAssignment] =
        await connection.query(
          `
          INSERT INTO delivery_assignments (
            order_id,
            delivery_user_id,
            status,
            assigned_at,
            assigned_by
          )
          VALUES (
            ?,
            ?,
            'assigned',
            NOW(),
            ?
          )
          `,
          [
            orderId,
            newDeliveryUserId,
            assignedBy
          ]
        );


      /* =====================================================
         UPDATE ORDER OWNER
      ===================================================== */

      await connection.query(
        `
        UPDATE orders
        SET
          delivery_user_id = ?,
          status = 'out_for_delivery'
        WHERE id = ?
        `,
        [
          newDeliveryUserId,
          orderId
        ]
      );


      await connection.commit();


      emitSocket(
        req,
        "delivery-reassigned",
        {
          order_id:
            orderId,

          order_number:
            order.order_id,

          delivery_assignment_id:
            newAssignment.insertId,

          delivery_boy: {
            id:
              deliveryBoy.id,

            employee_id:
              deliveryBoy.employee_id,

            name:
              deliveryBoy.name
          },

          status:
            "assigned"
        }
      );


      return res.json({

        success: true,

        message:
          "Order reassigned successfully",

        assignment: {
          id:
            newAssignment.insertId,

          order_id:
            orderId,

          delivery_user_id:
            deliveryBoy.id,

          employee_id:
            deliveryBoy.employee_id,

          delivery_boy_name:
            deliveryBoy.name,

          status:
            "assigned"
        }

      });

    } catch (err) {

      await connection.rollback();

      console.error(
        "Reassign delivery error:",
        err
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to reassign delivery"
      });

    } finally {

      connection.release();
    }
  }
);

/* =========================
   GET ORDER DETAILS (ADMIN)
========================= */
router.get("/:id", adminAuth, async (req, res) => {
  try {

    const orderId = parseInt(
      req.params.id,
      10
    );

    if (!orderId || isNaN(orderId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID"
      });
    }

    const [[order]] = await db.query(
      `
      SELECT 
        o.id,
        o.order_id,
        o.name,
        o.phone,
        o.status,
        o.payment_status,
        o.payment_method,
        o.subtotal,
        o.gst,
        o.delivery_fee,
        o.tip,
        o.discount,
        o.total,
        o.address,
        o.notes,
        o.created_at,
        o.delivered_at,
        o.refund_reason,
        o.refund_requested_at,
        o.refund_reject_reason,
        u.email AS customer_email
      FROM orders o
      JOIN users u ON o.user_id = u.id
      WHERE o.id = ?
      `,
      [orderId]
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    const [items] = await db.query(
      "SELECT name, qty, price FROM order_items WHERE order_id=?",
      [orderId]
    );

    res.json({
      success: true,
      order: {
        ...order,
        items
      }
    });

  } catch (err) {

    console.error(
      "Admin order details error:",
      err
    );

    res.status(500).json({
      success: false,
      message: "Failed to fetch order details"
    });
  }
});


/* =========================
   UPDATE ORDER STATUS (ADMIN)
   Enforces strict status
   transition workflow
========================= */
router.put("/:id/status", adminAuth, async (req, res) => {
  try {

    const { status } = req.body;

    const allowedStatuses = [
      "confirmed",
      "preparing",
      "ready_for_pickup",
      "out_for_delivery",
      "delivered",
      "cancelled"
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status"
      });
    }

    const orderId = parseInt(
      req.params.id,
      10
    );

    if (!orderId || isNaN(orderId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID"
      });
    }

    const [[order]] = await db.query(
      "SELECT status, payment_status, payment_method FROM orders WHERE id=?",
      [orderId]
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    // Prevent modifying final orders
    if (
      [
        "delivered",
        "cancelled",
        "refunded",
        "refund_rejected"
      ].includes(order.status)
    ) {
      return res.status(403).json({
        success: false,
        message: "Final orders cannot be modified"
      });
    }

    // Enforce valid workflow transitions
    if (!isValidTransition(order.status, status)) {
      return res.status(400).json({
        success: false,
        message:
          `Cannot transition from '${order.status}' to '${status}'`
      });
    }

    // Payment check before confirm
    if (status === "confirmed") {

      const isCOD =
        order.payment_method === "cod" &&
        order.payment_status === "pending";

      const isPaidOnline =
        order.payment_status === "paid";

      if (!isCOD && !isPaidOnline) {
        return res.status(403).json({
          success: false,
          message: "Order payment not completed"
        });
      }
    }

    if (status === "delivered") {

      await db.query(
        "UPDATE orders SET status=?, delivered_at=NOW() WHERE id=?",
        [
          status,
          orderId
        ]
      );

    } else {

      await db.query(
        "UPDATE orders SET status=? WHERE id=?",
        [
          status,
          orderId
        ]
      );
    }

    emitSocket(
      req,
      "order-status-updated",
      {
        order_id: orderId,
        status
      }
    );

    res.json({
      success: true
    });

  } catch (err) {

    console.error(
      "Update status error:",
      err
    );

    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});


/* =========================
   CANCEL ORDER (ADMIN)
========================= */
router.post("/:id/cancel", adminAuth, async (req, res) => {
  const connection =
    await db.getConnection();

  try {

    await connection.beginTransaction();

    const orderId = parseInt(
      req.params.id,
      10
    );

    if (!orderId || isNaN(orderId)) {

      await connection.rollback();

      return res.status(400).json({
        success: false,
        message: "Invalid order ID"
      });
    }

    const [[order]] =
      await connection.query(
        `
        SELECT status, payment_method, payment_status
        FROM orders
        WHERE id=?
        `,
        [orderId]
      );

    if (!order) {

      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    if (order.status === "cancelled") {

      await connection.rollback();

      return res.status(409).json({
        success: false,
        message: "Order already cancelled"
      });
    }

    if (
      ![
        "pending",
        "confirmed"
      ].includes(order.status)
    ) {

      await connection.rollback();

      return res.status(400).json({
        success: false,
        message:
          "Order cannot be cancelled at this stage"
      });
    }

    let paymentStatus;

    if (order.payment_method === "cod") {

      paymentStatus = "cancelled";

    } else if (
      order.payment_status === "paid"
    ) {

      paymentStatus = "refunded";

    } else {

      paymentStatus = "cancelled";
    }

    await connection.query(
      `
      UPDATE orders
      SET status=?,
          cancelled_by=?,
          payment_status=?
      WHERE id=?
      `,
      [
        "cancelled",
        "admin",
        paymentStatus,
        orderId
      ]
    );

    await connection.commit();

    emitSocket(
      req,
      "order-status-updated",
      {
        order_id: orderId,
        status: "cancelled",
        payment_status: paymentStatus
      }
    );

    return res.json({
      success: true,
      status: "cancelled",
      payment_status: paymentStatus
    });

  } catch (err) {

    await connection.rollback();

    console.error(
      "Admin cancel error:",
      err
    );

    return res.status(500).json({
      success: false,
      message: "Server error"
    });

  } finally {

    connection.release();
  }
});


/* =========================
   APPROVE REFUND (ADMIN)
========================= */
router.post("/:id/refund", adminAuth, async (req, res) => {
    try {

      const orderId = parseInt(
        req.params.id,
        10
      );

      if (!orderId || isNaN(orderId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order ID"
        });
      }

      const [[order]] =
        await db.query(
          "SELECT status FROM orders WHERE id=?",
          [orderId]
        );

      if (
        !order ||
        order.status !== "refund_requested"
      ) {
        return res.status(400).json({
          success: false,
          message: "Refund not allowed"
        });
      }

      await db.query(
        `
        UPDATE orders
        SET status='refunded',
            payment_status='refunded'
        WHERE id=?
        `,
        [orderId]
      );

      emitSocket(
        req,
        "order-status-updated",
        {
          order_id: orderId,
          status: "refunded"
        }
      );

      res.json({
        success: true
      });

    } catch (err) {

      console.error(
        "Admin refund error:",
        err
      );

      res.status(500).json({
        success: false
      });
    }
  }
);


/* =========================
   REJECT REFUND (ADMIN)
========================= */
router.post(
  "/:id/refund/reject",
  adminAuth,
  async (req, res) => {

    try {

      const orderId = parseInt(
        req.params.id,
        10
      );

      if (!orderId || isNaN(orderId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order ID"
        });
      }

      const { reason } = req.body;

      if (
        !reason ||
        reason.trim().length < REASON_MIN_LENGTH
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Reject reason required (min 3 characters)"
        });
      }

      const sanitizedReason =
        reason
          .trim()
          .slice(0, REASON_MAX_LENGTH);

      const [[order]] =
        await db.query(
          "SELECT status FROM orders WHERE id=?",
          [orderId]
        );

      if (
        !order ||
        order.status !== "refund_requested"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "This order is not in refund_requested state"
        });
      }

      await db.query(
        `
        UPDATE orders
        SET status='refund_rejected',
            refund_reject_reason=?
        WHERE id=?
        `,
        [
          sanitizedReason,
          orderId
        ]
      );

      emitSocket(
        req,
        "order-status-updated",
        {
          order_id: orderId,
          status: "refund_rejected"
        }
      );

      res.json({
        success: true
      });

    } catch (err) {

      console.error(
        "Reject refund error:",
        err
      );

      res.status(500).json({
        success: false
      });
    }
  }
);


module.exports = router;