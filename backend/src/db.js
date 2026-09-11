import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

export async function withTenant(
  { schoolId, userId, school_id, user_id },
  fn
) {
  const client = await pool.connect();

  const resolvedSchoolId =
    schoolId || school_id;

  const resolvedUserId =
    userId || user_id;

  if (!resolvedSchoolId || !resolvedUserId) {
    client.release();
    throw new Error(
      "Tenant context requires school and user"
    );
  }

  try {
    await client.query("BEGIN");

    await client.query(
      "SELECT set_config('app.school_id', $1, true)",
      [resolvedSchoolId]
    );

    await client.query(
      "SELECT set_config('app.user_id', $1, true)",
      [resolvedUserId]
    );

    const result = await fn(client);

    await client.query("COMMIT");

    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}
