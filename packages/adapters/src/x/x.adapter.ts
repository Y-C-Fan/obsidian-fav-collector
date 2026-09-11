import type { BrowserContext, Page } from "playwright";
import {
  BaseAdapter,
  type CollectionDetail,
  type CollectionRaw,
  type SyncCursor,
  type UniversalCollection,
} from "../base-adapter.js";

/** X 推文 ID：/{handle}/status/{id}。 */
export function extractXId(url: string): string | null {
  const m = /\/status\/(\d+)/.exec(url);
  return m?.[1] ?? null;
}

export interface XTweetItem {
  tweetId: string;
  url: string;
  text: string;
  author?: string;
  handle?: string;
  createdAt?: string;
}

/**
 * XAdapter（five-platform 版新增）：
 * 以浏览器驱动为主路径（Bookmarks 私有列表 + Likes 公开列表均需登录态），
 * Cookie 由 Engine 注入，本 Adapter 不接触明文凭据。
 * 采集上限：每个列表最多滚动 60 轮，避免风控。
 */
export class XAdapter extends BaseAdapter {
  readonly platform = "x";
  readonly listUrl = "https://x.com/i/bookmarks";
  readonly itemSelector = "article[data-testid='tweet']";
  readonly titleSelector = "div[data-testid='tweetText']";
  readonly urlSelector = "a[href*='/status/']";
  readonly authorSelector = "div[data-testid='User-Name']";
  readonly coverSelector = "img";
  readonly nextPage = "scroll";
  readonly commentSelector = "article[data-testid='tweet']";

  private requests = 0;
  private failures = 0;

  async authenticate(ctx: BrowserContext): Promise<void> {
    const page = await ctx.newPage();
    try {
      const status = await this.validateSession(page);
      if (status !== "valid") throw new Error("AUTH_002: x session invalid（需重新登录 x.com）");
    } finally {
      await page.close().catch(() => {});
    }
  }

  async validateSession(page: Page): Promise<"valid" | "invalid"> {
    try {
      const jar = Object.fromEntries((await page.context().cookies()).map((c) => [c.name, c.value]));
      if (!jar.auth_token) return "invalid";
      await page.goto("https://x.com/i/bookmarks", { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(5000);
      const loginWall = await page.evaluate(
        () => /Log in|登录/.test(document.title) && !document.querySelector("article[data-testid='tweet'], div[data-testid='emptyState']"),
      );
      return loginWall ? "invalid" : "valid";
    } catch {
      return "invalid";
    }
  }

  async fetchCatalog(ctx: BrowserContext, _cursor: SyncCursor): Promise<CollectionRaw[]> {
    const out: CollectionRaw[] = [];
    const seen = new Set<string>();
    // 1) Bookmarks（私有收藏，saveType=favorited）
    const bookmarks = await this.scrollTimeline(ctx, "https://x.com/i/bookmarks").catch((err) => {
      if ((err as Error).message.startsWith("AUTH_")) throw err;
      this.failures += 1;
      return [] as XTweetItem[];
    });
    for (const t of bookmarks) {
      if (seen.has(t.tweetId)) continue;
      seen.add(t.tweetId);
      out.push({
        platformItemId: t.tweetId,
        url: t.url,
        title: t.text.split("\n")[0].slice(0, 120) || "(无正文)",
        author: t.author ?? t.handle,
        collectedAt: new Date().toISOString(),
        saveType: "favorited",
        extra: { contentType: "tweet", handle: t.handle, createdAt: t.createdAt, note: t.text.slice(0, 400) },
      });
    }
    // 2) Likes（公开点赞，saveType=liked；handle 从页面状态解析）
    const handle = await this.resolveHandle(ctx);
    if (handle) {
      const likes = await this.scrollTimeline(ctx, `https://x.com/${handle}/likes`).catch(() => [] as XTweetItem[]);
      for (const t of likes) {
        if (seen.has(t.tweetId)) continue;
        seen.add(t.tweetId);
        out.push({
          platformItemId: t.tweetId,
          url: t.url,
          title: t.text.split("\n")[0].slice(0, 120) || "(无正文)",
          author: t.author ?? t.handle,
          collectedAt: new Date().toISOString(),
          saveType: "liked",
          extra: { contentType: "tweet", handle: t.handle, createdAt: t.createdAt, note: t.text.slice(0, 400) },
        });
      }
    }
    return out;
  }

  /** 解析当前登录用户的 handle（用于定位 Likes 页）。 */
  private async resolveHandle(ctx: BrowserContext): Promise<string | null> {
    const page = await ctx.newPage();
    try {
      await page.goto("https://x.com/home", { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(4000);
      return await page.evaluate(() => {
        const st = (window as unknown as { __INITIAL_STATE__?: unknown }).__INITIAL_STATE__;
        void st;
        // 优先从个人资料链接解析
        const profile = Array.from(document.querySelectorAll("a[href^='/'][data-testid='AppTabBar_Profile_Link']"))
          .map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? "")
          .find((h) => /^\/[A-Za-z0-9_]{1,15}$/.test(h));
        return profile ? profile.slice(1) : null;
      });
    } catch {
      return null;
    } finally {
      await page.close().catch(() => {});
    }
  }

  /** 滚动时间线并解析推文卡片（Bookmarks / Likes 通用）。 */
  private async scrollTimeline(ctx: BrowserContext, url: string): Promise<XTweetItem[]> {
    const page = await ctx.newPage();
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.waitForTimeout(6000);
      this.requests += 1;
      const collected = new Map<string, XTweetItem>();
      let still = 0;
      for (let round = 0; round < 60; round += 1) {
        const batch = await page.evaluate(() => {
          const rows: Array<{ id: string; url: string; text: string; author: string }> = [];
          for (const art of Array.from(document.querySelectorAll("article[data-testid='tweet']"))) {
            const link = Array.from(art.querySelectorAll("a[href*='/status/']"))
              .map((a) => (a as HTMLAnchorElement).href)
              .find((h) => /\/status\/\d+/.test(h));
            if (!link) continue;
            const id = (/\/status\/(\d+)/.exec(link) ?? [])[1];
            if (!id) continue;
            const text = ((art.querySelector("div[data-testid='tweetText']") as HTMLElement)?.innerText ?? "").trim();
            const name = ((art.querySelector("div[data-testid='User-Name']") as HTMLElement)?.innerText ?? "")
              .trim()
              .split("\n")[0];
            rows.push({ id, url: link.split("?")[0], text, author: name });
          }
          return rows;
        });
        let added = 0;
        for (const b of batch) {
          if (!collected.has(b.id)) {
            const handle = (/x\.com\/([^/]+)\/status/.exec(b.url) ?? [])[1];
            collected.set(b.id, {
              tweetId: b.id,
              url: b.url,
              text: b.text,
              author: b.author || undefined,
              handle,
            });
            added += 1;
          }
        }
        if (added === 0) {
          still += 1;
          if (still >= 3) break; // 连续 3 轮无新增，到底
        } else {
          still = 0;
        }
        await page.mouse.wheel(0, 3000);
        await this.withRandomDelay(1500, 3500);
      }
      return [...collected.values()];
    } finally {
      await page.close().catch(() => {});
    }
  }

  async fetchDetail(ctx: BrowserContext, url: string): Promise<CollectionDetail> {
    const id = extractXId(url);
    if (!id) throw new Error(`X_PARSE: cannot extract tweet id from ${url}`);
    const page = await ctx.newPage();
    try {
      const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.waitForTimeout(5000);
      if (!res || res.status() === 404) return { contentType: "tweet", deleted: true };
      const tombstone = await page.evaluate(
        () => document.body?.innerText.includes("This Post was deleted") || document.body?.innerText.includes("推文不存在"),
      );
      if (tombstone) return { contentType: "tweet", deleted: true };
      const detail = await page.evaluate(() => {
        const art = document.querySelector("article[data-testid='tweet']");
        const text = ((art?.querySelector("div[data-testid='tweetText']") as HTMLElement)?.innerText ?? "").trim();
        const author = ((art?.querySelector("div[data-testid='User-Name']") as HTMLElement)?.innerText ?? "")
          .trim()
          .split("\n")[0];
        const time = art?.querySelector("time")?.getAttribute("datetime") ?? undefined;
        return { text, author, time };
      });
      return {
        title: detail.text.split("\n")[0].slice(0, 120) || undefined,
        author: detail.author || undefined,
        description: detail.text.slice(0, 500) || undefined,
        contentType: "tweet",
        publishedAt: detail.time,
        comments: [],
      };
    } finally {
      await page.close().catch(() => {});
    }
  }

  normalize(raw: CollectionRaw, detail?: CollectionDetail): UniversalCollection {
    return {
      platform: this.platform,
      platformItemId: raw.platformItemId,
      url: raw.url,
      title: detail?.title ?? raw.title,
      author: detail?.author ?? raw.author,
      coverUrl: raw.coverUrl,
      description: detail?.description ?? (raw.extra as { note?: string } | undefined)?.note,
      contentType: "tweet",
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
