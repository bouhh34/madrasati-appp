/* School-scoped, opt-in handwriting transcription. Every row reviewed before saving. */
(function(){
  "use strict";
  const $=id=>document.getElementById(id);
  const esc=x=>escapeHtml(String(x??""));
  let rows=[],busy=false,sourceClassId="";
  const mode=()=> $("geminiMode").value;
  const cls=()=> $("premiumStudentsClass")?.value||"";
  const status=(v)=>{$("geminiStatus").textContent=v;};
  const normal=s=>String(s??"").normalize("NFKC").toLowerCase().replace(/[\u064b-\u065f\u0670]/g,"").replace(/[^\p{L}\p{N}]+/gu," ").trim();
  function invalidate(){rows=[];$("geminiResults").innerHTML="";$("geminiSave").disabled=true;}
  async function updateAvailability(){
    if(!$("premiumGeminiDetails"))return;
    try{
      const data=await api("/api/director/ocr/status");
      $("geminiStart").disabled=!data.enabled;
      $("geminiAvailability").textContent=data.enabled
        ?"الخدمة جاهزة. اختر صورة أو PDF للتجربة."
        :"Gemini غير مفعّل في إعدادات الخادم. يلزم مفتاح API لمشروع مدفوع وإقرار حماية البيانات. يظل استيراد Excel متاحًا.";
    }catch{
      $("geminiStart").disabled=true;
      $("geminiAvailability").textContent="سجّل الدخول بحساب مدير المدرسة للتحقق من إعدادات Gemini.";
    }
  }
  function inputCell(i,key,value,type="text",width=100){
    const props=type==="number"?'type="number" min="0" step="0.01"':'type="text"';
    return '<input '+props+' data-i="'+i+'" data-key="'+key+'" value="'+esc(value??"")+'" style="min-width:'+width+'px" aria-label="'+esc(key)+'">';
  }
  function preview(){
    const isGrade=mode()==="grades";
    const header=isGrade?'<th>اختيار</th><th>الاسم / الرقم المدرسي</th><th>المادة</th><th>الدرجة</th><th>الحد الأعلى</th><th>مراجعة</th>':
      '<th>اختيار</th><th>الاسم</th><th>رقم التلميذ</th><th>رقم الولي</th><th>الجنس</th><th>مراجعة</th>';
    const body=rows.map((r,i)=>{
      const review=r.uncertain?'<span class="gemini-unclear">⚠ غير واضح</span>':'';
      const tip=r.note?'<small>'+esc(r.note)+'</small>':'';
      const choice='<td><input type="checkbox" data-i="'+i+'" data-key="include" '+(r.include?"checked":"")+' aria-label="تحديد السطر"></td>';
      const reviewCell='<td>'+review+tip+'<label class="gemini-check"><input type="checkbox" data-i="'+i+'" data-key="reviewed" '+(r.reviewed?"checked":"")+'> راجعت</label></td>';
      if(isGrade)return '<tr>'+choice+'<td>'+inputCell(i,"fullName",r.fullName)+inputCell(i,"studentUid",r.studentUid,"text",90)+'</td><td>'+inputCell(i,"subject",r.subject, "text",90)+'</td><td>'+inputCell(i,"score",r.score,"number",75)+'</td><td>'+inputCell(i,"maxScore",r.maxScore,"number",75)+'</td>'+reviewCell+'</tr>';
      return '<tr>'+choice+'<td>'+inputCell(i,"fullName",r.fullName)+'</td><td>'+inputCell(i,"studentUid",r.studentUid,"text",95)+'</td><td>'+inputCell(i,"guardianPhone",r.guardianPhone,"text",95)+'</td><td><select data-i="'+i+'" data-key="gender"><option value="" '+(!r.gender?"selected":"")+'>—</option><option value="M" '+(r.gender==="M"?"selected":"")+'>ولد</option><option value="F" '+(r.gender==="F"?"selected":"")+'>بنت</option></select></td>'+reviewCell+'</tr>';
    }).join("");
    $("geminiResults").innerHTML='<p class="premium-soft-text">نتائج مقترحة من الذكاء الاصطناعي، وليست سجلات معتمدة. صحّح كل خانة وحدد «راجعت» قبل الحفظ. أزل اختيار السطر إن كان غير صحيح.</p>'+
      '<div class="gemini-scroller"><table><thead><tr>'+header+'</tr></thead><tbody>'+body+'</tbody></table></div>'+
      (isGrade?'<div class="gemini-grade-settings"><label>المادة المعتمدة في هذا القسم<select id="geminiSubject"><option value="">اختر المادة</option></select></label><label>الفصل<select id="geminiTerm"><option value="T1">الأول</option><option value="T2">الثاني</option><option value="T3">الثالث</option></select></label></div><p class="premium-soft-text">تُطابق الدرجات بالتلميذ الصحيح والمادة المختارة قبل التسجيل. السجلات الموجودة لا تُستبدل تلقائيًا، و«غائب» لا يُسجّل كدرجة صفر.</p>':
       '<label class="family-optin"><input id="geminiGuardianConsent" type="checkbox"> أؤكد أن لدي موافقة أصحاب الأرقام على تلقي رسائل واتساب من المدرسة (اختياري)</label>');
    if(isGrade)loadSubjects();
    $("geminiSave").disabled=false;
  }
  async function loadSubjects(){
    const id=cls(),node=$("geminiSubject");if(!id||!node)return;
    try{
      const {subjects}=await api("/api/classes/"+encodeURIComponent(id)+"/subjects");
      node.innerHTML='<option value="">اختر المادة</option>'+subjects.map(s=>'<option value="'+esc(s.id)+'" data-max="'+esc(s.max_score)+'">'+esc(s.name)+' (من '+esc(s.max_score)+')</option>').join("");
    }catch{status("تعذر تحميل مواد القسم. اختر قسمًا صحيحًا وأعد المحاولة.");}
  }
  async function transcribe(){
    if(busy)return;
    const file=$("geminiFile").files[0];
    if(!cls()){status("اختر القسم أولًا من أعلى لائحة التلاميذ.");return;}
    if(!file){status("اختر صورة أو PDF.");return;}
    if(!$("geminiConsent").checked){status("يلزم الإقرار بالسماح بإرسال هذه النسخة إلى Google قبل القراءة.");return;}
    if(file.size>5*1024*1024){status("الملف أكبر من 5MB.");return;}
    invalidate();sourceClassId=cls();busy=true;$("geminiStart").disabled=true;$("geminiMode").disabled=true;$("geminiFile").disabled=true;status("جارٍ استخراج البيانات بواسطة Gemini…");
    const data=new FormData();data.append("file",file,file.name);
    try{
      const out=await api("/api/director/ocr/gemini?kind="+mode(),{method:"POST",body:data,headers:{"x-ocr-consent":"true"}});
      rows=(out.rows||[]).map(row=>({...row,include:true,reviewed:false}));
      if(!rows.length){status("لم أجد أسطرًا مقروءة. جرّب صورة أوضح أو نسخة أعلى جودة.");return;}
      status("تم استخراج "+rows.length+" سطرًا. تحقق من الأسماء والدرجات والأرقام جميعها قبل الحفظ."+(out.limited?" تم الاكتفاء بأول 200 سجل.":""));
      preview();
    }catch(e){
      const msg={GEMINI_NOT_CONFIGURED:"لم يُضبط مفتاح Gemini أو إعداد حماية البيانات في Render.",GEMINI_RATE_LIMIT:"وصلت إلى حد الطلبات مؤقتًا. أعد المحاولة لاحقًا.",GEMINI_CONNECTION_FAILED:"انقطع الاتصال بخدمة Gemini.",GEMINI_REQUEST_FAILED:"رفضت Google الطلب؛ راجع صلاحية المفتاح والحصة.",GEMINI_INVALID_RESPONSE:"تعذر قراءة النتيجة. جرّب صورة أوضح.",FILE_TOO_LARGE:"الملف كبير جدًا.",UNSUPPORTED_FILE_TYPE:"استخدم PNG أو JPG أو WEBP أو PDF."};
      status(msg[e.data?.error]||"فشل الاستخراج. تحقق من الملف وإعدادات الخدمة.");
    }finally{busy=false;$("geminiMode").disabled=false;$("geminiFile").disabled=false;await updateAvailability();}
  }
  function selected(){
    return rows.filter(r=>r.include);
  }
  function validated(){
    const a=selected();
    if(!a.length){status("حدد سطرًا واحدًا على الأقل.");return null;}
    if(a.some(r=>!r.reviewed)){status("أكد مراجعة كل سطر محدد قبل الحفظ.");return null;}
    if(a.some(r=>!String(r.fullName||"").trim()||String(r.fullName).trim().length<2)){status("اسم واحد على الأقل ناقص. صحّحه أو استبعد السطر.");return null;}
    return a;
  }
  async function saveStudents(items){
    const guardianConsent=!!$("geminiGuardianConsent")?.checked;
    const mapped=items.map(r=>({fullName:r.fullName.trim(),studentUid:String(r.studentUid||"").trim(),guardianPhone:String(r.guardianPhone||"").trim(),gender:r.gender||null,guardianConsent:guardianConsent&&!!r.guardianPhone}));
    if(!confirm("هل تؤكد حفظ "+mapped.length+" تلميذًا في القسم المختار بعد مراجعة أسمائهم وأرقام أولياء الأمور؟"))return;
    let created=0,skipped=0;
    for(let i=0;i<mapped.length;i+=150){
      const result=await api("/api/director/students/import",{method:"POST",body:JSON.stringify({classId:cls(),rows:mapped.slice(i,i+150)})});
      created+=Number(result.created)||0;skipped+=Number(result.skipped)||0;
      status("تم إنشاء "+created+" تلميذًا، وتجاوز "+skipped+" مكررًا/غير صالح.");
    }
    invalidate();
    await Promise.allSettled([premiumLoadStudents(),loadDirectorHome()]);
    status("اكتمل: "+created+" تلميذًا جديدًا، "+skipped+" سطرًا متجاوزًا. لم تتغير درجات التلاميذ الموجودين.");
  }
  async function saveGrades(items){
    const subjectEl=$("geminiSubject"),subjectId=subjectEl?.value,term=$("geminiTerm")?.value;
    if(!subjectId){status("اختر مادة الدرجات قبل الحفظ.");return;}
    const subj=subjectEl.selectedOptions[0],max=Number(subj?.dataset.max),subjectName=subj?.textContent.replace(/\s*\(من .*$/,"").trim()||"";
    if(!(max>0)){status("درجة المادة القصوى غير معروفة.");return;}
    const classId=cls();
    const [studentData,gradesData]=await Promise.all([
      api("/api/classes/"+encodeURIComponent(classId)+"/students"),
      api("/api/classes/"+encodeURIComponent(classId)+"/grades")
    ]);
    const students=studentData.students||[],allGrades=gradesData.grades||[];
    const planned=[],problems=[];
    const used=new Set();
    for(const row of items){
      const name=normal(row.fullName),uid=String(row.studentUid||"").trim();
      const matches=uid?students.filter(s=>s.student_uid===uid):students.filter(s=>normal(s.full_name)===name);
      if(matches.length!==1){problems.push(row.fullName+": الاسم/الرقم غير مطابق لتلميذ واحد");continue;}
      const pupil=matches[0];
      const val=Number(row.score);
      if(row.absent||row.score===null||row.score===""||!Number.isFinite(val)||val<0||val>max){
        problems.push(row.fullName+": الدرجة غائبة أو غير صالحة");continue;
      }
      if(row.maxScore!=null&&row.maxScore!==""&&Number(row.maxScore)!==max){
        problems.push(row.fullName+": الحد الأعلى في الورقة لا يساوي حد المادة");continue;
      }
      if(row.subject&&normal(row.subject)!==normal(subjectName)){
        problems.push(row.fullName+": المادة المستخرجة تختلف عن المختارة");continue;
      }
      if(used.has(pupil.id)||allGrades.some(g=>g.student_id===pupil.id&&g.subject_id===subjectId&&g.term===term&&g.assessment==="MAIN")){
        problems.push(row.fullName+": درجة مكررة أو موجودة بالفعل");continue;
      }
      used.add(pupil.id);
      planned.push({classId,studentId:pupil.id,subjectId,term,assessment:"MAIN",score:val});
    }
    if(problems.length){status("لم يُحفظ شيء. صحح هذه الأسطر أو استبعدها: "+problems.slice(0,8).join("؛ ")+(problems.length>8?"…":""));return;}
    if(!planned.length){status("لا توجد درجات جديدة صالحة للحفظ.");return;}
    if(!confirm("تأكيد إضافة "+planned.length+" درجة في "+subjectName+"، "+term+"؟ لا تُستبدل الدرجات الموجودة."))return;
    let done=0;
    for(const grade of planned){
      try{await api("/api/grades",{method:"POST",body:JSON.stringify(grade)});done++;}
      catch(e){status("تم حفظ "+done+" درجات ثم توقف الإرسال. لم تُستبدل أي درجة سابقة. "+(e.data?.error||""));return;}
    }
    invalidate();status("تم حفظ "+done+" درجة بعد المطابقة والمراجعة، دون تعديل أي درجة سابقة.");
  }
  async function save(){
    if(busy)return;
    if(!cls()){status("اختر القسم أولًا.");return;}
    if(sourceClassId!==cls()){invalidate();status("تغير القسم. أعد استخراج الملف حتى لا تُحفظ البيانات في قسم خاطئ.");return;}
    const chosen=validated();if(!chosen)return;
    busy=true;$("geminiSave").disabled=true;
    try{if(mode()==="grades")await saveGrades(chosen);else await saveStudents(chosen);}
    catch(e){status("تعذر الحفظ، ولم تُحذف السجلات السابقة. "+(e.data?.error||"تحقق من اتصالك"));}
    finally{busy=false;$("geminiSave").disabled=!rows.length;}
  }
  function init(){
    if(!$("premiumGeminiDetails"))return;
    $("premiumGeminiDetails").addEventListener("toggle",()=>{if($("premiumGeminiDetails").open)updateAvailability();});
    $("geminiMode").addEventListener("change",()=>{invalidate();$("geminiFile").value="";});
    $("geminiFile").addEventListener("change",invalidate);
    $("premiumStudentsClass").addEventListener("change",()=>{if(rows.length){invalidate();status("تغير القسم؛ أعد معاينة الوثيقة قبل الحفظ.");}});
    $("geminiStart").addEventListener("click",transcribe);
    $("geminiSave").addEventListener("click",save);
    $("geminiResults").addEventListener("input",e=>{
      const el=e.target,i=Number(el.dataset.i),key=el.dataset.key;
      if(!Number.isInteger(i)||!rows[i]||!key)return;
      rows[i][key]=el.type==="checkbox"?el.checked:el.type==="number"?(el.value===""?null:Number(el.value)):el.value;
      if(key!=="reviewed"&&key!=="include"){rows[i].reviewed=false;const check=$("geminiResults").querySelector('[data-i="'+i+'"][data-key="reviewed"]');if(check)check.checked=false;}
    });
    $("geminiResults").addEventListener("change",e=>{
      const el=e.target,i=Number(el.dataset.i),key=el.dataset.key;
      if(!Number.isInteger(i)||!rows[i]||!key)return;
      rows[i][key]=el.type==="checkbox"?el.checked:el.value;
    });
    updateAvailability();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();