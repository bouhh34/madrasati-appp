-- 009: Opt-in WhatsApp contacts per pupil. Keep existing students and grades unchanged.
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS guardian_whatsapp_phone text,
  ADD COLUMN IF NOT EXISTS guardian_whatsapp_consent boolean NOT NULL DEFAULT false;
ALTER TABLE students DROP CONSTRAINT IF EXISTS students_guardian_whatsapp_valid;
ALTER TABLE students ADD CONSTRAINT students_guardian_whatsapp_valid
  CHECK (guardian_whatsapp_phone IS NULL OR guardian_whatsapp_phone ~ '^[1-9][0-9]{7,14}$');
ALTER TABLE students DROP CONSTRAINT IF EXISTS students_whatsapp_requires_consent;
ALTER TABLE students ADD CONSTRAINT students_whatsapp_requires_consent
  CHECK (NOT guardian_whatsapp_consent OR guardian_whatsapp_phone IS NOT NULL);
COMMENT ON COLUMN students.guardian_whatsapp_phone IS 'Digits-only international WhatsApp number, optional; shared only to authorized staff after explicit guardian consent';
COMMENT ON COLUMN students.guardian_whatsapp_consent IS 'Guardian opted in to manual school WhatsApp communication; default is false';
