import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {JSDOM,VirtualConsole} from 'jsdom';

async function page(account,settings={}){
  const root=new URL('../public/',import.meta.url);
  const dom=new JSDOM(fs.readFileSync(new URL('index.html',root),'utf8'),{url:'http://localhost:3100',runScripts:'outside-only',virtualConsole:new VirtualConsole()});
  let signedIn=settings.signedIn??true,failLogout=false;const calls=[];
  const w=dom.window;w.eval=source=>vm.runInContext(source,dom.getInternalVMContext());
  w.fetch=async(url,options={})=>{
    calls.push({url,method:options.method||'GET'});
    if(settings.intercept){const result=await settings.intercept(url,options);if(result)return result;}
    let status=200,data={};
    if(url==='/api/auth/login'){signedIn=true;data={csrf:'new-fixture'};}
    else if(url==='/api/auth/me'){status=signedIn?200:401;data=account;}
    else if(url==='/api/auth/csrf')data={csrf:'fixture'};
    else if(url==='/api/auth/logout'){status=failLogout?503:200;if(!failLogout)signedIn=false;}
    else if(url==='/api/platform/me')data={isSuperAdmin:account.isSuperAdmin};
    else if(url==='/api/platform/overview')data={overview:{schools:2,users:4}};
    else if(url==='/api/platform/schools'||url==='/api/auth/schools')data={schools:[]};
    else if(url==='/api/classes')data={classes:[]};
    else if(url==='/api/notifications')data={notifications:[]};
    return {ok:status===200,status,headers:{get:()=> 'application/json'},json:async()=>data};
  };
  for(const file of ['app.css','features.css']){const style=w.document.createElement('style');style.textContent=fs.readFileSync(new URL(file,root),'utf8');w.document.head.append(style);}
  for(const file of ['app.js','structure.js','platform-navigation.js','academic-workflows.js'])w.eval(fs.readFileSync(new URL(file,root),'utf8'));
  await new Promise(resolve=>setTimeout(resolve,350));
  return {w,calls,fail:()=>{failLogout=true;},close:()=>w.close()};
}
const platform={id:'platform',login:'owner',fullName:'Platform owner',isSuperAdmin:true,roles:[],schoolId:null};
test('platform navigation remains isolated after school role watchers run',async()=>{
  const p=await page(platform);try{
    assert.ok(p.w.document.body.classList.contains('platform-mode'));
    assert.equal(p.w.document.getElementById('roleText').textContent,'SUPER ADMIN');
    p.w.eval("navigate('settings')");
    assert.ok(p.w.document.getElementById('page-super-admin').classList.contains('active'));
    assert.equal(p.w.document.getElementById('page-settings').classList.contains('active'),false);
    assert.equal(p.w.getComputedStyle(p.w.document.querySelector('.school-navigation')).display,'none');
    assert.notEqual(p.w.getComputedStyle(p.w.document.querySelector('.sidebar .platform-navigation')).display,'none');
    assert.equal(p.w.document.querySelector('.platform-navigation [data-attendance-nav]'),null);
    assert.ok(p.w.document.getElementById('accountLogout'));
    assert.equal(p.calls.some(c=>c.url==='/api/classes'),false);
    await p.w.eval('logout()');
    assert.equal(p.w.eval('me'),null);assert.equal(p.w.eval('csrf'),'');
    assert.ok(p.w.document.getElementById('appShell').classList.contains('hidden'));
    assert.ok(p.calls.some(c=>c.url==='/api/auth/logout'&&c.method==='POST'));
  }finally{p.close();}
});
test('failed logout is reported and does not pretend the server session ended',async()=>{
  const p=await page(platform);try{p.fail();await p.w.eval('logout()');assert.equal(p.w.eval('me.login'),'owner');assert.match(p.w.document.getElementById('toast').textContent,/تعذر/);assert.equal(p.w.document.getElementById('accountLogout').disabled,false);}finally{p.close();}
});
test('a fresh school account has school navigation and no previous platform identity',async()=>{
  const p=await page({id:'director',login:'director',fullName:'School director',isSuperAdmin:false,roles:['DIRECTOR'],schoolId:'school',school:{name:'School A',school_type:'PUBLIC'}});
  try{
    assert.equal(p.w.document.body.classList.contains('platform-mode'),false);
    assert.equal(p.w.getComputedStyle(p.w.document.querySelector('.platform-navigation')).display,'none');
    assert.equal(p.w.document.getElementById('schoolNameSide').textContent,'School A');
    p.w.eval("navigate('settings')");assert.ok(p.w.document.getElementById('page-settings').classList.contains('active'));
    assert.ok(p.w.document.getElementById('accountLogout'));
  }finally{p.close();}
});

function response(status,retry=''){
  return {ok:status===200,status,headers:{get:name=>name==='retry-after'?retry:'application/json'},json:async()=>({})};
}
function fillLogin(p){p.w.document.getElementById('login').value='owner';p.w.document.getElementById('password').value='test-only';}
test('rapid clicks and Enter submit once and successful login clears password',async()=>{
  let release;const blocked=new Promise(resolve=>{release=resolve;});
  const p=await page(platform,{signedIn:false,intercept:async url=>{if(url==='/api/auth/login')await blocked;}});
  try{
    fillLogin(p);const pending=p.w.eval('login()');
    assert.equal(p.w.document.getElementById('loginBtn').disabled,true);
    await p.w.eval('login()');
    p.w.document.getElementById('password').dispatchEvent(new p.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    assert.equal(p.calls.filter(c=>c.url==='/api/auth/login').length,1);
    release();await pending;
    assert.equal(p.w.document.getElementById('password').value,'');
    assert.ok(p.w.document.body.classList.contains('platform-mode'));
    assert.ok(p.w.document.getElementById('authShell').classList.contains('hidden'));
  }finally{release();p.close();}
});
test('429 displays Retry-After in both languages and blocks repeated submissions',async()=>{
  const p=await page(platform,{signedIn:false,intercept:async url=>url==='/api/auth/login'?response(429,'120'):undefined});
  try{
    fillLogin(p);await p.w.eval('login()');
    assert.match(p.w.document.getElementById('loginStatus').textContent,/2 دقيقة/);
    await p.w.eval('login()');assert.equal(p.calls.filter(c=>c.url==='/api/auth/login').length,1);
    p.w.eval("locale='fr'");await p.w.eval('login()');assert.match(p.w.document.getElementById('loginStatus').textContent,/2 min/);
  }finally{p.close();}
});
test('credentials and server errors leave usable form and persistent feedback',async()=>{
  for(const status of [401,503]){
    const p=await page(platform,{signedIn:false,intercept:async url=>url==='/api/auth/login'?response(status):undefined});
    try{
      fillLogin(p);await p.w.eval('login()');
      assert.match(p.w.document.getElementById('loginStatus').textContent,status===401?/بيانات الدخول/:/الاتصال/);
      assert.equal(p.w.document.getElementById('loginBtn').disabled,false);
      assert.equal(p.w.document.getElementById('loginBtn').hasAttribute('aria-busy'),false);
    }finally{p.close();}
  }
});
test('unresponsive authentication is aborted at its deadline',async()=>{
  const p=await page(platform);
  try{
    p.w.fetch=(_url,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new p.w.DOMException('Timeout','AbortError'))));
    await assert.rejects(p.w.eval("authApi('/api/auth/me',{},10)"),{name:'AbortError'});
  }finally{p.close();}
});
test('director association uses one request and does not ask for an existing password',async()=>{
  let payload,release;const gate=new Promise(resolve=>{release=resolve;});
  const p=await page(platform,{intercept:async(url,options)=>{
    if(url==='/api/platform/schools/school-fixture/director'){payload=JSON.parse(options.body);await gate;return response(200);}
  }});
  try{
    p.w.eval("openDirectorForm('school-fixture','<school>')");
    const form=p.w.document.getElementById('directorAccountForm');
    assert.equal(form.querySelector('school'),null);
    form.elements.mode.value='existing';form.elements.mode.dispatchEvent(new p.w.Event('change'));
    assert.equal(form.elements.password.disabled,true);assert.equal(form.elements.password.value,'');
    form.elements.login.value='existing-user';
    const event={preventDefault(){}};const first=form.onsubmit(event);await form.onsubmit(event);
    assert.deepEqual(payload,{mode:'existing',login:'existing-user'});
    assert.equal(p.calls.filter(c=>c.url.endsWith('/director')).length,1);
    release();await first;assert.equal(p.w.document.getElementById('modalBody').childElementCount,0);
  }finally{release();p.close();}
});
test('bulk entry validates blanks and maximum, preserves scope and prevents duplicate saves',async()=>{
  let release,payload;const gate=new Promise(resolve=>{release=resolve;});
  const p=await page({id:'director',login:'director',fullName:'Director',roles:['DIRECTOR'],schoolId:'school'},{intercept:async(url,options)=>{
    const json=data=>({ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>data});
    if(url==='/api/classes')return json({classes:[{id:'class',name:'Class A'}]});
    if(url==='/api/classes/class/students')return json({students:[{id:'s1',full_name:'Student 1',student_uid:'A1',status:'ACTIVE'},{id:'s2',full_name:'Student 2',student_uid:'A2',status:'ACTIVE'}]});
    if(url==='/api/classes/class/subjects')return json({subjects:[{id:'math',name:'Math',max_score:20}]});
    if(url==='/api/classes/class/grades')return json({grades:[]});
    if(url.endsWith('/grades/bulk')){payload=JSON.parse(options.body);await gate;return json({grades:payload.grades.map((g,i)=>({id:'g'+i,student_id:g.studentId,score:g.score,version:1}))});}
  }});
  try{
    p.w.document.getElementById('classSelect').value='class';await p.w.eval('loadAcademicScope()');
    p.w.document.getElementById('subjectSelect').value='math';p.w.eval('renderGradeGrid()');
    const field=p.w.document.querySelector('[data-score="s1"]');
    field.value='21';await p.w.eval('saveBulkGrades()');assert.equal(payload,undefined);
    field.value='١٥٫٥';const pending=p.w.eval('saveBulkGrades()');await p.w.eval('saveBulkGrades()');
    assert.equal(p.calls.filter(c=>c.url.endsWith('/grades/bulk')).length,1);
    assert.deepEqual(payload.grades,[{studentId:'s1',score:15.5,version:0}]);
    release();await pending;
    assert.equal(p.w.document.getElementById('subjectSelect').value,'math');
    assert.equal(p.w.document.querySelector('[data-score="s2"]').value,'');
    field.value='';await p.w.eval('saveBulkGrades()');assert.match(p.w.document.getElementById('gradeFeedback').textContent,/لا تُحذف/);
  }finally{release();p.close();}
});
