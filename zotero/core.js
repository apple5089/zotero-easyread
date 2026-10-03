/* SPDX-License-Identifier: MIT -- Pure data conversion, also exercised in Node. */
var EasyReadCore = {
  validID(id) { return typeof id === "string" && /^[A-Za-z0-9_-]{4,64}$/.test(id); },
  validBase(url) {
    return typeof url === "string" && /^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})$/.test(url)
      && Number(url.split(":").pop()) <= 65535;
  },
  escape(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  },
  text(value) {
    // Never insert untrusted Markdown/HTML into Zotero's note editor.
    return String(value ?? "").split(/\n\s*\n/).map(p => `<p>${this.escape(p).replace(/\n/g,"<br>")}</p>`).join("");
  },
  link(libraryID, key, anchor = "") {
    if (!Number.isInteger(libraryID) || libraryID < 1 || !/^[A-Z0-9]{8}$/.test(key)) throw new Error("无效的 Zotero 附件标识。");
    return `zotero://easyread/${libraryID}/${key}` + (anchor ? `?anchor=${encodeURIComponent(anchor)}` : "");
  },
  parseLink(spec) {
    const match = /^zotero:\/\/easyread\/(\d+)\/([A-Z0-9]{8})(?:\?anchor=([^#]*))?(?:#.*)?$/.exec(spec);
    if (!match) throw new Error("无效的 EasyRead 阅读链接。");
    const anchor = match[3] ? decodeURIComponent(match[3]) : "";
    if (anchor.length > 256) throw new Error("段落标识过长。");
    return {libraryID: Number(match[1]), key: match[2], anchor};
  },
  // No timestamps here: identical reader content produces identical HTML.
  render(state, source, options = {}) {
    if (!state?.paper || !state?.reader || !this.validID(source.id)) throw new Error("EasyRead 笔记数据尚未准备好。");
    const e = value => this.escape(value);
    const paper = state.paper, reader = state.reader;
    const blocks = new Map((paper.blocks || []).map(b => [b.id, b]));
    const order = new Map((paper.blocks || []).map((b, i) => [b.id, i]));
    const jump = anchor => `<a href="${e(this.link(source.libraryID, source.attachmentKey, anchor))}">返回 EasyRead</a>`;
    const position = anchor => {
      const b = blocks.get(String(anchor || "").split("#")[0]);
      return (b?.page ? `原 PDF 第 ${e(b.page)} 页 · ` : "") + jump(anchor || "");
    };
    let html = `<div data-schema-version="9"><h1>EasyRead 阅读笔记</h1><p>${e(source.title || paper.meta?.title_en || "论文")}</p><p>${jump("")}</p>`;
    html += "<p>本笔记由 EasyRead 同步。摘录可能来自中文译文；AI 回答标为阅读辅助。需要补充时建议另建笔记，手动编辑此笔记后再次同步会保留旧版本。</p>";
    const general = reader.paper_note?.body;
    if (general?.trim()) html += "<h2>整篇笔记</h2>" + this.text(general);
    const notes = Object.values(reader.notes || {}).filter(n => n && !n.deleted).sort((a, b) =>
      (order.get(String(a.anchor || a.key || "").split("#")[0]) ?? 1e9) - (order.get(String(b.anchor || b.key || "").split("#")[0]) ?? 1e9)
      || String(a.created || "").localeCompare(String(b.created || "")) || String(a.id).localeCompare(String(b.id)));
    if (notes.length) html += "<h2>划线与批注</h2>";
    for (const n of notes) {
      const anchor = n.anchor || n.key || "";
      const kind = {highlight:"划线",question:"问题",note:"笔记"}[n.kind] || "笔记";
      const color = {yellow:"黄色",green:"绿色",blue:"蓝色",pink:"粉色"}[n.color] || "";
      html += `<h3>${e(kind + (color ? " · " + color : ""))}</h3><p>${position(anchor)}</p>`;
      if (n.quote) html += `<blockquote>${this.text(n.quote)}</blockquote>`;
      if (n.body) html += this.text(n.body);
      // English context is a whole source paragraph, never presented as an exact translated-span match.
      const b = blocks.get(String(anchor).split("#")[0]);
      if (options.englishContext !== false && b?.en) html += `<p><strong>对应段落英文（上下文）</strong></p>${this.text(b.en)}`;
    }
    const entries = options.includeAI === false ? [] : (state.discussion?.entries || []).filter(x => x && !x.deleted && x.body);
    if (entries.length) html += "<h2>已保存的 AI 回答与页边讨论（阅读辅助）</h2>";
    for (const d of entries) {
      const reply = notes.find(n => n.id === d.reply_to);
      const anchor = d.anchor || reply?.anchor || "";
      html += `<h3>${e(d.title || d.q || "页边讨论")}</h3><p>${position(anchor)}</p>`;
      if (d.quote) html += `<blockquote>${this.text(d.quote)}</blockquote>`;
      if (d.q && d.q !== d.title) html += `<p><strong>问题：</strong>${e(d.q)}</p>`;
      html += this.text(d.body);
    }
    if (!general?.trim() && !notes.length && !entries.length) html += "<p>尚无阅读笔记。</p>";
    return html + "</div>";
  }
};
if (typeof module !== "undefined") module.exports = EasyReadCore;
