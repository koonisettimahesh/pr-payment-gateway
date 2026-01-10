import { pool } from "../config/db.js";

export async function seedTestMerchant() {
  const email = process.env.TEST_MERCHANT_EMAIL;
  const apiKey = process.env.TEST_API_KEY;
  const apiSecret = process.env.TEST_API_SECRET;

  if (!email || !apiKey || !apiSecret) {
    throw new Error("Test merchant env variables are missing");
  }

  const { rows } = await pool.query(
    "SELECT id FROM merchants WHERE email = $1",
    [email]
  );

  if (rows.length > 0) {
    console.log("Test merchant already exists");
    return;
  }

  await pool.query(
    `
    INSERT INTO merchants (
      id, name, email, api_key, api_secret
    ) VALUES ($1, $2, $3, $4, $5)
    `,
    [
      "550e8400-e29b-41d4-a716-446655440000",
      "Test Merchant",
      email,
      apiKey,
      apiSecret
    ]
  );

  console.log("Test merchant seeded");
}
