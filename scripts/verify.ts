/** Manual verification driver (node, no Obsidian): runs all 4 collectors with real credentials. */
import fs from "node:fs";
import { collectBilibili } from "../src/sync/bilibili.js";
import { collectZhihu } from "../src/sync/zhihu.js";
import { collectX } from "../src/sync/x.js";
import { collectYoutube } from "../src/sync/youtube.js";

const creds = JSON.parse(fs.readFileSync(process.argv[2], "utf8")) as {
  bili: string;
  x: string;
  zhihu: string;
};

const http = async (url: string, headers?: Record<string, string>) => {
  const res = await fetch(url, { headers: headers as HeadersInit });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

const main = async () => {
  const bili = await collectBilibili(http, creds.bili).catch((e) => ({ error: String(e) }));
  console.log("bilibili:", Array.isArray(bili) ? `${bili.length} items` : bili);
  const zhihu = await collectZhihu(http, creds.zhihu).catch((e) => ({ error: String(e) }));
  console.log("zhihu:", Array.isArray(zhihu) ? `${zhihu.length} items` : zhihu);
  const x = await collectX(http, creds.x).catch((e) => ({ error: String(e) }));
  console.log("x:", Array.isArray(x) ? `${x.length} items` : x);
  const yt = await collectYoutube({
    ytdlpPath: "D:\\DevEnv\\bin\\yt-dlp.exe",
  }).catch((e) => ({ error: String(e) }));
  console.log("youtube:", Array.isArray(yt) ? `${yt.length} items` : yt);
};

void main();
