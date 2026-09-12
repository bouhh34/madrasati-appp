/* =========================================================
   Ma Madrassa - Product Features V5
   ADMIN role + attendance + exams + delegated permissions
   ========================================================= */


/* =========================================================
   1. ADD ADMIN ROLE
   ========================================================= */

ALTER TABLE membership_roles
  DROP CONSTRAINT IF EXISTS membership_roles_role_check;

ALTER TABLE membership_roles
  ADD CONSTRAINT membership_roles_role_check
  CHECK (
    role IN (
      'DIRECTOR',
      'ADMIN',
      'TEACHER',
      'GUARDIAN'
    )
  );


ALTER TABLE access_invites
  DROP CONSTRAINT IF EXISTS access_invites_invite_kind_check;

ALTER TABLE access_invites
  ADD CONSTRAINT access_invites_invite_kind_check
  CHECK (
    invite_kind IN (
      'DIRECTOR',
      'ADMIN',
      'TEACHER',
      'GUARDIAN'
    )
  );


ALTER TABLE access_invites
  DROP CONSTRAINT IF EXISTS access_invites_role_check;

ALTER TABLE access_invites
  ADD CONSTRAINT access_invites_role_check
  CHECK (
    role IN (
      'DIRECTOR',
      'ADMIN',
      'TEACHER',
      'GUARDIAN'
    )
  );


/* =========================================================
   2. EXTEND DELEGATED PERMISSIONS
   ========================================================= */

ALTER TABLE permission_grants
  DROP CONSTRAINT IF EXISTS permission_grants_permission_check;

ALTER TABLE permission_grants
  ADD CONSTRAINT permission_grants_permission_check
  CHECK (
    permission IN (
      'CLASS_READ',
      'STUDENT_READ',
      'STUDENT_WRITE',
      'SUBJECT_READ',
      'GRADE_READ',
      'GRADE_WRITE',
      'REPORT_READ',
      'ATTENDANCE_READ',
      'ATTENDANCE_WRITE',
      'EXAM_READ',
      'EXAM_WRITE',
      'DOCUMENT_READ',
      'DOCUMENT_WRITE'
    )
  );


/* =========================================================
   3. ATTENDANCE
   ========================================================= */

CREATE TABLE IF NOT EXISTS attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  school_id uuid NOT NULL
    REFERENCES schools(id)
    ON DELETE CASCADE,

  class_id uuid NOT NULL,

  student_id uuid NOT NULL,

  attendance_date date NOT NULL,

  status text NOT NULL
    CHECK (
      status IN (
        'PRESENT',
        'ABSENT',
        'LATE',
        'EXCUSED'
      )
    ),

  note text,

  recorded_by uuid NOT NULL
    REFERENCES users(id)
    ON DELETE RESTRICT,

  created_at timestamptz NOT NULL
    DEFAULT now(),

  updated_at timestamptz NOT NULL
    DEFAULT now(),

  row_version integer NOT NULL
    DEFAULT 1
    CHECK (row_version > 0),

  UNIQUE (
    school_id,
    student_id,
    attendance_date
  ),

  FOREIGN KEY (
    class_id,
    school_id
  )
  REFERENCES classes(
    id,
    school_id
  )
  ON DELETE CASCADE,

  FOREIGN KEY (
    student_id,
    school_id,
    class_id
  )
  REFERENCES students(
    id,
    school_id,
    class_id
  )
  ON DELETE CASCADE
);


CREATE INDEX IF NOT EXISTS
  idx_attendance_school_class_date
ON attendance_records(
  school_id,
  class_id,
  attendance_date DESC
);


CREATE INDEX IF NOT EXISTS
  idx_attendance_student_date
ON attendance_records(
  student_id,
  attendance_date DESC
);


/* =========================================================
   4. EXAM SCHEDULE
   ========================================================= */

CREATE TABLE IF NOT EXISTS exam_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  school_id uuid NOT NULL
    REFERENCES schools(id)
    ON DELETE CASCADE,

  class_id uuid NOT NULL,

  subject_id uuid NOT NULL,

  term text NOT NULL
    CHECK (
      term IN (
        'T1',
        'T2',
        'T3'
      )
    ),

  title text NOT NULL,

  exam_date date NOT NULL,

  starts_at time,

  ends_at time,

  room text,

  notes text,

  published boolean NOT NULL
    DEFAULT false,

  created_by uuid NOT NULL
    REFERENCES users(id)
    ON DELETE RESTRICT,

  created_at timestamptz NOT NULL
    DEFAULT now(),

  updated_at timestamptz NOT NULL
    DEFAULT now(),

  row_version integer NOT NULL
    DEFAULT 1
    CHECK (row_version > 0),

  CHECK (
    ends_at IS NULL
    OR starts_at IS NULL
    OR ends_at > starts_at
  ),

  FOREIGN KEY (
    class_id,
    school_id
  )
  REFERENCES classes(
    id,
    school_id
  )
  ON DELETE CASCADE,

  FOREIGN KEY (
    subject_id,
    school_id
  )
  REFERENCES subjects(
    id,
    school_id
  )
  ON DELETE CASCADE
);


CREATE INDEX IF NOT EXISTS
  idx_exam_schedule_class_date
ON exam_schedule(
  school_id,
  class_id,
  exam_date
);


CREATE INDEX IF NOT EXISTS
  idx_exam_schedule_subject
ON exam_schedule(
  school_id,
  subject_id,
  exam_date
);


/* =========================================================
   5. ENABLE DATABASE-LEVEL ISOLATION
   ========================================================= */

ALTER TABLE attendance_records
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE attendance_records
  FORCE ROW LEVEL SECURITY;


ALTER TABLE exam_schedule
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE exam_schedule
  FORCE ROW LEVEL SECURITY;


/* =========================================================
   6. ATTENDANCE RLS
   ========================================================= */

DROP POLICY IF EXISTS
  attendance_select
ON attendance_records;

CREATE POLICY attendance_select
ON attendance_records
FOR SELECT
USING (
  school_id = app.current_school_id()
  AND (
    app.has_role('DIRECTOR')

    OR app.has_permission(
      'ATTENDANCE_READ',
      class_id,
      NULL
    )

    OR app.has_permission(
      'ATTENDANCE_WRITE',
      class_id,
      NULL
    )

    OR app.is_guardian_of(
      student_id
    )
  )
);


DROP POLICY IF EXISTS
  attendance_write
ON attendance_records;

CREATE POLICY attendance_write
ON attendance_records
FOR ALL
USING (
  school_id = app.current_school_id()
  AND (
    app.has_role('DIRECTOR')

    OR app.has_permission(
      'ATTENDANCE_WRITE',
      class_id,
      NULL
    )
  )
)
WITH CHECK (
  school_id = app.current_school_id()
  AND (
    app.has_role('DIRECTOR')

    OR app.has_permission(
      'ATTENDANCE_WRITE',
      class_id,
      NULL
    )
  )
);


/* =========================================================
   7. EXAM SCHEDULE RLS
   ========================================================= */

DROP POLICY IF EXISTS
  exam_schedule_select
ON exam_schedule;

CREATE POLICY exam_schedule_select
ON exam_schedule
FOR SELECT
USING (
  school_id = app.current_school_id()
  AND (
    app.has_role('DIRECTOR')

    OR app.has_permission(
      'EXAM_READ',
      class_id,
      subject_id
    )

    OR app.has_permission(
      'EXAM_WRITE',
      class_id,
      subject_id
    )

    OR (
      published = true
      AND app.has_class_permission(
        'CLASS_READ',
        class_id
      )
    )

    OR (
      published = true
      AND EXISTS (
        SELECT 1
        FROM students s
        WHERE
          s.school_id =
            exam_schedule.school_id

          AND s.class_id =
            exam_schedule.class_id

          AND app.is_guardian_of(
            s.id
          )
      )
    )
  )
);


DROP POLICY IF EXISTS
  exam_schedule_write
ON exam_schedule;

CREATE POLICY exam_schedule_write
ON exam_schedule
FOR ALL
USING (
  school_id = app.current_school_id()
  AND (
    app.has_role('DIRECTOR')

    OR app.has_permission(
      'EXAM_WRITE',
      class_id,
      subject_id
    )
  )
)
WITH CHECK (
  school_id = app.current_school_id()
  AND (
    app.has_role('DIRECTOR')

    OR app.has_permission(
      'EXAM_WRITE',
      class_id,
      subject_id
    )
  )
);
