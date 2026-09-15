import { pool } from "../db.js";
import { randomToken, tokenHash } from "../security.js";
import { isUuid } from "../validators.js";

export async function registerPlatformRecoveryRoutes(app, { requireMutation }) {
  async function requireSuperAdmin(request, reply) {
    if (!request.auth?.userId) {
      reply.code(401).send({ error: "UNAUTHORIZED" });
      return false;
    }
    const result = await pool.query(
      "SELECT role,active FROM platform_admins WHERE user_id=$1 LIMIT 1",
      [request.auth.userId]
    );
    if (!result.rows[0]?.active || result.rows[0].role !== "SUPER_ADMIN") {
      reply.code(403).send({ error: "SUPER_ADMIN_ONLY" });
      return false;
    }
    return true;
  }

  app.post("/api/platform/accounts/:userId/reset-code", async (request, reply) => {
    if (!(await requireMutation(request, reply))) return;
    if (!(await requireSuperAdmin(request, reply))) return;

    const userId = String(request.params.userId || "");
    if (!isUuid(userId) || userId === request.auth.userId) {
      return reply.code(400).send({ error: "INVALID_TARGET" });
    }

    const targetResult = await pool.query(`
      SELECT u.id,
        EXISTS(SELECT 1 FROM platform_admins pa WHERE pa.user_id=u.id AND pa.active) AS is_platform_admin,
        EXISTS(
          SELECT 1 FROM membership_roles mr
          JOIN school_memberships sm USING(school_id,user_id)
          WHERE mr.user_id=u.id AND mr.role='DIRECTOR' AND sm.status='ACTIVE'
        ) AS is_director
      FROM users u
      WHERE u.id=$1
      LIMIT 1
    `, [userId]);

    const target = targetResult.rows[0];
    if (!target) return reply.code(404).send({ error: "USER_NOT_FOUND" });
    if (target.is_platform_admin || !target.is_director) {
      return reply.code(403).send({ error: "DIRECTOR_RECOVERY_ONLY" });
    }

    const code = randomToken(32);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "UPDATE password_reset_requests SET used_at=COALESCE(used_at,now()) WHERE user_id=$1 AND used_at IS NULL",
        [userId]
      );
      await client.query(
        "INSERT INTO password_reset_requests(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '20 minutes')",
        [userId, tokenHash(code)]
      );
      await client.query("COMMIT");
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      throw error;
    } finally {
      client.release();
    }

    return { ok: true, code, expiresInMinutes: 20, warning: "SHOW_ONCE" };
  });
}
