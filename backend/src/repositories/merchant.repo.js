import { pool } from "../config/db.js";

export async function findMerchantByEmail(email) {
  const { rows } = await pool.query(
    `
    SELECT id, name, email
    FROM merchants
    WHERE email = $1
    `,
    [email]
  );

  return rows[0];
}

export async function createMerchant(merchant) {
  const columns = [
    "id",
    "provider_id",
    "name",
    "email",
    "api_key",
    "api_secret",
    "webhook_secret",
  ];
  const values = [
    merchant.id,
    merchant.provider_id,
    merchant.name,
    merchant.email,
    merchant.api_key,
    merchant.api_secret,
    merchant.webhook_secret,
  ];

  if (merchant.webhook_url !== undefined && merchant.webhook_url !== null) {
    columns.push("webhook_url");
    values.push(merchant.webhook_url);
  }

  const { rows } = await pool.query(
    `
    INSERT INTO merchants (${columns.join(", ")})
    VALUES (${values.map((_, index) => `$${index + 1}`).join(", ")})
    RETURNING
      id,
      provider_id,
      name,
      email,
      api_key,
      api_secret,
      webhook_secret,
      is_active,
      created_at
    `,
    values
  );

  return rows[0];
}

export async function findAllMerchants(providerId) {
  const { rows } = await pool.query(
    `
    SELECT
      id,
      name,
      email,
      api_key,
      is_active,
      created_at,
      updated_at
    FROM merchants
    WHERE provider_id = $1
    ORDER BY created_at DESC
    `,
    [providerId]
  );

  return rows;
}

export async function findMerchantById(merchantId, providerId) {
  const { rows } = await pool.query(
    `
    SELECT
      id,
      name,
      email,
      api_key,
      is_active,
      created_at,
      updated_at
    FROM merchants
    WHERE id = $1
      AND provider_id = $2
    `,
    [merchantId, providerId]
  );

  return rows[0];
}

export async function updateMerchantStatus(
  merchantId,
  providerId,
  isActive
) {
  const { rows } = await pool.query(
    `
    UPDATE merchants
    SET
      is_active = $1,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
      AND provider_id = $3
    RETURNING
      id,
      name,
      email,
      api_key,
      is_active,
      created_at,
      updated_at
    `,
    [isActive, merchantId, providerId]
  );

  return rows[0];
}