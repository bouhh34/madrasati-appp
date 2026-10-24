/* School-scoped pupil editor and reviewed roster import. No external network or OCR. */
(function(){
  "use strict";
  const el=id=>document.getElementById(id);
  const safe=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let editing=null,records=[],localPreview=null,busy=false;
  const editor=()=>el("schoolStudentEditor");
  function close(){editor()?.close?.();editing=null}
  function openEdit(id){
    const student=(typeof premiumStudents!=="undefined"?premiumStudents:[]).find(s=>s.id===id);
    if(!student){toast("حدّث لائحة التلاميذ أولًا");return;}
    editing={...student};
    el("schoolEditId").value=student.id;
    el("schoolEditName").value=student.full_name||"";
    el("schoolEditUid").value=student.student_uid||"";
    el("schoolEditGender").value=student.gender||"";
    el("schoolEditPhone").value=student.guardian_whatsapp_phone||"";
    el("schoolEditConsent").checked=student.guardian_whatsapp_consent===true;
    el("schoolEditClass").innerHTML=(typeof currentClasses!=="undefined"?currentClasses:[]).map(c=>'<option value="'+safe(c.id)+'">'+safe(c.name)+' · '+safe(c.academic_year||"")+'</option>').join("");
    el("schoolEditClass").value=student.class_id||el("premiumStudentsClass")?.value||"";
    editor()?.showModal?.();
  }
  window.schoolStudentTools={openEdit};
  async function save(event){
    event.preventDefault();
    if(!editing||busy)return;
    const data={
      version:editing.row_version,
      classId:el("schoolEditClass").value,
      fullName:el("schoolEditName").value.trim(),
      studentUid:el("schoolEditUid").value.trim(),
      gender:el("schoolEditGender").value||null,
      status:editing.status||"ACTIVE",
      birthDate:editing.birth_date?String(editing.birth_date).slice(0,10):null,
      guardianPhone:el("schoolEditPhone").value.trim(),
      guardianConsent:el("schoolEditConsent").checked
    };
    if(data.guardianConsent&&!data.guardianPhone){toast("أدخل رقم الولي قبل تفعيل الموافقة");return;}
    const button=el("schoolEditSave");busy=true;button.disabled=true;
    try{
      await api("/api/director/students/"+encodeURIComponent(editing.id),{method:"PATCH",body:JSON.stringify(data)});
      close();toast("حُفظت بيانات التلميذ ورقم ولي الأمر");
      await Promise.allSettled([premiumLoadStudents(),premiumRefreshHome(),loadDirectorHome()]);
    }catch(e){
      toast(e.data?.error==="VERSION_CONFLICT"?"عُد لتحديث اللائحة؛ تم تعديل التلميذ من جهاز آخر.":e.data?.error==="STUDENT_EXISTS"?"رقم التلميذ مستخدم من قبل":"تعذّر تعديل التلميذ. تحقق من البيانات.");
    }finally{busy=false;button.disabled=false;}
  }
  function csvRows(text,separator){
    const rows=[];let row=[],cell="",quoted=false;
    text=String(text||"").replace(/^\uFEFF/,"");
    for(let i=0;i<text.length;i++){
      const ch=text[i];
      if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
      else if(ch===separator&&!quoted){row.push(cell.trim());cell="";}
      else if((ch==="\n"||ch==="\r")&&!quoted){if(ch==="\r"&&text[i+1]==="\n")i++;row.push(cell.trim());if(row.some(v=>v))rows.push(row);row=[];cell="";}
      else cell+=ch;
    }
    row.push(cell.trim());if(row.some(v=>v))rows.push(row);
    return rows.slice(0,501);
  }
  function decodeRows(text){
    const head=String(text).split(/\r?\n/).slice(0,3).join("\n");
    const candidates=[",",";","\t","|"];
    const sep=candidates.map(c=>({c,n:[...head].filter(x=>x===c).length})).sort((a,b)=>b.n-a.n)[0];
    return csvRows(text,sep?.n?sep.c:",");
  }
  function normalizeHeader(h){return String(h||"").toLowerCase().trim().replace(/[ًٌٍَُِّْـ]/g,"").replace(/[_\s\-:()]+/g,"");}
  const synonyms={
    fullName:["الاسم","اسمالتلميذ","الاسمالكامل","التلميذ","student","name","fullname","nom","nomcomplet","eleve","élève"],
    studentUid:["الرقم","رقمالتلميذ","الرقمالمدرسي","matricule","studentid","studentuid","id","numero","numéro"],
    gender:["الجنس","النوع","gender","sexe","sex"],
    guardianPhone:["الولي","رقمالولي","واتسابالولي","رقموليالامر","رقمواتسابوليالامر","telephone","phone","parentphone","whatsapp","contact","numeroduparent","tuteur","parent"],
    guardianConsent:["الموافقة","موافقةالولي","consent","accord","permission"]
  };
  const val=(x)=>String(x??"").trim();
  function mapRows(rows){
    if(!rows.length)return [];
    const head=rows[0].map(normalizeHeader);
    const indexes={};for(const [key,arr] of Object.entries(synonyms)){indexes[key]=head.findIndex(h=>arr.includes(h)||arr.some(s=>h.startsWith(s)&&s.length>4));}
    const hasHeader=indexes.fullName!==-1||indexes.guardianPhone!==-1;
    const raw=hasHeader?rows.slice(1):rows;
    return raw.map((line,i)=>{
      const get=(key,fallback)=>val(line[hasHeader?indexes[key]:fallback]||"");
      const rawGender=get("gender",2).toLowerCase();
      const gender=/^(m|male|ذكر|ولد|garçon|garcon)$/.test(rawGender)?"M":/^(f|female|أنثى|بنت|fille)$/.test(rawGender)?"F":null;
      return {line:i+(hasHeader?2:1),fullName:get("fullName",0),studentUid:get("studentUid",1),gender,guardianPhone:get("guardianPhone",3),guardianConsent:/^(1|true|yes|oui|نعم|موافق)$/.test(get("guardianConsent",4).toLowerCase())};
    }).filter(r=>r.fullName||r.guardianPhone||r.studentUid);
  }
  async function zipFileEntries(file){
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
  function showPreview(message){
    const root=el("schoolRosterPreview"),status=el("schoolRosterStatus"),button=el("schoolRosterImport");
    status.textContent=message||"";
    button.disabled=!records.length;
    if(!records.length){root.innerHTML="";return;}
    const valid=records.filter(r=>r.fullName.length>=2).length,phones=records.filter(r=>r.guardianPhone).length;
    status.textContent="المعاينة: "+records.length+" سطر، "+valid+" اسم صالح، "+phones+" رقم ولي أمر. حدد القسم ثم أكد الاستيراد.";
    root.innerHTML='<div class="school-roster-table-scroll"><table><thead><tr><th>#</th><th>اسم التلميذ</th><th>الرقم المدرسي</th><th>واتساب الولي</th><th>الموافقة</th></tr></thead><tbody>'+
      records.slice(0,30).map(r=>'<tr><td>'+r.line+'</td><td>'+safe(r.fullName)+'</td><td>'+safe(r.studentUid||"تلقائي")+'</td><td>'+safe(r.guardianPhone||"—")+'</td><td>'+(r.guardianConsent?"نعم":"لا")+'</td></tr>').join("")+'</tbody></table></div>'+
      (records.length>30?'<p class="premium-soft-text">تظهر أول 30 سطرًا فقط في المعاينة؛ سيُستورد الباقي بعد التأكيد.</p>':"");
  }
  async function chooseFile(event){
    records=[];if(localPreview){URL.revokeObjectURL(localPreview);localPreview=null;}
    const file=event.target.files?.[0];if(!file){showPreview("");return;}
    try{
      if(/\.(csv|tsv|txt)$/i.test(file.name)){records=mapRows(decodeRows(await file.text()));}
      else if(/\.xlsx$/i.test(file.name)){records=mapRows(await zipFileEntries(file));}
      else if(/^image\/(png|jpeg)$/i.test(file.type)){
        showPreview("الصورة للمعاينة اليدوية فقط؛ لتسجيل التلاميذ استخدم قائمة Excel أو CSV.");
        localPreview=URL.createObjectURL(file);
        const img=document.createElement("img");img.src=localPreview;img.alt="صورة لائحة التلاميذ للمراجعة";img.style.cssText="width:100%;max-height:370px;object-fit:contain";
        el("schoolRosterPreview").replaceChildren(img);return;
      }else if(file.type==="application/pdf"||/\.pdf$/i.test(file.name)){showPreview("ملف PDF مرجع للمراجعة فقط. احفظ بيانات التلاميذ في Excel أو CSV أولًا.");return;}
      else throw Error("UNSUPPORTED_FILE_TYPE");
      if(records.length>150){records=[];throw Error("TOO_MANY_PUPILS");}
      showPreview(records.length?"":"لم أجد أسماء صالحة في الملف. تحقق من تنسيق الأعمدة.");
    }catch(e){records=[];showPreview(e.message==="TOO_MANY_PUPILS"?"الحد 150 تلميذًا لكل دفعة؛ قسم الملف إلى دفعات.":e.message==="XLSX_UNSUPPORTED_COMPRESSION"?"هذا الجهاز لا يدعم فك ضغط ملف Excel. احفظه بصيغة CSV.":"تعذر قراءة الملف. استخدم CSV بترميز UTF-8 أو Excel XLSX.");}
  }
  async function importRows(){
    const classId=el("premiumStudentsClass")?.value;
    if(!classId){toast("حدد القسم الذي تريد استيراد التلاميذ إليه");return;}
    if(!records.length||busy)return;
    const valid=records.filter(x=>x.fullName.length>=2);
    if(!valid.length){toast("لا توجد أسماء صالحة");return;}
    if(!confirm("هل راجعت أسماء "+valid.length+" تلميذًا وأرقام أولياء الأمور قبل إضافتها إلى القسم؟"))return;
    busy=true;const button=el("schoolRosterImport");button.disabled=true;
    try{
      const data=await api("/api/director/students/import",{method:"POST",body:JSON.stringify({classId,students:valid.map(({fullName,studentUid,gender,guardianPhone,guardianConsent})=>({fullName,studentUid,gender,guardianPhone,guardianConsent:false}))})});
      records=[];el("schoolRosterFile").value="";
      showPreview("تم استيراد "+data.created+" تلميذ. المتجاوزون/المكررون: "+data.skipped+". أرقام الأولياء محفوظة دون تفعيل إرسال واتساب.");
      if(data.issues?.length){el("schoolRosterStatus").textContent+=" الأسطر التي تحتاج مراجعة: "+data.issues.slice(0,15).map(i=>i.line+" ("+i.error+")").join("، ");}
      await Promise.allSettled([premiumLoadStudents(),premiumRefreshHome(),loadDirectorHome()]);
    }catch(e){toast("تعذر استيراد اللائحة. تحقق من اتصالك، القسم، وحجم الملف.");}
    finally{busy=false;button.disabled=!records.length;}
  }
  document.addEventListener("DOMContentLoaded",()=>{
    el("schoolStudentEditClose")?.addEventListener("click",close);
    editor()?.addEventListener("click",e=>{if(e.target===editor())close();});
    el("schoolStudentEditForm")?.addEventListener("submit",save);
    el("schoolRosterFile")?.addEventListener("change",chooseFile);
    el("schoolRosterImport")?.addEventListener("click",importRows);
  });
})();
