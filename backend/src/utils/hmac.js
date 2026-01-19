import crypto from "crypto";

export function generateHmac(secret, payload) {
  return crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(payload))
    .digest("hex");
}

