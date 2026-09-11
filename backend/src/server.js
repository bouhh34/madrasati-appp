import Fastify from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import path from "path";
import { fileURLToPath } from "url";

import { pool, withTenant } from "./db.js";
import {
  hashPassword,
  verifyPassword,
  normalizeLogin,
  strongPassword,
  safeEqualText,
  tokenHash,
  randomToken,
  isMutation
} from "./security.js";

import {
  createSession,
  destroySession,
  loadSession
} from "./auth.js";

const app = Fastify({
  logger: {
    redact: [
      "req.headers.cookie",
      "req.headers.authorization",
      "req.headers.x-csrf-token"
    ]
  },
  trustProxy: String(process.env.TRUST_PROXY || "true") === "true",
  bodyLimit: 256 * 1024
});

await app.register(cookie);

await app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      imgSrc: ["'self'", "data:"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
      formAction: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
});

await app.register(rateLimit, {
  global: true,
  max: 300,
  timeWindow: "1 minute"
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));

await app.register(fastifyStatic, {
  root: path.join(__dirname, "../public"),
  prefix: "/"
});

const APP_ORIGIN =
  String(process.env.APP_ORIGIN || "").replace(/\/$/, "");

app.addHook("onRequest", async (request, reply) => {
  request.auth = await loadSession(request);

  if (
    isMutation(request.method) &&
    request.url !== "/api/auth/login" &&
    request.url !== "/api/setup/bootstrap"
  ) {
    const origin = request.headers.origin;

    if (
      APP_ORIGIN &&
      origin &&
      origin !== APP_ORIGIN
    ) {
      return reply.code(403).send({
        error: "ORIGIN_REJECTED"
      });
    }
  }
});

async function requireSession(request, reply) {
  if (!request.auth) {
    reply.code(401).send({
      error: "AUTH_REQUIRED"
    });

    return false;
  }

  return true;
}

async function requireMutationSecurity(request, reply) {
  if (!(await requireSession(request, reply))) {
    return false;
  }

  const token =
    String(request.headers["x-csrf-token"] || "");

  if (
    !token ||
    tokenHash(token) !== request.auth.csrf_hash
  ) {
    reply.code(403).send({
      error: "CSRF_REJECTED"
    });

    return false;
  }

  return true;
}

function isDirector(auth) {
  return auth?.role === "DIRECTOR";
}

async function audit(
  client,
  auth,
  action,
  entityType,
  entityId,
  metadata = {}
) {
  await client.query(
    `
    INSERT INTO audit_log
    (
      school_id,
      actor_user_id,
      action,
      entity_type,
      entity_id,
      metadata
    )
    VALUES ($1,$2,$3,$4,$5,$6::jsonb)
    `,
    [
      auth.school_id,
      auth.user_id,
      action,
      entityType || null,
      entityId || null,
      JSON.stringify(metadata)
    ]
  );
}

async function canReadClass(
  client,
  auth,
  classId
) {
  if (isDirector(auth)) {
    return true;
  }

  const { rowCount } = await client.query(
    `
    SELECT 1
    FROM class_memberships
    WHERE
      school_id=$1
      AND class_id=$2
      AND user_id=$3

    UNION

    SELECT 1
    FROM teacher_assignments
    WHERE
      school_id=$1
      AND class_id=$2
      AND teacher_id=$3
      AND active=true
      AND (
        ends_at IS NULL
        OR ends_at > now()
      )

    LIMIT 1
    `,
    [
      auth.school_id,
      classId,
      auth.user_id
    ]
  );

  return rowCount > 0;
}

async function canWriteSubject(
  client,
  auth,
  classId,
  subjectId
) {
  if (isDirector(auth)) {
    return true;
  }

  const { rowCount } = await client.query(
    `
    SELECT 1
    FROM teacher_assignments
    WHERE
      school_id=$1
      AND class_id=$2
      AND subject_id=$3
      AND teacher_id=$4
      AND active=true
      AND (
        ends_at IS NULL
        OR ends_at > now()
      )

    UNION

    SELECT 1
    FROM permission_overrides
    WHERE
      school_id=$1
      AND class_id=$2
      AND target_user_id=$4
      AND capability='GRADE_WRITE'
      AND (
        subject_id IS NULL
        OR subject_id=$3
      )
      AND revoked_at IS NULL
      AND starts_at <= now()
      AND (
        ends_at IS NULL
        OR ends_at > now()
      )

    LIMIT 1
    `,
    [
      auth.school_id,
      classId,
      subjectId,
      auth.user_id
    ]
  );

  return rowCount > 0;
}

/* =========================
   HEALTH
========================= */

app.get("/api/health", async () => ({
  ok: true,
  service: "ma-madrassa-secure-v2"
}));

/* =========================
   FIRST DIRECTOR
========================= */

app.post(
  "/api/setup/bootstrap",
  {
    config: {
      rateLimit: {
        max: 3,
        timeWindow: "1 hour"
      }
    }
  },
  async (request, reply) => {

    const secret =
      String(
        request.headers["x-bootstrap-secret"] || ""
      );

    if (
      !process.env.BOOTSTRAP_SECRET ||
      !safeEqualText(
        secret,
        process.env.BOOTSTRAP_SECRET
      )
    ) {
      return reply.code(403).send({
        error: "BOOTSTRAP_DENIED"
      });
    }

    const { rows: countRows } =
      await pool.query(
        "SELECT count(*)::int n FROM schools"
      );

    if (countRows[0].n > 0) {
      return reply.code(409).send({
        error: "ALREADY_BOOTSTRAPPED"
      });
    }

    const body = request.body || {};

    const login =
      normalizeLogin(body.login);

    const password =
      String(body.password || "");

    const fullName =
      String(body.fullName || "").trim();

    const schoolName =
      String(body.schoolName || "").trim();

    if (
      !login ||
      !fullName ||
      !schoolName ||
      !strongPassword(password)
    ) {
      return reply.code(400).send({
        error: "INVALID_BOOTSTRAP_DATA"
      });
    }

    const passHash =
      await hashPassword(password);

    const client =
      await pool.connect();

    try {

      await client.query("BEGIN");

      const school =
        await client.query(
          `
          INSERT INTO schools
          (
            name,
            wilaya,
            moughataa,
            inspection,
            academic_year
          )
          VALUES ($1,$2,$3,$4,$5)
          RETURNING id
          `,
          [
            schoolName,
            body.wilaya || null,
            body.moughataa || null,
            body.inspection || null,
            body.academicYear || "2026/2027"
          ]
        );

      const user =
        await client.query(
          `
          INSERT INTO users
          (
            login,
            email,
            full_name,
            password_hash
          )
          VALUES ($1,$2,$3,$4)
          RETURNING id
          `,
          [
            login,
            body.email
              ? normalizeLogin(body.email)
              : null,
            fullName,
            passHash
          ]
        );

      await client.query(
        `
        INSERT INTO memberships
        (
          school_id,
          user_id,
          role
        )
        VALUES ($1,$2,'DIRECTOR')
        `,
        [
          school.rows[0].id,
          user.rows[0].id
        ]
      );

      await client.query("COMMIT");

      return {
        ok: true,
        schoolId: school.rows[0].id,
        directorUserId: user.rows[0].id
      };

    } catch (error) {

      await client.query("ROLLBACK");
      throw error;

    } finally {

      client.release();

    }
  }
);

/* =========================
   LOGIN
========================= */

app.post(
  "/api/auth/login",
  {
    config: {
      rateLimit: {
        max: 8,
        timeWindow: "15 minutes"
      }
    }
  },
  async (request, reply) => {

    const login =
      normalizeLogin(
        request.body?.login
      );

    const password =
      String(
        request.body?.password || ""
      );

    const invalid = () =>
      reply.code(401).send({
        error: "INVALID_CREDENTIALS"
      });

    const { rows } =
      await pool.query(
        `
        SELECT
          u.id AS user_id,
          u.password_hash,
          u.disabled_at,
          m.school_id,
          m.role,
          m.active,
          u.full_name
        FROM users u

        JOIN memberships m
          ON m.user_id=u.id

        WHERE u.login=$1

        LIMIT 1
        `,
        [login]
      );

    const row = rows[0];

    if (
      !row ||
      row.disabled_at ||
      !row.active
    ) {
      return invalid();
    }

    if (
      !(await verifyPassword(
        row.password_hash,
        password
      ))
    ) {
      return invalid();
    }

    await pool.query(
      `
      UPDATE users
      SET last_login_at=now()
      WHERE id=$1
      `,
      [row.user_id]
    );

    const csrf =
      await createSession({
        reply,
        userId: row.user_id,
        schoolId: row.school_id,
        userAgent:
          request.headers["user-agent"],
        ip: request.ip
      });

    return {
      ok: true,
      csrf,
      user: {
        id: row.user_id,
        fullName: row.full_name,
        role: row.role
      }
    };
  }
);

/* =========================
   LOGOUT
========================= */

app.post(
  "/api/auth/logout",
  async (request, reply) => {

    if (
      !(await requireMutationSecurity(
        request,
        reply
      ))
    ) {
      return;
    }

    await destroySession(
      request,
      reply
    );

    return {
      ok: true
    };
  }
);

/* =========================
   CURRENT USER
========================= */

app.get(
  "/api/auth/me",
  async (request, reply) => {

    if (
      !(await requireSession(
        request,
        reply
      ))
    ) {
      return;
    }

    return {
      id: request.auth.user_id,
      schoolId:
        request.auth.school_id,
      fullName:
        request.auth.full_name,
      login:
        request.auth.login,
      role:
        request.auth.role
    };
  }
);

/* =========================
   CSRF
========================= */

app.get(
  "/api/auth/csrf",
  async (request, reply) => {

    if (
      !(await requireSession(
        request,
        reply
      ))
    ) {
      return;
    }

    const csrf =
      randomToken(32);

    await pool.query(
      `
      UPDATE sessions
      SET csrf_hash=$1
      WHERE id=$2
      `,
      [
        tokenHash(csrf),
        request.auth.session_id
      ]
    );

    return {
      csrf
    };
  }
);

/* =========================
   CLASSES
========================= */

app.get(
  "/api/classes",
  async (request, reply) => {

    if (
      !(await requireSession(
        request,
        reply
      ))
    ) {
      return;
    }

    return withTenant(
      request.auth,
      async client => {

        const query =
          isDirector(request.auth)

          ? `
            SELECT
              id,
              name,
              level,
              section

            FROM classes

            WHERE school_id=$1

            ORDER BY name
            `

          : `
            SELECT DISTINCT
              c.id,
              c.name,
              c.level,
              c.section

            FROM classes c

            LEFT JOIN class_memberships cm
              ON cm.class_id=c.id
              AND cm.user_id=$2

            LEFT JOIN teacher_assignments ta
              ON ta.class_id=c.id
              AND ta.teacher_id=$2
              AND ta.active=true

            WHERE
              c.school_id=$1
              AND (
                cm.user_id IS NOT NULL
                OR ta.teacher_id IS NOT NULL
              )

            ORDER BY c.name
            `;

        const params =
          isDirector(request.auth)

          ? [
              request.auth.school_id
            ]

          : [
              request.auth.school_id,
              request.auth.user_id
            ];

        const { rows } =
          await client.query(
            query,
            params
          );

        return {
          classes: rows
        };
      }
    );
  }
);

/* =========================
   STUDENTS
========================= */

app.get(
  "/api/classes/:classId/students",
  async (request, reply) => {

    if (
      !(await requireSession(
        request,
        reply
      ))
    ) {
      return;
    }

    return withTenant(
      request.auth,
      async client => {

        if (
          !(await canReadClass(
            client,
            request.auth,
            request.params.classId
          ))
        ) {
          return reply
            .code(403)
            .send({
              error:
                "CLASS_ACCESS_DENIED"
            });
        }

        const { rows } =
          await client.query(
            `
            SELECT
              id,
              student_uid,
              full_name,
              gender,
              status

            FROM students

            WHERE
              school_id=$1
              AND class_id=$2

            ORDER BY full_name
            `,
            [
              request.auth.school_id,
              request.params.classId
            ]
          );

        return {
          students: rows
        };
      }
    );
  }
);

/* =========================
   SUBJECTS
========================= */

app.get(
  "/api/classes/:classId/subjects",
  async (request, reply) => {

    if (
      !(await requireSession(
        request,
        reply
      ))
    ) {
      return;
    }

    return withTenant(
      request.auth,
      async client => {

        if (
          !(await canReadClass(
            client,
            request.auth,
            request.params.classId
          ))
        ) {
          return reply
            .code(403)
            .send({
              error:
                "CLASS_ACCESS_DENIED"
            });
        }

        const { rows } =
          await client.query(
            `
            SELECT
              s.id,
              s.name,
              s.coefficient,
              s.max_score,

              EXISTS (
                SELECT 1

                FROM teacher_assignments ta

                WHERE
                  ta.school_id=$1
                  AND ta.class_id=$2
                  AND ta.subject_id=s.id
                  AND ta.teacher_id=$3
                  AND ta.active=true
                  AND (
                    ta.ends_at IS NULL
                    OR ta.ends_at > now()
                  )
              ) AS assigned_to_me

            FROM subjects s

            WHERE
              s.school_id=$1

            ORDER BY s.name
            `,
            [
              request.auth.school_id,
              request.params.classId,
              request.auth.user_id
            ]
          );

        return {
          subjects: rows,
          role: request.auth.role
        };
      }
    );
  }
);

/* =========================
   INVITE TEACHERS
========================= */

app.post(
  "/api/classes/:classId/invites",
  async (request, reply) => {

    if (
      !(await requireMutationSecurity(
        request,
        reply
      ))
    ) {
      return;
    }

    const logins =
      Array.isArray(
        request.body?.logins
      )
        ? request.body.logins
            .map(normalizeLogin)
            .filter(Boolean)
        : [];

    if (
      !logins.length ||
      logins.length > 20
    ) {
      return reply
        .code(400)
        .send({
          error:
            "INVALID_INVITEES"
        });
    }

    return withTenant(
      request.auth,
      async client => {

        if (
          !(await canReadClass(
            client,
            request.auth,
            request.params.classId
          ))
        ) {
          return reply
            .code(403)
            .send({
              error:
                "CLASS_ACCESS_DENIED"
            });
        }

        const invited = [];

        for (
          const login
          of [...new Set(logins)]
        ) {

          const user =
            await client.query(
              `
              SELECT
                u.id,
                u.full_name

              FROM users u

              JOIN memberships m
                ON m.user_id=u.id

              WHERE
                m.school_id=$1
                AND m.active=true
                AND m.role='TEACHER'
                AND u.login=$2

              LIMIT 1
              `,
              [
                request.auth.school_id,
                login
              ]
            );

          const target =
            user.rows[0];

          if (
            !target ||
            target.id ===
              request.auth.user_id
          ) {
            continue;
          }

          const insert =
            await client.query(
              `
              INSERT INTO class_invites
              (
                school_id,
                class_id,
                inviter_id,
                invitee_id
              )

              VALUES
              ($1,$2,$3,$4)

              ON CONFLICT
              DO NOTHING

              RETURNING id
              `,
              [
                request.auth.school_id,
                request.params.classId,
                request.auth.user_id,
                target.id
              ]
            );

          if (insert.rows[0]) {
            invited.push({
              id:
                insert.rows[0].id,
              fullName:
                target.full_name
            });
          }
        }

        await audit(
          client,
          request.auth,
          "CLASS_INVITES_SENT",
          "class",
          request.params.classId,
          {
            count:
              invited.length
          }
        );

        return {
          invited
        };
      }
    );
  }
);

/* =========================
   ACCEPT INVITE
========================= */

app.post(
  "/api/invites/:inviteId/accept",
  async (request, reply) => {

    if (
      !(await requireMutationSecurity(
        request,
        reply
      ))
    ) {
      return;
    }

    return withTenant(
      request.auth,
      async client => {

        const invite =
          await client.query(
            `
            UPDATE class_invites

            SET
              status='ACCEPTED',
              responded_at=now()

            WHERE
              id=$1
              AND school_id=$2
              AND invitee_id=$3
              AND status='PENDING'
              AND expires_at>now()

            RETURNING class_id
            `,
            [
              request.params.inviteId,
              request.auth.school_id,
              request.auth.user_id
            ]
          );

        if (!invite.rows[0]) {
          return reply
            .code(404)
            .send({
              error:
                "INVITE_NOT_FOUND"
            });
        }

        await client.query(
          `
          INSERT INTO class_memberships
          (
            school_id,
            class_id,
            user_id,
            source,
            created_by
          )

          VALUES
          ($1,$2,$3,'INVITE',$3)

          ON CONFLICT
          (class_id,user_id)
          DO NOTHING
          `,
          [
            request.auth.school_id,
            invite.rows[0].class_id,
            request.auth.user_id
          ]
        );

        await audit(
          client,
          request.auth,
          "CLASS_INVITE_ACCEPTED",
          "class",
          invite.rows[0].class_id
        );

        return {
          ok: true,
          classId:
            invite.rows[0].class_id
        };
      }
    );
 
