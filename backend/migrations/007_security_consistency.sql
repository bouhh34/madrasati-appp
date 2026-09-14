-- Additive migration. Never removes a school, user or academic record.
ALTER TABLE schools ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE OR REPLACE FUNCTION app.is_active_member() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM school_memberships sm JOIN schools s ON s.id=sm.school_id
    JOIN users u ON u.id=sm.user_id
    WHERE sm.school_id=app.current_school_id() AND sm.user_id=app.current_user_id()
      AND sm.status='ACTIVE' AND s.active AND s.archived_at IS NULL
      AND u.account_state NOT IN ('DISABLED','LOCKED')
  )
$$;

CREATE OR REPLACE FUNCTION app.has_role(p_role text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT app.is_active_member() AND EXISTS (
    SELECT 1 FROM membership_roles mr WHERE mr.school_id=app.current_school_id()
      AND mr.user_id=app.current_user_id() AND mr.role=p_role
  )
$$;

CREATE OR REPLACE FUNCTION app.has_permission(p_permission text,p_class uuid DEFAULT NULL,p_subject uuid DEFAULT NULL) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT app.is_active_member() AND (app.has_role('DIRECTOR') OR EXISTS (
    SELECT 1 FROM permission_grants pg WHERE pg.school_id=app.current_school_id()
      AND pg.user_id=app.current_user_id() AND pg.permission=p_permission
      AND pg.revoked_at IS NULL AND pg.starts_at<=now() AND (pg.ends_at IS NULL OR pg.ends_at>now())
      AND (pg.class_id IS NULL OR pg.class_id=p_class)
      AND (pg.subject_id IS NULL OR pg.subject_id=p_subject)
  ))
$$;

CREATE OR REPLACE FUNCTION app.has_class_permission(p_permission text,p_class uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT app.is_active_member() AND (app.has_role('DIRECTOR') OR EXISTS (
    SELECT 1 FROM permission_grants pg WHERE pg.school_id=app.current_school_id()
      AND pg.user_id=app.current_user_id() AND pg.permission=p_permission
      AND pg.revoked_at IS NULL AND pg.starts_at<=now() AND (pg.ends_at IS NULL OR pg.ends_at>now())
      AND (pg.class_id IS NULL OR pg.class_id=p_class)
  ))
$$;

CREATE OR REPLACE FUNCTION app.has_subject_permission(p_permission text,p_subject uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT app.is_active_member() AND (app.has_role('DIRECTOR') OR EXISTS (
    SELECT 1 FROM permission_grants pg WHERE pg.school_id=app.current_school_id()
      AND pg.user_id=app.current_user_id() AND pg.permission=p_permission
      AND pg.revoked_at IS NULL AND pg.starts_at<=now() AND (pg.ends_at IS NULL OR pg.ends_at>now())
      AND (pg.subject_id IS NULL OR pg.subject_id=p_subject)
  ))
$$;

-- Platform statistics are visible only in an explicitly authenticated platform context.
CREATE POLICY classes_platform_read ON classes FOR SELECT USING (app.is_super_admin());
CREATE POLICY students_platform_read ON students FOR SELECT USING (app.is_super_admin());

-- Server-side teacher writes need the previous hash. HTTP audit reads remain director-only.
CREATE POLICY audit_chain_read ON audit_log FOR SELECT USING (
  school_id=app.current_school_id() AND app.is_active_member()
);
-- The HTTP audit route remains director-only. The application never exposes raw SQL.

CREATE INDEX IF NOT EXISTS idx_students_school_class_status ON students(school_id,class_id,status,full_name);
CREATE INDEX IF NOT EXISTS idx_membership_user_active ON school_memberships(user_id,status,school_id);
