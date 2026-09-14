let schoolView=false,logoutPending=false,loginPending=false,authGeneration=0,loginRetryAt=0;
let csrf="",me=null,locale="ar",currentClasses=[],currentSubjects=[],currentStudents=[],currentGrades=[];
const $=id=>document.getElementById(id);const qsa=s=>[...document.querySelectorAll(s)];
const FR={"مرحبًا بعودتك":"Bon retour","دخول":"Connexion","إنشاء حساب":"Créer un compte","اسم المستخدم":"Nom d’utilisateur","كلمة المرور":"Mot de passe","دخول آمن":"Connexion sécurisée","نسيت كلمة المرور؟":"Mot de passe oublié ?","الاسم الكامل":"Nom complet","البريد الإلكتروني (اختياري)":"E-mail (facultatif)","كلمة مرور طويلة":"Mot de passe long","إنشاء الحساب":"Créer le compte","الحساب جاهز بدون صلاحيات مدرسية":"Compte prêt, sans accès scolaire","الانضمام إلى المدرسة":"Rejoindre l’école","رمز الانضمام":"Code d’accès","تفعيل الصلاحيات":"Activer les autorisations","تسجيل الخروج":"Déconnexion","اختر المدرسة":"Choisir l’école","الرئيسية":"Accueil","الأقسام والنتائج":"Classes et résultats","أبنائي":"Mes enfants","إدارة المدرسة":"Administration","الأمان والسجل":"Sécurité et journal","الإعدادات":"Paramètres","الأقسام":"Classes","التلاميذ":"Élèves","المواد":"Matières","المستخدمون":"Utilisateurs","أقسامك":"Vos classes","الإشعارات":"Notifications","اختر قسمًا":"Choisir une classe","اختر مادة":"Choisir une matière","الفصل الأول":"Trimestre 1","الفصل الثاني":"Trimestre 2","الفصل الثالث":"Trimestre 3","درجات التلاميذ":"Notes des élèves","إضافة قسم":"Ajouter une classe","اسم القسم":"Nom de la classe","المستوى":"Niveau","الشعبة":"Section","إنشاء القسم":"Créer la classe","إضافة مادة":"Ajouter une matière","اسم المادة":"Matière","المعامل":"Coefficient","الدرجة القصوى":"Note maximale","إضافة المادة":"Ajouter la matière","إضافة تلميذ":"Ajouter un élève","رقم التلميذ":"Identifiant élève","الجنس":"Sexe","ولد":"Garçon","بنت":"Fille","إضافة التلميذ":"Ajouter l’élève","دعوة آمنة":"Invitation sécurisée","الدور":"Rôle","معلم":"Enseignant","ولي تلميذ":"Tuteur","مدير إضافي":"Directeur supplémentaire","اسم المستخدم المستهدف":"Utilisateur ciblé","بدون قسم محدد":"Sans classe précise","بدون مادة محددة":"Sans matière précise","التلميذ":"Élève","إنشاء رمز لمرة واحدة":"Créer un code à usage unique","حسابات المدرسة":"Comptes de l’école","تحديث":"Actualiser","سجل العمليات":"Journal d’audit","مبادئ الحماية":"Principes de sécurité","رأسية المدرسة":"En-tête de l’école","رفع ومعالجة الرأسية":"Importer et traiter l’en-tête","الحساب":"Compte","الاسم":"Nom","المدرسة":"École","متصل وآمن":"Connecté et sécurisé"};
function tr(s){return locale==="fr"?(FR[s]||s):s}
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function toast(msg){const t=$("toast");t.textContent=tr(msg);t.classList.remove("hidden");clearTimeout(t._tm);t._tm=setTimeout(()=>t.classList.add("hidden"),3000)}
async function api(url,options={}){const method=(options.method||"GET").toUpperCase(),headers={...(options.headers||{})};if(options.body&&!(options.body instanceof FormData)&&!headers["Content-Type"])headers["Content-Type"]="application/json";if(["POST","PUT","PATCH","DELETE"].includes(method)&&csrf)headers["X-CSRF-Token"]=csrf;const r=await fetch(url,{credentials:"same-origin",...options,headers});let data={};const ct=r.headers.get("content-type")||"";if(ct.includes("application/json")){try{data=await r.json()}catch{}}if(!r.ok){const e=new Error(data.error||`HTTP_${r.status}`);e.data=data;e.status=r.status;const retry=r.headers.get("retry-after");e.retryAfter=retry?(Number(retry)||Math.ceil((Date.parse(retry)-Date.now())/1000)):0;throw e}return data}
async function refreshCsrf(){try{csrf=(await api("/api/auth/csrf")).csrf||csrf}catch{}}
function hideAll(){["authShell","pendingView","schoolChooser","appShell"].forEach(id=>$(id)?.classList.add("hidden"))}
function showAuth(){hideAll();$("authShell").classList.remove("hidden")}
function setTab(register){$("registerPane").classList.toggle("hidden",!register);$("loginPane").classList.toggle("hidden",register);$("registerTab").classList.toggle("active",register);$("loginTab").classList.toggle("active",!register);$("authTitle").textContent=tr(register?"إنشاء حساب":"مرحبًا بعودتك")}
async function authApi(url,options={},timeoutMs=60000){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{return await api(url,{...options,signal:controller.signal});}finally{clearTimeout(timer);}
}
async function boot(){
  const generation=authGeneration;
  try{const account=await authApi("/api/auth/me",{},20000);if(generation!==authGeneration)return;me=account;await refreshCsrf();if(generation!==authGeneration)return;await openForMe();}
  catch{if(generation===authGeneration)showAuth();}
}

async function openForMe(){

  document.body.classList.toggle('platform-mode',!!me?.isSuperAdmin&&!schoolView);
  document.body.classList.toggle('school-preview',!!me?.isSuperAdmin&&schoolView);
  if(me?.isSuperAdmin&&!schoolView){
    hideAll();$('appShell').classList.remove('hidden');
    renderPlatformProfile();navigate('super-admin');platformSection('overview');
    await loadSuperAdminDashboard();return;
  }
  if(!me?.schoolId){
    try{
      const d=await api("/api/auth/schools");

      if(d.schools?.length){
        return showSchoolChooser(d.schools);
      }
    }catch{}

    hideAll();
    $("pendingView").classList.remove("hidden");
    return;
  }

  hideAll();

  $("appShell").classList.remove("hidden");

  applyRoleVisibility();
  renderProfile();

  await Promise.all([
    loadClasses(),
    loadNotifications(),
    loadBranding()
  ]);

  if((me.roles||[]).includes("DIRECTOR")){
    await loadDirectorHome();
    await loadInviteSubjects();
  }

  if((me.roles||[]).includes("GUARDIAN")){
    await loadChildren();
  }

  navigate("home");
}
function showSchoolChooser(schools){hideAll();$("schoolChooser").classList.remove("hidden");$("schoolChoices").innerHTML=schools.map(s=>`<button type="button" data-school="${s.id}"><b>${escapeHtml(s.name)}</b><br><small>${escapeHtml((s.roles||[]).join(" • "))}</small></button>`).join("");qsa("[data-school]").forEach(b=>b.onclick=()=>selectSchool(b.dataset.school))}
async function selectSchool(id){try{const d=await api("/api/auth/select-school",{method:"POST",body:JSON.stringify({schoolId:id})});csrf=d.csrf||csrf;me=await api("/api/auth/me");schoolView=!!me.isSuperAdmin;await openForMe()}catch{toast("تعذر اختيار المدرسة")}}
function loginFeedback(ar,fr){
  const node=$("loginStatus");node.textContent=locale==="fr"?fr:ar;node.classList.remove("hidden");
}
async function login(){
  if(loginPending)return;
  if(Date.now()<loginRetryAt){
    const minutes=Math.max(1,Math.ceil((loginRetryAt-Date.now())/60000));
    loginFeedback(`محاولات كثيرة. انتظر ${minutes} دقيقة قبل المحاولة مجددًا.`,`Trop de tentatives. Réessayez dans ${minutes} min.`);return;
  }
  if(!$("login").value.trim()||!$("password").value){loginFeedback("أدخل اسم المستخدم وكلمة المرور.","Saisissez votre identifiant et votre mot de passe.");return;}
  loginPending=true;authGeneration++;
  const button=$("loginBtn");button.disabled=true;button.setAttribute("aria-busy","true");
  button.textContent=locale==="fr"?"Connexion en cours…":"جارٍ تسجيل الدخول…";
  loginFeedback("جارٍ الاتصال بالخادم…","Connexion au serveur…");
  const slow=setTimeout(()=>loginFeedback("الخادم يستغرق وقتًا أطول. ننتظر الرد؛ لا حاجة للضغط مجددًا.","Le serveur met plus de temps à répondre. Inutile de cliquer à nouveau."),8000);
  try{
    const d=await authApi("/api/auth/login",{method:"POST",body:JSON.stringify({login:$("login").value.trim(),password:$("password").value})});
    csrf=d.csrf||"";
    me=await authApi("/api/auth/me",{},20000);
    $("password").value="";$("loginStatus").classList.add("hidden");
    try{await openForMe();}catch{toast(locale==="fr"?"Connexion réussie, mais certaines données ne se chargent pas. Actualisez la page.":"تم الدخول، لكن تعذر تحميل بعض البيانات. حدّث الصفحة.");}
  }catch(e){
    if(e.status===429){
      const seconds=Math.max(1,e.retryAfter||900);loginRetryAt=Date.now()+seconds*1000;
      const minutes=Math.ceil(seconds/60);
      loginFeedback(`محاولات كثيرة. انتظر ${minutes} دقيقة قبل المحاولة مجددًا.`,`Trop de tentatives. Réessayez dans ${minutes} min.`);
    }else if(e.status===401){
      loginFeedback("تحقق من بيانات الدخول. قد يكون الحساب مقيدًا مؤقتًا بعد محاولات فاشلة.","Vérifiez vos identifiants. Le compte peut être temporairement bloqué après plusieurs échecs.");
    }else if(e.status===403){
      loginFeedback("تعذر التحقق من الطلب. حدّث الصفحة ثم حاول مجددًا.","La requête n’a pas pu être vérifiée. Actualisez la page et réessayez.");
    }else{
      loginFeedback("تعذر إكمال الاتصال. تحقق من الإنترنت ثم حدّث الصفحة للتحقق من الجلسة قبل إعادة المحاولة.","Connexion interrompue. Vérifiez votre réseau puis actualisez la page pour vérifier la session avant de réessayer.");
    }
  }finally{
    clearTimeout(slow);loginPending=false;button.disabled=false;button.removeAttribute("aria-busy");button.textContent=tr("دخول آمن");
  }
}
async function register(){try{const d=await api("/api/auth/register",{method:"POST",body:JSON.stringify({fullName:$("fullName").value.trim(),login:$("newLogin").value.trim(),email:$("email").value.trim()||null,password:$("newPassword").value})});csrf=d.csrf||"";me=await api("/api/auth/me");await openForMe();toast("تم إنشاء الحساب. اطلب رمز الانضمام من المدير")}catch(e){toast(e.data?.error==="ACCOUNT_ALREADY_EXISTS"?"اسم المستخدم أو البريد مستخدم مسبقًا":"تحقق من البيانات وكلمة المرور")}}
async function redeem(){try{const d=await api("/api/invites/redeem",{method:"POST",body:JSON.stringify({code:$("inviteCode").value.trim()})});csrf=d.csrf||csrf;me=await api("/api/auth/me");await openForMe();toast("تم تفعيل الصلاحيات") }catch{toast("الرمز غير صالح أو ليس مخصصًا لهذا الحساب")}}
async function bootstrapSuperAdmin(){
  const secret=prompt("أدخل مفتاح تهيئة مالك المنصة");
  if(!secret)return;

  try{
    const d=await api("/api/platform/bootstrap-super-admin",{
      method:"POST",
      headers:{"x-bootstrap-secret":secret}
    });
    alert("تم تفعيل SUPER ADMIN بنجاح");
    location.reload();
  }catch(e){
    alert(e.message||"فشل التفعيل");
  }
}
async function logout(){
  if(logoutPending)return;
  logoutPending=true;qsa('[data-logout],#logoutBtn,#chooserLogout,#pendingLogout').forEach(b=>b.disabled=true);
  try{
    try{await api('/api/auth/logout',{method:'POST'});}catch(e){
      if(e.status!==403)throw e;
      await refreshCsrf();await api('/api/auth/logout',{method:'POST'});
    }
    csrf='';me=null;schoolView=false;currentClasses=[];currentSubjects=[];currentStudents=[];currentGrades=[];
    document.querySelectorAll('input,textarea').forEach(el=>{el.value='';});
    $('modalBody')?.replaceChildren();hideAll();
    // A fresh document discards module closures, outstanding requests and prior account DOM.
    window.location.replace('/');
  }catch{toast(locale==='fr'?'Déconnexion impossible. Réessayez.':'تعذر إنهاء الجلسة. أعد المحاولة.');}
  finally{logoutPending=false;qsa('[data-logout],#logoutBtn,#chooserLogout,#pendingLogout').forEach(b=>b.disabled=false);}
}
function renderPlatformProfile(){
  $('schoolNameSide').textContent=locale==='fr'?'Administration de la plateforme':'إدارة المنصة';
  $('schoolTypeBadge').textContent='SUPER ADMIN';$('roleText').textContent='SUPER ADMIN';
  $('hello').textContent=me.fullName||me.login;$('avatar').textContent=(me.fullName||me.login||'M').charAt(0);
  $('roleSwitcher')?.classList.add('hidden');
}

function applyRoleVisibility(){const roles=me.roles||[];qsa(".director-only").forEach(x=>x.classList.toggle("hidden",!roles.includes("DIRECTOR")));qsa(".guardian-only").forEach(x=>x.classList.toggle("hidden",!roles.includes("GUARDIAN")));const pureGuardian=roles.includes("GUARDIAN")&&!roles.includes("DIRECTOR")&&!roles.includes("TEACHER");qsa('[data-page="academic"]').forEach(x=>x.classList.toggle("hidden",pureGuardian))}
function renderProfile(){const school=me.school||{};$("hello").textContent=me.fullName||me.login;$("avatar").textContent=(me.fullName||"م").trim().charAt(0);$("roleText").textContent=(me.roles||[]).map(r=>({DIRECTOR:"مدير",ADMIN:"إداري",TEACHER:"معلم",GUARDIAN:"ولي تلميذ"}[r]||r)).join(" • ");$("schoolNameSide").textContent=school.name||"—";$("schoolTypeBadge").textContent=school.school_type==="PRIVATE"?"مدرسة خصوصية":"مدرسة عمومية";$("profileName").textContent=me.fullName||"—";$("profileRoles").textContent=$("roleText").textContent;$("profileSchool").textContent=school.name||"—"}
function navigate(page){if(!me)return;if(me.isSuperAdmin&&!schoolView)page="super-admin";else if(page==="super-admin")page="home";qsa(".page").forEach(p=>p.classList.toggle("active",p.id===`page-${page}`));qsa("[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===page));const titles={"super-admin":locale==="fr"?"Administration de la plateforme":"إدارة منصة مدرستي",home:"الرئيسية",academic:"الأقسام والنتائج",children:"أبنائي",admin:"إدارة المدرسة",security:"الأمان والسجل",settings:"الإعدادات"};$("pageTitle").textContent=tr(titles[page]||"مدرستي");if(page==="admin"){loadUsers();loadStructure();}if(page==="security")loadAudit();if(page==="children")loadChildren();if(page==="settings")loadBranding()}
async function loadDirectorHome(){try{const d=await api("/api/director/overview");$("metricClasses").textContent=d.classes;$("metricStudents").textContent=d.students;$("metricSubjects").textContent=d.subjects;$("metricUsers").textContent=d.users}catch{}}
async function loadClasses(){try{const d=await api("/api/classes");currentClasses=d.classes||[];$("metricClasses").textContent=currentClasses.length;const opts='<option value="">'+tr("اختر قسمًا")+'</option>'+currentClasses.map(c=>`<option value="${c.id}">${escapeHtml(c.name)} · ${escapeHtml(c.academic_year||"")}</option>`).join("");$("classSelect").innerHTML=opts;$("studentClassSelect").innerHTML=opts;$("inviteClass").innerHTML='<option value="">'+tr("بدون قسم محدد")+'</option>'+currentClasses.map(c=>`<option value="${c.id}">${escapeHtml(c.name)} · ${escapeHtml(c.academic_year||"")}</option>`).join("");$("homeClasses").classList.toggle("empty",!currentClasses.length);$("homeClasses").innerHTML=currentClasses.length?currentClasses.slice(0,8).map(c=>`<div class="mini-card"><div><b>${escapeHtml(c.name)}</b><small>${escapeHtml(c.level||"")}</small></div><button data-open-class="${c.id}">فتح</button></div>`).join(""):tr("لا توجد أقسام متاحة بعد.");qsa("[data-open-class]").forEach(b=>b.onclick=()=>{$("classSelect").value=b.dataset.openClass;navigate("academic");loadAcademicScope()})}catch{}}
async function loadSubjectsForClass(classId){if(!classId){currentSubjects=[];$("subjectSelect").innerHTML='<option value="">'+tr("اختر مادة")+'</option>';return}try{const d=await api(`/api/classes/${encodeURIComponent(classId)}/subjects`);currentSubjects=d.subjects||[];$("subjectSelect").innerHTML='<option value="">'+tr("اختر مادة")+'</option>'+currentSubjects.map(s=>`<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("")}catch{currentSubjects=[]}}
async function loadAcademicScope(){const classId=$("classSelect").value;if(!classId){$("gradeGrid").textContent=tr("اختر قسمًا ومادة لبدء العمل.");return}await loadSubjectsForClass(classId);try{currentStudents=(await api(`/api/classes/${encodeURIComponent(classId)}/students`)).students||[];currentGrades=(await api(`/api/classes/${encodeURIComponent(classId)}/grades`)).grades||[];$("metricStudents").textContent=currentStudents.length;renderGradeGrid()}catch{$("gradeGrid").textContent="لا تملك صلاحية هذا القسم"}}
function renderGradeGrid(){const classId=$("classSelect").value,subjectId=$("subjectSelect").value,term=$("termSelect").value;if(!classId||!subjectId){$("gradePermission").textContent=tr("اختر القسم والمادة");$("gradeGrid").textContent=tr("اختر قسمًا ومادة لبدء العمل.");return}const subject=currentSubjects.find(s=>s.id===subjectId);$("gradePermission").textContent=`${escapeHtml(subject?.name||"")} · /${subject?.max_score||20}`;$("gradeGrid").classList.toggle("empty",!currentStudents.length);$("gradeGrid").innerHTML=currentStudents.length?currentStudents.map(st=>{const g=currentGrades.find(x=>x.student_id===st.id&&x.subject_id===subjectId&&x.term===term&&x.assessment==="MAIN");return`<div class="grade-row"><div class="student-name"><b>${escapeHtml(st.full_name)}</b><small>${escapeHtml(st.student_uid)}</small></div><div class="score-wrap"><input inputmode="decimal" data-score="${st.id}" value="${g?escapeHtml(g.score):""}" min="0" max="${subject?.max_score||20}"><span>/${subject?.max_score||20}</span></div><button class="save-grade ${g?"saved":""}" data-save-grade="${st.id}" data-grade-id="${g?.id||""}" data-version="${g?.version||""}">${g?"✓ محفوظ":"حفظ"}</button></div>`}).join(""):"لا يوجد تلاميذ";qsa("[data-save-grade]").forEach(b=>b.onclick=()=>saveGrade(b,subject))}
async function saveGrade(button,subject){const studentId=button.dataset.saveGrade,input=document.querySelector(`[data-score="${studentId}"]`),score=input.value.trim()===""?NaN:Number(input.value);if(!Number.isFinite(score)||score<0||score>Number(subject.max_score)){button.classList.add("error");toast("الدرجة خارج المجال المسموح");return}button.disabled=true;try{let d;if(button.dataset.gradeId){d=await api(`/api/grades/${button.dataset.gradeId}`,{method:"PUT",body:JSON.stringify({score,version:Number(button.dataset.version)})});button.dataset.version=d.version}else{d=await api("/api/grades",{method:"POST",body:JSON.stringify({classId:$("classSelect").value,studentId,subjectId:$("subjectSelect").value,term:$("termSelect").value,assessment:"MAIN",score})});button.dataset.gradeId=d.id;button.dataset.version=d.version}button.textContent="✓ محفوظ";button.classList.add("saved");$("saveState").textContent="تم الحفظ";toast("تم حفظ الدرجة");await loadAcademicScope()}catch(e){if(e.data?.error==="VERSION_CONFLICT"){toast("تم تعديل الدرجة من مستخدم آخر. تم تحديث البيانات.");await loadAcademicScope()}else{button.classList.add("error");toast("تعذر الحفظ أو لا تملك الصلاحية")}}finally{button.disabled=false}}
async function loadNotifications(){try{const d=await api("/api/notifications");const ns=d.notifications||[];$("notifications").classList.toggle("empty",!ns.length);$("notifications").innerHTML=ns.length?ns.slice(0,8).map(n=>`<div class="notice"><b>${escapeHtml(n.title)}</b><p>${escapeHtml(n.body)}</p></div>`).join(""):tr("لا توجد إشعارات جديدة.")}catch{}}
async function loadChildren(){if(!(me.roles||[]).includes("GUARDIAN"))return;try{const d=await api("/api/guardian/students");const xs=d.students||[];$("childrenList").classList.toggle("empty",!xs.length);$("childrenList").innerHTML=xs.length?xs.map(s=>`<div class="child-card"><span class="status">${escapeHtml(s.class_name||"")}</span><h4>${escapeHtml(s.full_name)}</h4><p>${escapeHtml(s.student_uid)}</p><button class="ghost" data-report="${s.id}">عرض كشف النتائج</button></div>`).join(""):"لا توجد روابط تلاميذ بعد.";qsa("[data-report]").forEach(b=>b.onclick=()=>openReport(b.dataset.report))}catch{}}
async function openReport(studentId){try{const [d,b]=await Promise.all([api(`/api/students/${studentId}/report`),api("/api/branding")]);const s=d.student,r=d.report,school=me.school||{};const custom=b.branding?.mode==="CUSTOM";const logo=custom?"/api/branding/header":"/assets/official-logo.png";const rows=r.subjects.map(x=>`<tr><td>${escapeHtml(x.name)}</td><td>${x.terms.T1??"—"}</td><td>${x.terms.T2??"—"}</td><td>${x.terms.T3??"—"}</td><td>${x.annual??"—"}</td></tr>`).join("");showModal(`<div class="report-sheet"><div class="official-head"><div class="gov"><b>الجمهورية الإسلامية الموريتانية</b><br>وزارة التهذيب الوطني وإصلاح النظام التعليمي<br>${escapeHtml(school.wilaya?`الإدارة الجهوية بولاية ${school.wilaya}`:"")}<br>${escapeHtml(school.moughataa?`مفتشية مقاطعة ${school.moughataa} للتربية`:"")}</div><div class="center"><div class="bismillah">بسم الله الرحمن الرحيم</div><img src="${logo}" alt="الشعار"></div><div class="meta"><b>شرف - إخاء - عدالة</b><br>المدرسة: ${escapeHtml(school.name||"—")}<br>الفصل: ${escapeHtml(s.class_name||"—")}<br>العام الدراسي: ${escapeHtml(school.academic_year||"—")}</div></div><div class="report-title">كشف درجات التلميذ</div><div class="student-line">الاسم: ${escapeHtml(s.full_name)} · الرقم: ${escapeHtml(s.student_uid)}</div><table class="report-table"><thead><tr><th>المادة</th><th>الفصل 1</th><th>الفصل 2</th><th>الفصل 3</th><th>السنوي</th></tr></thead><tbody>${rows}</tbody></table><div class="report-summary"><span>معدل الفصل 1: <b>${r.termAverages.T1??"—"}</b></span><span>معدل الفصل 2: <b>${r.termAverages.T2??"—"}</b></span><span>معدل الفصل 3: <b>${r.termAverages.T3??"—"}</b></span><span>المعدل السنوي: <b>${r.annualAverage??"—"}</b></span></div><div class="no-print"><button id="printReportBtn" class="primary">طباعة / حفظ PDF</button></div></div>`);$("printReportBtn").onclick=()=>window.print()}catch{toast("تعذر فتح التقرير")}}
async function createClass(){try{await api("/api/director/classes",{method:"POST",body:JSON.stringify({name:$("newClassName").value.trim(),academicYearId:$("newClassYear").value||undefined,level:$("newClassLevel").value.trim()||null,section:$("newClassSection").value.trim()||null})});$("newClassName").value="";toast("تم إنشاء القسم");await loadStructure();await loadClasses();await loadDirectorHome()}catch(e){toast(e.data?.error==="CLASS_EXISTS"?"القسم موجود مسبقًا":"تعذر إنشاء القسم")}}
async function createSubject(){try{await api("/api/director/subjects",{method:"POST",body:JSON.stringify({name:$("newSubjectName").value.trim(),coefficient:Number($("newSubjectCoeff").value),maxScore:Number($("newSubjectMax").value)})});$("newSubjectName").value="";toast("تمت إضافة المادة");await loadStructure();await loadInviteSubjects();await loadDirectorHome()}catch{toast("تعذر إضافة المادة")}}
async function createStudent(){try{await api("/api/director/students",{method:"POST",body:JSON.stringify({classId:$("studentClassSelect").value,fullName:$("studentName").value.trim(),studentUid:$("studentUid").value.trim(),gender:$("studentGender").value||null})});$("studentName").value="";$("studentUid").value="";toast("تمت إضافة التلميذ");await loadDirectorHome()}catch{toast("تعذر إضافة التلميذ")}}
const permissionLabels={CLASS_READ:"قراءة القسم",STUDENT_READ:"قراءة التلاميذ",STUDENT_WRITE:"تعديل التلاميذ",SUBJECT_READ:"قراءة المادة",GRADE_READ:"قراءة الدرجات",GRADE_WRITE:"إدخال الدرجات",REPORT_READ:"قراءة التقارير",ATTENDANCE_READ:"قراءة الحضور",ATTENDANCE_WRITE:"تسجيل الحضور والغياب",EXAM_READ:"قراءة جدول الامتحانات",EXAM_WRITE:"إدارة جدول الامتحانات",DOCUMENT_READ:"قراءة الوثائق",DOCUMENT_WRITE:"إدارة الوثائق"};
function renderPermissionChecks(){
  const role=$("inviteRole").value;

  const defaults=role==="TEACHER"
    ?["CLASS_READ","STUDENT_READ","SUBJECT_READ","GRADE_READ","GRADE_WRITE","REPORT_READ"]
    :[];

  const showPermissions=role==="TEACHER"||role==="ADMIN";

  $("permissionChecks").innerHTML=showPermissions
    ?Object.entries(permissionLabels).map(([k,v])=>
      `<label class="check">
        <input type="checkbox" value="${k}" ${defaults.includes(k)?"checked":""}>
        ${escapeHtml(v)}
      </label>`
    ).join("")
    :"";

  $("guardianStudentWrap").classList.toggle("hidden",role!=="GUARDIAN");
}

async function loadInviteSubjects(){
  if(
    !(me.roles||[]).includes("DIRECTOR")
  ){
    return;
  }

  try{
    const d=await api(
      "/api/director/subjects"
    );

    const ss=d.subjects||[];

    $("metricSubjects").textContent=
      ss.filter(x=>x.active).length;

    $("inviteSubject").innerHTML=
      '<option value="">'+
      'بدون مادة محددة'+
      '</option>'+
      ss
        .filter(x=>x.active)
        .map(
          s=>
            `<option value="${s.id}">
              ${escapeHtml(s.name)}
            </option>`
        )
        .join("");
  }catch{}
}

async function loadInviteStudents(){
  const classId=
    $("inviteClass").value;

  if(!classId){
    $("inviteStudent").innerHTML=
      '<option value="">'+
      'اختر تلميذًا'+
      '</option>';

    return;
  }

  try{
    const d=await api(
      `/api/classes/${classId}/students`
    );

    $("inviteStudent").innerHTML=
      '<option value="">'+
      'اختر تلميذًا'+
      '</option>'+
      d.students
        .map(
          s=>
            `<option value="${s.id}">
              ${escapeHtml(s.full_name)}
            </option>`
        )
        .join("");
  }catch{}
}

async function createInvite(){
  const role=
    $("inviteRole").value;

  const permissions=
    qsa(
      "#permissionChecks input:checked"
    ).map(
      x=>x.value
    );

  const studentIds=
    role==="GUARDIAN" &&
    $("inviteStudent").value
      ?[$("inviteStudent").value]
      :[];

  const payload={
    role,
    targetLogin:
      $("inviteTarget").value.trim()||null,
    classId:
      $("inviteClass").value||null,
    subjectId:
      $("inviteSubject").value||null,
    permissions,
    studentIds,
    expiresHours:24
  };

  try{
    let d;

    try{
      d=await api(
        "/api/director/invites",
        {
          method:"POST",
          body:JSON.stringify(
            payload
          )
        }
      );
    }catch(e){
      if(
        e.data?.error===
        "STEP_UP_REQUIRED"
      ){
        const p=prompt(
          "أعد إدخال كلمة مرور المدير لتأكيد العملية"
        );

        if(!p)return;

        await api(
          "/api/auth/step-up",
          {
            method:"POST",
            body:JSON.stringify({
              password:p
            })
          }
        );

        d=await api(
          "/api/director/invites",
          {
            method:"POST",
            body:JSON.stringify(
              payload
            )
          }
        );
      }else{
        throw e;
      }
    }

    $("inviteResult")
      .classList
      .remove("hidden");

    $("inviteResult").textContent=
      `رمز لمرة واحدة: ${d.code}`;

    toast(
      "تم إنشاء رمز الانضمام"
    );
  }catch{
    toast(
      "تعذر إنشاء الدعوة. تحقق من النطاق والصلاحيات"
    );
  }
}

async function loadUsers(){
  if(
    !(me.roles||[]).includes("DIRECTOR")
  ){
    return;
  }

  try{
    const d=await api(
      "/api/director/users"
    );

    $("metricUsers").textContent=
      d.users.filter(
        x=>x.status==="ACTIVE"
      ).length;

    $("usersTable")
      .classList
      .remove("empty");

    $("usersTable").innerHTML=`
      <table class="data-table">
        <thead>
          <tr>
            <th>الاسم</th>
            <th>المستخدم</th>
            <th>الدور</th>
            <th>الحالة</th>
            <th>إجراءات</th>
          </tr>
        </thead>

        <tbody>
          ${d.users.map(u=>`
            <tr>
              <td>
                ${escapeHtml(
                  u.full_name
                )}
              </td>

              <td>
                ${escapeHtml(
                  u.login
                )}
              </td>

              <td>
                ${escapeHtml(
                  (u.roles||[])
                    .join(" • ")
                )}
              </td>

              <td>
                <span class="badge">
                  ${escapeHtml(
                    u.status
                  )}
                </span>
              </td>

              <td>
                ${
                  u.id===me.id
                    ?"—"
                    :`
                      <button
                        class="ghost compact"
                        data-reset-user="${u.id}">
                        رمز استرجاع
                      </button>

                      <button
                        class="ghost compact"
                        data-revoke-user="${u.id}">
                        سحب الوصول
                      </button>
                    `
                }
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    qsa(
      "[data-reset-user]"
    ).forEach(
      b=>
        b.onclick=()=>
          issueResetCode(
            b.dataset.resetUser
          )
    );

    qsa(
      "[data-revoke-user]"
    ).forEach(
      b=>
        b.onclick=()=>
          revokeUser(
            b.dataset.revokeUser
          )
    );
  }catch{}
}

async function ensureStepUp(){
  const p=prompt(
    "أعد إدخال كلمة مرور المدير لتأكيد العملية"
  );

  if(!p)return false;

  try{
    await api(
      "/api/auth/step-up",
      {
        method:"POST",
        body:JSON.stringify({
          password:p
        })
      }
    );

    return true;
  }catch{
    toast(
      "فشل التحقق من كلمة المرور"
    );

    return false;
  }
}

async function issueResetCode(
  userId
){
  try{
    let d;

    try{
      d=await api(
        `/api/director/users/${userId}/reset-code`,
        {
          method:"POST"
        }
      );
    }catch(e){
      if(
        e.data?.error!==
        "STEP_UP_REQUIRED"
      ){
        throw e;
      }

      if(
        !(await ensureStepUp())
      ){
        return;
      }

      d=await api(
        `/api/director/users/${userId}/reset-code`,
        {
          method:"POST"
        }
      );
    }

    showModal(`
      <h3>
        رمز استرجاع لمرة واحدة
      </h3>

      <p class="hint">
        صالح لمدة
        ${d.expiresInMinutes}
        دقيقة.
        أعطه لصاحب الحساب
        عبر قناة موثوقة.
      </p>

      <div class="secret-result">
        ${escapeHtml(d.code)}
      </div>
    `);
  }catch{
    toast(
      "تعذر إنشاء رمز الاسترجاع"
    );
  }
}

async function revokeUser(
  userId
){
  if(
    !confirm(
      "هل تريد سحب وصول هذا المستخدم وإلغاء جلساته المفتوحة؟"
    )
  ){
    return;
  }

  try{
    try{
      await api(
        `/api/director/users/${userId}/revoke`,
        {
          method:"POST"
        }
      );
    }catch(e){
      if(
        e.data?.error!==
        "STEP_UP_REQUIRED"
      ){
        throw e;
      }

      if(
        !(await ensureStepUp())
      ){
        return;
      }

      await api(
        `/api/director/users/${userId}/revoke`,
        {
          method:"POST"
        }
      );
    }

    toast(
      "تم سحب الوصول وإلغاء الجلسات"
    );

    await loadUsers();
    await loadDirectorHome();
  }catch{
    toast(
      "تعذر سحب الوصول"
    );
  }
}

async function loadAudit(){
  if(
    !(me.roles||[]).includes("DIRECTOR")
  ){
    return;
  }

  try{
    const d=await api(
      "/api/director/audit"
    );

    $("auditList")
      .classList
      .toggle(
        "empty",
        !d.events.length
      );

    $("auditList").innerHTML=
      d.events.length
        ?d.events.map(e=>`
          <div class="notice">
            <b>
              ${escapeHtml(e.action)}
            </b>

            <p>
              ${escapeHtml(
                e.entity_type||""
              )}
              ·
              ${new Date(
                e.created_at
              ).toLocaleString(
                locale==="fr"
                  ?"fr-FR"
                  :"ar-MR"
              )}
            </p>
          </div>
        `).join("")
        :"لا توجد أحداث";
  }catch{}
}
async function loadBranding(){
  if(!me?.schoolId){
    return;
  }

  try{
    const d=await api(
      "/api/branding"
    );

    const isPrivate=
      d.school?.school_type===
      "PRIVATE";

    const custom=
      d.branding?.mode===
      "CUSTOM";

    $("brandingInfo").innerHTML=
      custom
        ?`
          <img
            src="/api/branding/header?ts=${Date.now()}"
            alt="رأسية المدرسة">
        `
        :`
          <div>
            <img
              src="/assets/official-logo.png"
              alt="الشعار"
              class="feature-style-1">

            <p>
              ${
                isPrivate
                  ?"لم تُرفع رأسية خاصة بعد"
                  :"المدرسة العمومية تستخدم الرأسية الرسمية الموريتانية"
              }
            </p>
          </div>
        `;

    $("brandingControls")
      ?.classList
      .toggle(
        "hidden",
        !isPrivate ||
        !(me.roles||[])
          .includes("DIRECTOR")
      );
  }catch{}
}

async function uploadBranding(){
  const file=
    $("brandingFile").files?.[0];

  if(!file){
    return toast(
      "اختر ملفًا أولًا"
    );
  }

  const fd=new FormData();

  fd.append(
    "file",
    file
  );

  try{
    let d;

    try{
      d=await api(
        "/api/director/branding/upload",
        {
          method:"POST",
          body:fd
        }
      );
    }catch(e){
      if(
        e.data?.error===
        "STEP_UP_REQUIRED"
      ){
        const p=prompt(
          "أعد إدخال كلمة مرور المدير لتأكيد رفع الرأسية"
        );

        if(!p){
          return;
        }

        await api(
          "/api/auth/step-up",
          {
            method:"POST",
            body:JSON.stringify({
              password:p
            })
          }
        );

        d=await api(
          "/api/director/branding/upload",
          {
            method:"POST",
            body:fd
          }
        );
      }else{
        throw e;
      }
    }

    if(
      d.message===
      "SECURE_CONVERSION_REQUIRED"
    ){
      toast(
        "تم عزل الملف بأمان ويحتاج مرحلة التحويل المعقمة"
      );
    }else{
      toast(
        "تم اعتماد الرأسية المعقمة"
      );

      await loadBranding();
    }
  }catch{
    toast(
      "تعذر معالجة الملف أو نوعه غير مدعوم"
    );
  }
}

function showModal(html){
  $("modalBody").innerHTML=
    html;

  $("modal")
    .classList
    .remove("hidden");
}

function forgot(){
  showModal(`
    <h3>
      استرجاع كلمة المرور
    </h3>

    <p class="hint">
      يمكنك بدء الاسترجاع
      باسم المستخدم أو البريد،
      أو استخدام رمز إعادة تعيين
      أعطاك إياه مدير المدرسة.
    </p>

    <label>
      اسم المستخدم أو البريد

      <input id="recoverKey">
    </label>

    <button
      id="recoverStart"
      class="ghost full">
      بدء الاسترجاع
    </button>

    <hr>

    <label>
      رمز إعادة التعيين

      <input id="resetToken">
    </label>

    <label>
      كلمة المرور الجديدة

      <input
        id="resetPassword"
        type="password">
    </label>

    <button
      id="resetDo"
      class="primary">
      تعيين كلمة مرور جديدة
    </button>
  `);

  $("recoverStart").onclick=
    async()=>{
      try{
        await api(
          "/api/auth/password/forgot",
          {
            method:"POST",
            body:JSON.stringify({
              loginOrEmail:
                $("recoverKey")
                  .value
                  .trim()
            })
          }
        );
      }catch{}

      toast(
        "إذا كان الحساب موجودًا فقد بدأت إجراءات الاسترجاع"
      );
    };

  $("resetDo").onclick=
    async()=>{
      try{
        await api(
          "/api/auth/password/reset",
          {
            method:"POST",
            body:JSON.stringify({
              token:
                $("resetToken")
                  .value
                  .trim(),

              newPassword:
                $("resetPassword")
                  .value
            })
          }
        );

        toast(
          "تم تغيير كلمة المرور"
        );

        $("modal")
          .classList
          .add("hidden");
      }catch{
        toast(
          "الرمز غير صالح أو كلمة المرور غير مطابقة للشروط"
        );
      }
    };
}

function toggleLocale(){
  locale=
    locale==="ar"
      ?"fr"
      :"ar";

  document
    .documentElement
    .lang=locale;

  document
    .documentElement
    .dir=
      locale==="ar"
        ?"rtl"
        :"ltr";

  $("langToggle").textContent=
    locale==="ar"
      ?"FR"
      :"AR";

  $("langToggle2").textContent=
    locale==="ar"
      ?"FR"
      :"AR";

  translateStatic();
}

const originalText=
  new Map();

function captureText(){
  const w=
    document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT
    );

  let n;

  while(
    n=w.nextNode()
  ){
    const t=
      n.nodeValue.trim();

    if(t){
      originalText.set(
        n,
        n.nodeValue
      );
    }
  }
}

function translateStatic(){
  for(
    const [n,orig]
    of originalText
  ){
    const raw=
      orig.trim();

    const mapped=
      locale==="fr"
        ?(FR[raw]||raw)
        :raw;

    n.nodeValue=
      orig.replace(
        raw,
        mapped
      );
  }

  if(me){
    renderProfile();
  }
}
$("loginTab").onclick=
  ()=>setTab(false);

$("registerTab").onclick=
  ()=>setTab(true);

$("loginBtn").onclick=login;
["login","password"].forEach(id=>$(id).addEventListener("keydown",event=>{
  if(event.key==="Enter"){event.preventDefault();login();}
}));

$("registerBtn").onclick=
  register;

$("redeemBtn").onclick=
  redeem;

$("logoutBtn").onclick=
  logout;

$("pendingLogout").onclick=
  logout;

$("chooserLogout").onclick=
  logout;

$("forgotBtn").onclick=
  forgot;

$("modalClose").onclick=
  ()=>
    $("modal")
      .classList
      .add("hidden");

$("modal").onclick=e=>{
  if(
    e.target===$("modal")
  ){
    $("modal")
      .classList
      .add("hidden");
  }
};

$("langToggle").onclick=
  toggleLocale;

$("langToggle2").onclick=
  toggleLocale;

$("refreshBtn").onclick=
  async()=>{
    me=await api(
      "/api/auth/me"
    );

    await openForMe();

    toast(
      "تم التحديث"
    );
  };

qsa(
  "[data-page]"
).forEach(
  b=>
    b.onclick=
      ()=>navigate(
        b.dataset.page
      )
);

$("classSelect").onchange=
  loadAcademicScope;

$("subjectSelect").onchange=
  renderGradeGrid;

$("termSelect").onchange=
  renderGradeGrid;

$("createClassBtn").onclick=
  createClass;

$("createSubjectBtn").onclick=
  createSubject;

$("createStudentBtn").onclick=
  createStudent;

$("inviteRole").onchange=
  renderPermissionChecks;

$("inviteClass").onchange=
  loadInviteStudents;

$("createInviteBtn").onclick=
  createInvite;

$("reloadUsers").onclick=
  loadUsers;

$("uploadBrandingBtn").onclick=
  uploadBranding;

captureText();

renderPermissionChecks();

boot().then(()=>{
  if(
    (me?.roles||[])
      .includes("DIRECTOR")
  ){
    loadInviteSubjects();
  }
});

if(
  "serviceWorker" in navigator
){
  navigator
    .serviceWorker
    .register("/sw.js")
    .catch(()=>{});
}

(function(){

  const attendanceLabels={
    PRESENT:"حاضر",
    ABSENT:"غائب",
    LATE:"متأخر",
    EXCUSED:"غياب مبرر"
  };

  function attendanceToday(){
    const d=
      new Date();

    const offset=
      d.getTimezoneOffset();

    return new Date(
      d.getTime()-
      offset*60000
    )
      .toISOString()
      .slice(0,10);
  }

  function createAttendancePage(){
    if(
      $("page-attendance")
    ){
      return;
    }

    const page=
      document.createElement(
        "section"
      );

    page.id=
      "page-attendance";

    page.className=
      "page";

    page.innerHTML=`
      <div
        class="panel filters attendance-filters">

        <select id="attendanceClass">
          <option value="">
            اختر قسمًا
          </option>
        </select>

        <input
          id="attendanceDate"
          type="date"
          value="${attendanceToday()}">

        <button
          id="attendanceReload"
          class="ghost compact"
          type="button">
          تحديث
        </button>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div>
            <span class="kicker">
              الحضور اليومي
            </span>

            <h3>
              الحضور والغياب
            </h3>
          </div>

          <span
            id="attendanceSummary"
            class="status muted">
            اختر قسمًا
          </span>
        </div>

        <div
          id="attendanceGrid"
          class="grade-grid empty">
          اختر قسمًا لعرض التلاميذ.
        </div>
      </div>
    `;

    document
      .querySelector(
        ".workspace"
      )
      .appendChild(page);

    // Module styles are served from features.css under the application CSP.

    const side=
      document.querySelector(
        "aside nav"
      );

    const sideBtn=
      document.createElement(
        "button"
      );

    sideBtn.className=
      "nav-item";

    sideBtn.dataset
      .attendanceNav=
      "side";

    sideBtn.innerHTML=
      "✓ <span>الحضور والغياب</span>";

    sideBtn.onclick=
      openAttendance;

    side.insertBefore(
      sideBtn,
      side.querySelector(
        '[data-page="admin"]'
      ) ||
      side.lastElementChild
    );

    const bottom=
      document.querySelector(
        ".bottom-nav.school-navigation"
      );

    const bottomBtn=
      document.createElement(
        "button"
      );

    bottomBtn.dataset
      .attendanceNav=
      "bottom";

    bottomBtn.innerHTML=
      "✓<span>الحضور</span>";

    bottomBtn.onclick=
      openAttendance;

    bottom.insertBefore(
      bottomBtn,
      bottom.querySelector(
        '[data-page="settings"]'
      )
    );

    $("attendanceClass")
      .onchange=
      loadAttendance;

    $("attendanceDate")
      .onchange=
      loadAttendance;

    $("attendanceReload")
      .onclick=
      loadAttendance;

    updateAttendanceVisibility();
  }
    function updateAttendanceVisibility(){
    const roles=
      me?.roles||[];

    const guardianOnly=
      roles.includes(
        "GUARDIAN"
      ) &&
      !roles.includes(
        "DIRECTOR"
      ) &&
      !roles.includes(
        "ADMIN"
      ) &&
      !roles.includes(
        "TEACHER"
      );

    qsa(
      "[data-attendance-nav]"
    ).forEach(
      b=>{
        b.classList.toggle(
          "hidden",
          guardianOnly
        );
      }
    );
  }

  async function openAttendance(){
    navigate(
      "attendance"
    );

    $("pageTitle").textContent=
      "الحضور والغياب";

    qsa(
      "[data-attendance-nav]"
    ).forEach(
      b=>
        b.classList.add(
          "active"
        )
    );

    try{
      const d=await api(
        "/api/classes"
      );

      const classes=
        d.classes||[];

      $("attendanceClass")
        .innerHTML=
          '<option value="">'+
          'اختر قسمًا'+
          '</option>'+
          classes.map(
            c=>`
              <option
                value="${c.id}">
                ${escapeHtml(
                  c.name
                )}
              </option>
            `
          ).join("");
    }catch{
      toast(
        "تعذر تحميل الأقسام"
      );
    }
  }

  async function loadAttendance(){
    const classId=
      $("attendanceClass")
        .value;

    const date=
      $("attendanceDate")
        .value;

    if(
      !classId||
      !date
    ){
      $("attendanceGrid")
        .textContent=
          "اختر قسمًا وتاريخًا.";

      return;
    }

    $("attendanceGrid")
      .textContent=
        "جارٍ تحميل الحضور…";

    try{
      const d=await api(
        `/api/attendance/students?`+
        `classId=${encodeURIComponent(
          classId
        )}&`+
        `date=${encodeURIComponent(
          date
        )}`
      );

      const students=
        d.students||[];

      if(
        !students.length
      ){
        $("attendanceGrid")
          .textContent=
            "لا يوجد تلاميذ في هذا القسم.";

        return;
      }

      $("attendanceGrid")
        .innerHTML=
          students.map(
            st=>`
              <div
                class="attendance-row"
                data-attendance-student=
                  "${st.student_id}">

                <div class="student-name">
                  <b>
                    ${escapeHtml(
                      st.full_name
                    )}
                  </b>

                  <small>
                    ${escapeHtml(
                      st.student_uid||""
                    )}
                  </small>
                </div>

                <div
                  class="attendance-actions">

                  ${
                    Object.entries(
                      attendanceLabels
                    ).map(
                      ([status,label])=>`
                        <button
                          type="button"
                          class=
                            "attendance-btn ${
                              st.status===status
                                ?"active"
                                :""
                            }"
                          data-attendance-status=
                            "${status}">
                          ${label}
                        </button>
                      `
                    ).join("")
                  }
                </div>

                <input
                  class="attendance-note"
                  maxlength="500"
                  placeholder=
                    "ملاحظة اختيارية"
                  value="${
                    escapeHtml(
                      st.note||""
                    )
                  }">
              </div>
            `
          ).join("");

      qsa(
        "[data-attendance-status]"
      ).forEach(
        btn=>{
          btn.onclick=
            ()=>saveAttendance(
              btn
            );
        }
      );

      const counts={
        PRESENT:0,
        ABSENT:0,
        LATE:0,
        EXCUSED:0
      };

      students.forEach(
        st=>{
          if(
            counts[
              st.status
            ]!==undefined
          ){
            counts[
              st.status
            ]++;
          }
        }
      );

      $("attendanceSummary")
        .textContent=
          `${students.length} تلميذ · `+
          `حاضر ${counts.PRESENT} · `+
          `غائب ${counts.ABSENT} · `+
          `متأخر ${counts.LATE}`;

    }catch(e){
      $("attendanceGrid")
        .textContent=
          e.status===403
            ?"لا تملك صلاحية الحضور لهذا القسم."
            :"تعذر تحميل الحضور.";
    }
  }

  async function saveAttendance(
    button
  ){
    const row=
      button.closest(
        "[data-attendance-student]"
      );

    const studentId=
      row.dataset
        .attendanceStudent;

    const classId=
      $("attendanceClass")
        .value;

    const date=
      $("attendanceDate")
        .value;

    const status=
      button.dataset
        .attendanceStatus;

    const note=
      row
        .querySelector(
          ".attendance-note"
        )
        .value
        .trim()||null;

    try{
      await api(
        `/api/attendance/${
          encodeURIComponent(
            studentId
          )
        }`,
        {
          method:"PUT",
          body:JSON.stringify({
            classId,
            date,
            status,
            note
          })
        }
      );

      toast(
        "تم حفظ الحضور"
      );
            await loadAttendance();

    }catch(e){
      toast(
        e.status===403
          ?"لا تملك صلاحية تعديل الحضور"
          :"تعذر حفظ الحضور"
      );
    }
  }

  createAttendancePage();

  let attendanceWait=0;

  const attendanceTimer=
    setInterval(
      ()=>{
        updateAttendanceVisibility();

        if(
          me ||
          attendanceWait++>20
        ){
          clearInterval(
            attendanceTimer
          );
        }
      },
      250
    );

})();

(function(){

  let examCurrent=[];

  function createExamPage(){
    if(
      $("page-exams")
    ){
      return;
    }

    const page=
      document.createElement(
        "section"
      );

    page.id=
      "page-exams";

    page.className=
      "page";

    page.innerHTML=`
      <div class="panel">

        <div class="panel-head">
          <div>
            <span class="kicker">
              التنظيم الدراسي
            </span>

            <h3>
              جدول الامتحانات
            </h3>
          </div>

          <span
            id="examStatus"
            class="status muted">
            اختر قسمًا
          </span>
        </div>

        <div class="exam-filters">

          <select id="examClass">
            <option value="">
              اختر قسمًا
            </option>
          </select>

          <select id="examTerm">
            <option value="T1">
              الفصل الأول
            </option>

            <option value="T2">
              الفصل الثاني
            </option>

            <option value="T3">
              الفصل الثالث
            </option>
          </select>

          <button
            id="examReload"
            class="ghost compact"
            type="button">
            تحديث
          </button>

        </div>
      </div>

      <div class="content-grid">

        <article
          class="panel"
          id="examCreatePanel">

          <div class="panel-head">
            <h3>
              إضافة امتحان
            </h3>
          </div>

          <label>
            المادة

            <select id="examSubject">
              <option value="">
                اختر مادة
              </option>
            </select>
          </label>

          <label>
            عنوان الامتحان

            <input
              id="examTitle"
              placeholder=
                "مثال: امتحان الرياضيات">
          </label>

          <label>
            التاريخ

            <input
              id="examDate"
              type="date">
          </label>
                    <div class="two">
            <label>
              وقت البداية

              <input
                id="examStart"
                type="time">
            </label>

            <label>
              وقت النهاية

              <input
                id="examEnd"
                type="time">
            </label>
          </div>

          <label>
            القاعة

            <input
              id="examRoom"
              placeholder="اختياري">
          </label>

          <label>
            ملاحظات

            <input
              id="examNotes"
              placeholder="اختياري">
          </label>

          <label class="check">
            <input
              id="examPublished"
              type="checkbox">

            نشر الامتحان
            للتلاميذ والأولياء
          </label>

          <button
            id="examCreateBtn"
            class="primary"
            type="button">
            حفظ الامتحان
          </button>

        </article>

        <article class="panel">

          <div class="panel-head">
            <div>
              <span class="kicker">
                المواعيد
              </span>

              <h3>
                الامتحانات المسجلة
              </h3>
            </div>
          </div>

          <div
            id="examList"
            class="cards-list empty">
            اختر قسمًا
            لعرض الامتحانات.
          </div>

        </article>
      </div>
    `;

    document
      .querySelector(
        ".workspace"
      )
      .appendChild(page);

    // Module styles are served from features.css under the application CSP.

    const side=
      document.querySelector(
        "aside nav"
      );

    if(
      side &&
      !document.querySelector(
        '[data-exams-nav="side"]'
      )
    ){
      const b=
        document.createElement(
          "button"
        );

      b.className=
        "nav-item";

      b.dataset.examsNav=
        "side";

      b.innerHTML=
        '▣ <span>'+
        'جدول الامتحانات'+
        '</span>';

      b.onclick=
        openExams;

      side.insertBefore(
        b,
        side.querySelector(
          '[data-page="admin"]'
        ) ||
        side.lastElementChild
      );
    }

    const bottom=
      document.querySelector(
        ".bottom-nav.school-navigation"
      );

    if(
      bottom &&
      !document.querySelector(
        '[data-exams-nav="bottom"]'
      )
    ){
      const b=
        document.createElement(
          "button"
        );

      b.dataset.examsNav=
        "bottom";

      b.innerHTML=
        '▣<span>'+
        'الامتحانات'+
        '</span>';

      b.onclick=
        openExams;

      bottom.insertBefore(
        b,
        bottom.querySelector(
          '[data-page="settings"]'
        )
      );
    }

    $("examClass").onchange=
      async()=>{
        await loadExamSubjects();
        await loadExams();
      };

    $("examTerm").onchange=
      loadExams;

    $("examReload").onclick=
      loadExams;

    $("examCreateBtn").onclick=
      createExam;

    updateExamVisibility();

    qsa(
      "[data-page]"
    ).forEach(
      b=>{
        b.addEventListener(
          "click",
          ()=>{
            qsa(
              "[data-exams-nav]"
            ).forEach(
              x=>
                x.classList.remove(
                  "active"
                )
            );

            qsa(
              "[data-attendance-nav]"
            ).forEach(
              x=>
                x.classList.remove(
                  "active"
                )
            );
          }
        );
      }
    );

    qsa(
      "[data-attendance-nav]"
    ).forEach(
      b=>{
        b.addEventListener(
          "click",
          ()=>{
            qsa(
              "[data-exams-nav]"
            ).forEach(
              x=>
                x.classList.remove(
                  "active"
                )
            );
          }
        );
      }
    );
  }

  function updateExamVisibility(){
    const roles=
      me?.roles||[];

    const guardianOnly=
      roles.includes(
        "GUARDIAN"
      ) &&
      !roles.includes(
        "DIRECTOR"
      ) &&
      !roles.includes(
        "ADMIN"
      ) &&
      !roles.includes(
        "TEACHER"
      );

    qsa(
      "[data-exams-nav]"
    ).forEach(
      b=>{
        b.classList.toggle(
          "hidden",
          guardianOnly
        );
      }
    );
  }

  async function openExams(){
    navigate(
      "exams"
    );

    $("pageTitle").textContent=
      "جدول الامتحانات";

    qsa(
      "[data-attendance-nav]"
    ).forEach(
      x=>{
        x.classList.remove(
          "active"
        );
      }
    );

    qsa(
      "[data-exams-nav]"
    ).forEach(
      x=>{
        x.classList.add(
          "active"
        );
      }
    );

    try{
      const d=
        await api(
          "/api/classes"
        );

      const classes=
        d.classes||[];

      const old=
        $("examClass").value;

      $("examClass").innerHTML=
        '<option value="">'+
        'اختر قسمًا'+
        '</option>'+
        classes.map(
          c=>`
            <option
              value="${c.id}">
              ${escapeHtml(
                c.name
              )}
            </option>
          `
        ).join("");

      if(
        classes.some(
          c=>c.id===old
        )
      ){
        $("examClass").value=
          old;
      }

      if(
        $("examClass").value
      ){
        await loadExamSubjects();
        await loadExams();
      }

    }catch{
      toast(
        "تعذر تحميل الأقسام"
      );
    }
  }

  async function loadExamSubjects(){
    const classId=
      $("examClass").value;

    $("examSubject").innerHTML=
      '<option value="">'+
      'اختر مادة'+
      '</option>';

    if(!classId){
      return;
    }

    try{
      const d=
        await api(
          `/api/classes/${
            encodeURIComponent(
              classId
            )
          }/subjects`
        );

      const subjects=
        d.subjects||[];

      $("examSubject").innerHTML=
        '<option value="">'+
        'اختر مادة'+
        '</option>'+
        subjects.map(
          s=>`
            <option
              value="${s.id}">
              ${escapeHtml(
                s.name
              )}
            </option>
          `
        ).join("");

    }catch{
      toast(
        "تعذر تحميل المواد"
      );
    }
  }

  async function loadExams(){
    const classId=
      $("examClass").value;

    const term=
      $("examTerm").value;

    if(!classId){
      $("examList")
        .classList
        .add("empty");

      $("examList").textContent=
        "اختر قسمًا لعرض الامتحانات.";

      $("examStatus").textContent=
        "اختر قسمًا";

      return;
    }

    $("examList")
      .classList
      .add("empty");

    $("examList").textContent=
      "جارٍ تحميل الامتحانات…";

    try{
      const d=
        await api(
          `/api/exams?`+
          `classId=${
            encodeURIComponent(
              classId
            )
          }&`+
          `term=${
            encodeURIComponent(
              term
            )
          }`
        );

      examCurrent=
        d.exams||[];

      $("examStatus").textContent=
        `${examCurrent.length} امتحان`;

      if(
        !examCurrent.length
      ){
        $("examList")
          .classList
          .add("empty");

        $("examList").textContent=
          "لا توجد امتحانات "+
          "مسجلة لهذا الفصل.";

        return;
      }

      $("examList")
        .classList
        .remove("empty");

      $("examList").innerHTML=
        examCurrent.map(
          e=>`
            <div class="exam-card">

              <div
                class="exam-card-head">

                <div>
                  <h4>
                    ${escapeHtml(
                      e.title
                    )}
                  </h4>

                  <p>
                    ${escapeHtml(
                      e.subject_name||""
                    )}
                    ·
                    ${escapeHtml(
                      e.class_name||""
                    )}
                  </p>
                </div>

                <span
                  class="${
                    e.published
                      ?"exam-published"
                      :"exam-draft"
                  }">
                  ${
                    e.published
                      ?"منشور"
                      :"مسودة"
                  }
                </span>

              </div>

              <p>
                📅
                ${escapeHtml(
                  String(
                    e.exam_date||""
                  ).slice(
                    0,
                    10
                  )
                )}

                ${
                  e.starts_at
                    ?` · ⏰ ${
                      escapeHtml(
                        String(
                          e.starts_at
                        ).slice(
                          0,
                          5
                        )
                      )
                    }`
                    :""
                }

                ${
                  e.ends_at
                    ?` - ${
                      escapeHtml(
                        String(
                          e.ends_at
                        ).slice(
                          0,
                          5
                        )
                      )
                    }`
                    :""
                }
              </p>

              ${
                e.room
                  ?`
                    <p>
                      📍
                      ${escapeHtml(
                        e.room
                      )}
                    </p>
                  `
                  :""
              }

              ${
                e.notes
                  ?`
                    <p>
                      ${escapeHtml(
                        e.notes
                      )}
                    </p>
                  `
                  :""
              }

              <div
                class="exam-actions">

                <button
                  type="button"
                  class="ghost compact"
                  data-exam-edit=
                    "${e.id}">
                  تعديل
                </button>

                <button
                  type="button"
                  class="ghost compact"
                  data-exam-publish=
                    "${e.id}">
                  ${
                    e.published
                      ?"إلغاء النشر"
                      :"نشر"
                  }
                </button>

                <button
                  type="button"
                  class="ghost compact"
                  data-exam-delete=
                    "${e.id}">
                  أرشفة
                </button>

              </div>
            </div>
          `
        ).join("");

      qsa(
        "[data-exam-edit]"
      ).forEach(
        b=>{
          b.onclick=
            ()=>editExam(
              b.dataset.examEdit
            );
        }
      );

      qsa(
        "[data-exam-publish]"
      ).forEach(
        b=>{
          b.onclick=
            ()=>toggleExamPublish(
              b.dataset.examPublish
            );
        }
      );

      qsa(
        "[data-exam-delete]"
      ).forEach(
        b=>{
          b.onclick=
            ()=>deleteExam(
              b.dataset.examDelete
            );
        }
      );

    }catch(e){
      $("examList").textContent=
        e.status===403
          ?"لا تملك صلاحية قراءة "+
            "جدول الامتحانات."
          :"تعذر تحميل "+
            "جدول الامتحانات.";
    }
  }

  async function createExam(){
    const classId=
      $("examClass").value;

    const subjectId=
      $("examSubject").value;

    const term=
      $("examTerm").value;

    const title=
      $("examTitle")
        .value
        .trim();

    const examDate=
      $("examDate").value;

    const startsAt=
      $("examStart").value||
      null;

    const endsAt=
      $("examEnd").value||
      null;

    const room=
      $("examRoom")
        .value
        .trim()||
      null;

    const notes=
      $("examNotes")
        .value
        .trim()||
      null;

    const published=
      $("examPublished").checked;

    if(!classId){
      return toast(
        "اختر القسم"
      );
    }

    if(!subjectId){
      return toast(
        "اختر المادة"
      );
    }

    if(!title){
      return toast(
        "أدخل عنوان الامتحان"
      );
    }

    if(!examDate){
      return toast(
        "اختر تاريخ الامتحان"
      );
    }

    try{
      await api(
        "/api/exams",
        {
          method:"POST",
          body:JSON.stringify({
            classId,
            subjectId,
            term,
            title,
            examDate,
            startsAt,
            endsAt,
            room,
            notes,
            published
          })
        }
      );

      $("examTitle").value=
        "";

      $("examDate").value=
        "";

      $("examStart").value=
        "";

      $("examEnd").value=
        "";

      $("examRoom").value=
        "";

      $("examNotes").value=
        "";

      $("examPublished").checked=
        false;

      toast(
        "تم حفظ الامتحان"
      );

      await loadExams();

    }catch(e){
      toast(
        e.status===403
          ?"لا تملك صلاحية "+
            "إضافة الامتحانات"
          :"تعذر حفظ الامتحان"
      );
    }
  }

  async function toggleExamPublish(
    id
  ){
    const exam=
      examCurrent.find(
        x=>x.id===id
      );

    if(!exam){
      return;
    }

    try{
      await api(
        `/api/exams/${
          encodeURIComponent(
            id
          )
        }`,
        {
          method:"PATCH",
          body:JSON.stringify({
            version:
              exam.row_version,

            title:
              exam.title,

            examDate:
              String(
                exam.exam_date
              ).slice(
                0,
                10
              ),

            startsAt:
              exam.starts_at
                ?String(
                  exam.starts_at
                ).slice(
                  0,
                  5
                )
                :null,

            endsAt:
              exam.ends_at
                ?String(
                  exam.ends_at
                ).slice(
                  0,
                  5
                )
                :null,

            room:
              exam.room||null,

            notes:
              exam.notes||null,

            published:
              !exam.published
          })
        }
      );

      toast(
        exam.published
          ?"تم إلغاء نشر الامتحان"
          :"تم نشر الامتحان"
      );

      await loadExams();

    }catch(e){
      if(
        e.status===409
      ){
        toast(
          "تم تعديل الامتحان "+
          "من جهاز آخر. "+
          "حدّث الصفحة."
        );
      }else{
        toast(
          "تعذر تغيير حالة النشر"
        );
      }
    }
  }

  async function editExam(
    id
  ){
    const exam=
      examCurrent.find(
        x=>x.id===id
      );

    if(!exam){
      return;
    }

    const title=
      prompt(
        "عنوان الامتحان",
        exam.title||""
      );

    if(
      title===null
    ){
      return;
    }

    const examDate=
      prompt(
        "التاريخ YYYY-MM-DD",
        String(
          exam.exam_date||""
        ).slice(
          0,
          10
        )
      );

    if(
      examDate===null
    ){
      return;
    }

    const startsAt=
      prompt(
        "وقت البداية HH:MM",
        exam.starts_at
          ?String(
            exam.starts_at
          ).slice(
            0,
            5
          )
          :""
      );

    if(
      startsAt===null
    ){
      return;
    }

    const endsAt=
      prompt(
        "وقت النهاية HH:MM",
        exam.ends_at
          ?String(
            exam.ends_at
          ).slice(
            0,
            5
          )
          :""
      );

    if(
      endsAt===null
    ){
      return;
    }

    const room=
      prompt(
        "القاعة",
        exam.room||""
      );

    if(
      room===null
    ){
      return;
      }
        try{
      await api(
        `/api/exams/${
          encodeURIComponent(
            id
          )
        }`,
        {
          method:"PATCH",
          body:JSON.stringify({
            version:
              exam.row_version,

            title:
              title.trim(),

            examDate,

            startsAt:
              startsAt||null,

            endsAt:
              endsAt||null,

            room:
              room.trim()||null,

            notes:
              exam.notes||null,

            published:
              exam.published
          })
        }
      );

      toast(
        "تم تعديل الامتحان"
      );

      await loadExams();

    }catch(e){
      if(
        e.status===409
      ){
        toast(
          "تعارض في التعديل. "+
          "حدّث الجدول."
        );
      }else{
        toast(
          "تعذر تعديل الامتحان"
        );
      }
    }
  }

  async function deleteExam(
    id
  ){
    if(
      !confirm(
        "هل تريد حذف هذا الامتحان؟"
      )
    ){
      return;
    }

    try{
      await api(
        `/api/exams/${
          encodeURIComponent(
            id
          )
        }`,
        {
          method:"DELETE"
        }
      );

      toast(
        "تم حذف الامتحان"
      );

      await loadExams();

    }catch(e){
      toast(
        e.status===403
          ?"لا تملك صلاحية "+
            "حذف الامتحانات"
          :"تعذر حذف الامتحان"
      );
    }
  }

  createExamPage();

  let examWait=0;

  const examTimer=
    setInterval(
      ()=>{
        updateExamVisibility();

        if(
          me||
          examWait++>20
        ){
          clearInterval(
            examTimer
          );
        }
      },
      250
    );

})();

(function(){

  let activeViewRole=
    null;

  const roleNames={
    DIRECTOR:"مدير",
    ADMIN:"إداري",
    TEACHER:"معلم",
    GUARDIAN:"ولي التلميذ"
  };

  function getActiveRole(){
    const roles=
      me?.roles||[];

    if(
      !roles.length
    ){
      return null;
    }

    const saved = activeViewRole;

    if(
      saved &&
      roles.includes(
        saved
      )
    ){
      activeViewRole=
        saved;

      return saved;
    }

    if(
      activeViewRole &&
      roles.includes(
        activeViewRole
      )
    ){
      return activeViewRole;
    }

    activeViewRole=
      roles.includes(
        "DIRECTOR"
      )
        ?"DIRECTOR"
        :roles.includes(
          "ADMIN"
        )
          ?"ADMIN"
          :roles.includes(
            "TEACHER"
          )
            ?"TEACHER"
            :roles[0];

    return activeViewRole;
  }

  function createRoleSwitcher(){
    if(
      $("roleSwitcher")
    ){
      return;
    }

    const top=
      document.querySelector(
        ".top-actions"
      );

    if(!top){
      return;
    }

    const select=
      document.createElement(
        "select"
      );

    select.id=
      "roleSwitcher";

    select.className=
      "ghost compact";

    select.classList.add("role-select");

    top.insertBefore(
      select,
      top.firstChild
    );

    select.onchange=
      ()=>{
        activeViewRole=
          select.value;



        applyRoleVisibility();

        renderProfile();

        navigate(
          "home"
        );

        toast(
          `تم التبديل إلى: ${
            roleNames[
              activeViewRole
            ]||
            activeViewRole
          }`
        );
      };
  }

  function refreshRoleSwitcher(){
    if(me?.isSuperAdmin&&!schoolView){$("roleSwitcher")?.classList.add("hidden");return;}
    createRoleSwitcher();

    const select=
      $("roleSwitcher");

    if(
      !select||
      !me
    ){
      return;
    }

    const roles=
      me.roles||[];

    const active=
      getActiveRole();

    select.innerHTML=
      roles.map(
        role=>`
          <option
            value="${role}">
            ${
              roleNames[role]||
              role
            }
          </option>
        `
      ).join("");

    select.value=
      active||"";

    select.classList.toggle(
      "hidden",
      roles.length<=1
    );
  }

  const oldApplyRoleVisibility=
    applyRoleVisibility;

  applyRoleVisibility=
    function(){
      if(!me){return;}
      if(me.isSuperAdmin&&!schoolView){renderPlatformProfile();return;}

      const role=
        getActiveRole();

      qsa(
        ".director-only"
      ).forEach(
        el=>{
          el.classList.toggle(
            "hidden",
            role!=="DIRECTOR"
          );
        }
      );

      qsa(
        ".guardian-only"
      ).forEach(
        el=>{
          el.classList.toggle(
            "hidden",
            role!=="GUARDIAN"
          );
        }
      );

      qsa(
        '[data-page="academic"]'
      ).forEach(
        el=>{
          el.classList.toggle(
            "hidden",
            role==="GUARDIAN"
          );
        }
      );

      qsa(
        "[data-attendance-nav]"
      ).forEach(
        el=>{
          el.classList.toggle(
            "hidden",
            ![
              "DIRECTOR",
              "ADMIN",
              "TEACHER"
            ].includes(
              role
            )
          );
        }
      );

      qsa(
        "[data-exams-nav]"
      ).forEach(
        el=>{
          el.classList.toggle(
            "hidden",
            ![
              "DIRECTOR",
              "ADMIN",
              "TEACHER"
            ].includes(
              role
            )
          );
        }
      );

      refreshRoleSwitcher();
    };

  const oldRenderProfile=
    renderProfile;

  renderProfile=
    function(){
      if(me?.isSuperAdmin&&!schoolView){renderPlatformProfile();return;}
      oldRenderProfile();

      if(!me){return;}
      if(me.isSuperAdmin&&!schoolView){renderPlatformProfile();return;}

      const role=
        getActiveRole();

      const label=
        roleNames[role]||
        role||
        "—";

      if(
        $("roleText")
      ){
        $("roleText")
          .textContent=
          label;
      }

      if(
        $("profileRoles")
      ){
        $("profileRoles")
          .textContent=
          label;
      }

      refreshRoleSwitcher();
    };

  const roleWatcher=
    setInterval(
      ()=>{
        if(me){
          refreshRoleSwitcher();

          applyRoleVisibility();

          renderProfile();

          clearInterval(
            roleWatcher
          );
        }
      },
      250
    );

})();

(function(){

  function installFinalReportStyles(){
    if(
      document.getElementById(
        "final-report-styles"
      )
    ){
      return;
    }

    // Module styles are served from features.css under the application CSP.
  }

  function reportValue(
    v
  ){
    return (
      v===null||
      v===undefined||
      v===""
    )
      ?"—"
            :escapeHtml(v);
  }

  function reportDecision(
    avg
  ){
    const n=
      Number(avg);

    if(
      !Number.isFinite(n)
    ){
      return "—";
    }

    if(n>=16){
      return "ممتاز";
    }

    if(n>=14){
      return "جيد جدًا";
    }

    if(n>=12){
      return "جيد";
    }

    if(n>=10){
      return "مقبول";
    }

    return "يحتاج إلى دعم";
  }

  async function shareStudentReport(
    student,
    report
  ){
    const text=
      `كشف نتائج التلميذ: ${
        student.full_name
      }\n`+
      `القسم: ${
        student.class_name||"—"
      }\n`+
      `المعدل السنوي: ${
        report.annualAverage??"—"
      }/20`;

    try{
      if(
        navigator.share
      ){
        await navigator.share({
          title:
            `كشف نتائج ${
              student.full_name
            }`,
          text
        });
      }else{
        await navigator
          .clipboard
          .writeText(
            text
          );

        toast(
          "تم نسخ ملخص الكشف"
        );
      }
    }catch(e){
      if(
        e?.name!=="AbortError"
      ){
        toast(
          "تعذرت المشاركة"
        );
      }
    }
  }

  openReport=
    async function(
      studentId
    ){

      installFinalReportStyles();

      try{
        const [
          d,
          b,
          v
        ]=
          await Promise.all([
            api(
              `/api/students/${
                encodeURIComponent(
                  studentId
                )
              }/report`
            ),

            api(
              "/api/branding"
            ),

            api(
              `/api/reports/${
                encodeURIComponent(
                  studentId
                )
              }/verification`,
              {
                method:"POST"
              }
            )
          ]);

        const student=
          d.student;

        const report=
          d.report;

        const school=
          me.school||{};

        const custom=
          b.branding?.mode===
          "CUSTOM";

        const logo=
          custom
            ?`/api/branding/header?ts=${
              Date.now()
            }`
            :"/assets/official-logo.png";

        const rows=
          (report.subjects||[])
            .map(
              subject=>`
                <tr>
                  <td>
                    ${escapeHtml(
                      subject.name
                    )}
                  </td>

                  <td>
                    ${reportValue(
                      subject.coefficient
                    )}
                  </td>

                  <td>
                    ${reportValue(
                      subject.terms?.T1
                    )}
                  </td>

                  <td>
                    ${reportValue(
                      subject.terms?.T2
                    )}
                  </td>

                  <td>
                    ${reportValue(
                      subject.terms?.T3
                    )}
                  </td>

                  <td>
                    ${reportValue(
                      subject.annual
                    )}
                  </td>
                </tr>
              `
            )
            .join("");

        const annual=
          report.annualAverage;

        showModal(`
          <div class="final-report">

            <div
              class="final-report-head">

              <div class="right">
                <b>
                  الجمهورية الإسلامية
                  الموريتانية
                </b>
                <br>

                وزارة التهذيب الوطني
                وإصلاح النظام التعليمي

                ${
                  school.wilaya
                    ?`
                      <br>
                      الإدارة الجهوية
                      بولاية
                      ${escapeHtml(
                        school.wilaya
                      )}
                    `
                    :""
                }

                ${
                  school.moughataa
                    ?`
                      <br>
                      مفتشية مقاطعة
                      ${escapeHtml(
                        school.moughataa
                      )}
                    `
                    :""
                }

                ${
                  school.inspection
                    ?`
                      <br>
                      ${escapeHtml(
                        school.inspection
                      )}
                    `
                    :""
                }
              </div>

              <div
                class="final-report-logo">

                <div
                  class="bismillah">
                  بسم الله الرحمن الرحيم
                </div>

                <img
                  src="${logo}"
                  alt="الشعار">
              </div>

              <div class="left">
                <b>
                  شرف - إخاء - عدالة
                </b>
                <br>

                المدرسة:
                ${escapeHtml(
                  school.name||"—"
                )}
                <br>

                السنة الدراسية:
                ${escapeHtml(
                  school.academic_year||
                  "—"
                )}
              </div>

            </div>

            <div
              class="final-report-title">
              كشف نتائج التلميذ
            </div>

            <div
              class="final-student-info">

              <div>
                <b>الاسم:</b>

                ${escapeHtml(
                  student.full_name||
                  "—"
                )}
              </div>

              <div>
                <b>
                  رقم التلميذ:
                </b>

                ${escapeHtml(
                  student.student_uid||
                  "—"
                )}
              </div>

              <div>
                <b>القسم:</b>

                ${escapeHtml(
                  student.class_name||
                  "—"
                )}
              </div>

              <div>
                <b>
                  النتيجة العامة:
                </b>

                ${reportDecision(
                  annual
                )}
              </div>

            </div>

            <table
              class="final-report-table">

              <thead>
                <tr>
                  <th>المادة</th>
                  <th>المعامل</th>
                  <th>
                    الفصل الأول
                  </th>
                  <th>
                    الفصل الثاني
                  </th>
                  <th>
                    الفصل الثالث
                  </th>
                  <th>
                    المعدل السنوي
                  </th>
                </tr>
              </thead>

              <tbody>
                ${
                  rows||
                  `
                    <tr>
                      <td
                        colspan="6">
                        لا توجد نتائج
                        مسجلة
                      </td>
                    </tr>
                  `
                }
              </tbody>

            </table>

            <div
              class="final-report-averages">

              <div
                class="final-average">

                <small>
                  معدل الفصل الأول
                </small>

                <b>
                  ${reportValue(
                    report
                      .termAverages
                      ?.T1
                  )}
                </b>

                /20
              </div>

              <div
                class="final-average">

                <small>
                  معدل الفصل الثاني
                </small>

                <b>
                  ${reportValue(
                    report
                      .termAverages
                      ?.T2
                  )}
                </b>

                /20
              </div>

              <div
                class="final-average">

                <small>
                  معدل الفصل الثالث
                </small>

                <b>
                  ${reportValue(
                    report
                      .termAverages
                      ?.T3
                  )}
                </b>

                /20
              </div>

              <div
                class=
                  "final-average final-annual">

                <small>
                  المعدل السنوي
                </small>

                <b>
                  ${reportValue(
                    annual
                  )}
                </b>

                /20
              </div>

            </div>

            <div
              class="final-signatures">

              <div
                class="final-signature-box">

                <b>
                  توقيع المدير
                </b>

                <div
                  class="final-signature-line">
                  التوقيع
                </div>
              </div>

              <div
                class="final-signature-box">

                <b>
                  ختم المؤسسة
                </b>

                <div
                  class="final-signature-line">
                  الختم
                </div>
              </div>

            </div>

            <div
              class="feature-style-2">

              <img
                src="${v.qrDataUrl}"
                alt="QR التحقق"
                class="feature-style-3">

              <div>
                <b>
                  التحقق من صحة الكشف
                </b>
                <br>

                <small>
                  امسح الرمز لعرض
                  النسخة الموثقة
                </small>
                <br>

                <b>
                  ${escapeHtml(
                    v.code||""
                  )}
                </b>
              </div>

            </div>

            <div
              class="final-report-note">
              تم إنشاء هذا الكشف
              بواسطة منصة مدرستي
              | Ma Madrassa
            </div>

            <div
              class=
                "final-report-actions no-print">

              <button
                id="finalPrintReport"
                class="primary"
                type="button">
                حفظ PDF / طباعة
              </button>

              <button
                id="finalShareReport"
                class="ghost"
                type="button">
                مشاركة
              </button>

            </div>

          </div>
        `);

        $("finalPrintReport")
          .onclick=
          ()=>{
            window.print();
          };

        $("finalShareReport")
          .onclick=
          ()=>{
            shareStudentReport(
              student,
              report
            );
          };

      }catch(e){
        toast(
          e.status===403
            ?"لا تملك صلاحية عرض هذا الكشف"
            :"تعذر فتح كشف النتائج"
        );
      }
    };

  async function openSuperAdminPanel(){
    try{
      const platform=
        await api(
          "/api/platform/me"
        );

      if(
        !platform?.isSuperAdmin
      ){
        return false;
      }

      hideAll();

      $("appShell")
        ?.classList
        .remove(
          "hidden"
        );

      qsa(
        ".page"
      ).forEach(
        p=>
          p.classList.remove(
            "active"
          )
      );

      $("page-super-admin")
        ?.classList
        .add(
          "active"
        );

      if(
        $("pageTitle")
      ){
        $("pageTitle")
          .textContent=
          "إدارة منصة مدرستي";
      }

      await loadSuperAdminDashboard();

      return true;

    }catch{
      return false;
    }
  }

  window.loadSuperAdminDashboard = async function loadSuperAdminDashboard(){
    try{
      const [
        overviewData,
        schoolsData
      ]=
        await Promise.all([
          api(
            "/api/platform/overview"
          ),
          api(
            "/api/platform/schools"
          )
        ]);

      const overview=
        overviewData.overview||{};

      if(
        $("saSchoolsCount")
      ){
        $("saSchoolsCount")
          .textContent=
          overview.schools??0;
      }

      if(
        $("saUsersCount")
      ){
        $("saUsersCount")
          .textContent=
          overview.users??0;
      }

      if(
        $("saStudentsCount")
      ){
        $("saStudentsCount")
          .textContent=
          overview.students??0;
      }

      if(
        $("saClassesCount")
      ){
        $("saClassesCount")
          .textContent=
          overview.classes??0;
      }

      renderSuperAdminSchools(
        schoolsData.schools||[]
      );

    }catch(e){
      toast(
        "تعذر تحميل لوحة مالك المنصة"
      );
    }
  }

  function renderSuperAdminSchools(
    schools
  ){
    const box=
      $("saSchoolsList");

    if(!box){
      return;
    }

    if(
      !schools.length
    ){
      box.innerHTML=
        "<p>"+
        "لا توجد مدارس مسجلة بعد."+
        "</p>";

      return;
    }

    box.innerHTML=
      schools.map(
        s=>`
          <div class="mini-card">

            <div>
              <b>
                ${escapeHtml(
                  s.name
                )}
              </b>

              <small>
                ${
                  s.school_type===
                  "PRIVATE"
                    ?"خصوصية"
                    :"عمومية"
                }

                ·
                ${escapeHtml(
                  s.wilaya||"—"
                )}

                ·
                ${escapeHtml(
                  s.academic_year||
                  "—"
                )}
              </small>

              <small>
                التلاميذ:
                ${
                  s.students_count||0
                }

                · الأقسام:
                ${
                  s.classes_count||0
                }

                · المستخدمون:
                ${
                  s.users_count||0
                }
              </small>
            </div>

            <div
              class="feature-style-4">

              <button
                type="button"
                data-school-director=
                  "${s.id}">
                تعيين مدير
              </button>

              <button
                type="button"
                data-school-status=
                  "${s.id}"
                data-active=
                  "${
                    s.active
                      ?"1"
                      :"0"
                  }">
                ${
                  s.active
                    ?"تعطيل"
                    :"تشغيل"
                }
              </button>

              <button
                type="button"
                data-school-edit=
                  "${s.id}">
                تعديل
              </button>

              <button
                type="button"
                data-school-delete=
                  "${s.id}">
                أرشفة
              </button>

            </div>
          </div>
        `
      ).join("");

    qsa(
      "[data-school-status]"
    ).forEach(
      btn=>{
        btn.onclick=
          async()=>{
            const id=
              btn.dataset
                .schoolStatus;

            const currentlyActive=
              btn.dataset.active===
              "1";

            try{
              await api(
                `/api/platform/schools/${
                  encodeURIComponent(
                    id
                  )
                }/status`,
                {
                  method:"PATCH",
                  body:JSON.stringify({
                    active:
                      !currentlyActive
                  })
                }
              );

              toast(
                currentlyActive
                  ?"تم تعطيل المدرسة"
                  :"تم تشغيل المدرسة"
              );

              await loadSuperAdminDashboard();

            }catch{
              toast(
                "تعذر تغيير حالة المدرسة"
              );
            }
          };
      }
    );

    qsa(
      "[data-school-director]"
    ).forEach(
      btn=>{
        btn.onclick=
          async()=>{
            const schoolId=
              btn.dataset
                .schoolDirector;

            const fullName=
              prompt(
                "اسم المدير الكامل"
              );

            if(!fullName){
              return;
            }

            const login=
              prompt(
                "اسم المستخدم للمدير"
              );

            if(!login){
              return;
            }

            const email=
              prompt(
                "البريد الإلكتروني للمدير (اختياري)"
              )||"";

            const password=
              prompt(
                "كلمة مرور المدير"
              );

            if(!password){
              return;
            }

            try{
              await api(
                `/api/platform/schools/${
                  encodeURIComponent(
                    schoolId
                  )
                }/director`,
                {
                  method:"POST",
                  body:JSON.stringify({
                    fullName,
                    login,
                    email,
                    password
                  })
                }
              );

              toast(
                "تم إنشاء حساب المدير وربطه بالمدرسة"
              );

              await loadSuperAdminDashboard();

            }catch(e){
              if(
                e.data?.error===
                "DIRECTOR_ACCOUNT_ALREADY_EXISTS"
              ){
                toast(
                  "يوجد حساب مدير بهذا اسم الدخول أو البريد"
                );
              }else if(
                e.data?.error===
                "INVALID_DIRECTOR_DATA"
              ){
                toast(
                  "بيانات المدير غير صحيحة"
                );
              }else{
                toast(
                  "تعذر إنشاء حساب المدير"
                );
              }
            }
          };
      }
    );

    qsa(
      "[data-school-edit]"
    ).forEach(
      btn=>{
        btn.onclick=
          async()=>{
            const id=
              btn.dataset
                .schoolEdit;

            const school=
              schools.find(
                s=>
                  String(s.id)===
                  String(id)
              );

            if(!school){
              return;
            }

            const name=
              prompt(
                "اسم المدرسة",
                school.name||""
              );

            if(!name){
              return;
            }

            const schoolType=
              prompt(
                "النوع: PUBLIC أو PRIVATE",
                school.school_type||
                "PUBLIC"
              );

            if(!schoolType){
              return;
            }

            const wilaya=
              prompt(
                "الولاية",
                school.wilaya||""
              )??"";

            const moughataa=
              prompt(
                "المقاطعة",
                school.moughataa||""
              )??"";

            const inspection=
              prompt(
                "المفتشية",
     school.inspection||""
  )??"";

const academicYear=
  prompt(
    "السنة الدراسية",
    school.academic_year||
    "2026/2027"
  );

if(
  !academicYear
){
  return;
}

try{
  await api(
    `/api/platform/schools/${
      encodeURIComponent(
        id
      )
    }`,
    {
      method:"PATCH",
      body:JSON.stringify({
        name,
        schoolType,
        wilaya,
        moughataa,
        inspection,
        academicYear
      })
    }
  );

  toast(
    "تم تعديل المدرسة"
  );

  await loadSuperAdminDashboard();

}catch(e){
  toast(
    "تعذر تعديل المدرسة"
  );
}
          };
      }
    );

    qsa(
      "[data-school-delete]"
    ).forEach(
      btn=>{
        btn.onclick=
          async()=>{
            const id=
              btn.dataset
                .schoolDelete;

            const school=
              schools.find(
                s=>
                  String(s.id)===
                  String(id)
              );

            if(
              !confirm(
                `هل تريد أرشفة مدرسة ${
                  school?.name||""
                } مع الاحتفاظ بجميع بياناتها؟`
              )
            ){
              return;
            }

            try{
              await api(
                `/api/platform/schools/${
                  encodeURIComponent(
                    id
                  )
                }`,
                {
                  method:"DELETE"
                }
              );

              toast(
                "تمت أرشفة المدرسة"
              );

              await loadSuperAdminDashboard();

            }catch(e){
              toast(
                "تعذرت أرشفة المدرسة"
              );
            }
          };
      }
    );
  }

  async function createSuperAdminSchool(){
    const name=
      $("saSchoolName")
        ?.value
        .trim();

    const schoolType=
      $("saSchoolType")
        ?.value;

    const wilaya=
      $("saWilaya")
        ?.value
        .trim();

    const moughataa=
      $("saMoughataa")
        ?.value
        .trim();

    const inspection=
      $("saInspection")
        ?.value
        .trim();

    const academicYear=
      $("saAcademicYear")
        ?.value
        .trim();

    if(!name){
      toast(
        "أدخل اسم المدرسة"
      );

      return;
    }

    if(
      !academicYear
    ){
      toast(
        "أدخل السنة الدراسية"
      );

      return;
    }

    try{
      await api(
        "/api/platform/schools",
        {
          method:"POST",
          body:JSON.stringify({
            name,
            schoolType,
            wilaya,
            moughataa,
            inspection,
            academicYear,
            locale:"ar"
          })
        }
      );

      toast(
        "تم إنشاء المدرسة بنجاح"
      );

      [
        "saSchoolName",
        "saWilaya",
        "saMoughataa",
        "saInspection",
        "saAcademicYear"
      ].forEach(
        id=>{
          if($(id)){
            $(id).value="";
          }
        }
      );

      await loadSuperAdminDashboard();

    }catch(e){
      toast(
        e.data?.error===
        "SCHOOL_NAME_REQUIRED"
          ?"اسم المدرسة مطلوب"
          :"تعذر إنشاء المدرسة"
      );
    }
  }

  $("saCreateSchool")
    ?.addEventListener(
      "click",
      createSuperAdminSchool
    );

  $("superAdminRefresh")
    ?.addEventListener(
      "click",
      loadSuperAdminDashboard
    );

  $("superAdminBootstrapBtn")
    ?.addEventListener(
      "click",
      bootstrapSuperAdmin
    );

})();
