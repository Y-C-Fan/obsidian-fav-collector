/**
 * 落盘：Fav Collector/{平台}[/{收藏夹|稍后再看}]/{日期_}{标题}.md。
 * 只创建新文件，绝不改写旧文件（用户区天然安全）。
 */
import type { CollectedItem, Platform } from "../sync/model.js";

export function sanitizeFilename(name: string): string {
  return (name || "untitled").replace(/[\\/:*?"<>|]/g, "_").slice(0, 120);
}

function yamlString(v: string): string {
  return JSON.stringify(String(v ?? ""));
}

export function notePathFor(item: Pick<CollectedItem, "platform" | "title" | "folder" | "watchLater" | "publishedAt">): string {
  const dir = item.folder?.trim() || (item.watchLater ? "稍后再看" : undefined);
  const base = `Fav Collector/${item.platform}${dir ? `/${sanitizeFilename(dir)}` : ""}`;
  const datePrefix = item.publishedAt?.trim() ? `${item.publishedAt.trim()}_` : "";
  return `${base}/${datePrefix}${sanitizeFilename(item.title)}.md`;
}

export function buildNote(item: CollectedItem): string {
  const fm = [
    "---",
    `platform: ${yamlString(item.platform)}`,
    `fav_id: ${yamlString(item.favId)}`,
    `url: ${yamlString(item.url)}`,
    ...(item.author ? [`author: ${yamlString(item.author)}`] : []),
    ...(item.publishedAt ? [`published_at: ${yamlString(item.publishedAt)}`] : []),
    ...(item.folder ? [`folder: ${yamlString(item.folder)}`] : []),
    ...(item.coverUrl ? [`cover: ${yamlString(item.coverUrl)}`] : []),
    "---",
    "",
    `# ${item.title.replace(/#/g, "\\#")}`,
    "",
    ...(item.coverUrl ? [`![cover](${item.coverUrl})`, ""] : []),
    ...(item.author ? [`作者：${item.author}`, ""] : []),
    ...(item.publishedAt ? [`发布日期：${item.publishedAt}`, ""] : []),
    ...(item.description ? ["## 简介", "", item.description, ""] : []),
    "<!-- 以下为用户私有编辑区，任何自动化逻辑禁止修改 -->",
    "## 我的笔记",
    "",
  ];
  return fm.join("\n");
}

export interface NoteIndex {
  /** fav_id 集合（新笔记）+ url 集合（兼容无 fav_id 的旧笔记）。 */
  favIds: Set<string>;
  urls: Set<string>;
}

/** 解析 frontmatter（dashboard + 去重共用，极简 YAML 子集）。 */
export function parseFrontmatter(md: string): Record<string, string> {
  const out: Record<string, string> = {};
  const m = md.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return out;
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i <= 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      try {
        v = JSON.parse(v) as string;
      } catch {
        v = v.slice(1, -1);
      }
    }
    if (k) out[k] = v;
  }
  return out;
}

export interface CardData {
  path: string;
  platform: Platform;
  title: string;
  url: string;
  author?: string;
  publishedAt?: string;
  folder?: string;
  cover?: string;
  description?: string;
}

export function cardFromNote(path: string, md: string): CardData | null {
  const fm = parseFrontmatter(md);
  if (!fm.platform || !fm.url) return null;
  // 旧版笔记第一个 H1 是系统区标记行，跳过它取真正的标题
  const headings = [...md.matchAll(/^# (.+)$/gm)].map((m) => m[1]).filter((h) => h !== "Fav Collector System Zone");
  const title = (headings[0] ?? fm.url).replace(/\\#/g, "#");
  let cover = fm.cover;
  if (!cover && fm.platform === "youtube") {
    // flat 抓取没有缩略图：yt 封面 URL 是确定性规则，直接拼
    const m = fm.url.match(/watch\?v=([\w-]{6,})/);
    if (m) cover = `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg`;
  }
  let description: string | undefined;
  const introM = md.match(/^## 简介\s*\n([\s\S]*?)(?=^## |^# |<!--|\Z)/m);
  if (introM) description = introM[1].trim().slice(0, 200) || undefined;
  return {
    path,
    platform: fm.platform as Platform,
    title,
    url: fm.url,
    author: fm.author,
    publishedAt: fm.published_at,
    folder: fm.folder,
    cover,
    description,
  };
}
