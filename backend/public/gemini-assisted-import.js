/* Human-reviewed Gemini OCR for school rosters and grades.
 * The image/PDF is sent only after an explicit per-request confirmation.
 * No inferred data is committed by AI; regular student/grade flows retain control. */
(function(){
"use strict";
const $=id=>document.getElementById(id);
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let rosterRows=[],gradeRows=[],rosterBusy=false,gradeBusy=false;
const normalize=x=>String(x||"").normalize("NFKC").replace(/[\u064b-\u065f\u0670]/g,"").trim().replace(/\s+/g," ").toLocaleLowerCase();
function description(e){
 const code=e?.data?.error||e.message||"";
 const labels={
   GEMINI_NOT_CONFIGURED:"Gemini غير مفعل بعد. يجب ضبط مفتاح API لمشروع مدفوع وتأكيد حماية البيانات في Render.",
   CONSENT_REQUIRED:"يجب تأكيد الإذن قبل إرسال الملف.",
   GEMINI_RATE_LIMIT:"تجاوزت عدد المحاولات؛ حاول لاحقًا.",
   GEMINI_CONNECTION_FAILED:"تعذّر الاتصال بخدمة القراءة.",
   GEMINI_INVALID_RESPONSE:"لم نستطع قراءة النتيجة. جرّب صورة أوضح أو قسم القائمة إلى صفحات.",
   GEMINI_REQUEST_FAILED:"رفضت خدمة Gemini الطلب. افحص إعدادات النموذج والحساب.",
   FILE_TOO_LARGE:"الملف كبير، الحد 5 MB.",
   UNSUPPORTED_FILE_TYPE:"ارفع صورة JPG أو PNG أو WEBP أو ملف PDF.",
   FILE_SIGNATURE_MISMATCH:"صيغة الملف غير صحيحة.",
   AUTH_REQUIRED:"سجّل دخولك أولًا.",
   DIRECTOR_ONLY:"هذه الميزة متاحة لمدير المدرسة فقط.",
   OCR_SETUP_REQUIRED:"Gemini غير مفعل بعد."
 };
 return labels[code]||"تعذّر استخراج النص. تأكد من الملف واتصال الإنترنت.";
}
function fileReady(file){
 if(!file)return "اختر صورة أو PDF أولًا.";
 if(file.size>5*1024*1024)return "الحد الأقصى للملف 5MB.";
 if(!["image/jpeg","image/png","image/webp","application/pdf"].includes(file.type))return "الصيغ المسموحة: JPG أو PNG أو WEBP أو PDF.";
 return "";
}
async function requestOcr(file,kind,consent){
 const err=fileReady(file);if(err)throw new Error(err);
 if(!consent)throw new Error("CONSENT_REQUIRED");
 const state=await api("/api/director/ocr/status");
 if(!state.enabled)throw new Error("GEMINI_NOT_CONFIGURED");
 const form=new FormData();form.append("file",file,file.name);
 return api("/api/director/ocr/gemini?kind="+kind,{method:"POST",headers:{"X-OCR-Consent":"true"},body:form});
}
function rosterTable(){
 const container=$("geminiRosterReview");if(!container)return;
 if(!rosterRows.length){container.replaceChildren();return;}
 container.innerHTML='<p class="premium-soft-text">دقّق كل اسم ورقم بنفسك. الصفوف غير الواضحة غير محددة للحفظ. يمكنك تصحيح الخانات مباشرة.</p>'+
 '<div class="gemini-scroll"><table><thead><tr><th>اعتماد</th><th>اسم التلميذ</th><th>رقم الولي</th><th>رقم التلميذ</th><th>الجنس</th><th>ملاحظة</th></tr></thead><tbody>'+
 rosterRows.map((r,i)=>'<tr data-ocr-row="'+i+'"><td><input type="checkbox" data-ocr-keep="'+i+'" '+(!r.uncertain&&r.fullName?"checked":"")+' aria-label="اعتماد الصف '+(i+1)+'"></td>'+
 '<td><input maxlength="180" data-ocr-field="fullName" value="'+esc(r.fullName)+'" aria-label="اسم التلميذ '+(i+1)+'"></td>'+
 '<td><input maxlength="22" data-ocr-field="guardianPhone" value="'+esc(r.guardianPhone)+'" aria-label="رقم الولي '+(i+1)+'"></td>'+
 '<td><input maxlength="80" data-ocr-field="studentUid" value="'+esc(r.studentUid)+'" aria-label="رقم التلميذ '+(i+1)+'"></td>'+
 '<td><select data-ocr-field="gender"><option value="">غير محدد</option><option value="M" '+(r.gender==="M"?"selected":"")+'>ولد</option><option value="F" '+(r.gender==="F"?"selected":"")+'>بنت</option></select></td>'+
 '<td class="gemini-note">'+esc(r.uncertain?"⚠ "+(r.note||"غير واضح"):(r.note||"—"))+'</td></tr>').join("")+
 '</tbody></table></div><button id="geminiRosterTransfer" type="button" class="premium-primary">نقل الأسماء المحددة إلى معاينة الاستيراد</button>';
 $("geminiRosterTransfer").onclick=transferRoster;
}
function transferRoster(){
 const rows=[...document.querySelectorAll("#geminiRosterReview [data-ocr-row]")];
 const selected=rows.filter(tr=>tr.querySelector("[data-ocr-keep]").checked).map(tr=>{
   const get=f=>tr.querySelector('[data-ocr-field="'+f+'"]').value.replace(/[\t\r\n]/g," ").trim();
   return {fullName:get("fullName"),guardianPhone:get("guardianPhone"),studentUid:get("studentUid"),gender:get("gender")};
 });
 if(!selected.length){$("geminiRosterStatus").textContent="لم تختر أي تلميذ.";return;}
 const bad=selected.find(r=>r.fullName.length<2||r.fullName.length>180||(r.guardianPhone&&!/^\+?[\d ()-]{8,22}$/.test(r.guardianPhone)));
 if(bad){$("geminiRosterStatus").textContent="تحقق من الأسماء وأرقام الهواتف قبل النقل.";return;}
 const existing=$("premiumImportText");
 existing.value=["اسم التلميذ\tواتساب الولي\tالرقم المدرسي\tالجنس",
 ...selected.map(r=>[r.fullName,r.guardianPhone,r.studentUid,r.gender].join("\t"))].join("\n");
 $("premiumImportFile").value="";
 existing.dispatchEvent(new Event("input",{bubbles:true}));
 $("premiumImportPreview").click();
 $("geminiRosterStatus").textContent="نُقل "+selected.length+" اسمًا إلى جدول المعاينة العادي. راجعها ثم اضغط «تأكيد حفظ القائمة». لم يتم الحفظ بعد.";
 $("premiumImportPreview").scrollIntoView({behavior:"smooth",block:"center"});
}
async function scanRoster(){
 if(rosterBusy)return;rosterBusy=true;
 const button=$("geminiRosterScan"),status=$("geminiRosterStatus");button.disabled=true;
 rosterRows=[];$("geminiRosterReview").replaceChildren();status.textContent="جارٍ تحليل الخط والجدول بواسطة Gemini…";
 try{
  const data=await requestOcr($("premiumImportFile").files?.[0],"students",$("geminiRosterConsent").checked);
  rosterRows=(data.rows||[]).map(r=>({...r,uncertain:!!r.uncertain})).filter(r=>r.fullName||r.studentUid);
  status.textContent=rosterRows.length?"تم التعرف على "+rosterRows.length+" صفًا"+(data.limited?" (النتيجة محدودة بأول جزء من القائمة)":"")+". راجع البيانات.":"لم تظهر أسماء واضحة؛ جرّب صورة أدق.";
  rosterTable();
 }catch(e){status.textContent=description(e);}
 finally{button.disabled=false;rosterBusy=false;}
}
function gradeTable(){
 const root=$("geminiGradesReview");if(!root)return;
 if(!gradeRows.length){root.replaceChildren();return;}
 const students=Array.isArray(currentStudents)?currentStudents:[],map=new Map();
 for(const s of students)for(const key of [normalize(s.full_name),normalize(s.student_uid)].filter(Boolean)){
  if(!map.has(key))map.set(key,[]);
  if(!map.get(key).some(v=>v.id===s.id))map.get(key).push(s);
 }
 const subject=Array.isArray(currentSubjects)?currentSubjects.find(s=>s.id===$("subjectSelect").value):null;
 const max=Number(subject?.max_score);
 const selectedSubject=normalize(subject?.name);
 const counts=new Map();
 for(const r of gradeRows){
   const nameMatch=map.get(normalize(r.fullName))||[];
   const uidMatch=map.get(normalize(r.studentUid))||[];
   const matches=r.studentUid?uidMatch.length?uidMatch:nameMatch:nameMatch;
   const candidate=matches.length===1?matches[0]:null;
   r._studentId=candidate?.id||"";
   r._name=candidate?.full_name||"";
   if(candidate)counts.set(candidate.id,(counts.get(candidate.id)||0)+1);
 }
 for(const r of gradeRows)r._duplicate=!!r._studentId&&counts.get(r._studentId)>1;
 root.innerHTML='<p class="premium-soft-text">لن تُكتب أي درجة مباشرة في قاعدة البيانات. ضع علامة بجانب الصف الصحيح ثم انقل القيم إلى نموذج النتائج لتراجعها وتحفظها بنفسك. الغياب لا يتحول إلى صفر.</p>'+
 '<div class="gemini-scroll"><table><thead><tr><th>تطبيق</th><th>في الورقة</th><th>التلميذ في مدرستي</th><th>الدرجة</th><th>ملاحظة</th></tr></thead><tbody>'+
 gradeRows.map((r,i)=>{
 const score=Number(r.score),value=r.score===null||r.score===undefined?"":String(r.score);
 const exceeds=value!==""&&(!Number.isFinite(score)||score<0||score>max);
 const sourceMax=r.maxScore!==null&&r.maxScore!==undefined&&Number(r.maxScore)>0?Number(r.maxScore):null;
 const mismatch=sourceMax!==null&&sourceMax!==max;
 const subjectMismatch=!!normalize(r.subject)&&normalize(r.subject)!==selectedSubject;
 const eligible=!!r._studentId&&!r._duplicate&&!r.absent&&!exceeds&&!mismatch&&!subjectMismatch&&value!=="";
 const check=eligible&&!r.uncertain;
 const reason=[!r._studentId?"غير مطابق":r._duplicate?"اسم مكرر":"",r.absent?"غائب":exceeds?"الدرجة خارج الحد":"",mismatch?"الحد الأعلى مختلف":"",subjectMismatch?"مادة مختلفة":"",r.uncertain?"خط غير واضح":""].filter(Boolean).join("، ")||r.note||"—";
 return '<tr data-gemini-grade="'+i+'"><td><input type="checkbox" data-gemini-grade-keep '+(check?"checked":"")+' '+(!eligible?"disabled":"")+'></td>'+
 '<td>'+esc(r.fullName||r.studentUid||"—")+'</td><td>'+esc(r._name||"لم يُطابق")+'</td>'+
 '<td><input data-gemini-grade-score inputmode="decimal" type="text" maxlength="8" value="'+esc(value)+'" '+(!eligible?"disabled":"")+' aria-label="الدرجة '+(i+1)+'"> /'+esc(max)+'</td>'+
 '<td class="gemini-note">'+esc(reason)+'</td></tr>';
 }).join("")+'</tbody></table></div><button type="button" class="premium-primary" id="geminiGradesTransfer">نقل الدرجات المحددة إلى نموذج النتائج (دون حفظ)</button>';
 $("geminiGradesTransfer").onclick=transferGrades;
}
function transferGrades(){
 const status=$("geminiGradesStatus"),subject=currentSubjects.find(x=>x.id===$("subjectSelect").value),max=Number(subject?.max_score);
 const rows=[...document.querySelectorAll("#geminiGradesReview [data-gemini-grade]")].filter(tr=>tr.querySelector("[data-gemini-grade-keep]").checked);
 if(!rows.length){status.textContent="لا توجد درجات مختارة وصالحة.";return;}
 if(gradeEditor.scope?.classId!==$("classSelect").value||gradeEditor.scope?.subjectId!==$("subjectSelect").value||gradeEditor.scope?.term!==$("termSelect").value){status.textContent="تغير القسم أو المادة أو الفصل؛ أعد قراءة الملف.";return;}
 const values=[],seen=new Set();
 for(const tr of rows){
  const row=gradeRows[Number(tr.dataset.geminiGrade)];
  const raw=tr.querySelector("[data-gemini-grade-score]").value.trim();
  const score=typeof decimalScore==="function"?decimalScore(raw):Number(raw);
  if(!Number.isFinite(score)||score<0||score>max||seen.has(row._studentId)){status.textContent="درجة غير صحيحة أو تلميذ مكرر. صحح المعاينة.";return;}
  const target=[...document.querySelectorAll("#gradeGrid [data-score]")].find(el=>el.dataset.score===row._studentId);
  if(!target){status.textContent="بيانات القسم تغيرت؛ حدّث الدرجات ثم أعد المحاولة.";return;}
  seen.add(row._studentId);values.push({target,score});
 }
 if(!confirm("هل راجعت القيم؟ ستملأ "+values.length+" درجة في النموذج فقط. لن تحفظ حتى تضغط «حفظ الدرجات المعدلة». وقد تستبدل قيمًا غير محفوظة في الحقول المحددة."))return;
 for(const {target,score} of values){target.value=String(score);target.dispatchEvent(new Event("input",{bubbles:true}));}
 status.textContent="وُضعت "+values.length+" درجة في نموذج النتائج. انزل للأسفل وراجعها ثم اضغط «حفظ الدرجات المعدلة».";
 $("gradeGrid").scrollIntoView({behavior:"smooth",block:"start"});
}
async function scanGrades(){
 if(gradeBusy)return;
 const status=$("geminiGradesStatus"),button=$("geminiGradeScan");
 if(!$("classSelect").value||!$("subjectSelect").value){status.textContent="اختر القسم والمادة والفصل أولًا.";return;}
 if(!gradeEditor.scope?.subjectId||gradeEditor.scope.subjectId!==$("subjectSelect").value||gradeEditor.scope.classId!==$("classSelect").value||gradeEditor.scope.term!==$("termSelect").value){status.textContent="انتظر تحميل درجات القسم ثم أعد المحاولة.";return;}
 gradeBusy=true;button.disabled=true;gradeRows=[];$("geminiGradesReview").replaceChildren();status.textContent="جارٍ قراءة الدرجات المكتوبة…";
 try{
   const d=await requestOcr($("geminiGradeFile").files?.[0],"grades",$("geminiGradeConsent").checked);
   gradeRows=(d.rows||[]).filter(r=>r.fullName||r.studentUid);
   status.textContent=gradeRows.length?"استخرج Gemini "+gradeRows.length+" صفًا؛ تحقق من المطابقة والدرجة."+(d.limited?" النتيجة محدودة بعدد صفوف أقصى.":""):"لم يتم العثور على درجات واضحة.";
   gradeTable();
 }catch(e){status.textContent=description(e);}
 finally{gradeBusy=false;button.disabled=false;}
}
function setup(){
 if($("geminiRosterScan"))$("geminiRosterScan").addEventListener("click",scanRoster);
 if($("geminiGradeScan"))$("geminiGradeScan").addEventListener("click",scanGrades);
 if($("premiumImportFile"))$("premiumImportFile").addEventListener("change",()=>{rosterRows=[];$("geminiRosterReview")?.replaceChildren();if($("geminiRosterStatus"))$("geminiRosterStatus").textContent="";});
 for(const id of ["classSelect","subjectSelect","termSelect"]){$(id)?.addEventListener("change",()=>{gradeRows=[];$("geminiGradesReview")?.replaceChildren();if($("geminiGradesStatus"))$("geminiGradesStatus").textContent="";});}
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",setup,{once:true});else setup();
})();