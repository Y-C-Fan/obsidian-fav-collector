import { describe, expect, it } from "vitest";
import {
  extractYoutubeId,
  extractXiaohongshuId,
  extractZhihuId,
  parseZhihuFavContents,
  extractXId,
  extractUgcSeason,
  YouTubeAdapter,
  XiaohongshuAdapter,
  ZhihuAdapter,
  XAdapter,
} from "../src/index.js";

describe("platform id extraction", () => {
  it("youtube", () => {
    expect(extractYoutubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractYoutubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractYoutubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractYoutubeId("https://example.com/none")).toBeNull();
  });

  it("xiaohongshu", () => {
    expect(extractXiaohongshuId("https://www.xiaohongshu.com/explore/64a1b2c3000000001302abcd")).toBe(
      "64a1b2c3000000001302abcd",
    );
    expect(extractXiaohongshuId("https://www.xiaohongshu.com/discovery/item/123456")).toBe("123456");
    expect(extractXiaohongshuId("https://example.com")).toBeNull();
  });

  it("zhihu", () => {
    expect(extractZhihuId("https://www.zhihu.com/question/123/answer/456")).toBe("answer-456");
    expect(extractZhihuId("https://zhuanlan.zhihu.com/p/789")).toBe("p-789");
    expect(extractZhihuId("https://www.zhihu.com/zvideo/101112")).toBe("zvideo-101112");
    expect(extractZhihuId("https://www.zhihu.com/question/123")).toBe("q-123");
    expect(extractZhihuId("https://example.com")).toBeNull();
  });

  it("x", () => {
    expect(extractXId("https://x.com/someuser/status/123456789")).toBe("123456789");
    expect(extractXId("https://twitter.com/someuser/status/123456789")).toBe("123456789");
    expect(extractXId("https://x.com/home")).toBeNull();
  });
});

describe("zhihu favlist_contents parsing", () => {
  it("parses items and paging", () => {
    const body = {
      Code: 0,
      Data: {
        Items: [
          {
            Url: "https://www.zhihu.com/question/1/answer/2",
            Title: "测试回答",
            Author: { Name: "作者A" },
            Summary: "摘要",
            ContentType: "answer",
            FavTime: "2026-09-01T00:00:00Z",
          },
          { Title: "无链接条目" },
        ],
        Paging: { IsEnd: false, NextOffset: 50 },
      },
    };
    const { items, isEnd, nextOffset } = parseZhihuFavContents(body, "默认收藏夹");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: "测试回答", author: "作者A", favlist: "默认收藏夹" });
    expect(isEnd).toBe(false);
    expect(nextOffset).toBe(50);
  });
});

describe("adapter normalize mapping", () => {
  it("maps raw to UniversalCollection per platform", () => {
    const yt = new YouTubeAdapter().normalize(
      { platformItemId: "dQw4w9WgXcQ", url: "https://youtu.be/dQw4w9WgXcQ", title: "T", saveType: "favorited" },
      { description: "d", contentType: "video" },
    );
    expect(yt.platform).toBe("youtube");
    expect(yt.contentType).toBe("video");

    const xhs = new XiaohongshuAdapter().normalize(
      { platformItemId: "note1", url: "https://www.xiaohongshu.com/explore/note1", title: "N", saveType: "favorited" },
    );
    expect(xhs.platform).toBe("xiaohongshu");
    expect(xhs.contentType).toBe("note");

    const zh = new ZhihuAdapter().normalize(
      {
        platformItemId: "answer-2",
        url: "https://www.zhihu.com/question/1/answer/2",
        title: "Z",
        saveType: "favorited",
        extra: { contentType: "answer" },
      },
    );
    expect(zh.platform).toBe("zhihu");
    expect(zh.contentType).toBe("answer");

    const x = new XAdapter().normalize(
      { platformItemId: "123", url: "https://x.com/u/status/123", title: "X", saveType: "liked" },
    );
    expect(x.platform).toBe("x");
    expect(x.contentType).toBe("tweet");
    expect(x.saveType).toBe("liked");
  });
});

describe("extractUgcSeason", () => {
  it("extracts series info from bilibili view detail", () => {
    const json = {
      data: {
        ugc_season: { id: 123, title: "RIGϵ��", season_id: 456, ep_count: 10 },
      },
    };
    expect(extractUgcSeason(json)).toMatchObject({ title: "RIGϵ��", epCount: 10 });
  });

  it("returns null when no ugc_season", () => {
    expect(extractUgcSeason({ data: {} })).toBeNull();
    expect(extractUgcSeason(null)).toBeNull();
  });
});
