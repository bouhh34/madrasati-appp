CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true),'')::uuid
$$;

CREATE OR REPLACE FUNCTION app.current_school_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.school_id', true),'')::uuid
$$;

CREATE OR REPLACE FUNCTION app.has_role(p_role text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS(
    SELECT 1
    FROM school_memberships sm
    JOIN membership_roles mr
      ON mr.school_id=sm.school_id AND mr.user_id=sm.user_id
    WHERE sm.school_id=app.current_school_id()
      AND sm.user_id=app.current_user_id()
      AND sm.status='ACTIVE'
      AND mr.role=p_role
  )
$$;

CREATE OR REPLACE FUNCTION app.has_permission(
  p_permission text,
  p_class uuid DEFAULT NULL,
  p_subject uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT app.has_role('DIRECTOR') OR EXISTS(
    SELECT 1
    FROM permission_grants pg
    WHERE pg.school_id=app.current_school_id()
      AND pg.user_id=app.current_user_id()
      AND pg.permission=p_permission
      AND pg.revoked_at IS NULL
      AND pg.starts_at <= now()
      AND (pg.ends_at IS NULL OR pg.ends_at > now())
      AND (pg.class_id IS NULL OR pg.class_id=p_class)
      AND (pg.subject_id IS NULL OR pg.subject_id=p_subject)
  )
$$;


CREATE OR REPLACE FUNCTION app.has_class_permission(p_permission text,p_class uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT app.has_role('DIRECTOR') OR EXISTS(
    SELECT 1 FROM permission_grants pg
    WHERE pg.school_id=app.current_school_id()
      AND pg.user_id=app.current_user_id()
      AND pg.permission=p_permission
      AND pg.revoked_at IS NULL
      AND pg.starts_at <= now()
      AND (pg.ends_at IS NULL OR pg.ends_at > now())
      AND (pg.class_id IS NULL OR pg.class_id=p_class)
  )
$$;

CREATE OR REPLACE FUNCTION app.has_subject_permission(p_permission text,p_subject uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT app.has_role('DIRECTOR') OR EXISTS(
    SELECT 1 FROM permission_grants pg
    WHERE pg.school_id=app.current_school_id()
      AND pg.user_id=app.current_user_id()
      AND pg.permission=p_permission
      AND pg.revoked_at IS NULL
      AND pg.starts_at <= now()
      AND (pg.ends_at IS NULL OR pg.ends_at > now())
      AND (pg.subject_id IS NULL OR pg.subject_id=p_subject)
  )
$$;

CREATE OR REPLACE FUNCTION app.is_guardian_of(p_student uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS(
    SELECT 1
    FROM guardian_student_links gsl
    WHERE gsl.school_id=app.current_school_id()
      AND gsl.guardian_user_id=app.current_user_id()
      AND gsl.student_id=p_student
      AND gsl.active=true
  )
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'classes','subjects','students','grades','grade_history',
    'guardian_student_links','school_settings','school_branding',
    'branding_uploads','audit_log','in_app_notifications'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS classes_select ON classes;
CREATE POLICY classes_select ON classes FOR SELECT USING (
  school_id=app.current_school_id() AND (
    app.has_role('DIRECTOR') OR
    app.has_class_permission('CLASS_READ',id) OR
    app.has_class_permission('STUDENT_READ',id) OR
    app.has_class_permission('GRADE_READ',id) OR
    app.has_class_permission('GRADE_WRITE',id) OR
    EXISTS(
      SELECT 1 FROM students s
      WHERE s.class_id=classes.id
        AND s.school_id=classes.school_id
        AND app.is_guardian_of(s.id)
    )
  )
);
DROP POLICY IF EXISTS classes_write ON classes;
CREATE POLICY classes_write ON classes FOR ALL
USING (school_id=app.current_school_id() AND app.has_role('DIRECTOR'))
WITH CHECK (school_id=app.current_school_id() AND app.has_role('DIRECTOR'));

DROP POLICY IF EXISTS subjects_select ON subjects;
CREATE POLICY subjects_select ON subjects FOR SELECT USING (
  school_id=app.current_school_id() AND (
    app.has_role('DIRECTOR') OR
    app.has_subject_permission('SUBJECT_READ',id) OR
    app.has_subject_permission('GRADE_READ',id) OR
    app.has_subject_permission('GRADE_WRITE',id) OR
    EXISTS(
      SELECT 1 FROM grades g
      WHERE g.subject_id=subjects.id
        AND g.school_id=subjects.school_id
        AND app.is_guardian_of(g.student_id)
    )
  )
);
DROP POLICY IF EXISTS subjects_write ON subjects;
CREATE POLICY subjects_write ON subjects FOR ALL
USING (school_id=app.current_school_id() AND app.has_role('DIRECTOR'))
WITH CHECK (school_id=app.current_school_id() AND app.has_role('DIRECTOR'));

DROP POLICY IF EXISTS students_select ON students;
CREATE POLICY students_select ON students FOR SELECT USING (
  school_id=app.current_school_id() AND (
    app.has_role('DIRECTOR') OR
    app.has_class_permission('STUDENT_READ',class_id) OR
    app.has_class_permission('GRADE_READ',class_id) OR
    app.has_class_permission('GRADE_WRITE',class_id) OR
    app.is_guardian_of(id)
  )
);
DROP POLICY IF EXISTS students_insert ON students;
CREATE POLICY students_insert ON students FOR INSERT WITH CHECK (
  school_id=app.current_school_id() AND (
    app.has_role('DIRECTOR') OR app.has_permission('STUDENT_WRITE',class_id,NULL)
  )
);
DROP POLICY IF EXISTS students_update ON students;
CREATE POLICY students_update ON students FOR UPDATE
USING (
  school_id=app.current_school_id() AND (
    app.has_role('DIRECTOR') OR app.has_permission('STUDENT_WRITE',class_id,NULL)
  )
)
WITH CHECK (
  school_id=app.current_school_id() AND (
    app.has_role('DIRECTOR') OR app.has_permission('STUDENT_WRITE',class_id,NULL)
  )
);

DROP POLICY IF EXISTS grades_select ON grades;
CREATE POLICY grades_select ON grades FOR SELECT USING (
  school_id=app.current_school_id() AND (
    app.has_role('DIRECTOR') OR
    app.has_permission('GRADE_READ',class_id,subject_id) OR
    app.has_permission('GRADE_WRITE',class_id,subject_id) OR
    app.is_guardian_of(student_id)
  )
);
DROP POLICY IF EXISTS grades_insert ON grades;
CREATE POLICY grades_insert ON grades FOR INSERT WITH CHECK (
  school_id=app.current_school_id() AND (
    app.has_role('DIRECTOR') OR app.has_permission('GRADE_WRITE',class_id,subject_id)
  )
);
DROP POLICY IF EXISTS grades_update ON grades;
CREATE POLICY grades_update ON grades FOR UPDATE
USING (
  school_id=app.current_school_id() AND (
    app.has_role('DIRECTOR') OR app.has_permission('GRADE_WRITE',class_id,subject_id)
  )
)
WITH CHECK (
  school_id=app.current_school_id() AND (
    app.has_role('DIRECTOR') OR app.has_permission('GRADE_WRITE',class_id,subject_id)
  )
);

DROP POLICY IF EXISTS grade_history_select ON grade_history;
CREATE POLICY grade_history_select ON grade_history FOR SELECT USING (
  school_id=app.current_school_id() AND (
    app.has_role('DIRECTOR') OR EXISTS(
      SELECT 1 FROM grades g
      WHERE g.id=grade_history.grade_id
        AND (
          app.has_permission('GRADE_READ',g.class_id,g.subject_id) OR
          app.has_permission('GRADE_WRITE',g.class_id,g.subject_id) OR
          app.is_guardian_of(g.student_id)
        )
    )
  )
);
DROP POLICY IF EXISTS grade_history_insert ON grade_history;
CREATE POLICY grade_history_insert ON grade_history FOR INSERT WITH CHECK (
  school_id=app.current_school_id() AND EXISTS(
    SELECT 1 FROM grades g
    WHERE g.id=grade_history.grade_id
      AND (
        app.has_role('DIRECTOR') OR app.has_permission('GRADE_WRITE',g.class_id,g.subject_id)
      )
  )
);

DROP POLICY IF EXISTS guardian_links_select ON guardian_student_links;
CREATE POLICY guardian_links_select ON guardian_student_links FOR SELECT USING (
  school_id=app.current_school_id() AND (
    app.has_role('DIRECTOR') OR guardian_user_id=app.current_user_id()
  )
);
DROP POLICY IF EXISTS guardian_links_write ON guardian_student_links;
CREATE POLICY guardian_links_write ON guardian_student_links FOR ALL
USING (
  school_id=app.current_school_id() AND (
    app.has_role('DIRECTOR') OR (
      guardian_user_id=app.current_user_id() AND EXISTS(
        SELECT 1 FROM access_invites ai
        WHERE ai.id=NULLIF(current_setting('app.invite_id',true),'')::uuid
          AND ai.school_id=guardian_student_links.school_id
          AND ai.role='GUARDIAN'
          AND ai.revoked_at IS NULL
          AND ai.expires_at>now()
          AND ai.student_ids ? guardian_student_links.student_id::text
      )
    )
  )
)
WITH CHECK (
  school_id=app.current_school_id() AND (
    app.has_role('DIRECTOR') OR (
      guardian_user_id=app.current_user_id() AND EXISTS(
        SELECT 1 FROM access_invites ai
        WHERE ai.id=NULLIF(current_setting('app.invite_id',true),'')::uuid
          AND ai.school_id=guardian_student_links.school_id
          AND ai.role='GUARDIAN'
          AND ai.revoked_at IS NULL
          AND ai.expires_at>now()
          AND ai.student_ids ? guardian_student_links.student_id::text
      )
    )
  )
);

DROP POLICY IF EXISTS school_settings_select ON school_settings;
CREATE POLICY school_settings_select ON school_settings FOR SELECT
USING (school_id=app.current_school_id());
DROP POLICY IF EXISTS school_settings_write ON school_settings;
CREATE POLICY school_settings_write ON school_settings FOR ALL
USING (school_id=app.current_school_id() AND app.has_role('DIRECTOR'))
WITH CHECK (school_id=app.current_school_id() AND app.has_role('DIRECTOR'));

DROP POLICY IF EXISTS branding_select ON school_branding;
CREATE POLICY branding_select ON school_branding FOR SELECT
USING (school_id=app.current_school_id());
DROP POLICY IF EXISTS branding_write ON school_branding;
CREATE POLICY branding_write ON school_branding FOR ALL
USING (school_id=app.current_school_id() AND app.has_role('DIRECTOR'))
WITH CHECK (school_id=app.current_school_id() AND app.has_role('DIRECTOR'));

DROP POLICY IF EXISTS branding_uploads_select ON branding_uploads;
CREATE POLICY branding_uploads_select ON branding_uploads FOR SELECT
USING (school_id=app.current_school_id() AND app.has_role('DIRECTOR'));
DROP POLICY IF EXISTS branding_uploads_write ON branding_uploads;
CREATE POLICY branding_uploads_write ON branding_uploads FOR ALL
USING (school_id=app.current_school_id() AND app.has_role('DIRECTOR'))
WITH CHECK (school_id=app.current_school_id() AND app.has_role('DIRECTOR'));

DROP POLICY IF EXISTS audit_select ON audit_log;
CREATE POLICY audit_select ON audit_log FOR SELECT USING (
  school_id=app.current_school_id() AND app.has_role('DIRECTOR')
);
DROP POLICY IF EXISTS audit_insert ON audit_log;
CREATE POLICY audit_insert ON audit_log FOR INSERT WITH CHECK (
  school_id IS NULL OR school_id=app.current_school_id()
);

DROP POLICY IF EXISTS notifications_select ON in_app_notifications;
CREATE POLICY notifications_select ON in_app_notifications FOR SELECT USING (
  user_id=app.current_user_id() AND (
    school_id IS NULL OR school_id=app.current_school_id()
  )
);
DROP POLICY IF EXISTS notifications_update ON in_app_notifications;
CREATE POLICY notifications_update ON in_app_notifications FOR UPDATE
USING (
  user_id=app.current_user_id() AND (
    school_id IS NULL OR school_id=app.current_school_id()
  )
)
WITH CHECK (
  user_id=app.current_user_id() AND (
    school_id IS NULL OR school_id=app.current_school_id()
  )
);
DROP POLICY IF EXISTS notifications_insert ON in_app_notifications;
CREATE POLICY notifications_insert ON in_app_notifications FOR INSERT WITH CHECK (
  school_id IS NULL OR school_id=app.current_school_id()
);
