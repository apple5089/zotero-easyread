const originalStartup = startup;
startup = async function(args) {
  try { await originalStartup(args); setTimeout(() => runNativeTests(),100); }
  catch (error) { await IOUtils.writeUTF8(PathUtils.join(TEST_ROOT,"native-report.json"),JSON.stringify({error:String(error),stack:error.stack})); }
};
async function runNativeTests() {
  const report={zoteroVersion:Zotero.version,checks:[]};
  const check=(name,value)=>{if(!value)throw new Error("FAILED: "+name);report.checks.push(name);};
  const owner=ZoteroEasyRead;
  try {
    await Zotero.uiReadyPromise;
    check("official context and tools menus registered",owner.menus.length===2&&owner.menus.every(Boolean));
    check("custom reading protocol registered",!!owner.protocol._extensions['zotero://easyread']);
    const article=new Zotero.Item("journalArticle");article.setField("title","Native integration test");await article.saveTx();
    const attachment=await Zotero.Attachments.importFromFile({file:PathUtils.join(TEST_ROOT,"fixtures","alpha.pdf"),parentItemID:article.id});
    let files=await owner.prepare([article,attachment]);check("parent and attachment selection deduplicated",files.length===1);
    const conn=await owner.connect();const first=await owner.ensurePaper(files[0],conn,false);
    const second=await owner.ensurePaper(files[0],conn,false);check("repeated send reuses PDF",first.id===second.id);
    article.setField("title","Renamed article");await article.saveTx();files=await owner.prepare([article]);
    check("renaming does not break association",(await owner.ensurePaper(files[0],conn,false)).id===first.id);
    for(let n=0;n<60;n++) {
      const result=await owner.request(conn,`/api/p/${first.id}/part/paper`);
      if(result.data.meta.pages?.length)break;await Zotero.Promise.delay(250);
    }
    const paperPath=PathUtils.join(owner.home(),"library",first.id,"paper.json");
    const paper=await owner.readJSON(paperPath);
    paper.blocks=[{id:"test-p1",type:"para",page:1,en:"Original English source",zh:"测试中文译文"}];
    await owner.writeJSON(paperPath,paper);
    const at=new Date().toISOString();
    await owner.request(conn,`/api/p/${first.id}/ops`,{client:"test",ops:[
      {op:"note",note:{id:"n-test",anchor:"test-p1",key:"test-p1",quote:"测试摘录 <script>alert(1)</script>",kind:"note",color:"yellow",body:"第一条心得",created:at,updated:at},at},
      {op:"paper_note",body:"整篇阅读心得",at}
    ]});
    await owner.writeJSON(PathUtils.join(owner.home(),"library",first.id,"discussion.json"),{schema:2,entries:[{id:"d-test",anchor:"test-p1",kind:"qa",title:"保存的回答",body:"AI 解释",at}]});
    let state=await owner.request(conn,`/api/p/${first.id}/state`);
    check("EasyRead note operations persisted",Object.values(state.reader.notes).some(x=>x.body==="第一条心得"));
    const created=await owner.saveNote(files[0],first,state);check("reading note created",created.changed);
    check("unchanged sync creates no duplicate",!(await owner.saveNote(files[0],first,state)).changed);
    let noteIDs=article.getNotes();check("one child note after repeated sync",noteIDs.length===1);
    let note=Zotero.Items.get(noteIDs[0]);
    check("Chinese notes, page and selected AI saved",note.getNote().includes("第一条心得")&&note.getNote().includes("第 1 页")&&note.getNote().includes("AI 解释"));
    check("HTML input safely escaped",!note.getNote().includes("<script>"));
    check("stable reading link saved",note.getNote().includes("zotero://easyread/"));
    const later=new Date(Date.now()+1000).toISOString();
    await owner.request(conn,`/api/p/${first.id}/ops`,{client:"test",ops:[{op:"note",note:{id:"n-test",anchor:"test-p1",key:"test-p1",kind:"note",body:"更新后的心得",updated:later},at:later}]});
    state=await owner.request(conn,`/api/p/${first.id}/state`);await owner.saveNote(files[0],first,state);
    check("changed EasyRead note updates same child",article.getNotes().length===1&&note.getNote().includes("更新后的心得"));
    note.setNote(note.getNote()+"<p>MANUAL USER EDIT</p>");await note.saveTx();
    const preserved=await owner.saveNote(files[0],first,state);
    check("manual edits preserved in separate version",preserved.preserved&&article.getNotes().length===2&&note.getNote().includes("MANUAL USER EDIT"));
    const deletedAt=new Date(Date.now()+2000).toISOString();
    await owner.request(conn,`/api/p/${first.id}/ops`,{client:"test",ops:[{op:"note_del",id:"n-test",at:deletedAt}]});
    state=await owner.request(conn,`/api/p/${first.id}/state`);await owner.saveNote(files[0],first,state);
    const record=owner.registry.notes[`${files[0].libraryID}:${article.key}:${first.sha256}`];
    const managed=await Zotero.Items.getByLibraryAndKeyAsync(files[0].libraryID,record.noteKey);
    check("deleted source note disappears from generated note",!managed.getNote().includes("更新后的心得"));
    const beta=new Zotero.Item("journalArticle");beta.setField("title","Same title, different PDF");await beta.saveTx();
    const betaAtt=await Zotero.Attachments.importFromFile({file:PathUtils.join(TEST_ROOT,"fixtures","beta.pdf"),parentItemID:beta.id});
    const betaFiles=await owner.prepare([betaAtt]);const betaResult=await owner.ensurePaper(betaFiles[0],conn,false);
    check("different PDFs have different identities",first.id!==betaResult.id);
    const live=(await owner.request(conn,"/api/library")).items;
    check("exactly two PDFs imported",live.length===2);
    check("fingerprints stored in durable registry",Object.keys((await owner.readJSON(owner.registryPath())).attachments).length===2);
    report.ok=true;report.paperIDs=[first.id,betaResult.id];report.childNotes=article.getNotes().length;
  } catch(error) {report.ok=false;report.error=String(error);report.stack=error.stack;}
  await IOUtils.writeUTF8(PathUtils.join(TEST_ROOT,"native-report.json"),JSON.stringify(report,null,2));
  Services.startup.quit(Components.interfaces.nsIAppStartup.eAttemptQuit);
}
