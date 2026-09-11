import { describe, expect, it } from "vitest";
import { writeNewItems } from "../src/sync/runner.js";
import { makeItem } from "../src/sync/model.js";
import type { PlatformResult } from "../src/sync/model.js";

describe("runner dedup", () => {
  it("writes only new items and never overwrites", async () => {
    const store = new Map<string, string>([
      ["Fav Collector/bilibili/旧.md", '---\nplatform: "bilibili"\nfav_id: "bilibili:old"\nurl: "https://u/old"\n---\n'],
    ]);
    const fs = {
      exists: async (p: string) => store.has(p),
      mkdir: async () => {},
      write: async (p: string, c: string) => {
        store.set(p, c);
      },
    };
    const fresh = makeItem("bilibili", "new1", "https://u/new1", "新标题");
    const dupe = makeItem("bilibili", "old", "https://u/old", "旧标题");
    const results: PlatformResult[] = [{ platform: "bilibili", ok: true, items: [fresh, dupe] }];
    const report = await writeNewItems(fs, new Set(["bilibili:old"]), new Set(["https://u/old"]), results, async () => {});
    expect(report.added).toBe(1);
    expect(report.addedPaths).toEqual(["Fav Collector/bilibili/新标题.md"]);
    expect(store.get("Fav Collector/bilibili/旧.md")).toContain('fav_id: "bilibili:old"');
  });
});
