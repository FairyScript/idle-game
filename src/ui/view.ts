/**
 * 视图信号层：模拟内核是普通可变对象（跑得快、好测试），
 * UI 只读这里的信号。每次 tick 调一次 sync()，把内核状态推入信号；
 * Signal.State 在值不变时不会通知，所以没变化的节点不会被碰。
 *
 * 所有列表都是"静态结构 + 动态信号"：DOM 只建一次，
 * 之后只有数字/文字节点更新，这对细粒度响应式的 kiko 是最省的做法。
 */
import { createSignal } from "@kikojs/signal"
import type { Signal } from "signal-polyfill"
import {
  CATALYSTS,
  META_UPGRADES,
  MILESTONES,
  RECIPES,
  SUBSTANCES,
  TECHS,
} from "../sim/content"
import {
  capOf,
  buyUnitCost,
  derive,
  leyUpgradeCost,
  metaCost,
  rebirthSeals,
  REBIRTH_REQUIREMENT,
  supplyMulOf,
} from "../sim/engine"
import type { GameState, MetaState, RecipeId, SlotStatus, SubId, TechId } from "../sim/types"

export type State<T> = Signal.State<T>

export const MAX_SLOTS = 12

export interface SubView {
  id: SubId
  stock: State<number>
  cap: State<number>
  net: State<number>
  price: State<number>
  buyCost: State<number>
  demand: State<number>
  supply: State<number>
  supplyMul: State<number>
  known: State<boolean>
  fill: State<number>
  leyLv: State<number>
  /** 供给/需求的分档（"" | "good" | "bad"）—— 离散量，避免每 tick 重写 class */
  tone: State<string>
  /** 是否接近仓储上限（用于 .over / 警告配色） */
  over: State<boolean>
  /** 净流量是否为负 */
  netNeg: State<boolean>
  /** 供给处于涨潮段（离散，避免文案每 tick 重建） */
  rising: State<boolean>
  /** 下一级地脉强化的金币价格 */
  leyCost: State<number>
  /** 该物质在自身波动周期中的位置 0..1（用于行情/地脉时钟） */
  cycle: State<number>
}

export interface SlotView {
  index: number
  visible: State<boolean>
  recipe: State<RecipeId | null>
  status: State<SlotStatus>
  ratio: State<number>
  ratioShown: State<number>
  phase: State<number>
  bottleneck: State<SubId | null>
  clog: State<SubId | null>
  /** 是否被限速（离散量，避免进度条配色每 tick 抖动） */
  throttled: State<boolean>
}

export interface RecipeView {
  id: RecipeId
  unlocked: State<boolean>
}

export interface TechView {
  id: TechId
  done: State<boolean>
  progress: State<number>
  available: State<boolean>
  active: State<boolean>
  /** 有部分进度但尚未完成（离散量，用来决定要不要渲染进度条） */
  hasProgress: State<boolean>
}

export interface MetaView {
  id: string
  lv: State<number>
  cost: State<number>
  affordable: State<boolean>
  maxed: State<boolean>
}

export interface MilestoneView {
  id: string
  done: State<boolean>
}

export interface CatalystView {
  id: string
  affordable: State<boolean>
  active: State<number>
  locked: State<boolean>
}

const sig = <T,>(v: T): State<T> => createSignal(v)

/**
 * 带迟滞的布尔派生：数值恰好卡在阈值上时，布尔值会每 tick 翻转，
 * 而每翻转一次就会重写一次 class 属性（样式失效 + 可能的视觉抖动）。
 * 用"开阈值 / 关阈值"分开来彻底消除这种边界抖动。
 */
function hyst(prev: boolean, value: number, on: (v: number) => boolean, off: (v: number) => boolean): boolean {
  return prev ? !off(value) : on(value)
}

export function createView() {
  const v = {
    // ── 顶栏 ──
    ps: sig(0),
    gold: sig(0),
    runPs: sig(0),
    goldEarned: sig(0),
    speed: sig(1),
    supplyBonus: sig(1),
    capBonus: sig(1),
    priceBonus: sig(1),
    researchBonus: sig(1),
    steady: sig(1),
    slag: sig(0),
    slagPenalty: sig(1),
    techCount: sig(0),
    slotCount: sig(3),
    seals: sig(0),
    rebirths: sig(0),
    canRebirth: sig(false),
    sealsGain: sig(0),
    savedAt: sig(0),
    runTime: sig(0),
    bestRunPs: sig(0),
    totalPsEarned: sig(0),

    // ── 天象 ──
    omenId: sig<string | null>(null),
    omenLeft: sig(0),
    omenTotal: sig(1),
    nextOmenId: sig<string | null>(null),
    nextIn: sig(0),
    forecastVisible: sig(false),
    forecastLead: sig(26),
    forecastOpen: sig(false),

    // ── 操作提示 ──
    toast: sig<string>(""),
    toastTone: sig<"info" | "good" | "bad">("info"),
    offlineReport: sig<null | {
      seconds: number
      capped: boolean
      gold: number
      ps: number
      techs: number
      milestones: string[]
    }>(null),
    showOffline: sig(false),
    confirmHardReset: sig(false),
    tab: sig("workshop"),
    picker: sig<number | null>(null),

    // ── 列表 ──
    subs: {} as Record<SubId, SubView>,
    slots: [] as SlotView[],
    recipes: {} as Record<RecipeId, RecipeView>,
    techs: {} as Record<TechId, TechView>,
    meta: {} as Record<string, MetaView>,
    milestones: {} as Record<string, MilestoneView>,
    catalysts: {} as Record<string, CatalystView>,
    log: sig<GameState["log"]>([]),
    logHead: sig(-1),
    /**
     * 工坊右侧"可研究"列表的科技 id。只在集合真的变化时推新数组，
     * 面板用 `<For getKey>` 增量增删行 —— 存活的行复用节点，不会整块重建。
     */
    researchSuggest: sig<TechId[]>([]),
    autoResearch: sig(false),
    autoSell: sig(true),
    hasAutoSell: sig(false),
    activeTech: sig<TechId | null>(null),
    world: sig(0),
    forecastLv: sig(0),
  }

  for (const s of SUBSTANCES) {
    v.subs[s.id] = {
      id: s.id,
      stock: sig(0),
      cap: sig(s.cap),
      net: sig(0),
      price: sig(0),
      buyCost: sig(0),
      demand: sig(1),
      supply: sig(0),
      supplyMul: sig(1),
      known: sig(false),
      fill: sig(0),
      leyLv: sig(0),
      tone: sig(""),
      over: sig(false),
      netNeg: sig(false),
      rising: sig(true),
      leyCost: sig(0),
      cycle: sig(0),
    }
  }
  for (let i = 0; i < MAX_SLOTS; i++) {
    v.slots.push({
      index: i,
      visible: sig(false),
      recipe: sig<RecipeId | null>(null),
      status: sig<SlotStatus>("empty"),
      ratio: sig(0),
      ratioShown: sig(1),
      phase: sig(0),
      bottleneck: sig<SubId | null>(null),
      clog: sig<SubId | null>(null),
      throttled: sig(false),
    })
  }
  for (const r of RECIPES) v.recipes[r.id] = { id: r.id, unlocked: sig(false) }
  for (const t of TECHS) {
    v.techs[t.id] = {
      id: t.id,
      done: sig(false),
      progress: sig(0),
      available: sig(false),
      active: sig(false),
      hasProgress: sig(false),
    }
  }
  for (const m of META_UPGRADES) {
    v.meta[m.id] = { id: m.id, lv: sig(0), cost: sig(0), affordable: sig(false), maxed: sig(false) }
  }
  for (const m of MILESTONES) v.milestones[m.id] = { id: m.id, done: sig(false) }
  for (const c of CATALYSTS) {
    v.catalysts[c.id] = { id: c.id, affordable: sig(false), active: sig(0), locked: sig(true) }
  }
  return v
}

export type View = ReturnType<typeof createView>

/** 把内核状态推进信号。每个 tick 调一次（10Hz）。 */
export function sync(v: View, S: GameState, meta: MetaState, savedAt = 0) {
  const D = derive(S, meta)

  v.ps.set(meta.ps)
  v.gold.set(S.gold)
  v.runPs.set(S.runPs)
  v.goldEarned.set(S.goldEarned)
  v.speed.set(D.speedMul)
  v.supplyBonus.set(D.supplyMul)
  v.capBonus.set(D.capMul)
  v.priceBonus.set(D.priceMul)
  v.researchBonus.set(D.researchMul)
  v.steady.set(D.steady)
  v.slag.set(S.stock.slag ?? 0)
  v.slagPenalty.set(D.slagPenalty)
  v.techCount.set(D.techCount)
  v.slotCount.set(D.slotCount)
  v.seals.set(meta.seals)
  v.rebirths.set(meta.rebirths)
  v.canRebirth.set(S.runPs >= REBIRTH_REQUIREMENT)
  v.sealsGain.set(rebirthSeals(S.runPs))
  v.runTime.set(S.t)
  v.bestRunPs.set(meta.bestRunPs)
  v.totalPsEarned.set(meta.totalPsEarned)
  if (savedAt) v.savedAt.set(savedAt)
  v.autoResearch.set(S.autoResearch)
  v.autoSell.set(S.autoSell)
  v.hasAutoSell.set(!!S.techs.trade_auto)
  v.activeTech.set(S.research.active)
  v.world.set(S.world)
  v.forecastLv.set(meta.upgrades.m_forecast ?? 0)

  // 天象
  const cur = S.omens.current
  v.omenId.set(cur?.id ?? null)
  v.omenLeft.set(cur ? Math.max(0, cur.endAt - S.world) : 0)
  v.omenTotal.set(cur ? cur.endAt - cur.startAt : 1)
  v.nextOmenId.set(S.omens.next?.id ?? null)
  v.nextIn.set(S.omens.next ? Math.max(0, S.omens.next.at - S.world) : 0)
  v.forecastLead.set(26 + 6 * (meta.upgrades.m_forecast ?? 0))

  // 物质
  for (const sub of SUBSTANCES) {
    const sv = v.subs[sub.id]
    const cap = capOf(sub, D)
    const stock = S.stock[sub.id] ?? 0
    sv.stock.set(stock)
    sv.cap.set(cap)
    sv.net.set(S.net[sub.id] ?? 0)
    sv.known.set(!!D.known[sub.id])
    sv.fill.set(cap > 0 && cap < 1e8 ? Math.min(1, stock / cap) : 0)
    sv.demand.set(S.demandMul[sub.id] ?? 1)
    sv.supplyMul.set(sub.kind === "element" ? supplyMulOf(S, D, sub.id) : 1)
    sv.supply.set(S.supply[sub.id] ?? 0)
    sv.price.set(sub.price ? sub.price * (S.demandMul[sub.id] ?? 1) * D.priceMul : 0)
    sv.buyCost.set(sub.buyPrice && D.known[sub.id] ? buyUnitCost(S, meta, sub.id) : 0)
    sv.leyLv.set(S.leyLv[sub.id] ?? 0)
    {
      const src = sub.kind === "element" ? S.supplyMul[sub.id] ?? 1 : S.demandMul[sub.id] ?? 1
      sv.tone.set(src >= 1.15 ? "good" : src <= 0.8 ? "bad" : "")
    }
    const fillRatio = cap > 0 && cap < 1e8 ? stock / cap : 0
    sv.over.set(hyst(sv.over.get(), fillRatio, (v) => v > 0.97, (v) => v < 0.93))
    const net = S.net[sub.id] ?? 0
    sv.netNeg.set(hyst(sv.netNeg.get(), net, (v) => v < -0.004, (v) => v > 0.004))
    sv.rising.set((S.supplyMul[sub.id] ?? 1) >= 1)
    sv.leyCost.set(sub.kind === "element" ? leyUpgradeCost(S, sub.id) : 0)
    sv.cycle.set(sub.period ? ((S.world / sub.period) % 1 + 1) % 1 : 0)
  }

  // 槽位
  for (let i = 0; i < MAX_SLOTS; i++) {
    const sv = v.slots[i]!
    const slot = S.slots[i]
    sv.visible.set(!!slot)
    if (!slot) continue
    sv.recipe.set(slot.recipe)
    sv.status.set(slot.status)
    sv.ratio.set(slot.ratio)
    sv.ratioShown.set(slot.ratioShown)
    sv.phase.set(slot.phase)
    sv.bottleneck.set(slot.bottleneck)
    sv.clog.set(slot.clog)
    sv.throttled.set(hyst(sv.throttled.get(), slot.ratio, (v) => v < 0.99, (v) => v > 0.997))
  }

  // 配方 / 科技
  for (const r of RECIPES) v.recipes[r.id]!.unlocked.set(!!S.recipes[r.id])
  for (const t of TECHS) {
    const tv = v.techs[t.id]!
    tv.done.set(!!S.techs[t.id])
    tv.progress.set(S.research.progress[t.id] ?? (S.techs[t.id] ? 1 : 0))
    tv.active.set(S.research.active === t.id)
    tv.hasProgress.set(!S.techs[t.id] && (S.research.progress[t.id] ?? 0) > 0.001)
    tv.available.set(
      !S.techs[t.id] && (!t.requires || t.requires.every((r) => !!S.techs[r])),
    )
  }

  // 可研究列表：只在集合变化时推新数组，让面板的 For 按 key 增量增删行。
  // 直接读内核（不读上面的信号），避免把面板刷新绑到每 tick 的进度更新上。
  const suggest = TECHS.filter(
    (t) => !S.techs[t.id] && (!t.requires || t.requires.every((r) => !!S.techs[r])),
  )
    .sort((x, y) => x.tier - y.tier || x.time - y.time)
    .slice(0, 8)
    .map((t) => t.id)
  const prevSuggest = v.researchSuggest.get()
  if (suggest.length !== prevSuggest.length || suggest.some((id, i) => id !== prevSuggest[i])) {
    v.researchSuggest.set(suggest)
  }

  // 元升级 / 伟业 / 催化剂
  for (const m of META_UPGRADES) {
    const mv = v.meta[m.id]!
    const lv = meta.upgrades[m.id] ?? 0
    const cost = metaCost(meta, m.id)
    mv.lv.set(lv)
    mv.cost.set(cost)
    mv.maxed.set(lv >= m.max)
    mv.affordable.set(lv < m.max && meta.ps >= cost)
  }
  for (const m of MILESTONES) v.milestones[m.id]!.done.set(!!S.milestones[m.id])
  for (const c of CATALYSTS) {
    const cv = v.catalysts[c.id]!
    cv.affordable.set(S.gold >= c.cost)
    cv.active.set(S.buffTimes[c.id] ?? 0)
    cv.locked.set(D.techCount < c.minTechs)
  }

  // S.log 是原地 unshift 的同一个数组，直接 set 同一个引用不会触发通知，
  // 所以用"头部事件 id"作为变化信号。
  const lead = S.omens.next ? Math.max(0, S.omens.next.at - S.world) : Infinity
  v.forecastVisible.set(!!S.omens.next && lead <= 26 + 6 * (meta.upgrades.m_forecast ?? 0))

  const head = S.log[0]?.id ?? 0
  if (head !== v.logHead.get()) {
    v.logHead.set(head)
    v.log.set(S.log.slice(0, 40))
  }
}
