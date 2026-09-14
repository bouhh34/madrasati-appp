import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './helpers/database.js';

test('HTTP security and existing school flows with real PostgreSQL RLS',async t=>{
  const db=await testDatabase();
  const {hashPassword}=await import('../src/security.js');
  const password='local fixture password 2026';
  const hash=await hashPassword(password);
  const one=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
  const director=await one("INSERT INTO users(login,full_name,password_hash,account_state) VALUES('director','Director fixture',$1,'ACTIVE') RETURNING id",[hash]);
  const teacher=await one("INSERT INTO users(login,full_name,password_hash,account_state) VALUES('teacher','Teacher fixture',$1,'ACTIVE') RETURNING id",[hash]);
  const other=await one("INSERT INTO users(login,full_name,password_hash,account_state) VALUES('other','Other fixture',$1,'ACTIVE') RETURNING id",[hash]);
  const admin=await one("INSERT INTO users(login,full_name,password_hash,account_state) VALUES('platform','Platform fixture',$1,'ACTIVE') RETURNING id",[hash]);
  const schoolA=await one("INSERT INTO schools(name,school_type,academic_year) VALUES('School A','PUBLIC','2026/2027') RETURNING id");
  const schoolB=await one("INSERT INTO schools(name,school_type,academic_year) VALUES('School B','PRIVATE','2026/2027') RETURNING id");
  for(const [user,school,role] of [[director,schoolA,'DIRECTOR'],[teacher,schoolA,'TEACHER'],[other,schoolB,'DIRECTOR']]){
    await db.query("INSERT INTO school_memberships(school_id,user_id,status) VALUES($1,$2,'ACTIVE')",[school.id,user.id]);
    await db.query('INSERT INTO membership_roles(school_id,user_id,role) VALUES($1,$2,$3)',[school.id,user.id,role]);
  }
  await db.query('INSERT INTO platform_admins(user_id) VALUES($1)',[admin.id]);
  await db.query('INSERT INTO school_settings(school_id) VALUES($1),($2)',[schoolA.id,schoolB.id]);
  const classA=await one("INSERT INTO classes(school_id,name) VALUES($1,'A1') RETURNING id",[schoolA.id]);
  const classB=await one("INSERT INTO classes(school_id,name) VALUES($1,'B1') RETURNING id",[schoolB.id]);
  const subject=await one("INSERT INTO subjects(school_id,name,max_score) VALUES($1,'Math',20) RETURNING id",[schoolA.id]);
  const studentA=await one("INSERT INTO students(school_id,class_id,student_uid,full_name) VALUES($1,$2,'A01','Student A') RETURNING id",[schoolA.id,classA.id]);
  const studentB=await one("INSERT INTO students(school_id,class_id,student_uid,full_name) VALUES($1,$2,'B01','Student B') RETURNING id",[schoolB.id,classB.id]);
  await db.query("INSERT INTO permission_grants(school_id,user_id,permission,class_id,subject_id,granted_by) VALUES($1,$2,'GRADE_WRITE',$3,$4,$5)",[schoolA.id,teacher.id,classA.id,subject.id,director.id]);
  await db.query('INSERT INTO class_subjects(school_id,class_id,subject_id) VALUES($1,$2,$3)',[schoolA.id,classA.id,subject.id]);
  await db.runtime();
  const {buildApp}=await import('../src/app.js');
  const app=await buildApp();app.log.level='silent';
  let n=0;
  const request=(method,url,payload,session={})=>app.inject({method,url,payload,headers:{origin:'http://localhost:3100',...(session.cookie?{cookie:session.cookie,'x-csrf-token':session.csrf||''}:{})},remoteAddress:`127.0.1.${++n%250+1}`});
  const login=async user=>{const r=await request('POST','/api/auth/login',{login:user,password});assert.equal(r.statusCode,200,r.body);return {cookie:r.cookies.map(c=>`${c.name}=${c.value}`).join('; '),csrf:r.json().csrf};};
  const d=await login('director'),te=await login('teacher'),p=await login('platform');
  try{
    await t.test('unauthenticated and CSRF requests are refused',async()=>{
      assert.equal((await request('GET','/api/director/users')).statusCode,401);
      assert.equal((await request('POST','/api/director/classes',{name:'No CSRF'},{cookie:d.cookie})).statusCode,403);
    });
    await t.test('director sees only own classes; foreign IDs are rejected',async()=>{
      const r=await request('GET','/api/classes',undefined,d);assert.equal(r.statusCode,200,r.body);assert.deepEqual(r.json().classes.map(x=>x.id),[classA.id]);
      for(const path of [`/api/classes/${classB.id}/students`,`/api/classes/${classB.id}/grades`,`/api/classes/${classB.id}/subjects`,`/api/students/${studentB.id}/report`]){
        const denied=await request('GET',path,undefined,d);assert.equal(denied.statusCode,404,denied.body);
      }
    });
    await t.test('teacher can grade assigned subject but cannot manage school',async()=>{
      assert.equal((await request('POST','/api/director/classes',{name:'Denied'},te)).statusCode,403);
      const r=await request('POST','/api/grades',{classId:classA.id,studentId:studentA.id,subjectId:subject.id,term:'T1',score:12},te);assert.equal(r.statusCode,201,r.body);
      const report=await request('GET',`/api/students/${studentA.id}/report`,undefined,d);assert.equal(report.statusCode,200,report.body);assert.equal(report.json().report.termAverages.T1,12);
      const cross=await request('POST','/api/grades',{classId:classB.id,studentId:studentB.id,subjectId:subject.id,term:'T1',score:12},te);assert.equal(cross.statusCode,403,cross.body);
    });
    await t.test('missing grade is not saved as zero',async()=>{
      const r=await request('POST','/api/grades',{classId:classA.id,studentId:studentA.id,subjectId:subject.id,term:'T2',score:''},d);assert.equal(r.statusCode,400,r.body);
    });
    await t.test('platform identity is explicit and account directory stays platform-only',async()=>{
      const identity=await request('GET','/api/auth/me',undefined,p);assert.equal(identity.json().isSuperAdmin,true);assert.equal(identity.json().schoolId,null);assert.deepEqual(identity.json().roles,[]);
      assert.equal((await request('GET','/api/auth/me',undefined,d)).json().isSuperAdmin,false);
      assert.equal((await request('GET','/api/platform/accounts',undefined,d)).statusCode,403);
      const accounts=await request('GET','/api/platform/accounts?role=DIRECTOR',undefined,p);assert.equal(accounts.statusCode,200,accounts.body);assert.equal(accounts.json().accounts.length,2);assert.equal(accounts.body.includes('password_hash'),false);
    });
    await t.test('logout revokes old cookies and allows fresh login for each role',async()=>{
      for(const user of ['platform','director','teacher']){
        const session=await login(user);
        const result=await request('POST','/api/auth/logout',undefined,session);assert.equal(result.statusCode,200,result.body);assert.ok(result.cookies.some(c=>c.value===''));
        assert.equal((await request('GET','/api/auth/me',undefined,session)).statusCode,401);
        const again=await login(user);assert.notEqual(again.cookie,session.cookie);
        assert.equal((await request('GET','/api/auth/me',undefined,again)).json().login,user);
        await request('POST','/api/auth/logout',undefined,again);
      }
    });
    await t.test('platform aggregates see both schools despite forced RLS',async()=>{
      const r=await request('GET','/api/platform/overview',undefined,p);assert.equal(r.statusCode,200,r.body);assert.equal(r.json().overview.students,2);assert.equal(r.json().overview.classes,2);
    });
    await t.test('academic years and curriculum preserve existing grades',async()=>{
      const years=await request('GET','/api/academic-years',undefined,d);assert.equal(years.statusCode,200,years.body);assert.equal(years.json().years[0].name,'2026/2027');
      const made=await request('POST','/api/director/academic-years',{name:'2027/2028'},d);assert.equal(made.statusCode,201,made.body);
      assert.equal((await request('POST','/api/director/academic-years',{name:'2028/2029'},te)).statusCode,403);
      const nc=await request('POST','/api/director/classes',{name:'A1',academicYearId:made.json().id},d);assert.equal(nc.statusCode,201,nc.body);
      assert.equal((await request('PUT',`/api/director/classes/${classB.id}/curriculum`,{subjectIds:[subject.id]},d)).statusCode,404);
      const retained=await request('PUT',`/api/director/classes/${classA.id}/curriculum`,{subjectIds:[]},d);assert.equal(retained.statusCode,409,retained.body);
      const scale=await request('PATCH',`/api/director/subjects/${subject.id}`,{name:'Math',coefficient:1,maxScore:100,version:1},d);assert.equal(scale.statusCode,409,scale.body);
      const assign=await request('POST','/api/director/assignments',{userId:teacher.id,classId:classA.id,subjectId:subject.id,attendance:true},d);assert.equal(assign.statusCode,200,assign.body);
      const crossAssignment=await request('POST','/api/director/assignments',{userId:other.id,classId:classA.id,subjectId:subject.id},d);assert.equal(crossAssignment.statusCode,400,crossAssignment.body);
      const crossCurriculum=await request('PUT',`/api/director/classes/${classB.id}/curriculum`,{subjectIds:[subject.id]},d);assert.equal(crossCurriculum.statusCode,404,crossCurriculum.body);
      const report=await request('GET',`/api/students/${studentA.id}/report`,undefined,d);assert.equal(report.json().report.termAverages.T1,12);
    });
    await t.test('disabled school cannot be selected or used with existing session',async()=>{
      const r=await request('PATCH',`/api/platform/schools/${schoolA.id}/status`,{active:false},p);assert.equal(r.statusCode,200,r.body);
      assert.equal((await request('POST','/api/auth/select-school',{schoolId:schoolA.id},te)).statusCode,403);
      assert.equal((await request('POST','/api/director/classes',{name:'Blocked'},d)).statusCode,403);
      await request('PATCH',`/api/platform/schools/${schoolA.id}/status`,{active:true},p);
    });
    await t.test('director account creation and association are explicit and preserve credentials',async()=>{
      const url=`/api/platform/schools/${schoolA.id}/director`;
      assert.equal((await request('POST',url,{mode:'existing',login:'other'},d)).statusCode,403);
      const duplicate=await request('POST',url,{login:'other',fullName:'Different name',password},p);
      assert.equal(duplicate.statusCode,409,duplicate.body);
      assert.equal((await request('POST',url,{mode:'existing',login:'unknown'},p)).statusCode,404);
      const created=await request('POST',url,{mode:'new',login:'new-director',fullName:'New director',password},p);
      assert.equal(created.statusCode,201,created.body);
      const associated=await request('POST',url,{mode:'existing',login:'other',email:'ignored@example.org'},p);
      assert.equal(associated.statusCode,201,associated.body);assert.equal(associated.json().director.id,other.id);
      assert.equal((await request('POST',url,{mode:'existing',login:'other'},p)).statusCode,201);
      await db.owner();
      const user=await one('SELECT password_hash,full_name FROM users WHERE id=$1',[other.id]);
      assert.equal(user.password_hash,hash);assert.equal(user.full_name,'Other fixture');
      assert.equal((await one("SELECT count(*)::int n FROM membership_roles WHERE user_id=$1 AND role='DIRECTOR'",[other.id])).n,2);
      await db.runtime();
    });
    await t.test('school DELETE archives records and preserves account password',async()=>{
      const r=await request('DELETE',`/api/platform/schools/${schoolB.id}`,undefined,p);assert.equal(r.statusCode,200,r.body);assert.equal(r.json().archived,true);
      await db.owner();assert.equal((await one('SELECT count(*)::int n FROM students WHERE school_id=$1',[schoolB.id])).n,1);
      assert.equal((await one('SELECT password_hash FROM users WHERE id=$1',[other.id])).password_hash,hash);
      await db.runtime();
    });
  }finally{await app.close();await db.close();}
});
