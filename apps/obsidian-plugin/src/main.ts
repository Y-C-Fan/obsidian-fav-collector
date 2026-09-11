import path from "node:path";
import { Modal, Notice, Plugin, requestUrl, Setting, WorkspaceLeaf } from "obsidian";
import { randomUUID } from "node:crypto";
import type { CollectionDTO } from "@omni/shared-core";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type OmniSettings } from "./settings.js";
import { OmniSettingTab } from "./settings-tab.js";
import { EngineClient } from "./comm/socket-client.js";
import { OmniSidebarView, VIEW_TYPE_OMNI, type OmniController } from "./ui/sidebar.js";
import { OmniTagTopicView, VIEW_TYPE_OMNI_TAGS, type TagTopicSource } from "./ui/tag-topic.js";
import { OmniCollectionListView, VIEW_TYPE_OMNI_LIST, type ListDataSource } from "./ui/collection-list.js";
import { OmniCollectionDetailView, VIEW_TYPE_OMNI_DETAIL, type DetailDataSource } from "./ui/collection-detail.js";
import { FavDashboardView, VIEW_TYPE_OMNI_DASHBOARD } from "./ui/dashboard.js";
import { MarkdownBuilder, sanitizeFilename } from "./markdown/markdown-builder.js";
import { dailyCapReached, isSyncDue } from "./sync/sync-scheduler.js";

export default class OmniCollectorPlugin extends Plugin {
  pluginSettings!: OmniSettings;
  engine!: EngineClient;

  async onload(): Promise<void> {
    this.pluginSettings = await loadSettings(this);
    if (!this.pluginSettings.dataDir) {
      const basePath = (
        this.app.vault.adapter as unknown as { getBasePath(): string }
      ).getBasePath();
      this.pluginSettings.dataDir = path.join(basePath, ".omni-collector");
    }
    if (!this.pluginSettings.engineScript) {
      this.pluginSettings.engineScript = path.join(
        this.pluginSettings.dataDir,
        "engine",
        "index.js",
      );
    }
    if (!this.pluginSettings.wsToken) {
      this.pluginSettings.wsToken = randomUUID();
    }
    await saveSettings(this, this.pluginSettings);
    this.reloadSyncScheduler();

    this.engine = new EngineClient({
      pipePath: `\\\\.\\pipe\\omni-collector-${process.pid}`,
      wsUrl: `ws://127.0.0.1:0/?token=${this.pluginSettings.wsToken}`,
      engineScript: this.pluginSettings.engineScript,
      dataDir: this.pluginSettings.dataDir,
      nodeBin: this.pluginSettings.nodeBin || undefined,
      autoStart: this.pluginSettings.autoStartEngine,
    });

    this.registerView(VIEW_TYPE_OMNI, (leaf) => new OmniSidebarView(leaf, this.engine, this.controller));
    this.registerView(VIEW_TYPE_OMNI_LIST, (leaf) => {
      const source: ListDataSource = {
        list: () => this.engine.listCollections(),
        onOpenDetail: (id) => void this.openCollectionDetail(id),
        onBatch: (ids, action, value) => this.engine.batch(ids, action, value).then(() => undefined),
        getDefaultViewMode: () => this.pluginSettings.viewMode,
        onOrganize: (id, state) => this.engine.setOrganizeState(id, state).then(() => undefined),
        onTag: (id, tag) => this.engine.addTag(id, tag).then(() => undefined),
        onTopic: (id, topic) => this.engine.addTopic(id, topic).then(() => undefined),
        onPriority: (id, priority) => this.engine.setPriority(id, priority).then(() => undefined),
        ensureCover: (url) => this.ensureCover(url),
      };
      return new OmniCollectionListView(leaf, source);
    });
    this.registerView(VIEW_TYPE_OMNI_DETAIL, (leaf) => {
      const source: DetailDataSource = {
        get: (id) => this.engine.getCollection(id),
        fetchText: (url) => this.engine.fetchPageText(url),
        onOrganize: (id, s) => this.engine.setOrganizeState(id, s).then(() => undefined),
        onPriority: (id, p) => this.engine.setPriority(id, p).then(() => undefined),
        onTag: (id, t) => this.engine.addTag(id, t).then(() => undefined),
        onTopic: (id, t) => this.engine.addTopic(id, t).then(() => undefined),
        ensureCover: (url) => this.ensureCover(url),
      };
      return new OmniCollectionDetailView(leaf, source);
    });
    this.registerView(VIEW_TYPE_OMNI_TAGS, (leaf) => {
      const source: TagTopicSource = {
        listTags: () => this.engine.listTags(),
        addAlias: (tag, alias) => this.engine.addTagAlias(tag, alias).then(() => undefined),
        mergeTags: (sourceTag, target) => this.engine.mergeTags(sourceTag, target).then(() => undefined),
        renameTag: (tag, next) => this.engine.renameTag(tag, next).then(() => undefined),
        listTopics: () => this.engine.listTopics(),
        renameTopic: (id, name) => this.engine.renameTopic(id, name).then(() => undefined),
        listCollections: () => this.engine.listCollections(),
        openDetail: (id) => this.openCollectionDetail(id),
        refreshMarkdown: () => this.generateCollectionMarkdown(),
      };
      return new OmniTagTopicView(leaf, source);
    });
    this.registerView(
      VIEW_TYPE_OMNI_DASHBOARD,
      (leaf) => new FavDashboardView(leaf, this.engine, this.controller),
    );
    this.addSettingTab(new OmniSettingTab(this.app, this));
    this.addCommand({
      id: "open-dashboard",
      name: "打开总览",
      callback: () => {
        const leaf = this.app.workspace.getLeaf(false);
        void leaf.setViewState({ type: VIEW_TYPE_OMNI_DASHBOARD, active: true });
      },
    });
    this.addCommand({
      id: "open-tag-topic-manager",
      name: "打开 Tag/Topic 管理",
      callback: () => {
        void this.openTagTopicView();
      },
    });
    this.addCommand({
      id: "run-group-recognition",
      name: "运行 ContentGroup 关联识别",
      callback: async () => {
        try {
          const res = await this.engine.runAutoGroup();
          const candidates = (res.payload?.candidates ?? []) as Array<{ name: string; size: number; reason: string }>;
          new Notice(`分组识别完成：发现 ${candidates.length} 个候选（请到 Tag/Topic 管理确认）`);
        } catch (err) {
          new Notice(`分组识别失败：${(err as Error).message}`);
        }
      },
    });
    this.addCommand({
      id: "sync-all",
      name: "立即同步（全部平台）",
      callback: () => {
        void this.syncAllAndRender();
      },
    });
    this.addCommand({
      id: "generate-markdown",
      name: "生成收藏 Markdown",
      callback: () => {
        void this.generateCollectionMarkdown();
      },
    });
    this.addCommand({
      id: "open-collection-list",
      name: "打开收藏列表",
      callback: () => {
        void this.openCollectionList();
      },
    });
    this.addRibbonIcon("sparkles", "Fav Collector", () => {
      void this.activateView();
      this.engine
        .startEngine("query")
        .catch((err) => new Notice(`Fav Collector: ${(err as Error).message}`));
    });
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = null;
    for (const l of workspace.getLeavesOfType(VIEW_TYPE_OMNI)) {
      leaf = l;
      break;
    }
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (leaf) await leaf.setViewState({ type: VIEW_TYPE_OMNI, active: true });
    }
  if (leaf) workspace.setActiveLeaf(leaf);
  }

  onunload(): void {
    if (this.syncTimer !== null) {
      window.clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    this.engine?.dispose();
  }

  private syncTimer: number | null = null;

  async saveSettings(): Promise<void> {
    await saveSettings(this, this.pluginSettings);
  }

  async updateRule(key: string, value: string): Promise<void> {
    try {
      await this.engine.updateRule(key, value);
      new Notice(`已保存：${key}`);
    } catch (err) {
      new Notice(`规则更新失败：${(err as Error).message}`);
    }
  }

  /** 封面本地缓存：首次下载到 vault/.covers，之后走本地路径。 */
  async ensureCover(url: string): Promise<string | null> {
    if (!url) return null;
    const coverDir = "Fav Collector/.covers";
    const vault = this.app.vault;
    if (!(await vault.adapter.exists(coverDir))) {
      await vault.createFolder(coverDir).catch(() => {});
    }
    const ext = /\.(jpg|jpeg|png|webp|gif)(?:[?#]|$)/i.exec(url)?.[1] ?? "jpg";
    const hash = await this.hashString(url);
    const filePath = `${coverDir}/${hash}.${ext}`;
    if (await vault.adapter.exists(filePath)) {
      const f = vault.getAbstractFileByPath(filePath);
      return f ? vault.getResourcePath(f as import("obsidian").TFile) : url;
    }
    try {
      const res = await requestUrl({ url, method: "GET" });
      if (res.status >= 200 && res.status < 300) {
        await vault.adapter.writeBinary(filePath, res.arrayBuffer);
        const f = vault.getAbstractFileByPath(filePath);
        return f ? vault.getResourcePath(f as import("obsidian").TFile) : url;
      }
    } catch {
      // 下载失败回退远程地址
    }
    return url;
  }

  private async hashString(s: string): Promise<string> {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf)).slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  private get controller(): OmniController {
    return {
      openCollectionList: (platform?: string) => this.openCollectionList(platform),
      openCollectionDetail: (id: string) => this.openCollectionDetail(id),
      openTagTopic: () => this.openTagTopicView(),
      openSettings: () => this.openSettingsTab(),
      startEngine: async () => {
        await this.engine.startEngine("query");
        new Notice("Engine 已启动");
      },
      stopEngine: async () => {
        await this.engine.stopEngine("plugin");
        new Notice("Engine 已停止");
      },
      syncAll: () => this.syncAllAndRender(),
      syncPlatform: async (platform) => {
        const res = await this.engine.syncPlatform(platform, this.pluginSettings.initialSyncMode);
        const report = (res.payload?.report ?? {}) as { status?: string; itemsAdded?: number; itemsUpdated?: number; itemsFetched?: number };
        if (report.status === "success") {
          new Notice(`Fav Collector: ${platform} 抓取 ${report.itemsFetched ?? 0} 条（+${report.itemsAdded ?? 0} 新增 / ${report.itemsUpdated ?? 0} 更新）`);
        } else {
          new Notice(`Fav Collector: ${platform} 同步失败 ${String(res.payload?.message ?? "")}`);
        }
      },
      deepSyncPlatform: (platform) => this.deepSyncPlatform(platform),
      refreshComments: () => this.refreshCommentsAll(),
      generateMarkdown: () => this.generateCollectionMarkdown(),
      ensureCover: (url) => this.ensureCover(url),
      runGroupRecognition: async () => {
        const res = await this.engine.runAutoGroup();
        const candidates = (res.payload?.candidates ?? []) as Array<{ name: string; size: number; reason: string }>;
        new Notice(`分组识别完成：发现 ${candidates.length} 个候选（请到 Tag/Topic 管理确认）`);
      },
    };
  }

  updateEngineNodeBin(): void {
    if (!this.engine) return;
    this.engine.dispose();
    this.engine = new EngineClient({
      pipePath: `\\\\.\\pipe\\omni-collector-${process.pid}`,
      wsUrl: `ws://127.0.0.1:0/?token=${this.pluginSettings.wsToken}`,
      engineScript: this.pluginSettings.engineScript,
      dataDir: this.pluginSettings.dataDir,
      nodeBin: this.pluginSettings.nodeBin || undefined,
    });
  }

  /** 自动同步调度（PRD 15.4）：每 10 分钟检查一次，按频率+随机窗口+日上限触发。 */
  reloadSyncScheduler(): void {
    if (this.syncTimer !== null) {
      window.clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    this.syncTimer = window.setInterval(() => void this.checkAutoSync(), 10 * 60_000);
    void this.checkAutoSync();
  }

  private async checkAutoSync(): Promise<void> {
    if (!this.pluginSettings.autoSyncEnabled) return;
    try {
      const statuses = await this.engine.listPlatformStatus();
      for (const s of statuses) {
        const frequency = this.pluginSettings.syncFrequency[s.platform] ?? "daily";
        const lastAuto = this.pluginSettings.lastAutoSyncAt[s.platform] ?? null;
        if (dailyCapReached(s.todaySyncCount, this.pluginSettings.dailySyncCapPerPlatform)) continue;
        if (!isSyncDue({ frequency, lastRunAt: lastAuto, randomWindowMinutes: this.pluginSettings.syncRandomWindowMinutes, timeOfDay: this.pluginSettings.autoSyncTime })) {
          continue;
        }
        this.pluginSettings.lastAutoSyncAt = {
          ...this.pluginSettings.lastAutoSyncAt,
          [s.platform]: new Date().toISOString(),
        };
        await this.saveSettings();
        await this.engine.syncPlatform(s.platform, "catalog").catch(() => {});
      }
    } catch {
      // Engine 未就绪时静默跳过，下个周期再试
    }
  }

  /** 深度历史同步：按设置的回溯深度拉取。 */
  async deepSyncPlatform(platform: string): Promise<void> {
    const depth = this.pluginSettings.deepSyncDepth;
    const res = await this.engine.syncPlatform(platform, "full", depth);
    const report = (res.payload?.report ?? {}) as { status?: string; itemsAdded?: number; itemsUpdated?: number };
    if (report.status === "success") {
      new Notice(`深度同步完成：${platform} +${report.itemsAdded ?? 0} 新增 / ${report.itemsUpdated ?? 0} 更新`);
    } else {
      new Notice(`深度同步失败：${platform}`);
    }
  }

  /** 评论批量更新（最近 N 天）。 */
  async refreshCommentsAll(): Promise<void> {
    new Notice("开始批量刷新评论…");
    try {
      const res = await this.engine.refreshComments(undefined, this.pluginSettings.commentBatchUpdateDays);
      const reports = (res.payload?.reports ?? []) as Array<{ platform: string; refreshed: number; failed: number }>;
      const total = reports.reduce((acc, r) => acc + r.refreshed, 0);
      new Notice(`评论刷新完成：${total} 条更新（${reports.map((r) => `${r.platform} ${r.refreshed}`).join(" / ")}）`);
    } catch (err) {
      new Notice(`评论刷新失败：${(err as Error).message}`);
    }
  }

  updateEngineAutoStart(): void {
    if (!this.engine) return;
    this.engine.dispose();
    this.engine = new EngineClient({
      pipePath: `\\\\.\\pipe\\omni-collector-${process.pid}`,
      wsUrl: `ws://127.0.0.1:0/?token=${this.pluginSettings.wsToken}`,
      engineScript: this.pluginSettings.engineScript,
      dataDir: this.pluginSettings.dataDir,
      nodeBin: this.pluginSettings.nodeBin || undefined,
      autoStart: this.pluginSettings.autoStartEngine,
    });
  }

  /** 同步全部平台，完成后生成 Markdown 并提示。 */
  async syncAllAndRender(): Promise<void> {
    const platforms = ["bilibili", "youtube", "zhihu", "x"];
    new Notice("Fav Collector: 开始同步全部平台…");
    let ok = 0;
    let fetched = 0;
    let added = 0;
    let updated = 0;
    for (const platform of platforms) {
      try {
        const res = await this.engine.syncPlatform(platform, this.pluginSettings.initialSyncMode);
        const report = (res.payload?.report ?? {}) as { status?: string; itemsAdded?: number; itemsUpdated?: number; itemsFetched?: number };
        if (report.status === "success") {
          ok += 1;
          fetched += report.itemsFetched ?? 0;
          added += report.itemsAdded ?? 0;
          updated += report.itemsUpdated ?? 0;
        }
      } catch {
        // 单平台失败不中断
      }
    }
    await this.generateCollectionMarkdown();
    new Notice(`Fav Collector: 同步完成 ${ok}/${platforms.length} 平台，共抓取 ${fetched} 条（+${added} 新增 / ${updated} 更新）`);
  }

  /** 查询收藏并写入 vault：Fav Collector/{平台}/{标题}.md（仅更新系统区）。 */
  async generateCollectionMarkdown(): Promise<void> {
    const collections = await this.engine.listCollections();
    const folder = "Fav Collector";
    const vault = this.app.vault;
    if (!(await vault.adapter.exists(folder))) {
      await vault.createFolder(folder);
    }
    const builder = new MarkdownBuilder();
    let count = 0;
    for (const dto of collections) {
      const platformDir = `${folder}/${dto.platform}`;
      if (!(await vault.adapter.exists(platformDir))) {
        await vault.createFolder(platformDir);
      }
      const safeTitle = (dto.title || dto.platformItemId).replace(/[\\/:*?"<>|]/g, "_").slice(0, 120);
      const filePath = `${platformDir}/${safeTitle}.md`;
      try {
        if (await vault.adapter.exists(filePath)) {
          const existing = await vault.adapter.read(filePath);
          if (builder.validateMarkers(existing)) {
            await vault.adapter.write(filePath, builder.replaceSystemZone(existing, dto));
            count += 1;
            continue;
          }
        }
        await vault.create(filePath, builder.buildFromDTO(dto));
        count += 1;
      } catch {
        // 跳过单个文件写入失败
      }
    }
    // Topic 聚合页（PRD 17 / 关系图谱联动）
    const topics = await this.engine.listTopics().catch(() => []);
    if (topics.length > 0) {
      const topicDir = `${folder}/Topics`;
      if (!(await vault.adapter.exists(topicDir))) {
        await vault.createFolder(topicDir).catch(() => {});
      }
      const byId = new Map(collections.map((c) => [c.id, c]));
      for (const topic of topics) {
        const links = (topic.collection_ids ?? [])
          .map((id) => {
            const dto = byId.get(id);
            if (!dto) return "";
            return `Fav Collector/${dto.platform}/${sanitizeFilename(dto.title || dto.platformItemId)}`;
          })
          .filter(Boolean);
        const hubPath = `${topicDir}/${sanitizeFilename(topic.name)}.md`;
        try {
          const content = builder.buildTopicHub(topic.name, links);
          if (await vault.adapter.exists(hubPath)) {
            await vault.adapter.write(hubPath, content);
          } else {
            await vault.create(hubPath, content);
          }
        } catch {
          // 单个 Topic 页失败不中断
        }
      }
    }
    // Tag 聚合页（PRD 16 / 关系图谱联动）
    const tags = await this.engine.listTags().catch(() => []);
    if (tags.length > 0) {
      const tagDir = `${folder}/Tags`;
      if (!(await vault.adapter.exists(tagDir))) {
        await vault.createFolder(tagDir).catch(() => {});
      }
      for (const tag of tags) {
        const links = collections
          .filter((c) => (c.tags ?? []).includes(tag.name))
          .map((c) => `Fav Collector/${c.platform}/${sanitizeFilename(c.title || c.platformItemId)}`);
        const hubPath = `${tagDir}/${sanitizeFilename(tag.name)}.md`;
        try {
          const content = builder.buildTagHub(tag.name, links);
          if (await vault.adapter.exists(hubPath)) {
            await vault.adapter.write(hubPath, content);
          } else {
            await vault.create(hubPath, content);
          }
        } catch {
          // 单个 Tag 页失败不中断
        }
      }
    }
    new Notice(`Fav Collector: 已生成/更新 ${count} 个 Markdown`);
  }

  private async openCollectionList(platform?: string): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_OMNI_LIST)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (leaf) await leaf.setViewState({ type: VIEW_TYPE_OMNI_LIST, active: true, state: { platform: platform ?? null } });
    } else {
      await leaf.setViewState({ type: VIEW_TYPE_OMNI_LIST, active: true, state: { platform: platform ?? null } });
    }
  if (leaf) workspace.setActiveLeaf(leaf);
  }

  private async openCollectionDetail(collectionId: string): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_OMNI_DETAIL)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (leaf) await leaf.setViewState({ type: VIEW_TYPE_OMNI_DETAIL, active: true, state: { collectionId } });
    } else {
      await leaf.setViewState({ type: VIEW_TYPE_OMNI_DETAIL, active: true, state: { collectionId } });
    }
  if (leaf) workspace.setActiveLeaf(leaf);
  }

  private async openTagTopicView(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_OMNI_TAGS)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (leaf) await leaf.setViewState({ type: VIEW_TYPE_OMNI_TAGS, active: true });
    }
  if (leaf) workspace.setActiveLeaf(leaf);
  }

  private async openSettingsTab(): Promise<void> {
    const app = this.app as unknown as { setting: { open(): void; openTabById(id: string): void } };
    app.setting.open();
    app.setting.openTabById("omni-collector");
  }
}
