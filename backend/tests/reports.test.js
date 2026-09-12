import test from "node:test";
import assert from "node:assert/strict";
import {buildStudentReport,normalizeTo20} from "../src/services/reports.js";
test("normalization to 20 is accurate",()=>assert.equal(normalizeTo20(50,100),10));
test("annual average follows 1-2-3 term weights",()=>{const subjects=[{id:"a",name:"Math",coefficient:1,max_score:20}];const grades=[{subject_id:"a",term:"T1",score:10},{subject_id:"a",term:"T2",score:14},{subject_id:"a",term:"T3",score:18}];const r=buildStudentReport({subjects,grades});assert.equal(r.annualAverage,15.33)});
test("subject coefficients affect term average",()=>{const subjects=[{id:"a",name:"A",coefficient:2,max_score:20},{id:"b",name:"B",coefficient:1,max_score:20}];const grades=[{subject_id:"a",term:"T1",score:18},{subject_id:"b",term:"T1",score:6}];const r=buildStudentReport({subjects,grades});assert.equal(r.termAverages.T1,14)});
