import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {JSDOM,VirtualConsole} from 'jsdom';

async function page(account){
  const root=new URL('../public/',import.meta.url);
  const dom=new JSDOM(fs.readFileSync(new URL('index.html',root),'utf8'),{url:'http://localhost:3100',runScripts:'outside-only',virtualConsole:new VirtualConsole()});
  let signedIn=true,failLogout=false;const calls=[];
  const w=dom.window;w.eval=source=>vm.runInContext(source,dom.getInternalVMContext());
  w.fetch=async(url,options={})=>{
    calls.push({url,method:options.method||'GET'});
    let status=200,data={};
    if(url==='/api/auth/me'){status=signedIn?200:401;data=account;}
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
  for(const file of ['app.js','structure.js','platform-navigation.js'])w.eval(fs.readFileSync(new URL(file,root),'utf8'));
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
