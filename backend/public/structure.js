/* Academic administration uses the existing session, API and modal components. */
const schoolStructure={years:[],classes:[],subjects:[],users:[]};
function st(ar,fr){return locale==='fr'?fr:ar;}
function structureError(e){
  const messages={SUBJECT_HAS_LINKED_DATA:st('لا يمكن إزالة مادة لها درجات أو صلاحيات معلم.','Cette matière contient des notes ou des autorisations.'),SUBJECT_HAS_GRADES:st('لا يمكن تغيير سلم مادة لها درجات محفوظة.','Le barème est protégé car des notes existent.'),YEAR_EXISTS:st('السنة موجودة مسبقًا.','Cette année existe déjà.'),SUBJECT_NOT_IN_CLASS:st('اربط المادة بالقسم أولًا.','Associez d’abord la matière à la classe.')};
  return messages[e.data?.error]||st('تعذّر الحفظ. تحقق من البيانات والصلاحيات.','Échec de l’enregistrement. Vérifiez les données et les droits.');
}
async function loadStructure(){
  if(!me?.roles?.includes('DIRECTOR')||!$('structurePanel'))return;
  const root=$('structurePanel');root.textContent=st('جارٍ التحميل…','Chargement…');
  try{
    const [y,c,s,u]=await Promise.all([api('/api/academic-years'),api('/api/director/classes'),api('/api/director/subjects'),api('/api/director/users')]);
    Object.assign(schoolStructure,{years:y.years,classes:c.classes,subjects:s.subjects,users:u.users});
    renderStructure();
  }catch{root.textContent=st('تعذّر تحميل إدارة الأقسام. أعد فتح الصفحة للمحاولة.','Chargement impossible. Rouvrez cette page pour réessayer.');}
}
function structureOptions(xs,label){return xs.map(x=>`<option value="${x.id}">${escapeHtml(label(x))}</option>`).join('');}
function renderStructure(){
  const {years,classes,subjects,users}=schoolStructure;
  const yearOptions=structureOptions(years,y=>y.name+(y.is_current?st(' — الحالية',' — en cours'):''));
  if($('newClassYear'))$('newClassYear').innerHTML=yearOptions;
  $('structurePanel').innerHTML=`
    <div class="panel-head"><h3>${st('السنوات والأقسام والتكليفات','Années, classes et affectations')}</h3><button id="refreshStructure" type="button">${st('تحديث','Actualiser')}</button></div>
    <div class="structure-grid">
      <form id="yearForm"><h4>${st('السنة الدراسية','Année scolaire')}</h4><label>${st('السنة الجديدة','Nouvelle année')}<input name="yearName" required minlength="4" maxlength="40" placeholder="2027/2028"></label><button class="primary">${st('إضافة سنة','Ajouter une année')}</button></form>
      <div><label>${st('السنة الحالية للمدرسة','Année en cours de l’école')}<select id="currentYearChoice">${yearOptions}</select></label><button id="activateYear" type="button">${st('اعتماد السنة','Définir l’année en cours')}</button><p class="hint">${st('تظل الأقسام والنتائج السابقة محفوظة في سنتها.','Les anciennes classes et notes restent dans leur année.')}</p></div>
    </div>
    <div class="structure-grid">
      <div><h4>${st('مواد القسم','Matières de la classe')}</h4><label>${st('القسم','Classe')}<select id="curriculumClass"><option value="">${st('اختر قسمًا','Choisir une classe')}</option>${structureOptions(classes,c=>`${c.name} · ${c.academic_year||'—'}`)}</select></label><div id="curriculumChoices" class="structure-checks"></div><button id="saveCurriculum" class="primary" type="button" disabled>${st('حفظ المواد','Enregistrer les matières')}</button></div>
      <form id="assignmentForm"><h4>${st('تكليف معلم','Affecter un enseignant')}</h4><label>${st('المعلم','Enseignant')}<select name="teacher" required><option value="">—</option>${structureOptions(users.filter(u=>u.roles.includes('TEACHER')&&u.status==='ACTIVE'),u=>u.full_name)}</select></label><label>${st('القسم','Classe')}<select name="classId" id="assignmentClass" required><option value="">—</option>${structureOptions(classes.filter(c=>c.active),c=>`${c.name} · ${c.academic_year||'—'}`)}</select></label><label>${st('المادة','Matière')}<select name="subjectId" id="assignmentSubject" required><option value="">—</option></select></label><label class="structure-check"><input type="checkbox" name="attendance">${st('السماح بتسجيل الحضور','Autoriser la saisie des présences')}</label><button class="primary">${st('حفظ التكليف','Enregistrer l’affectation')}</button></form>
    </div>
    <h4>${st('الأقسام المسجلة','Classes enregistrées')}</h4><div class="structure-list">${classes.length?classes.map(c=>`<div class="mini-card"><div><b>${escapeHtml(c.name)}</b><small>${escapeHtml(c.academic_year||'—')} · ${c.student_count} ${st('تلميذ','élèves')} · ${c.active?st('نشط','active'):st('مؤرشف','archivée')}</small></div><button data-edit-class="${c.id}">${st('تعديل','Modifier')}</button></div>`).join(''):`<p class="empty">${st('أنشئ أول قسم من النموذج أدناه.','Créez votre première classe avec le formulaire ci-dessous.')}</p>`}</div>`;
  $('refreshStructure').onclick=loadStructure;
  $('yearForm').onsubmit=e=>runStructureForm(e,async form=>{await api('/api/director/academic-years',{method:'POST',body:JSON.stringify({name:form.elements.yearName.value.trim()})});await loadStructure();});
  $('activateYear').onclick=async()=>{try{await api(`/api/director/academic-years/${$('currentYearChoice').value}/activate`,{method:'POST'});me=await api('/api/auth/me');await loadStructure();toast(st('تم اعتماد السنة','Année mise à jour'));}catch(e){toast(structureError(e));}};
  $('curriculumClass').onchange=async()=>{
    const id=$('curriculumClass').value;$('saveCurriculum').disabled=true;$('curriculumChoices').textContent='';if(!id)return;
    try{const d=await api(`/api/director/classes/${id}/curriculum`);if($('curriculumClass').value!==id)return;
      $('curriculumChoices').innerHTML=subjects.map(s=>`<label class="structure-check"><input type="checkbox" value="${s.id}" ${d.subjectIds.includes(s.id)?'checked':''}>${escapeHtml(s.name)}</label>`).join('')||st('أضف مادة أولًا.','Ajoutez une matière.');$('saveCurriculum').disabled=false;
    }catch(e){toast(structureError(e));}
  };
  $('saveCurriculum').onclick=async()=>{const button=$('saveCurriculum');button.disabled=true;try{await api(`/api/director/classes/${$('curriculumClass').value}/curriculum`,{method:'PUT',body:JSON.stringify({subjectIds:qsa('#curriculumChoices input:checked').map(x=>x.value)})});toast(st('تم حفظ المواد','Matières enregistrées'));}catch(e){toast(structureError(e));}finally{button.disabled=false;}};
  $('assignmentClass').onchange=async()=>{const id=$('assignmentClass').value;$('assignmentSubject').innerHTML='<option value="">—</option>';if(!id)return;try{const d=await api(`/api/classes/${id}/subjects`);if($('assignmentClass').value===id)$('assignmentSubject').innerHTML=structureOptions(d.subjects,s=>s.name);}catch(e){toast(structureError(e));}};
  $('assignmentForm').onsubmit=e=>runStructureForm(e,async form=>{await api('/api/director/assignments',{method:'POST',body:JSON.stringify({userId:form.elements.teacher.value,classId:form.elements.classId.value,subjectId:form.elements.subjectId.value,attendance:form.elements.attendance.checked})});});
  qsa('[data-edit-class]').forEach(b=>b.onclick=()=>editStructureClass(classes.find(c=>c.id===b.dataset.editClass)));
}
async function runStructureForm(event,action){event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');button.disabled=true;try{await action(form);toast(st('تم الحفظ','Enregistré'));}catch(e){toast(structureError(e));}finally{button.disabled=false;}}
function editStructureClass(c){
  showModal(`<form id="editClassForm"><h3>${st('تعديل القسم','Modifier la classe')}</h3><label>${st('الاسم','Nom')}<input name="className" required value="${escapeHtml(c.name)}"></label><label>${st('المستوى','Niveau')}<input name="level" value="${escapeHtml(c.level||'')}"></label><label>${st('الشعبة','Section')}<input name="section" value="${escapeHtml(c.section||'')}"></label><label class="structure-check"><input name="active" type="checkbox" ${c.active?'checked':''}>${st('قسم نشط','Classe active')}</label><p class="hint">${st('أرشفة القسم تحفظ تلاميذه ودرجاته.','L’archivage conserve les élèves et leurs notes.')}</p><button class="primary">${st('حفظ','Enregistrer')}</button></form>`);
  $('editClassForm').onsubmit=e=>runStructureForm(e,async form=>{await api(`/api/director/classes/${c.id}`,{method:'PATCH',body:JSON.stringify({name:form.elements.className.value,level:form.elements.level.value,section:form.elements.section.value,active:form.elements.active.checked,version:c.row_version})});await loadStructure();await loadClasses();});
}
