const attendanceEditor={scope:null,rows:[],pending:false,generation:0,canWrite:false};
const attendanceNames=()=>({PRESENT:st('حاضر','Présent'),ABSENT:st('غائب','Absent'),LATE:st('متأخر','En retard'),EXCUSED:st('معذور','Excusé')});
const attendanceElements=()=>qsa('#attendanceGrid [data-attendance-row]');
function attendanceChanged(row){return row.querySelector('select').value!==row.dataset.initialStatus||row.querySelector('input[data-note]').value.trim()!==row.dataset.initialNote;}
function hasUnsavedAttendance(){return attendanceElements().some(attendanceChanged);}
function allowAttendanceScopeChange(){
  if(attendanceEditor.pending||(hasUnsavedAttendance()&&!confirm(st('توجد تعديلات حضور غير محفوظة. هل تريد مغادرتها؟','Des présences ne sont pas enregistrées. Quitter cette saisie ?')))){
    if(attendanceEditor.scope){$('attendanceClass').value=attendanceEditor.scope.classId;$('attendanceDate').value=attendanceEditor.scope.date;}
    return false;
  }
  return true;
}
async function loadAttendanceWorkflow(){
  if(!allowAttendanceScopeChange())return;
  const classId=$('attendanceClass').value,date=$('attendanceDate').value,generation=++attendanceEditor.generation;
  attendanceEditor.scope={classId,date};const root=$('attendanceGrid');
  root.textContent=st('جارٍ التحميل…','Chargement…');$('attendanceSummary').textContent='';
  if(!classId||!date){root.textContent=st('اختر قسمًا وتاريخًا.','Choisissez une classe et une date.');return;}
  try{
    const data=await api(`/api/classes/${classId}/attendance/roster?date=${date}`);
    if(generation!==attendanceEditor.generation||!me)return;
    attendanceEditor.rows=data.students;attendanceEditor.canWrite=data.canWrite;renderAttendanceWorkflow();
  }catch(e){if(generation===attendanceEditor.generation)root.textContent=e.status===403?st('لا تملك صلاحية الحضور لهذا القسم.','Vous n’avez pas accès aux présences de cette classe.'):st('تعذر تحميل الحضور. أعد المحاولة.','Chargement impossible. Réessayez.');}
}
function renderAttendanceWorkflow(){
  const labels=attendanceNames(),rows=attendanceEditor.rows,canWrite=attendanceEditor.canWrite;
  $('attendanceGrid').classList.remove('empty');
  $('attendanceGrid').innerHTML=`<div class="attendance-toolbar"><label>${st('البحث عن تلميذ','Rechercher un élève')}<input id="attendanceSearch" type="search"></label>
    ${canWrite?`<button type="button" id="markUnrecordedPresent" class="ghost">${st('تحديد الحضور لغير المسجلين','Marquer présents les non saisis')}</button><button type="button" id="saveAttendanceBatch" class="primary">${st('حفظ التعديلات','Enregistrer les modifications')}</button>`:''}</div>
    <p id="attendanceFeedback" role="status" aria-live="polite"></p>
    ${rows.map(s=>`<article class="attendance-entry" data-attendance-row="${s.student_id}" data-initial-status="${s.status||''}" data-initial-note="${escapeHtml(s.note||'')}" data-version="${s.version}">
      <div><b>${escapeHtml(s.full_name)}</b><small>${escapeHtml(s.student_uid)}</small></div>
      <label>${st('الحالة','Statut')}<select aria-label="${st('حضور','Présence de')} ${escapeHtml(s.full_name)}" ${canWrite?'':'disabled'}><option value="">${st('لم يُسجل','Non saisi')}</option>${Object.entries(labels).map(([value,label])=>`<option value="${value}" ${s.status===value?'selected':''}>${label}</option>`).join('')}</select></label>
      <label>${st('ملاحظة اختيارية','Note facultative')}<input data-note maxlength="500" value="${escapeHtml(s.note||'')}" ${canWrite?'':'disabled'}></label></article>`).join('')||`<p class="empty">${st('لا يوجد تلاميذ نشطون في القسم.','Aucun élève actif dans cette classe.')}</p>`}
    <section id="attendanceRangePanel" class="attendance-range"><h3>${st('تقرير الحضور','Rapport de présence')}</h3><p class="hint">${st('تُحسب الإحصائيات من السجلات المحفوظة فقط؛ الأيام غير المسجلة ليست غيابًا.','Les statistiques portent sur les enregistrements sauvegardés. Un jour non saisi n’est pas une absence.')}</p>
      <div class="attendance-toolbar"><button type="button" class="ghost" data-attendance-period="day">${st('هذا اليوم','Ce jour')}</button><button type="button" class="ghost" data-attendance-period="week">${st('آخر 7 أيام','7 derniers jours')}</button><button type="button" class="ghost" data-attendance-period="month">${st('هذا الشهر','Ce mois')}</button></div>
      <form id="attendanceRangeForm" class="results-controls"><label>${st('من','Du')}<input name="from" type="date" required value="${attendanceEditor.scope.date.slice(0,8)}01"></label><label>${st('إلى','Au')}<input name="to" type="date" required value="${attendanceEditor.scope.date}"></label><button class="ghost">${st('عرض التقرير','Afficher le rapport')}</button></form><div id="attendanceRangeResults" aria-live="polite"></div></section>`;
  $('attendanceSearch').oninput=()=>{const q=$('attendanceSearch').value.trim().toLocaleLowerCase();attendanceElements().forEach(r=>r.hidden=!r.querySelector('div').textContent.toLocaleLowerCase().includes(q));};
  attendanceElements().forEach(row=>{row.querySelector('select').onchange=updateAttendanceFeedback;row.querySelector('input').oninput=updateAttendanceFeedback;});
  if(canWrite){
    $('markUnrecordedPresent').onclick=()=>{attendanceElements().forEach(row=>{if(!row.querySelector('select').value)row.querySelector('select').value='PRESENT';});updateAttendanceFeedback();};
    $('saveAttendanceBatch').onclick=saveAttendanceBatch;
  }
  $('attendanceRangeForm').onsubmit=e=>{e.preventDefault();loadAttendanceRange();};
  qsa('[data-attendance-period]').forEach(b=>b.onclick=()=>{
    const to=attendanceEditor.scope.date,from=new Date(`${to}T00:00:00Z`);
    if(b.dataset.attendancePeriod==='week')from.setUTCDate(from.getUTCDate()-6);if(b.dataset.attendancePeriod==='month')from.setUTCDate(1);
    $('attendanceRangeForm').elements.from.value=from.toISOString().slice(0,10);$('attendanceRangeForm').elements.to.value=to;loadAttendanceRange();
  });
  updateAttendanceFeedback();
}
function updateAttendanceFeedback(){
  const rows=attendanceElements(),changed=rows.filter(attendanceChanged).length,unrecorded=rows.filter(r=>!r.querySelector('select').value).length;
  $('attendanceSummary').textContent=st(`${rows.length} تلميذ · ${unrecorded} لم يُسجّل`,`${rows.length} élèves · ${unrecorded} non saisis`);
  $('attendanceFeedback').textContent=st(`${changed} تعديلات غير محفوظة`,`${changed} modifications non enregistrées`);
  if($('saveAttendanceBatch'))$('saveAttendanceBatch').disabled=attendanceEditor.pending||!changed;
}
async function saveAttendanceBatch(){
  if(attendanceEditor.pending||!attendanceEditor.canWrite)return;
  const rows=attendanceElements().filter(attendanceChanged),invalid=rows.find(r=>!r.querySelector('select').value);
  if(invalid){invalid.querySelector('select').focus();$('attendanceFeedback').textContent=st('اختر حالة لكل تلميذ عدّلته.','Choisissez un statut pour chaque élève modifié.');return;}
  if(!rows.length)return;
  if(rows.length>500){$('attendanceFeedback').textContent=st('الحد الأقصى 500 تلميذ للحفظ الجماعي.','Maximum : 500 élèves par envoi.');return;}
  const scope={...attendanceEditor.scope},payload={date:scope.date,attendance:rows.map(r=>({studentId:r.dataset.attendanceRow,status:r.querySelector('select').value,note:r.querySelector('input').value.trim()||null,version:Number(r.dataset.version)}))};
  attendanceEditor.pending=true;const controls=[...qsa('#attendanceGrid button,#attendanceGrid input,#attendanceGrid select'),$('attendanceClass'),$('attendanceDate'),$('attendanceReload')];controls.forEach(c=>c.disabled=true);
  $('attendanceFeedback').textContent=st('جارٍ الحفظ…','Enregistrement…');
  try{
    const data=await api(`/api/classes/${scope.classId}/attendance/bulk`,{method:'PUT',body:JSON.stringify(payload)});
    if(!me)return;
    for(const item of data.attendance){const row=attendanceElements().find(r=>r.dataset.attendanceRow===item.student_id);if(!row)continue;
      row.dataset.initialStatus=item.status;row.dataset.initialNote=item.note||'';row.dataset.version=item.version;
    }
    updateAttendanceFeedback();$('attendanceFeedback').textContent=st(`تم حفظ حضور ${data.attendance.length} تلميذ.`,`${data.attendance.length} présences enregistrées.`);$('attendanceRangeResults').replaceChildren();
  }catch(e){$('attendanceFeedback').textContent=e.data?.error==='VERSION_CONFLICT'?st('تعارض مع تعديل أحدث. لم تُحفظ الدفعة. راجع القيم ثم أعد تحميل اليوم.','Conflit avec une modification récente. Aucun changement enregistré. Rechargez la journée après vérification.'):st('تعذر الحفظ؛ بقيت التعديلات للمحاولة مجددًا.','Échec. Vos modifications sont conservées pour réessayer.');}
  finally{attendanceEditor.pending=false;controls.forEach(c=>c.disabled=false);if($('saveAttendanceBatch'))$('saveAttendanceBatch').disabled=!hasUnsavedAttendance();}
}
let attendanceReportGeneration=0;
async function loadAttendanceRange(){
  const generation=++attendanceReportGeneration,form=$('attendanceRangeForm'),root=$('attendanceRangeResults'),classId=attendanceEditor.scope.classId;
  const from=form.elements.from.value,to=form.elements.to.value;
  if(from>to){root.textContent=st('تاريخ البداية يجب أن يسبق النهاية.','La date de début doit précéder la fin.');return;}
  root.textContent=st('جارٍ تحميل التقرير…','Chargement du rapport…');
  try{
    const data=await api(`/api/classes/${classId}/attendance/report?${new URLSearchParams({from,to})}`);
    if(generation!==attendanceReportGeneration||!root.isConnected||!me)return;
    const labels=attendanceNames();
    root.innerHTML=`<p>${st('أيام ذات سجلات','Jours avec des enregistrements')}: ${data.recordedDays}</p><div class="results-stats">${Object.entries(labels).map(([status,label])=>`<span>${label}<b>${data.totals[status]}</b></span>`).join('')}</div>
      ${data.students.map(s=>`<article class="result-row"><div><b>${escapeHtml(s.full_name)}</b><small>${escapeHtml(s.student_uid)}</small></div><p>${Object.entries(labels).map(([status,label])=>`${label}: ${s[status]}`).join(' · ')}</p></article>`).join('')||`<p class="empty">${st('لا توجد سجلات في هذه الفترة.','Aucun enregistrement dans cette période.')}</p>`}
      <a class="ghost report-print-link" target="_blank" rel="noopener" href="/print.html?${new URLSearchParams({attendance:classId,from,to,lang:locale})}">${st('طباعة / حفظ PDF','Imprimer / enregistrer en PDF')}</a>`;
  }catch{if(root.isConnected)root.textContent=st('تعذر تحميل التقرير. اختر فترة لا تتجاوز سنة وأعد المحاولة.','Chargement impossible. Choisissez une période d’un an maximum et réessayez.');}
}
window.addEventListener('beforeunload',event=>{if(me&&hasUnsavedAttendance()){event.preventDefault();event.returnValue='';}});
