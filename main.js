"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => FavCollectorPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian3 = require("obsidian");

// src/settings.ts
var DEFAULT_SETTINGS = {
  biliCookies: "",
  xCookies: "",
  zhihuSecret: "",
  ytdlpPath: "D:\\DevEnv\\bin\\yt-dlp.exe",
  ytCookieFile: "",
  lastSync: {}
};

// src/settings-tab.ts
var import_obsidian = require("obsidian");
var FavSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(plugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;
    containerEl.createEl("h3", { text: "\u767B\u5F55\u6001\uFF08\u53EA\u5B58\u672C\u673A data.json\uFF0C\u4E0D\u4E0A\u4F20\uFF09" });
    new import_obsidian.Setting(containerEl).setName("B\u7AD9 Cookie").setDesc('SESSDATA \u7C98\u8D34 "k=v; k2=v2" \u683C\u5F0F\uFF08Cookie-Editor \u5BFC\u51FA\uFF09').addTextArea(
      (t) => t.setValue(s.biliCookies).onChange(async (v) => {
        s.biliCookies = v.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("X Cookie").setDesc('auth_token + ct0\uFF0C"k=v; k2=v2" \u683C\u5F0F\uFF08\u548C\u5468\u62A5\u540C\u4E00\u5957\uFF09').addTextArea(
      (t) => t.setValue(s.xCookies).onChange(async (v) => {
        s.xCookies = v.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u77E5\u4E4E Access Secret").setDesc("developer.zhihu.com/profile \u751F\u6210").addText(
      (t) => t.setValue(s.zhihuSecret).onChange(async (v) => {
        s.zhihuSecret = v.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("yt-dlp \u8DEF\u5F84").addText(
      (t) => t.setValue(s.ytdlpPath).onChange(async (v) => {
        s.ytdlpPath = v.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("YouTube Cookie \u6587\u4EF6\uFF08\u53EF\u9009\uFF09").setDesc("\u7559\u7A7A\u5219\u8D70 Firefox \u4E13\u7528\u94A5\u5319\u6263\uFF0C\u514D\u7EF4\u62A4").addText(
      (t) => t.setValue(s.ytCookieFile).onChange(async (v) => {
        s.ytCookieFile = v.trim();
        await this.plugin.saveSettings();
      })
    );
    containerEl.createEl("h3", { text: "\u8FDE\u901A\u6027\u6D4B\u8BD5" });
    for (const p of ["bilibili", "youtube", "zhihu", "x", "github"]) {
      new import_obsidian.Setting(containerEl).setName(`\u6D4B\u8BD5 ${p}`).addButton(
        (b) => b.setButtonText("\u6D4B\u8BD5").onClick(async () => {
          new import_obsidian.Notice(`\u6D4B\u8BD5 ${p} \u4E2D\u2026`);
          const r = await this.plugin.testPlatform(p);
          new import_obsidian.Notice(r.ok ? `${p} OK\uFF08${r.items.length} \u6761\uFF09` : `${p} \u5931\u8D25\uFF1A${r.error}`);
        })
      );
    }
  }
};

// src/ui/dashboard.ts
var import_obsidian2 = require("obsidian");

// src/markdown/writer.ts
function sanitizeFilename(name) {
  return (name || "untitled").replace(/[\\/:*?"<>|]/g, "_").slice(0, 120);
}
function yamlString(v) {
  return JSON.stringify(String(v ?? ""));
}
function notePathFor(item) {
  const dir = item.folder?.trim() || (item.watchLater ? "\u7A0D\u540E\u518D\u770B" : void 0);
  const base = `Fav Collector/${item.platform}${dir ? `/${sanitizeFilename(dir)}` : ""}`;
  const datePrefix = item.publishedAt?.trim() ? `${item.publishedAt.trim()}_` : "";
  return `${base}/${datePrefix}${sanitizeFilename(item.title)}.md`;
}
function buildNote(item) {
  const fm = [
    "---",
    `platform: ${yamlString(item.platform)}`,
    `fav_id: ${yamlString(item.favId)}`,
    `url: ${yamlString(item.url)}`,
    ...item.author ? [`author: ${yamlString(item.author)}`] : [],
    ...item.publishedAt ? [`published_at: ${yamlString(item.publishedAt)}`] : [],
    ...item.folder ? [`folder: ${yamlString(item.folder)}`] : [],
    ...item.coverUrl ? [`cover: ${yamlString(item.coverUrl)}`] : [],
    "---",
    "",
    `# ${item.title.replace(/#/g, "\\#")}`,
    "",
    ...item.coverUrl ? [`![cover](${item.coverUrl})`, ""] : [],
    ...item.author ? [`\u4F5C\u8005\uFF1A${item.author}`, ""] : [],
    ...item.publishedAt ? [`\u53D1\u5E03\u65E5\u671F\uFF1A${item.publishedAt}`, ""] : [],
    ...item.description ? ["## \u7B80\u4ECB", "", item.description, ""] : [],
    "<!-- \u4EE5\u4E0B\u4E3A\u7528\u6237\u79C1\u6709\u7F16\u8F91\u533A\uFF0C\u4EFB\u4F55\u81EA\u52A8\u5316\u903B\u8F91\u7981\u6B62\u4FEE\u6539 -->",
    "## \u6211\u7684\u7B14\u8BB0",
    ""
  ];
  return fm.join("\n");
}
function parseFrontmatter(md) {
  const out = {};
  const m = md.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return out;
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i <= 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (v.startsWith('"') && v.endsWith('"') || v.startsWith("'") && v.endsWith("'")) {
      try {
        v = JSON.parse(v);
      } catch {
        v = v.slice(1, -1);
      }
    }
    if (k) out[k] = v;
  }
  return out;
}
function cardFromNote(path, md) {
  const fm = parseFrontmatter(md);
  if (!fm.platform || !fm.url) return null;
  const titleM = md.match(/^# (.+)$/m);
  let description;
  const introM = md.match(/^## 简介\s*\n([\s\S]*?)(?=^## |^# |<!--|\Z)/m);
  if (introM) description = introM[1].trim().slice(0, 200) || void 0;
  return {
    path,
    platform: fm.platform,
    title: (titleM?.[1] ?? fm.url).replace(/\\#/g, "#"),
    url: fm.url,
    author: fm.author,
    publishedAt: fm.published_at,
    folder: fm.folder,
    cover: fm.cover,
    description
  };
}

// src/sync/model.ts
var PLATFORMS = ["bilibili", "youtube", "zhihu", "x", "github"];
var PLATFORM_LABEL = {
  bilibili: "B\u7AD9",
  youtube: "YouTube",
  zhihu: "\u77E5\u4E4E",
  x: "X",
  github: "GitHub"
};
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function toDateOnly(v) {
  if (v === null || v === void 0) return void 0;
  if (typeof v === "number" && Number.isFinite(v)) {
    const sec = v > 1e12 ? Math.floor(v / 1e3) : Math.floor(v);
    const d = new Date(sec * 1e3);
    if (Number.isNaN(d.getTime())) return void 0;
    const cst = new Date(d.getTime() + 8 * 3600 * 1e3);
    return cst.toISOString().slice(0, 10);
  }
  if (typeof v === "string") {
    const s = v.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const t = Date.parse(s);
    if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  }
  return void 0;
}
function parseCookieString(raw) {
  const out = {};
  for (const part of (raw ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i <= 0) continue;
    const k = part.slice(0, i).trim();
    const val = part.slice(i + 1).trim();
    if (k) out[k] = val;
  }
  return out;
}
function cookieHeader(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
}
function makeItem(platform, nativeId, url, title) {
  return { platform, nativeId, favId: `${platform}:${nativeId}`, url, title };
}

// src/ui/dashboard.ts
var VIEW_TYPE_FAV_DASHBOARD = "fav-collector-dashboard";
var FavDashboardView = class extends import_obsidian2.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.filter = "all";
  }
  getViewType() {
    return VIEW_TYPE_FAV_DASHBOARD;
  }
  getDisplayText() {
    return "\u6536\u85CF\u603B\u89C8";
  }
  async onOpen() {
    await this.render();
  }
  async render() {
    const el = this.containerEl.children[1];
    el.empty();
    el.addClass("fav-dashboard");
    const bar = el.createDiv({ cls: "fav-toolbar" });
    const syncBtn = bar.createEl("button", { text: this.plugin.syncing ? "\u540C\u6B65\u4E2D\u2026" : "\u540C\u6B65\u5168\u90E8" });
    syncBtn.disabled = this.plugin.syncing;
    syncBtn.onclick = () => void this.plugin.syncAll().then(() => this.render());
    const openBtn = bar.createEl("button", { text: "\u6253\u5F00 Fav Collector \u6587\u4EF6\u5939" });
    openBtn.onclick = () => {
      const folder = this.app.vault.getFolderByPath("Fav Collector");
      if (folder) void this.app.workspace.getLeaf().openFile(folder);
      else new import_obsidian2.Notice("Fav Collector \u6587\u4EF6\u5939\u8FD8\u4E0D\u5B58\u5728\uFF0C\u5148\u70B9\u4E00\u6B21\u540C\u6B65");
    };
    const status = bar.createSpan({ cls: "fav-status" });
    const last = this.plugin.settings.lastSync;
    for (const p of PLATFORMS) {
      const rec = last[p];
      if (rec && !rec.ok) {
        const card = el.createDiv({ cls: "fav-error" });
        card.createDiv({ cls: "fav-error-title", text: `${PLATFORM_LABEL[p]} \u4E0A\u6B21\u540C\u6B65\u5931\u8D25` });
        card.createDiv({ text: (rec.error ?? "\u672A\u77E5\u9519\u8BEF").slice(0, 200) });
        card.createDiv({ cls: "fav-status", text: `\u65F6\u95F4\uFF1A${rec.at}` });
        const retry = card.createEl("button", { text: `\u91CD\u8BD5 ${PLATFORM_LABEL[p]}` });
        retry.onclick = () => void this.plugin.syncPlatform(p).then(() => this.render());
      }
    }
    const filterBar = el.createDiv({ cls: "fav-filter" });
    const mkFilter = (key, label) => {
      const b = filterBar.createEl("button", { text: label, cls: key === this.filter ? "active" : "" });
      b.onclick = () => {
        this.filter = key;
        void this.render();
      };
    };
    mkFilter("all", "\u5168\u90E8");
    for (const p of PLATFORMS) mkFilter(p, PLATFORM_LABEL[p]);
    const cards = await this.loadCards();
    const shown = cards.filter((c) => this.filter === "all" || c.platform === this.filter);
    status.setText(`\u5171 ${cards.length} \u6761${this.filter !== "all" ? `\uFF08${PLATFORM_LABEL[this.filter]} ${shown.length} \u6761\uFF09` : ""}`);
    const grid = el.createDiv({ cls: "fav-cards" });
    for (const c of shown.slice(0, 500)) {
      const card = grid.createDiv({ cls: "fav-card" });
      if (c.cover) {
        const img = card.createEl("img", { cls: "fav-cover" });
        img.src = c.cover;
        img.loading = "lazy";
      }
      const title = card.createDiv({ cls: "fav-title" });
      const link = title.createEl("a", { text: c.title, cls: "internal-link" });
      link.onclick = (e) => {
        e.preventDefault();
        void this.openNote(c.path);
      };
      const meta = card.createDiv({ cls: "fav-meta" });
      const badge = meta.createSpan({ cls: `fav-badge ${c.platform}`, text: PLATFORM_LABEL[c.platform] });
      meta.appendText(`${c.publishedAt ?? "\u672A\u77E5\u65F6\u95F4"}${c.author ? ` \xB7 ${c.author}` : ""}${c.folder ? ` \xB7 ${c.folder}` : ""}`);
      if (c.description) card.createDiv({ cls: "fav-desc", text: c.description });
    }
  }
  async openNote(path) {
    const f = this.app.vault.getFileByPath(path);
    if (f) await this.app.workspace.getLeaf().openFile(f);
    else new import_obsidian2.Notice(`\u6587\u4EF6\u4E0D\u5B58\u5728\uFF1A${path}`);
  }
  async loadCards() {
    const files = this.app.vault.getMarkdownFiles().filter((f) => f.path.startsWith("Fav Collector/"));
    const out = [];
    for (const f of files) {
      try {
        const md = await this.app.vault.read(f);
        const card = cardFromNote(f.path, md);
        if (card) out.push(card);
      } catch {
      }
    }
    out.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
    return out;
  }
};

// src/sync/bilibili.ts
var API = "https://api.bilibili.com";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
var BiliError = class extends Error {
};
async function api(http, cookie, path, params) {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const body = await http(`${API}${path}?${qs.toString()}`, {
    "user-agent": UA,
    referer: "https://www.bilibili.com/",
    cookie
  });
  if (!body || body.code !== 0) {
    throw new BiliError(`B\u7AD9\u63A5\u53E3 ${path} code=${body?.code}: ${body?.message ?? "\u65E0\u54CD\u5E94"}`);
  }
  return body.data ?? {};
}
async function collectBilibili(http, cookieRaw) {
  const jar = parseCookieString(cookieRaw);
  if (!jar.SESSDATA) throw new BiliError("B\u7AD9\u672A\u767B\u5F55\uFF1Acookie \u91CC\u6CA1\u6709 SESSDATA");
  const cookie = cookieHeader(jar);
  const nav = await api(http, cookie, "/x/web-interface/nav", {});
  const mid = nav.mid;
  if (!mid) throw new BiliError("B\u7AD9 nav \u672A\u8FD4\u56DE mid\uFF08SESSDATA \u53EF\u80FD\u8FC7\u671F\uFF09");
  const items = [];
  const folders = [];
  let pn = 1;
  for (; ; ) {
    const page = await api(http, cookie, "/x/v3/fav/folder/created/list", {
      pn,
      ps: 20,
      up_mid: mid
    });
    folders.push(...page.list ?? []);
    if (pn * 20 >= (page.count ?? 0) || (page.list ?? []).length === 0) break;
    pn += 1;
    await sleep(400);
  }
  for (const folder of folders) {
    let fpn = 1;
    let got = 0;
    const total = folder.media_count ?? 0;
    while (got < total && fpn <= 100) {
      const page = await api(http, cookie, "/x/v3/fav/resource/list", {
        media_id: folder.id,
        pn: fpn,
        ps: 20,
        keyword: "",
        order: "mtime",
        type: 0,
        tid: 0,
        platform: "web"
      });
      const meds = page.medias ?? [];
      if (meds.length === 0) break;
      for (const m of meds) {
        const bvid = m.bvid ?? m.bv_id;
        if (!bvid) continue;
        const upper = m.upper;
        const it = makeItem("bilibili", `${folder.id}_${bvid}`, `https://www.bilibili.com/video/${bvid}`, (m.title || "(\u5931\u6548\u89C6\u9891)").slice(0, 150));
        it.author = upper?.name;
        it.description = (m.intro || "").slice(0, 200) || void 0;
        it.coverUrl = m.pic;
        it.folder = folder.title;
        it.publishedAt = toDateOnly(m.pubdate ?? m.created);
        items.push(it);
        got += 1;
      }
      fpn += 1;
      await sleep(400);
    }
  }
  const toview = await api(http, cookie, "/x/v2/history/toview", {});
  for (const v of toview.list ?? []) {
    const bvid = v.bvid;
    if (!bvid) continue;
    const owner = v.owner;
    const it = makeItem("bilibili", bvid, `https://www.bilibili.com/video/${bvid}`, (v.title || "(\u5931\u6548\u89C6\u9891)").slice(0, 150));
    it.author = owner?.name;
    it.coverUrl = v.pic;
    it.watchLater = true;
    it.publishedAt = toDateOnly(v.pubdate ?? v.add_dt);
    items.push(it);
  }
  return items;
}

// src/sync/github.ts
var import_node_child_process = require("node:child_process");
var GithubError = class extends Error {
};
function defaultRun(cmd, args) {
  return new Promise((resolve, reject) => {
    (0, import_node_child_process.execFile)(cmd, args, { timeout: 3e5, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new GithubError(`gh \u5931\u8D25\uFF08\u5148\u8DD1 gh auth login\uFF09\uFF1A${`${stderr || err.message}`.slice(0, 200)}`));
        return;
      }
      resolve({ stdout: String(stdout ?? ""), stderr: String(stderr ?? "") });
    });
  });
}
function parseStarredTsv(tsv) {
  const items = [];
  for (const line of tsv.split("\n")) {
    if (!line.trim()) continue;
    const [starredAt, full, url, desc, lang, avatar] = line.split("	");
    if (!full || !url) continue;
    const it = makeItem("github", full, url, full.slice(0, 150));
    it.author = full.split("/")[0];
    it.description = [desc && desc !== "null" ? desc : "", lang && lang !== "null" ? `\uFF08${lang}\uFF09` : ""].join("").slice(0, 200) || void 0;
    it.coverUrl = avatar && avatar !== "null" ? avatar : void 0;
    it.publishedAt = toDateOnly(starredAt);
    items.push(it);
  }
  return items;
}
async function collectGithub(run = defaultRun) {
  const { stdout } = await run("gh", [
    "api",
    "--paginate",
    "user/starred?per_page=100",
    "-H",
    "Accept: application/vnd.github.v3.star+json",
    "--jq",
    '.[] | [.starred_at, .repo.full_name, .repo.html_url, (.repo.description // ""), (.repo.language // ""), .repo.owner.avatar_url] | @tsv'
  ]);
  return parseStarredTsv(stdout);
}

// src/sync/youtube.ts
var import_node_child_process2 = require("node:child_process");
var YoutubeError = class extends Error {
};
function defaultRun2(cmd, args) {
  return new Promise((resolve, reject) => {
    (0, import_node_child_process2.execFile)(cmd, args, { timeout: 3e5, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const msg = `${stderr || err.message}`.slice(0, 300);
        reject(new YoutubeError(`yt-dlp \u5931\u8D25: ${msg}`));
        return;
      }
      resolve({ stdout: String(stdout ?? ""), stderr: String(stderr ?? "") });
    });
  });
}
function baseArgs(opts) {
  const args = ["--flat-playlist", "--skip-download", "--no-playlist", "--ignore-errors", "--socket-timeout", "20", "--retries", "2"];
  if (opts.cookieFile?.trim()) {
    args.push("--cookies", opts.cookieFile.trim());
  } else {
    args.push("--cookies-from-browser", "firefox:vyp2edie.ytdlp");
  }
  args.push("--js-runtimes", "node", "--remote-components", "ejs:github");
  return args;
}
function parseFlatList(stdout, listId) {
  const items = [];
  for (const line of stdout.split("\n")) {
    const m = line.match(/^(\S+)\t(.*)$/);
    if (!m) continue;
    const it = makeItem("youtube", `${listId}_${m[1]}`, `https://www.youtube.com/watch?v=${m[1]}`, (m[2] || "(\u65E0\u6807\u9898)").slice(0, 150));
    it.watchLater = listId === "WL";
    it.videoId = m[1];
    items.push(it);
  }
  return items;
}
async function collectYoutube(opts) {
  const run = opts.run ?? defaultRun2;
  const items = [];
  for (const listId of ["WL", "LL"]) {
    const { stdout } = await run(opts.ytdlpPath, [
      ...baseArgs(opts),
      "--print",
      "%(id)s	%(title)s",
      `https://www.youtube.com/playlist?list=${listId}`
    ]).catch((e) => {
      const msg = e.message;
      if (msg.includes("does not exist") && listId === "WL") {
        throw new YoutubeError("YouTube WL \u4E0D\u5B58\u5728\uFF1A\u5927\u6982\u7387\u767B\u5F55\u8FC7\u671F\uFF0C\u91CD\u5BFC cookie \u6216\u68C0\u67E5 Firefox \u94A5\u5319\u6263");
      }
      throw e;
    });
    items.push(...parseFlatList(stdout, listId));
  }
  return items;
}
async function enrichYoutubeDates(opts, items) {
  const run = opts.run ?? defaultRun2;
  const withId = items.filter((it) => it.videoId);
  if (withId.length === 0) return;
  const urls = withId.map((it) => it.videoId).map((id) => `https://www.youtube.com/watch?v=${id}`);
  const { stdout } = await run(opts.ytdlpPath, [...baseArgs(opts), "--print", "%(id)s	%(upload_date)s", ...urls]);
  const dates = /* @__PURE__ */ new Map();
  for (const line of stdout.split("\n")) {
    const m = line.match(/^(\S+)\s+(\d{8})/);
    if (m) dates.set(m[1], `${m[2].slice(0, 4)}-${m[2].slice(4, 6)}-${m[2].slice(6, 8)}`);
  }
  for (const it of withId) {
    const d = dates.get(it.videoId);
    if (d) it.publishedAt = d;
  }
}

// src/sync/zhihu.ts
var BASE = "https://developer.zhihu.com";
var ZhihuError = class extends Error {
};
async function zget(http, secret, path, params) {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const body = await http(`${BASE}${path}?${qs.toString()}`, {
    Authorization: `Bearer ${secret}`,
    "X-Request-Timestamp": String(Math.floor(Date.now() / 1e3)),
    "Content-Type": "application/json"
  });
  if (!body || body.Code !== 0) {
    if (body?.Code === 20001) throw new ZhihuError("\u77E5\u4E4E\u9274\u6743\u5931\u8D25\uFF08Code 20001\uFF09\uFF1A\u53BB developer.zhihu.com/profile \u91CD\u751F\u6210 Secret");
    if (body?.Code === 30001 || body?.Code === 30002) throw new ZhihuError(`\u77E5\u4E4E\u9650\u6D41/\u914D\u989D\uFF08Code ${body?.Code}\uFF09`);
    throw new ZhihuError(`\u77E5\u4E4E\u9519\u8BEF Code=${body?.Code} ${body?.Message ?? "\u65E0\u54CD\u5E94"}`);
  }
  return body.Data ?? {};
}
async function collectZhihu(http, secret) {
  if (!secret.trim()) throw new ZhihuError("\u77E5\u4E4E Secret \u672A\u586B");
  const favlists = (await zget(http, secret, "/api/v1/user/favlists", { Limit: 50 })).Items ?? [];
  if (favlists.length === 0) throw new ZhihuError("\u77E5\u4E4E\u672A\u8FD4\u56DE\u4EFB\u4F55\u6536\u85CF\u5939\uFF08\u53EF\u80FD\u90FD\u672A\u516C\u5F00\uFF09");
  const items = [];
  for (const fav of favlists) {
    let offset = 0;
    for (; ; ) {
      const data = await zget(http, secret, "/api/v1/user/favlist_contents", {
        FavlistUrlToken: fav.UrlToken,
        Offset: offset,
        Limit: 50
      });
      const list = data.Items ?? [];
      for (const it of list) {
        const url = it.Url;
        const author = it.Author;
        const item = makeItem("zhihu", url ?? `${fav.UrlToken}_${it.CreatedAt}`, url ?? "", (it.Title || "(\u65E0\u6807\u9898)").slice(0, 150));
        item.author = author?.Name;
        item.description = (it.Summary || "").slice(0, 200) || void 0;
        item.folder = fav.Title;
        item.publishedAt = toDateOnly(it.FavTime ?? it.CreatedAt);
        items.push(item);
      }
      const paging = data.Paging ?? {};
      if (paging.IsEnd !== false) break;
      const next = Number(paging.NextOffset);
      if (!Number.isFinite(next)) break;
      offset = next;
      await sleep(500);
    }
    await sleep(500);
  }
  return items;
}

// src/sync/x-consts.json
var x_consts_default = { features: { c9s_tweet_anatomy_moderator_badge_enabled: true, responsive_web_home_pinned_timelines_enabled: true, blue_business_profile_image_shape_enabled: true, creator_subscriptions_tweet_preview_api_enabled: true, freedom_of_speech_not_reach_fetch_enabled: true, graphql_is_translatable_rweb_tweet_is_translatable_enabled: true, graphql_timeline_v2_bookmark_timeline: true, hidden_profile_likes_enabled: true, highlights_tweets_tab_ui_enabled: true, interactive_text_enabled: true, longform_notetweets_consumption_enabled: true, longform_notetweets_inline_media_enabled: true, longform_notetweets_rich_text_read_enabled: true, longform_notetweets_richtext_consumption_enabled: true, profile_foundations_tweet_stats_enabled: true, profile_foundations_tweet_stats_tweet_frequency: true, responsive_web_birdwatch_note_limit_enabled: true, responsive_web_edit_tweet_api_enabled: true, responsive_web_enhance_cards_enabled: false, responsive_web_graphql_exclude_directive_enabled: true, responsive_web_graphql_skip_user_profile_image_extensions_enabled: false, responsive_web_graphql_timeline_navigation_enabled: true, responsive_web_media_download_video_enabled: false, responsive_web_text_conversations_enabled: false, responsive_web_twitter_article_data_v2_enabled: true, responsive_web_twitter_article_tweet_consumption_enabled: false, responsive_web_twitter_blue_verified_badge_is_enabled: true, rweb_lists_timeline_redesign_enabled: true, spaces_2022_h2_clipping: true, spaces_2022_h2_spaces_communities: true, standardized_nudges_misinfo: true, subscriptions_verification_info_verified_since_enabled: true, tweet_awards_web_tipping_enabled: false, tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true, tweetypie_unmention_optimization_enabled: true, verified_phone_label_enabled: false, vibe_api_enabled: true, view_counts_everywhere_api_enabled: true }, variables: { count: 1e3, withSafetyModeUserFields: true, includePromotedContent: true, withQuickPromoteEligibilityTweetFields: true, withVoice: true, withV2Timeline: true, withDownvotePerspective: false, withBirdwatchNotes: true, withCommunity: true, withSuperFollowsUserFields: true, withReactionsMetadata: false, withReactionsPerspective: false, withSuperFollowsTweetFields: true, isMetatagsQuery: false, withReplays: true, withClientEventToken: false, withAttachments: true, withConversationQueryHighlights: true, withMessageQueryHighlights: true, withMessages: true } };

// src/sync/x.ts
var QID = "tmd4ifV8RHltzn8ymGg1aw";
var OP = "Bookmarks";
var BEARER = "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs=1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
var UA2 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
var XError = class extends Error {
};
function findAll(obj, key) {
  const out = [];
  if (Array.isArray(obj)) {
    for (const v of obj) out.push(...findAll(v, key));
  } else if (obj && typeof obj === "object") {
    const rec = obj;
    if (key in rec) out.push(rec[key]);
    for (const v of Object.values(rec)) out.push(...findAll(v, key));
  }
  return out;
}
function tweetToItem(result) {
  const restId = result.rest_id;
  if (!restId) return null;
  const legacy = result.legacy ?? {};
  const core = result.core ?? {};
  const userResult = (core.user_results ?? {}).result;
  const uLegacy = (userResult ?? {}).legacy ?? {};
  const screenName = uLegacy.screen_name || "i";
  const text = legacy.full_text || "";
  const it = makeItem("x", restId, `https://x.com/${screenName}/status/${restId}`, text.split("\n")[0].slice(0, 120) || "(\u65E0\u6B63\u6587)");
  it.author = uLegacy.name || screenName;
  it.description = text.slice(0, 400) || void 0;
  it.publishedAt = toDateOnly(legacy.created_at);
  return it;
}
function extractTweets(page) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const t of findAll(page, "tweet_results")) {
    const rec = t ?? {};
    const result = rec.result ?? rec;
    if (typeof result.__typename === "string" && (result.__typename === "TweetTombstone" || result.__typename === "TweetUnavailable")) continue;
    const it = tweetToItem(result);
    if (it && !seen.has(it.nativeId)) {
      seen.add(it.nativeId);
      out.push(it);
    }
  }
  return out;
}
function findCursor(page) {
  for (const entries of findAll(page, "entries")) {
    if (!Array.isArray(entries)) continue;
    for (const e of entries) {
      const entry = e ?? {};
      const id = entry.entryId ?? entry.entry_id ?? "";
      if (id.includes("cursor-bottom") || id.includes("cursor-showmorethreads")) {
        const content = entry.content ?? {};
        const itemContent = content.itemContent;
        if (itemContent && typeof itemContent.value === "string") return itemContent.value;
        if (typeof content.value === "string") return content.value;
      }
    }
  }
  return void 0;
}
async function collectX(http, cookieRaw, maxPages = 30) {
  const jar = parseCookieString(cookieRaw);
  if (!jar.auth_token) throw new XError("X \u672A\u767B\u5F55\uFF1Acookie \u91CC\u6CA1\u6709 auth_token");
  const headers = {
    authorization: BEARER,
    cookie: cookieHeader(jar),
    referer: "https://twitter.com/",
    "user-agent": UA2,
    "x-csrf-token": jar.ct0 ?? "",
    "x-twitter-auth-type": "OAuth2Session",
    "x-twitter-active-user": "yes",
    "x-twitter-client-language": "en"
  };
  const items = [];
  const seen = /* @__PURE__ */ new Set();
  let cursor;
  for (let page = 0; page < maxPages; page += 1) {
    const variables = { ...x_consts_default.variables, count: 20 };
    if (cursor) variables.cursor = cursor;
    const qs = new URLSearchParams({
      queryId: QID,
      features: JSON.stringify(x_consts_default.features),
      variables: JSON.stringify(variables)
    });
    let data;
    let lastErr = "";
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        data = await http(`https://x.com/i/api/graphql/${QID}/${OP}?${qs.toString()}`, headers);
        break;
      } catch (e) {
        lastErr = e.message;
        if (attempt === 2) throw new XError(`X Bookmarks \u6293\u53D6\u5931\u8D25: ${lastErr.slice(0, 150)}`);
        await sleep(2e3 * (attempt + 1));
      }
    }
    const fresh = extractTweets(data).filter((it) => !seen.has(it.nativeId));
    for (const it of fresh) seen.add(it.nativeId);
    items.push(...fresh);
    cursor = findCursor(data);
    if (fresh.length === 0 || !cursor) break;
    await sleep(500);
  }
  return items;
}

// src/sync/runner.ts
async function syncPlatform(platform, settings, http) {
  try {
    let items;
    switch (platform) {
      case "bilibili":
        items = await collectBilibili(http, settings.biliCookies);
        break;
      case "youtube":
        items = await collectYoutube({ ytdlpPath: settings.ytdlpPath, cookieFile: settings.ytCookieFile });
        break;
      case "zhihu":
        items = await collectZhihu(http, settings.zhihuSecret);
        break;
      case "x":
        items = await collectX(http, settings.xCookies);
        break;
      case "github":
        items = await collectGithub();
        break;
    }
    return { platform, ok: true, items };
  } catch (e) {
    return { platform, ok: false, items: [], error: e.message };
  }
}
async function writeNewItems(fs, existingFavIds, existingUrls, results, enrichYoutube) {
  const addedPaths = [];
  for (const r of results) {
    if (!r.ok) continue;
    const fresh = r.items.filter((it) => !existingFavIds.has(it.favId) && !existingUrls.has(it.url));
    if (r.platform === "youtube" && fresh.length > 0) {
      try {
        await enrichYoutube(fresh);
      } catch {
      }
    }
    for (const it of fresh) {
      const p = notePathFor(it);
      const dir = p.slice(0, p.lastIndexOf("/"));
      await fs.mkdir(dir);
      if (await fs.exists(p)) continue;
      await fs.write(p, buildNote(it));
      existingFavIds.add(it.favId);
      existingUrls.add(it.url);
      addedPaths.push(p);
    }
  }
  return { added: addedPaths.length, addedPaths, results };
}

// src/main.ts
var FavCollectorPlugin = class extends import_obsidian3.Plugin {
  constructor() {
    super(...arguments);
    this.syncing = false;
  }
  async onload() {
    this.settings = { ...DEFAULT_SETTINGS, ...await this.loadData() ?? {} };
    this.statusEl = this.addStatusBarItem();
    this.setStatus("Fav: \u5C31\u7EEA");
    this.registerView(VIEW_TYPE_FAV_DASHBOARD, (leaf) => new FavDashboardView(leaf, this));
    this.addRibbonIcon("refresh-cw", "\u540C\u6B65\u5168\u90E8\u6536\u85CF", () => void this.syncAll());
    this.addRibbonIcon("layout-dashboard", "\u6253\u5F00\u6536\u85CF\u603B\u89C8", () => void this.openDashboard());
    this.addCommand({ id: "sync-all", name: "\u540C\u6B65\u5168\u90E8\u6536\u85CF", callback: () => void this.syncAll() });
    this.addCommand({
      id: "open-dashboard",
      name: "\u6253\u5F00\u6536\u85CF\u603B\u89C8",
      callback: () => void this.openDashboard()
    });
    this.addSettingTab(new FavSettingTab(this));
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  setStatus(text) {
    this.statusEl?.setText(text);
  }
  http() {
    return async (url, headers) => {
      const res = await (0, import_obsidian3.requestUrl)({ url, method: "GET", headers: headers ?? {} });
      if (res.status >= 400) throw new Error(`HTTP ${res.status}: ${url.slice(0, 80)}`);
      return res.json;
    };
  }
  runnerSettings() {
    return {
      biliCookies: this.settings.biliCookies,
      xCookies: this.settings.xCookies,
      zhihuSecret: this.settings.zhihuSecret,
      ytdlpPath: this.settings.ytdlpPath || DEFAULT_SETTINGS.ytdlpPath,
      ytCookieFile: this.settings.ytCookieFile || void 0
    };
  }
  async testPlatform(platform) {
    return syncPlatform(platform, this.runnerSettings(), this.http());
  }
  /** 扫 Vault 组装去重集合（fav_id + url，兼容旧笔记）。 */
  async scanExisting() {
    const favIds = /* @__PURE__ */ new Set();
    const urls = /* @__PURE__ */ new Set();
    const files = this.app.vault.getMarkdownFiles().filter((f) => f.path.startsWith("Fav Collector/"));
    for (const f of files) {
      try {
        const fm = parseFrontmatter(await this.app.vault.read(f));
        if (fm.fav_id) favIds.add(fm.fav_id);
        if (fm.url) urls.add(fm.url);
      } catch {
      }
    }
    return { favIds, urls };
  }
  async syncPlatform(platform) {
    if (this.syncing) {
      new import_obsidian3.Notice("\u6B63\u5728\u540C\u6B65\u4E2D\uFF0C\u7A0D\u7B49\u2026");
      return;
    }
    this.syncing = true;
    try {
      new import_obsidian3.Notice(`\u540C\u6B65 ${platform} \u4E2D\u2026\uFF08\u770B\u5E95\u90E8\u72B6\u6001\u680F\u8FDB\u5EA6\uFF09`);
      this.setStatus(`Fav: \u540C\u6B65 ${platform}\u2026`);
      const result = await syncPlatform(platform, this.runnerSettings(), this.http());
      const { favIds, urls } = await this.scanExisting();
      const va = this.app.vault;
      const report = await writeNewItems(
        {
          exists: (p) => va.adapter.exists(p),
          mkdir: (p) => va.createFolder(p).then(() => void 0).catch(() => void 0),
          write: (p, c) => va.create(p, c).then(() => void 0)
        },
        favIds,
        urls,
        [result],
        (items) => enrichYoutubeDates({ ytdlpPath: this.runnerSettings().ytdlpPath, cookieFile: this.runnerSettings().ytCookieFile }, items)
      );
      this.settings.lastSync[platform] = {
        at: (/* @__PURE__ */ new Date()).toISOString(),
        ok: result.ok,
        added: report.added,
        error: result.error
      };
      await this.saveSettings();
      this.setStatus(result.ok ? `Fav: ${platform} +${report.added}` : `Fav: ${platform} \u5931\u8D25`);
      new import_obsidian3.Notice(result.ok ? `${platform} \u540C\u6B65\u5B8C\u6210\uFF0C\u65B0\u589E ${report.added} \u6761` : `${platform} \u5931\u8D25\uFF1A${result.error}`);
    } finally {
      this.syncing = false;
    }
  }
  async syncAll() {
    if (this.syncing) {
      new import_obsidian3.Notice("\u6B63\u5728\u540C\u6B65\u4E2D\uFF0C\u7A0D\u7B49\u2026");
      return;
    }
    this.syncing = true;
    try {
      new import_obsidian3.Notice("\u5F00\u59CB\u540C\u6B65\u5168\u90E8\u5E73\u53F0\u2026");
      const http = this.http();
      const settings = this.runnerSettings();
      const results = [];
      let done = 0;
      for (const p of PLATFORMS) {
        this.setStatus(`Fav: \u540C\u6B65 ${p}\uFF08${done + 1}/${PLATFORMS.length}\uFF09\u2026`);
        try {
          results.push(await syncPlatform(p, settings, http));
        } catch (e) {
          results.push({ platform: p, ok: false, items: [], error: e.message });
        }
        done += 1;
      }
      this.setStatus("Fav: \u5199\u7B14\u8BB0\u2026");
      const { favIds, urls } = await this.scanExisting();
      const va = this.app.vault;
      const report = await writeNewItems(
        {
          exists: (p) => va.adapter.exists(p),
          mkdir: (p) => va.createFolder(p).then(() => void 0).catch(() => void 0),
          write: (p, c) => va.create(p, c).then(() => void 0)
        },
        favIds,
        urls,
        results,
        (items) => enrichYoutubeDates({ ytdlpPath: settings.ytdlpPath, cookieFile: settings.ytCookieFile }, items)
      );
      const now = (/* @__PURE__ */ new Date()).toISOString();
      for (const r of results) {
        this.settings.lastSync[r.platform] = {
          at: now,
          ok: r.ok,
          added: 0,
          error: r.error
        };
      }
      await this.saveSettings();
      const okCount = results.filter((r) => r.ok).length;
      const failed = results.filter((r) => !r.ok).map((r) => r.platform);
      this.setStatus(
        failed.length === 0 ? `Fav: \u5B8C\u6210 +${report.added}` : `Fav: ${failed.join("\u3001")}\u5931\u8D25`
      );
      new import_obsidian3.Notice(
        failed.length === 0 ? `\u540C\u6B65\u5B8C\u6210\uFF1A${PLATFORMS.length}/${PLATFORMS.length} \u5E73\u53F0\uFF0C\u65B0\u589E ${report.added} \u6761` : `\u540C\u6B65\u5B8C\u6210 ${okCount}/${PLATFORMS.length}\uFF0C\u65B0\u589E ${report.added} \u6761\uFF1B\u5931\u8D25\uFF1A${failed.join("\u3001")}\uFF08\u770B\u603B\u89C8\u7EA2\u5361\u91CD\u8BD5\uFF09`
      );
      await this.openDashboard();
    } finally {
      this.syncing = false;
    }
  }
  async openDashboard() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_FAV_DASHBOARD);
    if (leaves.length > 0) {
      void this.app.workspace.revealLeaf(leaves[0]);
      const view = leaves[0].view;
      if (view instanceof FavDashboardView) await view.render();
      return;
    }
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: VIEW_TYPE_FAV_DASHBOARD, active: true });
  }
};
