-- Preserve existing IDs and records; the existing school label defines their year.
CREATE TABLE academic_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  name text NOT NULL,
  is_current boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(school_id,name), UNIQUE(id,school_id)
);
CREATE UNIQUE INDEX academic_years_one_current ON academic_years(school_id) WHERE is_current;
INSERT INTO academic_years(school_id,name,is_current) SELECT id,academic_year,true FROM schools;
ALTER TABLE classes ADD COLUMN academic_year_id uuid;
-- The migration runs in a transaction under the table owner, then restores FORCE.
ALTER TABLE classes NO FORCE ROW LEVEL SECURITY;
UPDATE classes c SET academic_year_id=y.id FROM academic_years y WHERE y.school_id=c.school_id AND y.is_current;
ALTER TABLE classes FORCE ROW LEVEL SECURITY;
ALTER TABLE classes ADD CONSTRAINT class_academic_year_fk FOREIGN KEY(academic_year_id,school_id) REFERENCES academic_years(id,school_id) ON DELETE RESTRICT;
ALTER TABLE classes DROP CONSTRAINT classes_school_id_name_key;
CREATE UNIQUE INDEX classes_year_name ON classes(school_id,academic_year_id,name) NULLS NOT DISTINCT;

CREATE TABLE class_subjects (
  school_id uuid NOT NULL,
  class_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  sort_order integer NOT NULL DEFAULT 0 CHECK(sort_order>=0),
  PRIMARY KEY(class_id,subject_id),
  FOREIGN KEY(class_id,school_id) REFERENCES classes(id,school_id) ON DELETE RESTRICT,
  FOREIGN KEY(subject_id,school_id) REFERENCES subjects(id,school_id) ON DELETE RESTRICT
);
-- Preserve the old curriculum: previously every school subject was available.
ALTER TABLE classes NO FORCE ROW LEVEL SECURITY;
ALTER TABLE subjects NO FORCE ROW LEVEL SECURITY;
INSERT INTO class_subjects(school_id,class_id,subject_id)
SELECT c.school_id,c.id,s.id FROM classes c JOIN subjects s ON s.school_id=c.school_id;
ALTER TABLE classes FORCE ROW LEVEL SECURITY;
ALTER TABLE subjects FORCE ROW LEVEL SECURITY;

ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_years FORCE ROW LEVEL SECURITY;
CREATE POLICY years_read ON academic_years FOR SELECT USING(school_id=app.current_school_id() AND app.is_active_member());
CREATE POLICY years_manage ON academic_years FOR ALL USING(school_id=app.current_school_id() AND app.has_role('DIRECTOR')) WITH CHECK(school_id=app.current_school_id() AND app.has_role('DIRECTOR'));
ALTER TABLE class_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_subjects FORCE ROW LEVEL SECURITY;
CREATE POLICY curriculum_read ON class_subjects FOR SELECT USING(school_id=app.current_school_id() AND app.is_active_member());
CREATE POLICY curriculum_manage ON class_subjects FOR ALL USING(school_id=app.current_school_id() AND app.has_role('DIRECTOR')) WITH CHECK(school_id=app.current_school_id() AND app.has_role('DIRECTOR'));
