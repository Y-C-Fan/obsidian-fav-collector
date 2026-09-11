/**
 * 小宇宙「我的收藏」单集：POST /v1/favorite/list。
 * 轮子来源（MIT/公开文档，逻辑移植，非复制）：
 * - r266-tech/xiaoyuzhou：Android 请求头、401 自愈刷新（POST app_auth_tokens.refresh）、episode 字段归一化
 * - ultrazg/xyz：/v1/favorite/list 端点定义
 * 只读（仅拉收藏列表），温和调用；转写/下载不在本插件范围。
 */
import { makeItem, sleep, toDateOnly } from "./model.js";
import type { CollectedItem } from "./model.js";

const API = "https://api.xiaoyuzhoufm.com";

export class XiaoyuzhouError extends Error {}

export interface XyzCreds {
  accessToken: string;
  refreshToken?: string;
  deviceId?: string;
}

/** 带响应头的 POST（刷新 token 要读响应头，用 requestUrl 实现）。 */
export interface XyzHttp {
  post(
    url: string,
    body: unknown,
    headers: Record<string, string>,
  ): Promise<{ data: unknown; headers: Record<string, string>; status: number }>;
}

function appHeaders(accessToken?: string, deviceId?: string): Record<string, string> {
  const now = new Date();
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  const off = -now.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const local = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}T${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}.${p(now.getMilliseconds(), 3)}${sign}${p(Math.floor(Math.abs(off) / 60))}00`;
  const h: Record<string, string> = {
    Host: "api.xiaoyuzhoufm.com",
    os: "android",
    "os-version": "28",
    manufacturer: "Xiaomi",
    model: "MI 6",
    market: "xiaomi",
    applicationid: "app.podcast.cosmos",
    "app-version": "2.99.1",
    "app-buildno": "1362",
    "User-Agent": "Xiaoyuzhou/2.99.1(android 28)",
    timezone: "Asia/Shanghai",
    "local-time": local,
    "content-type": "application/json;charset=utf-8",
  };
  if (accessToken) h["x-jike-access-token"] = accessToken;
  if (deviceId) h["x-jike-device-id"] = deviceId;
  return h;
}

function stripHtml(html: string): string {
  return (html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
}

export function findEpisodeArrays(obj: unknown): Array<Record<string, unknown>> {
  // 防御性解析：收藏接口返回形态可能变化，找"长得像单集列表"的数组
  if (Array.isArray(obj)) {
    if (obj.length > 0 && typeof obj[0] === "object" && obj[0] !== null && ("eid" in obj[0] || "episodeId" in obj[0])) {
      return obj as Array<Record<string, unknown>>;
    }
    for (const v of obj) {
      const hit = findEpisodeArrays(v);
      if (hit.length > 0) return hit;
    }
    return [];
  }
  if (obj && typeof obj === "object") {
    // 包装形态 { episode: {...} } 也算
    const rec = obj as Record<string, unknown>;
    if (typeof rec.eid === "string") return [rec];
    for (const v of Object.values(rec)) {
      const hit = findEpisodeArrays(v);
      if (hit.length > 0) return hit;
    }
  }
  return [];
}

export function episodeToItem(raw: Record<string, unknown>): CollectedItem | null {
  const eid = (raw.eid ?? raw.episodeId) as string | undefined;
  if (!eid) return null;
  const podcast = (raw.podcast ?? {}) as Record<string, unknown>;
  const title = ((raw.title as string) || "(无标题)").slice(0, 150);
  const it = makeItem("xiaoyuzhou", eid, `https://www.xiaoyuzhoufm.com/episode/${eid}`, title);
  const podTitle = (podcast.title as string) || undefined;
  it.author = podTitle;
  it.folder = podTitle; // 天然分类：按播客节目归档
  it.description = stripHtml((raw.shownotes ?? raw.description) as string).slice(0, 200) || undefined;
  const image = (raw.image ?? {}) as Record<string, unknown>;
  it.coverUrl = (image.picUrl as string) || undefined;
  it.publishedAt = toDateOnly(raw.pubDate ?? raw.publishDate ?? raw.createdAt);
  const duration = raw.duration as number | undefined;
  if (typeof duration === "number" && duration > 0) {
    const m = Math.floor(duration / 60000) || Math.floor(duration / 60);
    if (!it.description) it.description = `约 ${m} 分钟`;
  }
  return it;
}

export async function collectXiaoyuzhou(
  http: XyzHttp,
  creds: XyzCreds,
  onCreds?: (next: XyzCreds) => void,
): Promise<CollectedItem[]> {
  if (!creds.accessToken.trim()) {
    throw new XiaoyuzhouError("小宇宙未登录：设置页填 access_token（短信登录一次即可，见仓库 scripts/xyz_login.py）");
  }
  let token = creds.accessToken.trim();
  const deviceId = creds.deviceId?.trim() || undefined;

  const call = async (payload: Record<string, unknown>) => {
    const r = await http.post(`${API}/v1/favorite/list`, payload, appHeaders(token, deviceId));
    if (r.status === 401 && creds.refreshToken?.trim()) {
      // 自愈刷新（r266 同款）
      const rr = await http.post(
        `${API}/app_auth_tokens.refresh`,
        {},
        { ...appHeaders(undefined, deviceId), "x-jike-refresh-token": creds.refreshToken.trim() },
      );
      const newAccess = rr.headers["x-jike-access-token"] ?? (rr.data as Record<string, unknown>)["x-jike-access-token"];
      if (typeof newAccess === "string" && newAccess) {
        token = newAccess;
        const newRefresh =
          rr.headers["x-jike-refresh-token"] ?? (rr.data as Record<string, unknown>)["x-jike-refresh-token"];
        onCreds?.({
          accessToken: token,
          refreshToken: typeof newRefresh === "string" ? newRefresh : creds.refreshToken,
          deviceId,
        });
        return http.post(`${API}/v1/favorite/list`, payload, appHeaders(token, deviceId));
      }
    }
    return r;
  };

  const items: CollectedItem[] = [];
  const seen = new Set<string>();
  let loadMoreKey: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    let r: { data: unknown; status: number };
    try {
      r = await call(loadMoreKey ? { loadMoreKey } : {});
    } catch (e) {
      throw new XiaoyuzhouError(`小宇宙收藏抓取失败: ${(e as Error).message.slice(0, 150)}`);
    }
    if (r.status === 401) {
      throw new XiaoyuzhouError("小宇宙登录过期：重登后更新设置页 token（scripts/xyz_login.py）");
    }
    if (r.status !== 200) {
      throw new XiaoyuzhouError(`小宇宙接口返回 HTTP ${r.status}`);
    }
    const body = (r.data ?? {}) as Record<string, unknown>;
    const raws = findEpisodeArrays(body.data ?? body);
    let fresh = 0;
    for (const raw of raws) {
      const it = episodeToItem(raw);
      if (it && !seen.has(it.nativeId)) {
        seen.add(it.nativeId);
        items.push(it);
        fresh += 1;
      }
    }
    const next = (body.loadMoreKey ?? body.nextLoadMoreKey) as string | undefined;
    if (!next || fresh === 0) break;
    loadMoreKey = next;
    await sleep(500);
  }
  return items;
}
