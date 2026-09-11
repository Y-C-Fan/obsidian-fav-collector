import { describe, expect, it } from "vitest";
import { parseXhsFavoritedNotes } from "../src/xiaohongshu/xiaohongshu.adapter.js";
import { parseZhihuFavContents } from "../src/zhihu/zhihu.adapter.js";

describe("parseXhsFavoritedNotes", () => {
  it("parses feed-style noteCard shape", () => {
    const json = {
      code: 0,
      data: {
        cursor: "abc",
        has_more: true,
        notes: [
          {
            id: "64a1b2c3000000001302abcd",
            modelType: "note",
            noteCard: {
              noteId: "64a1b2c3000000001302abcd",
              displayTitle: "我的收藏笔记",
              user: { nickname: "作者A", avatar: "https://x/avatar.jpg" },
              cover: { url: "https://x/cover.jpg" },
              type: "normal",
            },
          },
          {
            id: "note2",
            modelType: "video",
            noteCard: {
              noteId: "note2",
              displayTitle: "视频笔记",
              user: { nickname: "作者B" },
              cover: { url: "https://x/v.jpg" },
              type: "video",
            },
          },
        ],
      },
    };
    const notes = parseXhsFavoritedNotes(json);
    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatchObject({
      noteId: "64a1b2c3000000001302abcd",
      title: "我的收藏笔记",
      author: "作者A",
      coverUrl: "https://x/cover.jpg",
    });
    expect(notes[1].video).toBe(true);
  });

  it("parses flat note shape", () => {
    const json = {
      data: {
        items: [
          {
            note_id: "n1",
            title: "扁平结构",
            user: { nickname: "作者C" },
            cover: { url: "https://x/c.jpg" },
          },
        ],
      },
    };
    const notes = parseXhsFavoritedNotes(json);
    expect(notes[0]).toMatchObject({ noteId: "n1", title: "扁平结构", author: "作者C" });
  });

  it("parses live collect/page shape (display_title + xsec_token)", () => {
    const json = {
      code: 0,
      data: {
        cursor: "abc",
        has_more: true,
        notes: [
          {
            note_id: "6a7331db000000002402e6e7",
            xsec_token: "ABY31dOwIA10UYBZmrQCYgVkU5EesnPGG-1fWuSsN4tlc=",
            display_title: "AGENTS.md让AI通过率100%🚀",
            type: "normal",
            cover: { height: 2400, width: 1440, url: "https://sns-na-i2.xhscdn.com/x.jpg" },
            user: { user_id: "6268f01b000000002102a65e", nickname: "ArchGenAI" },
          },
          {
            note_id: "note-video",
            display_title: "打印肌肉?画条线就能拆模型?这插件有点东西",
            type: "video",
            cover: { url: "https://x/v.jpg" },
            user: { nickname: "CG快报" },
          },
        ],
      },
    };
    const notes = parseXhsFavoritedNotes(json);
    expect(notes[0]).toMatchObject({
      noteId: "6a7331db000000002402e6e7",
      title: "AGENTS.md让AI通过率100%🚀",
      author: "ArchGenAI",
      coverUrl: "https://sns-na-i2.xhscdn.com/x.jpg",
    });
    expect(notes[1].video).toBe(true);
  });

  it("returns [] for unknown payload", () => {
    expect(parseXhsFavoritedNotes({ data: {} })).toEqual([]);
    expect(parseXhsFavoritedNotes(null)).toEqual([]);
  });
});

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
