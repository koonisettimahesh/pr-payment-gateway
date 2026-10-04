import { apiError } from "../utils/errors.js";
import {
  generateApiKey,
  generateApiSecret,
  generateWebhookSecret,
} from "../utils/credentialGenerator.js";
import {
  createMerchant,
  findMerchantByEmail,
  findAllMerchants,
  findMerchantById,
  updateMerchantStatus,
} from "../repositories/merchant.repo.js";
import crypto from "crypto";

export async function registerMerchant(body, providerId) {
  const { name, email, webhook_url } = body;

  if (!name || !name.trim()) {
    throw apiError(
      400,
      "BAD_REQUEST_ERROR",
      "Merchant name is required"
    );
  }

  if (!email || !email.trim()) {
    throw apiError(
      400,
      "BAD_REQUEST_ERROR",
      "Merchant email is required"
    );
  }

  const normalizedEmail = email.trim().toLowerCase();

  const existingMerchant = await findMerchantByEmail(normalizedEmail);

  if (existingMerchant) {
    throw apiError(
      409,
      "CONFLICT_ERROR",
      "Merchant with this email already exists"
    );
  }

  const merchant = {
    id: crypto.randomUUID(),
    provider_id: providerId,
    name: name.trim(),
    email: normalizedEmail,
    webhook_url,
    api_key: generateApiKey(),
    api_secret: generateApiSecret(),
    webhook_secret: generateWebhookSecret(),
  };

  return createMerchant(merchant);
}

export async function listMerchants(providerId) {
  return findAllMerchants(providerId);
}

export async function getMerchant(merchantId, providerId) {
  const merchant = await findMerchantById(
    merchantId,
    providerId
  );

  if (!merchant) {
    throw apiError(
      404,
      "NOT_FOUND_ERROR",
      "Merchant not found"
    );
  }

  return merchant;
}

export async function changeMerchantStatus(
  merchantId,
  providerId,
  isActive
) {
  if (typeof isActive !== "boolean") {
    throw apiError(
      400,
      "BAD_REQUEST_ERROR",
      "is_active must be a boolean"
    );
  }

  const merchant = await findMerchantById(
    merchantId,
    providerId
  );

  if (!merchant) {
    throw apiError(
      404,
      "NOT_FOUND_ERROR",
      "Merchant not found"
    );
  }

  return updateMerchantStatus(
    merchantId,
    providerId,
    isActive
  );
}