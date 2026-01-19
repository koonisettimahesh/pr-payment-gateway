import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on("connect", () => {
  console.log("Connected to PostgreSQL");
});

export async function checkDatabase() {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch (err) {
    console.error("DB check failed:", err.message);
    return false;
  }
}

