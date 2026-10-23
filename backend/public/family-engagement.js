/* مدرستي: manual family engagement from teacher/director's own WhatsApp.
   Nothing is sent automatically. Recipient consent must be recorded by the school. */
let familyRoster=[],familyResults=null,familyClasses=[],familyBusy=false;
const familyEl=id=>document.getElementById(id);
const familyEsc=value=>escapeHtml(String(value??""));
const familyAr=(ar,fr)=>locale==="fr"?fr:ar;
function familyEligible(){return !!me?.schoolId&&(me.roles||[]).some(r=>r==="DIRECTOR"||r==="TEACHER");}
async function loadFamilyPanel(){
  if(!familyEligible()||familyBusy)return;
  familyBusy=true;
  const status=familyEl("familyStatus"),cls=familyEl("familyClass");
  status.textContent=familyAr("جارٍ تحميل الأقسام…","Chargement des classes…");
  try{
    const d=await api("/api/classes");
    familyClasses=d.classes||[];
    const before=cls.value;
    cls.innerHTML=familyClasses.map(c=>`<option value="${familyEsc(c.id)}">${familyEsc(c.name)} · ${familyEsc(c.academic_year||"")}</option>`).join("");
    if(familyClasses.some(c=>c.id===before))cls.value=before;
    if(!familyClasses.length){familyEl("familyList").textContent=familyAr("لا توجد أقسام متاحة.","Aucune classe disponible.");familyEl("familyRanks").textContent="";status.textContent="";return;}
    await loadFamilySubjects();
  }catch(e){status.textContent=familyAr("تعذّر تحميل الأقسام. أعد المحاولة.","Chargement impossible.");}
  finally{familyBusy=false;}
}
async function loadFamilySubjects(){
  const id=familyEl("familyClass").value,subject=familyEl("familySubject");
  subject.innerHTML='<option value="">ترتيب جميع مواد القسم</option>';
  if(!id)return;
  try{
    const d=await api("/api/classes/"+encodeURIComponent(id)+"/subjects");
    subject.innerHTML='<option value="">ترتيب جميع مواد القسم</option>'+
      (d.subjects||[]).map(x=>`<option value="${familyEsc(x.id)}">${familyEsc(x.name)}</option>`).join("");
    if(!(me.roles||[]).includes("DIRECTOR")&&d.subjects?.length)subject.value=d.subjects[0].id;
  }catch{}
  await refreshFamilyPanel();
}
async function refreshFamilyPanel(){
  const id=familyEl("familyClass").value,term=familyEl("familyTerm").value,subjectId=familyEl("familySubject").value;
  if(!id)return;
  const status=familyEl("familyStatus");
  status.textContent=familyAr("جارٍ إعداد رسائل أولياء الأمور…","Préparation des messages…");
  familyRoster=[];familyResults=null;
  try{
    const d=await api("/api/family/contacts/"+encodeURIComponent(id));
    familyRoster=d.students||[];
  }catch(e){
    status.textContent=familyAr("لا تتوفر صلاحية قراءة قائمة تلاميذ هذا القسم.","Accès aux élèves non autorisé.");
    familyEl("familyList").replaceChildren();familyEl("familyRanks").replaceChildren();return;
  }
  try{
    const results=await api("/api/classes/"+encodeURIComponent(id)+"/results?"+new URLSearchParams({...{term},...(subjectId?{subjectId}:{})}));
    familyResults=results;
  }catch{} // subject-scoped teachers may not have class-wide ranking access
  renderFamilyPanel();
  status.textContent=familyAr(`عدد التلاميذ: ${familyRoster.length} • فتح واتساب يدوي من هاتفك؛ لا يتم الإرسال تلقائيًا.`,`Élèves : ${familyRoster.length} • Ouverture manuelle de WhatsApp.`);
}
function familyResultFor(id){return familyResults?.results?.find(x=>x.id===id)||null;}
function familyAvailableScores(result,period){
  if(!result?.report?.subjects)return [];
  const selectedTerms=period==="ANNUAL"?["T1","T2","T3"]:[period];
  const termNames={T1:"الفصل الأول",T2:"الفصل الثاني",T3:"الفصل الثالث"};
  return selectedTerms.flatMap(term=>(result.report.subjects||[]).flatMap(subject=>{
    const score=subject.terms?.[term];
    return score===null||score===undefined?[]:[`• ${subject.name} — ${termNames[term]}: ${score}/20`];
  }));
}
function familyText(student,kind){
  const school=me?.school?.name||"مدرستي",cls=familyClasses.find(c=>c.id===familyEl("familyClass").value);
  const className=cls?.name||"",term=familyEl("familyTerm").value,year=cls?.academic_year||"";
  const intro=`*مدرسة ${school}*\nولي أمر التلميذ/ة: ${student.full_name}\nالقسم: ${className} | ${year}\n\n`;
  if(kind==="results"){
    const r=familyResultFor(student.id);
    if(!r||!r.complete||r.average==null)return null;
    const selectedSubject=familyEl("familySubject");
    const singleSubject=!!selectedSubject.value;
    const subjectName=selectedSubject.selectedOptions[0]?.textContent||"المادة";
    const label=term==="ANNUAL"?"المعدل السنوي":`معدل الفصل ${term.slice(1)}`;
    const scoreLabel=singleSubject?`نتيجة مادة ${subjectName}`:"النتائج الدراسية";
    const scores=(r.report?.subjects||[]).map(x=>{
      const value=term==="ANNUAL"?x.annual:x.terms?.[term];
      return value==null?null:`• ${x.name}: ${value}/20`;
    }).filter(Boolean);
    return intro+`*إشعار بنتائج ${scoreLabel} مكتملة*\n${label}: *${r.average}/20*\n${singleSubject?"ترتيب المادة":"ترتيب القسم"}: *${r.rank??"—"}* من ${familyResults?.results?.length||"—"}\n`+scores.join("\n")+
      "\n\nللاطلاع على الكشف الموثق يرجى الدخول إلى حساب ولي الأمر في مدرستي.\nمع تحيات إدارة المدرسة.";
  }
  if(kind==="progress"){
    const available=familyAvailableScores(familyResultFor(student.id),term);
    if(!available.length)return null;
    return intro+"*إشعار بالدرجات المرحلية المسجلة حتى الآن*\n"+
      "هذه درجات متاحة للمراجعة وليست نتيجة نهائية أو ترتيبًا رسميًا.\n"+
      available.join("\n")+
      "\n\nقد تبقى مواد أو فصول لم تُسجّل درجاتها بعد. للمعلومات النهائية يرجى الرجوع إلى المدرسة.\nمع تحيات الإدارة.";
  }
  if(kind==="award"){
    const title=familyEl("familyAwardTitle").value.trim()||"شهادة تميز وتقدير";
    const reason=familyEl("familyNote").value.trim()||"الاجتهاد والمثابرة والتميز";
    return intro+`🎓 *إعلان تكريم وشهادة تميز* 🏅\nتُكرّم المدرسة التلميذ/ة *${student.full_name}*، وتمنحه/ها شهادة *${title}* تقديرًا لـ${reason}.\n\nمبارك للتلميذ/ة ولأسرته/ها، مع تمنياتنا بمزيد من التفوق والنجاح.\n*إدارة ${school}*`;
  }
  const note=familyEl("familyNote").value.trim();
  if(kind==="attendance")return intro+`*متابعة الحضور والمواظبة*\n${note||"نرجو التواصل مع إدارة المدرسة بخصوص الحضور والمواظبة."}\n\nمع تحيات الإدارة.`;
  if(!note)return null;
  return intro+`*إشعار من المدرسة*\n${note}\n\nمع تحيات الإدارة.`;
}
function renderFamilyPanel(){
  const kind=familyEl("familyKind").value,teacher=!(me.roles||[]).includes("DIRECTOR");
  familyEl("familyRankScope").textContent=familyEl("familySubject").value?"ترتيب المادة • المكتمل فقط":"ترتيب القسم • المكتمل فقط";
  familyEl("familyAwardOptions").classList.toggle("hidden",kind!=="award");
  familyEl("familyMessageHelp").textContent=kind==="results"
    ?familyAr("النتائج النهائية والترتيب لا يُرسلان إلا بعد اكتمال الدرجات. للدرجات المسجلة اختر «الدرجات المرحلية».","Résultats finaux et classement uniquement lorsque les notes sont complètes.")
    :kind==="progress"
    ?familyAr("إشعار مرحلي بالدرجات المحفوظة فقط، دون معدل نهائي أو ترتيب. يصل إلى ولي الأمر من واتساب هاتفك.","Partage des notes disponibles, sans moyenne finale ni classement.")
    :kind==="award"
    ?familyAr("الإعلان ونص الشهادة في رسالة واحدة؛ يمكن طباعة الشهادة PDF وإرفاقها يدويًا في واتساب.","Annonce et texte du certificat en un message ; PDF à joindre manuellement.")
    :familyAr("اكتب رسالة موجزة وواضحة ومناسبة لولي الأمر.","Rédigez une notification concise.");
  const q=familyEl("familySearch").value.trim().toLocaleLowerCase();
  let display=familyRoster.filter(s=>!q||s.full_name.toLocaleLowerCase().includes(q)||String(s.student_uid).includes(q));
  familyEl("familyList").innerHTML=display.map(s=>{
    const result=familyResultFor(s.id),optIn=!!s.consent&&!!s.guardian_phone;
    const avg=result?.complete&&result.average!=null?`<span class="family-score">${familyEsc(result.average)}/20</span>`:"";
    const rank=result?.rank!=null&&result.complete?`<span class="family-rank">#${familyEsc(result.rank)}</span>`:"";
    const hasPartial=familyAvailableScores(result,familyEl("familyTerm").value).length>0;
    const canSend=optIn&&(
      kind==="results"?!!(result?.complete&&result.average!=null):
      kind==="progress"?hasPartial:
      kind==="notice"?!!familyEl("familyNote").value.trim():true
    );
    const contact=optIn?familyAr("رقم الولي مرتبط","Contact autorisé"):familyAr("لم يُفعّل رقم واتساب الولي","Contact non autorisé");
    return `<article class="family-student" data-family-id="${familyEsc(s.id)}">
      <div class="family-student-head"><div><strong>${familyEsc(s.full_name)}</strong><small>${familyEsc(s.student_uid)} · ${contact}</small></div><div class="family-results-chips">${avg}${rank}</div></div>
      <div class="family-actions">
        <button class="family-whatsapp" type="button" data-family-open="${familyEsc(s.id)}" ${canSend?"":"disabled"}>◉ ${familyAr("فتح واتساب الولي","Ouvrir WhatsApp")}</button>
        ${kind==="award"?`<button class="family-secondary" type="button" data-family-certificate="${familyEsc(s.id)}">🎓 ${familyAr("معاينة الشهادة","Certificat")}</button>`:""}
      </div>
      ${!canSend?`<p class="family-warning">${!optIn?"أضف رقم ولي الأمر ووافق على التواصل عبر واتساب قبل الإرسال.":kind==="results"?"النتائج غير مكتملة. يمكنك اختيار «الدرجات المرحلية» أو «التكريم» دون انتظار المعدل النهائي.":kind==="progress"?"لم تُحفظ أي درجة لهذه الفترة بعد.":kind==="notice"?"اكتب نص الإشعار أولًا.":""}</p>`:""}
      ${!teacher?`<details class="family-contact-edit"><summary>تعديل رقم واتساب الولي والموافقة</summary><form data-family-contact="${familyEsc(s.id)}"><label>رقم الولي (موريتانيا: 8 أرقام أو +رمز الدولة)<input name="phone" inputmode="tel" autocomplete="tel" maxlength="18" value="${familyEsc(s.guardian_phone||"")}" placeholder="مثال: 22212345678"></label><label class="family-optin"><input type="checkbox" name="consent" ${s.consent?"checked":""}> أكد الولي موافقته على إشعارات المدرسة عبر واتساب</label><button class="family-secondary" type="submit">حفظ الرقم والموافقة</button></form></details>`:""}
    </article>`;
  }).join("")||'<p class="empty">لا يوجد تلاميذ مطابقون للبحث.</p>';
  const ranked=familyResults?.results?.filter(x=>x.complete&&x.rank!=null)||[];
  familyEl("familyRanks").innerHTML=ranked.length?
    ranked.slice(0,50).map(r=>`<div class="family-position"><b class="family-place">${familyEsc(r.rank)}</b><span>${familyEsc(r.full_name)}</span><strong>${familyEsc(r.average)}/20</strong></div>`).join("")
    :`<p class="family-warning">${familyResults?"لا توجد نتائج مكتملة للترتيب حتى الآن.":"ترتيب القسم العام متاح للمدير بعد اكتمال الدرجات."}</p>`;
  const available=familyRoster.filter(s=>s.consent&&s.guardian_phone).length;
  familyEl("familyCounts").textContent=`${available} / ${familyRoster.length} ${familyAr("أولياء لديهم رقم وموافقة","contacts autorisés")}`;
}
function familyAwardPreview(student){
  const cls=familyClasses.find(c=>c.id===familyEl("familyClass").value);
  const school=me?.school?.name||"مدرستي",title=familyEl("familyAwardTitle").value.trim()||"شهادة تميز وتقدير";
  const reason=familyEl("familyNote").value.trim()||"التفوق والاجتهاد والمثابرة";
  const html=`<section class="family-certificate" id="familyCertificate">
    <div class="family-cert-top">✦ ✦ ✦</div>
    <div class="family-cert-icon">🎓</div>
    <div class="family-cert-label">مدرستي • شهادة تكريم</div>
    <h2>${familyEsc(title)}</h2>
    <p>يسر <strong>${familyEsc(school)}</strong> أن تتقدم بالشكر والتقدير إلى</p>
    <h3>${familyEsc(student.full_name)}</h3>
    <p>من قسم <b>${familyEsc(cls?.name||"—")}</b>، تقديرًا لـ${familyEsc(reason)}</p>
    <p>مع تمنياتنا بمزيد من التقدم والنجاح</p>
    <div class="family-cert-footer"><span>التاريخ: ${new Date().toLocaleDateString("ar-MR")}</span><span>إدارة المدرسة · التوقيع والختم</span></div>
    <small>تُمنح هذه الشهادة من قبل المدرسة وتُستخدم للتكريم.</small>
  </section><div class="family-print-actions no-print"><button id="familyPrintCertificate" class="primary" type="button">طباعة الشهادة / حفظ PDF</button><p>بعد حفظ PDF يمكنك إرفاقه برسالة واتساب التي تتضمن الإعلان ونص التكريم.</p></div>`;
  showModal(html);
  familyEl("familyPrintCertificate").onclick=()=>window.print();
}
function familyContactSubmit(event){
  event.preventDefault();
  const form=event.target,id=form.dataset.familyContact;
  if(!id)return;
  const phone=form.elements.phone.value.trim(),consent=form.elements.consent.checked;
  if(consent&&!phone){toast("أدخل رقم ولي الأمر لتفعيل الموافقة.");return;}
  const button=form.querySelector('button[type="submit"]');button.disabled=true;
  api("/api/family/contacts/"+encodeURIComponent(id),{method:"PUT",body:JSON.stringify({guardianPhone:phone,guardianConsent:consent})})
   .then(()=>{toast("تم حفظ رقم الولي والموافقة.");return refreshFamilyPanel()})
   .catch(e=>toast(e?.data?.error==="INVALID_CONTACT"?"رقم غير صحيح. أدخل 8 أرقام موريتانية أو رقمًا دوليًا.":"تعذر حفظ الرقم والموافقة."))
   .finally(()=>{button.disabled=false;});
}
(function(){
  const box=familyEl("page-family");if(!box)return;
  familyEl("familyClass").addEventListener("change",loadFamilySubjects);
  familyEl("familySubject").addEventListener("change",refreshFamilyPanel);
  familyEl("familyTerm").addEventListener("change",refreshFamilyPanel);
  familyEl("familyKind").addEventListener("change",renderFamilyPanel);
  familyEl("familySearch").addEventListener("input",renderFamilyPanel);
  familyEl("familyNote").addEventListener("input",()=>{
    if(familyEl("familyKind").value==="notice")renderFamilyPanel();
  });
  familyEl("familyRefresh").addEventListener("click",loadFamilyPanel);
  familyEl("familyGroupShare").addEventListener("click",()=>{
    const note=familyEl("familyNote").value.trim();
    if(!note){toast("اكتب نص الإعلان العام أولًا.");familyEl("familyNote").focus();return;}
    const cls=familyClasses.find(c=>c.id===familyEl("familyClass").value);
    const msg=`*إعلان عام من ${me?.school?.name||"مدرستي"}*\nالقسم: ${cls?.name||"—"}\n\n${note}\n\nمع تحيات الإدارة.`;
    window.open("https://wa.me/?text="+encodeURIComponent(msg),"_blank","noopener,noreferrer");
  });
  familyEl("familyList").addEventListener("submit",familyContactSubmit);
  familyEl("familyList").addEventListener("click",event=>{
    const send=event.target.closest("[data-family-open]");
    const award=event.target.closest("[data-family-certificate]");
    if(!send&&!award)return;
    const id=(send||award).dataset.familyOpen||(send||award).dataset.familyCertificate;
    const student=familyRoster.find(s=>s.id===id);if(!student)return;
    if(award){familyAwardPreview(student);return;}
    if(!student.guardian_phone||!student.consent){toast("يلزم تسجيل رقم الولي وموافقته.");return;}
    const message=familyText(student,familyEl("familyKind").value);
    if(!message){toast("اكتب نص الإشعار أو أكمل نتائج التلميذ قبل فتح واتساب.");return;}
    const link="https://wa.me/"+student.guardian_phone+"?text="+encodeURIComponent(message);
    window.open(link,"_blank","noopener,noreferrer"); // user action; WhatsApp never sends without user confirmation
  });
})();
