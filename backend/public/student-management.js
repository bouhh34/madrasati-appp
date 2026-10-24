/* Student editing, batch registration and safe optional photo text detection.
   Saved grades and existing pupil records are never overwritten by import. */
(function(){
  "use strict";
  let pending=[],busy=false;
  const byId=id=>document.getElementById(id);
  const enc=x=>escapeHtml(String(x??""));
  const selectedClass=()=>byId("premiumStudentsClass")?.value||"";
  const editorOptions=(choices,value)=>choices.map(x=>'<option value="'+enc(x[0])+'" '+(x[0]===value?'selected':'')+'>'+enc(x[1])+'</option>').join("");
  function installEditors(){
    const old=premiumRenderStudents;
    premiumRenderStudents=function(){
      old();
      byId("premiumStudentList").querySelectorAll("[data-premium-family]").forEach(btn=>{
        const id=btn.dataset.premiumFamily;
        const s=premiumStudents.find(item=>item.id===id);
        if(!s)return;
        const card=btn.closest(".premium-pupil"),actions=card?.querySelector(".premium-pupil-actions");
        if(!actions)return;
        if(!actions.querySelector("[data-premium-edit]")){
        const edit=document.createElement("button");
        edit.type="button";edit.className="premium-student-edit";edit.dataset.studentEdit=id;
        edit.textContent=locale==="fr"?"✎ Modifier":"✎ تعديل بيانات التلميذ";
        actions.prepend(edit);
        }
        const note=document.createElement("p");
        note.className="premium-guardian-note";
        note.textContent=s.guardian_whatsapp_phone
          ?"واتساب ولي الأمر: "+(s.guardian_whatsapp_phone)+(s.guardian_whatsapp_consent?" ✓ موافقة":" • في انتظار الموافقة")
          :"رقم ولي الأمر غير مسجل";
        card.append(note);
        if(s.status!=="ACTIVE"){
          const tag=card.querySelector(".premium-pupil-tag");
          if(tag)tag.textContent=s.status==="TRANSFERRED"?"منقول":"غير نشط";
        }
      });
    };
    byId("premiumStudentList").addEventListener("click",event=>{
      const btn=event.target.closest("[data-student-edit]");
      if(!btn)return;
      event.preventDefault();event.stopImmediatePropagation();
      editStudent(btn.dataset.studentEdit);
    },true);
    premiumRenderStudents();
  }
  function editStudent(id){
    const s=premiumStudents.find(x=>x.id===id);
    if(!s||!premiumDirector())return;
    const options=currentClasses.filter(c=>c.id===selectedClass()).map(c=>[c.id,c.name+" · "+(c.academic_year||"")]);
    const birth=typeof s.birth_date==="string"?s.birth_date.slice(0,10):"";
    showModal('<form id="premiumEditStudentForm" class="premium-editor">'+
      '<h3>✎ تعديل بيانات التلميذ</h3>'+
      '<p class="premium-soft-text">احفظ التعديلات دون حذف درجاته أو تغيير رقمه تلقائيًا.</p>'+
      '<label>القسم<select name="classId" required>'+editorOptions(options,selectedClass())+'</select></label>'+
      '<label>الاسم الكامل<input name="fullName" required maxlength="180" value="'+enc(s.full_name)+'"></label>'+
      '<label>رقم التلميذ<input name="studentUid" required maxlength="80" value="'+enc(s.student_uid)+'"></label>'+
      '<div class="premium-form-row"><label>الجنس<select name="gender">'+editorOptions([["","غير محدد"],["M","ولد"],["F","بنت"]],s.gender||"")+'</select></label>'+
      '<label>تاريخ الميلاد<input name="birthDate" type="date" value="'+enc(birth)+'"></label></div>'+
      '<label>حالة التلميذ<select name="status">'+editorOptions([["ACTIVE","نشط"],["INACTIVE","غير نشط"],["TRANSFERRED","منقول"]],s.status||"ACTIVE")+'</select></label>'+
      '<label>رقم واتساب ولي الأمر<input name="guardianPhone" type="tel" inputmode="tel" maxlength="18" placeholder="34280062" value="'+enc(s.guardian_whatsapp_phone||"")+'"></label>'+
      '<label class="family-optin"><input name="guardianConsent" type="checkbox" '+(s.guardian_whatsapp_consent?"checked":"")+'> وافق ولي الأمر على التواصل المدرسي عبر واتساب</label>'+
      '<div class="premium-btn-row"><button class="premium-primary" type="submit">✓ حفظ التعديلات</button><button type="button" class="premium-secondary" id="premiumCloseEditor">إلغاء</button></div>'+
      '</form>');
    byId("premiumCloseEditor").onclick=()=>byId("modal").classList.add("hidden");
    byId("premiumEditStudentForm").onsubmit=async event=>{
      event.preventDefault();if(busy)return;
      const f=event.currentTarget,values=new FormData(f);
      const body={version:Number(s.row_version),classId:String(values.get("classId")),fullName:String(values.get("fullName")).trim(),
        studentUid:String(values.get("studentUid")).trim(),gender:values.get("gender")||null,
        birthDate:values.get("birthDate")||null,status:String(values.get("status")),
        guardianPhone:String(values.get("guardianPhone")||"").trim(),guardianConsent:!!f.elements.guardianConsent.checked};
      if(body.guardianConsent&&!body.guardianPhone){toast("أدخل رقم الولي أولًا");return;}
      busy=true;const button=f.querySelector('[type="submit"]');button.disabled=true;
      try{
        await api("/api/director/students/"+encodeURIComponent(id),{method:"PATCH",body:JSON.stringify(body)});
        byId("modal").classList.add("hidden");toast("تم تعديل بيانات التلميذ ورقم الولي");
        await premiumLoadStudents();
        // On navigating to the guardians page, the new number will load from the database.
      }catch(e){toast(e.data?.error==="VERSION_CONFLICT"?"تغيرت بيانات التلميذ في جلسة أخرى. حدّث القائمة ثم أعد المحاولة.":"تعذر حفظ التغييرات؛ تحقق من الاسم والرقم المدرسي ورقم الولي.");}
      finally{busy=false;button.disabled=false;}
    };
  }
  function splitLine(line,delimiter){
    const values=[],buffer=[];let quoted=false;
    for(let i=0;i<line.length;i++){
      const ch=line[i];
      if(ch==='"'){if(quoted&&line[i+1]==='"'){buffer.push('"');i++;}else quoted=!quoted;}
      else if(ch===delimiter&&!quoted){values.push(buffer.join("").trim());buffer.length=0;}
      else buffer.push(ch);
    }
    values.push(buffer.join("").trim());return values;
  }
  function interpret(text){
    const lines=String(text||"").replace(/^\uFEFF/,"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    if(!lines.length)return [];
    const first=lines[0];
    const delimiter=first.includes("\t")?"\t":first.includes(";")?";":first.includes(",")?",":"";
    const head=delimiter?splitLine(first,delimiter).map(x=>x.toLowerCase().replace(/[\s_\-]+/g,"")):[];
    const hasHead=head.some(h=>/الاسم|التلميذ|nom|name|student|élève/i.test(h));
    const find=(rex,fallback)=>{const i=head.findIndex(h=>rex.test(h));return i<0?fallback:i;};
    const nameIdx=find(/الاسم|التلميذ|nom|name|élève|student/,0);
    const phoneIdx=find(/ولي|الهاتف|واتساب|phone|whatsapp|parent|tuteur|mobile|contact/,1);
    const uidIdx=find(/الرقم|رقممدرسي|nns|matricule|identifiant|studentid|uid/,2);
    const genderIdx=find(/الجنس|sexe|gender|genre/,3);
    const rows=[];
    for(const line of lines.slice(hasHead?1:0)){
      if(rows.length>=600)break;
      let cells=delimiter?splitLine(line,delimiter):[];
      if(!delimiter){
        const match=line.match(/^(.*?)[\s،,:;|]+(\+?\d[\d\s()-]{6,17})$/);
        cells=match?[match[1],match[2]]:[line];
      }
      const name=(cells[nameIdx]||"").trim(),phone=(cells[phoneIdx]||"").trim(),uid=(cells[uidIdx]||"").trim();
      let gender=(cells[genderIdx]||"").trim().toLowerCase();
      gender=/^(بنت|أنثى|f|female|fille)$/.test(gender)?"F":/^(ولد|ذكر|m|male|garçon)$/.test(gender)?"M":"";
      if(name.length<2)continue;
      rows.push({fullName:name.slice(0,180),guardianPhone:phone,studentUid:uid.slice(0,80),gender:gender||null});
    }
    return rows;
  }

  /* Browser-side XLSX: first worksheet, bounded ZIP + deflate, no third-party server upload. */
  async function xlsxAsText(file){
    const bytes=new Uint8Array(await file.arrayBuffer());
    if(bytes.length>5_000_000)throw new Error("FILE_TOO_LARGE");
    const dv=new DataView(bytes.buffer);
    let eocd=-1;
    for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)
      if(dv.getUint32(i,true)===0x06054b50){eocd=i;break;}
    if(eocd<0)throw new Error("INVALID_XLSX");
    let p=dv.getUint32(eocd+16,true),count=dv.getUint16(eocd+10,true),entries=new Map();
    if(count>1300)throw new Error("INVALID_XLSX");
    for(let k=0;k<count;k++){
      if(dv.getUint32(p,true)!==0x02014b50)throw new Error("INVALID_XLSX");
      const method=dv.getUint16(p+10,true),compressed=dv.getUint32(p+20,true),size=dv.getUint32(p+24,true),n=dv.getUint16(p+28,true),extra=dv.getUint16(p+30,true),comment=dv.getUint16(p+32,true),offset=dv.getUint32(p+42,true);
      const name=new TextDecoder().decode(bytes.slice(p+46,p+46+n));
      entries.set(name,{method,compressed,size,offset});p+=46+n+extra+comment;
    }
    async function read(path){
      const a=entries.get(path);if(!a)return "";
      if(a.size>8_000_000||a.compressed>6_000_000)throw new Error("FILE_TOO_LARGE");
      const offset=a.offset;
      if(dv.getUint32(offset,true)!==0x04034b50)throw new Error("INVALID_XLSX");
      const start=offset+30+dv.getUint16(offset+26,true)+dv.getUint16(offset+28,true);
      const part=bytes.slice(start,start+a.compressed);
      let result;
      if(a.method===0)result=part;
      else if(a.method===8&&typeof DecompressionStream!=="undefined"){
        const stream=new Blob([part]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        result=new Uint8Array(await new Response(stream).arrayBuffer());
      }else throw new Error("XLSX_UNSUPPORTED");
      return new TextDecoder().decode(result);
    }
    const strings=[],shared=await read("xl/sharedStrings.xml");
    if(shared){const xml=new DOMParser().parseFromString(shared,"application/xml");
      for(const item of xml.getElementsByTagName("si"))strings.push([...item.getElementsByTagName("t")].map(t=>t.textContent||"").join(""));
    }
    const sheet=[...entries.keys()].filter(x=>/^xl\/worksheets\/sheet\d+\.xml$/.test(x)).sort()[0];
    if(!sheet)throw new Error("INVALID_XLSX");
    const doc=new DOMParser().parseFromString(await read(sheet),"application/xml");
    if(doc.getElementsByTagName("parsererror").length)throw new Error("INVALID_XLSX");
    const rows=[];
    for(const row of [...doc.getElementsByTagName("row")].slice(0,601)){
      const cells=[];
      for(const c of row.getElementsByTagName("c")){
        const ref=c.getAttribute("r")||"",letters=ref.match(/^[A-Z]+/)?.[0];let col=0;
        if(letters){for(const ch of letters)col=col*26+ch.charCodeAt(0)-64;col--;}else col=cells.length;
        if(col<0||col>24)continue;
        const raw=c.getElementsByTagName("v")[0]?.textContent||"";
        const value=c.getAttribute("t")==="s"?(strings[Number(raw)]||""):c.getAttribute("t")==="inlineStr"?[...c.getElementsByTagName("t")].map(t=>t.textContent||"").join(""):raw;
        cells[col]=String(value||"").replace(/[\t\r\n]+/g," ");
      }
      if(cells.some(v=>v?.trim()))rows.push(cells);
    }
    return rows.map(row=>row.join("\t")).join("\n");
  }
  async function decodeXlsxRows(file){
    const bytes=new Uint8Array(await file.arrayBuffer());
    if(bytes.length>8_000_000)throw Error("FILE_TOO_LARGE");
    const view=new DataView(bytes.buffer);
    let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){if(view.getUint32(i,true)===0x06054b50){end=i;break;}}
    if(end<0)throw Error("INVALID_XLSX");
    const count=view.getUint16(end+10,true),central=view.getUint32(end+16,true);
    if(count>1200)throw Error("XLSX_TOO_COMPLEX");
    let p=central;const entries=new Map();
    for(let j=0;j<count;j++){
      if(view.getUint32(p,true)!==0x02014b50)throw Error("INVALID_XLSX");
      const method=view.getUint16(p+10,true),comp=view.getUint32(p+20,true),size=view.getUint32(p+24,true);
      const nameLength=view.getUint16(p+28,true),extra=view.getUint16(p+30,true),comment=view.getUint16(p+32,true),offset=view.getUint32(p+42,true);
      const name=new TextDecoder().decode(bytes.slice(p+46,p+46+nameLength));
      entries.set(name,{method,comp,size,offset});p+=46+nameLength+extra+comment;
    }
    async function read(name){
      const e=entries.get(name);if(!e)return null;if(e.size>6_000_000||e.comp>8_000_000)throw Error("XLSX_TOO_LARGE");
      const base=e.offset;if(view.getUint32(base,true)!==0x04034b50)throw Error("INVALID_XLSX");
      const start=base+30+view.getUint16(base+26,true)+view.getUint16(base+28,true),part=bytes.slice(start,start+e.comp);
      let result;
      if(e.method===0)result=part;
      else if(e.method===8&&typeof DecompressionStream!=="undefined"){
        const stream=new Blob([part]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        result=new Uint8Array(await new Response(stream).arrayBuffer());
      }else throw Error("XLSX_UNSUPPORTED_COMPRESSION");
      return new TextDecoder().decode(result);
    }
    const shared=await read("xl/sharedStrings.xml");
    const strings=[];
    if(shared){const doc=new DOMParser().parseFromString(shared,"application/xml");for(const si of doc.getElementsByTagName("si"))strings.push([...si.getElementsByTagName("t")].map(t=>t.textContent||"").join(""));}
    const worksheet=[...entries.keys()].filter(s=>/^xl\/worksheets\/sheet\d+\.xml$/.test(s)).sort((a,b)=>Number(a.match(/\d+/)?.[0])-Number(b.match(/\d+/)?.[0]))[0];
    const xml=worksheet?await read(worksheet):null;if(!xml)throw Error("EMPTY_WORKBOOK");
    const doc=new DOMParser().parseFromString(xml,"application/xml");
    if(doc.getElementsByTagName("parsererror").length)throw Error("INVALID_XLSX");
    const rows=[];
    for(const row of [...doc.getElementsByTagName("row")].slice(0,501)){
      const data=[];for(const c of row.getElementsByTagName("c")){
        const ref=c.getAttribute("r")||"",letters=ref.match(/^[A-Z]+/)?.[0];let col=0;
        if(letters){for(const letter of letters)col=col*26+letter.charCodeAt(0)-64;col--;}else col=data.length;
        if(col>28)continue;
        const raw=c.getElementsByTagName("v")[0]?.textContent||"";
        data[col]=c.getAttribute("t")==="s"?strings[Number(raw)]||"":c.getAttribute("t")==="inlineStr"?[...c.getElementsByTagName("t")].map(t=>t.textContent||"").join(""):raw;
      }
      if(data.some(v=>String(v||"").trim()))rows.push(data);
    }
    return rows;
  }
  async function sourceText(){
    const input=byId("premiumImportText").value.trim();
    const file=byId("premiumImportFile").files?.[0];
    if(input)return input;
    if(!file)return "";
    if(file.size>(/\.xlsx$/i.test(file.name)?8:2)*1024*1024)throw new Error("FILE_TOO_LARGE");
    if(/\.xlsx$/i.test(file.name))return (await decodeXlsxRows(file)).map(row=>row.map(v=>String(v??"").replace(/[\t\r\n]+/g," ")).join("\t")).join("\n");
    if(file.type.startsWith("image/")||/\.(png|jpe?g|webp)$/i.test(file.name)){
      if(typeof window.TextDetector!=="function")throw new Error("OCR_UNSUPPORTED");
      const bitmap=await createImageBitmap(file);
      try{
        const recognized=await new TextDetector().detect(bitmap);
        return recognized.map(x=>x.rawValue).join("\n");
      }finally{bitmap.close();}
    }
    if(/\.xlsx$/i.test(file.name))return xlsxAsText(file);
    if(!/\.(csv|txt|tsv)$/i.test(file.name)&&!/^text\//.test(file.type))throw new Error("UNSUPPORTED_FORMAT");
    return file.text();
  }
  async function previewImport(){
    pending=[];byId("premiumImportSave").disabled=true;
    const out=byId("premiumImportStatus"),table=byId("premiumImportTable");
    out.textContent="جارٍ فحص القائمة…";table.innerHTML="";
    try{
      const raw=await sourceText();
      pending=interpret(raw);
      if(!pending.length){out.textContent="لم أتعرف على أسماء. ألصق الأسماء أو اختر ملف CSV/TXT.";return;}
      const numbers=pending.filter(x=>x.guardianPhone).length;
      out.textContent="معاينة "+pending.length+" تلميذًا · "+numbers+" رقم ولي أمر. لن تُحفظ أي بيانات قبل الضغط على تأكيد.";
      table.innerHTML='<div class="premium-import-scroll"><table><thead><tr><th>#</th><th>التلميذ</th><th>رقم الولي</th><th>رقم مدرسي</th></tr></thead><tbody>'+
        pending.slice(0,60).map((r,i)=>'<tr><td>'+(i+1)+'</td><td>'+enc(r.fullName)+'</td><td>'+enc(r.guardianPhone||"—")+'</td><td>'+enc(r.studentUid||"تلقائي")+'</td></tr>').join("")+
        '</tbody></table></div>'+(pending.length>60?'<p class="premium-soft-text">أول 60 تلميذًا في المعاينة. جميع الأسماء ستُفحص عند الحفظ.</p>':"");
      byId("premiumImportSave").disabled=false;
    }catch(e){
      out.textContent=e.message==="XLSX_UNSUPPORTED_COMPRESSION"?"هذا المتصفح لا يدعم ملف Excel بهذه الصيغة. احفظه بصيغة CSV ثم أعد الاستيراد.":e.message==="OCR_UNSUPPORTED"?"المتصفح لا يدعم قراءة الكتابة من الصور تلقائيًا. استخدم CSV أو انسخ النص من الصورة والصقه هنا.":e.message==="FILE_TOO_LARGE"?"الملف أكبر من الحد المسموح.":e.message==="XLSX_UNSUPPORTED"?"الجهاز لا يدعم فك ضغط Excel. احفظ الملف CSV وأعد المحاولة.":"تنسيق الملف غير مدعوم؛ جرّب Excel أو CSV أو TXT.";
    }
  }
  async function commitImport(){
    if(busy||!pending.length)return;
    const classId=selectedClass(),status=byId("premiumImportStatus");
    if(!classId){toast("اختر القسم قبل الاستيراد");return;}
    if(!confirm("تأكيد استيراد "+pending.length+" تلميذًا إلى القسم المختار؟ لن تُحذف البيانات الموجودة."))return;
    const consent=byId("premiumImportConsent").checked;
    const rows=pending.map(r=>({...r,guardianConsent:consent&&!!r.guardianPhone}));
    const btn=byId("premiumImportSave");busy=true;btn.disabled=true;
    let added=0,skipped=0;
    try{
      for(let i=0;i<rows.length;i+=150){
        const result=await api("/api/director/students/import",{method:"POST",body:JSON.stringify({classId,rows:rows.slice(i,i+150)})});
        added+=result.created||0;skipped+=Number(result.skipped)||0;
        status.textContent="تم حفظ "+added+" · متجاوز/مكرر "+skipped+" · تم فحص "+Math.min(rows.length,i+150)+"/"+rows.length;
      }
      status.textContent="اكتمل الاستيراد: "+added+" تلميذًا جديدًا، "+skipped+" متجاوزًا أو مكررًا. بقيت السجلات والدرجات السابقة محفوظة.";
      pending=[];byId("premiumImportSave").disabled=true;
      await Promise.allSettled([premiumLoadStudents(),loadDirectorHome()]);
      if(document.querySelector("#page-family.active"))document.getElementById("familyRefresh")?.click();
    }catch(e){
      status.textContent="توقف الاستيراد بعد حفظ "+added+" تلميذًا. راجع القائمة قبل إعادة المحاولة.";
      toast(e.data?.error==="INVALID_IMPORT"?"القائمة فيها بيانات غير مقبولة.":"تعذر استكمال الاستيراد");
    }finally{busy=false;if(pending.length)btn.disabled=false;}
  }
  window.schoolStudentTools={openEdit:editStudent};
  const ready=()=>{
    if(!byId("premiumStudentList")||!byId("premiumImportPreview"))return;
    installEditors();
    byId("premiumImportPreview").addEventListener("click",previewImport);
    byId("premiumImportSave").addEventListener("click",commitImport);
    byId("premiumImportText").addEventListener("input",()=>{pending=[];byId("premiumImportSave").disabled=true;});
    byId("premiumImportFile").addEventListener("change",()=>{pending=[];byId("premiumImportSave").disabled=true;byId("premiumImportText").value="";});
  };
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",ready,{once:true});else ready();
})();