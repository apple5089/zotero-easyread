/* SPDX-License-Identifier: MIT. Loaded by the patched EasyRead main process. */
"use strict";

function validRequest(value, now = Date.now()) {
  return value && value.schema === 1 && /^[a-f0-9]{32}$/.test(value.nonce || "")
    && (value.id === "" || /^[A-Za-z0-9_-]{4,64}$/.test(value.id || ""))
    && typeof value.anchor === "string" && value.anchor.length <= 256
    && /^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(value.url || "")
    && Number.isFinite(value.at) && value.at <= now + 5000 && now - value.at < 120000;
}

function start({ app, fs, path, os, getWindow, getUrl, createWindow, home }) {
  const directory = path.join(home || process.env.EASYREAD_HOME || path.join(os.homedir(), "EasyRead"), "zotero-bridge");
  fs.mkdirSync(directory, {recursive:true});
  let busy = false, lastNonce = "", closing = false;
  const write = (name, data) => {
    const target = path.join(directory, name);
    fs.writeFileSync(target + ".tmp", JSON.stringify(data), "utf8");
    fs.renameSync(target + ".tmp", target);
  };
  async function tick() {
    if (busy || closing) return;
    busy = true;
    let request;
    try {
      const base = getUrl();
      if (!base || !getWindow()) return;
      // Also useful for installation verification; contains no API credentials.
      write("desktop.json", {version:"0.1.0",pid:process.pid,url:base,at:Date.now()});
      const file = path.join(directory, "open.json");
      if (!fs.existsSync(file) || fs.statSync(file).size > 4096) return;
      request = JSON.parse(fs.readFileSync(file, "utf8"));
      if (!validRequest(request) || request.nonce === lastNonce) return;
      lastNonce = request.nonce;
      if (request.url !== base) throw new Error("Zotero 连接的服务与桌面窗口不一致，请重新发送论文。");
      await createWindow();
      const window = getWindow();
      if (!window || window.isDestroyed()) throw new Error("EasyRead 窗口未就绪。");
      const hash = request.anchor ? "#b-" + encodeURIComponent(request.anchor.split("#")[0]) : "";
      const url = base + (request.id ? "/read/" + request.id : "/") + hash;
      // Same document still reloads to honor the paragraph link and saved progress.
      await window.loadURL(url);
      if (window.isMinimized()) window.restore();
      window.show(); window.focus();
      write("ack.json", {nonce:request.nonce,ok:true,id:request.id,url,at:Date.now()});
    } catch (error) {
      if (request && /^[a-f0-9]{32}$/.test(request.nonce || "")) {
        try { write("ack.json", {nonce:request.nonce,ok:false,error:String(error.message).slice(0,300),at:Date.now()}); } catch (_) {}
      }
    } finally { busy = false; }
  }
  const timer = setInterval(tick, 500);
  timer.unref();
  app.once("before-quit", () => {closing = true; clearInterval(timer);});
  void tick();
  return {tick,stop(){closing=true;clearInterval(timer);}};
}

module.exports = {start,validRequest};
