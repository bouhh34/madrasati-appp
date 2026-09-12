import crypto from "crypto";
import { config } from "./config.js";
export function randomToken(bytes=32){return crypto.randomBytes(bytes).toString("base64url");}
export function tokenHash(v){return crypto.createHash("sha256").update(String(v||""),"utf8").digest("hex");}
export function sha256Hex(v){return crypto.createHash("sha256").update(v).digest("hex");}
export function hmacHex(v){return crypto.createHmac("sha256",config.auditHmacKey).update(String(v),"utf8").digest("hex");}
export function normalizeLogin(v){return String(v||"").trim().toLowerCase().normalize("NFKC");}
export function normalizeEmail(v){const s=normalizeLogin(v);return s||null;}
export function validPassword(v){const s=String(v||"").normalize("NFKC");const n=[...s].length;return n>=15&&n<=128;}
export function safeEqualText(a,b){const aa=Buffer.from(String(a||""),"utf8"),bb=Buffer.from(String(b||""),"utf8");return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);}
export function isMutation(m){return ["POST","PUT","PATCH","DELETE"].includes(String(m||"").toUpperCase());}
export function redactObject(input){const blocked=new Set(["password","newpassword","token","code","csrf","secret","authorization","cookie"]);const walk=v=>{if(!v||typeof v!=="object")return v;if(Array.isArray(v))return v.map(walk);const o={};for(const[k,x]of Object.entries(v))o[k]=blocked.has(k.toLowerCase())?"[REDACTED]":walk(x);return o;};return walk(input);}
