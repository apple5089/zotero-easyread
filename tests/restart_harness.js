const originalStartup = startup;
startup = async function(args) {
  const report={checks:[],zoteroVersion:Zotero.version};
  let owner;
  try {
    await originalStartup(args); await Zotero.uiReadyPromise;
    owner=ZoteroEasyRead;
    Zotero.Prefs.set(owner.prefs+"home",PathUtils.join(TEST_ROOT,"easyread-home"),true);
    if(Object.keys(owner.registry.attachments).length!==2)throw new Error("Persistent attachment map not restored");
    report.checks.push("attachment mappings restored after restart");
    await owner.syncAll();
    const keys=Object.values(owner.registry.notes).map(n=>n.noteKey).sort().join();
    await owner.syncAll();
    if(Object.values(owner.registry.notes).map(n=>n.noteKey).sort().join()!==keys)throw new Error("Unchanged notes recreated after restart");
    report.checks.push("existing managed notes reused after restart");
    const window=Zotero.getMainWindow();
    const popup=window.document.getElementById("zotero-itemmenu");
    const record=Object.values(owner.registry.attachments)[0];
    const attachment=await Zotero.Items.getByLibraryAndKeyAsync(record.libraryID,record.attachmentKey);
    await window.ZoteroPane.selectItems([attachment.id]);
    await window.ZoteroPane.buildItemContextMenu();
    popup.openPopupAtScreen(50,50,true);await Zotero.Promise.delay(300);
    report.menuIDs=owner.menus;
    // Zotero groups a plugin's commands into a lazy submenu.
    for (const sub of popup.querySelectorAll('menupopup')) {
      sub.dispatchEvent(new window.Event('popupshowing'));
    }
    await Zotero.Promise.delay(200);
    const labels=Array.from(popup.querySelectorAll('menuitem')).map(e=>e.label);
    report.labels=labels;
    for(const label of ["用 EasyRead 阅读","发送到 EasyRead（批量，先不翻译）","同步 EasyRead 阅读笔记"]) {
      if(!labels.includes(label))throw new Error("Missing context menu: "+label);
    }
    popup.hidePopup();report.checks.push("all three context menu labels rendered in Zotero 10");
    const encoded=EasyReadCore.link(record.libraryID,record.attachmentKey,"test-p1");
    // Test the protocol's link parser without changing real desktop state.
    if(EasyReadCore.parseLink(encoded).key!==record.attachmentKey)throw new Error("Protocol link mismatch");
    const qa = JSON.parse(await IOUtils.readUTF8(PathUtils.join(TEST_ROOT,"desktop-test.json")));
    const oldHome=owner.home();
    Zotero.Prefs.set(owner.prefs+"home",qa.home,true);
    Zotero.Prefs.set(owner.prefs+"executable",qa.exe,true);
    const conn=await owner.connect();
    const files=await owner.prepare([attachment]);
    const imported=await owner.ensurePaper(files[0],conn,false);
    await owner.navigate(conn,imported.id,"test-p1");
    let ack=await owner.readJSON(PathUtils.join(qa.home,"zotero-bridge","ack.json"));
    if(!ack.ok||ack.id!==imported.id||!ack.url.endsWith("#b-test-p1"))throw new Error("Native desktop navigation failed");
    report.checks.push("real Electron desktop opens selected PDF and paragraph");
    await owner.openLink(encoded);
    ack=await owner.readJSON(PathUtils.join(qa.home,"zotero-bridge","ack.json"));
    if(!ack.ok||ack.id!==imported.id)throw new Error("Reading deep link failed");
    report.checks.push("saved reading link reopens actual desktop PDF");
    Zotero.Prefs.set(owner.prefs+"home",oldHome,true);
    report.desktopNavigation=ack;
    report.ok=true;
  } catch(error){report.ok=false;report.error=String(error);report.stack=error.stack;}
  finally {if(owner)Zotero.Prefs.set(owner.prefs+"home",PathUtils.join(TEST_ROOT,"easyread-home"),true);}
  await IOUtils.writeUTF8(PathUtils.join(TEST_ROOT,"restart-report.json"),JSON.stringify(report,null,2));
  Services.startup.quit(Components.interfaces.nsIAppStartup.eAttemptQuit);
};
