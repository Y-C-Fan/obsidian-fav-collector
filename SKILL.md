# Skill: obsidian-fav-collector / expand（按需展开收藏详情）

给 Coding Agent（OpenCode 等）调用的取数工具：把 Obsidian 收藏库里的一条收藏展开成全文，
返回 JSON。**总结由调用方 Agent 自己写**，本 Skill 不配任何 AI key、不调任何 LLM。

## 前置条件

1. Engine 已部署：`node apps/engine/scripts/deploy.mjs --data-dir <数据目录>`，
   得到 `<数据目录>/engine/engine.cjs`（仓库开发态也可用 `apps/engine/dist/index.js`）。
2. 各平台 Cookie 已通过 Obsidian 插件设置页导入（Cookie-Editor 导出 → 粘贴导入），
   知乎如需官方 API 需另填 Access Secret（插件设置 → 知乎 Secret）。
3. 该收藏已同步进库（插件侧边栏同步，或每日 9 点自动同步）。

## 命令

```bash
node <engine.cjs> --data-dir <数据目录> expand "<target>" [--max-chars N]
```

- `<target>`：收藏 URL（推荐，直接从 `Fav Collector/<平台>/<标题>.md` 的系统区抄），
  或 `platform:platformItemId`，例如：
  - `bilibili:BV1xxxxxxx`
  - `youtube:xxxxxxxxxxx`（11 位视频 ID）
  - `zhihu:answer-123456`
  - `x:1234567890123456789`（推文 ID）
- `--max-chars N`：返回正文最大字符数（默认 20000；DB 内保留全文，可重跑取全）。
- 成功 exit 0，输出 JSON：
  ```json
  {
    "collection": { "id": "...", "platform": "x", "platformItemId": "...", "url": "...", "title": "..." },
    "detail": {
      "title": "...", "author": "...", "description": "...",
      "text": "全文/逐字稿（可能截断）", "textTruncated": false,
      "publishedAt": "...", "contentType": "tweet",
      "deleted": false, "commentCount": 3,
      "comments": [{ "author": "...", "content": "..." }]
    },
    "fetched": true
  }
  ```
- `fetched: false` 表示之前已展开过，本次直接返回库内存量（免费、无风控成本）。
- 失败 exit 1，输出 `{"error": "EXPAND_404: ..."}`（target 不在库里 → 先同步该平台）。

## 标准工作流（推荐）

1. `expand` 拿到 `detail.text`（+ comments）。
2. 精读后自己写中文总结。
3. 总结写入该收藏笔记的**用户区**（`## 我的笔记` 下），**绝不触碰**
   `<!-- OMNI_SYSTEM_START -->` … `<!-- OMNI_SYSTEM_END -->` 之间的系统区。
4. 如需把新抓的正文刷进笔记系统区：在 Obsidian 里点「生成 Markdown」
   （只更新系统区，用户区不动）。

## 平台注意事项

- 知乎：无 Secret 时官方 API 只覆盖**公开**收藏夹；私密收藏需浏览器登录态兜底。
- X / 知乎风控较严：expand 逐条调用，条与条之间停几秒；`fetched: false` 的多用缓存。
- YouTube：需要 `yt-dlp` 可用；登录态 Cookie 通过插件设置页导入（导入成功会自动生成 `ytdl_cookies.txt`，拉 Watch Later 必需；Cookie 过期需重新导出导入）。
- B站：WBI 直连，通常最稳；评论随详情一起回写（最多保留库内已有）。

## 已展开判断

- CLI 返回 `fetched: false`，或
- 笔记系统区 `expanded: true`（`expanded_at` 为展开时间）。
