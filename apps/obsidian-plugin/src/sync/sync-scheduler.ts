/**
 * 自动同步调度（PRD 15.4 同步计划）：
 * 频率（daily/weekly）+ 随机执行窗口 + 单日次数上限。
 */

export interface SyncScheduleInput {
  frequency: "daily" | "weekly";
  lastRunAt?: string | null;
  now?: Date;
  randomWindowMinutes?: number;
  /** 每日时刻锚点（HH:MM，默认 09:00）：下一次运行 = 上次锚点 + 周期 + 窗口随机偏移。 */
  timeOfDay?: string;
}

/** 解析 HH:MM，非法时回退 09:00。 */
export function parseTimeOfDay(v: string | undefined): { h: number; m: number } {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec((v ?? "").trim());
  if (!m) return { h: 9, m: 0 };
  return { h: Number(m[1]), m: Number(m[2]) };
}

/** 计算下一次自动同步时间（无历史记录则 5 分钟后；锚点时刻 + 窗口内随机偏移）。 */
export function nextSyncAt(input: SyncScheduleInput): Date {
  const now = input.now ?? new Date();
  if (!input.lastRunAt) {
    return new Date(now.getTime() + 5 * 60 * 1000);
  }
  const last = new Date(input.lastRunAt);
  const { h, m } = parseTimeOfDay(input.timeOfDay);
  const anchor = new Date(last);
  anchor.setHours(h, m, 0, 0);
  const intervalMs =
    input.frequency === "weekly" ? 7 * 24 * 3600 * 1000 : 24 * 3600 * 1000;
  const windowMs = Math.max(0, (input.randomWindowMinutes ?? 120)) * 60 * 1000;
  const offset = windowMs > 0 ? Math.floor(Math.random() * windowMs) : 0;
  return new Date(anchor.getTime() + intervalMs + offset);
}

/** 是否已到自动同步时间。 */
export function isSyncDue(input: SyncScheduleInput): boolean {
  return nextSyncAt(input).getTime() <= (input.now ?? new Date()).getTime();
}

/** 单日同步次数是否达到上限。 */
export function dailyCapReached(todayCount: number, cap: number): boolean {
  return todayCount >= Math.max(0, cap);
}
