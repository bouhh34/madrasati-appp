import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'node:fs';

// A disposable PostgreSQL engine. No test can connect to a production URL.
export async function testDatabase(){
  process.env.NODE_ENV='test';
  process.env.DATABASE_URL='postgresql://test:test@127.0.0.1:1/madrasati_test';
  process.env.PASSWORD_PEPPER='local-test-pepper-000000000000000000000';
  process.env.AUDIT_HMAC_KEY='local-test-audit-00000000000000000000000';
  process.env.APP_ORIGIN='http://localhost:3100';
  process.env.BOOTSTRAP_SECRET='local-test-bootstrap-0000000000000000000';
  const db=await PGlite.create({extensions:{pgcrypto}});
  await db.exec('CREATE EXTENSION pgcrypto; CREATE ROLE mm_owner; GRANT CREATE ON DATABASE postgres TO mm_owner; GRANT ALL ON SCHEMA public TO mm_owner; SET ROLE mm_owner;');
  const dir=new URL('../../migrations/',import.meta.url);
  for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.sql')).sort()){
    try{await db.exec(fs.readFileSync(new URL(file,dir),'utf8'));}catch(e){e.message=`Migration ${file}: ${e.message}`;throw e;}
  }
  await db.exec(`RESET ROLE; CREATE ROLE mm_runtime;
    GRANT USAGE ON SCHEMA public,app TO mm_runtime;
    GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO mm_runtime;
    GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO mm_runtime;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO mm_runtime;`);
  const {pool}=await import('../../src/db.js');
  let queue=Promise.resolve();
  async function lock(){let release;const next=new Promise(resolve=>{release=resolve;});const prev=queue;queue=next;await prev;return release;}
  async function query(sql,values=[]){const r=await db.query(sql,values);return {...r,rowCount:r.affectedRows||r.rows.length};}
  pool.query=async(sql,values=[])=>{const release=await lock();try{return await query(sql,values);}finally{release();}};
  pool.connect=async()=>{const release=await lock();return {query,release};};
  const originalEnd=pool.end.bind(pool);
  pool.end=async()=>{};
  return {db,pool,query,async runtime(){await db.exec('SET ROLE mm_runtime');},async owner(){await db.exec('RESET ROLE');},async close(){await originalEnd();await db.close();}};
}
