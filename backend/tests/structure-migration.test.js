import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';

test('academic migration retains populated records and restores forced RLS',async()=>{
  const db=await PGlite.create({extensions:{pgcrypto}});
  try{
    await db.exec('CREATE EXTENSION pgcrypto; CREATE ROLE migration_owner; GRANT CREATE ON DATABASE postgres TO migration_owner; GRANT ALL ON SCHEMA public TO migration_owner; SET ROLE migration_owner;');
    const dir=new URL('../migrations/',import.meta.url);
    for(const f of fs.readdirSync(dir).filter(f=>f.endsWith('.sql')&&f<'008').sort())await db.exec(fs.readFileSync(new URL(f,dir),'utf8'));
    await db.exec(`RESET ROLE;
      INSERT INTO schools(id,name,school_type,academic_year) VALUES('00000000-0000-4000-8000-000000000001','Existing','PUBLIC','2025/2026');
      INSERT INTO classes(school_id,name) SELECT id,'Existing class' FROM schools;
      INSERT INTO subjects(school_id,name) SELECT id,'Existing subject' FROM schools;
      INSERT INTO students(school_id,class_id,student_uid,full_name) SELECT school_id,id,'001','Existing student' FROM classes;
      SET ROLE migration_owner; BEGIN;`);
    await db.exec(fs.readFileSync(new URL('008_academic_structure.sql',dir),'utf8'));
    await db.exec('COMMIT; RESET ROLE;');
    const result=await db.query(`SELECT c.name,y.name academic_year,(SELECT count(*)::int FROM students) students,(SELECT count(*)::int FROM class_subjects) subjects FROM classes c JOIN academic_years y ON y.id=c.academic_year_id`);
    assert.deepEqual(result.rows,[{name:'Existing class',academic_year:'2025/2026',students:1,subjects:1}]);
    const policies=await db.query("SELECT relname,relforcerowsecurity FROM pg_class WHERE relname IN ('classes','subjects','academic_years','class_subjects')");
    assert.equal(policies.rows.length,4);assert.ok(policies.rows.every(x=>x.relforcerowsecurity));
  }finally{await db.close();}
});
