import { isValidCardNumber } from "../src/utils/luhn.js";

describe("Card Number Luhn Validator", () => {
  test("accepts a valid Visa card number", () => {
    expect(isValidCardNumber("4242 4242 4242 4242")).toBe(true);
  });

  test("accepts a valid card number with hyphens", () => {
    expect(isValidCardNumber("4242-4242-4242-4242")).toBe(true);
  });

  test("rejects an invalid Luhn number", () => {
    expect(isValidCardNumber("4242 4242 4242 4241")).toBe(false);
  });

  test("rejects card numbers shorter than 13 digits", () => {
    expect(isValidCardNumber("123456789012")).toBe(false);
  });

  test("rejects card numbers longer than 19 digits", () => {
    expect(isValidCardNumber("12345678901234567890")).toBe(false);
  });

  test("rejects non-numeric card numbers", () => {
    expect(isValidCardNumber("4242abcd42424242")).toBe(false);
  });

  test("rejects empty input", () => {
    expect(isValidCardNumber("")).toBe(false);
  });

  test("rejects null input", () => {
    expect(isValidCardNumber(null)).toBe(false);
  });
});
