#!/usr/bin/env node
/**
 * fav-collector CLI — 与 Obsidian 插件共享同一套 sync/markdown 逻辑，命令行直接同步。
 *
 * 用法：
 *   node cli.mjs sync [--vault <path>] [--platforms youtube,bilibili,zhihu,x,github,xiaoyuzhou] [--dry-run]
 *   node cli.mjs list [--vault <path>] [--platform youtube]
 *   node cli.mjs status [--vault <path>]
 *
 * Vault 路径优先级：--vault 参数 > 环境变量 OBSIDIAN_VAULT > 仓库内 vault.path > 当前目录。
 * 凭证从 vault 内插件数据读取：<vault>/.obsidian/plugins/fav-collector-local/data.json
 *   （与插件共用一份，Obsidian 里改完 CLI 立即生效，不存在凭证漂移）。
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(HERE, "dist", "src");

// ---------- 参数 ----------
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[k] = next;
        i++;
      } else {
        out[k] = true;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0] ?? "help";

function pathToFileURL(p) {
  let s = p.replace(/\\/g, "/");
  if (!s.startsWith("/")) s = "/" + s;
  return new URL("file://" + encodeURI(s).replace(/#!/g, "%23"));
}

// ---------- Vault 定位 ----------
async function resolveVault() {
  if (args.vault) return path.resolve(args.vault);
  if (process.env.OBSIDIAN_VAULT) return path.resolve(process.env.OBSIDIAN_VAULT);
  try {
    const p = (await fs.readFile(path.join(HERE, "vault.path"), "utf8")).trim();
    if (p) return path.resolve(p);
  } catch {}
  return process.cwd();
}

// ---------- 凭证（与插件共用 data.json） ----------
async function loadSettings(vault) {
  const dataPath = path.join(vault, ".obsidian", "plugins", "fav-collector-local", "data.json");
  let raw = {};
  try {
    raw = JSON.parse(await fs.readFile(dataPath, "utf8"));
  } catch {
    console.error(`[fav] 读不到插件数据：${dataPath}`);
    console.error(`[fav] 请先在 Obsidian 里打开插件设置并保存一次，或用 --vault 指定 vault 路径。`);
    process.exit(2);
  }
  return {
    biliCookies: raw.biliCookies ?? "",
    xCookies: raw.xCookies ?? "",
    zhihuSecret: raw.zhihuSecret ?? "",
    ytdlpPath: raw.ytdlpPath ?? "D:\\DevEnv\\bin\\yt-dlp.exe",
    ytCookieFile: raw.ytCookieFile ?? "",
    xyzAccessToken: raw.xyzAccessToken ?? "",
    xyzRefreshToken: raw.xyzRefreshToken ?? "",
    xyzDeviceId: raw.xyzDeviceId ?? "",
    lastSync: raw.lastSync ?? {},
  };
}

// ---------- fs adapter：vault 相对路径 → 绝对路径 ----------
// notePathFor 返回 vault 相对路径（如 "Fav Collector/youtube/稍后再看/x.md"），
// 这里统一解析，避免写到 CLI 自身目录。
function makeFsAdapter(vault) {
  const abs = (p) => (path.isAbsolute(p) ? p : path.join(vault, p));
  return {
    exists: async (p) => fs.access(abs(p)).then(() => true, () => false),
    mkdir: async (p) => fs.mkdir(abs(p), { recursive: true }),
    write: async (p, c) => fs.writeFile(abs(p), c, "utf8"),
  };
}

// ---------- http（CLI 侧用全局 fetch） ----------
async function httpGet(url, headers = {}) {
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.json();
}

async function httpPost(url, body, headers = {}) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json;charset=utf-8", ...headers },
    body: JSON.stringify(body ?? {}),
  });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  const respHeaders = {};
  for (const [k, v] of r.headers.entries()) respHeaders[k.toLowerCase()] = v;
  return { data, headers: respHeaders, status: r.status };
}

// ---------- 扫 Vault 组装去重集 ----------
async function scanExisting(vault) {
  const favIds = new Set();
  const urls = new Set();
  const stack = [path.join(vault, "Fav Collector")];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.name.endsWith(".md")) {
        const md = await fs.readFile(p, "utf8");
        const m = md.match(/^---\n([\s\S]*?)\n---\n/);
        if (!m) continue;
        for (const line of m[1].split("\n")) {
          const i = line.indexOf(":");
          if (i <= 0) continue;
          const k = line.slice(0, i).trim();
          let v = line.slice(i + 1).trim();
          if (v.startsWith('"') && v.endsWith('"')) {
            try { v = JSON.parse(v); } catch { v = v.slice(1, -1); }
          }
          if (k === "fav_id" && v) favIds.add(v);
          if (k === "url" && v) urls.add(v);
        }
      }
    }
  }
  return { favIds, urls };
}

// ---------- 命令 ----------
async function cmdSync() {
  const vault = await resolveVault();
  const settings = await loadSettings(vault);
  const { syncPlatform, writeNewItems, PLATFORMS } = await import(
    pathToFileURL(path.join(DIST, "sync", "runner.js"))
  );
  const { enrichYoutubeDates } = await import(
    pathToFileURL(path.join(DIST, "sync", "youtube.js"))
  );

  const want = String(args.platforms ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const unknown = want.filter((p) => !PLATFORMS.includes(p));
  if (unknown.length) {
    console.error(`[fav] 未知平台: ${unknown.join(", ")}`);
    console.error(`[fav] 可用: ${PLATFORMS.join(", ")}`);
    process.exit(2);
  }
  const platforms = want.length ? want : PLATFORMS;

  console.log(`[fav] vault: ${vault}`);
  console.log(`[fav] platforms: ${platforms.join(", ")}${args["dry-run"] ? "  (dry-run)" : ""}`);

  const existing = await scanExisting(vault);
  console.log(`[fav] 现存笔记 fav_id ${existing.favIds.size} 条 / url ${existing.urls.size} 条`);

  const deps = {
    http: httpGet,
    post: httpPost,
    // 小宇宙 token 刷新后写回 vault 里的 data.json，和插件行为一致
    onXyzCreds: async (next) => {
      const dataPath = path.join(vault, ".obsidian", "plugins", "fav-collector-local", "data.json");
      try {
        const raw = JSON.parse(await fs.readFile(dataPath, "utf8"));
        raw.xyzAccessToken = next.accessToken;
        if (next.refreshToken) raw.xyzRefreshToken = next.refreshToken;
        if (next.deviceId) raw.xyzDeviceId = next.deviceId;
        await fs.writeFile(dataPath, JSON.stringify(raw, null, 2), "utf8");
        console.log(`[fav] 小宇宙 token 已刷新并写回 data.json`);
      } catch (e) {
        console.log(`[fav] 小宇宙 token 刷新但写回失败: ${e.message}`);
      }
    },
  };

  const results = [];
  for (const p of platforms) {
    process.stdout.write(`[fav] ${p} ... `);
    const r = await syncPlatform(p, settings, deps);
    if (r.ok) console.log(`ok, ${r.items.length} 项`);
    else console.log(`FAILED: ${r.error}`);
    results.push(r);
  }

  const failed = results.filter((r) => !r.ok);

  if (args["dry-run"]) {
    let wouldAdd = 0;
    for (const r of results) {
      if (!r.ok) continue;
      const fresh = r.items.filter((it) => !existing.favIds.has(it.favId) && !existing.urls.has(it.url));
      wouldAdd += fresh.length;
      for (const it of fresh) console.log(`   ~ ${it.title}`);
    }
    console.log(`\n[fav] dry-run: 将新增 ${wouldAdd} 条（未落盘）`);
    if (failed.length) process.exitCode = 1;
    return;
  }

  const report = await writeNewItems(
    makeFsAdapter(vault),
    existing.favIds,
    existing.urls,
    results,
    (items) =>
      enrichYoutubeDates(
        { ytdlpPath: settings.ytdlpPath, cookieFile: settings.ytCookieFile },
        items
      )
  );

  console.log(`\n[fav] 新增 ${report.added} 条`);
  for (const p of report.addedPaths) console.log(`   + ${p}`);

  if (failed.length) {
    console.log(`\n[fav] ${failed.length} 个平台失败`);
    process.exitCode = 1;
  }
}

async function cmdList() {
  const vault = await resolveVault();
  const { cardFromNote } = await import(pathToFileURL(path.join(DIST, "markdown", "writer.js")));
  const stack = [path.join(vault, "Fav Collector")];
  const rows = [];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.name.endsWith(".md")) {
        const card = cardFromNote(p, await fs.readFile(p, "utf8"));
        if (card && (!args.platform || card.platform === args.platform)) rows.push(card);
      }
    }
  }
  rows.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  for (const c of rows) {
    console.log(`${c.platform.padEnd(10)} ${(c.publishedAt ?? "----------").padEnd(11)} ${c.title}`);
  }
  console.log(`\n[fav] 共 ${rows.length} 条`);
}

async function cmdStatus() {
  const vault = await resolveVault();
  const settings = await loadSettings(vault);
  const { PLATFORMS } = await import(pathToFileURL(path.join(DIST, "sync", "model.js")));
  console.log(`vault: ${vault}`);
  console.log(`yt-dlp: ${settings.ytdlpPath}`);
  console.log(`cookieFile: ${settings.ytCookieFile || "(firefox:vyp2edie.ytdlp)"}`);
  console.log(`小宇宙: ${settings.xyzAccessToken ? "已配置 token" : "未配置 token"}`);
  console.log(`平台: ${PLATFORMS.join(", ")}`);
  console.log("lastSync:");
  for (const [k, v] of Object.entries(settings.lastSync)) {
    console.log(`  ${k.padEnd(10)} ${v.ok ? "ok " : "ERR"} ${v.at}  +${v.added}${v.error ? "  " + v.error : ""}`);
  }
}

function printHelp() {
  console.log(`fav-collector CLI

用法：
  node cli.mjs sync   [--vault <path>] [--platforms <p1,p2>] [--dry-run]
  node cli.mjs list   [--vault <path>] [--platform <p>]
  node cli.mjs status [--vault <path>]

平台：bilibili, youtube, zhihu, x, github, xiaoyuzhou（默认全部）
环境变量 OBSIDIAN_VAULT 可设默认 vault 路径。
凭证复用 Obsidian 插件设置，不在 CLI 单独保存。`);
}

switch (cmd) {
  case "sync":
    await cmdSync();
    break;
  case "list":
    await cmdList();
    break;
  case "status":
    await cmdStatus();
    break;
  default:
    printHelp();
}
