import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type OmniCollectorPlugin from "./main.js";

/** 设置页：用户可配置项（B站/YouTube/知乎/X；展开 Skill 走 Engine CLI，无 AI 配置）。 */
export class OmniSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: OmniCollectorPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName("同步").setHeading();
    new Setting(containerEl)
      .setName("同步模式")
      .setDesc("catalog = 轻量目录（快）；full = 含详情/评论（慢）。「同步全部」使用此模式。")
      .addDropdown((dd) =>
        dd
          .addOption("catalog", "轻量目录 (catalog)")
          .addOption("full", "完整详情 (full)")
          .setValue(this.plugin.pluginSettings.initialSyncMode)
          .onChange(async (value) => {
            this.plugin.pluginSettings.initialSyncMode = value as "catalog" | "full";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl).setName("同步计划").setHeading();
    new Setting(containerEl)
      .setName("启用自动同步")
      .setDesc("开启后每天按下述时刻自动同步（各平台在随机窗口内错峰执行）。")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.pluginSettings.autoSyncEnabled).onChange(async (value) => {
          this.plugin.pluginSettings.autoSyncEnabled = value;
          await this.plugin.saveSettings();
          this.plugin.reloadSyncScheduler();
        }),
      );
    new Setting(containerEl)
      .setName("每日同步时刻")
      .setDesc("24 小时制 HH:MM（默认 09:00）；各平台在此后随机窗口内错峰执行。")
      .addText((text) =>
        text
          .setPlaceholder("09:00")
          .setValue(this.plugin.pluginSettings.autoSyncTime)
          .onChange(async (value) => {
            const v = /^([01]\d|2[0-3]):[0-5]\d$/.test(value.trim()) ? value.trim() : "09:00";
            this.plugin.pluginSettings.autoSyncTime = v;
            await this.plugin.saveSettings();
            this.plugin.reloadSyncScheduler();
          }),
      );
    const platforms: Array<[string, string]> = [
      ["bilibili", "B站"],
      ["youtube", "YouTube"],
      ["zhihu", "知乎"],
      ["x", "X"],
    ];
    for (const [key, label] of platforms) {
      new Setting(containerEl)
        .setName(`${label} 自动同步频率`)
        .setDesc("daily = 每日自动同步；weekly = 每周自动同步。")
        .addDropdown((dd) =>
          dd
            .addOption("daily", "每日")
            .addOption("weekly", "每周")
            .setValue(this.plugin.pluginSettings.syncFrequency[key] ?? "daily")
            .onChange(async (value) => {
              this.plugin.pluginSettings.syncFrequency = {
                ...this.plugin.pluginSettings.syncFrequency,
                [key]: value as "daily" | "weekly",
              };
              await this.plugin.saveSettings();
              await this.plugin.updateRule(`${key}_sync_frequency`, value);
            }),
        );
    }
    new Setting(containerEl)
      .setName("初始化完整详情条数")
      .setDesc("首次/手动 full 同步最多拉取详情与评论的条数（区间 20~80）。")
      .addText((text) =>
        text
          .setValue(String(this.plugin.pluginSettings.initFullDetailLimit))
          .onChange(async (v) => {
            const n = Math.max(20, Math.min(80, Math.floor(Number(v) || 50)));
            this.plugin.pluginSettings.initFullDetailLimit = n;
            await this.plugin.saveSettings();
            await this.plugin.updateRule("init_full_detail_limit", String(n));
          }),
      );
    new Setting(containerEl)
      .setName("随机执行窗口（分钟）")
      .setDesc("自动同步在窗口内随机执行，避免固定时刻被风控。")
      .addText((text) =>
        text
          .setValue(String(this.plugin.pluginSettings.syncRandomWindowMinutes))
          .onChange(async (v) => {
            const n = Math.max(0, Math.floor(Number(v) || 120));
            this.plugin.pluginSettings.syncRandomWindowMinutes = n;
            await this.plugin.saveSettings();
            await this.plugin.updateRule("sync_random_window_minutes", String(n));
          }),
      );
    new Setting(containerEl)
      .setName("单平台每日同步上限")
      .setDesc("当天达到上限后不再自动触发该平台。")
      .addText((text) =>
        text
          .setValue(String(this.plugin.pluginSettings.dailySyncCapPerPlatform))
          .onChange(async (v) => {
            const n = Math.max(1, Math.floor(Number(v) || 3));
            this.plugin.pluginSettings.dailySyncCapPerPlatform = n;
            await this.plugin.saveSettings();
            await this.plugin.updateRule("daily_sync_cap_per_platform", String(n));
          }),
      );
    new Setting(containerEl)
      .setName("深度历史同步回溯深度（页）")
      .setDesc("手动深度同步时向后拉取的历史页数。")
      .addText((text) =>
        text
          .setValue(String(this.plugin.pluginSettings.deepSyncDepth))
          .onChange(async (v) => {
            const n = Math.max(1, Math.floor(Number(v) || 50));
            this.plugin.pluginSettings.deepSyncDepth = n;
            await this.plugin.saveSettings();
            await this.plugin.updateRule("deep_sync_default_depth", String(n));
          }),
      );
    new Setting(containerEl)
      .setName("评论批量更新最近 N 天")
      .setDesc("批量刷新最近 N 天内同步收藏的评论。")
      .addText((text) =>
        text
          .setValue(String(this.plugin.pluginSettings.commentBatchUpdateDays))
          .onChange(async (v) => {
            const n = Math.max(1, Math.floor(Number(v) || 7));
            this.plugin.pluginSettings.commentBatchUpdateDays = n;
            await this.plugin.saveSettings();
            await this.plugin.updateRule("comment_batch_update_days", String(n));
          }),
      );

    new Setting(containerEl)
      .setName("知乎开放平台 Access Secret")
      .setDesc("在 developer.zhihu.com/profile 生成，仅存本地加密区；官方 API 只覆盖公开收藏夹。留空则用浏览器登录态兜底。")
      .addText((text) =>
        text
          .setValue(this.plugin.pluginSettings.zhihuSecret)
          .onChange(async (value) => {
            this.plugin.pluginSettings.zhihuSecret = value.trim();
            await this.plugin.saveSettings();
            await this.plugin.updateRule("zhihu_secret_set", value.trim() ? "1" : "0");
          }),
      );

    new Setting(containerEl).setName("平台 Cookie").setHeading();
    for (const [key, label] of platforms) {
      let pasted = "";
      const statusRow = new Setting(containerEl).setName(`${label} Cookie`).setDesc("正在读取状态…");
      statusRow.addTextArea((ta) => {
        ta.setPlaceholder("粘贴 Cookie-Editor 导出的 JSON");
        ta.onChange((v) => {
          pasted = v;
        });
        ta.inputEl.setAttr("rows", "3");
        ta.inputEl.addClass("omni-cookie-input");
      });
      const refreshStatus = async (): Promise<void> => {
        try {
          const s = await this.plugin.engine.cookieStatus(key);
          const status = s.has_cookie
            ? `已导入 ${s.cookie_count} 个 Cookie（${s.valid ? "格式有效" : "格式异常"}）`
            : "未导入 Cookie";
          const account = s.account_status === "error" ? ` · 账号异常：${s.account_error_reason ?? ""}` : "";
          statusRow.setDesc(`${status} · 账号状态：${s.account_status}${account}`);
        } catch {
          statusRow.setDesc("Engine 未连接，导入后点击「导入」保存即可。");
        }
      };
      statusRow.addButton((btn) =>
        btn.setButtonText("导入").setCta().onClick(async () => {
          const value = pasted.trim();
          if (!value) {
            new Notice("请先粘贴 Cookie JSON");
            return;
          }
          try {
            const res = await this.plugin.engine.importCookie(key, value);
            new Notice(`${label} Cookie 已导入（${String(res.payload?.cookie_count ?? "?")} 个）`);
            pasted = "";
            await refreshStatus();
          } catch (err) {
            new Notice(`导入失败：${(err as Error).message}`);
          }
        }),
      );
      void refreshStatus();
    }

    new Setting(containerEl).setName("Engine").setHeading();
    new Setting(containerEl)
      .setName("自动启动 Engine")
      .setDesc("请求收藏/同步时自动拉起 Engine；关闭后需手动点侧边栏「启动引擎」。")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.pluginSettings.autoStartEngine).onChange(async (value) => {
          this.plugin.pluginSettings.autoStartEngine = value;
          await this.plugin.saveSettings();
          this.plugin.updateEngineAutoStart();
        }),
      );
    new Setting(containerEl)
      .setName("Node.js 路径")
      .setDesc("Engine 子进程使用的 Node 可执行文件；留空则使用 PATH 中的 node（Windows 可填完整路径）。")
      .addText((text) =>
        text
          .setValue(this.plugin.pluginSettings.nodeBin)
          .onChange(async (value) => {
            this.plugin.pluginSettings.nodeBin = value;
            await this.plugin.saveSettings();
            this.plugin.updateEngineNodeBin();
          }),
      );

    new Setting(containerEl).setName("规则中心").setHeading();
    const ruleBox = containerEl.createEl("div", { cls: "omni-rule-center" });
    const loadRules = async (): Promise<void> => {
      ruleBox.empty();
      try {
        const { rules, changes } = await this.plugin.engine.listRules();
        for (const rule of rules) {
          const row = ruleBox.createEl("div", { cls: "omni-rule-row" });
          const main = row.createEl("div", { cls: "omni-rule-main" });
          main.createEl("div", { text: rule.rule_key, cls: "omni-rule-name" });
          main.createEl("div", {
            text: `${rule.description ?? ""}${rule.impact ? ` · ${rule.impact}` : ""}`,
            cls: "omni-meta-text",
          });
          const editor = row.createEl("div", { cls: "omni-rule-editor" });
          const input = editor.createEl("input", {
            type: "text",
            attr: { value: rule.rule_value, style: "width:90px;" },
          });
          editor
            .createEl("button", { text: "保存", cls: "omni-act" })
            .addEventListener("click", async () => {
              await this.plugin.updateRule(rule.rule_key, input.value);
              await loadRules();
            });
          editor
            .createEl("button", { text: "默认", cls: "omni-act omni-act-ghost" })
            .addEventListener("click", async () => {
              if (rule.default_value !== null) {
                await this.plugin.updateRule(rule.rule_key, rule.default_value);
                await loadRules();
              }
            });
        }
        if (changes.length > 0) {
          ruleBox.createEl("div", { text: "最近变更", cls: "omni-section-title" });
          for (const c of changes.slice(0, 8)) {
            ruleBox.createEl("div", {
              text: `${c.changed_at}  ${c.rule_key}: ${c.old_value ?? "∅"} → ${c.new_value}`,
              cls: "omni-meta-text",
            });
          }
        }
      } catch (err) {
        ruleBox.createEl("div", {
          text: `规则中心加载失败：${(err as Error).message}`,
          cls: "omni-empty",
        });
      }
    };
    void loadRules();
  }
}
