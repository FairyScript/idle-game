/**
 * HMR + Host 允许名单验收：真的起一个 `bun run dev`，在无头 Chrome 里跑三组检查。
 *
 *   A. 回环地址（http://127.0.0.1:PORT/）—— 基线：改一行源码就热替换，不刷新、状态不丢
 *   B. 允许的对外域名（http://idle.10111234.xyz:PORT/）—— 同一个应用经域名访问时
 *      依然能加载、HMR 端点（WebSocket）依然连得上、热替换依然生效
 *   C. 未在允许名单里的 Host —— 被 403 拒绝，且提示怎么加白名单
 *
 *   bun run dev:check
 *
 * 脚本会把源文件恢复原样（try/finally），改坏了也不会留在工作区。
 */
import puppeteer from "/root/.bun/install/global/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js"

const EXEC =
  process.env.CHROME_PATH ??
  "/root/.cache/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell"

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "")
const TARGET = `${ROOT}/src/ui/panels.tsx`
const ANCHOR = "<b>贤者之途</b>"
const PORT = Number(process.env.DEV_PORT ?? 4197)
/** 开发服务器默认放行的对外域名（对应 dev.ts 的 DEFAULT_PUBLIC_HOSTS）。 */
const ALLOWED_HOST = "idle.10111234.xyz"
const BLOCKED_HOST = "evil.example"

const fails: string[] = []
const passes: string[] = []
function check(name: string, ok: boolean, extra = "") {
  if (ok) passes.push(name)
  else fails.push(`${name}${extra ? ` — ${extra}` : ""}`)
}

const original = await Bun.file(TARGET).text()
if (!original.includes(ANCHOR)) {
  console.error(`✗ 找不到探针锚点（${TARGET} 里的品牌文案），验收无法进行`)
  process.exit(1)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function waitForServer(url: string, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return true
    } catch {
      // 还没起来
    }
    await sleep(150)
  }
  return false
}

const server = Bun.spawn({
  cmd: ["bun", "run", "dev.ts"],
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT) },
  stdout: "pipe",
  stderr: "pipe",
})

// 收集 dev server 的输出：Bun 会把"HMR 更新被谁拒绝"之类的诊断打到 stderr
let serverLog = ""
const pump = async (stream: ReadableStream<Uint8Array> | null) => {
  if (!stream) return
  const decoder = new TextDecoder()
  for await (const chunk of stream) serverLog += decoder.decode(chunk, { stream: true })
}
void pump(server.stdout)
void pump(server.stderr)

let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null

/**
 * 在一个页面上做完整的 HMR 探针：加载 → 校验注册表/端点 → 埋探针 →
 * 改源码 → 校验热替换、无整页刷新、状态保留。
 */
async function hmrProbe(label: string, url: string, mark: string) {
  if (!browser) return
  const page = await browser.newPage()
  const pageErrors: string[] = []
  page.on("pageerror", (e) => pageErrors.push((e as Error).stack ?? (e as Error).message))
  let navigations = 0
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigations++
  })
  await page.setViewport({ width: 1440, height: 940 })
  await page.goto(url, { waitUntil: "domcontentloaded" })
  await page.waitForFunction("!!window.__game", { timeout: 20000 })
  check(`${label}：页面能加载并跑起来`, true)
  check(`${label}：首次导航只有一次`, navigations === 1, `navigations=${navigations}`)

  // 1. 模块来自 dev server（Bun 的 dev 客户端脚本 = 即时打包入口）
  const devScript = await page
    .$eval("script[data-bun-dev-server-script]", (el) => (el as HTMLScriptElement).src)
    .catch(() => "")
  check(`${label}：加载 dev server 即时打包的模块`, devScript.includes("/_bun/client/"), devScript)

  // 2. kiko HMR 注册表 + 端点客户端已连接（经域名访问时这同时验证了 WebSocket 代理）
  const connected = await page
    .waitForFunction(
      `(() => {
        const reg = globalThis[Symbol.for("kiko:hmr")]
        const cli = globalThis[Symbol.for("kiko:hmr:client")]
        return reg && cli && cli.client.status === "connected" ? true : false
      })()`,
      { timeout: 15000, polling: 200 },
    )
    .then(() => true)
    .catch(() => false)
  const detail = await page.evaluate(() => {
    const cli = (globalThis as any)[Symbol.for("kiko:hmr:client")]
    return { transport: cli?.client?.transport ?? null, status: cli?.client?.status ?? null }
  })
  check(`${label}：HMR 注册表已安装且端点已连接`, connected, JSON.stringify(detail))

  // 3. 埋探针：整页刷新会清掉 window 上的；状态重置会清掉内核里的
  const before = await page.evaluate(() => {
    const g = (window as any).__game
    g.suspendSave() // 关掉自动存档，避免"刷新后从 localStorage 恢复"掩盖真实行为
    ;(window as any).__hmrProbe = "alive"
    g.meta.__hmrMark = 42
    g.state.gold = 12345
    return { timeOrigin: performance.timeOrigin }
  })

  // 4. 改一行源码，等热替换把新文案渲染出来
  await Bun.write(TARGET, original.replace(ANCHOR, `<b>贤者之途${mark}</b>`))
  const swapped = await page
    .waitForFunction(
      `document.querySelector(".al-brand b")?.textContent?.includes(${JSON.stringify(mark)}) === true`,
      { timeout: 20000, polling: 150 },
    )
    .then(() => true)
    .catch(() => false)
  check(`${label}：改源码后 DOM 热替换（无需刷新）`, swapped)

  // 5. 没有整页刷新 + 状态保留
  const after = await page.evaluate(() => {
    const g = (window as any).__game
    return {
      probe: (window as any).__hmrProbe ?? null,
      mark: g?.meta?.__hmrMark ?? null,
      gold: g?.state?.gold ?? null,
      tabs: document.querySelectorAll(".al-tab").length,
      timeOrigin: performance.timeOrigin,
    }
  })
  check(
    `${label}：没有整页刷新（timeOrigin 未变）`,
    after.timeOrigin === before.timeOrigin,
    `${before.timeOrigin} → ${after.timeOrigin}`,
  )
  check(`${label}：没有额外导航`, navigations === 1, `navigations=${navigations}`)
  check(`${label}：window 探针还在`, after.probe === "alive", String(after.probe))
  check(`${label}：内核状态保留`, after.mark === 42, String(after.mark))
  check(`${label}：内核数据没有被重置`, after.gold === 12345, String(after.gold))
  check(`${label}：界面结构完整`, after.tabs === 7, `tabs=${after.tabs}`)
  check(`${label}：没有未捕获异常`, pageErrors.length === 0, pageErrors.slice(0, 2).join(" | "))

  // 恢复源文件，避免把标记留给下一轮
  await Bun.write(TARGET, original)
  await sleep(300)
  await page.close()
}

try {
  const ready = await waitForServer(`http://127.0.0.1:${PORT}/`)
  check("dev server 起来了", ready, `http://127.0.0.1:${PORT}/`)
  if (!ready) throw new Error("dev server 未就绪")

  browser = await puppeteer.launch({
    executablePath: EXEC,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      // 把公网域名解析到本机，模拟"隧道/反向代理把请求打到本机 dev server"
      `--host-resolver-rules=MAP ${ALLOWED_HOST} 127.0.0.1, MAP ${BLOCKED_HOST} 127.0.0.1`,
    ],
  })

  // A. 回环基线
  await hmrProbe("回环", `http://127.0.0.1:${PORT}/`, "HMR-A")
  // B. 允许的对外域名（走代理 + WebSocket 桥接）
  await hmrProbe("允许域名", `http://${ALLOWED_HOST}:${PORT}/`, "HMR-B")

  // C. 未放行的 Host 必须被拒绝，并给出可操作的提示
  const page = await browser.newPage()
  const blocked = await page.goto(`http://${BLOCKED_HOST}:${PORT}/`, { waitUntil: "domcontentloaded" })
  const blockedText = await page.evaluate(() => document.body.innerText)
  check("未放行的 Host 返回 403", blocked?.status() === 403, `status=${blocked?.status()}`)
  check(
    "拒绝信息说明如何加白名单",
    blockedText.includes("DEV_ALLOWED_HOSTS"),
    blockedText.slice(0, 80),
  )
  await page.close()
} catch (error) {
  fails.push(`运行异常：${(error as Error).message}`)
} finally {
  // 一定要把源文件恢复原样，避免把标记留在工作区
  await Bun.write(TARGET, original)
  await browser?.close()
  server.kill()
  await server.exited.catch(() => {})
}

console.log(`\n${passes.length} 通过 / ${fails.length} 失败`)
for (const p of passes) console.log(`  ✓ ${p}`)
for (const f of fails) console.log(`  ✗ ${f}`)
if (fails.length) {
  await sleep(300)
  console.log("\n── dev server 输出 ──")
  console.log(serverLog.trim() || "(空)")
  process.exit(1)
}
console.log("\nHMR 与 Host 允许名单都工作正常。")
