import argon2 from "argon2";
import { config } from "./config.js";
export * from "./security-core.js";
export async function hashPassword(password){return argon2.hash(String(password).normalize("NFKC")+config.passwordPepper,{type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1,hashLength:32});}
export async function verifyPassword(hash,password){try{return await argon2.verify(hash,String(password).normalize("NFKC")+config.passwordPepper);}catch{return false;}}
