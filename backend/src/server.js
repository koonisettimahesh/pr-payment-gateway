import { app } from "./app.js";
import { pool } from "./config/db.js";
import { seedTestMerchant } from "./db/seed.js";
import fs from "fs";

async function bootstrap() {
  console.log("Connecting to database...");
  await pool.query(fs.readFileSync("./src/db/schema.sql").toString());
  await seedTestMerchant();

  const PORT = process.env.PORT || 8000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API running on port ${PORT}`);
});
}

bootstrap().catch(err => {
  console.error("Startup failed", err);
  process.exit(1);
});
