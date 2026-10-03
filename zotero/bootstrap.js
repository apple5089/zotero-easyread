var EasyReadCore;
var ZoteroEasyRead;

async function startup({ rootURI }) {
  await Zotero.initializationPromise;
  Services.scriptloader.loadSubScript(rootURI + "core.js");
  Services.scriptloader.loadSubScript(rootURI + "bridge.js");
  await ZoteroEasyRead.start();
}
function shutdown() { ZoteroEasyRead?.stop(); ZoteroEasyRead = undefined; EasyReadCore = undefined; }
function install() {}
function uninstall() {}
