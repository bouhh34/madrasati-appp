const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isUuid(v){return UUID_RE.test(String(v||""));}
export function text(v,{min=0,max=200}={}){const s=String(v??"").trim();return s.length>=min&&s.length<=max?s:null;}
export function optionalText(v,{max=200}={}){if(v===null||v===undefined||String(v).trim()==="")return null;return text(v,{min:1,max});}
export function num(v,{min=-Infinity,max=Infinity}={}){const n=Number(v);return Number.isFinite(n)&&n>=min&&n<=max?n:null;}
export function oneOf(v,allowed){const s=String(v??"").toUpperCase();return allowed.includes(s)?s:null;}
export function bool(v){return typeof v==="boolean"?v:null;}
export function stringArray(v,{maxItems=50,maxLen=100}={}){if(!Array.isArray(v)||v.length>maxItems)return null;const out=[];for(const x of v){const s=text(x,{min:1,max:maxLen});if(!s)return null;out.push(s);}return out;}
export function uuidArray(v,{maxItems=100}={}){if(!Array.isArray(v)||v.length>maxItems||v.some(x=>!isUuid(x)))return null;return [...new Set(v.map(String))];}
