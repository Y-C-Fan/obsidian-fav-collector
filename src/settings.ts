export interface FavSettings {
  biliCookies: string;
  xCookies: string;
  zhihuSecret: string;
  ytdlpPath: string;
  ytCookieFile: string;
  xyzAccessToken: string;
  xyzRefreshToken: string;
  xyzDeviceId: string;
  lastSync: Record<string, { at: string; ok: boolean; added: number; error?: string }>;
}

export const DEFAULT_SETTINGS: FavSettings = {
  biliCookies: "",
  xCookies: "",
  zhihuSecret: "",
  ytdlpPath: "D:\\DevEnv\\bin\\yt-dlp.exe",
  ytCookieFile: "",
  xyzAccessToken: "",
  xyzRefreshToken: "",
  xyzDeviceId: "",
  lastSync: {},
};
