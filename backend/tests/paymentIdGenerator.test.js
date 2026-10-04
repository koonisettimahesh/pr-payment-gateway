import { generatePaymentId } from "../src/utils/paymentIdGenerator.js";

describe("Payment ID Generator", () => {
  test("generates an ID with pay_ prefix", () => {
    const id = generatePaymentId();

    expect(id.startsWith("pay_")).toBe(true);
  });

  test("generates exactly 16 characters after the prefix", () => {
    const id = generatePaymentId();

    expect(id).toHaveLength(20);
  });

  test("generates only alphanumeric characters after the prefix", () => {
    const id = generatePaymentId();

    expect(id).toMatch(/^pay_[A-Za-z0-9]{16}$/);
  });

  test("generates different IDs on repeated calls", () => {
    const id1 = generatePaymentId();
    const id2 = generatePaymentId();

    expect(id1).not.toBe(id2);
  });
});
