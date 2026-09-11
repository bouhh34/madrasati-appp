CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    wilaya TEXT,
    moughataa TEXT,
    inspection TEXT,
    academic_year TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    login TEXT NOT NULL UNIQUE,
    email TEXT UNIQUE,
    full_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    disabled_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memberships (
    school_id UUID NOT NULL
        REFERENCES schools(id) ON DELETE CASCADE,
    user_id UUID NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL
        CHECK (role IN ('DIRECTOR','TEACHER','PARENT')),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (school_id, user_id)
);

CREATE TABLE IF NOT EXISTS classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL
        REFERENCES schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    level TEXT,
    section TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (school_id, name)
);

CREATE TABLE IF NOT EXISTS students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL
        REFERENCES schools(id) ON DELETE CASCADE,
    class_id UUID NOT NULL
        REFERENCES classes(id) ON DELETE CASCADE,
    student_uid TEXT NOT NULL,
    full_name TEXT NOT NULL,
    gender TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (school_id, student_uid)
);

CREATE TABLE IF NOT EXISTS subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL
        REFERENCES schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    coefficient NUMERIC(8,2) NOT NULL DEFAULT 1,
    max_score NUMERIC(8,2) NOT NULL DEFAULT 20,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (school_id, name),
    CHECK (coefficient > 0),
    CHECK (max_score > 0)
);

CREATE TABLE IF NOT EXISTS class_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL
        REFERENCES schools(id) ON DELETE CASCADE,
    class_id UUID NOT NULL
        REFERENCES classes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
    source TEXT NOT NULL DEFAULT 'DIRECTOR',
    created_by UUID
        REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (class_id, user_id)
);

CREATE TABLE IF NOT EXISTS teacher_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL
        REFERENCES schools(id) ON DELETE CASCADE,
    class_id UUID NOT NULL
        REFERENCES classes(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL
        REFERENCES subjects(id) ON DELETE CASCADE,
    teacher_id UUID NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
    active BOOLEAN NOT NULL DEFAULT true,
    starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ends_at TIMESTAMPTZ,
    assigned_by UUID
        REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (class_id, subject_id, teacher_id)
);

CREATE TABLE IF NOT EXISTS class_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL
        REFERENCES schools(id) ON DELETE CASCADE,
    class_id UUID NOT NULL
        REFERENCES classes(id) ON DELETE CASCADE,
    inviter_id UUID NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
    invitee_id UUID NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (
            status IN (
                'PENDING',
                'ACCEPTED',
                'DECLINED',
                'CANCELLED'
            )
        ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
        DEFAULT (now() + interval '7 days'),
    responded_at TIMESTAMPTZ,
    UNIQUE (class_id, inviter_id, invitee_id, status)
);

CREATE TABLE IF NOT EXISTS permission_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL
        REFERENCES schools(id) ON DELETE CASCADE,
    class_id UUID NOT NULL
        REFERENCES classes(id) ON DELETE CASCADE,
    subject_id UUID
        REFERENCES subjects(id) ON DELETE CASCADE,
    target_user_id UUID NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
    capability TEXT NOT NULL
        CHECK (
            capability IN (
                'GRADE_WRITE',
                'CLASS_MANAGE'
            )
        ),
    starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ends_at TIMESTAMPTZ,
    granted_by UUID NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS grades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL
        REFERENCES schools(id) ON DELETE CASCADE,
    class_id UUID NOT NULL
        REFERENCES classes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL
        REFERENCES students(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL
        REFERENCES subjects(id) ON DELETE CASCADE,
    term TEXT NOT NULL,
    assessment TEXT NOT NULL DEFAULT 'MAIN',
    score NUMERIC(8,2) NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    updated_by UUID NOT NULL
        REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (
        student_id,
        subject_id,
        term,
        assessment
    ),
    CHECK (score >= 0)
);

CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash TEXT NOT NULL UNIQUE,
    csrf_hash TEXT NOT NULL,
    user_id UUID NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
    school_id UUID NOT NULL
        REFERENCES schools(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    user_agent_hash TEXT,
    ip_hash TEXT,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    school_id UUID NOT NULL
        REFERENCES schools(id) ON DELETE CASCADE,
    actor_user_id UUID
        REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_students_school_class
ON students (school_id, class_id);

CREATE INDEX IF NOT EXISTS idx_assignments_teacher_class
ON teacher_assignments (
    school_id,
    teacher_id,
    class_id
);

CREATE INDEX IF NOT EXISTS idx_invites_invitee
ON class_invites (
    school_id,
    invitee_id,
    status
);

CREATE INDEX IF NOT EXISTS idx_grades_class
ON grades (
    school_id,
    class_id,
    student_id
);

CREATE INDEX IF NOT EXISTS idx_sessions_expiry
ON sessions (
    token_hash,
    expires_at
);

CREATE INDEX IF NOT EXISTS idx_audit_school_date
ON audit_log (
    school_id,
    created_at DESC
);
