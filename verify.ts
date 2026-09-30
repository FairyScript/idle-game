/**
 * 端到端验证：用真实的无头 Chrome 打开构建产物，
 * 检查渲染、交互、反应式更新、存档与离线结算。
 *
 *   bun run verify.ts            （需要先 bun run build.ts）
 */
import puppeteer from "/root/.bun/install/global/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js"

const EXEC =
  process.env.CHROME_PATH ??
  "/root/.cache/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell"
// 端口用 0 让系统分配空闲端口，避免上一次异常退出留下的端口占用把验收卡住
const server = Bun.serve({
  port: Number(process.env.PORT ?? 0),
  async fetch(req) {
    const url = new URL(req.url)
    const path = url.pathname === "/" ? "/index.html" : url.pathname
    const file = Bun.file(new URL("." + path, import.meta.url).pathname)
    if (await file.exists()) return new Response(file, { headers: { "cache-control": "no-store" } })
    return new Response("404", { status: 404 })
  },
})
const URL_BASE = process.env.URL ?? `http://localhost:${server.port}/`
console.log(`验收服务器：${URL_BASE}`)

const fails: string[] = []
const passes: string[] = []
function check(name: string, ok: boolean, extra = "") {
  if (ok) passes.push(name)
  else fails.push(`${name}${extra ? " — " + extra : ""}`)
}

try {
const browser = await puppeteer.launch({
  executablePath: EXEC,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader"],
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 940 })

const consoleErrors: string[] = []
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text())
})
page.on("pageerror", (e) => consoleErrors.push("pageerror: " + (e as Error).message))

await page.goto(URL_BASE + "?nosave=1", { waitUntil: "domcontentloaded" })
await page.waitForFunction("!!window.__game", { timeout: 15000 })

// ── 1. 基础渲染 ─────────────────────────────────────────────────────────
const title = await page.$eval(".al-brand b", (e) => e.textContent)
check("标题渲染", title === "贤者之途", String(title))

const slotCount = await page.$$eval(".al-slot", (els) => els.length)
check("熔炉槽位渲染 3 座", slotCount === 3, `实际 ${slotCount}`)

const hasStyle = await page.evaluate(() => document.adoptedStyleSheets.length > 0 || !!document.querySelector("style"))
check("样式已注入", hasStyle)

// 关键：样式必须真的"生效"，而不只是被注入
const stylesApplied = await page.evaluate(() => {
  const app = document.querySelector(".al-app") as HTMLElement
  const btn = document.querySelector(".al-btn") as HTMLElement
  const top = document.querySelector(".al-top") as HTMLElement
  const cs = getComputedStyle(app)
  return {
    display: cs.display,
    overflow: cs.overflow,
    color: cs.color,
    buttonRadius: getComputedStyle(btn).borderRadius,
    topBorder: getComputedStyle(top).borderBottomWidth,
    appBox: app.getBoundingClientRect().width,
  }
})
check("根容器 flex 布局生效", stylesApplied.display === "flex", stylesApplied.display)
check("按钮圆角样式生效", stylesApplied.buttonRadius.startsWith("7"), stylesApplied.buttonRadius)
check("顶栏下边框样式生效", parseFloat(stylesApplied.topBorder) >= 1, stylesApplied.topBorder)
check("根容器宽度非 0", stylesApplied.appBox > 300, String(stylesApplied.appBox))

// ── 2. 反应式更新：模拟推进 20 秒，硫磺应该涨起来 ────────────────────────
const before = await page.evaluate(() => {
  const g = (window as any).__game
  return { sulfur: g.state.stock.sulfur, t: g.state.t }
})
await page.evaluate(() => {
  const g = (window as any).__game
  for (let i = 0; i < 200; i++) g.step(0.1)
})
await new Promise((r) => setTimeout(r, 400)) // 等信号刷到 DOM
const after = await page.evaluate(() => {
  const g = (window as any).__game
  return { sulfur: g.state.stock.sulfur, t: g.state.t }
})
check("模拟推进", after.t > before.t + 15, `t ${before.t}→${after.t}`)
check("煅烧产出硫磺", after.sulfur > before.sulfur + 2, `${before.sulfur}→${after.sulfur}`)

const sulfurShown = await page.evaluate(() => document.body.innerText.includes("硫磺"))
check("物质面板文本包含硫磺", sulfurShown)

// ── 2.5 面板稳定性：tick 绝不能重建面板 ────────────────────────────────
// 曾经的 bug：面板在 computed 里构建，kiko 构建时会读一次每个绑定信号，
// 于是整块面板变成"每 tick 重建" —— 表现为按钮/下拉/滚动条疯狂闪烁。
const stability = await page.evaluate(async () => {
  const g = (window as any).__game
  g.actions.setTab("workshop")
  await new Promise((r) => setTimeout(r, 250))
  const main = document.querySelector(".al-main") as HTMLElement
  const slot = document.querySelector(".al-slot") as any
  const btn = document.querySelector(".al-slot .al-btn") as any
  slot.__probe = 1
  btn.__probe = 1
  let childList = 0
  let attrs = 0
  const obs = new MutationObserver((recs) => {
    for (const rec of recs) {
      if (rec.type === "childList") childList++
      else if (rec.type === "attributes") attrs++
    }
  })
  obs.observe(main, { childList: true, subtree: true, attributes: true })
  await new Promise((r) => setTimeout(r, 1000)) // 约 10 次 tick
  obs.disconnect()
  const slotAfter = document.querySelector(".al-slot") as any
  const btnAfter = document.querySelector(".al-slot .al-btn") as any
  return {
    childList,
    attrs,
    sameSlot: slotAfter?.__probe === 1,
    sameButton: btnAfter?.__probe === 1,
  }
})
check("tick 不会重建面板 DOM（不闪烁）", stability.sameSlot && stability.sameButton, JSON.stringify(stability))
check("面板重建量接近于零", stability.childList <= 40, `childList=${stability.childList}`)
check("面板内部仍在细粒度更新", stability.attrs > 0, `attrs=${stability.attrs}`)

// 节点稳定 + 数字照样在变
const liveUpdate = await page.evaluate(async () => {
  const g = (window as any).__game
  g.actions.setTab("matter")
  await new Promise((r) => setTimeout(r, 250))
  const row = document.querySelectorAll(".al-subrow")[0] as any
  row.__probe = 1
  const before = row.textContent
  await new Promise((r) => setTimeout(r, 1200))
  const after = document.querySelectorAll(".al-subrow")[0] as any
  return { same: after?.__probe === 1, changed: after?.textContent !== before }
})
check("切到物质页后行节点保持稳定", liveUpdate.same === true)
check("稳定节点的数字仍在更新", liveUpdate.changed === true)
await page.evaluate(() => (window as any).__game.actions.setTab("workshop"))

// 3. 顶栏数字确实被更新（反应式绑定生效）
const headerText = await page.$eval(".al-top", (e) => e.textContent ?? "")
check("顶栏包含速度倍率", headerText.includes("速度"), headerText.slice(0, 120))

// ── 4. 点击交互：切换页签 ───────────────────────────────────────────────
const tabLabels = await page.$$eval(".al-tab", (els) => els.map((e) => e.textContent ?? ""))
check("页签数量 >= 7", tabLabels.length >= 7, tabLabels.join("|"))

async function clickTab(name: string) {
  const tabs = await page.$$(".al-tab")
  for (const t of tabs) {
    const txt = await t.evaluate((e) => e.textContent ?? "")
    if (txt.includes(name)) {
      await t.click()
      await new Promise((r) => setTimeout(r, 120))
      return true
    }
  }
  return false
}

for (const [name, probe] of [
  ["物质与配平", "地脉 · 元素供给"],
  ["配方图鉴", "配方图鉴"],
  ["研究", "科技树"],
  ["市场", "催化剂"],
  ["永恒", "永恒炼金术"],
  ["玩法", "开局 5 分钟"],
] as const) {
  const ok = await clickTab(name)
  check(`切到「${name}」页签`, ok)
  const body = await page.$eval(".al-main", (e) => e.textContent ?? "")
  check(`「${name}」内容渲染`, body.includes(probe), body.slice(0, 80))
  if (name === "市场") {
    const hasAutoSell = await page.evaluate(() => document.querySelectorAll(".al-main input[type=checkbox]").length)
    check("市场页有自动出售开关", hasAutoSell >= 1, String(hasAutoSell))
  }
}

// ── 5. 研究交互：开始一项研究 ───────────────────────────────────────────
await clickTab("工坊")
const startedResearch = await page.evaluate(() => {
  const g = (window as any).__game
  g.actions.research("t_lead")
  return g.state.research.active
})
check("能从 UI 层开始研究", startedResearch === "t_lead", String(startedResearch))

// 让研究跑完
await page.evaluate(() => {
  const g = (window as any).__game
  g.state.stock.sulfur = 300
  g.state.stock.salt = 300
  for (let i = 0; i < 400; i++) {
    g.state.stock.sulfur = Math.max(g.state.stock.sulfur, 60)
    g.state.stock.salt = Math.max(g.state.stock.salt, 60)
    g.step(0.1)
  }
})
await new Promise((r) => setTimeout(r, 250)) // 等信号同步到 DOM
const techDone = await page.evaluate(() => (window as any).__game.state.techs.t_lead === true)
check("研究可完成并解锁配方", techDone)

// 配方解锁后，槽位选择器里应出现「合金·铅」
const unlockedInUi = await page.evaluate(() => {
  const g = (window as any).__game
  return g.view.recipes.alloy_lead.unlocked.get()
})
check("配方解锁信号已更新", unlockedInUi === true)

// ── 6. 槽位换配方（真实点击 picker） ────────────────────────────────────
const pickerWorked = await page.evaluate(async () => {
  const g = (window as any).__game
  g.actions.openPicker(1)
  await new Promise((r) => setTimeout(r, 120))
  return document.querySelectorAll(".al-picker .al-rec").length
})
check("配方选择器展开", pickerWorked >= 16, `选项 ${pickerWorked}`)

const assigned = await page.evaluate(async () => {
  const btns = Array.from(document.querySelectorAll(".al-picker .al-rec")) as HTMLElement[]
  const target = btns.find((b) => (b.textContent ?? "").includes("合金·铅") && !b.hasAttribute("disabled"))
  if (!target) return null
  target.click()
  await new Promise((r) => setTimeout(r, 150))
  return (window as any).__game.state.slots[1].recipe
})
check("点击选择器可以给槽位换配方", assigned === "alloy_lead", String(assigned))

// ── 7. 市场卖出 ─────────────────────────────────────────────────────────
const sold = await page.evaluate(() => {
  const g = (window as any).__game
  g.state.stock.sulfur = 100
  const gold0 = g.state.gold
  g.actions.sell("sulfur", 10)
  return { gold: g.state.gold, gold0, stock: g.state.stock.sulfur }
})
check("卖出获得金币", sold.gold > sold.gold0 && sold.stock === 90, JSON.stringify(sold))

// ── 8. 存档写入与离线结算 ───────────────────────────────────────────────
// ── 8. 存档：先离开 no-save 模式，等自动存档落盘 ────────────────────────
const noSaveHadNothing = await page.evaluate(() => localStorage.getItem("magnum-opus-idle/save/v1"))
check("?nosave=1 不写存档", noSaveHadNothing === null, String(noSaveHadNothing))
await page.goto(URL_BASE, { waitUntil: "domcontentloaded" })
await page.waitForFunction("!!window.__game", { timeout: 15000 })
await new Promise((r) => setTimeout(r, 5600))
const saved = await page.evaluate(() => {
  const raw = localStorage.getItem("magnum-opus-idle/save/v1")
  return raw ? JSON.parse(raw) : null
})
check("localStorage 已写入存档", !!saved && !!saved.state)
check("存档含版本号", saved?.v === 1, String(saved?.v))

const offlineWorks = await page.evaluate(() => {
  // 关掉一切写档，否则 beforeunload 会把伪造的旧存档覆盖掉
  const g = (window as any).__game
  g.suspendSave()
  clearInterval(g.timer)
  const raw = localStorage.getItem("magnum-opus-idle/save/v1")!
  const blob = JSON.parse(raw)
  // 伪造：8 小时前存档，库存清零，看离线能否推进
  blob.savedAt = Date.now() - 8 * 3600 * 1000
  blob.state.stock.sulfur = 0
  blob.state.t = 0
  localStorage.setItem("magnum-opus-idle/save/v1", JSON.stringify(blob))
  return true
})
check("可写入伪造存档", offlineWorks)

await page.reload({ waitUntil: "domcontentloaded" })
await page.waitForFunction("!!window.__game", { timeout: 15000 })
await new Promise((r) => setTimeout(r, 500))
const offline = await page.evaluate(() => {
  const g = (window as any).__game
  return {
    show: g.view.showOffline.get(),
    report: g.view.offlineReport.get(),
    t: g.state.t,
    sulfur: g.state.stock.sulfur,
    slag: g.state.stock.slag,
  }
})
check("离线超过阈值会弹结算窗", offline.show === true, JSON.stringify(offline))
check("离线推进了本局时间", offline.t > 60, `t=${offline.t}`)
check("离线产出硫磺", offline.sulfur > 1, `sulfur=${offline.sulfur}`)
// 离线结算本身不产废渣：直接调用内核的离线入口，用必然溢出的状态验证
const offlineSlag = await page.evaluate(() => {
  const g = (window as any).__game
  clearInterval(g.timer)
  g.state.stock.slag = 0
  g.state.stock.salt = 1e6 // 远超上限，在线一秒就会溢出
  g.offline(3600)
  return g.state.stock.slag
})
check("离线结算不产生废渣", offlineSlag === 0, `slag=${offlineSlag}`)

const modalText = await page.evaluate(() => document.querySelector(".al-modal")?.textContent ?? "")
check("结算窗内容完整", modalText.includes("离线时长") && modalText.includes("贤者之石"), modalText.slice(0, 90))

// 关闭弹窗
await page.evaluate(() => (window as any).__game.actions.setShowOffline(false))
await new Promise((r) => setTimeout(r, 150))
const modalGone = await page.$(".al-modal")
check("弹窗可以关闭", modalGone === null)

// ── 9. 大跨度快进（模拟挂机 20 分钟）不崩且能推进 ───────────────────────
const longRun = await page.evaluate(() => {
  const g = (window as any).__game
  const t0 = g.state.t
  const p0 = g.state.produced.sulfur ?? 0
  for (let i = 0; i < 12000; i++) g.step(0.1)
  return { t0, t1: g.state.t, p0, p1: g.state.produced.sulfur ?? 0, finite: Number.isFinite(g.state.gold) }
})
check("长时间模拟不崩溃", longRun.t1 > longRun.t0 + 1000, JSON.stringify(longRun))
check("长时间模拟持续产出", longRun.p1 > longRun.p0, JSON.stringify(longRun))
check("长时间模拟数值保持有限", longRun.finite === true)

// 卖出会真的换来金币（手动操作是主要收入来源）
const goldFlow = await page.evaluate(() => {
  const g = (window as any).__game
  g.state.stock.sulfur = 200
  const g0 = g.state.gold
  g.actions.sell("sulfur", "all")
  return { g0, g1: g.state.gold }
})
check("卖出大量商品获得金币", goldFlow.g1 > goldFlow.g0, JSON.stringify(goldFlow))

// ── 10. 轮回 ────────────────────────────────────────────────────────────
const reborn = await page.evaluate(() => {
  const g = (window as any).__game
  g.state.runPs = 300
  g.actions.rebirth()
  return { seals: g.meta.seals, runPs: g.state.runPs, t: g.state.t, techs: Object.keys(g.state.techs).length }
})
check("轮回发放贤者之印并重置本局", reborn.seals > 0 && reborn.runPs === 0 && reborn.techs === 0, JSON.stringify(reborn))

// ── 11. 元升级 ──────────────────────────────────────────────────────────
const metaBuy = await page.evaluate(() => {
  const g = (window as any).__game
  g.meta.ps = 500
  g.actions.buyMeta("m_speed")
  return { lv: g.meta.upgrades.m_speed, ps: g.meta.ps }
})
check("元升级可购买并扣费", metaBuy.lv === 1 && metaBuy.ps < 500, JSON.stringify(metaBuy))

// ── 12. 截图（人工看一眼） ──────────────────────────────────────────────
await page.evaluate(() => {
  const g = (window as any).__game
  g.meta.ps = 1234
  g.state.gold = 8888
  g.actions.setTab("workshop")
})
await new Promise((r) => setTimeout(r, 300))
await page.screenshot({ path: "docs/screenshot-workshop.png" })
await page.evaluate(() => (window as any).__game.actions.setTab("matter"))
await new Promise((r) => setTimeout(r, 300))
await page.screenshot({ path: "docs/screenshot-matter.png" })
await page.evaluate(() => (window as any).__game.actions.setTab("tech"))
await new Promise((r) => setTimeout(r, 300))
await page.screenshot({ path: "docs/screenshot-tech.png", fullPage: false })

// ── 12.5 编年史日志必须随事件更新（曾经因为原地修改数组而不刷新） ─────
await page.evaluate(() => {
  const g = (window as any).__game
  g.restart() // 离线测试里把循环掐了，这里重新挂上
  g.actions.setTab("workshop")
})
await new Promise((r) => setTimeout(r, 200))
const logBefore = await page.evaluate(() => document.querySelectorAll(".al-log div").length)
const logAfter = await page.evaluate(async () => {
  const g = (window as any).__game
  g.state.produced.lead = Math.max(g.state.produced.lead, 1)
  g.state.milestones = {} // 让伟业重新触发一次，产生一条新日志
  for (let i = 0; i < 10; i++) g.step(0.1)
  await new Promise((r) => setTimeout(r, 250))
  const txt = document.querySelector(".al-log")?.textContent ?? ""
  return { count: document.querySelectorAll(".al-log div").length, txt }
})
check("编年史日志会新增条目", logAfter.count > 0, `before=${logBefore} after=${logAfter.count}`)
check("编年史日志内容随事件更新", logAfter.txt.includes("伟业达成"), logAfter.txt.slice(0, 80))

// ── 12.6 全局闪烁护栏：任何页签的任何元素都不允许被重建 ─────────────────
const flicker = await page.evaluate(async () => {
  const g = (window as any).__game
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
  // 造一个"真实局面"：研究进行中 + 有日志
  g.state.stock.sulfur = 200
  g.state.stock.salt = 200
  g.actions.research("t_lead")
  for (let i = 0; i < 400; i++) {
    g.state.stock.sulfur = Math.max(g.state.stock.sulfur, 30)
    g.state.stock.salt = Math.max(g.state.stock.salt, 30)
    g.step(0.1)
  }
  g.sync()
  const report: any[] = []
  for (const tab of ["workshop", "matter", "recipes", "tech", "market", "eternal", "help"]) {
    g.actions.setTab(tab)
    await sleep(320)
    if (tab === "workshop") {
      g.actions.openPicker(0) // 把最复杂的子树（16 个配方按钮）也算进来
      await sleep(220)
    }
    const root = document.querySelector(".al-main") as HTMLElement
    const all = Array.from(root.querySelectorAll("*")) as any[]
    all.forEach((el) => (el.__alive = true))
    let childList = 0
    const obs = new MutationObserver((recs) => {
      for (const r of recs) if (r.type === "childList") childList++
    })
    obs.observe(root, { childList: true, subtree: true })
    await sleep(1600)
    obs.disconnect()
    report.push({ tab, count: all.length, replaced: all.filter((el) => !el.isConnected).length, childList })
    if (tab === "workshop") g.actions.openPicker(null)
  }
  return report
})
const worstTab = flicker.reduce((a: any, b: any) => (b.replaced > a.replaced ? b : a), flicker[0])
check(
  "所有页签都不会重建任何元素（不闪烁）",
  flicker.every((r: any) => r.replaced === 0),
  JSON.stringify(flicker.filter((r: any) => r.replaced > 0)),
)
check("审计覆盖了足够多的元素", flicker.every((r: any) => r.count > 0), `最少的页签只有 ${Math.min(...flicker.map((r: any) => r.count))} 个元素`)

// ── 12.65 编年史必须是增量更新：新事件只插一行，旧行保持同一节点 ────────
const logIncremental = await page.evaluate(async () => {
  const g = (window as any).__game
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
  g.actions.setTab("workshop")
  g.state.log = []
  for (let i = 0; i < 6; i++) {
    g.state.gold = 100000
    g.actions.ley("aqua") // 每次强化都会写一条编年史
  }
  await sleep(400)
  const rows = Array.from(document.querySelectorAll(".al-log > div")) as any[]
  rows.forEach((el) => (el.__row = true))
  const before = rows.length
  g.actions.ley("aqua")
  await sleep(400)
  const after = Array.from(document.querySelectorAll(".al-log > div")) as any[]
  return {
    before,
    after: after.length,
    kept: rows.filter((el) => el.isConnected).length,
    oldestStillThere: rows[rows.length - 1]?.isConnected === true,
  }
})
check("新事件是插入而不是重建整个列表", logIncremental.kept === logIncremental.before, JSON.stringify(logIncremental))
check("编年史行数真的增加了", logIncremental.after === logIncremental.before + 1, JSON.stringify(logIncremental))

// ── 12.66 编年史刷新不能把滚动条打回顶端（读者位置要被锚住） ─────────────
const logScroll = await page.evaluate(async () => {
  const g = (window as any).__game
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
  g.actions.setTab("workshop")
  g.state.log = []
  for (let i = 40; i >= 1; i--) g.state.log.push({ id: 9000 + i, t: i, text: `滚动探针 ${i}`, tone: "" })
  g.view.logHead.set(-1) // 强制重推日志信号
  g.sync()
  await sleep(350)

  const box = document.querySelector(".al-log") as HTMLElement
  const topRow = () => {
    const boxTop = box.getBoundingClientRect().top
    for (const row of Array.from(box.children) as HTMLElement[]) {
      const r = row.getBoundingClientRect()
      if (r.bottom > boxTop + 1) return { row, off: r.top - boxTop }
    }
    return null
  }

  // 读者滚到中间
  box.scrollTop = 140
  await sleep(80)
  const before = topRow()

  // 顶部插入 5 条新事件（内核就是这么 unshift 的）
  for (let k = 0; k < 5; k++) g.state.log.unshift({ id: 9500 + k, t: 100 + k, text: `新事件 ${k}`, tone: "" })
  g.sync()
  await sleep(350)
  const after = topRow()
  const scrollAfter = box.scrollTop

  // 读者本来在顶端：应当继续跟随最新
  box.scrollTop = 0
  await sleep(80)
  g.state.log.unshift({ id: 9600, t: 200, text: "顶端新事件", tone: "" })
  g.sync()
  await sleep(350)

  return {
    overflowAnchor: getComputedStyle(box).overflowAnchor,
    scrollAfter,
    sameRow: before?.row === after?.row,
    drift: before && after ? Math.round(after.off - before.off) : null,
    followedTop: box.scrollTop === 0,
    topText: (box.children[0] as HTMLElement | undefined)?.textContent ?? "",
  }
})
check(
  "列表刷新后滚动位置不被重置（不打回顶端）",
  logScroll.scrollAfter > 5 && logScroll.sameRow,
  JSON.stringify(logScroll),
)
check(
  "锚点行相对视口不漂移",
  Math.abs(logScroll.drift ?? 99) <= 2,
  `drift=${logScroll.drift}`,
)
check(
  "读者在顶端时继续跟随最新事件",
  logScroll.followedTop && logScroll.topText.includes("顶端新事件"),
  JSON.stringify({ top: logScroll.followedTop, text: logScroll.topText }),
)
check(
  "日志容器关掉了浏览器滚动锚定（由自己接管）",
  logScroll.overflowAnchor === "none",
  logScroll.overflowAnchor,
)

// ── 12.67 可研究列表用 keyed For：集合变化只增删变动的行 ─────────────────
const suggestList = await page.evaluate(async () => {
  const g = (window as any).__game
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
  g.actions.setTab("workshop")
  g.state.techs = {}
  g.state.research.active = null
  g.actions.research("t_lead")
  g.actions.stopResearch()
  g.sync()
  await sleep(400)

  const rows = () => Array.from(document.querySelectorAll(".al-btn.sm.primary")).map((b) => b.parentElement as any)
  const before = rows()
  before.forEach((el) => (el.__row = true))

  // 完成列表里的第一项（金属引论）→ 该行消失；存活的行必须还是同一批节点
  g.state.techs["t_lead"] = true
  g.sync()
  await sleep(400)
  const after = rows()
  const kept = after.filter((el) => el.__row).length
  return {
    beforeCount: before.length,
    afterCount: after.length,
    kept,
    dropped: before.length - kept,
    newRows: after.length - kept,
    gone: !after.some((el) => (el.textContent ?? "").includes("金属引论")),
  }
})
check("可研究列表渲染出若干行", suggestList.beforeCount > 0, JSON.stringify(suggestList))
check(
  "集合变化只淘汰变动的那一行（其余复用节点）",
  suggestList.dropped === 1 && suggestList.newRows <= 1 && suggestList.kept >= 1,
  JSON.stringify(suggestList),
)
check("已完成的研究项从列表消失", suggestList.gone, JSON.stringify(suggestList))

// ── 12.7 反复切页签不应该泄漏 watcher（同步开销不增长） ─────────────────
const leak = await page.evaluate(async () => {
  const g = (window as any).__game
  const bench = async () => {
    g.actions.setTab("workshop")
    await new Promise((r) => setTimeout(r, 200))
    const t0 = performance.now()
    for (let i = 0; i < 25; i++) {
      g.sync()
      await new Promise((r) => setTimeout(r, 0))
    }
    return performance.now() - t0
  }
  const before = await bench()
  for (let i = 0; i < 40; i++) g.actions.setTab(i % 2 ? "tech" : "matter")
  const after = await bench()
  return { before, after, nodes: document.querySelectorAll(".al-main *").length }
})
check(
  "反复切页签后同步开销不增长（无 watcher 泄漏）",
  leak.after < leak.before * 2.5 + 40,
  JSON.stringify(leak),
)

// ── 13. 响应式布局：不同宽度下不应该横向溢出 ───────────────────────────
for (const w of [1600, 1280, 1024, 768, 420]) {
  await page.setViewport({ width: w, height: 900 })
  await new Promise((r) => setTimeout(r, 220))
  const m = await page.evaluate(() => {
    const de = document.documentElement
    const wide: string[] = []
    for (const sel of [".al-slot", ".al-subrow", ".al-tech", ".al-card", ".al-tab"]) {
      for (const el of Array.from(document.querySelectorAll(sel))) {
        const e = el as HTMLElement
        if (e.scrollWidth > e.clientWidth + 6 && e.clientWidth > 0) {
          wide.push(`${sel}:${e.clientWidth}<${e.scrollWidth}`)
        }
      }
    }
    const rows = Array.from(document.querySelectorAll(".al-subrow")) as HTMLElement[]
    const tall = rows.filter((r) => r.getBoundingClientRect().height > 72).length
    return {
      overflow: de.scrollWidth - window.innerWidth,
      wide: wide.slice(0, 3),
      tallRows: tall,
      rows: rows.length,
      appH: (document.querySelector(".al-app") as HTMLElement)?.getBoundingClientRect().height ?? 0,
    }
  })
  check(`${w}px 无横向溢出`, m.overflow <= 2, `overflow=${m.overflow} ${m.wide.join(",")}`)
  check(`${w}px 布局撑满视口`, m.appH >= 500, `h=${m.appH}`)
  check(`${w}px 仓库行是单行`, m.tallRows === 0, `${m.tallRows}/${m.rows} 行被折行`)
}
await page.setViewport({ width: 1440, height: 940 })

// ── 13.5 纯前端承诺：file:// 直开 index.html 也能玩 ────────────────────
const filePage = await browser.newPage()
const fileErrors: string[] = []
filePage.on("pageerror", (e) => fileErrors.push((e as Error).message))
await filePage.goto("file://" + new URL("index.html", import.meta.url).pathname, { waitUntil: "domcontentloaded" })
try {
  await filePage.waitForFunction("!!window.__game", { timeout: 10000 })
  const fileOk = await filePage.evaluate(() => {
    const g = (window as any).__game
    for (let i = 0; i < 200; i++) g.step(0.1)
    const text = document.body.innerText
    return { slots: document.querySelectorAll(".al-slot").length, sulfur: g.state.stock.sulfur, text: text.includes("贤者之途") }
  })
  check("file:// 直接打开 index.html 可以运行", fileOk.slots === 3 && fileOk.text, JSON.stringify(fileOk))
  check("file:// 下模拟正常推进", fileOk.sulfur > 0.5, String(fileOk.sulfur))
  check("file:// 下没有未捕获异常", fileErrors.length === 0, fileErrors.slice(0, 2).join(" | "))
} catch (e) {
  check("file:// 直接打开 index.html 可以运行", false, (e as Error).message)
}
await filePage.close()

// ── 14. 控制台错误 ──────────────────────────────────────────────────────
check("没有控制台错误", consoleErrors.length === 0, consoleErrors.slice(0, 4).join(" | "))

await browser.close()
server.stop(true)
} catch (err) {
  fails.push("运行期异常: " + (err as Error).message)
}
console.log(`\n通过 ${passes.length} 项：`)
for (const p of passes) console.log("  ✓ " + p)
if (fails.length) {
  console.log(`\n失败 ${fails.length} 项：`)
  for (const f of fails) console.log("  ✗ " + f)
  process.exit(1)
}
console.log("\n全部通过。")
