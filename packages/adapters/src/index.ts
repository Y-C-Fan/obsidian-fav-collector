export const PACKAGE_NAME = "@omni/adapters";
export { BaseAdapter } from "./base-adapter.js";
export type {
  SyncCursor,
  RawComment,
  CollectionRaw,
  CollectionDetail,
  UniversalCollection,
  NextPageStrategy,
  SessionStatus,
  HealthMetric,
} from "./base-adapter.js";
export { BilibiliAdapter } from "./bilibili/bilibili.adapter.js";
export { extractUgcSeason } from "./bilibili/bilibili.adapter.js";
export { getMixinKey, signParams } from "./bilibili/wbi.js";
export { YouTubeAdapter, extractYoutubeId } from "./youtube/youtube.adapter.js";
export { XiaohongshuAdapter, extractXiaohongshuId } from "./xiaohongshu/xiaohongshu.adapter.js";
export { ZhihuAdapter, extractZhihuId, parseZhihuFavContents } from "./zhihu/zhihu.adapter.js";
export { XAdapter, extractXId } from "./x/x.adapter.js";
