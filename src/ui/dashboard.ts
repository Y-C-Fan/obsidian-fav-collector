/** Dashboard 卡片墙：直接读 Vault md 文件，无数据库。红卡 = 上次挂掉的平台 + 一键重试。 */
import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import { cardFromNote, groupCards } from "../markdown/writer.js";
import type { CardData } from "../markdown/writer.js";
import { PLATFORM_LABEL, PLATFORMS } from "../sync/model.js";
import type { Platform } from "../sync/model.js";
import type FavCollectorPlugin from "../main.js";

export const VIEW_TYPE_FAV_DASHBOARD = "fav-collector-dashboard";

export class FavDashboardView extends ItemView {
  private filter: Platform | "all" = "all";
  private folderFilter = "all";

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: FavCollectorPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_FAV_DASHBOARD;
  }

  getDisplayText(): string {
    return "收藏总览";
  }

  async onOpen(): Promise<void> {
    await this.render();
  }

  async render(): Promise<void> {
    const el = this.containerEl.children[1] as HTMLElement;
    el.empty();
    el.addClass("fav-dashboard");

    // 工具条
    const bar = el.createDiv({ cls: "fav-toolbar" });
    const syncBtn = bar.createEl("button", { text: this.plugin.syncing ? "同步中…" : "同步全部" });
    syncBtn.disabled = this.plugin.syncing;
    syncBtn.onclick = () => void this.plugin.syncAll().then(() => this.render());
    const openBtn = bar.createEl("button", { text: "打开 Fav Collector 文件夹" });
    openBtn.onclick = () => {
      const folder = this.app.vault.getFolderByPath("Fav Collector");
      if (folder) void this.app.workspace.getLeaf().openFile(folder as unknown as never);
      else new Notice("Fav Collector 文件夹还不存在，先点一次同步");
    };
    const status = bar.createSpan({ cls: "fav-status" });

    // 红卡：上次失败的平台
    const last = this.plugin.settings.lastSync;
    for (const p of PLATFORMS) {
      const rec = last[p];
      if (rec && !rec.ok) {
        const card = el.createDiv({ cls: "fav-error" });
        card.createDiv({ cls: "fav-error-title", text: `${PLATFORM_LABEL[p]} 上次同步失败` });
        card.createDiv({ text: (rec.error ?? "未知错误").slice(0, 200) });
        card.createDiv({ cls: "fav-status", text: `时间：${rec.at}` });
        const retry = card.createEl("button", { text: `重试 ${PLATFORM_LABEL[p]}` });
        retry.onclick = () => void this.plugin.syncPlatform(p).then(() => this.render());
      }
    }

    // 平台筛选
    const filterBar = el.createDiv({ cls: "fav-filter" });
    const mkPlatFilter = (key: Platform | "all", label: string) => {
      const b = filterBar.createEl("button", { text: label, cls: key === this.filter ? "active" : "" });
      b.onclick = () => {
        this.filter = key;
        this.folderFilter = "all";
        void this.render();
      };
    };
    mkPlatFilter("all", "全部");
    for (const p of PLATFORMS) mkPlatFilter(p, PLATFORM_LABEL[p]);

    // 卡片（按收藏夹分组）
    const { cards, scanned, skipped } = await this.loadCards();
    const shown = cards.filter((c) => this.filter === "all" || c.platform === this.filter);
    let groups = groupCards(shown, this.filter);
    // 收藏夹筛选条
    if (groups.length > 1) {
      const folderBar = el.createDiv({ cls: "fav-filter" });
      const allB = folderBar.createEl("button", { text: `全部文件夹（${shown.length}）`, cls: this.folderFilter === "all" ? "active" : "" });
      allB.onclick = () => {
        this.folderFilter = "all";
        void this.render();
      };
      for (const g of groups) {
        const b = folderBar.createEl("button", { text: `${g.label}（${g.items.length}）`, cls: g.key === this.folderFilter ? "active" : "" });
        b.onclick = () => {
          this.folderFilter = g.key;
          void this.render();
        };
      }
      if (this.folderFilter !== "all") groups = groups.filter((g) => g.key === this.folderFilter);
    }
    const now = new Date();
    const stamp = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;
    status.setText(
      `共 ${cards.length} 条${this.filter !== "all" ? `（${PLATFORM_LABEL[this.filter as Platform]} ${shown.length} 条）` : ""} · 扫描 ${scanned} 文件${skipped > 0 ? `（跳过 ${skipped} 无元数据）` : ""} · 更新于 ${stamp}`,
    );
    let rendered = 0;
    for (const g of groups) {
      if (this.folderFilter === "all") el.createEl("h4", { text: `${g.label}（${g.items.length}）`, cls: "fav-group-title" });
      const grid = el.createDiv({ cls: "fav-cards" });
      for (const c of g.items) {
        if (rendered >= 500) break;
        rendered += 1;
        const card = grid.createDiv({ cls: "fav-card" });
        if (c.cover) {
          const img = card.createEl("img", { cls: "fav-cover" });
          img.src = c.cover;
          img.loading = "lazy";
        }
        const title = card.createDiv({ cls: "fav-title" });
        const link = title.createEl("a", { text: c.title, cls: "internal-link" });
        link.onclick = (e) => {
          e.preventDefault();
          void this.openNote(c.path);
        };
        const meta = card.createDiv({ cls: "fav-meta" });
        const badge = meta.createSpan({ cls: `fav-badge ${c.platform}`, text: PLATFORM_LABEL[c.platform] });
        void badge;
        meta.appendText(`${c.publishedAt ?? "未知时间"}${c.author ? ` · ${c.author}` : ""}`);
        if (c.description) card.createDiv({ cls: "fav-desc", text: c.description });
      }
      if (rendered >= 500) break;
    }
  }

  private async openNote(path: string): Promise<void> {
    const f = this.app.vault.getFileByPath(path);
    if (f) await this.app.workspace.getLeaf().openFile(f);
    else new Notice(`文件不存在：${path}`);
  }

  private async loadCards(): Promise<{ cards: CardData[]; scanned: number; skipped: number }> {
    const files = this.app.vault.getMarkdownFiles().filter((f) => f.path.startsWith("Fav Collector/"));
    const out: CardData[] = [];
    let skipped = 0;
    for (const f of files) {
      try {
        const md = await this.app.vault.read(f);
        const card = cardFromNote(f.path, md);
        if (card) out.push(card);
        else skipped += 1;
      } catch {
        skipped += 1;
      }
    }
    out.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
    return { cards: out, scanned: files.length, skipped };
  }
}
