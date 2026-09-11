import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import type { EngineClient } from "../comm/socket-client.js";
import type { OmniController } from "./sidebar.js";
import type { CollectionDTO } from "@omni/shared-core";
import {
  bucketLast7Days,
  buildPlatformCards,
  buildTrendSvg,
  countExpanded,
  countToday,
  countUnorganized,
  recentItems,
} from "./dashboard-stats.js";

export const VIEW_TYPE_OMNI_DASHBOARD = "fav-collector-dashboard";
/* ---------------- 视图 ---------------- */

export class FavDashboardView extends ItemView {
  private busy = false;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly engine: EngineClient,
    private readonly ctrl: OmniController,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_OMNI_DASHBOARD;
  }

  getDisplayText(): string {
    return "Fav Collector 总览";
  }

  getIcon(): string {
    return "layout-dashboard";
  }

  async onOpen(): Promise<void> {
    await this.refresh();
  }

  private async withBusy(fn: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await fn();
    } finally {
      this.busy = false;
    }
  }

  private async refresh(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("fav-dash");
    try {
      const [items, statuses] = await Promise.all([
        this.engine.listCollections().catch(() => [] as CollectionDTO[]),
        this.engine.listPlatformStatus().catch(() => []),
      ]);
      if (items.length === 0 && statuses.length === 0) {
        this.renderEmpty(container as HTMLElement);
        return;
      }
      this.renderDashboard(container as HTMLElement, items, statuses);
    } catch (err) {
      this.renderEmpty(container as HTMLElement, (err as Error).message);
    }
  }

  private renderEmpty(root: HTMLElement, reason?: string): void {
    root.createEl("div", { text: "Fav Collector 总览", cls: "fav-dash-title" });
    root.createEl("div", {
      text: reason ? `Engine 未就绪：${reason}` : "库里还没有收藏，先同步一次吧",
      cls: "fav-dash-empty",
    });
    const row = root.createEl("div", { cls: "fav-dash-actions" });
    const startBtn = row.createEl("button", { text: "启动引擎", cls: "fav-btn" });
    startBtn.addEventListener("click", () => {
      void this.withBusy(async () => {
        await this.ctrl.startEngine();
        await this.refresh();
      });
    });
    const syncBtn = row.createEl("button", { text: "同步全部", cls: "fav-btn fav-btn-primary" });
    syncBtn.addEventListener("click", () => {
      void this.withBusy(async () => {
        await this.ctrl.syncAll();
        await this.refresh();
      });
    });
  }

  private renderDashboard(
    root: HTMLElement,
    items: CollectionDTO[],
    statuses: Array<{ platform: string; count: number; lastSyncAt: string | null; todaySyncCount: number; health: { level: "green" | "yellow" | "red"; reason: string } }>,
  ): void {
    const now = new Date();
    const today = countToday(items, now);
    const unorganized = countUnorganized(items);
    const expanded = countExpanded(items);

    // 标题 + 今日一句话 + 动作
    const head = root.createEl("div", { cls: "fav-dash-head" });
    const titleBox = head.createEl("div");
    titleBox.createEl("div", { text: "Fav Collector 总览", cls: "fav-dash-title" });
    titleBox.createEl("div", {
      text: `今日 ${now.getMonth() + 1} 月 ${now.getDate()} 日 · 新增 ${today} 条 · 待整理 ${unorganized} 条 · 已展开 ${expanded} 条`,
      cls: "fav-dash-sub",
    });
    const actions = head.createEl("div", { cls: "fav-dash-actions" });
    const syncBtn = actions.createEl("button", { text: "同步", cls: "fav-btn fav-btn-primary" });
    syncBtn.addEventListener("click", () => {
      void this.withBusy(async () => {
        await this.ctrl.syncAll();
        await this.refresh();
      });
    });
    const mdBtn = actions.createEl("button", { text: "生成笔记", cls: "fav-btn" });
    mdBtn.addEventListener("click", () => {
      void this.withBusy(async () => {
        await this.ctrl.generateMarkdown();
        new Notice("笔记已生成/更新");
      });
    });

    // 平台卡片墙
    root.createEl("div", { text: "平台", cls: "fav-section-title" });
    const grid = root.createEl("div", { cls: "fav-card-grid" });
    for (const card of buildPlatformCards(statuses, items, now)) {
      const el = grid.createEl("div", { cls: "fav-card" });
      const top = el.createEl("div", { cls: "fav-card-top" });
      top.createEl("span", { text: card.label, cls: "fav-card-name" });
      const dot = top.createEl("span", { cls: `fav-dot fav-dot-${card.health}` });
      dot.setAttribute("title", card.reason || (card.health === "green" ? "正常" : "注意"));
      el.createEl("div", { text: String(card.count), cls: "fav-card-count" });
      const meta = el.createEl("div", { cls: "fav-card-meta" });
      meta.createEl("span", { text: card.today > 0 ? `今日 +${card.today}` : "今日无新增", cls: "fav-badge" });
      if (card.lastSyncAt) {
        meta.createEl("span", {
          text: new Date(card.lastSyncAt).toLocaleDateString("zh-CN"),
          cls: "fav-meta-text",
        });
      }
      el.addEventListener("click", () => {
        void this.ctrl.openCollectionList(card.key);
      });
    }

    // 最近收藏封面墙
    const recent = recentItems(items, 12);
    if (recent.length > 0) {
      root.createEl("div", { text: "最近收藏", cls: "fav-section-title" });
      const wall = root.createEl("div", { cls: "fav-wall" });
      for (const item of recent) {
        const cell = wall.createEl("div", { cls: "fav-cell" });
        cell.setAttribute("title", item.title || item.platformItemId);
        if (item.coverUrl) {
          const img = cell.createEl("img", { cls: "fav-cover" });
          img.setAttribute("loading", "lazy");
          void this.ctrl.ensureCover(item.coverUrl).then((src) => {
            img.setAttribute("src", src ?? item.coverUrl ?? "");
          });
        } else {
          cell.createEl("div", { text: (item.title || "?").slice(0, 1), cls: "fav-cover-fallback" });
        }
        if (item.contentStatus === "deleted") cell.addClass("is-deleted");
        cell.createEl("div", { text: item.title || item.platformItemId, cls: "fav-cell-title" });
        cell.addEventListener("click", () => {
          void this.ctrl.openCollectionDetail(item.id);
        });
      }
    }

    // 近7天趋势 + 快捷入口
    const bottom = root.createEl("div", { cls: "fav-bottom" });
    const trendBox = bottom.createEl("div", { cls: "fav-trend" });
    trendBox.createEl("div", { text: "近7天新增", cls: "fav-section-title" });
    const svgHost = trendBox.createEl("div", { cls: "fav-svg" });
    svgHost.innerHTML = buildTrendSvg(bucketLast7Days(items, now));
    const links = bottom.createEl("div", { cls: "fav-links" });
    links.createEl("div", { text: "快捷", cls: "fav-section-title" });
    const tagBtn = links.createEl("button", { text: "Tag / Topic 管理", cls: "fav-btn" });
    tagBtn.addEventListener("click", () => {
      void this.ctrl.openTagTopic();
    });
    const groupBtn = links.createEl("button", { text: "跨平台关联识别", cls: "fav-btn" });
    groupBtn.addEventListener("click", () => {
      void this.withBusy(async () => {
        await this.ctrl.runGroupRecognition();
      });
    });
    const expandBtn = links.createEl("button", { text: "展开指引", cls: "fav-btn" });
    expandBtn.addEventListener("click", () => {
      new Notice("在 OpenCode 里让 Agent 读仓库 SKILL.md，用 expand 取正文、总结写进笔记用户区");
    });
  }
}
