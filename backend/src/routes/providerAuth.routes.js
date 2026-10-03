import express from "express";
import { authenticateProvider } from "../middleware/providerAuthMiddleware.js";
import {
  registerProvider,
  loginProvider,
} from "../services/providerAuth.service.js";

const router = express.Router();

router.post("/register", async (req, res, next) => {
  try {
    const provider = await registerProvider(req.body);

    res.status(201).json({
      id: provider.id,
      name: provider.name,
      email: provider.email,
      created_at: provider.created_at,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const result = await loginProvider(req.body);

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/me", authenticateProvider, async (req, res) => {
  res.status(200).json({
    provider: req.provider
  });
});

export default router;