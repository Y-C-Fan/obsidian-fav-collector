import type { BrowserContext, Page } from "playwright";
import {
  BaseAdapter,
  type CollectionDetail,
  type CollectionRaw,
  type SyncCursor,
  type UniversalCollection,
} from "../base-adapter.js";

/** 知乎内容 ID：/question/{qid}/answer/{aid}、/p/{id}、/zvideo/{id}。 */
export function extractZhihuId(url: string): string | null {
  const answer = /\/question\/\d+\/answer\/(\d+)/.exec(url);
  if (answer?.[1]) return `answer-${answer[1]}`;
  const post = /\/(?:p|pin)\/(\d+)/.exec(url);
  if (post?.[1]) return `p-${post[1]}`;
  const zvideo = /\/zvideo\/(\d+)/.exec(url);
  if (zvideo?.[1]) return `zvideo-${zvideo[1]}`;
  const question = /\/question\/(\d+)/.exec(url);
  if (question?.[1]) return `q-${question[1]}`;
  return null;
}

const OPEN_BASE = "https://developer.zhihu.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";

interface ZhihuFavItem {
  urlToken: string;
  title: string;
}

interface ZhihuContentItem {
  url: string;
  title: string;
  author?: string;
  summary?: string;
  contentType?: string;
  favTime?: string;
  favlist: string;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

/** 解析 favlist_contents 响应（Data.Items + Data.Paging）。 */
export function parseZhihuFavContents(
  json: unknown,
  favlistTitle: string,
): { items: ZhihuContentItem[]; isEnd: boolean; nextOffset: number } {
  const data = asRecord(asRecord(json)?.Data) ?? {};
  const rawItems = Array.isArray(data.Items) ? data.Items : [];
  const items: ZhihuContentItem[] = [];
  for (const raw of rawItems) {
    const it = asRecord(raw);
    if (!it) continue;
    const url = it.Url as string | undefined;
    if (!url) continue;
    const author = asRecord(it.Author);
    items.push({
      url,
      title: String(it.Title ?? "(无标题)").slice(0, 150),
      author: author?.Name as string | undefined,
      summary: (it.Summary as string | undefined)?.slice(0, 200) || undefined,
      contentType: it.ContentType as string | undefined,
      favTime: it.FavTime as string | undefined,
      favlist: favlistTitle,
    });
  }
  const paging = asRecord(data.Paging) ?? {};
  const isEnd = paging.IsEnd !== false;
  const nextOffset = Number(paging.NextOffset ?? 0) || 0;
  return { items, isEnd, nextOffset };
}

/**
 * ZhihuAdapter（five-platform 版新增）：
 * 主路径为知乎官方开放平台直连（Access Secret 存于 Engine 本地加密区，
 * 由 SyncRunner 注入，本 Adapter 不接触凭据明文）；
 * 无 Secret 时回退浏览器驱动解析收藏页 DOM。
 * 注意：官方 API 仅覆盖公开范围内的收藏夹。
 */
export class ZhihuAdapter extends BaseAdapter {
  readonly platform = "zhihu";
  readonly listUrl = "https://www.zhihu.com/collections/mine";
  readonly itemSelector = ".CollectionDetailPage-list a[href*='/answer/'], .CollectionDetailPage-list a[href*='/p/']";
  readonly titleSelector = "a";
  readonly urlSelector = "a";
  readonly authorSelector = ".author";
  readonly coverSelector = "img";
  readonly nextPage = "scroll";

  private requests = 0;
  private failures = 0;

  constructor(private readonly options: { secret?: string } = {}) {
    super();
  }

  private get secret(): string {
    const s = this.options.secret?.trim();
    if (!s) throw new Error("AUTH_002: zhihu 缺少开放平台 Access Secret（请在设置中导入）");
    return s;
  }

  private async openGet(
    ctx: BrowserContext,
    path: string,
    params: Record<string, string | number>,
  ): Promise<unknown> {
    const res = await ctx.request.get(`${OPEN_BASE}${path}`, {
      params,
      headers: {
        Authorization: `Bearer ${this.secret}`,
        "X-Request-Timestamp": String(Math.floor(Date.now() / 1000)),
        "Content-Type": "application/json",
        "User-Agent": UA,
      },
    });
    this.requests += 1;
    if (res.status() === 401 || res.status() === 403) {
      throw new Error(`AUTH_002: 知乎开放平台鉴权失败 HTTP ${res.status()}，检查 Access Secret`);
    }
    if (!res.ok()) {
      this.failures += 1;
      throw new Error(`ZHIHU_API: ${path} HTTP ${res.status()}`);
    }
    const body = (await res.json()) as { Code?: number; Message?: string; Data?: unknown };
    if (body.Code === 20001) throw new Error("AUTH_002: 知乎开放平台鉴权失败（Code 20001）");
    if (body.Code === 30001 || body.Code === 30002) {
      throw new Error(`ZHIHU_API: 知乎开放平台限流/配额（Code ${body.Code}）`);
    }
    if (body.Code !== 0) {
      this.failures += 1;
      throw new Error(`ZHIHU_API: Code=${body.Code} ${body.Message ?? ""}`);
    }
    return body;
  }

  async authenticate(ctx: BrowserContext): Promise<void> {
    const page = await ctx.newPage();
    try {
      const status = await this.validateSession(page);
      if (status !== "valid") throw new Error("AUTH_002: zhihu session invalid");
    } finally {
      await page.close().catch(() => {});
    }
  }

  async validateSession(page: Page): Promise<"valid" | "invalid"> {
    try {
      const ctx = page.context();
      // 有 Secret 即走官方 API 校验
      if (this.options.secret?.trim()) {
        const body = (await this.openGet(ctx, "/api/v1/user/favlists", { Limit: 1 })) as {
          Data?: { Items?: unknown[] };
        };
        return Array.isArray(body.Data?.Items) ? "valid" : "invalid";
      }
      // 无 Secret：检查浏览器登录态（个人主页可达即有效）
      await page.goto("https://www.zhihu.com/collections/mine", {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await page.waitForTimeout(4000);
      const locked = await page.evaluate(() =>
        /登录|sign|login/i.test(document.title) && !document.querySelector(".CollectionDetailPage-list"),
      );
      return locked ? "invalid" : "valid";
    } catch (err) {
      if ((err as Error).message.startsWith("AUTH_")) throw err;
      return "invalid";
    }
  }

  async fetchCatalog(ctx: BrowserContext, _cursor: SyncCursor): Promise<CollectionRaw[]> {
    if (this.options.secret?.trim()) {
      try {
        return await this.fetchCatalogOpen(ctx);
      } catch (err) {
        if ((err as Error).message.startsWith("AUTH_")) throw err;
        // 官方接口异常时回退浏览器驱动
      }
    }
    return this.fetchCatalogBrowser(ctx);
  }

  /** 官方开放平台：全部收藏夹 × 分页拉取内容。 */
  private async fetchCatalogOpen(ctx: BrowserContext): Promise<CollectionRaw[]> {
    const favBody = (await this.openGet(ctx, "/api/v1/user/favlists", { Limit: 50 })) as {
      Data?: { Items?: Array<{ UrlToken?: string; Title?: string }> };
    };
    const favlists = favBody.Data?.Items ?? [];
    if (favlists.length === 0) {
      throw new Error("ZHIHU_API: 官方 API 未返回任何收藏夹（可能都未公开）");
    }
    const out: CollectionRaw[] = [];
    for (const fav of favlists) {
      const token = fav.UrlToken;
      if (!token) continue;
      const favTitle = fav.Title ?? "";
      let offset = 0;
      for (let page = 0; page < 40; page += 1) {
        const body = await this.openGet(ctx, "/api/v1/user/favlist_contents", {
          FavlistUrlToken: token,
          Offset: offset,
          Limit: 50,
        });
        const { items, isEnd, nextOffset } = parseZhihuFavContents(body, favTitle);
        for (const it of items) {
          const id = extractZhihuId(it.url) ?? it.url;
          out.push({
            platformItemId: id,
            url: it.url,
            title: it.title,
            author: it.author,
            collectedAt: it.favTime ?? new Date().toISOString(),
            saveType: "favorited",
            extra: {
              contentType: it.contentType ?? "answer",
              summary: it.summary,
              favlist: it.favlist,
            },
          });
        }
        if (isEnd) break;
        offset = nextOffset;
        if (page < 39) await new Promise((r) => setTimeout(r, 500)); // 官方接口友好限速
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    return out;
  }

  /** 浏览器驱动兜底：解析"我的收藏"页 DOM。 */
  private async fetchCatalogBrowser(ctx: BrowserContext): Promise<CollectionRaw[]> {
    const page = await ctx.newPage();
    try {
      await page.goto("https://www.zhihu.com/collections/mine", {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      });
      await page.waitForTimeout(5000);
      // 逐个收藏夹进入抓取（最多 20 个，避免风控）
      const favLinks = await page.evaluate(() =>
        Array.from(document.querySelectorAll("a[href*='/collection/']"))
          .map((a) => (a as HTMLAnchorElement).href)
          .filter((h, i, arr) => arr.indexOf(h) === i)
          .slice(0, 20),
      );
      const out: CollectionRaw[] = [];
      const targets = favLinks.length > 0 ? favLinks : [page.url()];
      for (const favUrl of targets) {
        if (favUrl !== page.url()) {
          await page.goto(favUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
          await page.waitForTimeout(3000);
        }
        for (let round = 0; round < 8; round += 1) {
          await page.mouse.wheel(0, 2400);
          await this.withRandomDelay(1200, 2500);
        }
        const items = await page.evaluate(() => {
          const rows: Array<{ href: string; title: string }> = [];
          for (const a of Array.from(
            document.querySelectorAll("a[href*='/question/'][href*='/answer/'], a[href^='/p/']"),
          )) {
            const href = (a as HTMLAnchorElement).href;
            const title = ((a as HTMLElement).innerText ?? "").trim().split("\n")[0];
            if (href && title) rows.push({ href, title });
          }
          return rows;
        });
        for (const it of items) {
          const id = extractZhihuId(it.href) ?? it.href;
          if (out.some((o) => o.platformItemId === id)) continue;
          out.push({
            platformItemId: id,
            url: it.href,
            title: it.title.slice(0, 150),
            collectedAt: new Date().toISOString(),
            saveType: "favorited",
            extra: { contentType: "answer", via: "browser" },
          });
        }
        await this.withRandomDelay(800, 2000);
      }
      return out;
    } finally {
      await page.close().catch(() => {});
    }
  }

  async fetchDetail(ctx: BrowserContext, url: string): Promise<CollectionDetail> {
    const page = await ctx.newPage();
    try {
      const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
      if (!res || res.status() === 404 || res.status() === 410) {
        return { contentType: "answer", deleted: true };
      }
      await page.waitForTimeout(4000);
      const meta = await page.evaluate(() => ({
        title:
          (document.querySelector("meta[property='og:title']")?.getAttribute("content") ?? "").trim() ||
          document.title,
        desc: (document.querySelector("meta[property='og:description']")?.getAttribute("content") ?? "").trim(),
        author: (document.querySelector("meta[name='author']")?.getAttribute("content") ?? "").trim(),
      }));
      return {
        title: meta.title || undefined,
        author: meta.author || undefined,
        description: meta.desc.slice(0, 500) || undefined,
        contentType: url.includes("/zvideo/") ? "video" : url.includes("/p/") ? "article" : "answer",
        comments: [],
      };
    } finally {
      await page.close().catch(() => {});
    }
  }

  normalize(raw: CollectionRaw, detail?: CollectionDetail): UniversalCollection {
    const extra = (raw.extra ?? {}) as { contentType?: string };
    return {
      platform: this.platform,
      platformItemId: raw.platformItemId,
      url: raw.url,
      title: detail?.title ?? raw.title,
      author: detail?.author ?? raw.author,
      coverUrl: raw.coverUrl,
      description: detail?.description ?? (raw.extra as { summary?: string } | undefined)?.summary,
      contentType: detail?.contentType ?? extra.contentType ?? "answer",
      saveType: raw.saveType,
      collectedAt: raw.collectedAt,
      publishedAt: detail?.publishedAt,
      comments: detail?.comments ?? [],
      status: detail?.deleted ? "deleted" : "active",
    };
  }

  async healthCheck() {
    return {
      platform: this.platform,
      parseFailureRate: this.failures / Math.max(this.requests, 1),
      slowPageRatio: 0,
      collectedAt: new Date().toISOString(),
    };
  }

  async cleanup(): Promise<void> {}
}
