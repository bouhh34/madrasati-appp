"use strict";
const el=(id)=>document.getElementById(id);
function notice(message,error=false){
  el("state").textContent=message;
  el("state").className=error?"error":"";
}
async function request(url,body,secret){
  const headers={"Content-Type":"application/json"};
  if(secret)headers["x-bootstrap-secret"]=secret;
  if(body&&body.csrf){headers["x-csrf-token"]=body.csrf;delete body.csrf;}
  const response=await fetch(url,{
    method:"POST",credentials:"same-origin",cache:"no-store",
    headers,body:JSON.stringify(body||{})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||"HTTP_"+response.status);
  return data;
}
async function activate(secret,csrf){
  return request("/api/platform/bootstrap-super-admin",{csrf},secret);
}
async function check(){
  try{
    const response=await fetch("/api/setup/status",{credentials:"same-origin",cache:"no-store"});
    if(!response.ok)throw Error("DATABASE_UNAVAILABLE");
    const data=await response.json();
    if(data.configured){
      notice("قاعدة البيانات فيها مدرسة سابقة. لا يمكن إنشاء أول حساب مرة ثانية. يمكنك استعمال إكمال التفعيل أدناه.");
    }else{
      el("fields").disabled=false;
      notice("قاعدة البيانات متصلة وفارغة. يمكنك إنشاء حساب مالك المنصة.");
    }
  }catch{
    notice("لا يمكن الاتصال بقاعدة البيانات. افحص DATABASE_URL في Render وحالة نشر مدرستي.",true);
  }
}
el("setupForm").addEventListener("submit",async (event)=>{
  event.preventDefault();
  const p=el("password").value,secret=el("secret").value.trim();
  if(p!==el("confirm").value){notice("تأكيد كلمة المرور غير مطابق.",true);return;}
  if([...p.normalize("NFKC")].length<15){notice("كلمة المرور يجب ألا تقل عن 15 حرفًا.",true);return;}
  const button=el("create");button.disabled=true;
  let created=false;
  try{
    notice("إنشاء الحساب التجريبي...");
    const result=await request("/api/setup/bootstrap",{
      login:"platform-owner",fullName:el("name").value.trim(),
      email:el("email").value.trim()||null,password:p,
      schoolName:el("school").value.trim(),schoolType:el("schoolType").value,
      academicYear:"2026/2027"
    },secret);
    created=true;
    notice("تم إنشاء الحساب. جارٍ تفعيل صلاحية المالك...");
    await activate(secret,result.csrf);
    el("fields").disabled=true;
    notice("تم إنشاء مالك المنصة بصلاحية Super Admin. اسم الدخول: platform-owner. ادخل إلى مدرستي بكلمة المرور التي اخترتها.");
  }catch(err){
    notice((created?"تم إنشاء الحساب، ولكن لم تكتمل صلاحية المالك. استخدم قسم إكمال التفعيل بالأسفل. ":"لم يتم تأكيد إنشاء الحساب. ")+err.message,true);
  }finally{
    el("secret").value="";el("password").value="";el("confirm").value="";
    button.disabled=false;
  }
});
el("finishForm").addEventListener("submit",async (event)=>{
  event.preventDefault();
  const p=el("existingPassword").value,secret=el("finishSecret").value.trim();
  const button=el("finish");button.disabled=true;
  try{
    notice("التحقق من حساب المالك...");
    const auth=await request("/api/auth/login",{login:"platform-owner",password:p});
    await activate(secret,auth.csrf);
    notice("اكتمل تفعيل Super Admin. افتح مدرستي وسجّل الدخول باسم platform-owner.");
  }catch(err){
    notice("تعذر إكمال التفعيل: "+err.message,true);
  }finally{
    el("existingPassword").value="";el("finishSecret").value="";button.disabled=false;
  }
});
check();
