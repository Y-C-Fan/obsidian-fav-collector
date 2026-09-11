import { describe, expect, it } from "vitest";
import { collectXiaoyuzhou, episodeToItem, findEpisodeArrays } from "../src/sync/xiaoyuzhou.js";

const ep = {
  eid: "e123",
  title: "单集标题",
  podcast: { pid: "p1", title: "播客名" },
  shownotes: "<p>简介<br/>第二行</p>",
  duration: 3600000,
  pubDate: "2026-09-10T12:00:00.000Z",
  image: { picUrl: "https://img/cover.jpg" },
};

describe("xiaoyuzhou", () => {
  it("episodeToItem maps fields with podcast as folder", () => {
    const it = episodeToItem(ep);
    expect(it?.url).toBe("https://www.xiaoyuzhoufm.com/episode/e123");
    expect(it?.favId).toBe("xiaoyuzhou:e123");
    expect(it?.folder).toBe("播客名");
    expect(it?.author).toBe("播客名");
    expect(it?.description).toBe("简介\n第二行");
    expect(it?.coverUrl).toBe("https://img/cover.jpg");
    expect(it?.publishedAt).toBe("2026-09-10");
    expect(episodeToItem({})).toBeNull();
  });

  it("findEpisodeArrays digs nested lists", () => {
    expect(findEpisodeArrays({ data: { list: [ep] } })).toHaveLength(1);
    expect(findEpisodeArrays({})).toHaveLength(0);
  });

  it("collectXiaoyuzhou requires token", async () => {
    const post = async () => ({ data: {}, headers: {}, status: 200 });
    await expect(collectXiaoyuzhou({ post }, { accessToken: "  " })).rejects.toThrowError(/未登录/);
  });

  it("collectXiaoyuzhou maps 401 to relogin hint", async () => {
    const post = async () => ({ data: {}, headers: {}, status: 401 });
    await expect(collectXiaoyuzhou({ post }, { accessToken: "dead" })).rejects.toThrowError(/过期/);
  });

  it("collectXiaoyuzhou collects + paginates", async () => {
    const pages = [{ data: [ep], loadMoreKey: "k2" }, { data: [ep] }];
    let n = 0;
    const post = async () => ({ data: pages[n++], headers: {}, status: 200 });
    const items = await collectXiaoyuzhou({ post }, { accessToken: "tok" });
    expect(items).toHaveLength(1); // 去重
    expect(n).toBe(2);
  });
});
