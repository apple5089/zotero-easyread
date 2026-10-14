const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const fs=require('node:fs'),path=require('node:path');
const core=require('../zotero/core.js');
function bridge(prefs={},http=async()=>{throw {status:404};},mac=false) {
  const calls=[],launched=[],reads=[];
  const ctx={EasyReadCore:core,Components:{interfaces:{nsIFile:{}}},
    PathUtils:mac?{join:path.posix.join,parent:path.posix.dirname}:{join:path.win32.join,parent:path.win32.dirname},
    Services:{env:{get:()=> 'C:\\Program Files'},dirsvc:{get:()=>({path:'C:\\User'})}},
    IOUtils:{exists:async()=>true},
    Zotero:{isMac:mac,Prefs:{get:key=>prefs[key.replace('extensions.zotero-easyread.','')]},
      HTTP:{request:async(method,url)=>{calls.push(url);return http(url);}},
      Utilities:{Internal:{exec:async(exe,args)=>launched.push({exe,args})}},
      logError(){},launchURL:url=>launched.push({url})}};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../zotero/bridge.js'),'utf8'),ctx);
  return {owner:ctx.ZoteroEasyRead,ctx,calls,launched,reads};
}
test('detect migrated install data when old configured directory disappears',async()=>{
  const b=bridge({home:'C:\\Old',executable:'D:\\Apps\\EasyRead\\EasyRead.exe'},async url=>({response:url.endsWith('/api/version')?{api:1,version:'1.3.2'}:{items:[],token:'fixture'}}));
  b.owner.readJSON=async file=>file==='D:\\Apps\\EasyRead\\data\\.server.json'?{url:'http://127.0.0.1:52341'}:{};
  const conn=await b.owner.probe();assert.equal(conn.home,'D:\\Apps\\EasyRead\\data');assert.equal(conn.api,1);
  assert.equal(b.owner.home(),conn.home);
});
test('preserve explicit live custom directory and support older servers',async()=>{
  const b=bridge({home:'E:\\Custom'},async url=>{if(url.endsWith('/api/version'))throw {status:404};return {response:{items:[],token:'fixture'}};});
  b.owner.readJSON=async()=>({url:'http://127.0.0.1:52341'});
  const conn=await b.owner.probe();assert.equal(conn.home,'E:\\Custom');assert.equal(conn.api,0);
});
test('reject unsupported API before importing or syncing',async()=>{
  const b=bridge({},async()=>({response:{api:2}}));b.owner.readJSON=async()=>({url:'http://127.0.0.1:52341'});
  await assert.rejects(b.owner.probe(),/API 版本不兼容/);assert.equal(b.calls.length,1);
});
test('official desktop link uses fingerprint and paragraph without archive inbox',async()=>{
  const b=bridge({executable:'D:\\Apps\\EasyRead\\EasyRead.exe'});
  b.owner.writeJSON=()=>{throw new Error('Legacy bridge should not be used');};
  await b.owner.navigate({api:1,url:'http://127.0.0.1:52341'},'abcdef123456','p3-2#selection','a'.repeat(64));
  assert.equal(b.launched[0].args[0],'easyread://open?sha256='+'a'.repeat(64)+'&block=p3-2');
  assert.throws(()=>core.officialOpen('abcdef123456','p1&url=https'),/段落/);
  assert.throws(()=>core.officialOpen('abcdef123456','','bad'),/指纹/);
});
test('read only documented parts and never the side-effecting state endpoint',async()=>{
  const b=bridge();const calls=[];
  b.owner.request=async(_conn,url)=>{calls.push(url);return {data:url.endsWith('/paper')?{meta:{}}:{}};};
  const state=await b.owner.readingState({},'abcdef123456');assert.ok(state.paper.meta);
  assert.equal(calls.length,3);assert.ok(calls.every(url=>url.includes('/part/')));
  b.ctx.Zotero.Prefs.get=key=>key.endsWith('includeAI')?false:undefined;
  calls.length=0;await b.owner.readingState({},'abcdef123456');assert.equal(calls.length,2);
});
test('batch import focuses native application without opening a browser tab',async()=>{
  const b=bridge();await b.owner.navigate({api:1,url:'http://127.0.0.1:52341'},'');
  assert.equal(b.launched.length,1);assert.equal(b.launched[0].args.length,0);
});
test('macOS opens the .app bundle through open -a, blank settings use the default',async()=>{
  const b=bridge({executable:''},undefined,true);
  await b.owner.navigate({api:1,url:'http://127.0.0.1:52341'},'abcdef123456','p3-2','a'.repeat(64));
  assert.equal(b.launched[0].exe,'/usr/bin/open');
  assert.deepEqual([...b.launched[0].args],['-a','/Applications/EasyRead.app','easyread://open?sha256='+'a'.repeat(64)+'&block=p3-2']);
});
