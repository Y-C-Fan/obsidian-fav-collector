import path from "node:path";
import {
  CollectionRepository,
  CommentRepository,
  MigrationManager,
  RuleCenter,
  type CollectionRow,
  type CommentRow,
} from "@omni/database";
import { BrowserSessionManager } from "./browser-session.js";
import { buildAdapter } from "./sync-runner.js";

export interface ExpandOptions {
  dataDir: string;
  migrationsDir: string;
  /** 收藏 URL，或 `platform:platformItemId`（如 `x:123456`）。 */
  target: string;
  headless?: boolean;
  proxy?: string;
  /** 返回正文最大字符数（默认 20000，DB 内保留全文）。 */
  maxChars?: number;
}

export interface ExpandResult {
  collection: {
    id: string;
    platform: string;
    platformItemId: string;
    url: string;
    title: string | null;
  };
  detail: {
    title?: string;
    author?: string;
    description?: string;
    text?: string;
    textTruncated: boolean;
    publishedAt?: string;
    contentType?: string;
    deleted: boolean;
    commentCount: number;
    comments: Array<{ author: string; content: string }>;
  };
  /** 本次是否新抓取（false = 之前已展开过，直接返回库内存量）。 */
  fetched: boolean;
}

/**
 * 按需展开单条收藏的详情正文（Skill `expand` 的实现）：
 * 按 URL / platform:platformItemId 定位 → Adapter.fetchDetail → 回写
 * description/transcript/detail_synced → 返回 JSON 给调用方 Agent。
 * 之前已展开过的条目直接返回库内存量，不重复抓取。
 */
export async function expandCollection(opts: ExpandOptions): Promise<ExpandResult> {
  const dbPath = path.join(opts.dataDir, "OmniCollector.db");
  const manager = new MigrationManager(dbPath, opts.migrationsDir, path.join(opts.dataDir, "backup"));
  manager.migrate();
  const db = manager.getDb();
  try {
    const collections = new CollectionRepository(db);
    const row = resolveTarget(collections, opts.target.trim());
    if (!row) {
      throw new Error(
        `EXPAND_404: 找不到收藏（target=${opts.target}），请先同步该平台后再展开`,
      );
    }
    const stamp = new Date().toISOString();
    const comments = new CommentRepository(db);
    if (row.detail_synced === 1 && (row.description || row.transcript)) {
      return toResult(row, comments.getByCollection(row.id), false, opts.maxChars ?? 20000);
    }
    const rules = new RuleCenter(db);
    const adapter = buildAdapter(row.platform, opts.dataDir, rules);
    const sessions = new BrowserSessionManager({
      dataDir: opts.dataDir,
      headless: opts.headless,
      proxy: opts.proxy,
    });
    const ctx = await sessions.create(row.platform);
    try {
      const detail = await adapter.fetchDetail(ctx, row.url);
      if (detail.comments && detail.comments.length > 0) {
        comments.upsertComments(
          row.id,
          detail.comments.map((c) => ({
            comment_id: c.commentId,
            author: c.author,
            content: c.content,
            like_count: c.likeCount,
            posted_at: c.postedAt,
            is_creator_reply: c.isCreatorReply,
          })),
        );
      }
      const updated = collections.update(row.id, {
        title: detail.title ?? row.title ?? null,
        author: detail.author ?? row.author ?? null,
        cover_url: detail.coverUrl ?? row.cover_url ?? null,
        description: detail.description ?? row.description ?? null,
        transcript: detail.transcript ?? row.transcript ?? null,
        content_status: detail.deleted ? "deleted" : "active",
        sync_status: "full",
        detail_synced: 1,
        last_synced_at: stamp,
        platform_created_at: detail.publishedAt ?? row.platform_created_at ?? null,
        updated_at: stamp,
      });
      const fresh = (collections.findById(row.id) ?? updated) as CollectionRow;
      return toResult(fresh, comments.getByCollection(row.id), true, opts.maxChars ?? 20000);
    } finally {
      await sessions.close(ctx).catch(() => {});
    }
  } finally {
    manager.close();
  }
}

function resolveTarget(collections: CollectionRepository, target: string): CollectionRow | undefined {
  const byUrl = collections.findByUrl(target);
  if (byUrl) return byUrl;
  const m = /^([a-z0-9_]+):(.+)$/i.exec(target);
  if (m) {
    const found = collections.listAll(undefined, false).find(
      (c) => c.platform === m[1].toLowerCase() && c.platform_item_id === m[2],
    );
    if (found) return found;
  }
  return undefined;
}

function toResult(
  row: CollectionRow,
  commentRows: CommentRow[],
  fetched: boolean,
  maxChars: number,
): ExpandResult {
  const full = row.transcript || row.description || "";
  const truncated = full.length > maxChars;
  const comments = commentRows
    .filter((c) => c.content)
    .slice(0, 20)
    .map((c) => ({ author: c.author ?? "", content: String(c.content) }));
  return {
    collection: {
      id: row.id,
      platform: row.platform,
      platformItemId: row.platform_item_id,
      url: row.url,
      title: row.title ?? null,
    },
    detail: {
      title: row.title ?? undefined,
      author: row.author ?? undefined,
      description: row.description ?? undefined,
      text: truncated ? full.slice(0, maxChars) : full || undefined,
      textTruncated: truncated,
      publishedAt: row.platform_created_at ?? undefined,
      contentType: row.content_type,
      deleted: row.content_status === "deleted",
      commentCount: comments.length,
      comments,
    },
    fetched,
  };
}
