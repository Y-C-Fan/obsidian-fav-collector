import { describe, expect, it } from "vitest";
import { parseZhihuFavContents } from "../src/zhihu/zhihu.adapter.js";

describe("parseZhihuFavContents", () => {
  it("parses favlist contents (official open-platform shape)", () => {
    const json = {
      Code: 0,
      Data: {
        Items: [
          {
            Url: "https://www.zhihu.com/question/1/answer/2",
            Title: "测试回答",
            Author: { Name: "作者A" },
            Summary: "摘要内容",
            ContentType: "answer",
            FavTime: "2026-09-01T00:00:00Z",
          },
        ],
        Paging: { IsEnd: true, NextOffset: 0 },
      },
    };
    const { items, isEnd } = parseZhihuFavContents(json, "默认收藏夹");
    expect(items[0]).toMatchObject({
      url: "https://www.zhihu.com/question/1/answer/2",
      title: "测试回答",
      author: "作者A",
      favlist: "默认收藏夹",
      contentType: "answer",
    });
    expect(isEnd).toBe(true);
  });

  it("skips items without url", () => {
    const json = {
      Code: 0,
      Data: { Items: [{ Title: "无链接" }], Paging: { IsEnd: true } },
    };
    const { items } = parseZhihuFavContents(json, "默认收藏夹");
    expect(items).toEqual([]);
  });

  it("returns [] for unknown payload", () => {
    expect(parseZhihuFavContents({ Data: {} }, "默认收藏夹").items).toEqual([]);
    expect(parseZhihuFavContents(null, "默认收藏夹").items).toEqual([]);
  });
});
