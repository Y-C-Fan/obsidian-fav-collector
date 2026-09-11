// Engine 单文件打包：部署到数据目录即可独立运行（Obsidian 插件拉起）
// 外置 better-sqlite3（原生 .node 二进制）；Node 内置模块自动外置
import esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// 版本唯一真相源：obsidian-plugin/manifest.json；盖戳进 bundle + dist/engine.version（插件自更新比对用）
const ENGINE_VERSION = JSON.parse(
  fs.readFileSync(path.join(here, "../obsidian-plugin/manifest.json"), "utf8"),
).version;

const production = process.argv.includes("production");

const context = await esbuild.context({
  entryPoints: ["dist/index.js"],
  bundle: true,
  // 第三方运行时依赖外置，部署时以 junction 指向真实包目录（各自解析内部传递依赖）
  external: [
    "better-sqlite3",
    "ws",
    "playwright",
    "playwright-extra",
    "puppeteer-extra-plugin-stealth",
  ],
  format: "cjs",
  target: "node20",
  platform: "node",
  outfile: "dist/engine.cjs",
  sourcemap: production ? false : "inline",
  logLevel: "info",
  define: { __ENGINE_VERSION__: JSON.stringify(ENGINE_VERSION) },
});

if (production) {
  await context.rebuild();
  await context.dispose();
  fs.writeFileSync(path.join(here, "dist/engine.version"), `${ENGINE_VERSION}\n`);
  console.log(`[esbuild] ENGINE_VERSION=${ENGINE_VERSION}`);
} else {
  await context.watch();
}
