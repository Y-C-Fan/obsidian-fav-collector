import type { CollectionDTO } from "@omni/shared-core";

export const DASHBOARD_PLATFORMS: Array<{ key: string; label: string }> = [
  { key: "bilibili", label: "B站" },
  { key: "youtube", label: "YouTube" },
  { key: "zhihu", label: "知乎" },
  { key: "x", label: "X" },
];

/* ---------------- 纯函数（可单测） ---------------- */

export function startOfToday(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function countToday(items: CollectionDTO[], now: Date = new Date()): number {
  const start = startOfToday(now).getTime();
  return items.filter((i) => new Date(i.collectedAt).getTime() >= start).length;
}

export function countUnorganized(items: CollectionDTO[]): number {
  return items.filter((i) => i.organizeStatus === "unorganized").length;
}

export function countExpanded(items: CollectionDTO[]): number {
  return items.filter((i) => !!i.expandedAt).length;
}

export interface DayBucket {
  date: string;
  label: string;
  count: number;
}

/** 最近 7 天（含今天）每天新增数，全部用本地日期对齐，与统计口径一致。 */
export function bucketLast7Days(items: CollectionDTO[], now: Date = new Date()): DayBucket[] {
  const days: DayBucket[] = [];
  for (let back = 6; back >= 0; back -= 1) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - back);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    const count = items.filter((i) => {
      const t = new Date(i.collectedAt).getTime();
      return t >= d.getTime() && t < next.getTime();
    }).length;
    days.push({
      date: `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`,
      label: `${d.getMonth() + 1}.${d.getDate()}`,
      count,
    });
  }
  return days;
}

/** 手画 SVG 迷你柱状图（无第三方依赖，颜色走 Obsidian 主题变量）。 */
export function buildTrendSvg(buckets: DayBucket[]): string {
  const W = 280;
  const H = 64;
  const PAD = 4;
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const n = buckets.length;
  const slot = (W - PAD * 2) / n;
  const barW = Math.max(6, Math.min(22, slot * 0.55));
  const rects = buckets
    .map((b, i) => {
      const h = Math.max(b.count > 0 ? 3 : 0, ((H - 22) * b.count) / max);
      const x = (PAD + slot * i + (slot - barW) / 2).toFixed(1);
      const y = (H - 14 - h).toFixed(1);
      const fill = i === n - 1 ? "var(--interactive-accent)" : "var(--text-faint)";
      return `<rect x="${x}" y="${y}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${fill}"><title>${b.label} 新增 ${b.count}</title></rect>`;
    })
    .join("");
  const labels = buckets
    .map((b, i) => {
      const x = (PAD + slot * i + slot / 2).toFixed(1);
      const show = i % 2 === 1 || i === n - 1;
      return show ? `<text x="${x}" y="${H - 2}" font-size="8" text-anchor="middle" fill="var(--text-faint)">${b.label}</text>` : "";
    })
    .join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="近7天新增趋势">${rects}${labels}</svg>`;
}

export interface PlatformCard {
  key: string;
  label: string;
  count: number;
  today: number;
  health: "green" | "yellow" | "red";
  reason: string;
  lastSyncAt: string | null;
}

export function buildPlatformCards(
  statuses: Array<{ platform: string; count: number; lastSyncAt: string | null; health: { level: "green" | "yellow" | "red"; reason: string } }>,
  items: CollectionDTO[],
  now: Date = new Date(),
): PlatformCard[] {
  const start = startOfToday(now).getTime();
  const byPlatform = new Map(statuses.map((s) => [s.platform, s]));
  return DASHBOARD_PLATFORMS.map(({ key, label }) => {
    const st = byPlatform.get(key);
    const platformItems = items.filter((i) => i.platform === key);
    return {
      key,
      label,
      count: st?.count ?? platformItems.length,
      today: platformItems.filter((i) => new Date(i.collectedAt).getTime() >= start).length,
      health: st?.health.level ?? "yellow",
      reason: st?.health.reason || (st ? "" : "从未同步"),
      lastSyncAt: st?.lastSyncAt ?? null,
    };
  });
}

/** 最近收藏（按收藏时间倒序，失效内容沉底）。 */
export function recentItems(items: CollectionDTO[], n = 12): CollectionDTO[] {
  return [...items]
    .sort((a, b) => {
      const del = (a.contentStatus === "deleted" ? 1 : 0) - (b.contentStatus === "deleted" ? 1 : 0);
      if (del !== 0) return del;
      return new Date(b.collectedAt).getTime() - new Date(a.collectedAt).getTime();
    })
    .slice(0, n);
}

