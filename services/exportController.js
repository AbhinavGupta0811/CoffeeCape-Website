const { Parser } = require("json2csv");
const db = require("../db"); 

const exportOrdersCSV = async (req, res) => {
  try {
    const [orders] = await db.query(`
      SELECT *
      FROM orders
      ORDER BY created_at DESC
    `);

    let exportData = [];
    let grandTotal = 0;

    for (const order of orders) {
      const [items] = await db.query(
        `
        SELECT name, qty, price
        FROM order_items
        WHERE order_id = ?
      `,
        [order.id]
      );

      const itemList = items
        .map(
          (item) =>
            `${item.name} x${item.qty} (₹${Number(item.price).toFixed(2)})`
        )
        .join(" | ");

      grandTotal += Number(order.total);

      exportData.push({
        OrderID: order.order_id,
        Customer: order.name,
        Phone: order.phone,
        Address: order.address,
        Items: itemList,
        Subtotal: order.subtotal,
        GST: order.gst,
        DeliveryFee: order.delivery_fee,
        PlatformFee: order.platform_fee,
        PackingFee: order.packing_fee,
        Tip: order.tip,
        Discount: order.discount,
        Total: order.total,
        Status: order.status,
        PaymentStatus: order.payment_status,
        PaymentMethod: order.payment_method,
        CancelledBy: order.cancelled_by,
        RefundReason: order.refund_reason,
        CreatedAt: order.created_at
      });
    }

    exportData.push({});

    exportData.push({
      OrderID: "TOTAL REVENUE",
      Total: grandTotal.toFixed(2)
    });

    const fields = [
      "OrderID",
      "Customer",
      "Phone",
      "Address",
      "Items",
      "Subtotal",
      "GST",
      "DeliveryFee",
      "PlatformFee",
      "PackingFee",
      "Tip",
      "Discount",
      "Total",
      "Status",
      "PaymentStatus",
      "PaymentMethod",
      "CancelledBy",
      "RefundReason",
      "CreatedAt"
    ];

    const parser = new Parser({ fields });

    const csv = parser.parse(exportData);

    res.header("Content-Type", "text/csv");
    res.attachment("orders.csv");

    return res.send(csv);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "CSV export failed"
    });
  }
};

// Export Bookings CSV
const exportBookingsCSV = async (req, res) => {
  try {
    const [bookings] = await db.query(`
      SELECT *
      FROM bookings
      ORDER BY created_at DESC
    `);

    let exportData = [];
    let totalRevenue = 0;
    let totalBookings = bookings.length;

    bookings.forEach((booking) => {
      totalRevenue += Number(booking.total);

      exportData.push({
        BookingID: booking.booking_id,
        Customer: booking.full_name,
        Email: booking.email,
        Phone: booking.phone,
        EventType: booking.event_type,
        EventCategory: booking.event_category,
        EventDate: booking.event_date,
        EventTime: booking.event_time,
        GuestCount: booking.guest_count,
        Total: booking.total,
        PaidAmount: booking.paid_amount,
        PaymentStatus: booking.payment_status,
        PaymentMethod: booking.payment_method,
        BookingStatus: booking.status,
        AssignedAddress: booking.assigned_address,
        CancelledBy: booking.cancelled_by,
        CreatedAt: booking.created_at
      });
    });

    // Empty Row
    exportData.push({});

    // Summary
    exportData.push({
      BookingID: "TOTAL BOOKINGS",
      Customer: totalBookings
    });

    exportData.push({
      BookingID: "TOTAL REVENUE",
      Total: totalRevenue.toFixed(2)
    });

    const fields = [
      "BookingID",
      "Customer",
      "Email",
      "Phone",
      "EventType",
      "EventCategory",
      "EventDate",
      "EventTime",
      "GuestCount",
      "Total",
      "PaidAmount",
      "PaymentStatus",
      "PaymentMethod",
      "BookingStatus",
      "AssignedAddress",
      "CancelledBy",
      "CreatedAt"
    ];

    const parser = new Parser({
      fields
    });

    const csv = parser.parse(exportData);

    res.header("Content-Type", "text/csv");
    res.attachment("bookings.csv");

    return res.send(csv);

  } catch (error) {

    console.log(error);

    return res.status(500).json({
      success: false,
      message: "Booking export failed"
    });

  }
};

module.exports = {
  exportOrdersCSV,
  exportBookingsCSV
};