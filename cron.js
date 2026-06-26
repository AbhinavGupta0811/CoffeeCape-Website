const cron =
  require("node-cron");

cron.schedule(
  "*/5 * * * *",
  async () => {

    try {

      const [result] =
        await db.query(
          `
          DELETE
          FROM pending_orders
          WHERE expires_at < NOW()
          `
        );

      console.log(
        `Deleted ${result.affectedRows} expired pending orders`
      );

    } catch (err) {

      console.error(
        "Cleanup Error:",
        err
      );
    }
  }
);