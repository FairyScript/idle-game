/** @jsxImportSource @kikojs/dom */
/**
 * 入口：装配内核 + 视图 + 游戏循环 + 存档。
 *
 * 循环节奏：每 100ms 推进一次模拟（固定步长 0.1s，用累加器保证稳定）；
 * 页面被切走 / 长时间卡顿时按离线规则快进（快进不产生废渣）。
 */
import { render } from "@kikojs/dom"
import { SUB_MAP } from "./sim/content"
import {
  applyCatalyst,
  buyElement,
  buyMeta,
  clearSlot,
  createMeta,
  createRun,
  hardReset,
  OFFLINE_CAP_SECONDS,
  rebirth,
  sellSubstance,
  setSlotRecipe,
  startResearch,
  step,
  stopResearch,
  syncSlots,
  toggleSlotPause,
  upgradeLey,
} from "./sim/engine"
import { fmt, fmtTime } from "./sim/format"
import { clearSave, readSave, reviveMeta, reviveRun, runOffline, writeSave } from "./sim/save"
import type { GameState, MetaState } from "./sim/types"
import { App } from "./ui/app"
import type { Actions } from "./ui/panels"
import { createView, sync } from "./ui/view"

const STEP = 0.1
/**
 * 无存档模式：在 URL 后加 ?nosave=1 可以完整试玩但不写 localStorage
 * （调试、录屏、或者想开一局不碰自己存档时很有用）。
 */
let saveSuspended = new URLSearchParams(location.search).has("nosave")

// ── 1. 读档 ──────────────────────────────────────────────────────────────
const meta: MetaState = createMeta()
const blob = readSave()
let S: GameState
let offlineReport: ReturnType<typeof runOffline> | null = null

if (blob) {
  Object.assign(meta, reviveMeta(blob.meta))
  S = reviveRun(blob.state, meta)
  const elapsed = Math.max(0, (Date.now() - (blob.savedAt ?? Date.now())) / 1000)
  if (elapsed > 45) {
    try {
      offlineReport = runOffline(S, meta, elapsed)
    } catch {
      offlineReport = null
    }
  }
} else {
  S = createRun(meta)
}

// ── 2. 视图 ──────────────────────────────────────────────────────────────
const view = createView()
let toastTimer: ReturnType<typeof setTimeout> | null = null

function toast(text: string, tone: "info" | "good" | "bad" = "info") {
  view.toast.set(text)
  view.toastTone.set(tone)
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => view.toast.set(""), 2600)
}

const actions: Actions = {
  setRecipe(i, r) {
    setSlotRecipe(S, i, r)
    sync(view, S, meta)
  },
  togglePause(i) {
    toggleSlotPause(S, i)
    sync(view, S, meta)
  },
  openPicker(i) {
    view.picker.set(i)
  },
  sell(sub, amount) {
    const have = S.stock[sub] ?? 0
    const qty = amount === "all" ? have : Math.min(amount, have)
    const gold = sellSubstance(S, meta, sub, qty)
    if (gold > 0) toast(`卖出 ${fmt(qty, 1)} ${SUB_MAP[sub].name} → +${fmt(gold, 1)} 金币`, "good")
    else toast("没有可卖的东西", "bad")
    sync(view, S, meta)
  },
  buy(sub, amount) {
    const qty = amount === "all" ? 1e9 : amount
    if (buyElement(S, meta, sub, qty)) toast(`购入 ${SUB_MAP[sub].name}`, "good")
    else toast("金币不足，或仓库已满", "bad")
    sync(view, S, meta)
  },
  ley(sub) {
    if (upgradeLey(S, meta, sub)) toast(`${SUB_MAP[sub].name}地脉强化成功`, "good")
    else toast("金币不足", "bad")
    sync(view, S, meta)
  },
  catalyst(id) {
    if (applyCatalyst(S, meta, id)) sync(view, S, meta)
    else toast("金币不足或尚未解锁", "bad")
  },
  research(id) {
    if (startResearch(S, meta, id)) sync(view, S, meta)
  },
  stopResearch() {
    stopResearch(S)
    sync(view, S, meta)
  },
  buyMeta(id) {
    if (buyMeta(S, meta, id)) sync(view, S, meta)
    else toast("贤者之石不足", "bad")
  },
  rebirth() {
    const seals = rebirth(S, meta)
    view.picker.set(null)
    view.tab.set("workshop")
    sync(view, S, meta, Date.now())
    toast(`轮回完成：获得 ${seals} 枚贤者之印，全局速度 +${seals * 4}%`, "good")
    if (!saveSuspended) writeSave(meta, S)
  },
  hardReset() {
    hardReset(S, meta)
    clearSave()
    view.confirmHardReset.set(false)
    view.showOffline.set(false)
    sync(view, S, meta, Date.now())
    toast("存档已清空，从第一炉重新开始", "info")
  },
  toggleAutoResearch() {
    S.autoResearch = !S.autoResearch
    sync(view, S, meta)
  },
  toggleAutoSell() {
    S.autoSell = !S.autoSell
    sync(view, S, meta)
  },
  setTab(t) {
    view.tab.set(t)
    view.picker.set(null)
  },
  confirmHardReset(b) {
    view.confirmHardReset.set(b)
  },
  setShowOffline(b) {
    view.showOffline.set(b)
  },
}

// ── 3. 挂载 ──────────────────────────────────────────────────────────────
const root = document.getElementById("app")
if (root) {
  root.innerHTML = ""
  render(<App v={view} a={actions} />, root)
}

sync(view, S, meta, blob?.savedAt ?? 0)
syncSlots(S, meta)
if (
  offlineReport &&
  (offlineReport.goldEarned > 0.5 || offlineReport.psEarned > 0 || offlineReport.seconds > 120)
) {
  view.offlineReport.set({
    seconds: offlineReport.seconds,
    capped: offlineReport.capped,
    gold: offlineReport.goldEarned,
    ps: offlineReport.psEarned,
    techs: offlineReport.techsDone,
    milestones: offlineReport.milestones,
  })
  view.showOffline.set(true)
}

// ── 4. 循环 ──────────────────────────────────────────────────────────────
let acc = 0
let last = Date.now()
let lastSave = 0
let savedAt = blob?.savedAt ?? 0

function advance(dt: number) {
  acc += dt
  let guard = 0
  // 最多一次补 6 秒的步数，防止极端卡顿把主线程锁死
  while (acc >= STEP && guard < 60) {
    step(S, meta, STEP)
    acc -= STEP
    guard++
  }
  if (guard >= 60) acc = 0
}

function catchUp(seconds: number) {
  // 页面被切走或长时间卡顿：用较大步长快进，且不产生废渣（保护挂机体验）
  acc = 0
  const total = Math.min(seconds, OFFLINE_CAP_SECONDS)
  const big = 0.5
  let n = Math.floor(total / big)
  while (n > 0) {
    const batch = Math.min(n, 400)
    for (let i = 0; i < batch; i++) step(S, meta, big, true)
    n -= batch
  }
  const rest = total - Math.floor(total / big) * big
  if (rest > 0) step(S, meta, rest, true)
}

function tick() {
  const now = Date.now()
  const dt = (now - last) / 1000
  last = now
  if (dt <= 0) return
  // 短间隔当作在线（照常产生废渣），长间隔按离线规则快进（不产生废渣）
  if (dt <= 3) advance(dt)
  else {
    catchUp(dt)
    if (dt > 120) toast(`离开期间推进了 ${fmtTime(Math.min(dt, OFFLINE_CAP_SECONDS))}`, "info")
  }

  sync(view, S, meta, savedAt)

  if (now - lastSave > 5000 && !saveSuspended) {
    if (writeSave(meta, S)) {
      lastSave = now
      savedAt = now
      sync(view, S, meta, savedAt)
    }
  }
}

let timer = setInterval(tick, 100)

window.addEventListener("beforeunload", () => {
  if (!saveSuspended) writeSave(meta, S)
})
document.addEventListener("visibilitychange", () => {
  // 回到前台立刻补一次，不要重置 last —— 否则后台被节流的那段时间会被白白丢掉
  if (document.visibilityState === "visible") tick()
})

// 调试入口（也方便自动化测试）
;(window as unknown as Record<string, unknown>).__game = {
  get state() {
    return S
  },
  meta,
  view,
  actions,
  step: (dt: number) => step(S, meta, dt),
  advance,
  clearSlot: (i: number) => clearSlot(S, i),
  timer,
  /** 供自动化测试使用：重新挂上循环 */
  restart: () => {
    clearInterval(timer)
    last = Date.now()
    timer = setInterval(tick, 100)
  },
  /** 供自动化测试使用：临时关闭一切写档 */
  suspendSave: () => {
    saveSuspended = true
  },
  saveSuspended: () => saveSuspended,
  offline: (seconds: number) => runOffline(S, meta, seconds),
  sync: () => sync(view, S, meta, savedAt),
}
