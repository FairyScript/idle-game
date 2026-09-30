/**
 * 闪烁审计：在"真实局面"下（研究进行中、日志已满、选择器展开）逐个页签检查
 *   - 有没有任何 DOM 元素被拆掉重建（这是闪烁的唯一硬指标：
 *     元素一旦被重建，就会丢焦点 / 丢 hover / 丢 :active / 重置滚动 / 重跑 CSS 过渡）
 *   - 结构变更与属性写入的频率有多高
 *
 *   bun run tools/audit-flicker.ts
 */
import puppeteer from "/root/.bun/install/global/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js"

const EXEC =
  process.env.CHROME_PATH ??
  "/root/.cache/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell"
const ROOT = new URL("..", import.meta.url).pathname

const server = Bun.serve({
  port: 0,
  async fetch(req) {
    const p = new URL(req.url).pathname
    const rel = p === "/" ? "index.html" : p.slice(1)
    const f = Bun.file(ROOT + rel)
    return (await f.exists()) ? new Response(f, { headers: { "cache-control": "no-store" } }) : new Response("404")
  },
})

const browser = await puppeteer.launch({ executablePath: EXEC, headless: true, args: ["--no-sandbox"] })
const page = await browser.newPage()
page.on("pageerror", (e) => console.log("PAGEERROR", (e as Error).message))
await page.setViewport({ width: 1440, height: 940 })
await page.goto(`http://localhost:${server.port}/?nosave=1`, { waitUntil: "domcontentloaded" })
await page.waitForFunction("!!window.__game", { timeout: 20000 })

// 造一个"真实局面"：跑 8 分钟游戏时间、研究进行中、日志超过 26 条
await page.evaluate(() => {
  const g = (window as any).__game
  g.actions.research("t_lead")
  for (let i = 0; i < 4800; i++) {
    g.state.stock.sulfur = Math.max(g.state.stock.sulfur, 30)
    g.state.stock.salt = Math.max(g.state.stock.salt, 30)
    g.step(0.1)
  }
  g.actions.research("ley1")
  g.sync()
})
await new Promise((r) => setTimeout(r, 400))

const TABS = ["workshop", "matter", "recipes", "tech", "market", "eternal", "help"]

const res = await page.evaluate(async (tabs: string[]) => {
  const g = (window as any).__game
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
  const out: any[] = []

  for (const tab of tabs) {
    g.actions.setTab(tab)
    await sleep(400)
    const root = document.querySelector(".al-main") as HTMLElement
    // 展开第 1 座熔炉的配方选择器，把最复杂的子树也算进来
    if (tab === "workshop") {
      g.actions.openPicker(0)
      await sleep(250)
    }
    const all = Array.from(root.querySelectorAll("*")) as any[]
    all.forEach((el) => (el.__alive = true))

    let childList = 0
    let attrs = 0
    const obs = new MutationObserver((recs) => {
      for (const r of recs) r.type === "childList" ? childList++ : r.type === "attributes" ? attrs++ : 0
    })
    obs.observe(root, { childList: true, subtree: true, attributes: true })
    const seq0 = g.state.logSeq
    await sleep(2500) // 约 25 tick
    obs.disconnect()
    const replaced = all.filter((el) => !el.isConnected)
    out.push({
      tab,
      elements: all.length,
      replaced: replaced.length,
      sample: replaced.slice(0, 4).map((el) => el.tagName + "." + String(el.className).slice(0, 22)),
      childListPer25tick: childList,
      attrsPer25tick: attrs,
      newLog: g.state.logSeq - seq0,
    })
    if (tab === "workshop") g.actions.openPicker(null)
  }
  return { out, logRows: document.querySelectorAll(".al-log > div").length, logLen: g.state.log.length }
}, TABS)

console.log(`日志 ${res.logLen} 条（面板显示 ${res.logRows} 行）\n`)
console.log("页签              元素数  被重建   childList/25tick  attrs/25tick  新日志  重建样例")
for (const r of res.out as any[]) {
  console.log(
    `${r.tab.padEnd(16)} ${String(r.elements).padStart(6)} ${String(r.replaced).padStart(7)} ` +
      `${String(r.childListPer25tick).padStart(17)} ${String(r.attrsPer25tick).padStart(13)} ${String(r.newLog).padStart(7)}  ${r.sample.join(" | ")}`,
  )
}
const bad = (res.out as any[]).filter((r) => r.replaced > 0)
console.log(bad.length ? `\n✗ ${bad.length} 个页签仍有元素被重建` : "\n✓ 所有页签均无元素被重建")

await browser.close()
server.stop(true)
if (bad.length) process.exit(1)
