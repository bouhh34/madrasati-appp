import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function migrate() {
  const migrationPath = path.join(
    __dirname,
    "../migrations/001_secure_core.sql"
  );

  if (!fs.existsSync(migrationPath)) {
    throw new Error(
      `Migration file not found: ${migrationPath}`
    );
  }

  const sql = fs.readFileSync(
    migrationPath,
    "utf8"
  );

  if (!sql.trim()) {
    throw new Error(
      "Migration file is empty"
    );
  }

  const client = await pool.connect();

  try {
    console.log(
      "Starting Ma Madrassa database migration..."
    );

    await client.query("BEGIN");

    await client.query(sql);

    await client.query("COMMIT");

    console.log(
      "Database migration completed successfully."
    );
  } catch (error) {
    await client.query("ROLLBACK");

    console.error(
      "Database migration failed:",
      error
    );

    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
