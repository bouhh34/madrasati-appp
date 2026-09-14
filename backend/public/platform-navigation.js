function platformValue(value){const labels={ACTIVE:"نشط",PENDING:"بانتظار التفعيل",DISABLED:"معطل",LOCKED:"مقفل",DIRECTOR:"مدير",TEACHER:"معلم",ADMIN:"إداري",GUARDIAN:"ولي تلميذ",SUPER_ADMIN:"مالك المنصة"};return locale==="ar"?(labels[value]||value):tr(value);}
let platformAccountOffset=0;
function platformSection(section){
  if(!me?.isSuperAdmin||schoolView)return;
  navigate('super-admin');
  qsa('[data-platform-area]').forEach(el=>el.classList.toggle('hidden',el.dataset.platformArea!==section));
  qsa('[data-platform-nav]').forEach(el=>{el.classList.toggle('active',el.dataset.platformNav===section);el.setAttribute('aria-current',el.dataset.platformNav===section?'page':'false');});
  if(section==='accounts')loadPlatformAccounts();
}
async function loadPlatformAccounts(){
  const root=$('platformAccountsList');root.textContent=st('جارٍ التحميل…','Chargement…');
  try{
    const query=new URLSearchParams({q:$('platformAccountQuery').value,role:$('platformAccountRole').value,offset:String(platformAccountOffset)});
    const data=await api(`/api/platform/accounts?${query}`);
    root.innerHTML=data.accounts.map(u=>`<div class="mini-card"><div><b>${escapeHtml(u.full_name)}</b><small>${escapeHtml(u.login)} · ${escapeHtml(platformValue(u.account_state))}</small><small>${escapeHtml(u.schools.join(' · '))}</small></div><span>${escapeHtml(u.roles.map(platformValue).join(' · '))}</span></div>`).join('')||st('لا توجد حسابات مطابقة.','Aucun compte correspondant.');
    $('platformAccountsPrevious').disabled=platformAccountOffset===0;$('platformAccountsNext').disabled=!data.hasMore;
  }catch{root.textContent=st('تعذّر تحميل الحسابات. أعد المحاولة.','Chargement impossible. Réessayez.');}
}
qsa('[data-platform-nav]').forEach(b=>b.onclick=()=>platformSection(b.dataset.platformNav));
$('accountLogout').onclick=logout;
$('returnPlatform').onclick=async()=>{schoolView=false;await openForMe();platformSection('overview');};
$('chooseManagedSchool').onclick=async()=>{
  try{
    const data=await api('/api/auth/schools');
    if(!data.schools.length){toast(st('لا توجد مدرسة مرتبطة بصلاحيات مدرسية لهذا الحساب.','Aucune école avec des droits scolaires pour ce compte.'));return;}
    showSchoolChooser(data.schools);
  }catch{toast(st('تعذّر تحميل المدارس.','Chargement des écoles impossible.'));}
};
$('platformAccountSearch').onsubmit=e=>{e.preventDefault();platformAccountOffset=0;loadPlatformAccounts();};
$('platformAccountsPrevious').onclick=()=>{platformAccountOffset=Math.max(0,platformAccountOffset-50);loadPlatformAccounts();};
$('platformAccountsNext').onclick=()=>{platformAccountOffset+=50;loadPlatformAccounts();};
// Restoring a previous document must revalidate its session before revealing account data.
window.addEventListener('pageshow',event=>{if(event.persisted){hideAll();window.location.reload();}});

function openDirectorForm(schoolId, schoolName){
  showModal(`<form id="directorAccountForm" class="director-account-form">
    <h3>${st('تعيين مدير','Affecter un directeur')}</h3><p>${escapeHtml(schoolName||'')}</p>
    <label>${st('الحساب','Compte')}<select name="mode"><option value="new">${st('إنشاء حساب جديد','Créer un compte')}</option><option value="existing">${st('ربط حساب موجود','Associer un compte existant')}</option></select></label>
    <label>${st('اسم المستخدم','Identifiant')}<input name="login" required minlength="3" maxlength="80" autocomplete="off" dir="auto"></label>
    <div id="directorNewFields">
      <label>${st('الاسم الكامل','Nom complet')}<input name="fullName" required minlength="2" maxlength="160" autocomplete="off" dir="auto"></label>
      <label>${st('البريد الإلكتروني (اختياري)','E-mail (facultatif)')}<input name="email" type="email" maxlength="254" autocomplete="off" dir="ltr"></label>
      <label>${st('كلمة المرور — 15 حرفًا على الأقل','Mot de passe — 15 caractères minimum')}<input name="password" type="password" required minlength="15" maxlength="128" autocomplete="new-password"></label>
    </div>
    <p id="directorExistingHint" class="hint hidden">${st('سيُربط الحساب المحدد بهذه المدرسة بدور مدير. تبقى كلمة مروره وأدواره الحالية محفوظة.','Ce compte sera associé à cette école comme directeur. Son mot de passe et ses rôles actuels sont conservés.')}</p>
    <p id="directorFormStatus" role="status" aria-live="polite"></p>
    <button class="primary" type="submit">${st('حفظ التعيين','Enregistrer l’affectation')}</button>
  </form>`);
  const form=$('directorAccountForm');let pending=false;
  form.elements.mode.onchange=()=>{
    const existing=form.elements.mode.value==='existing';
    $('directorNewFields').classList.toggle('hidden',existing);
    $('directorExistingHint').classList.toggle('hidden',!existing);
    for(const name of ['fullName','email','password']){form.elements[name].disabled=existing;}
    form.elements.password.value='';$('directorFormStatus').textContent='';
  };
  form.onsubmit=async event=>{
    event.preventDefault();if(pending||!form.reportValidity())return;
    const data={mode:form.elements.mode.value,login:form.elements.login.value.trim()};
    if(data.mode==='new')Object.assign(data,{fullName:form.elements.fullName.value.trim(),email:form.elements.email.value.trim(),password:form.elements.password.value});
    pending=true;const button=form.querySelector('button');button.disabled=true;
    $('directorFormStatus').textContent=st('جارٍ الحفظ…','Enregistrement…');
    try{
      await api(`/api/platform/schools/${encodeURIComponent(schoolId)}/director`,{method:'POST',body:JSON.stringify(data)});
      form.elements.password.value='';
      if($('directorAccountForm')===form){$('modal').classList.add('hidden');$('modalBody').replaceChildren();}
      toast(st('تم تعيين المدير','Directeur affecté'));await loadSuperAdminDashboard();
    }catch(e){
      const messages={DIRECTOR_ACCOUNT_ALREADY_EXISTS:st('الحساب موجود. اختر ربط حساب موجود واستخدم اسم مستخدمه.','Ce compte existe. Choisissez l’association et son identifiant.'),DIRECTOR_ACCOUNT_NOT_FOUND:st('لم يوجد حساب بهذا الاسم. تحقق من اسم المستخدم.','Aucun compte avec cet identifiant.'),DIRECTOR_ACCOUNT_DISABLED:st('هذا الحساب مقفل أو معطل. لم يتغير تعيينه.','Ce compte est verrouillé ou désactivé. Affectation inchangée.'),SCHOOL_INACTIVE:st('فعّل المدرسة قبل تعيين المدير.','Activez l’école avant l’affectation.'),INVALID_DIRECTOR_DATA:st('تحقق من البيانات وطول كلمة المرور.','Vérifiez les champs et la longueur du mot de passe.')};
      if(form.isConnected)$('directorFormStatus').textContent=messages[e.data?.error]||st('تعذر الحفظ. أعد المحاولة.','Échec de l’enregistrement. Réessayez.');
    }finally{pending=false;button.disabled=false;}
  };
  form.elements.login.focus();
}
