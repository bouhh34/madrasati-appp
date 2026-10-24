const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const value=n=>n===null||n===undefined||n===''?'—':Number(n).toFixed(2);
const label=(lang,ar,fr)=>lang==='fr'?fr:ar;
const arabic=/[\u0600-\u06ff]/;
const arabicDigits={'٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9','۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9'};
const commonNames=new Map([
  ['محمد','Mohamed'],['أحمد','Ahmed'],['احمد','Ahmed'],['محمود','Mahmoud'],['عبد الله','Abdallah'],['عبدالله','Abdallah'],['عبد الرحمن','Abderrahmane'],['عبدالرحمن','Abderrahmane'],['إبراهيم','Ibrahim'],['ابراهيم','Ibrahim'],['إسماعيل','Ismail'],['اسماعيل','Ismail'],['يوسف','Youssouf'],['علي','Ali'],['عمر','Oumar'],['عثمان','Othmane'],['الحسن','El Hacen'],['الحسين','El Housseine'],['فاطمة','Fatimetou'],['مريم','Mariem'],['خديجة','Khadijetou'],['آمنة','Aminetou'],['أمينة','Aminetou'],['زينب','Zeinebou']
]);
const translit={
  'ا':'a','أ':'a','إ':'i','آ':'a','ٱ':'a','ب':'b','ت':'t','ث':'th','ج':'j','ح':'h','خ':'kh','د':'d','ذ':'dh','ر':'r','ز':'z','س':'s','ش':'ch','ص':'s','ض':'d','ط':'t','ظ':'z','ع':'a','غ':'gh','ف':'f','ق':'q','ك':'k','ل':'l','م':'m','ن':'n','ه':'h','ة':'a','و':'ou','ؤ':'ou','ي':'i','ى':'a','ئ':'i','ء':'','ـ':'','َ':'','ً':'','ُ':'','ٌ':'','ِ':'','ٍ':'','ْ':'','ّ':''
};
function latinize(input){
  const source=String(input??'');if(!arabic.test(source))return source;
  let normalized=[...source].map(c=>arabicDigits[c]??c).join('');
  const whole=commonNames.get(normalized.trim());if(whole)return whole;
  normalized=normalized.split(/(\s+)/).map(part=>commonNames.get(part)||[...part].map(c=>translit[c]??c).join('')).join('');
  return normalized.replace(/\s+/g,' ').trim().replace(/\b\w/g,c=>c.toUpperCase());
}
function localizedValue(obj,key,lang){
  const raw=obj?.[key]??'';if(lang!=='fr')return raw;
  const camel=key.replace(/_([a-z])/g,(_,c)=>c.toUpperCase());
  const preferred=obj?.[`${key}_fr`]??obj?.[`${camel}Fr`]??obj?.[`${key}Fr`]??null;
  return preferred||latinize(raw);
}
function subjectName(subject,lang){return localizedValue(subject,'name',lang);}
function studentName(student,lang){return localizedValue(student,'full_name',lang);}
function schoolName(school,lang){return localizedValue(school,'name',lang);}
function header(school,year,custom,lang,title){
  const wilaya=localizedValue(school,'wilaya',lang),moughataa=localizedValue(school,'moughataa',lang),inspection=localizedValue(school,'inspection',lang);
  const privateSchool=school?.school_type==='PRIVATE';
  const schoolSymbol=esc((schoolName(school,lang)||'مدرسة').trim());
  const emblem=privateSchool
    ?(custom?`<img class="school-emblem" src="/api/branding/header" alt="${label(lang,'شعار المدرسة','Logo de l’école')}">`:`<span class="school-identity-mark" role="img" aria-label="${label(lang,'رمز المدرسة','Symbole de l’école')} : ${schoolSymbol}"><svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path d="M32 44c-9-7-17-8-24-6V19c7-2 15-1 24 6v19Zm0 0c9-7 17-8 24-6V19c-7-2-15-1-24 6v19Z" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M32 25v19M12 26c5-.7 10 1 15 4m10 0c5-3 10-4.7 15-4" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="m32 5 2.4 5.6 6 .5-4.6 4 1.5 6-5.3-3.1-5.3 3.1 1.5-6-4.6-4 6-.5Z" fill="currentColor"/></svg></span>`)
    :`<img src="/assets/official-logo.png" alt="${label(lang,'شعار الدولة','Emblème national')}">`;
  return `<table class="official-header"><tbody><tr>
    <td class="authority">
      <p><b>${label(lang,'الجمهورية الإسلامية الموريتانية','République Islamique de Mauritanie')}</b></p>
      <p>${label(lang,'وزارة التهذيب الوطني وإصلاح النظام التعليمي','Ministère de l’Éducation nationale et de la Réforme du système éducatif')}</p>
      ${wilaya?`<p>${label(lang,'الإدارة الجهوية','Direction régionale')} : ${esc(wilaya)}</p>`:''}
      ${moughataa?`<p>${label(lang,'مفتشية المقاطعة','Inspection départementale')} : ${esc(moughataa)}</p>`:''}
      ${inspection?`<p>${label(lang,'المفتشية','Inspection')} : ${esc(inspection)}</p>`:''}
    </td>
    <td class="emblems">
      <div class="bismillah">${label(lang,'بسم الله الرحمن الرحيم','Au nom d’Allah, le Tout Miséricordieux, le Très Miséricordieux')}</div>
      <div class="logo-row">${emblem}</div>
      <div class="header-title">${esc(title)}</div>
    </td>
    <td class="school-meta">
      <p><b>${label(lang,'شرف - إخاء - عدالة','Honneur - Fraternité - Justice')}</b></p>
      <p>${label(lang,'السنة الدراسية','Année scolaire')} : <bdi>${esc(year||'—')}</bdi></p>
      <p>${label(lang,'المدرسة','École')} : ${esc(schoolName(school,lang)||'—')}</p>
    </td>
  </tr></tbody></table>`;
}
function studentCard(entry,school,{lang='ar',custom=false,period='T1',scope='CLASS'}={}){
  const {student,report,rank,totalStudents}=entry;
  const periodName=period==='ANNUAL'?label(lang,'السنوي','Annuel'):label(lang,`الفصل ${period.slice(1)}`,`Trimestre ${period.slice(1)}`);
  const complete=report.completeness?.[period]?.complete===true;
  const annualComplete=report.completeness?.ANNUAL?.complete===true;
  const title=scope==='SUBJECT'?label(lang,'كشف نتائج المادة','Relevé de matière'):label(lang,'كشف الدرجات','Bulletin de notes');
  const className=localizedValue(student,'class_name',lang);
  return `<section class="half-report" data-student-id="${esc(student.id)}">${header(school,student.academic_year,custom,lang,title)}
    <div class="report-period">${periodName}</div>
    <div class="student-meta"><b>${label(lang,'الاسم','Nom')} : ${esc(studentName(student,lang))}</b><span>${label(lang,'القسم','Classe')} : ${esc(className||'—')}</span><span>${label(lang,'الرقم','Matricule')} : <bdi>${esc(student.student_uid)}</bdi></span></div>
    <table class="report-table"><thead><tr><th>${label(lang,'المادة','Matière')}</th><th>${label(lang,'المعامل','Coef.')}</th><th>T1</th><th>T2</th><th>T3</th><th>${label(lang,'السنوي','Annuel')}</th></tr></thead><tbody>
    ${report.subjects.map(s=>`<tr><td>${esc(subjectName(s,lang))}</td><td>${esc(s.coefficient)}</td><td>${value(s.terms.T1)}</td><td>${value(s.terms.T2)}</td><td>${value(s.terms.T3)}</td><td>${value(['T1','T2','T3'].every(t=>s.terms?.[t]!=null)?s.annual:null)}</td></tr>`).join('')||`<tr><td colspan="6">${label(lang,'لا توجد مواد مرتبطة أو نتائج مسجلة','Aucune matière ou note enregistrée')}</td></tr>`}</tbody></table>
    <div class="report-totals"><span>T1: ${value(report.termAverages.T1)} /20</span><span>T2: ${value(report.termAverages.T2)} /20</span><span>T3: ${value(report.termAverages.T3)} /20</span><span>${label(lang,'السنوي','Annuel')}: <bdi>${value(annualComplete?report.annualAverage:null)} /20</bdi></span><span>${label(lang,'الترتيب','Rang')}: <bdi>${rank??'—'} / ${totalStudents??'—'}</bdi></span></div>
    <p class="completion-note">${complete?label(lang,'نتائج الفترة مكتملة.','Résultats complets pour la période.'):label(lang,'نتائج الفترة غير مكتملة؛ المعدلات المعروضة مؤقتة ولا يُعتمد ترتيب لها.','Résultats incomplets : moyennes provisoires, sans classement.')}${report.completeness?.ANNUAL?.complete?'':label(lang,' المعدل السنوي مؤقت حتى اكتمال الفصول الثلاثة.',' Moyenne annuelle provisoire jusqu’à la saisie des trois trimestres.')}</p>
    <footer class="signatures"><div class="signature">${label(lang,'توقيع المدير','Signature du directeur')}</div><div class="signature">${label(lang,'ختم المدرسة','Cachet de l’école')}</div></footer></section>`;
}
export function renderReportPages(entries,school,options={}){
  const pages=[];
  for(let i=0;i<entries.length;i+=2){
    const pair=entries.slice(i,i+2),count=Math.max(...pair.map(e=>e.report.subjects.length));
    const singleReport=options.fullPage===true||pair.length===1;
    const density=count>13?' density-ultra':count>10?' density-tight':count>7?' density-compact':'';
    pages.push(`<article class="paper${density}${singleReport?' single-report':''}" data-page="${Math.floor(i/2)+1}">${studentCard(pair[0],school,options)}${pair[1]?`<div class="cut-line"><span>${label(options.lang,'خط القص','Ligne de coupe')}</span></div>${studentCard(pair[1],school,options)}`:''}</article>`);
  }
  return pages.join('');
}
export function renderRoster(data,school,lang='ar',custom=false){
  const className=localizedValue(data.classroom,'name',lang);
  return `<article class="paper roster-paper">${header(school,data.classroom.academic_year,custom,lang,label(lang,'لائحة النتائج','Résultats de la classe'))}<h1>${esc(className)}</h1><p>${esc(data.period)} · ${label(lang,'عدد التلاميذ','Effectif')}: ${data.stats.total}</p><table><thead><tr><th>${label(lang,'التلميذ','Élève')}</th><th>${label(lang,'المعدل /20','Moyenne /20')}</th><th>${label(lang,'الترتيب','Rang')}</th></tr></thead><tbody>${data.results.map(s=>`<tr><td>${esc(studentName(s,lang))}</td><td>${value(s.average)}${s.complete?'':` (${label(lang,'مؤقت','provisoire')})`}</td><td>${s.rank??'—'}</td></tr>`).join('')}</tbody></table></article>`;
}
export function renderAttendanceReport(data,school,lang='ar'){
  const names=[label(lang,'حاضر','Présent'),label(lang,'غائب','Absent'),label(lang,'متأخر','Retard'),label(lang,'معذور','Excusé')];
  const className=localizedValue(data.classroom,'name',lang);
  return `<article class="paper roster-paper">${header(school,null,false,lang,label(lang,'تقرير الحضور','Rapport de présence'))}<h1>${esc(className)}</h1><p><bdi>${esc(data.from)}</bdi> / <bdi>${esc(data.to)}</bdi></p><p>${label(lang,'السجلات المحفوظة فقط؛ الأيام غير المسجلة لا تُحسب غيابًا.','Enregistrements sauvegardés uniquement. Les jours non saisis ne sont pas des absences.')}</p><table><thead><tr><th>${label(lang,'التلميذ','Élève')}</th>${names.map(n=>`<th>${n}</th>`).join('')}</tr></thead><tbody>${data.students.map(s=>`<tr><td>${esc(studentName(s,lang))} · <bdi>${esc(s.student_uid)}</bdi></td>${['PRESENT','ABSENT','LATE','EXCUSED'].map(k=>`<td>${s[k]}</td>`).join('')}</tr>`).join('')}<tr><th>${label(lang,'المجموع','Total')}</th>${['PRESENT','ABSENT','LATE','EXCUSED'].map(k=>`<th>${data.totals[k]}</th>`).join('')}</tr></tbody></table></article>`;
}
async function get(url){const response=await fetch(url,{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw Object.assign(new Error('REPORT_UNAVAILABLE'),{status:response.status});return response.json();}
// Screen-only, responsive A4 preview. The printed sheet keeps exact millimetre dimensions.
function fitPrintPreview(root){
  if(!root||!window.matchMedia('(max-width:860px) and (hover:none)').matches){
    root?.style.removeProperty('--print-preview-scale');return;
  }
  const available=Math.max(200,root.clientWidth-36);
  const a4PrintableWidth=194*96/25.4;
  const scale=Math.max(.28,Math.min(1,available/a4PrintableWidth));
  root.style.setProperty('--print-preview-scale',scale.toFixed(4));
}
async function initialisePrint(){
  const params=new URLSearchParams(location.search),lang=params.get('lang')==='fr'?'fr':'ar',root=document.getElementById('printContent'),status=document.getElementById('printStatus'),button=document.getElementById('printButton');
  document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';document.title=label(lang,'مدرستي · طباعة التقارير','Ma Madrassa · Impression des rapports');
  let reportIdentity=null;
  const clearReport=()=>{root.replaceChildren();button.disabled=true;document.body.classList.remove('print-ready');status.textContent=label(lang,'انتهت الجلسة أو تغير الحساب. عُد للتطبيق.','Session terminée ou compte changé. Revenez à l’application.');};
  if(typeof BroadcastChannel!=='undefined'){const channel=new BroadcastChannel('ma-madrassa-session');channel.onmessage=event=>{if(event.data==='logout')clearReport();};}
  window.addEventListener('pageshow',event=>{if(event.persisted){clearReport();location.reload();}});
  button.textContent=label(lang,'طباعة / حفظ PDF','Imprimer / enregistrer en PDF');document.getElementById('backLink').textContent=label(lang,'العودة للتطبيق','Retour à l’application');
  try{
    const identity=await get('/api/auth/me'),school=identity.school;
    reportIdentity={id:identity.id,schoolId:identity.schoolId};
    if(!school)throw new Error('SCHOOL_REQUIRED');
    const period=params.get('term')||'T1',classId=params.get('classId'),studentId=params.get('studentId'),attendance=params.get('attendance');
    if(attendance){const data=await get(`/api/classes/${encodeURIComponent(attendance)}/attendance/report?${new URLSearchParams({from:params.get('from')||'',to:params.get('to')||''})}`);root.innerHTML=renderAttendanceReport(data,school,lang);}
    else if(classId){
      const query=new URLSearchParams({term:period});if(params.get('subjectId'))query.set('subjectId',params.get('subjectId'));
      const [data,branding]=await Promise.all([get(`/api/classes/${encodeURIComponent(classId)}/results?${query}`),get('/api/branding')]);
      if(!data.results.length)throw new Error('NO_STUDENTS');
      root.innerHTML=params.get('format')==='roster'?renderRoster(data,school,lang,school.school_type==='PRIVATE'&&branding.branding?.mode==='CUSTOM'):renderReportPages(data.results.map(s=>({student:{...s,class_name:data.classroom.name,academic_year:data.classroom.academic_year},report:s.report,rank:s.rank,totalStudents:data.stats.total})),school,{lang,period,scope:data.scope,custom:school.school_type==='PRIVATE'&&branding.branding?.mode==='CUSTOM'});
    }else if(studentId){
      const [data,branding]=await Promise.all([get(`/api/students/${encodeURIComponent(studentId)}/report`),get('/api/branding')]);
      let rank=null,totalStudents=null;
      if(identity.roles?.includes('DIRECTOR')){const results=await get(`/api/classes/${data.student.class_id}/results?${new URLSearchParams({term:period})}`);rank=results.results.find(s=>s.id===studentId)?.rank;totalStudents=results.stats.total;}
      root.innerHTML=renderReportPages([{...data,rank,totalStudents}],school,{lang,period,scope:identity.roles?.includes('DIRECTOR')?'CLASS':'SUBJECT',custom:school.school_type==='PRIVATE'&&branding.branding?.mode==='CUSTOM',fullPage:true});
    }else throw new Error('INVALID_REPORT');
    await document.fonts.ready;
    await Promise.all([...root.querySelectorAll('img')].map(img=>img.decode?.().catch(()=>{})||Promise.resolve()));
    for(const el of root.querySelectorAll('.half-report')){
      if(el.scrollHeight>el.clientHeight+1)el.closest('.paper')?.classList.add('density-tight');
    }
    await new Promise(resolve=>requestAnimationFrame(resolve));
    for(const el of root.querySelectorAll('.half-report')){
      if(el.scrollHeight>el.clientHeight+1)el.closest('.paper')?.classList.add('density-ultra');
    }
    const invalid=[...root.querySelectorAll('.half-report')].some(el=>el.scrollHeight>el.clientHeight+2||el.scrollWidth>el.clientWidth+2);
    if(invalid){document.body.classList.add('invalid-layout');throw new Error('REPORT_TOO_LONG');}
    document.body.classList.add('print-ready');button.disabled=false;
    fitPrintPreview(root);
    window.addEventListener('resize',()=>fitPrintPreview(root),{passive:true});
    status.textContent=studentId
      ?label(lang,'تم تجهيز كشف التلميذ على صفحة A4 كاملة. للطباعة اختر A4 والحجم الأصلي 100% وأوقف ترويسة المتصفح وتذييله.','Bulletin individuel prêt sur une page A4. Choisissez A4, une échelle de 100 % et désactivez les en-têtes et pieds de page.')
      :label(lang,'تم تجهيز التقرير. الكشوف الجماعية: تلميذان في كل ورقة A4. اختر الحجم الأصلي 100% وأوقف ترويسة المتصفح وتذييله.','Rapport prêt. Bulletins collectifs : deux élèves par feuille A4. Choisissez la taille réelle 100 % et désactivez les en-têtes et pieds de page.');
    button.onclick=async()=>{
      button.disabled=true;
      try{const current=await get('/api/auth/me');if(current.id!==reportIdentity.id||current.schoolId!==reportIdentity.schoolId){clearReport();return;}button.disabled=false;window.print();}
      catch{clearReport();}
    };
  }catch(e){root.replaceChildren();button.disabled=true;document.body.classList.remove('print-ready');status.textContent=e.status===401?label(lang,'انتهت الجلسة. عُد للتطبيق وسجّل الدخول.','Session expirée. Revenez à l’application pour vous connecter.'):e.message==='REPORT_TOO_LONG'?label(lang,'تجاوز محتوى الكشف مساحة ورقة A4. اختصر أسماء المواد أو راجع إعدادات الكشف، دون حذف درجات التلاميذ.','Le bulletin dépasse la zone imprimable A4. Vérifiez les matières et la mise en page, sans supprimer les notes.'):e.message==='NO_STUDENTS'?label(lang,'لا يوجد تلاميذ نشطون في هذا القسم.','Aucun élève actif dans cette classe.'):label(lang,'تعذر تحميل التقرير كاملًا. تحقق من الجلسة والصلاحيات واتصال الإنترنت ثم أعد المحاولة.','Chargement incomplet. Vérifiez votre session, vos droits et votre connexion, puis réessayez.');}
}
if(typeof document!=='undefined')initialisePrint();
