# نموذج الحماية المختصر

الحماية مبنية بطبقات متراكبة:
1. الهوية: حساب بلا صلاحيات افتراضيًا.
2. المصادقة: Argon2id + pepper وسلوك دخول موحد ضد enumeration قدر الإمكان.
3. الجلسة: token عشوائي، hash في DB، HttpOnly/Secure/SameSite، idle + absolute expiry، security_version وسحب الجلسات.
4. الطلبات: CSRF + Origin + Rate Limit + CSP + no-store للـAPI.
5. الصلاحيات: roles متعددة + permission grants بنطاق class/subject.
6. العزل: school_id على البيانات + PostgreSQL RLS/FORCE RLS للبيانات الأكاديمية.
7. التكامل: composite foreign keys تمنع ربط طالب/مادة/قسم من مدرسة أخرى بدرجة المدرسة الحالية.
8. الدرجات: max_score validation + optimistic concurrency + grade history.
9. التدقيق: HMAC hash chain في audit_log.
10. الملفات: الصور تُفك وتُعاد ترميزها؛ PDF/DOCX quarantine ولا تُعرض مباشرة.
11. الهاتف: لا localStorage/sessionStorage/IndexedDB للبيانات المدرسية ولا cache للـAPI.
12. CI: syntax + unit + architecture + PostgreSQL RLS integration + npm audit.
