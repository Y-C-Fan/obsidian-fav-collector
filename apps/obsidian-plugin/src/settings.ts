import type { Plugin } from "obsidian";

export interface OmniSettings {
  /** 用户指定的数据目录（ADR-014）。 */
  dataDir: string;
  /** Engine 入口脚本路径（插件安装时释放，TDD Part 12.1）。 */
  engineScript: string;
  /** 一次性 WebSocket 握手令牌。 */
  wsToken: string;
  /** 知乎开放平台 Access Secret（写入本地加密区 cookies/zhihu_secret.enc，仅本地）。 */
  zhihuSecret: string;
  /** Node.js 可执行文件路径（Engine 子进程）；留空时使用 PATH 上的 node。 */
  nodeBin: string;
  /** 初次/手动同步模式：catalog（轻量目录）| full（含详情）。 */
  initialSyncMode: "catalog" | "full";
  /** 请求前自动拉起 Engine（默认 true；关闭后需手动点「启动引擎」）。 */
  autoStartEngine: boolean;
  /** 收藏列表默认视图：list（纯文字）| card（缩略图卡片）。 */
  viewMode: "list" | "card";
  /** 各平台自动同步频率（daily/weekly）。 */
  syncFrequency: Record<string, "daily" | "weekly">;
  /** 每日自动同步时刻（HH:MM，24小时制；各平台在此后随机窗口内错峰执行）。 */
  autoSyncTime: string;
  /** 初始化完整详情同步条数上限（20~80）。 */
  initFullDetailLimit: number;
  /** 自动同步随机执行窗口（分钟）。 */
  syncRandomWindowMinutes: number;
  /** 单平台每日自动同步次数上限。 */
  dailySyncCapPerPlatform: number;
  /** 深度历史同步默认回溯深度（页）。 */
  deepSyncDepth: number;
  /** 评论批量更新最近 N 天。 */
  commentBatchUpdateDays: number;
  /** 各平台上次自动同步时间（ISO）。 */
  lastAutoSyncAt: Record<string, string>;
  /** 自动同步总开关（默认开启，每日定时拉取）。 */
  autoSyncEnabled: boolean;
}

export const DEFAULT_SETTINGS: OmniSettings = {
  dataDir: "",
  engineScript: "",
  wsToken: "",
  zhihuSecret: "",
  nodeBin: "",
  initialSyncMode: "catalog",
  autoStartEngine: true,
  viewMode: "list",
  syncFrequency: {
    bilibili: "daily",
    youtube: "daily",
    zhihu: "daily",
    x: "daily",
  },
  autoSyncTime: "09:00",
  initFullDetailLimit: 50,
  syncRandomWindowMinutes: 120,
  dailySyncCapPerPlatform: 3,
  deepSyncDepth: 50,
  commentBatchUpdateDays: 7,
  lastAutoSyncAt: {},
  autoSyncEnabled: true,
};

export async function loadSettings(plugin: Plugin): Promise<OmniSettings> {
  return Object.assign({}, DEFAULT_SETTINGS, (await plugin.loadData()) ?? {});
}

export async function saveSettings(plugin: Plugin, settings: OmniSettings): Promise<void> {
  await plugin.saveData(settings);
}
