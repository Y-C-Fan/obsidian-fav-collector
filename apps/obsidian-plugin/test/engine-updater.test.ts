import { describe, expect, it } from "vitest";
import { ensureEngineUpToDate, type FileAdapter } from "../src/sync/engine-updater.js";

function memAdapter(seed: Record<string, string> = {}): FileAdapter & { store: Map<string, string> } {
  const store = new Map(Object.entries(seed));
  return {
    store,
    exists: async (p) => store.has(p),
    read: async (p) => {
      const v = store.get(p);
      if (v === undefined) throw new Error(`ENOENT ${p}`);
      return v;
    },
    write: async (p, c) => {
      store.set(p, c);
    },
    mkdir: async () => {},
    listFiles: async (p) => {
      const prefix = `${p}/`;
      return [...store.keys()].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
    },
  };
}

describe("ensureEngineUpToDate", () => {
  it("copies bundle + migrations on version mismatch", () => {
    const adp = memAdapter({
      "plugin/engine.version": "0.7.6\n",
      "plugin/engine.cjs": "// bundle",
      "plugin/migrations/001_initial.sql": "CREATE TABLE t;",
      "data/engine/.version": "0.7.5\n",
      "data/engine/engine.cjs": "// old",
    });
    return ensureEngineUpToDate(adp, "plugin", "data").then((r) => {
      expect(r).toEqual({ status: "updated", version: "0.7.6" });
      expect(adp.store.get("data/engine/engine.cjs")).toBe("// bundle");
      expect(adp.store.get("data/engine/migrations/001_initial.sql")).toBe("CREATE TABLE t;");
      expect(adp.store.get("data/engine/.version")).toBe("0.7.6\n");
    });
  });

  it("skips when versions match", () => {
    const adp = memAdapter({
      "plugin/engine.version": "0.7.6\n",
      "data/engine/.version": "0.7.6\n",
    });
    return ensureEngineUpToDate(adp, "plugin", "data").then((r) => {
      expect(r).toEqual({ status: "current", version: "0.7.6" });
    });
  });

  it("skips when no bundled version (old release layout)", () => {
    const adp = memAdapter({ "data/engine/.version": "0.7.5\n" });
    return ensureEngineUpToDate(adp, "plugin", "data").then((r) => {
      expect(r.status).toBe("skipped");
    });
  });
});
