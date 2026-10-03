import { pool } from "../config/db.js";

export async function findProviderByEmail(email) {
  const { rows } = await pool.query(
    `
    SELECT *
    FROM provider_users
    WHERE email = $1
    `,
    [email]
  );

  return rows[0];
}

export async function findProviderById(id) {
  const { rows } = await pool.query(
    `
    SELECT
      id,
      name,
      email,
      created_at,
      updated_at
    FROM provider_users
    WHERE id = $1
    `,
    [id]
  );

  return rows[0];
}

export async function createProvider(provider) {
  const { rows } = await pool.query(
    `
    INSERT INTO provider_users (id, name, email, password_hash)
    VALUES ($1, $2, $3, $4)
    RETURNING id, name, email, created_at
    `,
    [provider.id, provider.name, provider.email, provider.password_hash]
  );

  return rows[0];
}
