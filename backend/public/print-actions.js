function installClassPrint(data,root){
  const actions=document.createElement('div');actions.className='attendance-toolbar';
  const query=new URLSearchParams({classId:data.classroom.id,term:data.period,lang:locale});
  if(data.scope==='SUBJECT')query.set('subjectId',data.subjects[0].id);
  for(const [format,title] of [['cards',st('كشوف القسم · تلميذان في A4','Bulletins · 2 élèves par A4')],['roster',st('طباعة لائحة النتائج','Imprimer la liste des résultats')]]){
    const link=document.createElement('a');link.className='ghost report-print-link';link.target='_blank';link.rel='noopener';link.textContent=title;
    const params=new URLSearchParams(query);params.set('format',format);link.href=`/print.html?${params}`;actions.append(link);
  }
  root.prepend(actions);
}
function printStudentReport(studentId){
  const term=$('resultTerm')?.value||$('termSelect')?.value||'T1';
  window.open(`/print.html?${new URLSearchParams({studentId,term,lang:locale})}`,'_blank','noopener');
}
