/* SPDX-License-Identifier: MIT */
var ZoteroEasyRead = {
  pluginID: "zotero-easyread@local.research",
  version: "0.1.1",
  menus: [],
  busy: false,
  prefs: "extensions.zotero-easyread.",

  defaultExecutable() {
    if (Zotero.isMac) return "/Applications/EasyRead.app";
    return PathUtils.join(Services.env.get("ProgramFiles") || "C:\\Program Files", "EasyRead", "EasyRead.exe");
  },

  // Path settings default to "" (prefs.js), which means "use the default".
  pref(key, fallback) { const value = Zotero.Prefs.get(this.prefs + key, true); return (value ?? "") === "" ? fallback : value; },
  legacyHome() { return PathUtils.join(Services.dirsvc.get("Home", Components.interfaces.nsIFile).path, "EasyRead"); },
  home() { return this.resolvedHome || this.pref("home", this.legacyHome()); },
  homeCandidates() {
    const executable = this.pref("executable", this.defaultExecutable());
    return [...new Set([this.pref("home",this.legacyHome()),PathUtils.join(PathUtils.parent(executable),"data"),this.legacyHome()].filter(Boolean))];
  },
  bridgeDir() { return PathUtils.join(this.home(), "zotero-bridge"); },
  registryPath() { return PathUtils.join(Zotero.Profile.dir, "zotero-easyread.json"); },
  async readJSON(path, fallback = null) {
    try { return JSON.parse(await IOUtils.readUTF8(path)); }
    catch (error) { if (fallback !== null) return fallback; throw error; }
  },
  async writeJSON(path, data) {
    await IOUtils.makeDirectory(PathUtils.parent(path), {ignoreExisting:true});
    await IOUtils.writeUTF8(path, JSON.stringify(data, null, 2), {tmpPath: path + ".tmp"});
  },
  sha(bytes) {
    const hash = Components.classes["@mozilla.org/security/hash;1"].createInstance(Components.interfaces.nsICryptoHash);
    hash.init(hash.SHA256); hash.update(bytes, bytes.length);
    return Array.from(hash.finish(false), c => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
  },
  hashHTML(html) { return this.sha(new TextEncoder().encode(html)); },
  async start() {
    this.alive = true;
    this.registry = await IOUtils.exists(this.registryPath()) ? await this.readJSON(this.registryPath()) : {schema:1,attachments:{},notes:{}};
    if (this.registry.schema !== 1 || !this.registry.attachments || !this.registry.notes) throw new Error("EasyRead 关联记录格式不兼容。");
    const menu = (label, action, needsSelection = true) => ({
      menuType: "menuitem",
      onShowing: (_event, context) => {
        context.menuElem.label = label;
        context.setEnabled(!this.busy && (!needsSelection || (context.items || Zotero.getMainWindow()?.ZoteroPane.getSelectedItems() || []).length > 0));
      },
      onCommand: (_event, context) => this.run(action, context.items || Zotero.getMainWindow().ZoteroPane.getSelectedItems())
    });
    this.menus.push(Zotero.MenuManager.registerMenu({menuID:"easyread-context",pluginID:this.pluginID,target:"main/library/item",menus:[
      menu("用 EasyRead 阅读", "open"), menu("发送到 EasyRead（批量，先不翻译）", "batch"), menu("同步 EasyRead 阅读笔记", "sync")
    ]}));
    this.menus.push(Zotero.MenuManager.registerMenu({menuID:"easyread-tools",pluginID:this.pluginID,target:"main/menubar/tools",menus:[
      menu("EasyRead：同步所有已关联笔记", "syncAll", false), menu("EasyRead：连接设置…", "settings", false)
    ]}));
    this.protocol = Services.io.getProtocolHandler("zotero").wrappedJSObject;
    const owner = this;
    this.protocolExtension = {loadAsChrome:false, newChannel(uri) {
      owner.openLink(uri.spec).catch(error => owner.alert(error.message));
      return undefined;
    }};
    this.protocol._extensions["zotero://easyread"] = this.protocolExtension;
    if (this.menus.some(id => !id)) throw new Error("EasyRead 菜单注册失败。");
    // Settings live in Zotero → Settings → EasyRead; the Tools menu entry opens that pane.
    this.paneID = await Zotero.PreferencePanes.register({pluginID:this.pluginID,src:"prefs.xhtml",label:"EasyRead"});
    await this.writeJSON(PathUtils.join(Zotero.Profile.dir,"zotero-easyread-status.json"),{
      ready:true,version:this.version,zoteroVersion:Zotero.version,menus:this.menus,started:new Date().toISOString()
    });
  },
  stop() {
    this.alive = false;
    for (const id of this.menus) Zotero.MenuManager.unregisterMenu(id);
    this.menus = [];
    if (this.protocol?._extensions["zotero://easyread"] === this.protocolExtension) delete this.protocol._extensions["zotero://easyread"];
  },
  alert(message) { Services.prompt.alert(Zotero.getMainWindow(), "Zotero → EasyRead", String(message)); },
  async run(action, items) {
    if (action === "settings") return this.settings();
    if (this.busy) return this.alert("已有 EasyRead 任务正在处理，请稍候。");
    this.busy = true;
    const progress = new Zotero.ProgressWindow({closeOnClick:true});
    progress.changeHeadline("Zotero → EasyRead");
    progress.addDescription(action.startsWith("sync") ? "正在同步阅读笔记…" : "正在连接 EasyRead…");
    progress.show();
    try {
      let result;
      if (action === "syncAll") result = await this.syncAll();
      else {
        const files = await this.prepare(items);
        if (action === "sync") result = await this.sync(files);
        else {
          if (action === "open" && files.length > 1) throw new Error("直接阅读请选中一篇论文。多篇请使用“发送到 EasyRead（批量，先不翻译）”。");
          const conn = await this.connect();
          const imported = [];
          for (const file of files) imported.push(await this.ensurePaper(file, conn, action === "open" && this.pref("translate", true)));
          await this.navigate(conn, action === "open" ? imported[0].id : "", "", action === "open" ? imported[0].sha256 : "");
          result = `已发送 ${imported.length} 篇${action === "batch" ? "，未自动翻译，可在 EasyRead 中选择翻译" : "，已打开 EasyRead"}。`;
        }
      }
      progress.addDescription(result); progress.startCloseTimer(6000);
    } catch (error) {
      progress.close(); Zotero.logError(error); this.alert(error.message || error);
    } finally { this.busy = false; }
  },
  async request(conn, endpoint, body = undefined, contentType = "application/json") {
    if (!EasyReadCore.validBase(conn.url) || !endpoint.startsWith("/api/")) throw new Error("无效的本地 EasyRead 接口。");
    const options = {responseType:"json",timeout:120000,followRedirects:false,errorDelayMax:0,logBodyLength:0};
    if (body !== undefined) {
      options.body = contentType === "application/pdf" ? body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) : JSON.stringify(body);
      options.headers = {"Content-Type":contentType,"X-Token":conn.token};
    }
    try {
      const response = await Zotero.HTTP.request(body === undefined ? "GET" : "POST", conn.url + endpoint, options);
      return response.response;
    } catch (error) {
      const message = error.xmlhttp?.response?.error;
      throw new Error(message || `无法访问 EasyRead（${error.status || error.message || "连接失败"}）。请检查 EasyRead 是否已打开。`);
    }
  },
  async probe() {
    for (const home of this.homeCandidates()) {
      const info = await this.readJSON(PathUtils.join(home, ".server.json"), {});
      if (!EasyReadCore.validBase(info.url)) continue;
      const options = {responseType:"json",timeout:2500,followRedirects:false};
      let api = 0, version = "";
      try {
        const response = await Zotero.HTTP.request("GET",info.url + "/api/version",options);
        if (response.response?.api !== 1) throw new Error("EasyRead API 版本不兼容，请更新 Zotero EasyRead 插件。");
        api = 1; version = response.response.version || "";
      } catch (error) {
        if (error.message?.includes("API 版本不兼容")) throw error;
        if (error.status !== 404) continue; // EasyRead 1.3.0 did not expose /api/version.
      }
      try {
        const response = await Zotero.HTTP.request("GET",info.url + "/api/library",options);
        const library = response.response;
        if (!library?.token || !Array.isArray(library.items)) continue;
        this.resolvedHome = home;
        return {url:info.url,token:library.token,library,home,api,version};
      } catch (_) {}
    }
    return null;
  },
  // Pass a path and arguments, never evaluate a shell command. A macOS .app bundle is a folder, so it goes through `open -a`.
  async execApp(args) {
    const executable = this.pref("executable", this.defaultExecutable());
    if (Zotero.isMac) return Zotero.Utilities.Internal.exec("/usr/bin/open", ["-a", executable, ...args]);
    return Zotero.Utilities.Internal.exec(executable, args);
  },
  launch() { this.execApp([]).catch(error => Zotero.logError(error)); },
  async connect() {
    let conn = await this.probe();
    if (conn) return conn;
    const executable = this.pref("executable", this.defaultExecutable());
    if (!await IOUtils.exists(executable)) throw new Error("找不到 EasyRead 程序，请在“工具 → EasyRead：连接设置”中设置路径。");
    this.launch();
    for (let i = 0; i < 60 && this.alive; i++) {
      await Zotero.Promise.delay(500); conn = await this.probe(); if (conn) return conn;
    }
    throw new Error("EasyRead 启动超时。请手动打开 EasyRead 后重试。");
  },
  async prepare(items) {
    const attachments = new Map(), missing = [];
    for (const item of items) {
      if (item?.deleted) continue;
      if (item?.isAttachment() && item.attachmentContentType === "application/pdf") attachments.set(item.id, item);
      else if (item?.isRegularItem()) {
        const candidates = item.getAttachments().map(id => Zotero.Items.get(id)).filter(a => a && !a.deleted && a.attachmentContentType === "application/pdf");
        const best = candidates.length ? await item.getBestAttachment() : null;
        if (!candidates.length) { missing.push(item.getField("title")); continue; }
        const attachment = candidates.find(a => a.id === best?.id) || candidates[0];
        attachments.set(attachment.id, attachment);
      }
    }
    if (missing.length) throw new Error("以下文献没有 PDF：\n" + missing.join("\n"));
    if (!attachments.size) throw new Error("请选中论文或 PDF 附件。");
    if (attachments.size > 20) throw new Error("每批最多发送 20 篇论文，请分批选择。");
    const files = [];
    for (const attachment of attachments.values()) {
      const path = await attachment.getFilePathAsync();
      if (!path || !await IOUtils.exists(path)) throw new Error("部分 PDF 尚未下载到本机，请先在 Zotero 下载附件。");
      const stat = await IOUtils.stat(path);
      if (stat.size > 200 * 1024 * 1024) throw new Error("单篇 PDF 超过 EasyRead 的 200 MB 导入上限。");
      const header = await IOUtils.read(path, {maxBytes:5});
      if (String.fromCharCode(...header) !== "%PDF-") throw new Error("所选附件不是有效的 PDF。");
      const parent = attachment.parentID ? Zotero.Items.get(attachment.parentID) : null;
      files.push({attachment, parent, path, stat, libraryID:attachment.libraryID, attachmentKey:attachment.key,
        mapKey:`${attachment.libraryID}:${attachment.key}`, title:parent?.getField("title") || attachment.getField("title"), filename:PathUtils.filename(path)});
    }
    return files;
  },
  async fingerprint(file) {
    const bytes = await IOUtils.read(file.path);
    const stat = await IOUtils.stat(file.path);
    if (stat.size !== file.stat.size || stat.lastModified !== file.stat.lastModified) throw new Error("PDF 在发送时发生变化，请重试。");
    return {bytes, sha256:this.sha(bytes)};
  },
  async ensurePaper(file, conn, translate) {
    const {bytes, sha256} = await this.fingerprint(file);
    const id = sha256.slice(0,12);
    const current = conn.library.items.find(item => item.id === id);
    if (current) {
      // Verify the full digest instead of trusting the 48-bit folder name.
      const paper = await this.request(conn, `/api/p/${id}/part/paper`);
      if (paper.data?.meta?.source_sha256 !== sha256) throw new Error("EasyRead 的 PDF 指纹不匹配，已停止自动关联。");
    } else {
      const result = await this.request(conn, "/api/import?name=" + encodeURIComponent(file.filename) + "&translate=" + (translate ? "1" : "0"), bytes, "application/pdf");
      if (result.id !== id) throw new Error("EasyRead 返回的论文标识与 PDF 指纹不一致。");
      conn.library.items.push({id});
    }
    this.registry.attachments[file.mapKey] = {id,sha256,parentKey:file.parent?.key || null,libraryID:file.libraryID,attachmentKey:file.attachmentKey,title:file.title};
    await this.writeJSON(this.registryPath(), this.registry);
    return {id,sha256};
  },
  async navigate(conn, id, anchor = "", sha256 = "") {
    if (id && !EasyReadCore.validID(id)) throw new Error("无效的 EasyRead 论文标识。");
    if (conn.api === 1) {
      const target = id ? EasyReadCore.officialOpen(id,anchor,sha256) : "";
      const executable = this.pref("executable",this.defaultExecutable());
      if (await IOUtils.exists(executable)) {
        try { await this.execApp(target ? ["easyread://" + target] : []); return; }
        catch (error) { Zotero.logError(error); }
      }
      Zotero.launchURL(conn.url + (target ? "/" + target : "/"));
      return;
    }
    const nonce = Services.uuid.generateUUID().toString().replace(/[{}-]/g, "");
    await this.writeJSON(PathUtils.join(this.bridgeDir(), "open.json"), {schema:1,nonce,id,anchor:String(anchor).slice(0,256),at:Date.now(),url:conn.url});
    this.launch();
    for (let i = 0; i < 24; i++) {
      await Zotero.Promise.delay(250);
      const ack = await this.readJSON(PathUtils.join(this.bridgeDir(), "ack.json"), {});
      if (ack.nonce === nonce && ack.ok) return;
      if (ack.nonce === nonce && ack.error) throw new Error("EasyRead 桌面跳转失败：" + ack.error);
    }
    // An unpatched or upgraded desktop app can still read through its local UI.
    Zotero.launchURL(conn.url + (id ? "/read/" + id : "/") + (anchor ? "#b-" + encodeURIComponent(anchor.split("#")[0]) : ""));
  },
  async openLink(spec) {
    if (this.busy) throw new Error("已有 EasyRead 任务正在处理，请稍候。");
    this.busy = true;
    try {
      const {libraryID,key,anchor} = EasyReadCore.parseLink(spec);
      const attachment = await Zotero.Items.getByLibraryAndKeyAsync(libraryID, key);
      if (!attachment || attachment.deleted || !attachment.isAttachment()) throw new Error("这条阅读链接对应的 Zotero 附件已不存在。");
      const files = await this.prepare([attachment]);
      const conn = await this.connect();
      const paper = await this.ensurePaper(files[0], conn, false);
      await this.navigate(conn, paper.id, anchor, paper.sha256);
    } finally { this.busy = false; }
  },
  async saveNote(file, mapping, state) {
    if (!file.parent) throw new Error("独立 PDF 请先关联到 Zotero 文献条目，再同步子笔记。");
    if (!Zotero.Libraries.get(file.libraryID).editable) throw new Error("该 Zotero 文献库为只读，不能回写笔记。");
    const noteMapKey = `${file.libraryID}:${file.parent.key}:${mapping.sha256}`;
    const record = this.registry.notes[noteMapKey];
    const html = EasyReadCore.render(state, {...file,id:mapping.id}, {includeAI:this.pref("includeAI",true),englishContext:this.pref("englishContext",true)});
    const sourceHash = this.hashHTML(html);
    let note = record?.noteKey ? await Zotero.Items.getByLibraryAndKeyAsync(file.libraryID, record.noteKey) : null;
    if (note && (!note.isNote() || note.deleted || note.parentID !== file.parent.id)) note = null;
    let preserved = false;
    if (note && this.hashHTML(note.getNote()) !== record.noteHash) {
      // Keep manually edited note untouched; make a new managed version even if source is unchanged.
      note = null; preserved = true;
    }
    if (note && sourceHash === record.sourceHash) return {changed:false,preserved:false};
    if (!note) {
      note = new Zotero.Item("note"); note.libraryID = file.libraryID; note.parentID = file.parent.id;
      note.addTag("EasyRead");
    }
    note.setNote(html);
    await note.saveTx({undoAction:"undo-action-edit-metadata",undoActionArgs:{count:1}});
    this.registry.notes[noteMapKey] = {noteKey:note.key,noteHash:this.hashHTML(note.getNote()),sourceHash,id:mapping.id,updated:new Date().toISOString()};
    await this.writeJSON(this.registryPath(), this.registry);
    return {changed:true,preserved};
  },
  async readingState(conn,id) {
    const parts = ["paper","reader",...(this.pref("includeAI",true) ? ["discussion"] : [])];
    const responses = await Promise.all(parts.map(part => this.request(conn,`/api/p/${id}/part/${part}`)));
    return Object.fromEntries(parts.map((part,i) => [part,responses[i]?.data || {}]));
  },
  async sync(files) {
    const conn = await this.connect();
    let changed = 0, preserved = 0; const failures = [], seen = new Set();
    for (const file of files) {
      try {
        const {sha256} = await this.fingerprint(file);
        const id = sha256.slice(0,12);
        const key = `${file.libraryID}:${file.parent?.key || file.attachmentKey}:${sha256}`;
        if (seen.has(key)) continue; seen.add(key);
        // Also supports PDFs imported manually into EasyRead before installing this plugin.
        if (!conn.library.items.some(p => p.id === id)) throw new Error("尚未在 EasyRead 中导入，请先右键“用 EasyRead 阅读”。");
        const state = await this.readingState(conn,id);
        if (state.paper?.meta?.source_sha256 !== sha256) throw new Error("PDF 指纹不一致，已停止回写。");
        const mapping = {id,sha256};
        this.registry.attachments[file.mapKey] = {...mapping,parentKey:file.parent?.key,libraryID:file.libraryID,attachmentKey:file.attachmentKey,title:file.title};
        const result = await this.saveNote(file,mapping,state);
        changed += Number(result.changed); preserved += Number(result.preserved);
      } catch (error) { failures.push(`${file.title}：${error.message}`); }
    }
    await this.writeJSON(this.registryPath(), this.registry);
    if (failures.length) throw new Error(`已更新 ${changed} 份笔记${preserved ? `，保留 ${preserved} 份手动编辑版本` : ""}。以下项目未同步：\n` + failures.join("\n"));
    return `已更新 ${changed} 份笔记，其余内容未变化${preserved ? `；保留了 ${preserved} 份手动编辑版本` : ""}。`;
  },
  async syncAll() {
    const items = [];
    for (const record of Object.values(this.registry.attachments)) {
      const item = await Zotero.Items.getByLibraryAndKeyAsync(record.libraryID,record.attachmentKey);
      if (item && !item.deleted) items.push(item);
    }
    if (!items.length) return "尚无已关联论文，请先使用“用 EasyRead 阅读”。";
    // Apply per-file checks without imposing the batch import selection limit.
    const files = [];
    for (const item of items) files.push(...await this.prepare([item]));
    return this.sync(files);
  },
  settings() { Zotero.Utilities.Internal.openPreferences(this.paneID); }
};
