import crypto from "crypto";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config.js";
import { pool } from "./db.js";
import { loadSession,steppedUp } from "./auth.js";
import { tokenHash,safeEqualText,isMutation } from "./security.js";
import { hasRole } from "./permissions.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerDirectorRoutes } from "./routes/director.js";
import { registerAcademicRoutes } from "./routes/academic.js";
import { registerBrandingRoutes } from "./routes/branding.js";
import { registerProductRoutes } from "./routes/product.js";
import { registerReportVerifyRoutes } from "./routes/reportVerify.js";
import { registerSuperAdminRoutes } from "./routes/SuperAdmin.js";
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const AUTH_ORIGIN_EXEMPT=new Set(["/api/auth/login","/api/auth/register","/api/auth/password/forgot","/api/auth/password/reset","/api/setup/bootstrap"]);

export async function buildApp(){
  const app=Fastify({logger:{redact:["req.headers.cookie","req.headers.authorization","req.headers.x-csrf-token","req.body.password","req.body.newPassword","req.body.code","req.body.token"]},trustProxy:config.trustProxy,bodyLimit:256*1024,requestIdHeader:"x-request-id",genReqId:()=>crypto.randomUUID()});
  await app.register(cookie);
  const cspDirectives={
    defaultSrc:["'self'"],
    scriptSrc:["'self'"],
    styleSrc:["'self'"],
    imgSrc:["'self'","data:","blob:"],
    fontSrc:["'self'"],
    connectSrc:["'self'"],
    objectSrc:["'none'"],
    baseUri:["'none'"],
    frameAncestors:["'none'"],
    formAction:["'self'"]
  };
  if(config.nodeEnv==="production")cspDirectives.upgradeInsecureRequests=[];
  await app.register(helmet,{contentSecurityPolicy:{directives:cspDirectives},referrerPolicy:{policy:"no-referrer"},crossOriginEmbedderPolicy:false,crossOriginOpenerPolicy:{policy:"same-origin"},crossOriginResourcePolicy:{policy:"same-origin"}});
  await app.register(rateLimit,{global:true,max:240,timeWindow:"1 minute"});
  await app.register(multipart,{limits:{files:1,fileSize:config.maxBrandingBytes,fields:10,parts:12}});
  await app.register(fastifyStatic,{root:path.join(__dirname,"../public"),prefix:"/"});

  app.addHook("onRequest",async(request,reply)=>{
    request.auth=await loadSession(request);
    if(isMutation(request.method)&&!AUTH_ORIGIN_EXEMPT.has(request.url.split("?")[0])){
      const origin=String(request.headers.origin||"");
      if(config.appOrigin&&origin!==config.appOrigin)return reply.code(403).send({error:"ORIGIN_REJECTED"});
    }
  });
  app.addHook("onSend",async(request,reply,payload)=>{reply.header("X-Request-ID",request.id);reply.header("Permissions-Policy","camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()");if(request.url.startsWith("/api/"))reply.header("Cache-Control","no-store, max-age=0");return payload;});

  const requireSession=async(request,reply)=>{if(!request.auth){reply.code(401).send({error:"AUTH_REQUIRED"});return false;}return true;};
  const requireMutation=async(request,reply)=>{if(!(await requireSession(request,reply)))return false;const csrf=String(request.headers["x-csrf-token"]||"");if(!csrf||!safeEqualText(tokenHash(csrf),request.auth.csrfHash)){reply.code(403).send({error:"CSRF_REJECTED"});return false;}return true;};
  const requireDirector=async(request,reply,stepUp=false,mode=null)=>{const safe=(mode==="GET")||["GET","HEAD","OPTIONS"].includes(request.method);if(safe){if(!(await requireSession(request,reply)))return false;}else if(!(await requireMutation(request,reply)))return false;if(!request.auth.schoolId||!hasRole(request.auth,"DIRECTOR")){reply.code(403).send({error:"DIRECTOR_ONLY"});return false;}if(stepUp&&!steppedUp(request.auth)){reply.code(403).send({error:"STEP_UP_REQUIRED"});return false;}return true;};

  app.get("/api/health",async()=>({ok:true,service:"ma-madrassa-production-v4"}));
  app.get("/api/ready",async(request,reply)=>{try{await pool.query("SELECT 1");return{ok:true};}catch{return reply.code(503).send({ok:false});}});

  await registerAuthRoutes(app,{requireSession,requireMutation});
 await registerSuperAdminRoutes(app,{requireMutation});
  await registerDirectorRoutes(app,{requireDirector});
  await registerAcademicRoutes(app,{requireSession,requireMutation});
await registerReportVerifyRoutes(app,{requireMutation});
  await registerBrandingRoutes(app,{requireSession,requireDirector});
await registerProductRoutes(app,{requireSession,requireMutation});
  app.setNotFoundHandler((request,reply)=>{if(request.url.startsWith("/api/"))return reply.code(404).send({error:"NOT_FOUND"});return reply.sendFile("index.html");});
  app.setErrorHandler((error,request,reply)=>{request.log.error({err:error},"request failed");if(reply.sent)return;const pgDenied=error?.code==="42501";const status=pgDenied?403:(error.statusCode>=400&&error.statusCode<600?error.statusCode:500);reply.code(status).send({error:pgDenied?"ACCESS_DENIED":status===500?"INTERNAL_SERVER_ERROR":error.message});});
  return app;
}
