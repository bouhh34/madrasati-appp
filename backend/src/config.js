function required(name){const v=String(process.env[name]||"").trim();if(!v)throw new Error(`${name} is required`);return v;}
const nodeEnv=String(process.env.NODE_ENV||"development");
const databaseUrl=required("DATABASE_URL");
const passwordPepper=required("PASSWORD_PEPPER");
const auditHmacKey=required("AUDIT_HMAC_KEY");
const bootstrapSecret=String(process.env.BOOTSTRAP_SECRET||"");
const superAdminBootstrapLogin=String(process.env.SUPER_ADMIN_BOOTSTRAP_LOGIN||"").trim();
const appOrigin=String(process.env.APP_ORIGIN||"").replace(/\/$/,"");
if(!/^postgres(ql)?:\/\//i.test(databaseUrl))throw new Error("DATABASE_URL must be PostgreSQL");
if(passwordPepper.length<32)throw new Error("PASSWORD_PEPPER must be at least 32 characters");
if(auditHmacKey.length<32)throw new Error("AUDIT_HMAC_KEY must be at least 32 characters");
if(bootstrapSecret&&bootstrapSecret.length<32)throw new Error("BOOTSTRAP_SECRET must be at least 32 characters when enabled");
if(nodeEnv==="production"&&(!appOrigin||!appOrigin.startsWith("https://")))throw new Error("APP_ORIGIN must be an HTTPS origin in production");
export const config={superAdminBootstrapLogin,nodeEnv,databaseUrl,appOrigin,passwordPepper,auditHmacKey,bootstrapSecret,sessionTtlHours:Math.max(1,Math.min(72,Number(process.env.SESSION_TTL_HOURS||12))),sessionIdleMinutes:Math.max(10,Math.min(240,Number(process.env.SESSION_IDLE_MINUTES||45))),trustProxy:String(process.env.TRUST_PROXY||"true")==="true",maxBrandingBytes:Math.max(1024*1024,Math.min(10*1024*1024,Number(process.env.MAX_BRANDING_BYTES||5*1024*1024)))};
