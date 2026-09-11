/** 编排：各平台抓取 → 对照现存笔记去重 → 只写新文件。跑挂一个平台不影响其他。 */
import { collectBilibili } from "./bilibili.js";
import { collectYoutube, enrichYoutubeDates } from "./youtube.js";
import { collectZhihu } from "./zhihu.js";
import { collectX } from "./x.js";
import { buildNote, notePathFor } from "../markdown/writer.js";
import type { CollectedItem, HttpGet, Platform, PlatformResult } from "./model.js";
import { PLATFORMS } from "./model.js";

export interface RunnerSettings {
  biliCookies: string;
  xCookies: string;
  zhihuSecret: string;
  ytdlpPath: string;
  ytCookieFile?: string;
}

export interface FsAdapter {
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  write(path: string, content: string): Promise<void>;
}

export async function syncPlatform(
  platform: Platform,
  settings: RunnerSettings,
  http: HttpGet,
): Promise<PlatformResult> {
  try {
    let items: CollectedItem[];
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
    }
    return { platform, ok: true, items };
  } catch (e) {
    return { platform, ok: false, items: [], error: (e as Error).message };
  }
}

export interface SyncReport {
  added: number;
  addedPaths: string[];
  results: PlatformResult[];
}

/** existing: 已存在笔记的 fav_id + url（调用方扫 Vault 组装）。 */
export async function writeNewItems(
  fs: FsAdapter,
  existingFavIds: Set<string>,
  existingUrls: Set<string>,
  results: PlatformResult[],
  enrichYoutube: (items: CollectedItem[]) => Promise<void>,
): Promise<SyncReport> {
  const addedPaths: string[] = [];
  for (const r of results) {
    if (!r.ok) continue;
    const fresh = r.items.filter((it) => !existingFavIds.has(it.favId) && !existingUrls.has(it.url));
    if (r.platform === "youtube" && fresh.length > 0) {
      try {
        await enrichYoutube(fresh);
      } catch {
        // 日期补不上不阻塞落盘
      }
    }
    for (const it of fresh) {
      const p = notePathFor(it);
      const dir = p.slice(0, p.lastIndexOf("/"));
      await fs.mkdir(dir);
      if (await fs.exists(p)) continue; // 同名文件已存在则跳过，绝不覆盖
      await fs.write(p, buildNote(it));
      existingFavIds.add(it.favId);
      existingUrls.add(it.url);
      addedPaths.push(p);
    }
  }
  return { added: addedPaths.length, addedPaths, results };
}

export { PLATFORMS };
