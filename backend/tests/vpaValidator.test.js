import { isValidVPA } from "../src/utils/vpaValidator.js";

describe("VPA Validator", () => {
  test("accepts a valid VPA", () => {
    expect(isValidVPA("user@paytm")).toBe(true);
  });

  test("accepts VPA with dot, underscore and hyphen", () => {
    expect(isValidVPA("john.doe@okhdfcbank")).toBe(true);
    expect(isValidVPA("user_123@phonepe")).toBe(true);
    expect(isValidVPA("user-name@bank")).toBe(true);
  });

  test("rejects VPA with spaces", () => {
    expect(isValidVPA("user name@paytm")).toBe(false);
    expect(isValidVPA("user@pay tm")).toBe(false);
  });
});
