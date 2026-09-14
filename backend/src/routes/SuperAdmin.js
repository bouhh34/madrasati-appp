import { pool, withContext } from "../db.js";
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


  app.get('/api/platform/accounts',async(request,reply)=>{
    if(!await requireSuperAdmin(request,reply))return;
    const q=String(request.query?.q||'').trim().slice(0,100);
    const role=String(request.query?.role||'');
    const offset=Number(request.query?.offset||0);
    if(!Number.isSafeInteger(offset)||offset<0||!['','DIRECTOR','TEACHER','SUPER_ADMIN'].includes(role))return reply.code(400).send({error:'INVALID_FILTER'});
    const result=await pool.query(`SELECT u.id,u.login,u.full_name,u.account_state,
      ARRAY(SELECT DISTINCT s.name FROM school_memberships sm JOIN schools s ON s.id=sm.school_id WHERE sm.user_id=u.id AND sm.status='ACTIVE' ORDER BY s.name) schools,
      ARRAY(SELECT role FROM (SELECT mr.role FROM membership_roles mr JOIN school_memberships sm USING(school_id,user_id) WHERE mr.user_id=u.id AND sm.status='ACTIVE'
        UNION SELECT pa.role FROM platform_admins pa WHERE pa.user_id=u.id AND pa.active) all_roles ORDER BY role) roles
      FROM users u WHERE ($1='' OR u.full_name ILIKE '%'||$1||'%' OR u.login ILIKE '%'||$1||'%')
      AND ($2='' OR EXISTS(SELECT 1 FROM membership_roles mr JOIN school_memberships sm USING(school_id,user_id) WHERE mr.user_id=u.id AND mr.role=$2 AND sm.status='ACTIVE')
        OR EXISTS(SELECT 1 FROM platform_admins pa WHERE pa.user_id=u.id AND pa.role=$2 AND pa.active))
      ORDER BY u.full_name,u.id LIMIT 51 OFFSET $3`,[q,role,offset]);
    return {accounts:result.rows.slice(0,50),hasMore:result.rows.length>50};
  });

  // ملخص المنصة
  app.get("/api/platform/overview", async (request, reply) => {

    if (!(await requireSuperAdmin(request, reply))) return;

    const result = await withContext(request.auth, c => c.query(`
      SELECT
        (SELECT COUNT(*)::int FROM schools) AS schools,
        (SELECT COUNT(*)::int FROM schools WHERE active = true) AS active_schools,
        (SELECT COUNT(*)::int FROM users) AS users,
        (SELECT COUNT(*)::int FROM students) AS students,
        (SELECT COUNT(*)::int FROM classes) AS classes
    `));

    return {
      ok: true,
      overview: result.rows[0]
    };
  });


  // جميع المدارس
  app.get("/api/platform/schools", async (request, reply) => {

    if (!(await requireSuperAdmin(request, reply))) return;

    const result = await withContext(request.auth, c => c.query(`
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
    `));

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

      if (!isUuid(schoolId) || typeof request.body?.active !== "boolean") {
        return reply.code(400).send({error:"INVALID_SCHOOL_STATUS"});
      }
      const active = request.body.active;

      const result = await pool.query(`
        UPDATE schools
        SET active = $2,
            archived_at = CASE WHEN $2 THEN NULL ELSE archived_at END,
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
  // Account creation and association are explicit; existing credentials are never replaced.
  app.post("/api/platform/schools/:schoolId/director", async (request, reply) => {
    if (!(await requireMutation(request, reply))) return;
    if (!(await requireSuperAdmin(request, reply))) return;
    const schoolId = String(request.params.schoolId || "");
    if (!isUuid(schoolId)) return reply.code(400).send({error:"INVALID_SCHOOL_ID"});
    const body = request.body || {}, mode = body.mode || "new";
    const login = normalizeLogin(body.login), email = normalizeEmail(body.email);
    const fullName = String(body.fullName || "").trim(), password = String(body.password || "");
    if (!["new","existing"].includes(mode) || login.length < 3 || login.length > 80 ||
        (mode === "new" && (fullName.length < 2 || fullName.length > 160 || !validPassword(password) ||
          (body.email && (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))))) {
      return reply.code(400).send({error:"INVALID_DIRECTOR_DATA"});
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const school = (await client.query("SELECT active FROM schools WHERE id=$1 FOR UPDATE", [schoolId])).rows[0];
      if (!school || !school.active) {
        await client.query("ROLLBACK");
        return reply.code(school ? 409 : 404).send({error:school ? "SCHOOL_INACTIVE" : "SCHOOL_NOT_FOUND"});
      }
      let user;
      if (mode === "existing") {
        user = (await client.query("SELECT id,login,email,full_name,account_state FROM users WHERE login=$1 FOR UPDATE", [login])).rows[0];
        if (!user || ["LOCKED","DISABLED"].includes(user.account_state)) {
          await client.query("ROLLBACK");
          return reply.code(user ? 409 : 404).send({error:user ? "DIRECTOR_ACCOUNT_DISABLED" : "DIRECTOR_ACCOUNT_NOT_FOUND"});
        }
        await client.query(`UPDATE users SET account_state='ACTIVE',
          managed_by_school_id=COALESCE(managed_by_school_id,$1), updated_at=now() WHERE id=$2`, [schoolId,user.id]);
      } else {
        if ((await client.query("SELECT 1 FROM users WHERE login=$1 OR email=$2",[login,email])).rowCount) {
          await client.query("ROLLBACK");
          return reply.code(409).send({error:"DIRECTOR_ACCOUNT_ALREADY_EXISTS"});
        }
        const passwordHash = await hashPassword(password);
        user = (await client.query(`INSERT INTO users(login,email,full_name,password_hash,managed_by_school_id,account_state)
          VALUES($1,$2,$3,$4,$5,'ACTIVE') RETURNING id,login,email,full_name`,[login,email,fullName,passwordHash,schoolId])).rows[0];
      }
      await client.query(`INSERT INTO school_memberships(school_id,user_id,status,created_by)
        VALUES($1,$2,'ACTIVE',$3) ON CONFLICT(school_id,user_id)
        DO UPDATE SET status='ACTIVE',revoked_at=NULL`,[schoolId,user.id,request.auth.userId]);
      await client.query(`INSERT INTO membership_roles(school_id,user_id,role,created_by)
        VALUES($1,$2,'DIRECTOR',$3) ON CONFLICT(school_id,user_id,role) DO NOTHING`,[schoolId,user.id,request.auth.userId]);
      await client.query("COMMIT");
      return reply.code(201).send({ok:true,director:{id:user.id,login:user.login,email:user.email,full_name:user.full_name}});
    } catch (error) {
      await client.query("ROLLBACK");
      if (error?.code === "23505") return reply.code(409).send({error:"DIRECTOR_ACCOUNT_ALREADY_EXISTS"});
      throw error;
    } finally { client.release(); }
  });
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

      if (!name || !academicYear || !["PUBLIC","PRIVATE"].includes(schoolType)) {
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
        "UPDATE schools SET active=false,archived_at=now(),updated_at=now() WHERE id=$1 RETURNING id,name",
        [schoolId]
      );

      if (!result.rows[0]) {
        return reply.code(404).send({ error: "SCHOOL_NOT_FOUND" });
      }

      return {
        ok:true,
        archived:true,
        deleted:result.rows[0]
      };
    }
  );
  
}
