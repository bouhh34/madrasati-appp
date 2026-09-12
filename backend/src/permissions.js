export function hasRole(auth, role) {
  return Array.isArray(auth?.roles) && auth.roles.includes(role);
}

export function requireSchool(auth) {
  return !!auth?.schoolId;
}

export const PERMISSIONS = [
  "CLASS_READ",
  "STUDENT_READ",
  "STUDENT_WRITE",
  "SUBJECT_READ",
  "GRADE_READ",
  "GRADE_WRITE",
  "REPORT_READ",
  "ATTENDANCE_READ",
  "ATTENDANCE_WRITE",
  "EXAM_READ",
  "EXAM_WRITE",
  "DOCUMENT_READ",
  "DOCUMENT_WRITE"
];
