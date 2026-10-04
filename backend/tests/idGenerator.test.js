import { generateOrderId } from "../src/utils/idGenerator.js";

describe("Order ID Generator", () => {
  test("generates an ID with order_ prefix", () => {
    const id = generateOrderId();

    expect(id.startsWith("order_")).toBe(true);
  });

  test("generates exactly 16 characters after the prefix", () => {
    const id = generateOrderId();

    expect(id).toHaveLength(22);
  });

  test("generates only alphanumeric characters after the prefix", () => {
    const id = generateOrderId();

    expect(id).toMatch(/^order_[A-Za-z0-9]{16}$/);
  });

  test("generates different IDs on repeated calls", () => {
    const id1 = generateOrderId();
    const id2 = generateOrderId();

    expect(id1).not.toBe(id2);
  });
});
