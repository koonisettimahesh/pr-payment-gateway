import crypto from "crypto";

function generateToken(prefix) {
  return `${prefix}_${crypto.randomBytes(24).toString("hex")}`;
}

export function generateApiKey() {
  return generateToken("key_test");
}

export function generateApiSecret() {
  return generateToken("secret_test");
}

export function generateWebhookSecret() {
  return generateToken("whsec_test");
}
