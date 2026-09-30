/**
 * 构建脚本：把 src/main.tsx 打成单文件 IIFE，供 index.html 以 <script> 直接加载。
 * 纯前端产物 —— dist/game.js + index.html 可以双击打开（无需服务器）。
 *
 *   bun run build.ts          构建
 *   bun run build.ts --serve  构建并起本地静态服务器（开发用）
 *   bun run build.ts --min    构建并压缩
 */
import { mkdir, rm } from "node:fs/promises"

const args = new Set(Bun.argv.slice(2))
const minify = args.has("--min")
const serve = args.has("--serve")

const outdir = new URL("./dist/", import.meta.url).pathname

await rm(outdir, { recursive: true, force: true })
await mkdir(outdir, { recursive: true })

const result = await Bun.build({
  entrypoints: [new URL("./src/main.tsx", import.meta.url).pathname],
  outdir,
  naming: "game.js",
  target: "browser",
  format: "iife",
  minify,
  sourcemap: minify ? "none" : "linked",
  define: {
    "process.env.NODE_ENV": JSON.stringify(minify ? "production" : "development"),
  },
})

if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}

for (const output of result.outputs) {
  const kb = (output.size / 1024).toFixed(1)
  console.log(`  ${output.path.replace(process.cwd() + "/", "")}  ${kb} KB`)
}

if (serve) {
  const root = new URL(".", import.meta.url).pathname
  const wantPort = Number(process.env.PORT ?? 4173)
  const server = Bun.serve({
    // 端口被占用时自动退到系统分配的端口，避免"起了但没起来"
    port: wantPort,
    async fetch(req) {
      const url = new URL(req.url)
      const path = url.pathname === "/" ? "/index.html" : url.pathname
      const file = Bun.file(root + path.replace(/^\/+/, ""))
      if (await file.exists()) {
        // 开发时禁用缓存：否则改了代码浏览器可能还在跑旧的 game.js
        return new Response(file, { headers: { "cache-control": "no-store" } })
      }
      return new Response("Not Found", { status: 404 })
    },
  })
  console.log(`\n《贤者之途》 http://localhost:${server.port}/`)
}
