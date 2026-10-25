export function normalizeTo20(score,maxScore){if(score===null||score===undefined||score==='')return null;const s=Number(score),m=Number(maxScore);if(!Number.isFinite(s)||!Number.isFinite(m)||m<=0)return null;return Math.round((s/m*20)*100)/100;}
export function mean(values){const xs=values.filter(x=>x!==null&&x!==undefined&&x!=='').map(Number).filter(Number.isFinite);if(!xs.length)return null;return Math.round((xs.reduce((a,b)=>a+b,0)/xs.length)*100)/100;}
/** Compare visually identical names safely; never mutate subjects or grades in storage. */
export function canonicalSubjectName(name){
  return String(name??"").normalize("NFKC").replace(/[\u064B-\u065F\u0670\u0640]/g,"").replace(/\s+/g," ").trim().toLocaleLowerCase();
}
function annualFromTerms(terms,weights){
  let numerator=0,denominator=0;
  for(const t of ["T1","T2","T3"]){
    if(terms[t]===null)continue;
    numerator+=terms[t]*Number(weights[t]||0);
    denominator+=Number(weights[t]||0);
  }
  return denominator?Math.round((numerator/denominator)*100)/100:null;
}
/**
 * If two class subjects have the same normalized name AND settings, fold their
 * non-conflicting marks into one logical subject for display and averages.
 * Preserve separate marked entries on conflicting terms or coefficients, and
 * treat unresolved conflicts as incomplete. No writes or grade migrations.
 */
export function resolveDuplicateReportSubjects(rows,weights){
  const groups=new Map();
  for(const subject of rows){
    const key=canonicalSubjectName(subject.name);
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(subject);
  }
  const resolved=[];let collapsedCount=0,conflictCount=0;
  for(const items of groups.values()){
    if(items.length===1){resolved.push(items[0]);continue;}
    const [first]=items;
    const sameSettings=items.every(s=>s.coefficient===first.coefficient&&s.maxScore===first.maxScore);
    const termConflict=["T1","T2","T3"].some(t=>{
      const values=items.map(s=>s.terms[t]).filter(n=>n!==null);
      return new Set(values).size>1;
    });
    if(!sameSettings||termConflict){
      // Ambiguous source: never discard either mark or quietly count it once.
      // Keep source records visible and flag ranking/completeness as provisional.
      conflictCount++;
      items.forEach((item,index)=>resolved.push({...item,
        name:item.name+" ("+(index+1)+")",duplicateConflict:true}));
      continue;
    }
    const terms={};
    for(const t of ["T1","T2","T3"]){
      terms[t]=items.map(s=>s.terms[t]).find(v=>v!==null)??null;
    }
    resolved.push({...first,terms,annual:annualFromTerms(terms,weights),
      duplicateMerged:true,sourceSubjectIds:items.map(s=>s.id)});
    collapsedCount+=items.length-1;
  }
  return {subjects:resolved,collapsedCount,conflictCount};
}
export function buildStudentReport({subjects,grades,weights={T1:1,T2:2,T3:3}}){
  const bySubject=[];
  for(const subject of subjects){
    const sg=grades.filter(g=>String(g.subject_id)===String(subject.id));
    const terms={};
    for(const term of ["T1","T2","T3"]){
      const normalized=sg.filter(g=>g.term===term).map(g=>normalizeTo20(g.score,subject.max_score)).filter(v=>v!==null);
      terms[term]=mean(normalized);
    }
    const num=["T1","T2","T3"].reduce((acc,t)=>terms[t]===null?acc:acc+terms[t]*Number(weights[t]||0),0);
    const den=["T1","T2","T3"].reduce((acc,t)=>terms[t]===null?acc:acc+Number(weights[t]||0),0);
    const annual=den?Math.round((num/den)*100)/100:null;
    bySubject.push({id:subject.id,name:subject.name,coefficient:Number(subject.coefficient),maxScore:Number(subject.max_score),terms,annual});
  }
  const normalized=resolveDuplicateReportSubjects(bySubject,weights);
  const reportSubjects=normalized.subjects;
  const termAverages={};
  for(const term of ["T1","T2","T3"]){
    let total=0,coeff=0;
    for(const s of reportSubjects){if(s.terms[term]!==null){total+=s.terms[term]*s.coefficient;coeff+=s.coefficient;}}
    termAverages[term]=coeff?Math.round((total/coeff)*100)/100:null;
  }
  const num=["T1","T2","T3"].reduce((a,t)=>termAverages[t]===null?a:a+termAverages[t]*Number(weights[t]||0),0);
  const den=["T1","T2","T3"].reduce((a,t)=>termAverages[t]===null?a:a+Number(weights[t]||0),0);
  const completeness={};
  for(const term of ['T1','T2','T3']){
    const missing=reportSubjects.filter(s=>s.terms[term]===null||s.duplicateConflict).map(s=>s.id);
    completeness[term]={complete:reportSubjects.length>0&&!missing.length,missingSubjectIds:missing};
  }
  completeness.ANNUAL={complete:['T1','T2','T3'].every(t=>completeness[t].complete)};
  return {subjects:reportSubjects,termAverages,annualAverage:den?Math.round((num/den)*100)/100:null,
    completeness,duplicateSubjectsCollapsed:normalized.collapsedCount,duplicateSubjectsConflicts:normalized.conflictCount};
}

export function buildClassResults({students,subjects,grades,weights,period='T1'}){
  const grouped=new Map();
  for(const g of grades){if(!grouped.has(g.student_id))grouped.set(g.student_id,[]);grouped.get(g.student_id).push(g);}
  const results=students.map(student=>{
    const report=buildStudentReport({subjects,grades:grouped.get(student.id)||[],weights});
    const annual=period==='ANNUAL',average=annual?report.annualAverage:report.termAverages[period];
    const complete=report.completeness[period].complete;
    const available=report.subjects.filter(s=>(annual?s.annual:s.terms[period])!==null);
    const weightedTotal=available.length?Math.round(available.reduce((n,s)=>n+(annual?s.annual:s.terms[period])*s.coefficient,0)*100)/100:null;
    return {...student,average,weightedTotal,complete,rank:null,report};
  });
  results.sort((a,b)=>Number(b.complete)-Number(a.complete)||(b.average??-1)-(a.average??-1)||a.full_name.localeCompare(b.full_name)||a.id.localeCompare(b.id));
  let lastAverage,lastRank,ranked=0;
  for(const result of results){
    if(!result.complete)continue;
    ranked++;if(result.average!==lastAverage){lastRank=ranked;lastAverage=result.average;}
    result.rank=lastRank;
  }
  const averages=results.filter(s=>s.complete).map(s=>s.average);
  return {results,subjects,stats:{total:students.length,ranked:averages.length,incomplete:students.length-averages.length,
    highest:averages.length?Math.max(...averages):null,lowest:averages.length?Math.min(...averages):null,average:mean(averages)}};
}
