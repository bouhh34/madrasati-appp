import crypto from "crypto";
for(const name of ["PASSWORD_PEPPER","AUDIT_HMAC_KEY","BOOTSTRAP_SECRET"])console.log(`${name}=${crypto.randomBytes(48).toString("base64url")}`);
