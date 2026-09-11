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

describe("migration 008: five-platform switch", () => {
  it("removes makerworld/xiaoheihe rules and seeds zhihu/x rules", () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-m008-"));
    tmpDirs.push(dataDir);
    const migDir = path.join(dataDir, "migrations");
    fs.cpSync(REAL_MIGRATIONS, migDir, { recursive: true });
    const manager = new MigrationManager(path.join(dataDir, "OmniCollector.db"), migDir, path.join(dataDir, "backup"));
    manager.migrate();
    const rules = new RuleCenter(manager.getDb());
    expect(rules.get("makerworld_sync_likes")).toBeUndefined();
    expect(rules.get("makerworld_sync_frequency")).toBeUndefined();
    expect(rules.get("xiaoheihe_sync_frequency")).toBeUndefined();
    expect(rules.get("zhihu_sync_frequency")).toBe("daily");
    expect(rules.get("x_sync_frequency")).toBe("daily");
    expect(rules.get("zhihu_secret_set")).toBe("0");
    // 旧三平台频率规则保留
    expect(rules.get("bilibili_sync_frequency")).toBe("daily");
    expect(rules.get("youtube_sync_frequency")).toBe("daily");
    expect(rules.get("xiaohongshu_sync_frequency")).toBe("daily");
    manager.close();
  });
});
