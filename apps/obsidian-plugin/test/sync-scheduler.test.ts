import { describe, expect, it } from "vitest";
import { dailyCapReached, isSyncDue, nextSyncAt, parseTimeOfDay } from "../src/sync/sync-scheduler.js";

describe("sync-scheduler", () => {
  it("schedules first sync soon when never synced", () => {
    const now = new Date("2026-08-14T00:00:00Z");
    const next = nextSyncAt({ frequency: "daily", lastRunAt: null, now });
    expect(next.getTime()).toBeGreaterThan(now.getTime());
    expect(next.getTime()).toBeLessThanOrEqual(now.getTime() + 10 * 60 * 1000);
  });

  it("daily schedule anchors at timeOfDay plus window offset", () => {
    // 上次 8-13 10:00（本地），锚点 09:00 + 24h → 8-14 09:00 起，窗口 120 分钟内
    const last = new Date(2026, 7, 13, 10, 0, 0);
    const next = nextSyncAt({
      frequency: "daily",
      lastRunAt: last.toISOString(),
      now: new Date(2026, 7, 12, 0, 0, 0),
      randomWindowMinutes: 120,
      timeOfDay: "09:00",
    });
    expect(next.getFullYear()).toBe(2026);
    expect(next.getMonth()).toBe(7);
    expect(next.getDate()).toBe(14);
    expect(next.getHours()).toBeGreaterThanOrEqual(9);
    expect(next.getHours()).toBeLessThanOrEqual(10);
    expect(next.getMinutes()).toBeGreaterThanOrEqual(0);
    expect(next.getMinutes()).toBeLessThanOrEqual(59);
    expect(next.getTime()).toBeGreaterThanOrEqual(new Date(2026, 7, 14, 9, 0, 0).getTime());
    expect(next.getTime()).toBeLessThan(new Date(2026, 7, 14, 11, 0, 0).getTime());
  });

  it("weekly schedule anchors at timeOfDay 7d after last run", () => {
    const last = new Date(2026, 6, 1, 15, 30, 0);
    const next = nextSyncAt({
      frequency: "weekly",
      lastRunAt: last.toISOString(),
      now: new Date(2026, 6, 2, 0, 0, 0),
      randomWindowMinutes: 0,
      timeOfDay: "09:00",
    });
    expect([next.getFullYear(), next.getMonth(), next.getDate()]).toEqual([2026, 6, 8]);
    expect([next.getHours(), next.getMinutes(), next.getSeconds()]).toEqual([9, 0, 0]);
  });

  it("parseTimeOfDay falls back to 09:00 on bad input", () => {
    expect(parseTimeOfDay("09:00")).toEqual({ h: 9, m: 0 });
    expect(parseTimeOfDay("21:30")).toEqual({ h: 21, m: 30 });
    expect(parseTimeOfDay("9:00")).toEqual({ h: 9, m: 0 });
    expect(parseTimeOfDay("25:00")).toEqual({ h: 9, m: 0 });
    expect(parseTimeOfDay(undefined)).toEqual({ h: 9, m: 0 });
  });

  it("isSyncDue and dailyCapReached", () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();
    expect(isSyncDue({ frequency: "daily", lastRunAt: twoDaysAgo, timeOfDay: "09:00" })).toBe(true);
    expect(isSyncDue({ frequency: "daily", lastRunAt: new Date().toISOString(), timeOfDay: "09:00" })).toBe(false);
    expect(dailyCapReached(3, 3)).toBe(true);
    expect(dailyCapReached(2, 3)).toBe(false);
  });
});
