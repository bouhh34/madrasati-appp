# مدرستي | Ma Madrassa — Production V4

هذه حزمة تشغيل فعلية خفيفة لمنصة مدرسية موريتانية، وليست صورة أو نموذجًا بصريًا.

## ما هو موجود فعليًا
- Backend: Node.js / Fastify.
- Database: PostgreSQL مع Row Level Security للبيانات الأكاديمية.
- حساب جديد يبدأ PENDING وبدون أي صلاحية مدرسية.
- المدير هو محور المدرسة: دعوات مؤقتة، صلاحيات حسب القسم/المادة، وسحب الوصول وإلغاء الجلسات.
- تعدد الأدوار: DIRECTOR / TEACHER / GUARDIAN.
- ولي التلميذ يرى التلاميذ المرتبطين به فقط.
- Argon2id + Pepper، جلسات عشوائية HttpOnly/Secure/SameSite، CSRF، Origin checks، Rate limiting وCSP.
- الدرجة مرتبطة بالمدرسة+القسم+التلميذ+المادة بمفاتيح مركبة تمنع خلط مدارس مختلفة.
- Optimistic concurrency للدرجات وسجل grade_history.
- Audit log متسلسل بـ HMAC لكشف العبث.
- واجهة عربية/فرنسية خفيفة بدون framework ضخم، وحجم shell الأمامي قرابة 58KB قبل الصور.
- PWA قابلة للتثبيت؛ Service Worker لا يخزن أي /api أو بيانات تلاميذ.
- رأسية رسمية للمدارس العمومية، ورأسية خاصة للمدارس الخصوصية. الصور يعاد ترميزها وتنظيف metadata قبل الاعتماد.
- PDF/DOCX لا يُعرضان مباشرة: يدخلان quarantine بانتظار محول معقم، حمايةً من رفع الملفات الخبيثة.
- اختبارات أمن/معمارية/حسابات، واختبار PostgreSQL RLS حقيقي مجهز للعمل في GitHub Actions.

## حدود يجب عدم إخفائها
هذه النسخة Release Candidate قوية، لكنها ليست ادعاءً بأن الاختراق مستحيل. قبل إطلاق واسع لآلاف المدارس يجب إضافة/تشغيل: MFA/Passkeys للمدير، قناة بريد/SMS موثوقة لاسترجاع الحساب، worker معقم لتحويل PDF/DOCX، نسخ احتياطي مع اختبار Restore، مراقبة/تنبيهات إنتاجية، واختبار اختراق خارجي مستقل.

## التشغيل
1. أنشئ PostgreSQL 16.
2. انسخ `backend/.env.example` إلى متغيرات البيئة ولا تضع الأسرار في GitHub.
3. ولّد الأسرار: `node scripts/generate-secrets.mjs`.
4. داخل `backend`: `npm install` ثم `npm run migrate` ثم `npm test` ثم `npm start`.
5. أول مدرسة ومدير يُنشآن عبر `/api/setup/bootstrap` مع ترويسة `x-bootstrap-secret`، ثم يفضّل تعطيل/تدوير BOOTSTRAP_SECRET بعد التهيئة.

## Android
الويب الحالي PWA خفيف ويمكن تثبيته من الهاتف. النسخة Android النهائية يفضّل أن تكون Trusted Web Activity بعد تثبيت الدومين النهائي وDigital Asset Links وتوقيع Release؛ لا ينبغي وضع أسرار الخادم داخل APK.
