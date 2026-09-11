# Omni Collector (Obsidian Plugin)

全平台收藏同步：把 B 站 / YouTube（Watch Later）/ 知乎 / X（Bookmarks）的收藏自动同步进 Obsidian（轻量目录 + 每日定时），并提供展开详情 Skill（`expand`，给 Coding Agent 调用）与 Tag / Topic 整理。

> 插件依赖独立运行的 **Engine**（Node.js + Playwright），首次使用请先部署 Engine（见下文「接入 Obsidian」）。

## 功能

- 四平台收藏同步（B站 WBI 直连，YouTube 走 yt-dlp，知乎走官方开放平台，X 走浏览器驱动）
- 每日 9 点自动同步（随机窗口错峰），轻量目录
- 展开详情 Skill：`expand <收藏URL或ID>`（见仓库根 `SKILL.md`），正文回写笔记系统区
- Markdown 收藏卡片 + Tag/Topic 整理 + ContentGroup 跨平台关联

## 接入 Obsidian

1. 构建插件：`pnpm --filter @omni/obsidian-plugin build`
2. 部署 Engine：`node apps/engine/scripts/deploy.mjs --data-dir <你的数据目录>`
3. 复制插件：把 `main.js`、`manifest.json`、`styles.css` 放入 `<vault>/.obsidian/plugins/omni-collector/`
4. Obsidian 设置 → 第三方插件 → 开启 Omni Collector（如未显示，先开启「开发者模式」）
5. 设置里填写数据目录，点击功能区图标启动 Engine 并触发首次同步

## 开发

```bash
pnpm install
pnpm --filter @omni/obsidian-plugin build
pnpm test
```

## License

MIT
