import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import type { EngineClient } from "../comm/socket-client.js";
import { VIEW_TYPE_OMNI_DASHBOARD } from "./dashboard.js";

export const VIEW_TYPE_OMNI = "omni-collector-view";

export interface OmniController {
  openCollectionList(platform?: string): Promise<void>;
  openCollectionDetail(collectionId: string): Promise<void>;
  openTagTopic(): Promise<void>;
  openSettings(): Promise<void>;
  startEngine(): Promise<void>;
  stopEngine(): Promise<void>;
  syncAll(): Promise<void>;
  syncPlatform(platform: string): Promise<void>;
  deepSyncPlatform(platform: string): Promise<void>;
  refreshComments(): Promise<void>;
  generateMarkdown(): Promise<void>;
  runGroupRecognition(): Promise<void>;
  ensureCover(url: string): Promise<string | null>;
}

const PLATFORMS: Array<{ key: string; label: string }> = [
  { key: "bilibili", label: "B站" },
  { key: "youtube", label: "YouTube" },
  { key: "zhihu", label: "知乎" },
  { key: "x", label: "X" },
];

export class OmniSidebarView extends ItemView {
  private statusEl!: HTMLElement;
  private dotEl!: HTMLElement;
  private totalEl!: HTMLElement;
  private summaryEl!: HTMLElement;
  private startBtn!: HTMLElement;
  private platformEls = new Map<string, HTMLElement>();
  private busy = false;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly engine: EngineClient,
    private readonly ctrl: OmniController,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_OMNI;
  }

  getDisplayText(): string {
    return "Fav Collector";
  }

  getIcon(): string {
    return "sparkles";
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("omni-panel");

    container.createEl("div", { text: "Fav Collector", cls: "omni-panel-title" });

    // 引擎状态
    const statusRow = container.createEl("div", { cls: "omni-status-row" });
    this.dotEl = statusRow.createEl("span", { cls: "omni-dot omni-dot-unknown" });
    this.statusEl = statusRow.createEl("span", { text: "Engine: 未连接", cls: "omni-status-text" });
    this.startBtn = statusRow.createEl("button", { text: "启动引擎", cls: "omni-btn omni-btn-sm" });
    this.startBtn.addEventListener("click", () => {
      void this.withBusy(async () => {
        await this.ctrl.startEngine();
        await this.refreshStatus();
      });
    });
    const stopBtn = statusRow.createEl("button", { text: "停止引擎", cls: "omni-btn omni-btn-sm omni-btn-ghost" });
    stopBtn.addEventListener("click", () => {
      void this.withBusy(async () => {
        await this.ctrl.stopEngine();
        this.setStatus(false);
      });
    });
    this.totalEl = container.createEl("div", { cls: "omni-total" });
    this.summaryEl = container.createEl("div", { cls: "omni-total omni-summary" });

    // 同步区
    container.createEl("div", { text: "同步", cls: "omni-section-title" });
    container
      .createEl("button", { text: "同步全部平台", cls: "omni-btn omni-btn-primary" })
      .addEventListener("click", () => {
        void this.withBusy(async () => {
          await this.ctrl.syncAll();
          await this.refreshStatus();
        });
      });
    const grid = container.createEl("div", { cls: "omni-platform-grid" });
    for (const p of PLATFORMS) {
      const row = grid.createEl("div", { cls: "omni-platform-row" });
      const open = row.createEl("button", { text: `查看${p.label}`, cls: "omni-btn omni-btn-sm" });
      open.addEventListener("click", () => {
        void this.ctrl.openCollectionList(p.key);
      });
      const sync = row.createEl("button", { text: "同步", cls: "omni-btn omni-btn-sm omni-btn-ghost" });
      sync.addEventListener("click", () => {
        void this.withBusy(async () => {
          await this.ctrl.syncPlatform(p.key);
          await this.refreshStatus();
        });
      });
      const deep = row.createEl("button", { text: "深度", cls: "omni-btn omni-btn-sm omni-btn-ghost" });
      deep.addEventListener("click", () => {
        void this.withBusy(async () => {
          await this.ctrl.deepSyncPlatform(p.key);
          await this.refreshStatus();
        });
      });
      const meta = row.createEl("span", { cls: "omni-platform-meta" });
      this.platformEls.set(p.key, meta);
    }

    // 内容区
    container.createEl("div", { text: "内容", cls: "omni-section-title" });
    const contentRow = container.createEl("div", { cls: "omni-btn-grid" });
    this.addActionButton(contentRow, "收藏列表", () => this.ctrl.openCollectionList());
    this.addActionButton(contentRow, "总览", () => {
      const leaf = this.app.workspace.getLeaf(false);
      void leaf.setViewState({ type: VIEW_TYPE_OMNI_DASHBOARD, active: true });
    });
    this.addActionButton(contentRow, "生成 Markdown", () => this.withBusy(async () => { await this.ctrl.generateMarkdown(); }));
    this.addActionButton(contentRow, "分组识别", () => this.withBusy(async () => { await this.ctrl.runGroupRecognition(); }));
    this.addActionButton(contentRow, "Tag/Topic 管理", () => this.ctrl.openTagTopic());
    this.addActionButton(contentRow, "评论批量更新", () => this.withBusy(async () => { await this.ctrl.refreshComments(); await this.refreshStatus(); }));

    container
      .createEl("button", { text: "打开设置", cls: "omni-btn" })
      .addEventListener("click", () => {
        void this.ctrl.openSettings();
      });

    // 状态以请求结果为准（WS 只广播关闭事件）
    await this.refreshStatus();
  }

  async onClose(): Promise<void> {}

  private addActionButton(parent: HTMLElement, label: string, cb: () => void): void {
    parent.createEl("button", { text: label, cls: "omni-btn" }).addEventListener("click", cb);
  }

  private async refreshStatus(): Promise<void> {
    const ok = await this.engine.ping().catch(() => false);
    this.setStatus(ok);
    if (ok) {
      try {
        const platforms = await this.engine.listPlatformStatus();
        let total = 0;
        for (const p of platforms) {
          total += p.count;
          const el = this.platformEls.get(p.platform);
          if (el) {
            el.empty();
            const dot = el.createEl("span", {
              cls: `omni-dot omni-dot-${p.health?.level ?? "unknown"}`,
              attr: { title: p.health?.reason ?? "" },
            });
            el.createEl("span", {
              text: `${p.count} 条 · ${p.lastSyncAt ? new Date(p.lastSyncAt).toLocaleDateString("zh-CN") : "未同步"}${p.health?.reason ? ` · ${p.health.reason}` : ""}`,
            });
            void dot;
          }
        }
        this.totalEl.setText(`已同步 ${total} 条收藏`);
        const summary = await this.engine.getSummary().catch(() => null);
        if (summary) {
          const a = summary.anomalies;
          this.summaryEl.setText(`未整理 ${summary.unorganized} · 重要/项目 ${summary.important} · 稍后再看 ${summary.watchLater} · 待审 AI ${summary.aiPending} · Topic ${summary.topics} · 本地 ${summary.localFiles} · 异常 ${a.deleted + a.syncFailed + a.fileMissing}`);
        }
      } catch {
        // 状态查询失败不覆盖连接状态
      }
    }
  }

  private setStatus(ok: boolean): void {
    const state = ok ? "ready" : "unknown";
    this.dotEl.removeClass("omni-dot-unknown", "omni-dot-ready", "omni-dot-closing", "omni-dot-error");
    this.dotEl.addClass(`omni-dot-${state}`);
    this.statusEl.setText(ok ? "Engine: 已连接" : "Engine: 未连接");
    this.startBtn.setText(ok ? "重启引擎" : "启动引擎");
  }

  private async withBusy(fn: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.statusEl.setText("处理中…");
    try {
      await fn();
    } catch (err) {
      new Notice(`Fav Collector: ${(err as Error).message}`);
      this.setStatus(false);
    } finally {
      this.busy = false;
      if (!this.dotEl.hasClass("omni-dot-ready")) await this.refreshStatus();
    }
  }
}
