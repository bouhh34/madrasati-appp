import crypto from "crypto";
import QRCode from "qrcode";
import zlib from "zlib";
import { withContext } from "../db.js";
import { config } from "../config.js";
import { audit } from "../audit.js";
import { buildStudentReport } from "../services/reports.js";
import { isUuid } from "../validators.js";

const REPORT_KEY=crypto
  .createHash("sha256")
  .update(`${config.auditHmacKey}|ma-madrassa-report-verification-v1`)
  .digest();

function seal(payload){
  const iv=crypto.randomBytes(12);

  const packed=zlib.deflateRawSync(
    Buffer.from(JSON.stringify(payload),"utf8")
  );

  const cipher=crypto.createCipheriv(
    "aes-256-gcm",
    REPORT_KEY,
    iv
  );

  const encrypted=Buffer.concat([
    cipher.update(packed),
    cipher.final()
  ]);

  const tag=cipher.getAuthTag();

  return Buffer.concat([
    Buffer.from([1]),
    iv,
    tag,
    encrypted
  ]).toString("base64url");
}

function unseal(token){
  const raw=Buffer.from(String(token||""),"base64url");

  if(raw.length<30||raw[0]!==1){
    throw new Error("INVALID_TOKEN");
  }

  const iv=raw.subarray(1,13);
  const tag=raw.subarray(13,29);
  const encrypted=raw.subarray(29);

  const decipher=crypto.createDecipheriv(
    "aes-256-gcm",
    REPORT_KEY,
    iv
  );

  decipher.setAuthTag(tag);

  const packed=Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]);

  return JSON.parse(
    zlib.inflateRawSync(packed).toString("utf8")
  );
}

function verificationCode(token){
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex")
    .slice(0,12)
    .toUpperCase();
}

function esc(value){
  return String(value??"")
    .replace(/[&<>"']/g,c=>({
      "&":"&amp;",
      "<":"&lt;",
      ">":"&gt;",
      '"':"&quot;",
      "'":"&#39;"
    }[c]));
}

export async function registerReportVerifyRoutes(
  app,
  {requireMutation}
){

  app.post(
    "/api/reports/:studentId/verification",
    async(request,reply)=>{

      if(!(await requireMutation(request,reply))) return;

      const studentId=String(
        request.params?.studentId||""
      );

      if(
        !request.auth?.schoolId||
        !isUuid(studentId)
      ){
        return reply.code(400).send({
          error:"INVALID_STUDENT"
        });
      }

      return withContext(
        {
          userId:request.auth.userId,
          schoolId:request.auth.schoolId
        },
        async c=>{

          const sq=await c.query(
            `
            SELECT
              s.id,
              s.student_uid,
              s.full_name,
              s.gender,
              s.class_id,
              c.name AS class_name
            FROM students s
            JOIN classes c
              ON c.id=s.class_id
            WHERE s.id=$1
            `,
            [studentId]
          );

          const student=sq.rows[0];

          if(!student){
            return reply.code(404).send({
              error:"STUDENT_NOT_FOUND"
            });
          }

          const subjects=(
            await c.query(
              `
              SELECT DISTINCT
                sub.id,
                sub.name,
                sub.coefficient,
                sub.max_score
              FROM subjects sub
              JOIN grades g
                ON g.subject_id=sub.id
              WHERE g.student_id=$1
              ORDER BY sub.name
              `,
              [studentId]
            )
          ).rows;

          const grades=(
            await c.query(
              `
              SELECT
                student_id,
                subject_id,
                term,
                assessment,
                score
              FROM grades
              WHERE student_id=$1
              ORDER BY subject_id,term,assessment
              `,
              [studentId]
            )
          ).rows;

          const settings=(
            await c.query(
              `
              SELECT
                annual_weight_t1,
                annual_weight_t2,
                annual_weight_t3
              FROM school_settings
              WHERE school_id=$1
              `,
              [request.auth.schoolId]
            )
          ).rows[0]||{};

          const school=(
            await c.query(
              `
              SELECT
                id,
                name,
                academic_year,
                wilaya,
                moughataa,
                inspection
              FROM schools
              WHERE id=$1
              `,
              [request.auth.schoolId]
            )
          ).rows[0];

          const report=buildStudentReport({
            subjects,
            grades,
            weights:{
              T1:Number(
                settings.annual_weight_t1||1
              ),
              T2:Number(
                settings.annual_weight_t2||2
              ),
              T3:Number(
                settings.annual_weight_t3||3
              )
            }
          });

          const snapshot={
            version:1,
            issuedAt:new Date().toISOString(),

            school:{
              name:school?.name||"",
              academicYear:
                school?.academic_year||"",
              wilaya:school?.wilaya||"",
              moughataa:
                school?.moughataa||"",
              inspection:
                school?.inspection||""
            },

            student:{
              fullName:student.full_name,
              studentUid:
                student.student_uid,
              className:
                student.class_name
            },

            report
          };

          const token=seal(snapshot);
          const code=verificationCode(token);

          const url=
            `${config.appOrigin}/verify/report/${token}`;
const qrDataUrl=await QRCode.toDataURL(url,{
  errorCorrectionLevel:"L",
  width:220,
  margin:1
});
          await audit(
            c,
            request.auth,
            "REPORT_VERIFICATION_ISSUED",
            "student",
            studentId,
            {code}
          );

          return {
  ok:true,
  code,
  url,
  qrDataUrl
};
          };
        }
      );
    }
  );


  app.get(
    "/verify/report/:token",
    {
      config:{
        rateLimit:{
          max:60,
          timeWindow:"1 minute"
        }
      }
    },
    async(request,reply)=>{

      try{
        const token=String(
          request.params?.token||""
        );

        if(
          token.length<30||
          token.length>12000
        ){
          throw new Error(
            "INVALID_TOKEN"
          );
        }

        const data=unseal(token);
        const code=
          verificationCode(token);

        if(data?.version!==1){
          throw new Error(
            "INVALID_VERSION"
          );
        }

        const subjects=
          data.report?.subjects||[];

        const rows=subjects.map(s=>`
          <tr>
            <td>${esc(s.name)}</td>
            <td>${esc(s.coefficient)}</td>
            <td>${esc(s.terms?.T1??"—")}</td>
            <td>${esc(s.terms?.T2??"—")}</td>
            <td>${esc(s.terms?.T3??"—")}</td>
            <td>${esc(s.annual??"—")}</td>
          </tr>
        `).join("");

        reply.header(
          "Cache-Control",
          "no-store, max-age=0"
        );

        reply.header(
          "Content-Security-Policy",
          "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"
        );

        return reply
          .type("text/html; charset=utf-8")
          .send(`<!doctype html>

<html lang="ar" dir="rtl">

<head>
<meta charset="utf-8">
<meta
 name="viewport"
 content="width=device-width,initial-scale=1"
>

<title>التحقق من كشف النتائج</title>

<style>
body{
 font-family:Arial,Tahoma,sans-serif;
 background:#f4f7f6;
 margin:0;
 padding:20px;
 color:#18201f
}

.card{
 max-width:850px;
 margin:auto;
 background:white;
 padding:24px;
 border-radius:18px;
 box-shadow:0 8px 30px #0001
}

.valid{
 background:#e7f6f1;
 color:#076457;
 padding:14px;
 border-radius:12px;
 text-align:center;
 font-weight:700;
 font-size:18px
}

.code{
 text-align:center;
 font-size:18px;
 font-weight:700;
 letter-spacing:2px;
 margin:16px 0
}

.info{
 display:grid;
 grid-template-columns:1fr 1fr;
 gap:10px;
 margin:20px 0
}

.info div{
 background:#f6faf9;
 padding:10px;
 border-radius:8px
}

table{
 width:100%;
 border-collapse:collapse;
 margin-top:16px
}

th,td{
 border:1px solid #d6dfdd;
 padding:8px;
 text-align:center
}

th{
 background:#edf7f4
}

.avg{
 margin-top:20px;
 font-size:18px;
 text-align:center
}

small{
 opacity:.65
}

@media(max-width:600px){
 .info{
  grid-template-columns:1fr
 }

 th,td{
  padding:5px;
  font-size:11px
 }
}
</style>
</head>

<body>

<div class="card">

<div class="valid">
✓ كشف نتائج موثق من منصة مدرستي
</div>

<div class="code">
رمز التحقق: ${esc(code)}
</div>

<div class="info">

<div>
<b>المدرسة:</b>
${esc(data.school?.name||"—")}
</div>

<div>
<b>السنة الدراسية:</b>
${esc(
 data.school?.academicYear||"—"
)}
</div>

<div>
<b>التلميذ:</b>
${esc(
 data.student?.fullName||"—"
)}
</div>

<div>
<b>رقم التلميذ:</b>
${esc(
 data.student?.studentUid||"—"
)}
</div>

<div>
<b>القسم:</b>
${esc(
 data.student?.className||"—"
)}
</div>

<div>
<b>تاريخ إصدار الكشف:</b>
${esc(
 new Date(
  data.issuedAt
 ).toLocaleString("ar-MR")
)}
</div>

</div>

<table>

<thead>
<tr>
<th>المادة</th>
<th>المعامل</th>
<th>الفصل 1</th>
<th>الفصل 2</th>
<th>الفصل 3</th>
<th>السنوي</th>
</tr>
</thead>

<tbody>
${rows||`
<tr>
<td colspan="6">
لا توجد نتائج
</td>
</tr>
`}
</tbody>

</table>

<div class="avg">
المعدل السنوي:
<b>
${esc(
 data.report?.annualAverage??"—"
)}/20
</b>
</div>

<p style="text-align:center">
<small>
هذه الصفحة ناتجة عن رمز تحقق
مشفّر وموقع من خادم منصة مدرستي.
</small>
</p>

</div>

</body>
</html>`);
      }catch{
        return reply
          .code(400)
          .type(
            "text/html; charset=utf-8"
          )
          .send(`
<!doctype html>
<html lang="ar" dir="rtl">
<meta charset="utf-8">
<meta
 name="viewport"
 content="width=device-width,initial-scale=1"
>
<title>رمز غير صالح</title>
<body
 style="
 font-family:Arial;
 text-align:center;
 padding:40px
 ">
<h2>✕ رمز التحقق غير صالح</h2>
<p>
تعذر التحقق من هذا الكشف.
</p>
</body>
</html>
          `);
      }
    }
  );
     }
