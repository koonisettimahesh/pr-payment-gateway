import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

router.get("/checkout", (req, res) => {
  const orderId = req.query.order_id;

  if (!orderId) {
    return res.status(400).send("Missing order_id");
  }

  res.sendFile(
    path.join(__dirname, "../../public/checkout.html")
  );
});

export default router;
