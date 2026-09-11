// Fav Collector local-only build: bundle src/main.ts -> main.js (Obsidian loads only main.js + manifest.json + styles.css).
import esbuild from "esbuild";

const production = process.argv.includes("production");

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "node:path",
    "node:net",
    "node:crypto",
    "node:child_process",
    "node:fs",
    "node:os",
    "node:url",
    "node:module",
  ],
  format: "cjs",
  target: "es2020",
  platform: "node",
  outfile: "main.js",
  sourcemap: production ? false : "inline",
  logLevel: "info",
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
