import test from "node:test";
import assert from "node:assert/strict";
import {buildStudentReport,buildClassResults,normalizeTo20} from "../src/services/reports.js";
test("normalization to 20 is accurate",()=>assert.equal(normalizeTo20(50,100),10));
test("annual average follows 1-2-3 term weights",()=>{const subjects=[{id:"a",name:"Math",coefficient:1,max_score:20}];const grades=[{subject_id:"a",term:"T1",score:10},{subject_id:"a",term:"T2",score:14},{subject_id:"a",term:"T3",score:18}];const r=buildStudentReport({subjects,grades});assert.equal(r.annualAverage,15.33)});
test("subject coefficients affect term average",()=>{const subjects=[{id:"a",name:"A",coefficient:2,max_score:20},{id:"b",name:"B",coefficient:1,max_score:20}];const grades=[{subject_id:"a",term:"T1",score:18},{subject_id:"b",term:"T1",score:6}];const r=buildStudentReport({subjects,grades});assert.equal(r.termAverages.T1,14)});
test('ties share competition rank; incomplete and empty results never receive a rank',()=>{
  const students=['a','b','c','d','e'].map(id=>({id,full_name:id,student_uid:id}));
  const subjects=[{id:'math',name:'Math',coefficient:1,max_score:20},{id:'arabic',name:'Arabic',coefficient:1,max_score:20}];
  const grades=[];for(const [id,score] of [['a',16],['b',16],['c',12]])for(const sub of subjects)grades.push({student_id:id,subject_id:sub.id,term:'T1',score});
  grades.push({student_id:'d',subject_id:'math',term:'T1',score:20});
  const result=buildClassResults({students,subjects,grades});
  assert.deepEqual(result.results.map(s=>s.rank),[1,1,3,null,null]);
  assert.deepEqual(result.stats,{total:5,ranked:3,incomplete:2,highest:16,lowest:12,average:14.67});
  assert.equal(result.results.find(s=>s.id==='d').average,20);assert.equal(result.results.find(s=>s.id==='e').average,null);
  assert.equal(buildClassResults({students,subjects:[],grades:[]}).stats.ranked,0);
  assert.equal(normalizeTo20(null,20),null);
});
