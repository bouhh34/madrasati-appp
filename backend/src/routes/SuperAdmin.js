import { pool } from "../db.js";
import { config } from "../config.js";
import {
  safeEqualText,
  hashPassword,
  normalizeLogin,
  normalizeEmail,
  validPassword
} from "../security.js";
import { isUuid } from "../validators.js";
export async function registerSuperAdminRoutes(app, { requireMutation }) {

  async function requireSuperAdmin(request, reply) {
    if (!request.auth?.userId) {
      reply.code(401).send({ error: "UNAUTHORIZED" });
      return false;
    }

    const result = await pool.query(`
      SELECT role, active
      FROM platform_admins
      WHERE user_id = $1
      LIMIT 1
    `, [request.auth.userId]);

    if (
      !result.rows[0] ||
      !result.rows[0].active ||
      result.rows[0].role !== "SUPER_ADMIN"
    ) {
      reply.code(403).send({ error: "SUPER_ADMIN_ONLY" });
      return false;
    }

    return true;
  }

  // تفعيل أول SUPER ADMIN فقط - مرة واحدة
  app.post("/api/platform/bootstrap-super-admin", {
    config: {
      rateLimit: {
        max: 3,
        timeWindow: "15 minutes"
      }
    }
  }, async (request, reply) => {

    if (!(await requireMutation(request, reply))) return;

    if (
      !config.superAdminBootstrapLogin ||
      request.auth.login !== config.superAdminBootstrapLogin
    ) {
      return reply.code(403).send({
        error: "SUPER_ADMIN_ACCOUNT_DENIED"
      });
    }

    const secret = String(
      request.headers["x-bootstrap-secret"] || ""
    );

    if (
      !config.bootstrapSecret ||
      !secret ||
      !safeEqualText(secret, config.bootstrapSecret)
    ) {
      return reply.code(403).send({
        error: "BOOTSTRAP_DENIED"
      });
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
        INSERT INTO platform_admins (
          user_id,
          role,
          active
        )
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
      try {
        await client.query("ROLLBACK");
      } catch {}

      throw error;

    } finally {
      client.release();
    }
  });


  // هل المستخدم الحالي SUPER ADMIN؟
  app.get("/api/platform/me", async (request, reply) => {

    if (!request.auth?.userId) {
      return reply.code(401).send({
        error: "UNAUTHORIZED"
      });
    }

    const result = await pool.query(`
      SELECT role, active
      FROM platform_admins
      WHERE user_id = $1
      LIMIT 1
    `, [request.auth.userId]);

    const row = result.rows[0];

    if (!row || !row.active) {
      return {
        ok: true,
        isSuperAdmin: false
      };
    }

    return {
      ok: true,
      isSuperAdmin: row.role === "SUPER_ADMIN",
      role: row.role
    };
  });


  // ملخص المنصة
  app.get("/api/platform/overview", async (request, reply) => {

    if (!(await requireSuperAdmin(request, reply))) return;

    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM schools) AS schools,
        (SELECT COUNT(*)::int FROM schools WHERE active = true) AS active_schools,
        (SELECT COUNT(*)::int FROM users) AS users,
        (SELECT COUNT(*)::int FROM students) AS students,
        (SELECT COUNT(*)::int FROM classes) AS classes
    `);

    return {
      ok: true,
      overview: result.rows[0]
    };
  });


  // جميع المدارس
  app.get("/api/platform/schools", async (request, reply) => {

    if (!(await requireSuperAdmin(request, reply))) return;

    const result = await pool.query(`
      SELECT
        s.id,
        s.name,
        s.school_type,
        s.wilaya,
        s.moughataa,
        s.inspection,
        s.academic_year,
        s.locale,
        s.active,
        s.created_at,

        (
          SELECT COUNT(*)::int
          FROM students st
          WHERE st.school_id = s.id
        ) AS students_count,

        (
          SELECT COUNT(*)::int
          FROM classes c
          WHERE c.school_id = s.id
        ) AS classes_count,

        (
          SELECT COUNT(*)::int
          FROM school_memberships sm
          WHERE sm.school_id = s.id
          AND sm.status = 'ACTIVE'
        ) AS users_count

      FROM schools s
      ORDER BY s.created_at DESC
    `);

    return {
      ok: true,
      schools: result.rows
    };
  });


  // إنشاء مدرسة جديدة
  app.post("/api/platform/schools", async (request, reply) => {

    if (!(await requireMutation(request, reply))) return;
    if (!(await requireSuperAdmin(request, reply))) return;

    const body = request.body || {};

    const name = String(body.name || "").trim();
    const schoolType = String(body.schoolType || "").trim();
    const wilaya = String(body.wilaya || "").trim() || null;
    const moughataa = String(body.moughataa || "").trim() || null;
    const inspection = String(body.inspection || "").trim() || null;
    const academicYear = String(body.academicYear || "").trim();
    const locale =
      body.locale === "fr"
        ? "fr"
        : "ar";

    if (!name) {
      return reply.code(400).send({
        error: "SCHOOL_NAME_REQUIRED"
      });
    }

    if (!["PUBLIC", "PRIVATE"].includes(schoolType)) {
      return reply.code(400).send({
        error: "INVALID_SCHOOL_TYPE"
      });
    }

    if (!academicYear) {
      return reply.code(400).send({
        error: "ACADEMIC_YEAR_REQUIRED"
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");
await client.query(
  "SELECT set_config('app.user_id',$1,true)",
  [request.auth.userId]
);
      const schoolResult = await client.query(`
        INSERT INTO schools (
          name,
          school_type,
          wilaya,
          moughataa,
          inspection,
          academic_year,
          locale,
          active
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,true
        )
        RETURNING *
      `, [
        name,
        schoolType,
        wilaya,
        moughataa,
        inspection,
        academicYear,
        locale
      ]);

      const school = schoolResult.rows[0];

      await client.query(`
        INSERT INTO school_settings (
          school_id
        )
        VALUES ($1)
        ON CONFLICT (school_id)
        DO NOTHING
      `, [school.id]);

      await client.query(`
        INSERT INTO school_subscriptions (
          school_id,
          plan,
          status
        )
        VALUES (
          $1,
          'TRIAL',
          'ACTIVE'
        )
        ON CONFLICT (school_id)
        DO NOTHING
      `, [school.id]);

      await client.query("COMMIT");

      return reply.code(201).send({
        ok: true,
        school
      });

    } catch (error) {

      try {
        await client.query("ROLLBACK");
      } catch {}

      throw error;

    } finally {
      client.release();
    }
  });


  // تشغيل أو إيقاف مدرسة
  app.patch(
    "/api/platform/schools/:schoolId/status",
    async (request, reply) => {

      if (!(await requireMutation(request, reply))) return;
      if (!(await requireSuperAdmin(request, reply))) return;

      const schoolId = String(
        request.params.schoolId || ""
      );

      const active =
        request.body?.active === true;

      const result = await pool.query(`
        UPDATE schools
        SET active = $2,
            updated_at = now()
        WHERE id = $1
        RETURNING
          id,
          name,
          active
      `, [
        schoolId,
        active
      ]);

      if (!result.rows[0]) {
        return reply.code(404).send({
          error: "SCHOOL_NOT_FOUND"
        });
      }

      return {
        ok: true,
        school: result.rows[0]
      };
    }
  );
  // إنشاء مدير وربطه بمدرسة
  app.post(
    "/api/platform/schools/:schoolId/director",
    async (request, reply) => {

      if (!(await requireMutation(request, reply))) return;
      if (!(await requireSuperAdmin(request, reply))) return;

      const schoolId = String(request.params.schoolId || "");

      if (!isUuid(schoolId)) {
        return reply.code(400).send({
          error: "INVALID_SCHOOL_ID"
        });
      }

      const body = request.body || {};

      const login = normalizeLogin(body.login);
      const email = normalizeEmail(body.email);
      const fullName = String(body.fullName || "").trim();
      const password = String(body.password || "");

      if (
        !login ||
        login.length < 3 ||
        !fullName ||
        fullName.length < 2 ||
        !validPassword(password)
      ) {
        return reply.code(400).send({
          error: "INVALID_DIRECTOR_DATA"
        });
      }

      const schoolCheck = await pool.query(
        "SELECT id FROM schools WHERE id=$1 LIMIT 1",
        [schoolId]
      );

      if (!schoolCheck.rowCount) {
        return reply.code(404).send({
          error: "SCHOOL_NOT_FOUND"
        });
      }

      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        let user;

const existingUser =
  await client.query(
    `
    SELECT
      id,
      login,
      email,
      full_name
    FROM users
    WHERE login=$1
       OR (
         $2 IS NOT NULL
         AND email=$2
       )
    LIMIT 1
    `,
    [
      login,
      email
    ]
  );

if(
  existingUser.rowCount
){
  user =
    existingUser.rows[0];

  await client.query(
    `
    UPDATE users
    SET
      account_state='ACTIVE',
      managed_by_school_id=$1,
      updated_at=now()
    WHERE id=$2
    `,
    [
      schoolId,
      user.id
    ]
  );

}else{

  const passwordHash =
    await hashPassword(
      password
    );

  const userResult =
    await client.query(
      `
      INSERT INTO users (
        login,
        email,
        full_name,
        password_hash,
        managed_by_school_id,
        account_state
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        'ACTIVE'
      )
      RETURNING
        id,
        login,
        email,
        full_name
      `,
      [
        login,
        email,
        fullName,
        passwordHash,
        schoolId
      ]
    );

  user =
    userResult.rows[0];
    }

    

        await client.query(
  `
  INSERT INTO school_memberships (
    school_id,
    user_id,
    status,
    created_by
  )
  VALUES (
    $1,
    $2,
    'ACTIVE',
    $3
  )
  ON CONFLICT (
    school_id,
    user_id
  )
  DO UPDATE SET
    status='ACTIVE'
  `,
  [
    schoolId,
    user.id,
    request.auth.userId
  ]
);
        await client.query(
  `
  INSERT INTO membership_roles (
    school_id,
    user_id,
    role,
    created_by
  )
  VALUES (
    $1,
    $2,
    'DIRECTOR',
    $3
  )
  ON CONFLICT (
    school_id,
    user_id,
    role
  )
  DO NOTHING
  `,
  [
    schoolId,
    user.id,
    request.auth.userId
  ]
);
        await client.query("COMMIT");

        return reply.code(201).send({
          ok: true,
          director: user
        });

      } catch (error) {

        try {
          await client.query("ROLLBACK");
        } catch {}

        if (error?.code === "23505") {
          return reply.code(409).send({
            error: "DIRECTOR_ACCOUNT_ALREADY_EXISTS"
          });
        }

        throw error;

      } finally {
        client.release();
      }
    }
    );
    // تعديل بيانات مدرسة
  app.patch(
    "/api/platform/schools/:schoolId",
    async (request, reply) => {
      if (!(await requireMutation(request, reply))) return;
      if (!(await requireSuperAdmin(request, reply))) return;

      const schoolId = String(request.params.schoolId || "");
      if (!isUuid(schoolId)) {
        return reply.code(400).send({ error: "INVALID_SCHOOL_ID" });
      }

      const b = request.body || {};

      const name = String(b.name || "").trim();
      const schoolType = String(b.schoolType || "").trim();
      const wilaya = String(b.wilaya || "").trim();
      const moughataa = String(b.moughataa || "").trim();
      const inspection = String(b.inspection || "").trim();
      const academicYear = String(b.academicYear || "").trim();

      if (!name || !academicYear) {
        return reply.code(400).send({ error: "INVALID_SCHOOL_DATA" });
      }

      const result = await pool.query(`
        UPDATE schools
        SET
          name=$2,
          school_type=$3,
          wilaya=$4,
          moughataa=$5,
          inspection=$6,
          academic_year=$7,
          updated_at=now()
        WHERE id=$1
        RETURNING *
      `, [
        schoolId,
        name,
        schoolType,
        wilaya,
        moughataa,
        inspection,
        academicYear
      ]);

      if (!result.rows[0]) {
        return reply.code(404).send({ error: "SCHOOL_NOT_FOUND" });
      }

      return { ok:true, school:result.rows[0] };
    }
  );

  // حذف مدرسة
  app.delete(
    "/api/platform/schools/:schoolId",
    async (request, reply) => {
      if (!(await requireMutation(request, reply))) return;
      if (!(await requireSuperAdmin(request, reply))) return;

      const schoolId = String(request.params.schoolId || "");
      if (!isUuid(schoolId)) {
        return reply.code(400).send({ error: "INVALID_SCHOOL_ID" });
      }

      const result = await pool.query(
        "DELETE FROM schools WHERE id=$1 RETURNING id,name",
        [schoolId]
      );

      if (!result.rows[0]) {
        return reply.code(404).send({ error: "SCHOOL_NOT_FOUND" });
      }

      return {
        ok:true,
        deleted:result.rows[0]
      };
    }
  );
  
}
