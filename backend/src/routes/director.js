import crypto from "node:crypto";
function normalizeGuardianPhone(input){
  if(input===undefined||input===null||String(input).trim()==="")return null;
  const raw=String(input).trim().replace(/[\s\-().]/g,"");
  if(!/^\+?\d{8,15}$/.test(raw))return undefined;
  const digits=raw.replace(/^\+/,"");
  const normalized=digits.length===8?"222"+digits:digits;
  return /^[1-9]\d{7,14}$/.test(normalized)?normalized:undefined;
}
import {currentYear} from "./structure.js";
import { pool,withContext } from "../db.js";
import { audit } from "../audit.js";
import { hashPassword,normalizeLogin,normalizeEmail,validPassword,randomToken,tokenHash } from "../security.js";
import { PERMISSIONS } from "../permissions.js";
import { isUuid,text,optionalText,num,oneOf,stringArray,uuidArray } from "../validators.js";

export async function registerDirectorRoutes(app,{requireDirector}){
  app.get("/api/director/overview",async(request,reply)=>{if(!(await requireDirector(request,reply,false,"GET")))return;const scoped=await withContext({userId:request.auth.userId,schoolId:request.auth.schoolId},async c=>{const [classes,students,subjects]=await Promise.all([c.query("SELECT count(*)::int n FROM classes WHERE active"),c.query("SELECT count(*)::int n FROM students WHERE status='ACTIVE'"),c.query("SELECT count(*)::int n FROM subjects WHERE active")]);return{classes:classes.rows[0].n,students:students.rows[0].n,subjects:subjects.rows[0].n};});const users=(await pool.query("SELECT count(*)::int n FROM school_memberships WHERE school_id=$1 AND status='ACTIVE'",[request.auth.schoolId])).rows[0].n;return{...scoped,users};});

  app.get("/api/director/users",async(request,reply)=>{if(!(await requireDirector(request,reply,false,"GET")))return;const q=await pool.query(`SELECT u.id,u.login,u.email,u.full_name,u.account_state,sm.status,sm.created_at,COALESCE(array_agg(mr.role ORDER BY mr.role) FILTER(WHERE mr.role IS NOT NULL),'{}') roles FROM school_memberships sm JOIN users u ON u.id=sm.user_id LEFT JOIN membership_roles mr ON mr.school_id=sm.school_id AND mr.user_id=sm.user_id WHERE sm.school_id=$1 GROUP BY u.id,sm.status,sm.created_at ORDER BY u.full_name`,[request.auth.schoolId]);return{users:q.rows};});

  app.post("/api/director/users",async(request,reply)=>{const role=oneOf(request.body?.role,["DIRECTOR","ADMIN","TEACHER","GUARDIAN"]);if(!(await requireDirector(request,reply,role==="DIRECTOR")))return;const b=request.body||{},fullName=text(b.fullName,{min:2,max:150}),login=normalizeLogin(b.login),email=normalizeEmail(b.email),password=String(b.password||"");if(!role||!fullName||login.length<3||!validPassword(password))return reply.code(400).send({error:"INVALID_USER_DATA"});const ph=await hashPassword(password);const client=await pool.connect();try{await client.query("BEGIN");const u=(await client.query(`INSERT INTO users(login,email,full_name,password_hash,managed_by_school_id,account_state) VALUES($1,$2,$3,$4,$5,'ACTIVE') RETURNING id`,[login,email,fullName,ph,request.auth.schoolId])).rows[0];await client.query("INSERT INTO school_memberships(school_id,user_id,status,created_by) VALUES($1,$2,'ACTIVE',$3)",[request.auth.schoolId,u.id,request.auth.userId]);await client.query("INSERT INTO membership_roles(school_id,user_id,role,created_by) VALUES($1,$2,$3,$4)",[request.auth.schoolId,u.id,role,request.auth.userId]);await client.query("SELECT set_config('app.user_id',$1,true)",[request.auth.userId]);await client.query("SELECT set_config('app.school_id',$1,true)",[request.auth.schoolId]);await audit(client,request.auth,"USER_CREATED","user",u.id,{role,login});await client.query("COMMIT");return reply.code(201).send({ok:true,id:u.id});}catch(e){try{await client.query("ROLLBACK");}catch{}if(e?.code==="23505")return reply.code(409).send({error:"LOGIN_OR_EMAIL_EXISTS"});throw e;}finally{client.release();}});

  app.post("/api/director/users/:userId/revoke",async(request,reply)=>{if(!(await requireDirector(request,reply,true)))return;const userId=String(request.params.userId||"");if(!isUuid(userId)||userId===request.auth.userId)return reply.code(400).send({error:"INVALID_TARGET"});const m=await pool.query("SELECT 1 FROM school_memberships WHERE school_id=$1 AND user_id=$2",[request.auth.schoolId,userId]);if(!m.rowCount)return reply.code(404).send({error:"USER_NOT_FOUND"});await withContext({userId:request.auth.userId,schoolId:request.auth.schoolId},async c=>{await c.query("UPDATE school_memberships SET status='REVOKED',revoked_at=now() WHERE school_id=$1 AND user_id=$2",[request.auth.schoolId,userId]);await c.query("UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND active_school_id=$2",[userId,request.auth.schoolId]);await audit(c,request.auth,"MEMBERSHIP_REVOKED","user",userId,{});});return{ok:true};});

  app.post("/api/director/users/:userId/reset-code",async(request,reply)=>{if(!(await requireDirector(request,reply,true)))return;const userId=String(request.params.userId||"");if(!isUuid(userId))return reply.code(400).send({error:"INVALID_TARGET"});const m=await pool.query(`SELECT u.managed_by_school_id,EXISTS(SELECT 1 FROM platform_admins pa WHERE pa.user_id=u.id AND pa.active) is_platform_admin,(SELECT count(*)::int FROM school_memberships sm2 WHERE sm2.user_id=u.id AND sm2.status='ACTIVE') active_memberships FROM school_memberships sm JOIN users u ON u.id=sm.user_id WHERE sm.school_id=$1 AND sm.user_id=$2`,[request.auth.schoolId,userId]);if(!m.rowCount)return reply.code(404).send({error:"USER_NOT_FOUND"});const target=m.rows[0];if(target.is_platform_admin||Number(target.active_memberships)!==1||(target.managed_by_school_id&&target.managed_by_school_id!==request.auth.schoolId))return reply.code(403).send({error:"ACCOUNT_RECOVERY_NOT_MANAGED_BY_THIS_SCHOOL"});const code=randomToken(32);await pool.query("UPDATE password_reset_requests SET used_at=COALESCE(used_at,now()) WHERE user_id=$1 AND used_at IS NULL",[userId]);await pool.query("INSERT INTO password_reset_requests(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '20 minutes')",[userId,tokenHash(code)]);await withContext({userId:request.auth.userId,schoolId:request.auth.schoolId},c=>audit(c,request.auth,"PASSWORD_RESET_CODE_ISSUED","user",userId,{}));return{ok:true,code,expiresInMinutes:20,warning:"SHOW_ONCE"};});

  app.post("/api/director/invites",async(request,reply)=>{const role=oneOf(request.body?.role,["TEACHER","ADMIN","GUARDIAN","DIRECTOR"]);if(!(await requireDirector(request,reply,role==="DIRECTOR")))return;if(!role)return reply.code(400).send({error:"INVALID_ROLE"});const b=request.body||{},classId=b.classId?String(b.classId):null,subjectId=b.subjectId?String(b.subjectId):null;if(classId&&!isUuid(classId)||subjectId&&!isUuid(subjectId))return reply.code(400).send({error:"INVALID_SCOPE"});let permissions=stringArray(b.permissions||[],{maxItems:20,maxLen:30});if(!permissions||permissions.some(x=>!PERMISSIONS.includes(x)))return reply.code(400).send({error:"INVALID_PERMISSIONS"});const studentIds=uuidArray(b.studentIds||[],{maxItems:20});if(!studentIds)return reply.code(400).send({error:"INVALID_STUDENTS"});if(role==="GUARDIAN"&&!studentIds.length)return reply.code(400).send({error:"GUARDIAN_REQUIRES_STUDENTS"});if(role!=="GUARDIAN"&&studentIds.length)return reply.code(400).send({error:"STUDENTS_ONLY_FOR_GUARDIAN"});const targetLogin=b.targetLogin?normalizeLogin(b.targetLogin):null,targetEmail=b.targetEmail?normalizeEmail(b.targetEmail):null;if(!targetLogin&&!targetEmail)return reply.code(400).send({error:"INVITE_TARGET_REQUIRED"});const code=randomToken(24),expiresHours=Math.max(1,Math.min(72,Number(b.expiresHours||24)));
    return withContext({userId:request.auth.userId,schoolId:request.auth.schoolId},async c=>{if(classId&&!((await c.query("SELECT 1 FROM classes WHERE id=$1",[classId])).rowCount))return reply.code(400).send({error:"INVALID_CLASS"});if(subjectId&&!((await c.query("SELECT 1 FROM subjects WHERE id=$1",[subjectId])).rowCount))return reply.code(400).send({error:"INVALID_SUBJECT"});if(studentIds.length&&(await c.query("SELECT count(*)::int n FROM students WHERE id=ANY($1::uuid[])",[studentIds])).rows[0].n!==studentIds.length)return reply.code(400).send({error:"INVALID_STUDENTS"});const ins=await c.query(`INSERT INTO access_invites(school_id,code_hash,target_login,target_email,invite_kind,role,class_id,subject_id,permissions,student_ids,expires_at,created_by) VALUES($1,$2,$3,$4,$5,$5,$6,$7,$8::jsonb,$9::jsonb,now()+($10||' hours')::interval,$11) RETURNING id,expires_at`,[request.auth.schoolId,tokenHash(code),targetLogin,targetEmail,role,classId,subjectId,JSON.stringify(permissions),JSON.stringify(studentIds),String(expiresHours),request.auth.userId]);await audit(c,request.auth,"ACCESS_INVITE_CREATED","invite",ins.rows[0].id,{role,classId,subjectId,permissions,studentCount:studentIds.length});return reply.code(201).send({ok:true,code,inviteId:ins.rows[0].id,expiresAt:ins.rows[0].expires_at,warning:"SHOW_ONCE"});});
  });

  app.get("/api/director/classes",async(request,reply)=>{if(!(await requireDirector(request,reply,false,"GET")))return;return withContext({userId:request.auth.userId,schoolId:request.auth.schoolId},async c=>({classes:(await c.query("SELECT c.id,c.name,c.level,c.section,c.active,c.row_version,c.academic_year_id,y.name academic_year,(SELECT count(*)::int FROM students s WHERE s.class_id=c.id AND s.status='ACTIVE') student_count FROM classes c LEFT JOIN academic_years y ON y.id=c.academic_year_id ORDER BY y.name DESC,c.active DESC,c.name")).rows}));});
  app.post("/api/director/classes",async(request,reply)=>{if(!(await requireDirector(request,reply)))return;const b=request.body||{},name=text(b.name,{min:1,max:120}),level=optionalText(b.level,{max:80}),section=optionalText(b.section,{max:80});if(!name)return reply.code(400).send({error:"INVALID_CLASS"});return withContext({userId:request.auth.userId,schoolId:request.auth.schoolId},async c=>{const yearId=b.academicYearId||(await currentYear(c,request.auth.schoolId)).id;if(!isUuid(yearId)||!(await c.query("SELECT id FROM academic_years WHERE id=$1",[yearId])).rowCount)return reply.code(400).send({error:"INVALID_YEAR"});try{const q=await c.query("INSERT INTO classes(school_id,name,level,section,academic_year_id) VALUES($1,$2,$3,$4,$5) RETURNING id,row_version",[request.auth.schoolId,name,level,section,yearId]);await audit(c,request.auth,"CLASS_CREATED","class",q.rows[0].id,{name});return reply.code(201).send({ok:true,...q.rows[0]});}catch(e){if(e?.code==="23505")return reply.code(409).send({error:"CLASS_EXISTS"});throw e;}});});
  app.patch("/api/director/classes/:id",async(request,reply)=>{if(!(await requireDirector(request,reply)))return;const id=String(request.params.id||""),b=request.body||{},version=num(b.version,{min:1,max:1e9}),name=text(b.name,{min:1,max:120});if(!isUuid(id)||version===null||!name)return reply.code(400).send({error:"INVALID_CLASS"});return withContext({userId:request.auth.userId,schoolId:request.auth.schoolId},async c=>{const q=await c.query("UPDATE classes SET name=$1,level=$2,section=$3,active=COALESCE($4,active),row_version=row_version+1,updated_at=now() WHERE id=$5 AND row_version=$6 RETURNING row_version",[name,optionalText(b.level,{max:80}),optionalText(b.section,{max:80}),typeof b.active==="boolean"?b.active:null,id,version]);if(!q.rowCount)return reply.code(409).send({error:"VERSION_CONFLICT"});await audit(c,request.auth,"CLASS_UPDATED","class",id,{newVersion:q.rows[0].row_version});return{ok:true,...q.rows[0]};});});

  app.get("/api/director/subjects",async(request,reply)=>{if(!(await requireDirector(request,reply,false,"GET")))return;return withContext({userId:request.auth.userId,schoolId:request.auth.schoolId},async c=>({subjects:(await c.query("SELECT id,name,coefficient,max_score,active,row_version FROM subjects ORDER BY active DESC,name")).rows}));});
  app.post("/api/director/subjects",async(request,reply)=>{if(!(await requireDirector(request,reply)))return;const b=request.body||{},name=text(b.name,{min:1,max:120}),coefficient=num(b.coefficient??1,{min:.01,max:100}),maxScore=num(b.maxScore??20,{min:1,max:1000});if(!name||coefficient===null||maxScore===null)return reply.code(400).send({error:"INVALID_SUBJECT"});return withContext({userId:request.auth.userId,schoolId:request.auth.schoolId},async c=>{try{const q=await c.query("INSERT INTO subjects(school_id,name,coefficient,max_score) VALUES($1,$2,$3,$4) RETURNING id,row_version",[request.auth.schoolId,name,coefficient,maxScore]);await audit(c,request.auth,"SUBJECT_CREATED","subject",q.rows[0].id,{name,coefficient,maxScore});return reply.code(201).send({ok:true,...q.rows[0]});}catch(e){if(e?.code==="23505")return reply.code(409).send({error:"SUBJECT_EXISTS"});throw e;}});});
  app.patch("/api/director/subjects/:id",async(request,reply)=>{if(!(await requireDirector(request,reply)))return;const id=String(request.params.id||""),b=request.body||{},version=num(b.version,{min:1,max:1e9}),name=text(b.name,{min:1,max:120}),coefficient=num(b.coefficient,{min:.01,max:100}),maxScore=num(b.maxScore,{min:1,max:1000});if(!isUuid(id)||version===null||!name||coefficient===null||maxScore===null)return reply.code(400).send({error:"INVALID_SUBJECT"});return withContext({userId:request.auth.userId,schoolId:request.auth.schoolId},async c=>{await c.query("SELECT pg_advisory_xact_lock(hashtext($1))",[`subject:${id}`]);const previous=(await c.query("SELECT coefficient,max_score FROM subjects WHERE id=$1 FOR UPDATE",[id])).rows[0];if(previous&&(Number(previous.coefficient)!==coefficient||Number(previous.max_score)!==maxScore)&&(await c.query("SELECT 1 FROM grades WHERE subject_id=$1 LIMIT 1",[id])).rowCount)return reply.code(409).send({error:"SUBJECT_HAS_GRADES"});const q=await c.query("UPDATE subjects SET name=$1,coefficient=$2,max_score=$3,active=COALESCE($4,active),row_version=row_version+1,updated_at=now() WHERE id=$5 AND row_version=$6 RETURNING row_version",[name,coefficient,maxScore,typeof b.active==="boolean"?b.active:null,id,version]);if(!q.rowCount)return reply.code(409).send({error:"VERSION_CONFLICT"});await audit(c,request.auth,"SUBJECT_UPDATED","subject",id,{newVersion:q.rows[0].row_version});return{ok:true,...q.rows[0]};});});

  app.post("/api/director/students",async(request,reply)=>{
    if(!(await requireDirector(request,reply)))return;
    const b=request.body||{},classId=String(b.classId||"");
    const fullName=text(b.fullName,{min:2,max:180}),gender=b.gender?oneOf(b.gender,["M","F"]):null;
    const studentUid=text(b.studentUid,{min:1,max:80})||"ST-"+crypto.randomUUID().replace(/-/g,"").slice(0,12).toUpperCase();
    const phone=normalizeGuardianPhone(b.guardianPhone);
    const consent=b.guardianConsent===true;
    if(!isUuid(classId)||!fullName||phone===undefined||(consent&&!phone))return reply.code(400).send({error:"INVALID_STUDENT"});
    return withContext({userId:request.auth.userId,schoolId:request.auth.schoolId},async c=>{
      try{
        const q=await c.query("INSERT INTO students(school_id,class_id,student_uid,full_name,gender,birth_date,guardian_whatsapp_phone,guardian_whatsapp_consent) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,row_version,student_uid",[request.auth.schoolId,classId,studentUid,fullName,gender,b.birthDate||null,phone,consent]);
        await audit(c,request.auth,"STUDENT_CREATED","student",q.rows[0].id,{classId,autoUid:!b.studentUid,whatsappOptIn:consent});
        return reply.code(201).send({ok:true,...q.rows[0]});
      }catch(e){if(e?.code==="23505")return reply.code(409).send({error:"STUDENT_EXISTS"});if(e?.code==="23503")return reply.code(400).send({error:"INVALID_CLASS"});throw e;}
    });
  });
  // Preview is performed in the browser; the server validates each row again before
  // inserting. Existing pupils and grades are never overwritten by an import.
  app.post("/api/director/students/import",async(request,reply)=>{
    if(!(await requireDirector(request,reply)))return;
    const b=request.body||{},classId=String(b.classId||""),rows=b.rows;
    if(!isUuid(classId)||!Array.isArray(rows)||rows.length<1||rows.length>150)
      return reply.code(400).send({error:"INVALID_IMPORT"});
    const prepared=rows.map((r,i)=>{
      const fullName=text(r?.fullName,{min:2,max:180}),uid=r?.studentUid?text(r.studentUid,{min:1,max:80}):null;
      const gender=r?.gender?oneOf(r.gender,["M","F"]):null;
      const phone=normalizeGuardianPhone(r?.guardianPhone);
      const consent=r?.guardianConsent===true;
      return {i,fullName,uid,gender,phone,consent,valid:!!fullName&&phone!==undefined&&(!r?.gender||!!gender)&&(!r?.studentUid||!!uid)&&(!consent||!!phone)};
    });
    return withContext({userId:request.auth.userId,schoolId:request.auth.schoolId},async c=>{
      if(!(await c.query("SELECT 1 FROM classes WHERE id=$1 AND school_id=$2",[classId,request.auth.schoolId])).rowCount)
        return reply.code(404).send({error:"CLASS_NOT_FOUND"});
      // Lock this class during batch import to prevent duplicate-name parallel requests.
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))",["student-import:"+classId]);
      const existing=(await c.query("SELECT lower(trim(full_name)) name,student_uid FROM students WHERE school_id=$1 AND class_id=$2",[request.auth.schoolId,classId])).rows;
      const names=new Set(existing.map(x=>x.name)),uids=new Set(existing.map(x=>x.student_uid));
      let imported=0;const skipped=[];
      for(const r of prepared){
        if(!r.valid){skipped.push({line:r.i+1,reason:"INVALID_ROW"});continue;}
        const key=r.fullName.trim().toLowerCase();
        if(names.has(key)||(r.uid&&uids.has(r.uid))){skipped.push({line:r.i+1,reason:"DUPLICATE"});continue;}
        const uid=r.uid||"ST-"+crypto.randomUUID().replace(/-/g,"").slice(0,12).toUpperCase();
        try{
          await c.query(`INSERT INTO students(school_id,class_id,student_uid,full_name,gender,guardian_whatsapp_phone,guardian_whatsapp_consent)
            VALUES($1,$2,$3,$4,$5,$6,$7)`,[request.auth.schoolId,classId,uid,r.fullName,r.gender,r.phone,r.consent]);
          imported++;names.add(key);uids.add(uid);
        }catch(e){if(e.code==="23505"){skipped.push({line:r.i+1,reason:"DUPLICATE"});}else throw e;}
      }
      await audit(c,request.auth,"STUDENTS_IMPORTED","class",classId,{imported,skipped:skipped.length,received:rows.length});
      return {ok:true,imported,skipped};
    });
  });


  // Reviewed roster import: no OCR guesses, preserves all existing pupils/grades.
  // Every row is isolated in a savepoint and duplicate names/IDs require manual review.
  app.post("/api/director/students/import",async(request,reply)=>{
    if(!(await requireDirector(request,reply)))return;
    const b=request.body||{},classId=String(b.classId||""),rows=b.students;
    if(!isUuid(classId)||!Array.isArray(rows)||!rows.length||rows.length>150)return reply.code(400).send({error:"INVALID_IMPORT"});
    return withContext({userId:request.auth.userId,schoolId:request.auth.schoolId},async c=>{
      const permitted=await c.query("SELECT id FROM classes WHERE id=$1 AND school_id=$2 AND active=true",[classId,request.auth.schoolId]);
      if(!permitted.rowCount)return reply.code(404).send({error:"CLASS_NOT_FOUND"});
      const result={created:0,skipped:0,issues:[],students:[]};
      const seen=new Set();
      for(let i=0;i<rows.length;i++){
        const item=rows[i]||{},name=text(item.fullName,{min:2,max:180});
        const uid=String(item.studentUid||"").trim();
        const gender=item.gender?oneOf(String(item.gender),["M","F"]):null;
        const phone=normalizeGuardianPhone(item.guardianPhone);
        const consent=item.guardianConsent===true;
        const problem=!name?"INVALID_NAME":uid.length>80?"INVALID_UID":item.gender&&!gender?"INVALID_GENDER":phone===undefined?"INVALID_PHONE":consent&&!phone?"CONSENT_WITHOUT_PHONE":null;
        if(problem){result.skipped++;result.issues.push({line:i+1,error:problem});continue;}
        const dupeKey=name.trim().replace(/\s+/g," ").toLowerCase();
        if(seen.has(dupeKey)){result.skipped++;result.issues.push({line:i+1,error:"DUPLICATE_IN_FILE",name});continue;}
        seen.add(dupeKey);
        const existing=await c.query("SELECT 1 FROM students WHERE school_id=$1 AND class_id=$2 AND (lower(trim(full_name))=lower($3) OR ($4::text<>'' AND student_uid=$4)) LIMIT 1",[request.auth.schoolId,classId,name,uid]);
        if(existing.rowCount){result.skipped++;result.issues.push({line:i+1,error:"ALREADY_EXISTS",name});continue;}
        await c.query("SAVEPOINT import_student_row");
        try{
          const studentUid=uid||"ST-"+crypto.randomUUID().replace(/-/g,"").slice(0,12).toUpperCase();
          const q=await c.query("INSERT INTO students(school_id,class_id,student_uid,full_name,gender,guardian_whatsapp_phone,guardian_whatsapp_consent) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,student_uid",[request.auth.schoolId,classId,studentUid,name,gender,phone,consent]);
          result.created++;result.students.push(q.rows[0]);
          await c.query("RELEASE SAVEPOINT import_student_row");
        }catch(e){
          await c.query("ROLLBACK TO SAVEPOINT import_student_row");
          await c.query("RELEASE SAVEPOINT import_student_row");
          result.skipped++;result.issues.push({line:i+1,error:e.code==="23505"?"ALREADY_EXISTS":"IMPORT_ROW_FAILED",name});
        }
      }
      await audit(c,request.auth,"STUDENTS_ROSTER_IMPORTED","class",classId,{created:result.created,skipped:result.skipped,total:rows.length});
      return {ok:true,...result};
    });
  });

  app.patch("/api/director/students/:id",async(request,reply)=>{
    if(!(await requireDirector(request,reply)))return;
    const id=String(request.params.id||""),b=request.body||{},version=num(b.version,{min:1,max:1e9});
    const classId=String(b.classId||""),uid=text(b.studentUid,{min:1,max:80}),fullName=text(b.fullName,{min:2,max:180});
    const gender=b.gender?oneOf(b.gender,["M","F"]):null,status=oneOf(b.status||"ACTIVE",["ACTIVE","INACTIVE","TRANSFERRED"]);
    const suppliedPhone=Object.prototype.hasOwnProperty.call(b,"guardianPhone");
    const suppliedConsent=Object.prototype.hasOwnProperty.call(b,"guardianConsent");
    const phone=suppliedPhone?normalizeGuardianPhone(b.guardianPhone):null;
    if(!isUuid(id)||!isUuid(classId)||version===null||!uid||!fullName||!status||(suppliedPhone&&phone===undefined)||(suppliedConsent&&typeof b.guardianConsent!=="boolean")||(suppliedConsent&&b.guardianConsent&&!phone&&suppliedPhone))return reply.code(400).send({error:"INVALID_STUDENT"});
    return withContext({userId:request.auth.userId,schoolId:request.auth.schoolId},async c=>{
      const q=await c.query(`UPDATE students SET class_id=$1,student_uid=$2,full_name=$3,gender=$4,birth_date=$5,status=$6,
        guardian_whatsapp_phone=CASE WHEN $9::boolean THEN $10::text ELSE guardian_whatsapp_phone END,
        guardian_whatsapp_consent=CASE WHEN $11::boolean THEN $12::boolean ELSE CASE WHEN $9::boolean THEN false ELSE guardian_whatsapp_consent END END,
        row_version=row_version+1,updated_at=now()
        WHERE id=$7 AND school_id=$13 AND row_version=$8 RETURNING row_version`,
        [classId,uid,fullName,gender,b.birthDate||null,status,id,version,suppliedPhone,phone,suppliedConsent,b.guardianConsent===true,request.auth.schoolId]);
      if(!q.rowCount)return reply.code(409).send({error:"VERSION_CONFLICT"});
      await audit(c,request.auth,"STUDENT_UPDATED","student",id,{newVersion:q.rows[0].row_version,contactChanged:suppliedPhone||suppliedConsent});
      return{ok:true,...q.rows[0]};
    });
  });

  app.post("/api/director/permissions",async(request,reply)=>{if(!(await requireDirector(request,reply)))return;const b=request.body||{},userId=String(b.userId||""),permission=String(b.permission||"").toUpperCase(),classId=b.classId?String(b.classId):null,subjectId=b.subjectId?String(b.subjectId):null;if(!isUuid(userId)||!PERMISSIONS.includes(permission)||classId&&!isUuid(classId)||subjectId&&!isUuid(subjectId))return reply.code(400).send({error:"INVALID_PERMISSION"});const m=await pool.query("SELECT 1 FROM school_memberships WHERE school_id=$1 AND user_id=$2 AND status='ACTIVE'",[request.auth.schoolId,userId]);if(!m.rowCount)return reply.code(400).send({error:"USER_NOT_IN_SCHOOL"});return withContext({userId:request.auth.userId,schoolId:request.auth.schoolId},async c=>{if(classId&&!(await c.query("SELECT 1 FROM classes WHERE id=$1",[classId])).rowCount)return reply.code(400).send({error:"INVALID_CLASS"});if(subjectId&&!(await c.query("SELECT 1 FROM subjects WHERE id=$1",[subjectId])).rowCount)return reply.code(400).send({error:"INVALID_SUBJECT"});if(classId&&subjectId&&!(await c.query("SELECT 1 FROM class_subjects WHERE class_id=$1 AND subject_id=$2",[classId,subjectId])).rowCount)return reply.code(400).send({error:"SUBJECT_NOT_IN_CLASS"});const q=await c.query("INSERT INTO permission_grants(school_id,user_id,permission,class_id,subject_id,granted_by,ends_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",[request.auth.schoolId,userId,permission,classId,subjectId,request.auth.userId,b.endsAt||null]);await audit(c,request.auth,"PERMISSION_GRANTED","permission",q.rows[0].id,{userId,permission,classId,subjectId});return reply.code(201).send({ok:true,id:q.rows[0].id});});});
  app.delete("/api/director/permissions/:id",async(request,reply)=>{if(!(await requireDirector(request,reply)))return;const id=String(request.params.id||"");if(!isUuid(id))return reply.code(400).send({error:"INVALID_PERMISSION"});return withContext({userId:request.auth.userId,schoolId:request.auth.schoolId},async c=>{const q=await c.query("UPDATE permission_grants SET revoked_at=now() WHERE id=$1 AND school_id=$2 AND revoked_at IS NULL RETURNING user_id,permission",[id,request.auth.schoolId]);if(!q.rowCount)return reply.code(404).send({error:"PERMISSION_NOT_FOUND"});await audit(c,request.auth,"PERMISSION_REVOKED","permission",id,q.rows[0]);return{ok:true};});});

  app.get("/api/director/audit",async(request,reply)=>{if(!(await requireDirector(request,reply,false,"GET")))return;return withContext({userId:request.auth.userId,schoolId:request.auth.schoolId},async c=>({events:(await c.query("SELECT id,actor_user_id,action,entity_type,entity_id,metadata_json,created_at FROM audit_log ORDER BY id DESC LIMIT 200")).rows}));});
  app.get("/api/director/subscription",async(request,reply)=>{if(!(await requireDirector(request,reply,false,"GET")))return;const q=await pool.query("SELECT plan,status,starts_at,ends_at,seat_limit,student_limit FROM school_subscriptions WHERE school_id=$1",[request.auth.schoolId]);return{subscription:q.rows[0]||null};});
}
