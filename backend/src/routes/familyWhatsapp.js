import {withContext} from "../db.js";
import {audit} from "../audit.js";
import {isUuid} from "../validators.js";

// WhatsApp is opened only from a staff member's device after guardian opt-in.
// This service deliberately never sends background messages or stores content of messages.
function parsePhone(input){
  if(input===undefined||input===null||String(input).trim()==="")return null;
  const raw=String(input).trim().replace(/[\s().-]/g,"");
  if(!/^\+?\d{8,15}$/.test(raw))return undefined;
  const digits=raw.replace(/^\+/,"");
  const normalized=digits.length===8?"222"+digits:digits;
  return /^[1-9]\d{7,14}$/.test(normalized)?normalized:undefined;
}
export async function registerFamilyWhatsappRoutes(app,{requireSession,requireMutation,requireDirector}){
  app.get("/api/family/contacts/:classId",async(request,reply)=>{
    if(!(await requireSession(request,reply)))return;
    const classId=String(request.params.classId||"");
    if(!request.auth.schoolId||!isUuid(classId))return reply.code(400).send({error:"INVALID_CLASS"});
    return withContext({userId:request.auth.userId,schoolId:request.auth.schoolId},async c=>{
      const p=await c.query("SELECT app.has_role('DIRECTOR') OR app.has_class_permission('STUDENT_READ',$1) AS allowed",[classId]);
      if(!p.rows[0]?.allowed)return reply.code(403).send({error:"STUDENT_READ_REQUIRED"});
      const x=await c.query("SELECT id,name FROM classes WHERE id=$1 AND school_id=$2",[classId,request.auth.schoolId]);
      if(!x.rowCount)return reply.code(404).send({error:"CLASS_NOT_FOUND"});
      const q=await c.query(`SELECT s.id,s.student_uid,s.full_name,s.class_id,s.status,
        CASE WHEN app.has_role('DIRECTOR') OR s.guardian_whatsapp_consent THEN s.guardian_whatsapp_phone ELSE NULL END AS guardian_phone,
        s.guardian_whatsapp_consent AS consent
        FROM students s WHERE s.class_id=$1 AND s.school_id=$2 AND s.status='ACTIVE'
        ORDER BY s.full_name,s.id LIMIT 800`,[classId,request.auth.schoolId]);
      return {classroom:x.rows[0],students:q.rows};
    });
  });

  app.put("/api/family/contacts/:studentId",async(request,reply)=>{
    if(!(await requireDirector(request,reply)))return;
    const id=String(request.params.studentId||""),b=request.body||{};
    const phone=parsePhone(b.guardianPhone),consent=b.guardianConsent===true;
    if(!isUuid(id)||phone===undefined||typeof b.guardianConsent!=="boolean"||(consent&&!phone))return reply.code(400).send({error:"INVALID_CONTACT"});
    return withContext({userId:request.auth.userId,schoolId:request.auth.schoolId},async c=>{
      const q=await c.query(`UPDATE students SET guardian_whatsapp_phone=$1,guardian_whatsapp_consent=$2,
        row_version=row_version+1,updated_at=now()
        WHERE id=$3 AND school_id=$4 RETURNING id`,[phone,consent,id,request.auth.schoolId]);
      if(!q.rowCount)return reply.code(404).send({error:"STUDENT_NOT_FOUND"});
      await audit(c,request.auth,"GUARDIAN_WHATSAPP_CONTACT_UPDATED","student",id,{consent,contactSet:!!phone});
      return {ok:true};
    });
  });
}
