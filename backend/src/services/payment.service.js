import { apiError } from "../utils/errors.js";
import { isValidVPA } from "../utils/vpaValidator.js";
import { isValidCardNumber } from "../utils/luhn.js";
import { detectCardNetwork } from "../utils/cardNetwork.js";
import { isValidExpiry } from "../utils/expiryValidator.js";
import { generatePaymentId } from "../utils/paymentIdGenerator.js";
import {
  createPayment,
  updatePaymentStatus
} from "../repositories/payment.repo.js";
import { findOrderById } from "../repositories/order.repo.js";

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function createPaymentService(body, merchant) {
  const { order_id, method } = body;

  /* 🔹 Validate order */
  const order = await findOrderById(order_id);
  if (!order || order.merchant_id !== merchant.id) {
    throw apiError(404, "NOT_FOUND_ERROR", "Order not found");
  }

  let paymentData = {
    id: generatePaymentId(),
    order_id: order.id,
    merchant_id: merchant.id,
    amount: order.amount,
    currency: order.currency,
    method
  };

  /* 🔹 UPI PAYMENT */
  if (method === "upi") {
    if (!isValidVPA(body.vpa)) {
      throw apiError(400, "INVALID_VPA", "VPA format invalid");
    }
    paymentData.vpa = body.vpa;
  }

  /* 🔹 CARD PAYMENT */
  else if (method === "card") {
    const { number, expiry_month, expiry_year } = body.card || {};

    if (!number || !expiry_month || !expiry_year) {
      throw apiError(400, "INVALID_CARD", "Card validation failed");
    }

    /* ✅ CRITICAL FIX: SANITIZE CARD NUMBER */
    const cleanedNumber = number.replace(/\D/g, "");

    if (!isValidCardNumber(cleanedNumber)) {
      throw apiError(400, "INVALID_CARD", "Card validation failed");
    }

    if (!isValidExpiry(expiry_month, expiry_year)) {
      throw apiError(400, "EXPIRED_CARD", "Card expiry date invalid");
    }

    paymentData.card_network = detectCardNetwork(cleanedNumber);
    paymentData.card_last4 = cleanedNumber.slice(-4);
  }

  /* 🔹 INVALID METHOD */
  else {
    throw apiError(400, "BAD_REQUEST_ERROR", "Invalid payment method");
  }

  /* 🔹 Create payment with status = processing */
  const payment = await createPayment(paymentData);

  /* 🔹 Processing simulation */
  const testMode = process.env.TEST_MODE === "true";
  const delay = testMode
    ? parseInt(process.env.TEST_PROCESSING_DELAY || "1000", 10)
    : Math.floor(Math.random() * 5000) + 5000;

  await sleep(delay);

  const success =
    testMode
      ? process.env.TEST_PAYMENT_SUCCESS !== "false"
      : Math.random() < (method === "upi" ? 0.9 : 0.95);

  if (success) {
    await updatePaymentStatus(payment.id, "success", null, null);
  } else {
    await updatePaymentStatus(
      payment.id,
      "failed",
      "PAYMENT_FAILED",
      "Payment processing failed"
    );
  }

  return payment;
}
