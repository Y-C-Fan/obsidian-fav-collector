# fav-collector

Obsidian 插件：把各平台的收藏同步成本地 Markdown。

支持平台：bilibili / youtube / zhihu / x / github / xiaoyuzhou

## 两种用法

### 1. Obsidian 内（主用法）

安装为社区插件后，在设置里配置各平台凭证，命令面板搜索 `fav`：

| 命令 | 作用 |
|---|---|
| `Sync all platforms` | 全平台同步 |
| `Sync platform: <name>` | 单平台同步 |

数据默认写到 vault 的 `Fav Collector/` 目录，每个平台一个子目录。**只新增，不修改已有文件**。

### 2. 命令行（CLI，无 Obsidian 也能同步）

```bash
# 安装依赖
npm install

# 构建
npm run build

# 查看同步状态
node cli.mjs status --vault /path/to/vault

# 全平台同步
node cli.mjs sync --vault /path/to/vault

# 单平台 / 多平台
node cli.mjs sync --vault /path/to/vault --platforms youtube,bilibili

# 预演（不写文件，只看会新增什么）
node cli.mjs sync --vault /path/to/vault --dry-run

# 列出全部平台
node cli.mjs list
```

`--vault` 指向 Obsidian vault 根目录，CLI 会复用插件写入该 vault 的凭证文件
`.obsidian/plugins/fav-collector-local/data.json`（只读，不修改）。

也就是说：**在 Obsidian 里配好凭证，之后命令行就能直接同步，不用再开 Obsidian。**

## 参数

```
node cli.mjs <command> [options]

command:
  sync            执行同步
  status          显示已同步状态与各平台凭证是否就绪
  list            列出支持的平台

options:
  --vault <path>       vault 根目录（默认读当前目录下的 vault.path，或 cwd）
  --platforms <list>   逗号分隔的平台名，默认全部
  --dry-run            只预演，不写文件
```

## 开发

```bash
npm install
npm run build        # esbuild → dist/
npm test
```

结构：

```
src/
  sync/            各平台同步逻辑（纯函数，FsAdapter 可注入）
    youtube.ts
    bilibili.ts
    zhihu.ts
    x.ts
    github.ts
    xiaoyuzhou.ts
    runner.ts      统一调度
    model.ts       平台注册表与类型
  markdown/writer.ts   Markdown 落盘
  settings.ts          settings 读写
cli.mjs             命令行入口（复用 dist/src/sync/*，不重造轮子）
```

`cli.mjs` 直接 require `dist/src/sync/*`，所以必须先 `npm run build`。

## 凭证安全

以下文件**绝不入库**，只在 vault 内：

```
.obsidian/plugins/fav-collector-local/data.json
*.cookie
cookies.txt
```

CLI 只读取该 `data.json`，不会修改，也不会把它复制到别处。
