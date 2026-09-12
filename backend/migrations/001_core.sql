CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  login text NOT NULL UNIQUE,
  email text UNIQUE,
  full_name text NOT NULL,
  password_hash text NOT NULL,
  managed_by_school_id uuid,
  account_state text NOT NULL DEFAULT 'PENDING'
    CHECK (account_state IN ('PENDING','ACTIVE','LOCKED','DISABLED')),
  security_version integer NOT NULL DEFAULT 1 CHECK (security_version > 0),
  failed_login_count integer NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  school_type text NOT NULL CHECK (school_type IN ('PUBLIC','PRIVATE')),
  wilaya text,
  moughataa text,
  inspection text,
  academic_year text NOT NULL,
  locale text NOT NULL DEFAULT 'ar' CHECK (locale IN ('ar','fr')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id)
);

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_managed_school_fk;
ALTER TABLE users ADD CONSTRAINT users_managed_school_fk FOREIGN KEY (managed_by_school_id) REFERENCES schools(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS school_settings (
  school_id uuid PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
  grading_scale numeric(8,2) NOT NULL DEFAULT 20 CHECK (grading_scale > 0),
  annual_weight_t1 numeric(8,2) NOT NULL DEFAULT 1 CHECK (annual_weight_t1 > 0),
  annual_weight_t2 numeric(8,2) NOT NULL DEFAULT 2 CHECK (annual_weight_t2 > 0),
  annual_weight_t3 numeric(8,2) NOT NULL DEFAULT 3 CHECK (annual_weight_t3 > 0),
  require_director_approval_for_accounts boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS school_memberships (
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('PENDING','ACTIVE','SUSPENDED','REVOKED')),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  PRIMARY KEY (school_id,user_id)
);

CREATE TABLE IF NOT EXISTS membership_roles (
  school_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('DIRECTOR','TEACHER','GUARDIAN')),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id,user_id,role),
  FOREIGN KEY (school_id,user_id)
    REFERENCES school_memberships(school_id,user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  level text,
  section text,
  active boolean NOT NULL DEFAULT true,
  row_version integer NOT NULL DEFAULT 1 CHECK (row_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,name),
  UNIQUE (id,school_id)
);

CREATE TABLE IF NOT EXISTS subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  coefficient numeric(8,2) NOT NULL DEFAULT 1 CHECK (coefficient > 0),
  max_score numeric(8,2) NOT NULL DEFAULT 20 CHECK (max_score > 0),
  active boolean NOT NULL DEFAULT true,
  row_version integer NOT NULL DEFAULT 1 CHECK (row_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,name),
  UNIQUE (id,school_id)
);

CREATE TABLE IF NOT EXISTS students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  class_id uuid NOT NULL,
  student_uid text NOT NULL,
  full_name text NOT NULL,
  gender text CHECK (gender IN ('M','F') OR gender IS NULL),
  birth_date date,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE','INACTIVE','TRANSFERRED')),
  row_version integer NOT NULL DEFAULT 1 CHECK (row_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,student_uid),
  UNIQUE (id,school_id,class_id),
  FOREIGN KEY (class_id,school_id)
    REFERENCES classes(id,school_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS permission_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission text NOT NULL CHECK (permission IN (
    'CLASS_READ','STUDENT_READ','STUDENT_WRITE','SUBJECT_READ',
    'GRADE_READ','GRADE_WRITE','REPORT_READ'
  )),
  class_id uuid,
  subject_id uuid,
  granted_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at > starts_at),
  FOREIGN KEY (class_id,school_id) REFERENCES classes(id,school_id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id,school_id) REFERENCES subjects(id,school_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_perm_user
  ON permission_grants(school_id,user_id,permission,revoked_at);
CREATE INDEX IF NOT EXISTS idx_perm_scope
  ON permission_grants(school_id,class_id,subject_id,user_id);

CREATE TABLE IF NOT EXISTS guardian_student_links (
  school_id uuid NOT NULL,
  guardian_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  class_id uuid NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guardian_user_id,student_id),
  FOREIGN KEY (student_id,school_id,class_id)
    REFERENCES students(id,school_id,class_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_guardian_school
  ON guardian_student_links(school_id,guardian_user_id,active);

CREATE TABLE IF NOT EXISTS access_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  code_hash text NOT NULL UNIQUE,
  target_login text,
  target_email text,
  invite_kind text NOT NULL CHECK (invite_kind IN ('TEACHER','GUARDIAN','DIRECTOR')),
  role text NOT NULL CHECK (role IN ('DIRECTOR','TEACHER','GUARDIAN')),
  class_id uuid,
  subject_id uuid,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  student_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  expires_at timestamptz NOT NULL,
  max_uses integer NOT NULL DEFAULT 1 CHECK (max_uses BETWEEN 1 AND 5),
  used_count integer NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  revoked_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  CHECK (expires_at > created_at),
  CHECK (used_count <= max_uses),
  FOREIGN KEY (class_id,school_id) REFERENCES classes(id,school_id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id,school_id) REFERENCES subjects(id,school_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_invites_hash ON access_invites(code_hash);
CREATE INDEX IF NOT EXISTS idx_invites_school_expiry ON access_invites(school_id,expires_at);

CREATE TABLE IF NOT EXISTS grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  class_id uuid NOT NULL,
  student_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  term text NOT NULL CHECK (term IN ('T1','T2','T3')),
  assessment text NOT NULL DEFAULT 'MAIN',
  score numeric(8,2) NOT NULL CHECK (score >= 0),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id,subject_id,term,assessment),
  FOREIGN KEY (class_id,school_id) REFERENCES classes(id,school_id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id,school_id) REFERENCES subjects(id,school_id) ON DELETE CASCADE,
  FOREIGN KEY (student_id,school_id,class_id)
    REFERENCES students(id,school_id,class_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_grades_scope
  ON grades(school_id,class_id,student_id,subject_id,term);

CREATE TABLE IF NOT EXISTS grade_history (
  id bigserial PRIMARY KEY,
  grade_id uuid NOT NULL REFERENCES grades(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  old_score numeric(8,2),
  new_score numeric(8,2) NOT NULL,
  old_version integer,
  new_version integer NOT NULL,
  changed_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_grade_history_grade ON grade_history(grade_id,changed_at DESC);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  csrf_hash text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  active_school_id uuid REFERENCES schools(id) ON DELETE SET NULL,
  security_version integer NOT NULL,
  expires_at timestamptz NOT NULL,
  idle_expires_at timestamptz NOT NULL,
  step_up_until timestamptz,
  user_agent_hash text,
  ip_hash text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sessions_lookup
  ON sessions(token_hash,expires_at,idle_expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user
  ON sessions(user_id,revoked_at,expires_at);

CREATE TABLE IF NOT EXISTS password_reset_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS idx_password_reset_user
  ON password_reset_requests(user_id,expires_at);

CREATE TABLE IF NOT EXISTS school_branding (
  school_id uuid PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'DEFAULT' CHECK (mode IN ('DEFAULT','CUSTOM')),
  sanitized_header_mime text,
  sanitized_header_bytes bytea,
  source_type text,
  source_sha256 text,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS branding_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  source_mime text NOT NULL,
  source_name text NOT NULL,
  source_sha256 text NOT NULL,
  source_size integer NOT NULL CHECK (source_size > 0),
  source_bytes bytea,
  state text NOT NULL DEFAULT 'QUARANTINED'
    CHECK (state IN ('QUARANTINED','SANITIZED','REJECTED')),
  rejection_reason text,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_branding_uploads_school
  ON branding_uploads(school_id,created_at DESC);

CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY,
  school_id uuid REFERENCES schools(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  metadata_json text NOT NULL DEFAULT '{}',
  previous_hash text,
  event_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_school_time
  ON audit_log(school_id,created_at DESC);

CREATE TABLE IF NOT EXISTS passkey_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id text NOT NULL UNIQUE,
  public_key bytea NOT NULL,
  counter bigint NOT NULL DEFAULT 0,
  transports text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE TABLE IF NOT EXISTS school_subscriptions (
  school_id uuid PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'TRIAL' CHECK (plan IN ('TRIAL','BASIC','PRO','ENTERPRISE')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAST_DUE','SUSPENDED','CANCELLED')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  seat_limit integer,
  student_limit integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS in_app_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES schools(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user
  ON in_app_notifications(user_id,read_at,created_at DESC);
