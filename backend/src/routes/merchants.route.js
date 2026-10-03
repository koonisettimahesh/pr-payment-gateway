import express from "express";
import {
  registerMerchant,
  listMerchants,
  getMerchant,
  changeMerchantStatus,
} from "../services/merchant.service.js";
import { authenticateProvider } from "../middleware/providerAuthMiddleware.js";

const router = express.Router();

router.get("/", authenticateProvider, async (req, res, next) => {
  try {
    const merchants = await listMerchants(req.provider.id);

    res.status(200).json({
      merchants,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:merchant_id", authenticateProvider, async (req, res, next) => {
  try {
    const merchant = await getMerchant(
      req.params.merchant_id,
      req.provider.id
    );

    res.status(200).json(merchant);
  } catch (err) {
    next(err);
  }
});

router.patch(
  "/:merchant_id/status",
  authenticateProvider,
  async (req, res, next) => {
    try {
      const merchant = await changeMerchantStatus(
        req.params.merchant_id,
        req.provider.id,
        req.body.is_active
      );

      res.status(200).json(merchant);
    } catch (err) {
      next(err);
    }
  }
);

router.post("/", authenticateProvider, async (req, res, next) => {
  try {
    const merchant = await registerMerchant(
      req.body,
      req.provider.id
    );

    res.status(201).json({
      id: merchant.id,
      name: merchant.name,
      email: merchant.email,

      credentials: {
        api_key: merchant.api_key,
        api_secret: merchant.api_secret,
        webhook_secret: merchant.webhook_secret,
      },

      is_active: merchant.is_active,
      created_at: merchant.created_at,
    });
  } catch (err) {
    next(err);
  }
});

export default router;