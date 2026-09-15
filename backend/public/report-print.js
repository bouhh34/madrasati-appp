const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const value=n=>n===null||n===undefined?'—':Number(n).toFixed(2);
const label=(lang,ar,fr)=>lang==='fr'?fr:ar;
function header(school,year,custom,lang){
  return `<table class="official-header"><tbody><tr><td class="authority"><p><b>${label(lang,'الجمهورية الإسلامية الموريتانية','République Islamique de Mauritanie')}</b></p><p>${label(lang,'وزارة التهذيب الوطني وإصلاح النظام التعليمي','Ministère de l’Éducation nationale et de la Réforme du système éducatif')}</p>${school.wilaya?`<p>${label(lang,'الإدارة الجهوية','Direction régionale')} : ${esc(school.wilaya)}</p>`:''}${school.moughataa?`<p>${label(lang,'المقاطعة','Moughataa')} : ${esc(school.moughataa)}</p>`:''}${school.inspection?`<p>${label(lang,'المفتشية','Inspection')} : ${esc(school.inspection)}</p>`:''}</td><td class="emblems"><div class="bismillah">بسم الله الرحمن الرحيم</div><img src="/assets/official-logo.png" alt="${label(lang,'شعار الدولة','Emblème national')}">${custom?`<img class="school-emblem" src="/api/branding/header" alt="${label(lang,'شعار المدرسة','Logo de l’école')}">`:''}</td><td class="school-meta"><p><b>${label(lang,'شرف - إخاء - عدالة','Honneur - Fraternité - Justice')}</b></p><p>${label(lang,'المدرسة','École')} : ${esc(school.name||'—')}</p><p>${label(lang,'السنة الدراسية','Année scolaire')} : <bdi>${esc(year||'—')}</bdi></p></td></tr></tbody></table>`;
}
function studentCard(entry,school,{lang='ar',custom=false,period='T1',scope='CLASS'}={}){
  const {student,report,rank,totalStudents}=entry;
  const periodName=period==='ANNUAL'?label(lang,'السنوي','Annuel'):label(lang,`الفصل ${period.slice(1)}`,`Trimestre ${period.slice(1)}`);
  const complete=report.completeness?.[period]?.complete===true;
  return `<section class="half-report" data-student-id="${esc(student.id)}">${header(school,student.academic_year,custom,lang)}
    <h1>${scope==='SUBJECT'?label(lang,'كشف نتائج المادة','Relevé de matière'):label(lang,'كشف نتائج التلميذ','Bulletin de notes')} · ${periodName}</h1>
    <div class="student-meta"><b>${label(lang,'الاسم','Nom')} : ${esc(student.full_name)}</b><span>${label(lang,'القسم','Classe')} : ${esc(student.class_name||'—')}</span><span>${label(lang,'الرقم','Matricule')} : <bdi>${esc(student.student_uid)}</bdi></span></div>
    <table class="report-table"><thead><tr><th>${label(lang,'المادة','Matière')}</th><th>${label(lang,'المعامل','Coef.')}</th><th>T1</th><th>T2</th><th>T3</th><th>${label(lang,'السنوي','Annuel')}</th></tr></thead><tbody>
    ${report.subjects.map(s=>`<tr><td>${esc(s.name)}</td><td>${esc(s.coefficient)}</td><td>${value(s.terms.T1)}</td><td>${value(s.terms.T2)}</td><td>${value(s.terms.T3)}</td><td>${value(s.annual)}</td></tr>`).join('')||`<tr><td colspan="6">${label(lang,'لا توجد مواد مرتبطة أو نتائج مسجلة','Aucune matière ou note enregistrée')}</td></tr>`}</tbody></table>
    <div class="report-totals"><span>T1: ${value(report.termAverages.T1)} /20</span><span>T2: ${value(report.termAverages.T2)} /20</span><span>T3: ${value(report.termAverages.T3)} /20</span><span>${label(lang,'السنوي','Annuel')}: <bdi>${value(report.annualAverage)} /20</bdi></span><span>${label(lang,'الترتيب','Rang')}: <bdi>${rank??'—'} / ${totalStudents??'—'}</bdi></span></div>
    <p class="completion-note">${complete?label(lang,'نتائج الفترة مكتملة.','Résultats complets pour la période.'):label(lang,'نتائج الفترة غير مكتملة؛ المعدلات المعروضة مؤقتة ولا يُعتمد ترتيب لها.','Résultats incomplets : moyennes provisoires, sans classement.')}${report.completeness?.ANNUAL?.complete?'':label(lang,' المعدل السنوي مؤقت حتى اكتمال الفصول الثلاثة.',' Moyenne annuelle provisoire jusqu’à la saisie des trois trimestres.')}</p>
    <footer class="signatures"><div class="signature">${label(lang,'توقيع المدير','Signature du directeur')}</div><div class="signature">${label(lang,'ختم المدرسة','Cachet de l’école')}</div></footer></section>`;
}
export function renderReportPages(entries,school,options={}){
  const pages=[];
  for(let i=0;i<entries.length;i+=2){const pair=entries.slice(i,i+2),count=Math.max(...pair.map(e=>e.report.subjects.length));
    const density=count>14?' density-tight':count>9?' density-compact':'';
    pages.push(`<article class="paper${density}">${studentCard(pair[0],school,options)}${pair[1]?`<div class="cut-line"><span>${label(options.lang,'خط القص','Ligne de coupe')}</span></div>${studentCard(pair[1],school,options)}`:''}</article>`);
  }
  return pages.join('');
}
export function renderRoster(data,school,lang='ar'){
  return `<article class="paper roster-paper">${header(school,data.classroom.academic_year,false,lang)}<h1>${label(lang,'لائحة نتائج القسم','Résultats de la classe')} · ${esc(data.classroom.name)}</h1><p>${esc(data.period)} · ${label(lang,'عدد التلاميذ','Effectif')}: ${data.stats.total}</p><table><thead><tr><th>${label(lang,'الرقم','Matricule')}</th><th>${label(lang,'التلميذ','Élève')}</th><th>${label(lang,'المعدل /20','Moyenne /20')}</th><th>${label(lang,'الترتيب','Rang')}</th></tr></thead><tbody>${data.results.map(s=>`<tr><td>${esc(s.student_uid)}</td><td>${esc(s.full_name)}</td><td>${value(s.average)}${s.complete?'':` (${label(lang,'مؤقت','provisoire')})`}</td><td>${s.rank??'—'}</td></tr>`).join('')}</tbody></table></article>`;
}
export function renderAttendanceReport(data,school,lang='ar'){
  const names=[label(lang,'حاضر','Présent'),label(lang,'غائب','Absent'),label(lang,'متأخر','Retard'),label(lang,'معذور','Excusé')];
  return `<article class="paper roster-paper">${header(school,null,false,lang)}<h1>${label(lang,'تقرير حضور القسم','Rapport de présence')} · ${esc(data.classroom.name)}</h1><p><bdi>${esc(data.from)}</bdi> / <bdi>${esc(data.to)}</bdi></p><p>${label(lang,'السجلات المحفوظة فقط؛ الأيام غير المسجلة لا تُحسب غيابًا.','Enregistrements sauvegardés uniquement. Les jours non saisis ne sont pas des absences.')}</p><table><thead><tr><th>${label(lang,'التلميذ','Élève')}</th>${names.map(n=>`<th>${n}</th>`).join('')}</tr></thead><tbody>${data.students.map(s=>`<tr><td>${esc(s.full_name)} · ${esc(s.student_uid)}</td>${['PRESENT','ABSENT','LATE','EXCUSED'].map(k=>`<td>${s[k]}</td>`).join('')}</tr>`).join('')}<tr><th>${label(lang,'المجموع','Total')}</th>${['PRESENT','ABSENT','LATE','EXCUSED'].map(k=>`<th>${data.totals[k]}</th>`).join('')}</tr></tbody></table></article>`;
}
async function get(url){const response=await fetch(url,{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw Object.assign(new Error('REPORT_UNAVAILABLE'),{status:response.status});return response.json();}
async function initialisePrint(){
  const params=new URLSearchParams(location.search),lang=params.get('lang')==='fr'?'fr':'ar',root=document.getElementById('printContent'),status=document.getElementById('printStatus'),button=document.getElementById('printButton');
  document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';
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
      root.innerHTML=params.get('format')==='roster'?renderRoster(data,school,lang):renderReportPages(data.results.map(s=>({student:{...s,class_name:data.classroom.name,academic_year:data.classroom.academic_year},report:s.report,rank:s.rank,totalStudents:data.stats.total})),school,{lang,period,scope:data.scope,custom:school.school_type==='PRIVATE'&&branding.branding?.mode==='CUSTOM'});
    }else if(studentId){
      const [data,branding]=await Promise.all([get(`/api/students/${encodeURIComponent(studentId)}/report`),get('/api/branding')]);
      let rank=null,totalStudents=null;
      if(identity.roles?.includes('DIRECTOR')){const results=await get(`/api/classes/${data.student.class_id}/results?${new URLSearchParams({term:period})}`);rank=results.results.find(s=>s.id===studentId)?.rank;totalStudents=results.stats.total;}
      root.innerHTML=renderReportPages([{...data,rank,totalStudents}],school,{lang,period,scope:identity.roles?.includes('DIRECTOR')?'CLASS':'SUBJECT',custom:school.school_type==='PRIVATE'&&branding.branding?.mode==='CUSTOM'});
    }else throw new Error('INVALID_REPORT');
    await document.fonts.ready;
    await Promise.all([...root.querySelectorAll('img')].map(img=>img.decode()));
    const overflowing=[...root.querySelectorAll('.half-report')].filter(el=>el.scrollHeight>el.clientHeight+1);
    for(const el of overflowing)el.closest('.paper').classList.add('density-tight');
    const invalid=[...root.querySelectorAll('.half-report')].some(el=>el.scrollHeight>el.clientHeight+1||el.scrollWidth>el.clientWidth+1);
    if(invalid){document.body.classList.add('invalid-layout');throw new Error('REPORT_TOO_LONG');}
    document.body.classList.add('print-ready');button.disabled=false;
    status.textContent=label(lang,'اختر A4 بالحجم الأصلي 100%، وأوقف ترويسة المتصفح وتذييله. اختر «حفظ PDF» في نافذة الطباعة.','Choisissez A4, taille réelle 100 %, sans en-têtes ni pieds de page du navigateur. Sélectionnez « Enregistrer en PDF » dans la fenêtre d’impression.');
    button.onclick=async()=>{
      button.disabled=true;
      try{const current=await get('/api/auth/me');if(current.id!==reportIdentity.id||current.schoolId!==reportIdentity.schoolId){clearReport();return;}button.disabled=false;window.print();}
      catch{clearReport();}
    };
  }catch(e){root.replaceChildren();button.disabled=true;document.body.classList.remove('print-ready');status.textContent=e.status===401?label(lang,'انتهت الجلسة. عُد للتطبيق وسجّل الدخول.','Session expirée. Revenez à l’application pour vous connecter.'):e.message==='REPORT_TOO_LONG'?label(lang,'التقرير أطول من نصف صفحة A4. لم تتم طباعته لتجنب قص البيانات.','Le bulletin dépasse une demi-page A4. Impression bloquée pour éviter de couper les données.'):label(lang,'تعذر تحميل التقرير كاملًا. تحقق من الجلسة والصلاحيات واتصال الإنترنت ثم أعد المحاولة.','Chargement incomplet. Vérifiez votre session, vos droits et votre connexion, puis réessayez.');}
}
if(typeof document!=='undefined')initialisePrint();
