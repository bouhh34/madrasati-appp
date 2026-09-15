import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {renderReportPages,renderAttendanceReport} from '../public/report-print.js';
import {buildStudentReport} from '../src/services/reports.js';

test('three students occupy two A4 groups without duplicated or missing reports',()=>{
  const report=buildStudentReport({subjects:[{id:'s',name:'الرياضيات',coefficient:1,max_score:20}],grades:[]});
  const entries=['a','b','c'].map(id=>({student:{id,full_name:`Student ${id}`,student_uid:id,class_name:'A',academic_year:'2024/2025'},report,rank:null,totalStudents:3}));
  const dom=new JSDOM(renderReportPages(entries,{name:'<script>unsafe</script>',academic_year:'2026/2027'},{lang:'ar',custom:true}));
  const doc=dom.window.document;
  assert.equal(doc.querySelectorAll('.paper').length,2);assert.equal(doc.querySelectorAll('.half-report').length,3);assert.equal(doc.querySelectorAll('.cut-line').length,1);
  assert.deepEqual([...doc.querySelectorAll('[data-student-id]')].map(e=>e.dataset.studentId),['a','b','c']);
  assert.equal(doc.querySelectorAll('script').length,0);assert.match(doc.body.textContent,/2024\/2025/);assert.equal(doc.body.textContent.includes('2026/2027'),false);
  for(const card of doc.querySelectorAll('.half-report')){assert.equal(card.querySelectorAll('img').length,2);assert.match(card.textContent,/غير مكتملة/);assert.match(card.textContent,/المعدل السنوي مؤقت/);}
  dom.window.close();
});
test('attendance report states its recorded-only basis and escapes student names',()=>{
  const html=renderAttendanceReport({classroom:{name:'A'},from:'2026-09-01',to:'2026-09-14',students:[{full_name:'<img>',student_uid:'A1',PRESENT:1,ABSENT:0,LATE:1,EXCUSED:0}],totals:{PRESENT:1,ABSENT:0,LATE:1,EXCUSED:0}},{name:'École'},'fr');
  assert.match(html,/jours non saisis/);assert.match(html,/&lt;img&gt;/);
});
