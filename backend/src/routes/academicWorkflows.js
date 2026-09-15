import {withContext} from '../db.js';
import {audit} from '../audit.js';
import {isUuid,num,text} from '../validators.js';
import {buildClassResults} from '../services/reports.js';

const fail=(message,statusCode)=>{throw Object.assign(new Error(message),{statusCode});};

export async function registerAcademicWorkflows(app,{requireSession,requireMutation}){
  app.put('/api/classes/:classId/grades/bulk',async(request,reply)=>{
    if(!(await requireMutation(request,reply)))return;
    const {schoolId,userId}=request.auth,b=request.body||{},classId=request.params.classId;
    const subjectId=b.subjectId,term=b.term,assessment=text(b.assessment||'MAIN',{min:1,max:60});
    const rows=Array.isArray(b.grades)?b.grades:[];
    if(!schoolId)return reply.code(403).send({error:'SCHOOL_REQUIRED'});
    if(!isUuid(classId)||!isUuid(subjectId)||!['T1','T2','T3'].includes(term)||!assessment||
       !rows.length||rows.length>500||new Set(rows.map(x=>x?.studentId)).size!==rows.length||
       rows.some(x=>!x||!isUuid(x.studentId)||num(x.score,{min:0,max:100000})===null||
         !Number.isInteger(x.version)||x.version<0||x.version>1e9))return reply.code(400).send({error:'INVALID_GRADE_BATCH'});
    try{
      return await withContext({schoolId,userId},async c=>{
        if(!(await c.query("SELECT app.has_permission('GRADE_WRITE',$1,$2) ok",[classId,subjectId])).rows[0].ok)fail('ACCESS_DENIED',403);
        await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`subject:${subjectId}`]);
        const subject=(await c.query(`SELECT s.max_score FROM subjects s JOIN class_subjects cs ON cs.subject_id=s.id
          JOIN classes cl ON cl.id=cs.class_id WHERE cs.class_id=$1 AND s.id=$2 AND cl.school_id=$3
          AND cl.active AND s.active`,[classId,subjectId,schoolId])).rows[0];
        if(!subject)fail('SUBJECT_NOT_IN_CLASS',404);
        if(rows.some(x=>Number(x.score)>Number(subject.max_score)))fail('INVALID_SCORE',400);
        // Validate every row before making the first change; lock grades in stable order.
        const ordered=[...rows].sort((a,b)=>a.studentId.localeCompare(b.studentId));
        const ids=ordered.map(x=>x.studentId);
        const students=await c.query(`SELECT id FROM students WHERE school_id=$1 AND class_id=$2
          AND status='ACTIVE' AND id=ANY($3::uuid[]) ORDER BY id`,[schoolId,classId,ids]);
        if(students.rowCount!==rows.length)fail('STUDENT_NOT_FOUND',404);
        await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`grades:${schoolId}:${classId}:${subjectId}:${term}:${assessment}`]);
        const existing=(await c.query(`SELECT id,student_id,score,version FROM grades WHERE class_id=$1 AND subject_id=$2
          AND term=$3 AND assessment=$4 AND student_id=ANY($5::uuid[]) ORDER BY student_id FOR UPDATE`,[classId,subjectId,term,assessment,ids])).rows;
        const byStudent=new Map(existing.map(g=>[g.student_id,g]));
        if(ordered.some(g=>(byStudent.get(g.studentId)?.version||0)!==g.version))fail('VERSION_CONFLICT',409);
        const saved=[];
        for(const entry of ordered){
          const old=byStudent.get(entry.studentId),score=Number(entry.score);
          if(old&&Number(old.score)===score){saved.push({...old});continue;}
          const result=old?await c.query(`UPDATE grades SET score=$1,version=version+1,updated_by=$2,updated_at=now()
            WHERE id=$3 AND version=$4 RETURNING id,student_id,score,version`,[score,userId,old.id,entry.version]):
            await c.query(`INSERT INTO grades(school_id,class_id,student_id,subject_id,term,assessment,score,updated_by)
              VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,student_id,score,version`,[schoolId,classId,entry.studentId,subjectId,term,assessment,score,userId]);
          if(!result.rowCount)fail('VERSION_CONFLICT',409);
          const grade=result.rows[0];saved.push(grade);
          await c.query(`INSERT INTO grade_history(grade_id,school_id,old_score,new_score,old_version,new_version,changed_by)
            VALUES($1,$2,$3,$4,$5,$6,$7)`,[grade.id,schoolId,old?.score??null,grade.score,old?.version??null,grade.version,userId]);
        }
        await audit(c,request.auth,'GRADES_BULK_SAVED','class',classId,{subjectId,term,assessment,count:saved.length});
        return {ok:true,grades:saved};
      });
    }catch(e){
      // A concurrent legacy single-grade insert also rolls back the entire batch.
      if(e.code==='23505')return reply.code(409).send({error:'VERSION_CONFLICT'});
      if(e.code==='23503')return reply.code(409).send({error:'STUDENT_SCOPE_CHANGED'});
      throw e;
    }
  });

  app.get('/api/classes/:classId/results',async(request,reply)=>{
    if(!(await requireSession(request,reply)))return;
    const {schoolId,userId}=request.auth,classId=request.params.classId;
    const period=request.query?.term||'T1',subjectId=request.query?.subjectId||null;
    if(!schoolId||!isUuid(classId)||!['T1','T2','T3','ANNUAL'].includes(period)||(subjectId&&!isUuid(subjectId)))return reply.code(400).send({error:'INVALID_RESULTS_QUERY'});
    return withContext({schoolId,userId},async c=>{
      const classroom=(await c.query(`SELECT c.id,c.name,c.academic_year_id,y.name academic_year FROM classes c
        LEFT JOIN academic_years y ON y.id=c.academic_year_id WHERE c.id=$1 AND c.school_id=$2`,[classId,schoolId])).rows[0];
      if(!classroom)fail('CLASS_NOT_FOUND',404);
      const access=(await c.query(`SELECT app.has_role('DIRECTOR') OR ($2::uuid IS NOT NULL AND
        (app.has_permission('GRADE_READ',$1,$2) OR app.has_permission('GRADE_WRITE',$1,$2))) ok`,[classId,subjectId])).rows[0].ok;
      if(!access)fail('ACCESS_DENIED',403);
      const subjects=(await c.query(`SELECT s.id,s.name,s.coefficient,s.max_score FROM subjects s
        WHERE s.school_id=$2 AND ($3::uuid IS NULL OR s.id=$3) AND
          (EXISTS(SELECT 1 FROM class_subjects cs WHERE cs.class_id=$1 AND cs.subject_id=s.id)
           OR EXISTS(SELECT 1 FROM grades g WHERE g.class_id=$1 AND g.subject_id=s.id)) ORDER BY s.name`,[classId,schoolId,subjectId])).rows;
      if(subjectId&&!subjects.length)fail('SUBJECT_NOT_IN_CLASS',404);
      const students=(await c.query("SELECT id,student_uid,full_name FROM students WHERE class_id=$1 AND status='ACTIVE' ORDER BY full_name,id",[classId])).rows;
      const grades=(await c.query(`SELECT student_id,subject_id,term,assessment,score FROM grades
        WHERE class_id=$1 AND ($2::uuid IS NULL OR subject_id=$2)`,[classId,subjectId])).rows;
      const settings=(await c.query('SELECT annual_weight_t1,annual_weight_t2,annual_weight_t3 FROM school_settings WHERE school_id=$1',[schoolId])).rows[0]||{};
      const weights={T1:Number(settings.annual_weight_t1||1),T2:Number(settings.annual_weight_t2||2),T3:Number(settings.annual_weight_t3||3)};
      return {classroom,period,scope:subjectId?'SUBJECT':'CLASS',...buildClassResults({students,subjects,grades,weights,period})};
    });
  });
}
