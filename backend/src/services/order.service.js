import { apiError } from "../utils/errors.js";
import { generateOrderId } from "../utils/idGenerator.js";
import { createOrder, findOrderById } from "../repositories/order.repo.js";

export async function createOrderService(body, merchant) {
  const { amount, currency = "INR", receipt, notes } = body;

  if (!Number.isInteger(amount) || amount < 100) {
    throw apiError(
      400,
      "BAD_REQUEST_ERROR",
      "amount must be at least 100"
    );
  }

  if (currency !== "INR") {
    throw apiError(
      400,
      "BAD_REQUEST_ERROR",
      "currency must be INR"
    );
  }

  let orderId;
  do {
    orderId = generateOrderId();
  } while (await findOrderById(orderId));

  return createOrder({
    id: orderId,
    merchant_id: merchant.id,
    amount,
    currency,
    receipt,
    notes
  });
}
