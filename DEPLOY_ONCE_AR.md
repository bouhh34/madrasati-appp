# خطة الرفع مرة واحدة

الهدف أن يكون هذا آخر رفع يدوي كبير للمشروع، ثم تصبح التحديثات عبر Git/CI وليس تعديل الملفات واحدًا واحدًا من الهاتف.

1. احتفظ بنسخة/Tag من المشروع القديم للرجوع فقط، ولا تخلطه مع V4.
2. استبدل محتوى المستودع بمحتوى مجلد `MaMadrassa_Production_V4` كاملًا.
3. في Render اجعل Root Directory = `backend`.
4. Build Command = `npm install --no-fund && npm run migrate && npm test`.
5. Start Command = `npm start`.
6. Health Check = `/api/ready`.
7. اضبط الأسرار من لوحة Render فقط: DATABASE_URL, APP_ORIGIN, PASSWORD_PEPPER, AUDIT_HMAC_KEY, BOOTSTRAP_SECRET.
8. لا تنقل أي كلمة سر أو secret إلى GitHub.
9. بعد نجاح النشر، نفذ bootstrap مرة واحدة لإنشاء أول مدرسة/مدير.
10. اختبر: مدرسة A لا ترى B، معلم مادة لا يكتب مادة أخرى، ولي لا يرى طفلًا غير مرتبط به، سحب المستخدم يلغي الجلسة، تعارض الدرجة يعطي VERSION_CONFLICT.
11. بعد ذلك ثبّت دومينًا نهائيًا ثم أنشئ Android TWA موقّعًا.
