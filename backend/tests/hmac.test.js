import { generateHmac } from "../src/utils/hmac.js";

describe("HMAC Generator", () => {
  const secret = "whsec_test_secret123";

  const payload = {
    event: "payment.success",
    timestamp: 1705315870,
    data: {
      payment: {
        id: "pay_test123",
        amount: 5000,
        status: "success",
      },
    },
  };

  test("generates a 64-character hexadecimal signature", () => {
    const signature = generateHmac(secret, payload);

    expect(signature).toMatch(/^[a-f0-9]{64}$/);
  });

  test("generates the same signature for the same secret and payload", () => {
    const signature1 = generateHmac(secret, payload);
    const signature2 = generateHmac(secret, payload);

    expect(signature1).toBe(signature2);
  });

  test("generates different signatures for different secrets", () => {
    const signature1 = generateHmac(secret, payload);
    const signature2 = generateHmac("different_secret", payload);

    expect(signature1).not.toBe(signature2);
  });

  test("generates different signatures for different payloads", () => {
    const signature1 = generateHmac(secret, payload);

    const modifiedPayload = {
      ...payload,
      event: "payment.failed",
    };

    const signature2 = generateHmac(secret, modifiedPayload);

    expect(signature1).not.toBe(signature2);
  });
});
