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
