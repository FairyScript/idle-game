/**
 * 模拟内核（纯逻辑，不依赖 DOM，可直接被 bun test 覆盖）。
 *
 * 每个 tick 的流程：
 *   1. 结算催化剂计时
 *   2. 推进天象
 *   3. 计算元素地脉产出（正弦波动 × 天象 × 催化剂 × 废渣惩罚）
 *   4. 把所有运行中的槽位 + 当前研究整理成"作业(job)"
 *   5. 按物质做供水式配平：每种物质的总需求不能超过"库存/dt + 流入"
 *      —— 多个作业争抢同一物质时按比例同时降速，而不是先到先得
 *   6. 应用收支、结算溢出（溢出→废渣）、统计净流量
 *   7. 推进研究、检查伟业
 */
import {
  CATALYST_MAP,
  ELEMENT_IDS,
  MILESTONES,
  OMENS,
  OMEN_MAP,
  PS_ID,
  RECIPE_MAP,
  START_ELEMENTS,
  START_RECIPES,
  SUBSTANCES,
  SUB_MAP,
  TECH_MAP,
  TECHS,
  META_MAP,
} from "./content"
import { ZERO_EFFECTS } from "./types"
import type {
  Effects,
  GameState,
  MetaState,
  RecipeId,
  Slot,
  SubId,
  Substance,
  Tech,
  TechId,
} from "./types"

export const BASE_SLOTS = 3
export const SAVE_VERSION = 1
/** 轮回所需的本局贤者之石 */
export const REBIRTH_REQUIREMENT = 40
/** 离线最多模拟 4 小时 */
export const OFFLINE_CAP_SECONDS = 4 * 3600

// ────────────────────────────────────────────────────────────────────────────
// 派生属性
// ────────────────────────────────────────────────────────────────────────────

export interface Derived {
  effects: Effects
  capMul: number
  speedMul: number
  priceMul: number
  researchMul: number
  supplyMul: number
  steady: number
  slagMul: number
  slotCount: number
  slagPenalty: number
  techCount: number
  /** 已"见过"的物质（由初始配方 + 已解锁配方推导） */
  known: Record<SubId, boolean>
}

function applyEffect(target: Effects, src: Partial<Effects> | undefined, scale = 1) {
  if (!src) return
  for (const k of Object.keys(ZERO_EFFECTS) as (keyof Effects)[]) {
    const v = src[k]
    if (typeof v === "number") target[k] += v * scale
  }
}

export function derive(S: GameState, meta: MetaState): Derived {
  const effects: Effects = { ...ZERO_EFFECTS }
  for (const id of Object.keys(S.techs)) {
    if (S.techs[id]) applyEffect(effects, TECH_MAP[id]?.effects)
  }
  for (const id of Object.keys(meta.upgrades)) {
    const lv = meta.upgrades[id] ?? 0
    if (lv > 0) applyEffect(effects, META_MAP[id]?.effect, lv)
  }

  // 催化剂（临时，叠加在科技/元升级之上）。
  // 注意：元素专属的供给加成不在这里累加，而是由 supplyMulOf() 按元素读取。
  for (const id of Object.keys(S.buffTimes)) {
    if ((S.buffTimes[id] ?? 0) > 0) applyEffect(effects, CATALYST_MAP[id]?.effects)
  }

  const seals = meta.seals ?? 0
  const steady = Math.max(0.12, 1 - effects.steady)
  const slagMul = Math.min(1, Math.max(0.1, 1 - effects.slag))
  const slagPenalty = Math.max(
    0.3,
    1 / (1 + (Math.min(S.stock.slag ?? 0, 900) * slagMul) / 400),
  )

  const known: Record<SubId, boolean> = {}
  for (const id of START_ELEMENTS) known[id] = true
  for (const id of Object.keys(S.recipes)) {
    if (!S.recipes[id]) continue
    const r = RECIPE_MAP[id]
    if (!r) continue
    for (const s of Object.keys(r.inputs)) known[s] = true
    for (const s of Object.keys(r.outputs)) known[s] = true
    for (const s of Object.keys(r.byproducts ?? {})) known[s] = true
  }
  for (const s of SUBSTANCES) if ((S.stock[s.id] ?? 0) > 0.01) known[s.id] = true

  return {
    effects,
    capMul: 1 + effects.cap,
    speedMul: 1 + effects.speed + seals * 0.04,
    priceMul: 1 + effects.price,
    researchMul: 1 + effects.research,
    supplyMul: 1 + effects.supply,
    steady,
    slagMul,
    slotCount: BASE_SLOTS + effects.slots,
    slagPenalty,
    techCount: Object.keys(S.techs).filter((k) => S.techs[k]).length,
    known,
  }
}

export function capOf(sub: Substance, D: Derived): number {
  if (sub.kind === "meta") return 0
  if (sub.kind === "waste") return sub.cap
  return Math.max(1, sub.cap * D.capMul)
}

/** 元素在某时刻的供给乘数（正弦波动 + 天象 + 催化剂） */
export function supplyMulOf(S: GameState, D: Derived, id: SubId): number {
  const sub = SUB_MAP[id]
  if (!sub?.supply) return 0
  const period = sub.period ?? 120
  const phase = sub.phase ?? 0
  const wave = 1 + 0.55 * D.steady * Math.sin((S.world / period) * Math.PI * 2 + phase)
  let add = 0
  if (S.omens.current) add += OMEN_MAP[S.omens.current.id]?.supply?.[id] ?? 0
  for (const bid of Object.keys(S.buffTimes)) {
    if ((S.buffTimes[bid] ?? 0) <= 0) continue
    add += CATALYST_MAP[bid]?.supply?.[id] ?? 0
  }
  return Math.min(5, Math.max(0.12, wave + add))
}

/** 商品在某时刻的需求乘数（正弦波动 + 天象） */
export function demandMulOf(S: GameState, D: Derived, id: SubId): number {
  const sub = SUB_MAP[id]
  if (!sub?.period) return 1
  const wave = 1 + 0.6 * D.steady * Math.sin((S.world / sub.period) * Math.PI * 2 + (sub.phase ?? 0))
  let add = 0
  if (S.omens.current) add += OMEN_MAP[S.omens.current.id]?.demand?.[id] ?? 0
  return Math.min(3.4, Math.max(0.18, wave + add))
}

export function sellPrice(S: GameState, meta: MetaState, id: SubId): number {
  const sub = SUB_MAP[id]
  if (!sub?.price) return 0
  const D = derive(S, meta)
  return sub.price * demandMulOf(S, D, id) * D.priceMul
}

export function buyUnitCost(S: GameState, meta: MetaState, id: SubId): number {
  const sub = SUB_MAP[id]
  if (!sub?.buyPrice) return 0
  const D = derive(S, meta)
  const m = supplyMulOf(S, D, id)
  return sub.buyPrice / Math.max(0.35, m)
}

// ────────────────────────────────────────────────────────────────────────────
// 初始化
// ────────────────────────────────────────────────────────────────────────────

export function createMeta(): MetaState {
  return {
    ps: 0,
    upgrades: {},
    seals: 0,
    rebirths: 0,
    totalPsEarned: 0,
    bestRunPs: 0,
    runs: 0,
  }
}

export function createRun(meta: MetaState, startWorld = 0): GameState {
  const stock: Record<SubId, number> = {}
  const produced: Record<SubId, number> = {}
  const net: Record<SubId, number> = {}
  const supply: Record<SubId, number> = {}
  const supplyMul: Record<SubId, number> = {}
  const demandMul: Record<SubId, number> = {}
  const buyCost: Record<SubId, number> = {}
  const leyLv: Record<SubId, number> = {}
  for (const s of SUBSTANCES) {
    stock[s.id] = 0
    produced[s.id] = 0
    net[s.id] = 0
    supply[s.id] = 0
    supplyMul[s.id] = 1
    demandMul[s.id] = 1
    buyCost[s.id] = 0
    if (s.kind === "element") leyLv[s.id] = 0
  }
  for (const e of START_ELEMENTS) stock[e] = 25

  const slotCount = BASE_SLOTS + (meta.upgrades.m_slots ?? 0)
  const slots: Slot[] = Array.from({ length: slotCount }, (_, i) => ({
    recipe: i === 0 ? "calcine" : i === 1 ? "dissolve" : i === 2 ? "sublime" : null,
    paused: false,
    phase: 0,
    status: i < 3 ? "running" : "empty",
    ratio: 1,
    ratioShown: 1,
    bottleneck: null,
    clog: null,
  }))

  const S: GameState = {
    t: 0,
    world: startWorld,
    stock,
    produced,
    net,
    supply,
    supplyMul,
    demandMul,
    buyCost,
    slots,
    recipes: Object.fromEntries(START_RECIPES.map((r) => [r, true])) as Record<RecipeId, true>,
    techs: {},
    research: { active: null, progress: {} },
    gold: 0,
    goldEarned: 0,
    runPs: 0,
    leyLv,
    buffTimes: {},
    omens: { current: null, next: null },
    rngState: 0x9e3779b9 ^ (meta.runs * 2654435761),
    milestones: {},
    log: [],
    logSeq: 1,
    autoResearch: false,
    autoSell: true,
    lastTick: Date.now(),
  }
  pushLog(S, "熔炉点燃。从煅烧硫磺开始，配平你的第一炉。", "good")
  return S
}

export function pushLog(S: GameState, text: string, tone: "info" | "good" | "bad" = "info") {
  S.log.unshift({ id: S.logSeq++, t: S.t, text, tone })
  if (S.log.length > 70) S.log.length = 70
}

// ────────────────────────────────────────────────────────────────────────────
// 随机数（确定性，可序列化）
// ────────────────────────────────────────────────────────────────────────────

function rand(S: GameState): number {
  let t = (S.rngState += 0x6d2b79f5)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// ────────────────────────────────────────────────────────────────────────────
// 天象调度
// ────────────────────────────────────────────────────────────────────────────

function pickOmen(S: GameState, D: Derived): string {
  const avoid = S.omens.current?.id ?? null
  const pool = OMENS.filter((o) => o.minTechs <= D.techCount && o.id !== avoid)
  const usable = pool.length > 0 ? pool : OMENS.filter((o) => o.minTechs <= D.techCount)
  const total = usable.reduce((a, o) => a + o.weight, 0)
  let roll = rand(S) * total
  for (const o of usable) {
    roll -= o.weight
    if (roll <= 0) return o.id
  }
  return usable[usable.length - 1].id
}

function scheduleNextOmen(S: GameState, D: Derived, from: number) {
  const gap = 16 + rand(S) * 34
  S.omens.next = { id: pickOmen(S, D), at: from + gap }
}

function advanceOmens(S: GameState, D: Derived) {
  if (S.omens.current && S.world >= S.omens.current.endAt) {
    const finished = OMEN_MAP[S.omens.current.id]
    S.omens.current = null
    if (finished) pushLog(S, `天象「${finished.name}」消退。`, "info")
  }
  if (!S.omens.next) scheduleNextOmen(S, D, S.world)
  if (S.omens.next && S.world >= S.omens.next.at) {
    const omen = OMEN_MAP[S.omens.next.id]
    if (omen) {
      S.omens.current = { id: omen.id, startAt: S.world, endAt: S.world + omen.dur }
      pushLog(S, `天象「${omen.name}」降临：${omen.desc}。`, omen.tone === "bad" ? "bad" : "good")
    }
    scheduleNextOmen(S, D, S.world + (omen?.dur ?? 40))
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 核心 tick
// ────────────────────────────────────────────────────────────────────────────

interface Job {
  kind: "slot" | "research"
  slotIndex: number
  techId: TechId | null
  /** 满速时每秒消耗 */
  needs: Map<SubId, number>
  /** 满速时每秒产出 */
  outputs: Map<SubId, number>
  /** 每周期秒数 */
  cycle: number
  scale: number
}

export function step(S: GameState, meta: MetaState, dt: number, offline = false) {
  if (dt <= 0) return
  S.t += dt
  S.world += dt

  // 1) 催化剂计时
  for (const id of Object.keys(S.buffTimes)) {
    S.buffTimes[id] -= dt
    if (S.buffTimes[id] <= 0) delete S.buffTimes[id]
  }
  const D = derive(S, meta)

  // 2) 天象
  advanceOmens(S, D)

  // 3) 元素地脉产出
  const inflow: Record<SubId, number> = {}
  for (const s of SUBSTANCES) inflow[s.id] = 0
  for (const id of ELEMENT_IDS) {
    const sub = SUB_MAP[id]
    if (!sub.supply) continue
    if (!D.known[id]) continue
    const m = supplyMulOf(S, D, id)
    const leyBonus = 1 + 0.15 * (S.leyLv[id] ?? 0)
    const rate = sub.supply * D.supplyMul * leyBonus * m * D.slagPenalty
    S.supply[id] = rate
    S.supplyMul[id] = m
    inflow[id] = rate
  }
  for (const s of SUBSTANCES) {
    if (s.kind !== "element") {
      S.supply[s.id] = 0
      S.supplyMul[s.id] = 1
    }
    S.demandMul[s.id] = demandMulOf(S, D, s.id)
    S.buyCost[s.id] = s.buyPrice ? buyUnitCostInternal(S, D, s.id) : 0
  }

  // 4) 组合作业
  const jobs: Job[] = []
  const D2 = D
  for (let i = 0; i < S.slots.length; i++) {
    const slot = S.slots[i]!
    slot.clog = null
    if (!slot.recipe || slot.paused) {
      slot.status = slot.recipe ? "paused" : "empty"
      slot.ratio = 0
      slot.ratioShown += (0 - slot.ratioShown) * Math.min(1, dt / 1.5)
      slot.bottleneck = null
      continue
    }
    const recipe = RECIPE_MAP[slot.recipe]
    if (!recipe) {
      slot.status = "empty"
      continue
    }
    const rate = D2.speedMul / recipe.time
    const needs = new Map<SubId, number>()
    const outputs = new Map<SubId, number>()
    for (const [k, v] of Object.entries(recipe.inputs)) needs.set(k, v * rate)
    for (const [k, v] of Object.entries(recipe.outputs)) {
      if (k === PS_ID) outputs.set(k, v * rate)
      else outputs.set(k, v * rate)
    }
    for (const [k, v] of Object.entries(recipe.byproducts ?? {})) {
      outputs.set(k, (outputs.get(k) ?? 0) + v * rate)
    }
    jobs.push({ kind: "slot", slotIndex: i, techId: null, needs, outputs, cycle: recipe.time, scale: 1 })
  }

  if (S.research.active && TECH_MAP[S.research.active]) {
    const tech = TECH_MAP[S.research.active]!
    const dur = tech.time / D2.researchMul
    const needs = new Map<SubId, number>()
    for (const [k, v] of Object.entries(tech.cost)) needs.set(k, v / dur)
    jobs.push({ kind: "research", slotIndex: -1, techId: tech.id, needs, outputs: new Map(), cycle: dur, scale: 1 })
  }

  // 5) 供水式配平：反复削减争抢同一物质的作业
  const subs = SUBSTANCES.map((s) => s.id)
  for (let iter = 0; iter < 3; iter++) {
    let changed = false
    for (const sid of subs) {
      let demand = 0
      for (const j of jobs) {
        const n = j.needs.get(sid)
        if (n) demand += n * j.scale
      }
      if (demand <= 0) continue
      const avail = (S.stock[sid] ?? 0) / dt + (inflow[sid] ?? 0)
      if (demand > avail) {
        const k = avail / demand
        for (const j of jobs) {
          if (j.needs.has(sid)) j.scale *= k
        }
        changed = true
      }
    }
    if (!changed) break
  }

  // 6) 应用收支
  const delta: Record<SubId, number> = {}
  const gross: Record<SubId, number> = {}
  for (const sid of subs) delta[sid] = 0
  for (const sid of ELEMENT_IDS) delta[sid] = (inflow[sid] ?? 0) * dt

  const needRate: Record<SubId, number> = {}
  for (const sid of subs) needRate[sid] = 0

  for (const j of jobs) {
    const f = j.scale * dt
    for (const [sid, rate] of j.needs) {
      delta[sid] -= rate * f
      needRate[sid] += rate * j.scale
    }
    for (const [sid, rate] of j.outputs) {
      const amount = rate * f
      if (sid === PS_ID) {
        S.runPs += amount
        meta.ps += amount
        continue
      }
      delta[sid] += amount
      gross[sid] = (gross[sid] ?? 0) + amount
    }
  }

  // 结算库存与溢出
  let slagGain = 0
  for (const sub of SUBSTANCES) {
    const sid = sub.id
    if (sub.kind === "meta") continue
    let v = (S.stock[sid] ?? 0) + delta[sid]
    if (v < 0) v = 0
    const cap = capOf(sub, D)
    if (v > cap) {
      const over = v - cap
      if (!offline && sub.kind !== "element" && sub.kind !== "waste") slagGain += over * 0.5
      v = cap
      if (over > 1e-9) {
        for (const j of jobs) {
          if (j.kind !== "slot") continue
          const rec = S.slots[j.slotIndex]?.recipe
          if (!rec) continue
          const r = RECIPE_MAP[rec]
          if (!r) continue
          if (r.outputs[sid] !== undefined || r.byproducts?.[sid] !== undefined) {
            S.slots[j.slotIndex]!.clog = sid
          }
        }
      }
    }
    S.stock[sid] = v
    if (gross[sid]) S.produced[sid] = (S.produced[sid] ?? 0) + gross[sid]
    S.net[sid] = (inflow[sid] ?? 0) + (gross[sid] ?? 0) / dt - needRate[sid]
  }

  // 废渣：本 tick 新凝结的先进账，再自然挥发（避免离线期间无限堆积）
  if (slagGain > 0) S.stock.slag = Math.min(SUB_MAP.slag.cap, (S.stock.slag ?? 0) + slagGain)
  if ((S.stock.slag ?? 0) > 0) {
    S.stock.slag = Math.max(0, S.stock.slag - S.stock.slag * 0.0012 * dt - 0.01 * dt)
  }

  // 7) 槽位状态与研究进度
  for (const j of jobs) {
    if (j.kind === "slot") {
      const slot = S.slots[j.slotIndex]!
      slot.ratio = j.scale
      // 显示用平滑：真实的逐 tick 效率会随库存微幅抖动，直接显示会让人以为在闪
      slot.ratioShown += (j.scale - slot.ratioShown) * Math.min(1, dt / 1.5)
      // 迟滞：已经在满速的槽位允许 1.5% 的回落而不切换状态，
      // 否则效率刚好卡在阈值上时状态与配色会每 tick 抖动（视觉上就是闪烁）。
      const wasFull = slot.status === "running" || slot.status === "clogged"
      if (j.scale > (wasFull ? 0.985 : 0.999)) slot.status = slot.clog ? "clogged" : "running"
      else {
        // 找出限制效率的输入
        let worst: SubId | null = null
        let worstRatio = Infinity
        for (const [sid, rate] of j.needs) {
          const have = S.stock[sid] ?? 0
          const need = rate * dt
          const r = need > 0 ? have / need : 1
          if (r < worstRatio) {
            worstRatio = r
            worst = sid
          }
        }
        slot.bottleneck = worst
        slot.status = j.scale <= 0.001 ? "starved" : "throttled"
      }
      if (slot.status === "running" || slot.status === "throttled" || slot.status === "clogged") {
        slot.phase = (slot.phase + (D2.speedMul / j.cycle) * dt * j.scale) % 1
      }
    } else if (j.techId) {
      const cur = S.research.progress[j.techId] ?? 0
      const next = cur + (dt * j.scale) / j.cycle
      if (next >= 1) {
        S.research.progress[j.techId] = 1
        completeTech(S, meta, j.techId)
      } else {
        S.research.progress[j.techId] = next
      }
    }
  }

  // 8) 自动出售：把快满仓的商品换成金币（这是"产出必须有去处"的自动化版本）
  if (S.autoSell && S.techs.trade_auto) autoSell(S, meta, D)

  // 9) 伟业
  checkMilestones(S, meta)

  // 10) 自动研究
  if (S.autoResearch && !S.research.active) {
    const next = availableTechs(S).sort((a, b) => a.time - b.time)[0]
    if (next) startResearch(S, meta, next.id)
  }
}

/** 内部：单独求某元素的购入单价，避免在 tick 中反复 derive */
function buyUnitCostInternal(S: GameState, D: Derived, id: SubId): number {
  const sub = SUB_MAP[id]
  if (!sub?.buyPrice) return 0
  return sub.buyPrice / Math.max(0.35, supplyMulOf(S, D, id))
}

/** 自动出售：只处理"快溢出"的商品，且在需求不低于基准价时出手 */
function autoSell(S: GameState, meta: MetaState, D: Derived) {
  for (const sub of SUBSTANCES) {
    if (!sub.price || sub.kind === "waste" || sub.kind === "meta") continue
    const cap = capOf(sub, D)
    const stock = S.stock[sub.id] ?? 0
    if (stock <= cap * 0.85) continue
    const demand = S.demandMul[sub.id] ?? 1
    if (demand < 1) continue
    const qty = stock - cap * 0.6
    if (qty <= 0) continue
    const gold = sub.price * demand * D.priceMul * qty
    S.stock[sub.id] = stock - qty
    S.gold += gold
    S.goldEarned += gold
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 研究
// ────────────────────────────────────────────────────────────────────────────

export function availableTechs(S: GameState): Tech[] {
  return TECHS.filter((t) => {
    if (S.techs[t.id]) return false
    if (t.requires) for (const r of t.requires) if (!S.techs[r]) return false
    return true
  })
}

export function startResearch(S: GameState, meta: MetaState, id: TechId): boolean {
  if (S.techs[id]) return false
  const tech = TECH_MAP[id]
  if (!tech) return false
  if (tech.requires) for (const r of tech.requires) if (!S.techs[r]) return false
  if (S.research.active === id) return true
  S.research.active = id
  pushLog(S, `开始研究「${tech.name}」。研究将持续消耗底物，注意别断供。`, "info")
  return true
}

export function stopResearch(S: GameState) {
  S.research.active = null
}

function completeTech(S: GameState, meta: MetaState, id: TechId) {
  const tech = TECH_MAP[id]
  if (!tech || S.techs[id]) return
  S.techs[id] = true
  S.research.active = null
  for (const r of tech.unlockRecipes ?? []) {
    S.recipes[r] = true
    const rec = RECIPE_MAP[r]
    if (rec) pushLog(S, `解锁配方「${rec.name}」。`, "good")
  }
  pushLog(S, `研究完成：「${tech.name}」。${tech.desc}`, "good")
  syncSlots(S, meta)
}

/** 让槽位数量与派生属性一致（购买元升级 / 解锁科技后调用） */
export function syncSlots(S: GameState, meta: MetaState) {
  const want = derive(S, meta).slotCount
  while (S.slots.length < want) {
    S.slots.push({
      recipe: null,
      paused: false,
      phase: 0,
      status: "empty",
      ratio: 1,
      ratioShown: 1,
      bottleneck: null,
      clog: null,
    })
  }
  while (S.slots.length > want) S.slots.pop()
}

// ────────────────────────────────────────────────────────────────────────────
// 伟业
// ────────────────────────────────────────────────────────────────────────────

function milestoneBonus(meta: MetaState): number {
  return 1 + 0.35 * (meta.upgrades.m_work ?? 0)
}

function checkMilestones(S: GameState, meta: MetaState) {
  for (const m of MILESTONES) {
    if (S.milestones[m.id]) continue
    let ok = false
    if (m.produced) ok = (S.produced[m.produced.sub] ?? 0) >= m.produced.amount
    else if (m.techs !== undefined) ok = Object.keys(S.techs).length >= m.techs
    else if (m.goldEarned !== undefined) ok = S.goldEarned >= m.goldEarned
    else if (m.psEarned !== undefined) ok = S.runPs >= m.psEarned
    if (!ok) continue
    S.milestones[m.id] = true
    const gain = m.ps * milestoneBonus(meta)
    S.runPs += gain
    meta.ps += gain
    pushLog(S, `伟业达成「${m.name}」：+${gain.toFixed(1)} 贤者之石。`, "good")
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 玩家操作
// ────────────────────────────────────────────────────────────────────────────

export function setSlotRecipe(S: GameState, index: number, recipeId: RecipeId | null) {
  const slot = S.slots[index]
  if (!slot) return
  if (recipeId && !S.recipes[recipeId]) return
  slot.recipe = recipeId
  slot.phase = 0
  slot.paused = false
  slot.status = recipeId ? "running" : "empty"
}

export function toggleSlotPause(S: GameState, index: number) {
  const slot = S.slots[index]
  if (!slot || !slot.recipe) return
  slot.paused = !slot.paused
  slot.status = slot.paused ? "paused" : "running"
}

/** 清空槽位 */
export function clearSlot(S: GameState, index: number) {
  setSlotRecipe(S, index, null)
}

export function sellSubstance(
  S: GameState,
  meta: MetaState,
  id: SubId,
  amount: number,
): number {
  const have = S.stock[id] ?? 0
  const qty = Math.max(0, Math.min(amount, have))
  if (qty <= 0) return 0
  const price = sellPrice(S, meta, id)
  const gold = price * qty
  S.stock[id] = have - qty
  S.gold += gold
  S.goldEarned += gold
  return gold
}

export function buyElement(S: GameState, meta: MetaState, id: SubId, amount: number): boolean {
  const sub = SUB_MAP[id]
  if (!sub?.buyPrice) return false
  const D = derive(S, meta)
  if (!D.known[id]) return false
  const cap = capOf(sub, D)
  const room = cap - (S.stock[id] ?? 0)
  if (room <= 0) return false
  const unit = buyUnitCost(S, meta, id)
  const affordable = unit > 0 ? Math.floor(S.gold / unit) : 0
  const qty = Math.min(amount, room, affordable)
  if (qty < 1) return false
  const cost = unit * qty
  S.gold -= cost
  S.stock[id] = (S.stock[id] ?? 0) + qty
  return true
}

export function leyUpgradeCost(S: GameState, id: SubId): number {
  const lv = S.leyLv[id] ?? 0
  return Math.round(35 * Math.pow(1.75, lv))
}

export function upgradeLey(S: GameState, meta: MetaState, id: SubId): boolean {
  const lv = S.leyLv[id] ?? 0
  if (lv >= 14) return false
  const cost = leyUpgradeCost(S, id)
  if (S.gold < cost) return false
  S.gold -= cost
  S.leyLv[id] = lv + 1
  pushLog(S, `${SUB_MAP[id].name}地脉强化至 Lv.${lv + 1}（+15% 产出）。`, "good")
  return true
}

export function applyCatalyst(S: GameState, meta: MetaState, id: string): boolean {
  const cat = CATALYST_MAP[id]
  if (!cat) return false
  const D = derive(S, meta)
  if (cat.minTechs > D.techCount) return false
  if (S.gold < cat.cost) return false
  S.gold -= cat.cost
  if (cat.purge) {
    S.stock.slag = Math.max(0, (S.stock.slag ?? 0) - cat.purge)
    pushLog(S, `施放「${cat.name}」：清除 ${cat.purge} 点废渣。`, "good")
    return true
  }
  if (cat.supply || cat.effects) {
    S.buffTimes[id] = Math.max(S.buffTimes[id] ?? 0, cat.dur)
    pushLog(S, `施放「${cat.name}」：${cat.desc}。`, "good")
    return true
  }
  return false
}

export function canBuyMeta(meta: MetaState, id: string): boolean {
  const up = META_MAP[id]
  if (!up) return false
  return (meta.upgrades[id] ?? 0) < up.max
}

export function metaCost(meta: MetaState, id: string): number {
  const up = META_MAP[id]
  if (!up) return 0
  const lv = meta.upgrades[id] ?? 0
  return Math.round(up.baseCost * Math.pow(up.growth, lv))
}

export function buyMeta(S: GameState, meta: MetaState, id: string): boolean {
  const up = META_MAP[id]
  if (!up) return false
  const lv = meta.upgrades[id] ?? 0
  if (lv >= up.max) return false
  const cost = metaCost(meta, id)
  if (meta.ps < cost) return false
  meta.ps -= cost
  meta.upgrades[id] = lv + 1
  if (up.effect.slots) syncSlots(S, meta)
  pushLog(S, `永恒炼金术「${up.name}」提升至 Lv.${lv + 1}。`, "good")
  return true
}

export function rebirthSeals(runPs: number): number {
  if (runPs < REBIRTH_REQUIREMENT) return 0
  return Math.floor(Math.pow(runPs / 15, 0.65))
}

export function canRebirth(S: GameState): boolean {
  return S.runPs >= REBIRTH_REQUIREMENT
}

/** 轮回：结算贤者之印，开新的一局。返回获得印记数。 */
export function rebirth(S: GameState, meta: MetaState): number {
  const seals = rebirthSeals(S.runPs)
  meta.totalPsEarned += S.runPs
  meta.bestRunPs = Math.max(meta.bestRunPs, S.runPs)
  meta.seals += seals
  meta.rebirths += 1
  meta.runs += 1
  const fresh = createRun(meta, S.world)
  // 保留设置
  fresh.autoResearch = S.autoResearch
  Object.assign(S, fresh)
  pushLog(S, `伟大工作圆满。获得 ${seals} 枚贤者之印（全局速度 +${(seals * 4).toFixed(0)}%）。`, "good")
  return seals
}

/** 硬重置：清空一切（含元升级） */
export function hardReset(S: GameState, meta: MetaState) {
  const freshMeta = createMeta()
  Object.assign(meta, freshMeta)
  const fresh = createRun(meta, S.world)
  Object.assign(S, fresh)
}

// ────────────────────────────────────────────────────────────────────────────
// UI 用的市场快照（一次 derive，避免每个物质都重算）
// ────────────────────────────────────────────────────────────────────────────

export interface MarketRow {
  id: SubId
  /** 当前售价（0 = 不可出售） */
  price: number
  /** 当前购入单价（0 = 不可购买） */
  buyCost: number
  /** 需求乘数 */
  demand: number
  /** 能否买入 */
  buyable: boolean
}

export function marketSnapshot(S: GameState, meta: MetaState): Record<SubId, MarketRow> {
  const D = derive(S, meta)
  const out: Record<SubId, MarketRow> = {}
  for (const sub of SUBSTANCES) {
    const demand = S.demandMul[sub.id] || demandMulOf(S, D, sub.id)
    out[sub.id] = {
      id: sub.id,
      price: sub.price ? sub.price * demand * D.priceMul : 0,
      buyCost: sub.buyPrice ? sub.buyPrice / Math.max(0.35, supplyMulOf(S, D, sub.id)) : 0,
      demand,
      buyable: !!sub.buyPrice && !!D.known[sub.id],
    }
  }
  return out
}

/** 全局加成快照，用于顶栏展示 */
export function bonusSnapshot(S: GameState, meta: MetaState) {
  const D = derive(S, meta)
  return {
    speed: D.speedMul,
    supply: D.supplyMul,
    cap: D.capMul,
    price: D.priceMul,
    research: D.researchMul,
    steady: D.steady,
    slag: D.slagMul,
    slagPenalty: D.slagPenalty,
    slots: D.slotCount,
    techCount: D.techCount,
  }
}
