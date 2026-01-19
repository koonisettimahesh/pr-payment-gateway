import express from "express";
import { checkDatabase } from "./config/db.js";
import orderRoutes from "./routes/orders.route.js";
import { errorHandler } from "./middleware/errorHandler.js";
import paymentRoutes from "./routes/payment.routes.js";
import testRoutes from "./routes/test.routes.js";
import publicPaymentRoutes from "./routes/payments.public.routes.js";
import cors from "cors";
import refundRoutes from "./routes/refunds.routes.js";
import webhookRoutes from "./routes/webhooks.routes.js";


export const app = express();
app.use(
  cors({
    origin: "*"
  })
);
app.use(express.json());

app.get("/health", async (req, res) => {
  const dbOk = await checkDatabase();
  res.status(200).json({
    status: "healthy",
    database: dbOk ? "connected" : "disconnected",
    timestamp: new Date().toISOString()
  });
});

app.use("/api/v1/orders", orderRoutes);
app.use("/api/v1/payments", paymentRoutes);
app.use("/api/v1/payments", refundRoutes)
app.use("/api/v1/test", testRoutes);
app.use("/api/v1/payments/public", publicPaymentRoutes);
app.use("/api/v1/refunds", refundRoutes);
app.use("/api/v1/webhooks", webhookRoutes);
app.use(errorHandler);
