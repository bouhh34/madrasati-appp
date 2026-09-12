export function normalizeTo20(score,maxScore){const s=Number(score),m=Number(maxScore);if(!Number.isFinite(s)||!Number.isFinite(m)||m<=0)return null;return Math.round((s/m*20)*100)/100;}
export function mean(values){const xs=values.map(Number).filter(Number.isFinite);if(!xs.length)return null;return Math.round((xs.reduce((a,b)=>a+b,0)/xs.length)*100)/100;}
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
  const termAverages={};
  for(const term of ["T1","T2","T3"]){
    let total=0,coeff=0;
    for(const s of bySubject){if(s.terms[term]!==null){total+=s.terms[term]*s.coefficient;coeff+=s.coefficient;}}
    termAverages[term]=coeff?Math.round((total/coeff)*100)/100:null;
  }
  const num=["T1","T2","T3"].reduce((a,t)=>termAverages[t]===null?a:a+termAverages[t]*Number(weights[t]||0),0);
  const den=["T1","T2","T3"].reduce((a,t)=>termAverages[t]===null?a:a+Number(weights[t]||0),0);
  return {subjects:bySubject,termAverages,annualAverage:den?Math.round((num/den)*100)/100:null};
}
