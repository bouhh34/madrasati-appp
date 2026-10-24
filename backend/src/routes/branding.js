import sharp from "sharp";
import {mkdtemp,readFile,rm,stat,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {spawn} from "node:child_process";
import { withContext } from "../db.js";
import { audit } from "../audit.js";
import { sha256Hex } from "../security.js";
import { config } from "../config.js";

const SAFE_IMAGES=new Set(["image/png","image/jpeg","image/webp"]);
const QUARANTINE_DOCS=new Set(["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
async function rasterizePdfFirstPage(source){
  if(source.subarray(0,5).toString("ascii")!=="%PDF-")throw new Error("INVALID_PDF");
  // Use a non-shell, time-limited first-page converter. Never serve PDF source directly.
  const dir=await mkdtemp(path.join(tmpdir(),"madrasati-header-"));
  try{
    const sourcePath=path.join(dir,"source.pdf"),target=path.join(dir,"first");
    await writeFile(sourcePath,source,{mode:0o600});
    try{
      await new Promise((resolve,reject)=>{
        const proc=spawn("pdftoppm",["-f","1","-l","1","-singlefile","-scale-to-x","2200","-scale-to-y","-1","-png",sourcePath,target],{stdio:"ignore"});
        const timer=setTimeout(()=>{proc.kill("SIGKILL");reject(new Error("PDF_TIMEOUT"));},12000);
        proc.once("error",err=>{clearTimeout(timer);reject(err);});
        proc.once("exit",code=>{clearTimeout(timer);code===0?resolve():reject(new Error("PDF_CONVERSION_FAILED"));});
      });
      if((await stat(target+".png")).size>15_000_000)throw new Error("PDF_IMAGE_TOO_LARGE");
      return await readFile(target+".png");
    }catch(e){
      // Some environments expose the PDF loader through Sharp rather than Poppler.
      try{return await sharp(source,{density:125,page:0,limitInputPixels:20_000_000}).png().toBuffer();}
      catch{throw e;}
    }
  }finally{await rm(dir,{recursive:true,force:true});}
}
async function cleanHeader(source,{fromPage=false}={}){
  const input=sharp(source,{failOn:"error",limitInputPixels:20_000_000}).rotate();
  const metadata=await input.metadata();
  if(!metadata.width||!metadata.height)throw new Error("INVALID_IMAGE");
  // Portrait scans or full-page letterhead PDFs: only the upper part is the header.
  const crop=fromPage||(metadata.height/metadata.width>0.55);
  const image=crop?input.extract({left:0,top:0,width:metadata.width,height:Math.max(1,Math.min(metadata.height,Math.round(metadata.height*0.29)))}):input;
  return image.resize({width:2400,height:750,fit:"inside",withoutEnlargement:true})
    .flatten({background:"#ffffff"}).png({compressionLevel:9,adaptiveFiltering:true}).toBuffer();
}


export async function registerBrandingRoutes(app,{requireSession,requireDirector}){
  app.get("/api/branding",async(request,reply)=>{if(!(await requireSession(request,reply)))return;if(!request.auth.schoolId)return{school:null,branding:null};return withContext({userId:request.auth.userId,schoolId:request.auth.schoolId},async c=>{const school=(await c.query("SELECT id,name,school_type FROM schools WHERE id=$1",[request.auth.schoolId])).rows[0]||null;const b=(await c.query("SELECT mode,sanitized_header_mime,source_type,source_sha256,updated_at FROM school_branding WHERE school_id=$1",[request.auth.schoolId])).rows[0]||{mode:"DEFAULT"};return{school,branding:b,headerUrl:b.mode==="CUSTOM"?"/api/branding/header":null};});});

  app.get("/api/branding/header",async(request,reply)=>{if(!(await requireSession(request,reply)))return;if(!request.auth.schoolId)return reply.code(404).send();return withContext({userId:request.auth.userId,schoolId:request.auth.schoolId},async c=>{const q=await c.query("SELECT sanitized_header_mime,sanitized_header_bytes FROM school_branding WHERE school_id=$1 AND mode='CUSTOM'",[request.auth.schoolId]);if(!q.rows[0]?.sanitized_header_bytes)return reply.code(404).send();reply.header("Content-Type",q.rows[0].sanitized_header_mime||"image/png");reply.header("Cache-Control","private, no-cache, max-age=0");reply.header("Content-Disposition",'inline; filename="school-header.png"');return q.rows[0].sanitized_header_bytes;});});

  app.post("/api/director/branding/upload",async(request,reply)=>{if(!(await requireDirector(request,reply,true)))return;const school=(await withContext({userId:request.auth.userId,schoolId:request.auth.schoolId},c=>c.query("SELECT school_type FROM schools WHERE id=$1",[request.auth.schoolId]))).rows[0];if(!school)return reply.code(404).send({error:"SCHOOL_NOT_FOUND"});
    const part=await request.file({limits:{files:1,fileSize:config.maxBrandingBytes}});if(!part)return reply.code(400).send({error:"FILE_REQUIRED"});const chunks=[];for await(const chunk of part.file)chunks.push(chunk);if(part.file.truncated)return reply.code(413).send({error:"FILE_TOO_LARGE"});const source=Buffer.concat(chunks);if(!source.length||source.length>config.maxBrandingBytes)return reply.code(413).send({error:"FILE_TOO_LARGE"});const mime=String(part.mimetype||"").toLowerCase(),name=String(part.filename||"upload").slice(0,180),hash=sha256Hex(source);
    if(QUARANTINE_DOCS.has(mime))return withContext({userId:request.auth.userId,schoolId:request.auth.schoolId},async c=>{const q=await c.query(`INSERT INTO branding_uploads(school_id,source_mime,source_name,source_sha256,source_size,source_bytes,state,created_by) VALUES($1,$2,$3,$4,$5,$6,'QUARANTINED',$7) RETURNING id,state`,[request.auth.schoolId,mime,name,hash,source.length,source,request.auth.userId]);await audit(c,request.auth,"BRANDING_SOURCE_QUARANTINED","branding_upload",q.rows[0].id,{mime,size:source.length});return reply.code(202).send({ok:true,...q.rows[0],message:"SECURE_CONVERSION_REQUIRED"});});
    if(!SAFE_IMAGES.has(mime)&&mime!=="application/pdf")return reply.code(415).send({error:"UNSUPPORTED_FILE_TYPE"});
    let sanitized;try{sanitized=await cleanHeader(mime==="application/pdf"?await rasterizePdfFirstPage(source):source,{fromPage:mime==="application/pdf"});}
    catch(e){return reply.code(e.message==="INVALID_PDF"?400:422).send({error:e.message==="INVALID_PDF"?"INVALID_PDF":"HEADER_CONVERSION_FAILED",message:"تعذر تحويل الملف إلى صورة رأسية آمنة. يمكنك رفع صورة PNG أو JPG بدلًا منه."});}
    return withContext({userId:request.auth.userId,schoolId:request.auth.schoolId},async c=>{const up=await c.query(`INSERT INTO branding_uploads(school_id,source_mime,source_name,source_sha256,source_size,state,created_by,processed_at) VALUES($1,$2,$3,$4,$5,'SANITIZED',$6,now()) RETURNING id`,[request.auth.schoolId,mime,name,hash,source.length,request.auth.userId]);await c.query(`INSERT INTO school_branding(school_id,mode,sanitized_header_mime,sanitized_header_bytes,source_type,source_sha256,updated_by,updated_at) VALUES($1,'CUSTOM','image/png',$2,$3,$4,$5,now()) ON CONFLICT(school_id) DO UPDATE SET mode='CUSTOM',sanitized_header_mime='image/png',sanitized_header_bytes=EXCLUDED.sanitized_header_bytes,source_type=EXCLUDED.source_type,source_sha256=EXCLUDED.source_sha256,updated_by=EXCLUDED.updated_by,updated_at=now()`,[request.auth.schoolId,sanitized,mime,hash,request.auth.userId]);await audit(c,request.auth,"BRANDING_ACTIVATED","school",request.auth.schoolId,{uploadId:up.rows[0].id,mime,sourceSize:source.length,sanitizedSize:sanitized.length});return{ok:true,mode:"CUSTOM",headerUrl:"/api/branding/header"};});
  });

  app.delete("/api/director/branding",async(request,reply)=>{if(!(await requireDirector(request,reply,true)))return;return withContext({userId:request.auth.userId,schoolId:request.auth.schoolId},async c=>{await c.query("INSERT INTO school_branding(school_id,mode,updated_by) VALUES($1,'DEFAULT',$2) ON CONFLICT(school_id) DO UPDATE SET mode='DEFAULT',sanitized_header_mime=NULL,sanitized_header_bytes=NULL,source_type=NULL,source_sha256=NULL,updated_by=EXCLUDED.updated_by,updated_at=now()",[request.auth.schoolId,request.auth.userId]);await audit(c,request.auth,"BRANDING_RESET","school",request.auth.schoolId,{});return{ok:true};});});
}
