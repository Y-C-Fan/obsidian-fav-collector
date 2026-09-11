/**
 * Fav Collector v0.8.0（local-only）：无 Engine、无 SQLite、无常驻进程。
 * 点按钮 → 各平台直抓 → 去重 → 写 md → Dashboard 卡片墙直接读文件。
 */
import { Notice, Plugin, WorkspaceLeaf, requestUrl } from "obsidian";
import { DEFAULT_SETTINGS, type FavSettings } from "./settings.js";
import { FavSettingTab } from "./settings-tab.js";
import { FavDashboardView, VIEW_TYPE_FAV_DASHBOARD } from "./ui/dashboard.js";
import { parseFrontmatter } from "./markdown/writer.js";
import { syncPlatform, writeNewItems } from "./sync/runner.js";
import { enrichYoutubeDates } from "./sync/youtube.js";
import { PLATFORMS } from "./sync/model.js";
import type { HttpGet, Platform, PlatformResult } from "./sync/model.js";

export default class FavCollectorPlugin extends Plugin {
  settings!: FavSettings;
  syncing = false;

  async onload(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) ?? {}) };

    this.registerView(VIEW_TYPE_FAV_DASHBOARD, (leaf: WorkspaceLeaf) => new FavDashboardView(leaf, this));

    this.addRibbonIcon("refresh-cw", "同步全部收藏", () => void this.syncAll());
    this.addCommand({ id: "sync-all", name: "同步全部收藏", callback: () => void this.syncAll() });
    this.addCommand({
      id: "open-dashboard",
      name: "打开收藏总览",
      callback: () => void this.openDashboard(),
    });
    this.addSettingTab(new FavSettingTab(this));
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private http(): HttpGet {
    return async (url, headers) => {
      const res = await requestUrl({ url, method: "GET", headers: headers ?? {} });
      if (res.status >= 400) throw new Error(`HTTP ${res.status}: ${url.slice(0, 80)}`);
      return res.json;
    };
  }

  private runnerSettings() {
    return {
      biliCookies: this.settings.biliCookies,
      xCookies: this.settings.xCookies,
      zhihuSecret: this.settings.zhihuSecret,
      ytdlpPath: this.settings.ytdlpPath || DEFAULT_SETTINGS.ytdlpPath,
      ytCookieFile: this.settings.ytCookieFile || undefined,
    };
  }

  async testPlatform(platform: Platform): Promise<PlatformResult> {
    return syncPlatform(platform, this.runnerSettings(), this.http());
  }

  /** 扫 Vault 组装去重集合（fav_id + url，兼容旧笔记）。 */
  async scanExisting(): Promise<{ favIds: Set<string>; urls: Set<string> }> {
    const favIds = new Set<string>();
    const urls = new Set<string>();
    const files = this.app.vault.getMarkdownFiles().filter((f) => f.path.startsWith("Fav Collector/"));
    for (const f of files) {
      try {
        const fm = parseFrontmatter(await this.app.vault.read(f));
        if (fm.fav_id) favIds.add(fm.fav_id);
        if (fm.url) urls.add(fm.url);
      } catch {
        // 跳过坏文件
      }
    }
    return { favIds, urls };
  }

  async syncPlatform(platform: Platform): Promise<void> {
    if (this.syncing) {
      new Notice("正在同步中，稍等…");
      return;
    }
    this.syncing = true;
    try {
      new Notice(`同步 ${platform} 中…`);
      const result = await syncPlatform(platform, this.runnerSettings(), this.http());
      const { favIds, urls } = await this.scanExisting();
      const va = this.app.vault;
      const report = await writeNewItems(
        {
          exists: (p) => va.adapter.exists(p),
          mkdir: (p) => va.createFolder(p).then(() => undefined).catch(() => undefined),
          write: (p, c) => va.create(p, c).then(() => undefined),
        },
        favIds,
        urls,
        [result],
        (items) =>
          enrichYoutubeDates({ ytdlpPath: this.runnerSettings().ytdlpPath, cookieFile: this.runnerSettings().ytCookieFile }, items),
      );
      this.settings.lastSync[platform] = {
        at: new Date().toISOString(),
        ok: result.ok,
        added: report.added,
        error: result.error,
      };
      await this.saveSettings();
      new Notice(result.ok ? `${platform} 同步完成，新增 ${report.added} 条` : `${platform} 失败：${result.error}`);
    } finally {
      this.syncing = false;
    }
  }

  async syncAll(): Promise<void> {
    if (this.syncing) {
      new Notice("正在同步中，稍等…");
      return;
    }
    this.syncing = true;
    try {
      new Notice("开始同步全部平台…");
      const http = this.http();
      const settings = this.runnerSettings();
      const results: PlatformResult[] = [];
      for (const p of PLATFORMS) {
        try {
          results.push(await syncPlatform(p, settings, http));
        } catch (e) {
          results.push({ platform: p, ok: false, items: [], error: (e as Error).message });
        }
      }
      const { favIds, urls } = await this.scanExisting();
      const va = this.app.vault;
      const report = await writeNewItems(
        {
          exists: (p) => va.adapter.exists(p),
          mkdir: (p) => va.createFolder(p).then(() => undefined).catch(() => undefined),
          write: (p, c) => va.create(p, c).then(() => undefined),
        },
        favIds,
        urls,
        results,
        (items) => enrichYoutubeDates({ ytdlpPath: settings.ytdlpPath, cookieFile: settings.ytCookieFile }, items),
      );
      const now = new Date().toISOString();
      for (const r of results) {
        this.settings.lastSync[r.platform] = {
          at: now,
          ok: r.ok,
          added: 0,
          error: r.error,
        };
      }
      await this.saveSettings();
      const okCount = results.filter((r) => r.ok).length;
      const failed = results.filter((r) => !r.ok).map((r) => r.platform);
      new Notice(
        failed.length === 0
          ? `同步完成：${PLATFORMS.length}/${PLATFORMS.length} 平台，新增 ${report.added} 条`
          : `同步完成 ${okCount}/${PLATFORMS.length}，新增 ${report.added} 条；失败：${failed.join("、")}（看总览红卡重试）`,
      );
      await this.openDashboard();
    } finally {
      this.syncing = false;
    }
  }

  async openDashboard(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_FAV_DASHBOARD);
    if (leaves.length > 0) {
      void this.app.workspace.revealLeaf(leaves[0]);
      const view = leaves[0].view;
      if (view instanceof FavDashboardView) await view.render();
      return;
    }
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: VIEW_TYPE_FAV_DASHBOARD, active: true });
  }
}
