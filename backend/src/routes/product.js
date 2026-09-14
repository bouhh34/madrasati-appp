import { withContext } from "../db.js";
import { audit } from "../audit.js";
import { isUuid, text, optionalText, oneOf, validDate } from "../validators.js";

function validTime(value) {
  if (value === null || value === undefined || value === "") return true;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value));
}

export async function registerProductRoutes(
  app,
  { requireSession, requireMutation }
) {

  /* =========================================================
     ATTENDANCE
     ========================================================= */

  app.get("/api/attendance", async (request, reply) => {
    if (!(await requireSession(request, reply))) return;

    const classId = String(request.query?.classId || "");
    const date = String(request.query?.date || "");

    if (
      !request.auth.schoolId ||
      !isUuid(classId) ||
      !validDate(date)
    ) {
      return reply.code(400).send({
        error: "INVALID_ATTENDANCE_QUERY"
      });
    }

    return withContext(
      {
        userId: request.auth.userId,
        schoolId: request.auth.schoolId
      },
      async c => {
        const q = await c.query(
          `
          SELECT
            ar.id,
            ar.class_id,
            ar.student_id,
            ar.attendance_date,
            ar.status,
            ar.note,
            ar.row_version,
            ar.updated_at,
            s.student_uid,
            s.full_name,
            s.gender
          FROM attendance_records ar
          JOIN students s
            ON s.id = ar.student_id
          WHERE
            ar.class_id = $1
            AND ar.attendance_date = $2
          ORDER BY s.full_name
          `,
          [classId, date]
        );

        return {
          attendance: q.rows
        };
      }
    );
  });


  app.get("/api/attendance/students", async (request, reply) => {
    if (!(await requireSession(request, reply))) return;

    const classId = String(request.query?.classId || "");
    const date = String(request.query?.date || "");

    if (
      !request.auth.schoolId ||
      !isUuid(classId) ||
      !validDate(date)
    ) {
      return reply.code(400).send({
        error: "INVALID_ATTENDANCE_QUERY"
      });
    }

    return withContext(
      {
        userId: request.auth.userId,
        schoolId: request.auth.schoolId
      },
      async c => {
        const q = await c.query(
          `
          SELECT
            s.id student_id,
            s.student_uid,
            s.full_name,
            s.gender,
            s.class_id,
            ar.id attendance_id,
            ar.status,
            ar.note,
            ar.row_version,
            ar.attendance_date
          FROM students s
          LEFT JOIN attendance_records ar
            ON ar.student_id = s.id
            AND ar.attendance_date = $2
          WHERE
            s.class_id = $1
            AND s.status = 'ACTIVE'
          ORDER BY s.full_name
          `,
          [classId, date]
        );

        return {
          students: q.rows
        };
      }
    );
  });


  app.put("/api/attendance/:studentId", async (request, reply) => {
    if (!(await requireMutation(request, reply))) return;

    const studentId = String(request.params?.studentId || "");
    const body = request.body || {};

    const classId = String(body.classId || "");
    const date = String(body.date || "");

    const status = oneOf(
      body.status,
      [
        "PRESENT",
        "ABSENT",
        "LATE",
        "EXCUSED"
      ]
    );

    const note = optionalText(
      body.note,
      { max: 500 }
    );

    if (
      !request.auth.schoolId ||
      !isUuid(studentId) ||
      !isUuid(classId) ||
      !validDate(date) ||
      !status
    ) {
      return reply.code(400).send({
        error: "INVALID_ATTENDANCE"
      });
    }

    return withContext(
      {
        userId: request.auth.userId,
        schoolId: request.auth.schoolId
      },
      async c => {

        const student = await c.query(
          `
          SELECT id
          FROM students
          WHERE id = $1
            AND class_id = $2
            AND status = 'ACTIVE'
          `,
          [studentId, classId]
        );

        if (!student.rowCount) {
          return reply.code(404).send({
            error: "STUDENT_NOT_FOUND"
          });
        }

        const q = await c.query(
          `
          INSERT INTO attendance_records(
            school_id,
            class_id,
            student_id,
            attendance_date,
            status,
            note,
            recorded_by
          )
          VALUES(
            $1,$2,$3,$4,$5,$6,$7
          )

          ON CONFLICT(
            school_id,
            student_id,
            attendance_date
          )

          DO UPDATE SET
            status = EXCLUDED.status,
            note = EXCLUDED.note,
            recorded_by = EXCLUDED.recorded_by,
            updated_at = now(),
            row_version =
              attendance_records.row_version + 1

          RETURNING
            id,
            row_version,
            status,
            attendance_date
          `,
          [
            request.auth.schoolId,
            classId,
            studentId,
            date,
            status,
            note,
            request.auth.userId
          ]
        );

        await audit(
          c,
          request.auth,
          "ATTENDANCE_SAVED",
          "attendance",
          q.rows[0].id,
          {
            studentId,
            classId,
            date,
            status
          }
        );

        return {
          ok: true,
          ...q.rows[0]
        };
      }
    );
  });


  app.get(
    "/api/students/:studentId/attendance",
    async (request, reply) => {
      if (!(await requireSession(request, reply))) return;

      const studentId =
        String(request.params?.studentId || "");

      if (
        !request.auth.schoolId ||
        !isUuid(studentId)
      ) {
        return reply.code(400).send({
          error: "INVALID_STUDENT"
        });
      }

      return withContext(
        {
          userId: request.auth.userId,
          schoolId: request.auth.schoolId
        },
        async c => {
          const q = await c.query(
            `
            SELECT
              id,
              attendance_date,
              status,
              note,
              created_at,
              updated_at
            FROM attendance_records
            WHERE student_id = $1
            ORDER BY attendance_date DESC
            LIMIT 180
            `,
            [studentId]
          );

          return {
            attendance: q.rows
          };
        }
      );
    }
  );


  /* =========================================================
     EXAM SCHEDULE
     ========================================================= */

  app.get("/api/exams", async (request, reply) => {
    if (!(await requireSession(request, reply))) return;

    const classId =
      String(request.query?.classId || "");

    const term =
      request.query?.term
        ? String(request.query.term).toUpperCase()
        : null;

    if (
      !request.auth.schoolId ||
      !isUuid(classId) ||
      (
        term &&
        !["T1", "T2", "T3"].includes(term)
      )
    ) {
      return reply.code(400).send({
        error: "INVALID_EXAM_QUERY"
      });
    }

    return withContext(
      {
        userId: request.auth.userId,
        schoolId: request.auth.schoolId
      },
      async c => {

        const params = [classId];
        let termFilter = "";

        if (term) {
          params.push(term);
          termFilter = "AND e.term = $2";
        }

        const q = await c.query(
          `
          SELECT
            e.id,
            e.class_id,
            e.subject_id,
            e.term,
            e.title,
            e.exam_date,
            e.starts_at,
            e.ends_at,
            e.room,
            e.notes,
            e.published,
            e.row_version,
            e.created_at,
            e.updated_at,
            s.name subject_name,
            c.name class_name
          FROM exam_schedule e

          JOIN subjects s
            ON s.id = e.subject_id

          JOIN classes c
            ON c.id = e.class_id

          WHERE
            e.class_id = $1
            ${termFilter}

          ORDER BY
            e.exam_date,
            e.starts_at NULLS LAST,
            s.name
          `,
          params
        );

        return {
          exams: q.rows
        };
      }
    );
  });


  app.post("/api/exams", async (request, reply) => {
    if (!(await requireMutation(request, reply))) return;

    const body = request.body || {};

    const classId =
      String(body.classId || "");

    const subjectId =
      String(body.subjectId || "");

    const term =
      String(body.term || "").toUpperCase();

    const title =
      text(body.title, {
        min: 1,
        max: 180
      });

    const examDate =
      String(body.examDate || "");

    const startsAt =
      body.startsAt
        ? String(body.startsAt)
        : null;

    const endsAt =
      body.endsAt
        ? String(body.endsAt)
        : null;

    const room =
      optionalText(body.room, {
        max: 120
      });

    const notes =
      optionalText(body.notes, {
        max: 1000
      });

    const published =
      body.published === true;

    if (
      !request.auth.schoolId ||
      !isUuid(classId) ||
      !isUuid(subjectId) ||
      !["T1", "T2", "T3"].includes(term) ||
      !title ||
      !validDate(examDate) ||
      !validTime(startsAt) ||
      !validTime(endsAt) || (startsAt && endsAt && endsAt <= startsAt)
    ) {
      return reply.code(400).send({
        error: "INVALID_EXAM"
      });
    }

    return withContext(
      {
        userId: request.auth.userId,
        schoolId: request.auth.schoolId
      },
      async c => {

        const q = await c.query(
          `
          INSERT INTO exam_schedule(
            school_id,
            class_id,
            subject_id,
            term,
            title,
            exam_date,
            starts_at,
            ends_at,
            room,
            notes,
            published,
            created_by
          )

          VALUES(
            $1,$2,$3,$4,$5,$6,
            $7,$8,$9,$10,$11,$12
          )

          RETURNING
            id,
            row_version
          `,
          [
            request.auth.schoolId,
            classId,
            subjectId,
            term,
            title,
            examDate,
            startsAt,
            endsAt,
            room,
            notes,
            published,
            request.auth.userId
          ]
        );

        await audit(
          c,
          request.auth,
          "EXAM_CREATED",
          "exam",
          q.rows[0].id,
          {
            classId,
            subjectId,
            term,
            examDate
          }
        );

        return reply.code(201).send({
          ok: true,
          ...q.rows[0]
        });
      }
    );
  });


  app.patch("/api/exams/:id", async (request, reply) => {
    if (!(await requireMutation(request, reply))) return;

    const id =
      String(request.params?.id || "");

    const body =
      request.body || {};

    const version =
      Number(body.version);

    const title =
      text(body.title, {
        min: 1,
        max: 180
      });

    const examDate =
      String(body.examDate || "");

    const startsAt =
      body.startsAt
        ? String(body.startsAt)
        : null;

    const endsAt =
      body.endsAt
        ? String(body.endsAt)
        : null;

    const room =
      optionalText(body.room, {
        max: 120
      });

    const notes =
      optionalText(body.notes, {
        max: 1000
      });

    if (
      !request.auth.schoolId ||
      !isUuid(id) ||
      !Number.isInteger(version) ||
      version < 1 ||
      !title ||
      !validDate(examDate) ||
      !validTime(startsAt) ||
      !validTime(endsAt) || (startsAt && endsAt && endsAt <= startsAt)
    ) {
      return reply.code(400).send({
        error: "INVALID_EXAM"
      });
    }

    return withContext(
      {
        userId: request.auth.userId,
        schoolId: request.auth.schoolId
      },
      async c => {

        const q = await c.query(
          `
          UPDATE exam_schedule
          SET
            title = $1,
            exam_date = $2,
            starts_at = $3,
            ends_at = $4,
            room = $5,
            notes = $6,
            published = COALESCE($7, published),
            row_version = row_version + 1,
            updated_at = now()

          WHERE
            id = $8
            AND row_version = $9

          RETURNING
            id,
            row_version
          `,
          [
            title,
            examDate,
            startsAt,
            endsAt,
            room,
            notes,
            typeof body.published === "boolean"
              ? body.published
              : null,
            id,
            version
          ]
        );

        if (!q.rowCount) {
          return reply.code(409).send({
            error: "VERSION_CONFLICT"
          });
        }

        await audit(
          c,
          request.auth,
          "EXAM_UPDATED",
          "exam",
          id,
          {
            newVersion:
              q.rows[0].row_version
          }
        );

        return {
          ok: true,
          ...q.rows[0]
        };
      }
    );
  });


  app.delete("/api/exams/:id", async (request, reply) => {
    if (!(await requireMutation(request, reply))) return;

    const id =
      String(request.params?.id || "");

    if (
      !request.auth.schoolId ||
      !isUuid(id)
    ) {
      return reply.code(400).send({
        error: "INVALID_EXAM"
      });
    }

    return withContext(
      {
        userId: request.auth.userId,
        schoolId: request.auth.schoolId
      },
      async c => {

        const q = await c.query(
          `
          DELETE FROM exam_schedule
          WHERE id = $1
          RETURNING id
          `,
          [id]
        );

        if (!q.rowCount) {
          return reply.code(404).send({
            error: "EXAM_NOT_FOUND"
          });
        }

        await audit(
          c,
          request.auth,
          "EXAM_DELETED",
          "exam",
          id,
          {}
        );

        return {
          ok: true
        };
      }
    );
  });
                                          }
