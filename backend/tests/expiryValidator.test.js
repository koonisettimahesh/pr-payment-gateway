import { isValidExpiry } from "../src/utils/expiryValidator.js";

describe("Card Expiry Validator", () => {
  test("accepts a future expiry date", () => {
    expect(isValidExpiry("12", "2030")).toBe(true);
  });

  test("accepts a valid two-digit year", () => {
    expect(isValidExpiry("12", "30")).toBe(true);
  });

  test("accepts the current month and year", () => {
    const now = new Date();

    const month = String(now.getMonth() + 1);
    const year = String(now.getFullYear());

    expect(isValidExpiry(month, year)).toBe(true);
  });

  test("rejects an expired month from the current year", () => {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;

    if (currentMonth > 1) {
      expect(
        isValidExpiry(String(currentMonth - 1), String(now.getFullYear()))
      ).toBe(false);
    }
  });

  test("rejects an expired year", () => {
    expect(isValidExpiry("12", "2020")).toBe(false);
  });

  test("rejects month 0", () => {
    expect(isValidExpiry("0", "2030")).toBe(false);
  });

  test("rejects month greater than 12", () => {
    expect(isValidExpiry("13", "2030")).toBe(false);
  });
});
