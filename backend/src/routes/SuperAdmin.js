import { pool } from "../db.js";
import { config } from "../config.js";
import { safeEqualText } from "../security.js";

export async function registerSuperAdminRoutes(app, { requireMutation }) {

  // تفعيل أول SUPER ADMIN فقط - مرة واحدة
  app.post("/api/platform/bootstrap-super-admin", {
    config: { rateLimit: { max: 3, timeWindow: "15 minutes" } }
  }, async (request, reply) => {

    if (!(await requireMutation(request, reply))) return;

    const secret = String(
      request.headers["x-bootstrap-secret"] || ""
    );

    if (
      !config.bootstrapSecret ||
      !secret ||
      !safeEqualText(secret, config.bootstrapSecret)
    ) {
      return reply.code(403).send({ error: "BOOTSTRAP_DENIED" });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const state = await client.query(`
        SELECT consumed
        FROM platform_bootstrap_state
        WHERE singleton = true
        FOR UPDATE
      `);

      if (!state.rows[0] || state.rows[0].consumed) {
        await client.query("ROLLBACK");
        return reply.code(409).send({
          error: "SUPER_ADMIN_ALREADY_INITIALIZED"
        });
      }

      await client.query(`
        INSERT INTO platform_admins (user_id, role, active)
        VALUES ($1, 'SUPER_ADMIN', true)
        ON CONFLICT (user_id)
        DO UPDATE SET
          role = 'SUPER_ADMIN',
          active = true,
          updated_at = now()
      `, [request.auth.userId]);

      await client.query(`
        UPDATE users
        SET account_state = 'ACTIVE',
            updated_at = now()
        WHERE id = $1
      `, [request.auth.userId]);

      await client.query(`
        UPDATE platform_bootstrap_state
        SET consumed = true,
            consumed_by = $1,
            consumed_at = now()
        WHERE singleton = true
      `, [request.auth.userId]);

      await client.query("COMMIT");

      return {
        ok: true,
        role: "SUPER_ADMIN"
      };

    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      throw error;
    } finally {
      client.release();
    }
  });
}
