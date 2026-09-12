import test from "node:test";
import assert from "node:assert/strict";

const run=process.env.RUN_DB_TESTS==="1";
if(!run){test("database integration tests are enabled in CI",{skip:true},()=>{});}else{
  const pg=await import("pg");const {Pool}=pg.default||pg;
  const owner=new Pool({connectionString:process.env.DATABASE_URL});
  const runtimeUrl=process.env.RUNTIME_DATABASE_URL;
  test("RLS isolates two schools at database level",async()=>{
    await owner.query("DROP ROLE IF EXISTS mm_runtime_test");await owner.query("CREATE ROLE mm_runtime_test LOGIN PASSWORD 'runtime_test_password'");await owner.query("GRANT CONNECT ON DATABASE ma_madrassa_test TO mm_runtime_test");await owner.query("GRANT USAGE ON SCHEMA public,app TO mm_runtime_test");await owner.query("GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO mm_runtime_test");await owner.query("GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO mm_runtime_test");await owner.query("GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO mm_runtime_test");
    const u1=(await owner.query("INSERT INTO users(login,full_name,password_hash,account_state) VALUES('d1','Director 1','x','ACTIVE') RETURNING id")).rows[0].id;const u2=(await owner.query("INSERT INTO users(login,full_name,password_hash,account_state) VALUES('d2','Director 2','x','ACTIVE') RETURNING id")).rows[0].id;const s1=(await owner.query("INSERT INTO schools(name,school_type,academic_year) VALUES('School A','PUBLIC','2026/2027') RETURNING id")).rows[0].id;const s2=(await owner.query("INSERT INTO schools(name,school_type,academic_year) VALUES('School B','PUBLIC','2026/2027') RETURNING id")).rows[0].id;await owner.query("INSERT INTO school_memberships(school_id,user_id,status) VALUES($1,$2,'ACTIVE'),($3,$4,'ACTIVE')",[s1,u1,s2,u2]);await owner.query("INSERT INTO membership_roles(school_id,user_id,role) VALUES($1,$2,'DIRECTOR'),($3,$4,'DIRECTOR')",[s1,u1,s2,u2]);const c1=(await owner.query("INSERT INTO classes(school_id,name) VALUES($1,'A1') RETURNING id",[s1])).rows[0].id;await owner.query("INSERT INTO classes(school_id,name) VALUES($1,'B1')",[s2]);
    const runtime=new Pool({connectionString:runtimeUrl});const client=await runtime.connect();try{await client.query("BEGIN");await client.query("SELECT set_config('app.user_id',$1,true)",[u1]);await client.query("SELECT set_config('app.school_id',$1,true)",[s1]);const rows=(await client.query("SELECT school_id,name FROM classes ORDER BY name")).rows;assert.equal(rows.length,1);assert.equal(rows[0].school_id,s1);assert.equal(rows[0].name,"A1");await assert.rejects(()=>client.query("INSERT INTO students(school_id,class_id,student_uid,full_name) VALUES($1,$2,'X','Cross Tenant')",[s2,c1]));await client.query("ROLLBACK");}finally{client.release();await runtime.end();}
  });
  test.after(async()=>{await owner.end();});
}
