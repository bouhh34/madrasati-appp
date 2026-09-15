import {withContext} from '../db.js';
import {audit} from '../audit.js';
import {isUuid,text,uuidArray} from '../validators.js';

export async function currentYear(c,schoolId){
  let year=(await c.query('SELECT id,name FROM academic_years WHERE school_id=$1 AND is_current',[schoolId])).rows[0];
  if(!year){
    year=(await c.query(`INSERT INTO academic_years(school_id,name,is_current)
      SELECT id,academic_year,true FROM schools WHERE id=$1
      ON CONFLICT(school_id,name) DO UPDATE SET is_current=true RETURNING id,name`,[schoolId])).rows[0];
  }
  return year;
}

export async function registerStructureRoutes(app,{requireSession,requireDirector}){
  const context=r=>({userId:r.auth.userId,schoolId:r.auth.schoolId});
  app.get('/api/academic-years',async(r,reply)=>{
    if(!await requireSession(r,reply))return;
    if(!r.auth.schoolId)return {years:[]};
    return withContext(context(r),async c=>{
      if(r.auth.roles.includes('DIRECTOR'))await currentYear(c,r.auth.schoolId);
      return {years:(await c.query('SELECT id,name,is_current FROM academic_years ORDER BY is_current DESC,name DESC')).rows};
    });
  });
  app.post('/api/director/academic-years',async(r,reply)=>{
    if(!await requireDirector(r,reply))return;
    const name=text(r.body?.name,{min:4,max:40});
    if(!name)return reply.code(400).send({error:'INVALID_YEAR'});
    return withContext(context(r),async c=>{
      const q=await c.query('INSERT INTO academic_years(school_id,name) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id,name,is_current',[r.auth.schoolId,name]);
      if(!q.rowCount)return reply.code(409).send({error:'YEAR_EXISTS'});
      await audit(c,r.auth,'ACADEMIC_YEAR_CREATED','academic_year',q.rows[0].id,{name});
      return reply.code(201).send(q.rows[0]);
    });
  });
  app.post('/api/director/academic-years/:id/activate',async(r,reply)=>{
    if(!await requireDirector(r,reply))return;
    if(!isUuid(r.params.id))return reply.code(400).send({error:'INVALID_YEAR'});
    return withContext(context(r),async c=>{
      // Lock the school to serialize simultaneous year changes.
      await c.query('SELECT id FROM schools WHERE id=$1 FOR UPDATE',[r.auth.schoolId]);
      const year=(await c.query('SELECT id,name FROM academic_years WHERE id=$1',[r.params.id])).rows[0];
      if(!year)return reply.code(404).send({error:'YEAR_NOT_FOUND'});
      await c.query('UPDATE academic_years SET is_current=false WHERE school_id=$1 AND is_current',[r.auth.schoolId]);
      await c.query('UPDATE academic_years SET is_current=true WHERE id=$1',[year.id]);
      await c.query('UPDATE schools SET academic_year=$1,updated_at=now() WHERE id=$2',[year.name,r.auth.schoolId]);
      await audit(c,r.auth,'ACADEMIC_YEAR_ACTIVATED','academic_year',year.id,{});
      return {ok:true};
    });
  });
  app.get('/api/director/classes/:id/curriculum',async(r,reply)=>{
    if(!await requireDirector(r,reply))return;
    if(!isUuid(r.params.id))return reply.code(400).send({error:'INVALID_CLASS'});
    return withContext(context(r),async c=>{
      if(!(await c.query('SELECT id FROM classes WHERE id=$1',[r.params.id])).rowCount)return reply.code(404).send({error:'CLASS_NOT_FOUND'});
      return {subjectIds:(await c.query('SELECT subject_id FROM class_subjects WHERE class_id=$1 ORDER BY sort_order,subject_id',[r.params.id])).rows.map(x=>x.subject_id)};
    });
  });
  app.put('/api/director/classes/:id/curriculum',async(r,reply)=>{
    if(!await requireDirector(r,reply))return;
    const ids=uuidArray(r.body?.subjectIds,{maxItems:100});
    if(!isUuid(r.params.id)||!ids||new Set(ids).size!==ids.length)return reply.code(400).send({error:'INVALID_CURRICULUM'});
    return withContext(context(r),async c=>{
      if(!(await c.query('SELECT id FROM classes WHERE id=$1 FOR UPDATE',[r.params.id])).rowCount)return reply.code(404).send({error:'CLASS_NOT_FOUND'});
      if((await c.query('SELECT id FROM subjects WHERE id=ANY($1::uuid[])',[ids])).rowCount!==ids.length)return reply.code(400).send({error:'INVALID_SUBJECT'});
      // Grades and teacher grants must stay attached to a curriculum subject.
      const used=await c.query(`SELECT subject_id FROM grades WHERE class_id=$1 AND NOT(subject_id=ANY($2::uuid[]))
        UNION SELECT subject_id FROM permission_grants WHERE class_id=$1 AND subject_id IS NOT NULL AND revoked_at IS NULL AND NOT(subject_id=ANY($2::uuid[]))`,[r.params.id,ids]);
      if(used.rowCount)return reply.code(409).send({error:'SUBJECT_HAS_LINKED_DATA'});
      await c.query('DELETE FROM class_subjects WHERE class_id=$1 AND NOT(subject_id=ANY($2::uuid[]))',[r.params.id,ids]);
      for(const [i,id] of ids.entries())await c.query(`INSERT INTO class_subjects(school_id,class_id,subject_id,sort_order) VALUES($1,$2,$3,$4)
        ON CONFLICT(class_id,subject_id) DO UPDATE SET sort_order=excluded.sort_order`,[r.auth.schoolId,r.params.id,id,i]);
      await audit(c,r.auth,'CURRICULUM_UPDATED','class',r.params.id,{subjectIds:ids});
      return {ok:true};
    });
  });
  app.get('/api/director/assignments',async(r,reply)=>{
    if(!await requireDirector(r,reply))return;
    return withContext(context(r),async c=>({assignments:(await c.query(`SELECT pg.id,pg.user_id,pg.class_id,pg.subject_id,pg.permission,u.full_name,c.name class_name,s.name subject_name
      FROM permission_grants pg JOIN users u ON u.id=pg.user_id LEFT JOIN classes c ON c.id=pg.class_id LEFT JOIN subjects s ON s.id=pg.subject_id
      WHERE pg.school_id=$1 AND pg.revoked_at IS NULL AND (pg.ends_at IS NULL OR pg.ends_at>now()) ORDER BY u.full_name,c.name,s.name`,[r.auth.schoolId])).rows}));
  });
  app.post('/api/director/assignments',async(r,reply)=>{
    if(!await requireDirector(r,reply))return;
    const {userId,classId,subjectId,attendance=false}=r.body||{};
    if(![userId,classId,subjectId].every(isUuid)||typeof attendance!=='boolean')return reply.code(400).send({error:'INVALID_ASSIGNMENT'});
    return withContext(context(r),async c=>{
      const teacher=await c.query(`SELECT sm.user_id FROM school_memberships sm JOIN membership_roles mr USING(school_id,user_id)
        WHERE sm.school_id=$1 AND sm.user_id=$2 AND sm.status='ACTIVE' AND mr.role='TEACHER' FOR UPDATE OF sm`,[r.auth.schoolId,userId]);
      if(!teacher.rowCount)return reply.code(400).send({error:'TEACHER_NOT_IN_SCHOOL'});
      if(!(await c.query('SELECT 1 FROM class_subjects WHERE class_id=$1 AND subject_id=$2',[classId,subjectId])).rowCount)return reply.code(400).send({error:'SUBJECT_NOT_IN_CLASS'});
      const permissions=['CLASS_READ','STUDENT_READ','SUBJECT_READ','GRADE_READ','GRADE_WRITE'];
      if(attendance)permissions.push('ATTENDANCE_READ','ATTENDANCE_WRITE');
      for(const permission of permissions){
        // Attendance records belong to a class/day, not to a subject.
        const subjectScope=permission.startsWith('ATTENDANCE_')?null:subjectId;
        await c.query(`INSERT INTO permission_grants(school_id,user_id,class_id,subject_id,permission,granted_by)
          SELECT $1,$2,$3,$4,$5,$6 WHERE NOT EXISTS(SELECT 1 FROM permission_grants WHERE school_id=$1 AND user_id=$2 AND class_id=$3 AND subject_id IS NOT DISTINCT FROM $4::uuid AND permission=$5 AND revoked_at IS NULL AND (ends_at IS NULL OR ends_at>now()))`,[r.auth.schoolId,userId,classId,subjectScope,permission,r.auth.userId]);
      }
      await audit(c,r.auth,'TEACHER_ASSIGNED','class',classId,{userId,subjectId,permissions});
      return {ok:true};
    });
  });
}
