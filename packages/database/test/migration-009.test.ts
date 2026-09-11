import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, afterAll } from "vitest";
import { MigrationManager, RuleCenter } from "../src/index.js";

const REAL_MIGRATIONS = path.join(process.cwd(), "migrations");
const tmpDirs: string[] = [];
afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

describe("migration 009: drop xiaohongshu", () => {
  it("removes xiaohongshu rules and keeps the four platforms", () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-m009-"));
    tmpDirs.push(dataDir);
    const migDir = path.join(dataDir, "migrations");
    fs.cpSync(REAL_MIGRATIONS, migDir, { recursive: true });
    const manager = new MigrationManager(path.join(dataDir, "OmniCollector.db"), migDir, path.join(dataDir, "backup"));
    manager.migrate();
    expect(manager.currentVersion()).toBe(9);
    const rules = new RuleCenter(manager.getDb());
    expect(rules.get("xiaohongshu_sync_frequency")).toBeUndefined();
    expect(rules.get("bilibili_sync_frequency")).toBe("daily");
    expect(rules.get("youtube_sync_frequency")).toBe("daily");
    expect(rules.get("zhihu_sync_frequency")).toBe("daily");
    expect(rules.get("x_sync_frequency")).toBe("daily");
    manager.close();
  });
});
