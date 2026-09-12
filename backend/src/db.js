import pg from "pg";
import { config } from "./config.js";
const {Pool}=pg;
export const pool=new Pool({connectionString:config.databaseUrl,ssl:config.nodeEnv==="production"?{rejectUnauthorized:false}:false,max:12,idleTimeoutMillis:30000,connectionTimeoutMillis:10000,statement_timeout:10000,query_timeout:12000,application_name:"ma-madrassa-v4"});
export async function withContext({userId=null,schoolId=null},fn){const client=await pool.connect();try{await client.query("BEGIN");await client.query("SELECT set_config('app.user_id',$1,true)",[userId||""]);await client.query("SELECT set_config('app.school_id',$1,true)",[schoolId||""]);const out=await fn(client);await client.query("COMMIT");return out;}catch(e){try{await client.query("ROLLBACK");}catch{}throw e;}finally{client.release();}}
