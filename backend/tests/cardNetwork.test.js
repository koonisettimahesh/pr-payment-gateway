import { detectCardNetwork } from "../src/utils/cardNetwork.js";

describe("Card Network Detection", () => {
  test("detects Visa", () => {
    expect(detectCardNetwork("4242 4242 4242 4242")).toBe("visa");
  });

  test("detects Mastercard", () => {
    expect(detectCardNetwork("5555-5555-5555-4444")).toBe("mastercard");
  });

  test("detects American Express", () => {
    expect(detectCardNetwork("378282246310005")).toBe("amex");
    expect(detectCardNetwork("371449635398431")).toBe("amex");
  });

  test("detects RuPay with 60", () => {
    expect(detectCardNetwork("6011000000000004")).toBe("rupay");
  });

  test("detects RuPay with 65", () => {
    expect(detectCardNetwork("6500000000000000")).toBe("rupay");
  });

  test("detects RuPay with 81-89", () => {
    expect(detectCardNetwork("8200000000000000")).toBe("rupay");
  });

  test("returns unknown for unsupported network", () => {
    expect(detectCardNetwork("3000000000000000")).toBe("unknown");
  });

  test("handles spaces and hyphens", () => {
    expect(detectCardNetwork("4242-4242-4242-4242")).toBe("visa");
  });
});
