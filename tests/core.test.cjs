const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const core = require('../zotero/core.js');
const desktop = require('../desktop/zotero-bridge.cjs');

const source = {id:'abc123abc123',libraryID:1,attachmentKey:'ABCD1234',title:'论文 <script>alert(1)</script>'};
const state = {paper:{meta:{},blocks:[{id:'p1',page:3,en:'English context'},{id:'p2',page:4,en:'Second'}]},
  reader:{paper_note:{body:'整篇心得'},notes:{a:{id:'a',kind:'note',anchor:'p2',body:'第二段'},b:{id:'b',kind:'highlight',anchor:'p1',quote:'中文摘录 <img onerror=alert(1)>',color:'yellow'},c:{id:'c',deleted:true,body:'删除内容'}}},
  discussion:{entries:[{id:'d',kind:'qa',anchor:'p1',body:'AI 辅助回答'}]},chat:{threads:[{messages:[{content:'私有未选聊天'}]}]}};

test('notes include page, source paragraph, selected AI, and stable deep link',()=>{
  const html=core.render(state,source);
  assert.match(html,/第 3 页/); assert.match(html,/English context/); assert.match(html,/AI 辅助回答/);
  assert.match(html,/zotero:\/\/easyread\/1\/ABCD1234\?anchor=p1/);
  assert.ok(html.indexOf('中文摘录')<html.indexOf('第二段'));
  assert.doesNotMatch(html,/删除内容|私有未选聊天/);
  assert.equal(html,core.render(JSON.parse(JSON.stringify(state)),source));
});
test('untrusted input remains escaped and includes no executable markup',()=>{
  const html=core.render(state,source); assert.doesNotMatch(html,/<script>|<img /);
  assert.match(html,/&lt;script&gt;/); assert.match(html,/&lt;img onerror/);
});
test('AI/context can be excluded without losing user notes',()=>{
  const html=core.render(state,source,{includeAI:false,englishContext:false});
  assert.doesNotMatch(html,/AI 辅助回答|English context/); assert.match(html,/整篇心得|中文摘录/);
});
test('validate local addresses, IDs, and parse encoded paragraph links',()=>{
  assert.ok(core.validBase('http://127.0.0.1:60452'));
  for(const v of ['https://127.0.0.1:1','http://evil.test:80','http://127.0.0.1:65536','http://127.0.0.1:12/path']) assert.ok(!core.validBase(v));
  assert.ok(!core.validID('../file'));
  assert.deepEqual(core.parseLink(core.link(2,'ABCD1234','p1#caption')),{libraryID:2,key:'ABCD1234',anchor:'p1#caption'});
  assert.throws(()=>core.parseLink('zotero://easyread/1/../x'));
});
test('desktop rejects stale, remote, and malformed requests',()=>{
  const req={schema:1,nonce:'a'.repeat(32),id:source.id,anchor:'p1',url:'http://127.0.0.1:54321',at:1000000};
  assert.ok(desktop.validRequest(req,1000000));
  assert.ok(!desktop.validRequest({...req,id:'../config'},1000000));
  assert.ok(!desktop.validRequest({...req,url:'http://evil.test:123'},1000000));
  assert.ok(!desktop.validRequest(req,1200001));
});
test('desktop navigates current window, acknowledges exactly once, and blocks another service',async()=>{
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'easyread-bridge-test-'));
  const directory=path.join(home,'zotero-bridge'); fs.mkdirSync(directory);
  const loads=[], events={};
  const window={isDestroyed:()=>false,isMinimized:()=>true,restore(){},show(){},focus(){},async loadURL(url){loads.push(url);}};
  const req={schema:1,nonce:'a'.repeat(32),id:source.id,anchor:'p1#caption',url:'http://127.0.0.1:54321',at:Date.now()};
  fs.writeFileSync(path.join(directory,'open.json'),JSON.stringify(req));
  const control=desktop.start({app:{once:(event,fn)=>events[event]=fn},fs,path,os,home,getWindow:()=>window,getUrl:()=>req.url,createWindow:async()=>{}});
  await new Promise(r=>setTimeout(r,20)); await control.tick();
  assert.deepEqual(loads,[req.url+'/read/'+source.id+'#b-p1']);
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory,'ack.json'))).ok,true);
  fs.writeFileSync(path.join(directory,'open.json'),JSON.stringify({...req,nonce:'b'.repeat(32),url:'http://127.0.0.1:12345'}));
  await control.tick(); assert.equal(loads.length,1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory,'ack.json'))).ok,false);
  control.stop(); fs.rmSync(home,{recursive:true,force:true});
});
