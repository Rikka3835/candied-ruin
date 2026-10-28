// 用途：让 wrangler 在「Electron 的 node 模式」下能正常解析命令行参数。
// 依赖：无。
// 为什么需要：
//   wrangler 用 yargs 的 hideBin(process.argv)，而 yargs 会检测 process.versions.electron，
//   判定“打包版 Electron 应用”时把起始下标设成 0 → argv.slice(1) 把 cli.js 路径也当成参数，
//   于是所有子命令都报 “Unknown argument: ...cli.js”。
//   Electron 自己用 process.defaultApp 区分“带参数运行”和“打包运行”，把它设成 true 即可回到 slice(2)。
//
// 用法（本机没有独立 node，只有 DSH 自带的 Electron）：
//   cd bubble-vanguard-app
//   CLOUDFLARE_API_TOKEN=xxx CLOUDFLARE_ACCOUNT_ID=yyy \
//     ELECTRON_RUN_AS_NODE=1 "/d/DSH/DeepSeek Harness.exe" \
//     -r scripts/wr-preload.cjs \
//     node_modules/.pnpm/wrangler@4.152.0/node_modules/wrangler/wrangler-dist/cli.js \
//     pages deploy pages-dist --project-name=bubble-vanguard --branch=main --commit-dirty=true
//
// 修改方式：换 wrangler 版本时改上面命令里的 cli.js 路径（其余不变）。

process.defaultApp = true;
