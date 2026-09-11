import { describe, expect, it } from "vitest";
import {
  bucketLast7Days,
  buildPlatformCards,
  buildTrendSvg,
  countExpanded,
  countToday,
  countUnorganized,
  recentItems,
} from "../src/ui/dashboard-stats.js";
import type { CollectionDTO } from "@omni/shared-core";

function dto(partial: Partial<CollectionDTO> & { id: string }): CollectionDTO {
  return {
    platform: "bilibili",
    platformItemId: partial.id,
    url: `https://example.com/${partial.id}`,
    title: partial.id,
    contentType: "video",
    saveType: "favorited",
    contentStatus: "active",
    syncStatus: "catalog",
    organizeStatus: "unorganized",
    priority: "normal",
    collectedAt: "2026-09-11T10:00:00",
    ...partial,
  } as CollectionDTO;
}

const NOW = new Date(2026, 8, 11, 15, 0, 0); // 本地 9-11 15:00

describe("dashboard stats", () => {
  it("counts today/unorganized/expanded", () => {
    const items = [
      dto({ id: "a", collectedAt: "2026-09-11T08:00:00" }),
      dto({ id: "b", collectedAt: "2026-09-10T08:00:00", organizeStatus: "organized" }),
      dto({ id: "c", collectedAt: "2026-09-11T09:00:00", expandedAt: "2026-09-11T10:00:00" }),
    ];
    expect(countToday(items, NOW)).toBe(2);
    expect(countUnorganized(items)).toBe(2);
    expect(countExpanded(items)).toBe(1);
  });

  it("buckets last 7 days", () => {
    const items = [
      dto({ id: "a", collectedAt: "2026-09-11T08:00:00" }),
      dto({ id: "b", collectedAt: "2026-09-11T09:00:00" }),
      dto({ id: "c", collectedAt: "2026-09-05T08:00:00" }),
    ];
    const buckets = bucketLast7Days(items, NOW);
    expect(buckets).toHaveLength(7);
    expect(buckets[6]).toMatchObject({ label: "9.11", count: 2 });
    expect(buckets[0]).toMatchObject({ label: "9.5", count: 1 });
    expect(buckets.slice(1, 6).every((b) => b.count === 0)).toBe(true);
  });

  it("builds svg with 7 bars", () => {
    const svg = buildTrendSvg(bucketLast7Days([dto({ id: "a" })], NOW));
    expect(svg).toContain("<svg");
    expect(svg.match(/<rect /g)?.length).toBe(7);
  });

  it("builds platform cards with fallback for never-synced", () => {
    const items = [dto({ id: "a", platform: "bilibili" }), dto({ id: "b", platform: "x" })];
    const cards = buildPlatformCards(
      [{ platform: "bilibili", count: 10, lastSyncAt: null, health: { level: "green", reason: "" } }],
      items,
      NOW,
    );
    expect(cards).toHaveLength(4);
    expect(cards[0]).toMatchObject({ key: "bilibili", count: 10, health: "green" });
    expect(cards[1]).toMatchObject({ key: "youtube", count: 0, health: "yellow" });
    expect(cards[3]).toMatchObject({ key: "x", count: 1 });
  });

  it("recents sort desc with deleted sunk", () => {
    const items = [
      dto({ id: "old", collectedAt: "2026-09-01T00:00:00" }),
      dto({ id: "new", collectedAt: "2026-09-11T00:00:00" }),
      dto({ id: "gone", collectedAt: "2026-09-11T12:00:00", contentStatus: "deleted" }),
    ];
    expect(recentItems(items, 10).map((i) => i.id)).toEqual(["new", "old", "gone"]);
  });
});
