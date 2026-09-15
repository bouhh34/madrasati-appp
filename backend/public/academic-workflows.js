/* Extend the existing academic page without changing its routing or session. */
const gradeEditor={scope:null,pending:false,generation:0};
const gradeFields=()=>qsa('#gradeGrid [data-score]');
function decimalScore(value){
  const v=String(value).trim().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/[٫,]/g,'.');
  return /^\d+(?:\.\d{1,2})?$/.test(v)?Number(v):NaN;
}
function gradeChanged(input){return input.value.trim()===''?input.dataset.initial!=='':decimalScore(input.value)!==decimalScore(input.dataset.initial);}
function hasUnsavedGrades(){return gradeFields().some(gradeChanged);}
function restoreGradeScope(){if(!gradeEditor.scope)return;for(const [id,key] of [['classSelect','classId'],['subjectSelect','subjectId'],['termSelect','term']])$(id).value=gradeEditor.scope[key];}
function allowGradeScopeChange(){
  if(gradeEditor.pending){restoreGradeScope();return false;}
  if(hasUnsavedGrades()&&!confirm(st('توجد درجات لم تُحفظ. هل تريد مغادرة إدخالها؟','Des notes ne sont pas enregistrées. Quitter cette saisie ?'))){restoreGradeScope();return false;}
  return true;
}
async function loadBulkScope(){
  if(!allowGradeScopeChange())return;
  const classId=$('classSelect').value,previousSubject=gradeEditor.scope?.classId===classId?$('subjectSelect').value:'';
  const generation=++gradeEditor.generation;gradeEditor.scope=null;currentStudents=[];currentGrades=[];currentSubjects=[];
  $('gradeGrid').textContent=st('جارٍ التحميل…','Chargement…');$('classResultsPanel').replaceChildren();
  $('subjectSelect').innerHTML=`<option value="">${st('اختر مادة','Choisir une matière')}</option>`;
  if(!classId){renderBulkGrades();return;}
  try{
    const [s,g,sub]=await Promise.all([api(`/api/classes/${classId}/students`),api(`/api/classes/${classId}/grades`),api(`/api/classes/${classId}/subjects`)]);
    if(generation!==gradeEditor.generation||!me)return;
    currentStudents=s.students.filter(x=>x.status==='ACTIVE');currentGrades=g.grades;currentSubjects=sub.subjects;
    $('subjectSelect').innerHTML+=currentSubjects.map(x=>`<option value="${x.id}">${escapeHtml(x.name)}</option>`).join('');
    if(currentSubjects.some(x=>x.id===previousSubject))$('subjectSelect').value=previousSubject;
    renderBulkGrades();renderResultsControls();
  }catch{if(generation===gradeEditor.generation)$('gradeGrid').textContent=st('تعذر تحميل القسم. اختره مجددًا للمحاولة.','Chargement impossible. Sélectionnez à nouveau la classe.');}
}
function renderBulkGrades(){
  if(!allowGradeScopeChange())return;
  const scope={classId:$('classSelect').value,subjectId:$('subjectSelect').value,term:$('termSelect').value};
  gradeEditor.scope=scope;
  const subject=currentSubjects.find(x=>x.id===scope.subjectId),root=$('gradeGrid');
  $('gradePermission').textContent=subject?`${subject.name} · /${subject.max_score}`:st('اختر القسم والمادة','Choisissez la classe et la matière');
  if(!scope.classId||!subject){root.textContent=st('اختر قسمًا ومادة لبدء العمل.','Choisissez une classe et une matière.');renderResultsControls();return;}
  root.classList.remove('empty');
  root.innerHTML=`<div class="grade-toolbar"><label>${st('البحث عن تلميذ','Rechercher un élève')}<input id="gradeSearch" type="search" autocomplete="off"></label><p id="gradeFeedback" role="status" aria-live="polite"></p><button id="saveAllGrades" type="button" class="primary">${st('حفظ الدرجات المعدلة','Enregistrer les modifications')}</button></div>
    ${currentStudents.length?currentStudents.map(student=>{
      const grade=currentGrades.find(x=>x.student_id===student.id&&x.subject_id===scope.subjectId&&x.term===scope.term&&x.assessment==='MAIN');
      return `<div class="grade-row" data-grade-row><div class="student-name"><b>${escapeHtml(student.full_name)}</b><small>${escapeHtml(student.student_uid)}</small><button type="button" class="linkbtn" data-student-report="${student.id}">${st('كشف التلميذ','Bulletin')}</button></div>
        <label class="score-wrap"><span class="visually-hidden">${st('درجة','Note de')} ${escapeHtml(student.full_name)}</span><input inputmode="decimal" data-score="${student.id}" data-initial="${grade?escapeHtml(grade.score):''}" data-version="${grade?.version||0}" value="${grade?escapeHtml(grade.score):''}" aria-label="${st('درجة','Note de')} ${escapeHtml(student.full_name)}"><span>/${subject.max_score}</span></label>
        <button type="button" class="save-grade" data-save-grade="${student.id}">${grade?st('محفوظ','Enregistré'):st('حفظ','Enregistrer')}</button></div>`;
    }).join(''):`<p class="empty">${st('لا يوجد تلاميذ نشطون في هذا القسم. أضف تلاميذ من إدارة المدرسة.','Aucun élève actif. Ajoutez des élèves dans la gestion de l’école.')}</p>`}`;
  $('gradeSearch').oninput=()=>{const q=$('gradeSearch').value.trim().toLocaleLowerCase();qsa('[data-grade-row]').forEach(row=>row.hidden=!row.querySelector('.student-name').textContent.toLocaleLowerCase().includes(q));};
  gradeFields().forEach(input=>{
    input.oninput=()=>{const score=decimalScore(input.value);input.setAttribute('aria-invalid',String(input.value.trim()!==''&&(!Number.isFinite(score)||score>Number(subject.max_score))));updateGradeFeedback();};
    input.onkeydown=event=>{if(!['Enter','ArrowDown','ArrowUp'].includes(event.key))return;event.preventDefault();const fields=gradeFields().filter(f=>!f.closest('[data-grade-row]').hidden),index=fields.indexOf(input)+(event.key==='ArrowUp'?-1:1);if(fields[index]){fields[index].focus();fields[index].select();}};
  });
  qsa('[data-save-grade]').forEach(button=>button.onclick=()=>saveBulkGrades([button.dataset.saveGrade]));
  qsa('[data-student-report]').forEach(button=>button.onclick=()=>openReport(button.dataset.studentReport));
  $('saveAllGrades').onclick=()=>saveBulkGrades();updateGradeFeedback();renderResultsControls();
}
function updateGradeFeedback(message){
  const changed=gradeFields().filter(gradeChanged).length,missing=gradeFields().filter(f=>f.value.trim()==='').length;
  if($('gradeFeedback'))$('gradeFeedback').textContent=message||st(`${changed} درجات معدلة · ${missing} درجات ناقصة`,`${changed} notes modifiées · ${missing} notes manquantes`);
  if($('saveAllGrades'))$('saveAllGrades').disabled=gradeEditor.pending||!changed;
}
async function saveBulkGrades(studentIds){
  if(gradeEditor.pending||!gradeEditor.scope)return;
  const fields=gradeFields().filter(f=>gradeChanged(f)&&(!studentIds||studentIds.includes(f.dataset.score)));
  if(!fields.length){updateGradeFeedback();return;}
  const scope={...gradeEditor.scope},subject=currentSubjects.find(x=>x.id===scope.subjectId);
  const invalid=fields.find(f=>!Number.isFinite(decimalScore(f.value))||decimalScore(f.value)>Number(subject.max_score));
  if(invalid){invalid.setAttribute('aria-invalid','true');invalid.focus();updateGradeFeedback(st('تحقق من الدرجة. لا تُحوّل الخانة الفارغة إلى صفر؛ الدرجة المحفوظة لا تُحذف بتفريغها.','Vérifiez la note. Une case vide ne vaut pas zéro et n’efface pas une note enregistrée.'));return;}
  if(fields.length>500){updateGradeFeedback(st('حد الحفظ 500 درجة في المرة. استخدم حفظ التلميذ للأقسام الأكبر.','Limite : 500 notes par envoi. Utilisez la saisie individuelle au-delà.'));return;}
  const payload={subjectId:scope.subjectId,term:scope.term,assessment:'MAIN',grades:fields.map(f=>({studentId:f.dataset.score,score:decimalScore(f.value),version:Number(f.dataset.version)}))};
  gradeEditor.pending=true;
  const controls=[...gradeFields(),...qsa('#gradeGrid button'),$('classSelect'),$('subjectSelect'),$('termSelect')];controls.forEach(c=>c.disabled=true);
  updateGradeFeedback(st('جارٍ حفظ الدرجات…','Enregistrement des notes…'));
  try{
    const data=await api(`/api/classes/${scope.classId}/grades/bulk`,{method:'PUT',body:JSON.stringify(payload)});
    if(!me)return;
    for(const g of data.grades){
      const field=gradeFields().find(f=>f.dataset.score===g.student_id);if(!field)continue;
      field.value=g.score;field.dataset.initial=g.score;field.dataset.version=g.version;field.setAttribute('aria-invalid','false');
      const index=currentGrades.findIndex(x=>x.id===g.id),record={...g,subject_id:scope.subjectId,term:scope.term,assessment:'MAIN'};
      if(index<0)currentGrades.push(record);else currentGrades[index]=record;
      const button=qsa('[data-save-grade]').find(b=>b.dataset.saveGrade===g.student_id);button.textContent=st('محفوظ','Enregistré');
    }
    updateGradeFeedback(st(`تم حفظ ${data.grades.length} درجة.`,`${data.grades.length} notes enregistrées.`));toast(st('تم حفظ الدرجات','Notes enregistrées'));
    $('classResultsContent')?.replaceChildren();
  }catch(e){
    updateGradeFeedback(e.data?.error==='VERSION_CONFLICT'?st('عدّل مستخدم آخر إحدى الدرجات. لم تُحفظ هذه الدفعة؛ انسخ تعديلاتك ثم أعد اختيار القسم للمقارنة.','Une note a été modifiée ailleurs. Aucun changement enregistré. Copiez vos valeurs puis rechargez la classe.'):st('تعذر الحفظ. بقيت درجاتك في النموذج لإعادة المحاولة.','Échec. Vos valeurs restent dans le formulaire pour réessayer.'));
  }finally{gradeEditor.pending=false;controls.forEach(c=>c.disabled=false);if($('saveAllGrades'))$('saveAllGrades').disabled=!hasUnsavedGrades();}
}
function renderResultsControls(){
  const root=$('classResultsPanel'),classId=$('classSelect').value;if(!classId){root.replaceChildren();return;}
  const period=$('resultTerm')?.value||$('termSelect').value;
  root.innerHTML=`<div class="panel-head"><h3>${st('نتائج القسم والترتيب','Résultats et classement')}</h3></div>
    <div class="results-controls"><label>${st('الفترة','Période')}<select id="resultTerm"><option value="T1">${st('الفصل الأول','Trimestre 1')}</option><option value="T2">${st('الفصل الثاني','Trimestre 2')}</option><option value="T3">${st('الفصل الثالث','Trimestre 3')}</option><option value="ANNUAL">${st('السنوي','Annuel')}</option></select></label><button id="loadClassResults" class="ghost" type="button">${st('عرض النتائج','Afficher les résultats')}</button></div>
    <p class="hint">${st('الترتيب للنتائج المكتملة فقط. التساوي يأخذ الرتبة نفسها، وتُعرض المعدلات الناقصة بوصفها مؤقتة.','Seuls les résultats complets sont classés. Les ex æquo partagent le même rang. Les moyennes incomplètes sont provisoires.')}</p><div id="classResultsContent" aria-live="polite"></div>`;
  $('resultTerm').value=period;$('loadClassResults').onclick=loadClassResults;
}
let resultsGeneration=0;
async function loadClassResults(){
  const generation=++resultsGeneration,classId=$('classSelect').value,period=$('resultTerm').value;
  const director=me?.roles?.includes('DIRECTOR'),subjectId=$('subjectSelect').value,root=$('classResultsContent');
  if(!director&&!subjectId){root.textContent=st('اختر مادتك لعرض نتائجها.','Choisissez votre matière.');return;}
  root.textContent=st('جارٍ حساب النتائج…','Calcul des résultats…');const button=$('loadClassResults');button.disabled=true;
  try{
    const query=new URLSearchParams({term:period});if(!director)query.set('subjectId',subjectId);
    const data=await api(`/api/classes/${classId}/results?${query}`);
    if(generation!==resultsGeneration||!root.isConnected||!me)return;
    const v=x=>x===null?'—':Number(x).toFixed(2),stats=data.stats;
    root.innerHTML=`<p><b>${escapeHtml(data.classroom.name)}</b> · ${escapeHtml(data.classroom.academic_year||'—')} · ${data.scope==='SUBJECT'?st('نتائج المادة','Résultats de la matière'):st('جميع المواد','Toutes les matières')}</p>
      <div class="results-stats"><span>${st('التلاميذ','Élèves')} <b>${stats.total}</b></span><span>${st('المصنفون','Classés')} <b>${stats.ranked}</b></span><span>${st('الأعلى','Maximum')} <b>${v(stats.highest)}</b></span><span>${st('الأدنى','Minimum')} <b>${v(stats.lowest)}</b></span><span>${st('معدل المكتملين','Moyenne des résultats complets')} <b>${v(stats.average)}</b></span></div>
      <label>${st('البحث في النتائج','Rechercher un résultat')}<input id="resultsSearch" type="search"></label><div class="results-list">${data.results.map(s=>`<article class="result-row"><div><b>${escapeHtml(s.full_name)}</b><small>${escapeHtml(s.student_uid)} · ${s.complete?st('مكتمل','Complet'):st('درجات ناقصة — معدل مؤقت','Notes manquantes — moyenne provisoire')}</small></div><div><strong>${v(s.average)} /20</strong><small>${st('الترتيب','Rang')} ${s.rank??'—'} / ${stats.total}</small></div><button class="ghost" data-result-report="${s.id}" type="button">${st('الكشف','Bulletin')}</button></article>`).join('')||`<p class="empty">${st('لا يوجد تلاميذ نشطون في القسم.','Aucun élève actif dans cette classe.')}</p>`}</div>`;
    $('resultsSearch').oninput=()=>{const q=$('resultsSearch').value.trim().toLocaleLowerCase();qsa('.result-row').forEach(r=>r.hidden=!r.textContent.toLocaleLowerCase().includes(q));};
    qsa('[data-result-report]').forEach(b=>b.onclick=()=>openReport(b.dataset.resultReport));
    if(typeof installClassPrint==='function')installClassPrint(data,root);
  }catch{if(root.isConnected)root.textContent=st('تعذر تحميل النتائج. تحقق من الصلاحيات وأعد المحاولة.','Résultats indisponibles. Vérifiez vos droits et réessayez.');}
  finally{button.disabled=false;}
}
window.addEventListener('beforeunload',event=>{if(me&&hasUnsavedGrades()){event.preventDefault();event.returnValue='';}});
