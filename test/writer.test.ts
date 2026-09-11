import { describe, expect, it } from "vitest";
import { buildNote, cardFromNote, notePathFor, parseFrontmatter } from "../src/markdown/writer.js";
import { makeItem } from "../src/sync/model.js";

describe("writer", () => {
  it("notePathFor keeps folder/date conventions", () => {
    const base = makeItem("bilibili", "1_BV1", "https://u", "标题");
    expect(notePathFor(base)).toBe("Fav Collector/bilibili/标题.md");
    expect(notePathFor({ ...base, folder: "AI 学习" })).toBe("Fav Collector/bilibili/AI 学习/标题.md");
    expect(notePathFor({ ...base, watchLater: true })).toBe("Fav Collector/bilibili/稍后再看/标题.md");
    expect(notePathFor({ ...base, platform: "youtube", watchLater: true, publishedAt: "2024-01-15" })).toBe(
      "Fav Collector/youtube/稍后再看/2024-01-15_标题.md",
    );
    expect(notePathFor({ ...base, title: "a/b:c" })).toBe("Fav Collector/bilibili/a_b_c.md");
  });

  it("buildNote writes fav_id frontmatter and user zone", () => {
    const it = { ...makeItem("x", "123", "https://x.com/u/status/123", "hello"), author: "u", publishedAt: "2024-05-01" };
    const md = buildNote(it);
    expect(md).toContain('fav_id: "x:123"');
    expect(md).toContain('published_at: "2024-05-01"');
    expect(md).toContain("## 我的笔记");
  });

  it("parseFrontmatter + cardFromNote round-trip", () => {
    const it = {
      ...makeItem("zhihu", "https://zhihu.com/q/1", "https://zhihu.com/q/1", "问"),
      description: "简介内容",
      folder: "值得细读",
    };
    const card = cardFromNote("Fav Collector/zhihu/值得细读/问.md", buildNote(it));
    expect(card?.platform).toBe("zhihu");
    expect(card?.title).toBe("问");
    expect(card?.description).toBe("简介内容");
    expect(card?.folder).toBe("值得细读");
  });

  it("cardFromNote rejects files without platform/url", () => {
    expect(cardFromNote("a.md", "# hello\n")).toBeNull();
  });

  it("cardFromNote skips legacy system-zone marker heading", () => {
    const md = '---\nplatform: "youtube"\nurl: "https://u"\n---\n# Fav Collector System Zone\nxxx\n# 真标题\n';
    expect(cardFromNote("a.md", md)?.title).toBe("真标题");
  });
});
