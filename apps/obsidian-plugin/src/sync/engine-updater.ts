/**
 * Engine 自更新（0.7.6，根因修复）：
 * BRAT 只更新插件文件，dataDir/engine/engine.cjs 会永远停留在旧版——之前所有
 * Engine 侧修复（收藏夹/发布时间/原子 cookie）都因此没到达用户。
 * 插件启动时比对插件目录 engine.version 与数据目录 engine/.version，
 * 不一致则把插件自带的 engine.cjs + migrations/*.sql 拷过去，再拉起。
 * 与 Obsidian API 解耦，经 FileAdapter 注入，可单测。
 */

export interface FileAdapter {
  exists(p: string): Promise<boolean>;
  read(p: string): Promise<string>;
  write(p: string, content: string): Promise<void>;
  mkdir(p: string): Promise<void>;
  /** 返回目录下文件名列表（无 list 能力可省略，此时跳过 migrations 同步）。 */
  listFiles?(p: string): Promise<string[]>;
}

export type UpdateResult =
  | { status: "current"; version: string }
  | { status: "updated"; version: string }
  | { status: "skipped"; reason: string };

const join = (a: string, b: string) => `${a.replace(/[/\\]+$/, "")}/${b}`;

export async function ensureEngineUpToDate(
  adp: FileAdapter,
  pluginDir: string,
  dataDir: string,
): Promise<UpdateResult> {
  let bundled: string;
  try {
    bundled = (await adp.read(join(pluginDir, "engine.version"))).trim();
  } catch {
    return { status: "skipped", reason: "no bundled engine.version" };
  }
  if (!bundled) return { status: "skipped", reason: "empty bundled engine.version" };
  let installed = "";
  try {
    installed = (await adp.read(join(join(dataDir, "engine"), ".version"))).trim();
  } catch {
    installed = "";
  }
  if (installed === bundled) return { status: "current", version: bundled };

  // 版本不一致（或首次安装）：拷贝 engine.cjs + migrations
  let bundle: string;
  try {
    bundle = await adp.read(join(pluginDir, "engine.cjs"));
  } catch {
    return { status: "skipped", reason: "no bundled engine.cjs" };
  }
  const engineDir = join(dataDir, "engine");
  await adp.mkdir(engineDir);
  await adp.write(join(engineDir, "engine.cjs"), bundle);
  if (adp.listFiles) {
    try {
      const files = (await adp.listFiles(join(pluginDir, "migrations"))).filter((f) =>
        f.endsWith(".sql"),
      );
      if (files.length > 0) {
        const targetDir = join(engineDir, "migrations");
        await adp.mkdir(targetDir);
        for (const f of files) {
          const sql = await adp.read(join(join(pluginDir, "migrations"), f));
          await adp.write(join(targetDir, f), sql);
        }
      }
    } catch {
      // migrations 同步失败不阻断：Engine 启动时缺 migration 会报明确错误
    }
  }
  await adp.write(join(engineDir, ".version"), `${bundled}\n`);
  return { status: "updated", version: bundled };
}
