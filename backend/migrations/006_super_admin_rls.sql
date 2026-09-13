CREATE OR REPLACE FUNCTION app.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM platform_admins pa
    WHERE pa.user_id = app.current_user_id()
      AND pa.role = 'SUPER_ADMIN'
      AND pa.active = true
  )
$$;

DROP POLICY IF EXISTS school_settings_write
ON school_settings;

CREATE POLICY school_settings_write
ON school_settings
FOR ALL
USING (
  (
    school_id = app.current_school_id()
    AND app.has_role('DIRECTOR')
  )
  OR app.is_super_admin()
)
WITH CHECK (
  (
    school_id = app.current_school_id()
    AND app.has_role('DIRECTOR')
  )
  OR app.is_super_admin()
);
