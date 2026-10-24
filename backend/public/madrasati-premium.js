/* Director experience inspired by Nataiji; uses existing Madrasati endpoints and permissions.
   Nothing is automatically shared or deleted. All PDF documents use existing verified report routes. */
const premium=id=>document.getElementById(id);
let premiumStudents=[],premiumStudentsGeneration=0,premiumProgressGeneration=0,premiumSaving=false;
const premiumFr=(ar,fr)=>locale==="fr"?fr:ar;
const premiumOption=(id,label)=>'<option value="'+escapeHtml(id)+'">'+escapeHtml(label)+'</option>';
const premiumDirector=()=>!!(me?.schoolId&&me?.roles?.includes("DIRECTOR"));
function premiumUpdateIdentity(){
  if(!premiumDirector())return;
  const school=me?.school||{};
  if(premium("premiumBrandName"))premium("premiumBrandName").textContent=school.name||"مدرستي";
  if(premium("premiumUserName"))premium("premiumUserName").textContent=me.fullName||me.login||"—";
  if(premium("premiumBrandMark"))premium("premiumBrandMark").textContent=(school.name||"م").trim().slice(0,1)||"م";
  if(premium("premiumUserMark"))premium("premiumUserMark").textContent=(me.fullName||"م").trim().slice(0,1)||"م";
  const platformAction=document.querySelector('[data-premium-go="platform"]');
  if(platformAction)platformAction.classList.toggle("hidden",!me.isSuperAdmin);
}
function premiumOnClasses(){
  if(!premiumDirector())return;
  premiumUpdateIdentity();
  const years=[...new Set(currentClasses.map(c=>String(c.academic_year||"").trim()).filter(Boolean))];
  const yearField=premium("premiumHeaderYear"),classField=premium("premiumHeaderClass");
  const preferred=me?.school?.academic_year||years[0]||"";
  const oldYear=yearField.value,oldClass=classField.value;
  yearField.innerHTML=years.map(y=>premiumOption(y,y)).join("")||premiumOption("",premiumFr("السنة الدراسية","Année scolaire"));
  yearField.value=years.includes(oldYear)?oldYear:(years.includes(preferred)?preferred:(years[0]||""));
  const available=currentClasses.filter(c=>!yearField.value||c.academic_year===yearField.value);
  classField.innerHTML=available.map(c=>premiumOption(c.id,c.name)).join("")||premiumOption("",premiumFr("لا توجد أقسام","Aucune classe"));
  const preserved=available.some(c=>c.id===oldClass)?oldClass:available[0]?.id||"";
  classField.value=preserved;
  for(const id of ["premiumStudentsClass","premiumReportsClass"]){
    const el=premium(id);if(!el)continue;
    const current=el.value;
    el.innerHTML=currentClasses.map(c=>premiumOption(c.id,c.name+" · "+(c.academic_year||""))).join("")||premiumOption("","—");
    el.value=currentClasses.some(c=>c.id===current)?current:preserved;
  }
  premiumRefreshHome();
}
async function premiumRefreshHome(){
  if(!premiumDirector())return;
  const id=premium("premiumHeaderClass")?.value,root=premium("premiumSubjectProgress");
  if(!root)return;
  if(!id){root.innerHTML='<p class="premium-empty">أضف قسمًا من الإدارة لعرض نسب إدخال الدرجات.</p>';return;}
  const generation=++premiumProgressGeneration;
  root.innerHTML='<p class="premium-soft-text">جارٍ حساب حالة إدخال النتائج…</p>';
  try{
    const [s,gs,ss]=await Promise.all([
      api("/api/classes/"+encodeURIComponent(id)+"/students"),
      api("/api/classes/"+encodeURIComponent(id)+"/grades"),
      api("/api/classes/"+encodeURIComponent(id)+"/subjects")
    ]);
    if(generation!==premiumProgressGeneration||!me)return;
    const students=(s.students||[]).filter(x=>x.status==="ACTIVE");
    const subjects=ss.subjects||[];
    const grades=gs.grades||[],count=students.length;
    const valid=new Set(students.map(x=>x.id));
    if(!subjects.length){root.innerHTML='<p class="premium-empty">لا توجد مواد مرتبطة بالقسم حاليًا.</p>';return;}
    root.innerHTML=subjects.map(sub=>{
      const filled=new Set(grades.filter(g=>g.subject_id===sub.id&&g.term==="T1"&&g.assessment==="MAIN"&&valid.has(g.student_id)&&g.score!==null).map(g=>g.student_id)).size;
      const ratio=count?Math.round(filled/count*100):0;
      return '<div class="premium-progress-item"><div class="premium-progress-item-head"><strong>'+escapeHtml(sub.name)+
        '</strong><span>'+filled+' / '+count+' · '+ratio+'%</span></div><span class="premium-track"><i style="width:'+ratio+'%"></i></span></div>';
    }).join("");
    premium("premiumProgressDescription").textContent=premiumFr("نسبة الدرجات المسجلة في الفصل الأول لكل مادة (لا تعني اكتمال السنة).","Notes enregistrées au 1er trimestre par matière.");
  }catch(e){
    if(generation===premiumProgressGeneration)root.innerHTML='<p class="premium-empty">تعذر تحميل تقدم الدرجات. استخدم تحديث للمحاولة مجددًا.</p>';
  }
}
function premiumStartGrades(){
  const id=premium("premiumHeaderClass")?.value||currentClasses[0]?.id||"";
  navigate("academic");
  if(id&&premium("classSelect")){
    if(premium("classSelect").value!==id){premium("classSelect").value=id;void loadAcademicScope();}
    else if(!premium("subjectSelect").options.length)void loadAcademicScope();
  }
}
function premiumOnNavigate(page){
  if(!premiumDirector())return;
  premiumUpdateIdentity();
  if(page==="home")void premiumRefreshHome();
  if(page==="students")void premiumLoadStudents();
  if(page==="reports")void premiumPrepareReports();
}
async function premiumLoadStudents(){
  if(!premiumDirector())return;
  const cls=premium("premiumStudentsClass");
  const id=cls?.value||premium("premiumHeaderClass")?.value;
  if(!id){premium("premiumStudentList").innerHTML='<p class="premium-empty">اختر قسمًا لعرض لائحة التلاميذ.</p>';return;}
  if(!cls.value)cls.value=id;
  const n=++premiumStudentsGeneration;
  premium("premiumStudentList").innerHTML='<p class="premium-soft-text">جارٍ تحميل لائحة التلاميذ…</p>';
  try{
    const d=await api("/api/classes/"+encodeURIComponent(id)+"/students");
    if(n!==premiumStudentsGeneration||!me)return;
    premiumStudents=d.students||[];
    premiumRenderStudents();
  }catch(e){if(n===premiumStudentsGeneration)premium("premiumStudentList").innerHTML='<p class="premium-empty">تعذر تحميل التلاميذ، حاول تحديث اللائحة.</p>';}
}
function premiumRenderStudents(){
  const query=(premium("premiumStudentSearch")?.value||"").trim().toLocaleLowerCase();
  const students=premiumStudents.filter(s=>!query||[s.full_name,s.student_uid].some(x=>String(x||"").toLocaleLowerCase().includes(query)));
  premium("premiumStudentCount").textContent=premiumFr(students.length+" تلميذ",students.length+" élèves");
  premium("premiumStudentList").innerHTML=students.length?students.map((s,i)=>`
    <article class="premium-pupil">
      <div class="premium-pupil-top"><span class="premium-roll">${premiumStudents.indexOf(s)+1}</span>
        <div class="premium-pupil-name"><strong>${escapeHtml(s.full_name)}</strong><small>${escapeHtml(s.student_uid||"—")}</small></div>
        <span class="premium-pupil-tag">${s.gender==="F"?"بنت":s.gender==="M"?"ولد":"تلميذ"}</span>
      </div>
      <div class="premium-pupil-actions">
        <button type="button" data-premium-report="${escapeHtml(s.id)}">▤ ${premiumFr("كشف التلميذ","Bulletin")}</button>
        <button type="button" data-premium-family="${escapeHtml(s.id)}">♡ ${premiumFr("ولي الأمر","Tuteur")}</button>
         <button type="button" data-premium-edit="${escapeHtml(s.id)}">✎ ${premiumFr("تعديل","Modifier")}</button>
      </div>
    </article>`).join(""):'<p class="premium-empty">لا يوجد تلاميذ مطابقون. يمكنك إضافة تلميذ من النموذج أعلاه.</p>';
}
async function premiumCreatePupil(){
  if(!premiumDirector()||premiumSaving)return;
  const classId=premium("premiumStudentsClass").value,name=premium("premiumNewName").value.trim();
  const phone=premium("premiumGuardianPhone").value.trim(),consent=premium("premiumGuardianConsent").checked;
  const uid=premium("premiumNewId").value.trim(),gender=premium("premiumNewGender").value;
  if(!classId){toast("اختر القسم أولًا");return;}
  if([...name].length<2){toast("أدخل اسمًا كاملًا من حرفين على الأقل");premium("premiumNewName").focus();return;}
  if(consent&&!phone){toast("أدخل رقم ولي الأمر قبل تفعيل الموافقة");premium("premiumGuardianPhone").focus();return;}
  premiumSaving=true;const button=premium("premiumCreateStudent");button.disabled=true;
  try{
    const result=await api("/api/director/students",{method:"POST",body:JSON.stringify({classId,fullName:name,studentUid:uid,gender:gender||null,guardianPhone:phone,guardianConsent:consent})});
    premium("premiumNewName").value="";premium("premiumNewId").value="";
    premium("premiumGuardianPhone").value="";premium("premiumGuardianConsent").checked=false;
    toast("حُفظ التلميذ بنجاح · الرقم: "+(result.student_uid||uid));
    await Promise.allSettled([premiumLoadStudents(),loadDirectorHome()]);
    premium("premiumNewName").focus();
  }catch(e){toast(e.data?.error==="STUDENT_EXISTS"?"رقم التلميذ مسجل من قبل":e.data?.error==="INVALID_CLASS"?"القسم غير صالح":"تعذر الحفظ. راجع الاسم ورقم ولي الأمر واتصالك.");}
  finally{premiumSaving=false;button.disabled=false;}
}
async function premiumPrepareReports(){
  if(!premiumDirector())return;
  const field=premium("premiumReportsClass");
  if(!field.value)field.value=premium("premiumHeaderClass").value;
  const classId=field.value;
  const studentsEl=premium("premiumReportsStudent");
  studentsEl.innerHTML=premiumOption("",premiumFr("اختر التلميذ","Choisir un élève"));
  if(!classId)return;
  try{
    const d=await api("/api/classes/"+encodeURIComponent(classId)+"/students");
    const list=(d.students||[]).filter(x=>x.status==="ACTIVE");
    if(classId!==field.value)return;
    studentsEl.innerHTML=premiumOption("",premiumFr("اختر التلميذ","Choisir un élève"))+list.map(x=>premiumOption(x.id,x.full_name)).join("");
    premium("premiumReportCount").textContent=list.length+" تلميذ · "+(currentClasses.find(x=>x.id===classId)?.name||"");
  }catch{premium("premiumReportCount").textContent="تعذر تحميل التلاميذ لهذا القسم.";}
}
function premiumPrintReport(){
  const cls=premium("premiumReportsClass").value,term=premium("premiumReportsTerm").value;
  const mode=premium("premiumReportsFormat").value,student=premium("premiumReportsStudent").value;
  if(!cls){toast("اختر قسمًا أولًا");return;}
  if(mode==="student"&&!student){toast("اختر التلميذ أولًا");return;}
  const params=new URLSearchParams({term,lang:locale});
  if(mode==="student")params.set("studentId",student);
  else{params.set("classId",cls);if(mode==="roster")params.set("format","roster");}
  const target="/print.html?"+params;
  window.open(target,"_blank","noopener");
}
function premiumMoreRoute(route){
  if(!premiumDirector())return;
  if(route==="attendance"){document.querySelector('[data-attendance-nav="bottom"]')?.click();return;}
  if(route==="exams"){document.querySelector('[data-exams-nav="bottom"]')?.click();return;}
  if(route==="platform"){premium("returnPlatform")?.click();return;}
  if(route==="logout"){premium("accountLogout")?.click();return;}
  if(route==="language"){premium("langToggle2")?.click();return;}
  navigate(route);
}
(function(){
  const header=premium("premiumMobileHeader");if(!header)return;
  premium("premiumHeaderYear").addEventListener("change",premiumOnClasses);
  premium("premiumHeaderClass").addEventListener("change",()=>{
    const selected=premium("premiumHeaderClass").value;
    if(premium("premiumStudentsClass"))premium("premiumStudentsClass").value=selected;
    if(premium("premiumReportsClass"))premium("premiumReportsClass").value=selected;
    premiumRefreshHome();
    if(premium("page-students")?.classList.contains("active"))premiumLoadStudents();
    if(premium("page-reports")?.classList.contains("active"))premiumPrepareReports();
  });
  premium("premiumStartGrades").onclick=premiumStartGrades;
  premium("premiumOpenStudents").onclick=()=>navigate("students");
  premium("premiumProgressRefresh").onclick=premiumRefreshHome;
  premium("premiumStudentsClass").onchange=premiumLoadStudents;
  premium("premiumStudentSearch").oninput=premiumRenderStudents;
  premium("premiumStudentsRefresh").onclick=premiumLoadStudents;
  premium("premiumCreateStudent").onclick=premiumCreatePupil;
  premium("premiumNewName").onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();premiumCreatePupil();}};
  premium("premiumStudentList").onclick=event=>{
    const report=event.target.closest("[data-premium-report]"),family=event.target.closest("[data-premium-family]"),edit=event.target.closest("[data-premium-edit]");
    if(edit){window.schoolStudentTools?.openEdit(edit.dataset.premiumEdit);return;}
    if(report){openReport(report.dataset.premiumReport);return;}
    if(family){const chosen=premiumStudents.find(x=>x.id===family.dataset.premiumFamily);
      navigate("family");
      // Family panel loading is independent of the students page.
      const search=premium("familySearch");if(search&&chosen)search.value=chosen.full_name;
    }
  };
  premium("premiumReportsClass").onchange=premiumPrepareReports;
  premium("premiumReportsFormat").onchange=()=>{
    premium("premiumReportsStudentWrap").classList.toggle("hidden",premium("premiumReportsFormat").value!=="student");
  };
  premium("premiumReportPrint").onclick=premiumPrintReport;
  document.querySelector("[data-premium-report-family]")?.addEventListener("click",()=>navigate("family"));
  premium("page-more").addEventListener("click",e=>{
    const card=e.target.closest("[data-premium-go]");if(card)premiumMoreRoute(card.dataset.premiumGo);
  });

  // Keep the header section in sync with the page's chosen class, without overwriting unsaved grades.
  const headerClass=premium("premiumHeaderClass");
  const gradeClass=premium("classSelect");
  if(headerClass&&gradeClass){
    gradeClass.addEventListener("change",()=>{
      const value=gradeClass.value;
      if(value&&[...headerClass.options].some(o=>o.value===value)){
        headerClass.value=value;
        if(premium("premiumStudentsClass"))premium("premiumStudentsClass").value=value;
        if(premium("premiumReportsClass"))premium("premiumReportsClass").value=value;
      }
    });
  }
  if(premiumDirector())premiumOnClasses();
})();