import {withContext} from '../db.js';
import {audit} from '../audit.js';
import {isUuid,validDate} from '../validators.js';

const statuses=['PRESENT','ABSENT','LATE','EXCUSED'];
const fail=(message,statusCode)=>{throw Object.assign(new Error(message),{statusCode});};
async function attendanceAccess(c,classId,schoolId,write=false){
  const classroom=(await c.query('SELECT id,name FROM classes WHERE id=$1 AND school_id=$2',[classId,schoolId])).rows[0];
  if(!classroom)fail('CLASS_NOT_FOUND',404);
  const access=(await c.query(`SELECT app.has_permission('ATTENDANCE_WRITE',$1,NULL) writable,
    app.has_permission('ATTENDANCE_READ',$1,NULL) readable`,[classId])).rows[0];
  if(!access.writable&&(write||!access.readable))fail('ACCESS_DENIED',403);
  return {classroom,canWrite:access.writable};
}
export async function registerAttendanceWorkflows(app,{requireSession,requireMutation}){
  app.get('/api/classes/:classId/attendance/roster',async(request,reply)=>{
    if(!(await requireSession(request,reply)))return;
    const {schoolId,userId}=request.auth,classId=request.params.classId,date=request.query?.date;
    if(!schoolId||!isUuid(classId)||!validDate(date))return reply.code(400).send({error:'INVALID_ATTENDANCE_QUERY'});
    return withContext({schoolId,userId},async c=>{
      const access=await attendanceAccess(c,classId,schoolId);
      const students=(await c.query(`SELECT s.id student_id,s.full_name,s.student_uid,a.status,a.note,COALESCE(a.row_version,0) version
        FROM students s LEFT JOIN attendance_records a ON a.student_id=s.id AND a.attendance_date=$2
        WHERE s.class_id=$1 AND s.status='ACTIVE' ORDER BY s.full_name,s.id`,[classId,date])).rows;
      return {...access,date,students};
    });
  });
  app.put('/api/classes/:classId/attendance/bulk',async(request,reply)=>{
    if(!(await requireMutation(request,reply)))return;
    const {schoolId,userId}=request.auth,classId=request.params.classId,b=request.body||{},rows=b.attendance;
    if(!schoolId||!isUuid(classId)||!validDate(b.date)||!Array.isArray(rows)||!rows.length||rows.length>500||
      rows.some(x=>!x||!isUuid(x.studentId)||!statuses.includes(x.status)||!Number.isInteger(x.version)||x.version<0||x.version>1e9||
        (x.note!=null&&(typeof x.note!=='string'||x.note.length>500)))||new Set(rows.map(x=>x.studentId)).size!==rows.length)
      return reply.code(400).send({error:'INVALID_ATTENDANCE_BATCH'});
    try{return await withContext({schoolId,userId},async c=>{
      await attendanceAccess(c,classId,schoolId,true);
      const ordered=[...rows].sort((a,b)=>a.studentId.localeCompare(b.studentId)),ids=ordered.map(x=>x.studentId);
      const students=await c.query("SELECT id FROM students WHERE class_id=$1 AND school_id=$2 AND status='ACTIVE' AND id=ANY($3::uuid[])",[classId,schoolId,ids]);
      if(students.rowCount!==rows.length)fail('STUDENT_NOT_FOUND',404);
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`attendance:${schoolId}:${classId}:${b.date}`]);
      const existing=(await c.query(`SELECT id,student_id,row_version,status,note FROM attendance_records
        WHERE school_id=$1 AND attendance_date=$2 AND student_id=ANY($3::uuid[]) ORDER BY student_id FOR UPDATE`,[schoolId,b.date,ids])).rows;
      const current=new Map(existing.map(x=>[x.student_id,x]));
      if(ordered.some(x=>(current.get(x.studentId)?.row_version||0)!==x.version))fail('VERSION_CONFLICT',409);
      const saved=[];
      for(const row of ordered){
        const old=current.get(row.studentId),note=row.note?.trim()||null;
        const result=old?await c.query(`UPDATE attendance_records SET status=$1,note=$2,recorded_by=$3,
          updated_at=now(),row_version=row_version+1 WHERE id=$4 AND row_version=$5
          RETURNING student_id,status,note,row_version version`,[row.status,note,userId,old.id,row.version]):
          await c.query(`INSERT INTO attendance_records(school_id,class_id,student_id,attendance_date,status,note,recorded_by)
            VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING student_id,status,note,row_version version`,[schoolId,classId,row.studentId,b.date,row.status,note,userId]);
        if(!result.rowCount)fail('VERSION_CONFLICT',409);saved.push(result.rows[0]);
      }
      await audit(c,request.auth,'ATTENDANCE_BULK_SAVED','class',classId,{date:b.date,count:saved.length});
      return {ok:true,attendance:saved};
    });}catch(e){if(e.code==='23505'||e.code==='23503')return reply.code(409).send({error:'VERSION_CONFLICT'});throw e;}
  });
  app.get('/api/classes/:classId/attendance/report',async(request,reply)=>{
    if(!(await requireSession(request,reply)))return;
    const {schoolId,userId}=request.auth,classId=request.params.classId,{from,to}=request.query||{};
    if(!schoolId||!isUuid(classId)||!validDate(from)||!validDate(to)||from>to||Date.parse(to)-Date.parse(from)>366*86400000)
      return reply.code(400).send({error:'INVALID_ATTENDANCE_RANGE'});
    return withContext({schoolId,userId},async c=>{
      const access=await attendanceAccess(c,classId,schoolId);
      const rows=(await c.query(`SELECT a.student_id,s.full_name,s.student_uid,a.attendance_date::text date,a.status,a.note
        FROM attendance_records a JOIN students s ON s.id=a.student_id WHERE a.class_id=$1
        AND a.attendance_date BETWEEN $2 AND $3 ORDER BY a.attendance_date,s.full_name`,[classId,from,to])).rows;
      const totals=Object.fromEntries(statuses.map(s=>[s,0])),daily=new Map(),students=new Map();
      for(const row of rows){
        totals[row.status]++;
        if(!daily.has(row.date))daily.set(row.date,{date:row.date,...Object.fromEntries(statuses.map(s=>[s,0]))});
        daily.get(row.date)[row.status]++;
        if(!students.has(row.student_id))students.set(row.student_id,{id:row.student_id,full_name:row.full_name,student_uid:row.student_uid,...Object.fromEntries(statuses.map(s=>[s,0]))});
        students.get(row.student_id)[row.status]++;
      }
      return {classroom:access.classroom,from,to,totals,recordedDays:daily.size,daily:[...daily.values()],students:[...students.values()],records:rows};
    });
  });
}
