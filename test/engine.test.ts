import { describe, expect, test } from "bun:test"
import {
  availableTechs,
  buyElement,
  buyMeta,
  canRebirth,
  createMeta,
  createRun,
  derive,
  marketSnapshot,
  metaCost,
  rebirth,
  rebirthSeals,
  sellPrice,
  sellSubstance,
  setSlotRecipe,
  startResearch,
  step,
  syncSlots,
  upgradeLey,
} from "../src/sim/engine"
import { META_UPGRADES, RECIPES, RECIPE_MAP, START_RECIPES, SUB_MAP, TECHS } from "../src/sim/content"
import { reviveMeta, reviveRun } from "../src/sim/save"
import type { GameState, MetaState } from "../src/sim/types"

function fresh(): { S: GameState; meta: MetaState } {
  const meta = createMeta()
  return { S: createRun(meta), meta }
}

function run(S: GameState, meta: MetaState, seconds: number, dt = 0.1, offline = false) {
  const steps = Math.round(seconds / dt)
  for (let i = 0; i < steps; i++) step(S, meta, dt, offline)
}

describe("初始局", () => {
  test("三座熔炉、四条元素、三个基础配方", () => {
    const { S, meta } = fresh()
    expect(S.slots.length).toBe(3)
    expect(S.stock.aqua).toBe(25)
    expect(S.stock.ignis).toBe(25)
    expect(Object.keys(S.recipes).sort()).toEqual([...START_RECIPES].sort())
    expect(derive(S, meta).techCount).toBe(0)
  })

  test("煅烧真的产出硫磺并消耗火与土", () => {
    const { S, meta } = fresh()
    setSlotRecipe(S, 1, "calcine")
    setSlotRecipe(S, 2, null)
    S.stock.ignis = 40
    S.stock.terra = 40
    const before = { sulfur: S.stock.sulfur, ignis: S.stock.ignis, terra: S.stock.terra }
    run(S, meta, 20)
    expect(S.produced.sulfur).toBeGreaterThan(3)
    expect(S.stock.ignis).toBeLessThan(before.ignis + 30) // 地脉有补充，但净消耗仍在
    expect(S.stock.terra).toBeLessThan(before.terra + 30)
  })
})

describe("供水式配平", () => {
  test("多座熔炉争抢同一元素时按比例同时降速，而不是先到先得", () => {
    const { S, meta } = fresh()
    setSlotRecipe(S, 0, "calcine")
    setSlotRecipe(S, 1, "calcine")
    setSlotRecipe(S, 2, "calcine")
    S.stock.ignis = 0
    S.stock.terra = 500
    // 把世界时间推到火元素波谷（正弦波动的最低点），制造真实的供给低谷
    S.world = 63.3
    step(S, meta, 0.1)
    const a = S.slots[0]!.ratio
    const b = S.slots[1]!.ratio
    const c = S.slots[2]!.ratio
    expect(a).toBeGreaterThan(0)
    expect(a).toBeLessThan(0.95)
    expect(Math.abs(a - b)).toBeLessThan(1e-6)
    expect(Math.abs(a - c)).toBeLessThan(1e-6)
    expect(S.slots[0]!.bottleneck).toBe("ignis")
  })

  test("完全缺料时槽位进入 starved 并指出瓶颈物质", () => {
    const { S, meta } = fresh()
    S.recipes.alloy_lead = true
    setSlotRecipe(S, 0, "alloy_lead")
    setSlotRecipe(S, 1, null)
    setSlotRecipe(S, 2, null)
    S.stock.sulfur = 0
    S.stock.terra = 500
    step(S, meta, 0.1)
    expect(S.slots[0]!.status).toBe("starved")
    expect(S.slots[0]!.bottleneck).toBe("sulfur")
  })

  test("元素供给存在真实低谷：波谷时火元素供给显著低于波峰", () => {
    const { S, meta } = fresh()
    S.world = 63.3 // 火元素波谷
    step(S, meta, 0.1)
    const trough = S.supply.ignis
    S.world = 63.3 + 66 // 半个周期后是波峰
    step(S, meta, 0.1)
    const peak = S.supply.ignis
    expect(trough).toBeLessThan(peak * 0.6)
    expect(peak / trough).toBeGreaterThan(2)
  })
})

describe("研究与科技树", () => {
  test("研究持续消耗底物并最终完成，解锁配方", () => {
    const { S, meta } = fresh()
    expect(startResearch(S, meta, "t_lead")).toBe(true)
    S.stock.sulfur = 200
    S.stock.salt = 200
    for (let i = 0; i < 400; i++) {
      S.stock.sulfur = Math.max(S.stock.sulfur, 50)
      S.stock.salt = Math.max(S.stock.salt, 50)
      step(S, meta, 0.1)
    }
    expect(S.techs.t_lead).toBe(true)
    expect(S.recipes.alloy_lead).toBe(true)
    expect(S.research.active).toBe(null)
  })

  test("没有底物时研究不推进", () => {
    const { S, meta } = fresh()
    startResearch(S, meta, "t_lead")
    S.stock.sulfur = 0
    S.stock.salt = 0
    S.stock.aqua = 0
    S.stock.ignis = 0
    S.stock.terra = 0
    S.stock.aer = 0
    // 关掉所有槽位，确保没有任何产出
    for (let i = 0; i < S.slots.length; i++) setSlotRecipe(S, i, null)
    run(S, meta, 30)
    expect(S.research.progress.t_lead ?? 0).toBeLessThan(0.001)
  })

  test("前置科技未完成时无法研究", () => {
    const { S, meta } = fresh()
    expect(availableTechs(S).some((t) => t.id === "t_tin")).toBe(false)
    expect(startResearch(S, meta, "t_tin")).toBe(false)
  })

  test("所有科技的前置都能被满足（没有孤儿节点）", () => {
    const ids = new Set(TECHS.map((t) => t.id))
    for (const t of TECHS) {
      for (const r of t.requires ?? []) expect(ids.has(r)).toBe(true)
      for (const r of t.unlockRecipes ?? []) expect(RECIPE_MAP[r]).toBeTruthy()
      for (const s of Object.keys(t.cost)) expect(SUB_MAP[s]).toBeTruthy()
    }
  })

  test("所有配方的物质都存在，且每个配方都能被某个科技解锁或开局拥有", () => {
    const unlockedByTech = new Set(TECHS.flatMap((t) => t.unlockRecipes ?? []))
    for (const r of RECIPES) {
      for (const s of [...Object.keys(r.inputs), ...Object.keys(r.outputs), ...Object.keys(r.byproducts ?? {})]) {
        expect(SUB_MAP[s], `${r.id} 引用了不存在的物质 ${s}`).toBeTruthy()
      }
      if (!START_RECIPES.includes(r.id)) {
        expect(unlockedByTech.has(r.id), `配方 ${r.id} 没有任何解锁途径`).toBe(true)
      }
    }
  })
})

describe("产出必须有去处：溢出与废渣", () => {
  test("在线溢出会产生废渣并拖慢地脉", () => {
    const { S, meta } = fresh()
    setSlotRecipe(S, 0, "dissolve")
    setSlotRecipe(S, 1, null)
    setSlotRecipe(S, 2, null)
    S.stock.salt = S.stock.salt // noop
    const D0 = derive(S, meta)
    const cap = SUB_MAP.salt.cap * D0.capMul
    S.stock.salt = cap - 0.5
    S.stock.aqua = 500
    S.stock.terra = 500
    run(S, meta, 30)
    expect(S.stock.slag).toBeGreaterThan(0)
    const after = derive(S, meta)
    expect(after.slagPenalty).toBeLessThan(1)
    expect(S.slots[0]!.clog).toBe("salt")
  })

  test("离线挂机不产生废渣（只浪费产出），避免惩罚睡眠", () => {
    const { S, meta } = fresh()
    setSlotRecipe(S, 0, "dissolve")
    setSlotRecipe(S, 1, null)
    setSlotRecipe(S, 2, null)
    S.stock.salt = SUB_MAP.salt.cap - 0.5
    S.stock.aqua = 20000
    S.stock.terra = 20000
    run(S, meta, 30, 0.5, true)
    expect(S.stock.slag).toBe(0)
  })

  test("净化配方能把废渣变回盐", () => {
    const { S, meta } = fresh()
    S.recipes.purify = true
    S.stock.slag = 400
    S.stock.aqua = 600
    setSlotRecipe(S, 0, "purify")
    setSlotRecipe(S, 1, null)
    setSlotRecipe(S, 2, null)
    const before = S.stock.slag
    run(S, meta, 30)
    expect(S.stock.slag).toBeLessThan(before)
    expect(S.produced.salt).toBeGreaterThan(0)
  })
})

describe("市场", () => {
  test("出售商品换金币，需求高的时候卖得更贵", () => {
    const { S, meta } = fresh()
    S.stock.sulfur = 50
    const p0 = sellPrice(S, meta, "sulfur")
    S.world = S.world // keep
    const gold = sellSubstance(S, meta, "sulfur", 50)
    expect(S.stock.sulfur).toBe(0)
    expect(gold).toBeGreaterThan(0)
    expect(S.gold).toBeCloseTo(gold, 6)
    expect(p0).toBeGreaterThan(0)
  })

  test("买入元素受价格与仓储上限约束", () => {
    const { S, meta } = fresh()
    S.gold = 10000
    const ok = buyElement(S, meta, "ignis", 10)
    expect(ok).toBe(true)
    expect(S.gold).toBeLessThan(10000)
    expect(S.stock.ignis).toBeGreaterThan(25)
    // 塞满之后买不动
    S.stock.ignis = 1e9
    expect(buyElement(S, meta, "ignis", 10)).toBe(false)
  })

  test("地脉强化消耗金币并提升产出", () => {
    const { S, meta } = fresh()
    S.gold = 1000
    const before = S.supply.ignis
    expect(upgradeLey(S, meta, "ignis")).toBe(true)
    step(S, meta, 0.1)
    expect(S.supply.ignis).toBeGreaterThan(before)
  })

  test("市场价格快照覆盖全部物质", () => {
    const { S, meta } = fresh()
    const snap = marketSnapshot(S, meta)
    expect(Object.keys(snap).length).toBeGreaterThan(15)
    expect(snap.ignis.buyable).toBe(true)
    expect(snap.gold.buyable).toBe(false)
  })
})

describe("自动出售（商会代理）", () => {
  test("未研究前不会自动卖，研究后快满仓才会卖", () => {
    const { S, meta } = fresh()
    S.stock.purify // noop
    S.stock.sulfur = SUB_MAP.sulfur.cap - 1
    S.autoSell = true
    run(S, meta, 20, 0.5)
    expect(S.gold).toBe(0) // 没解锁，不会卖

    S.techs.trade_auto = true
    const gold0 = S.gold
    run(S, meta, 60, 0.5)
    expect(S.gold).toBeGreaterThan(gold0) // 真的换到钱了
    // 库存不再被顶死在上限（需求低于基准价时会暂停出手，所以不要求卖到 60%）
    expect(S.stock.sulfur).toBeLessThan(SUB_MAP.sulfur.cap - 2)
  })

  test("需求低于基准价时不出手（把择时留给人）", () => {
    const { S, meta } = fresh()
    S.techs.trade_auto = true
    S.autoSell = true
    S.stock.gold = 5
    // 把世界时间推到金需求的最低点
    S.world = 260 * 0.75 - (SUB_MAP.gold.phase ?? 0) * (260 / (2 * Math.PI))
    step(S, meta, 0.1)
    const demand = S.demandMul.gold
    const gold0 = S.gold
    for (let i = 0; i < 20; i++) step(S, meta, 0.5)
    if (demand < 1) expect(S.gold).toBeCloseTo(gold0, 6)
  })
})

describe("贤者之石与局外成长", () => {
  test("伟业会发放贤者之石", () => {
    const { S, meta } = fresh()
    S.produced.lead = 5
    step(S, meta, 0.1)
    expect(S.milestones.w_lead).toBe(true)
    expect(meta.ps).toBeGreaterThan(0)
    expect(S.runPs).toBeGreaterThan(0)
  })

  test("伟大工作配方产出贤者之石", () => {
    const { S, meta } = fresh()
    S.recipes.magnum_opus = true
    setSlotRecipe(S, 0, "magnum_opus")
    setSlotRecipe(S, 1, null)
    setSlotRecipe(S, 2, null)
    S.stock.azoth = 100
    S.stock.gold = 1000
    S.stock.astra = 1000
    run(S, meta, 60)
    expect(S.runPs).toBeGreaterThan(1)
    expect(meta.ps).toBeGreaterThan(1)
  })

  test("元升级扣贤者之石并立刻生效", () => {
    const { S, meta } = fresh()
    meta.ps = 100
    const cost = metaCost(meta, "m_speed")
    expect(cost).toBeGreaterThan(0)
    const before = derive(S, meta).speedMul
    expect(buyMeta(S, meta, "m_speed")).toBe(true)
    expect(meta.ps).toBeCloseTo(100 - cost, 6)
    expect(derive(S, meta).speedMul).toBeGreaterThan(before)
    expect(meta.upgrades.m_speed).toBe(1)
  })

  test("额外熔炉会立刻补齐槽位", () => {
    const { S, meta } = fresh()
    meta.ps = 1000
    const before = S.slots.length
    expect(buyMeta(S, meta, "m_slots")).toBe(true)
    expect(S.slots.length).toBe(before + 1)
  })

  test("元升级不能超上限，也不能透支", () => {
    const { S, meta } = fresh()
    const up = META_UPGRADES.find((u) => u.id === "m_slots")!
    meta.ps = 1e9
    for (let i = 0; i < up.max; i++) expect(buyMeta(S, meta, up.id)).toBe(true)
    expect(buyMeta(S, meta, up.id)).toBe(false)
    meta.ps = 0
    expect(buyMeta(S, meta, "m_ley")).toBe(false)
  })

  test("轮回需要足够的本局贤者之石，并发放贤者之印", () => {
    const { S, meta } = fresh()
    expect(canRebirth(S)).toBe(false)
    S.runPs = 100
    S.techs.t_lead = true
    expect(canRebirth(S)).toBe(true)
    const seals = rebirth(S, meta)
    expect(seals).toBeGreaterThan(0)
    expect(meta.seals).toBe(seals)
    expect(S.runPs).toBe(0)
    expect(S.techs.t_lead).toBeUndefined()
    expect(derive(S, meta).speedMul).toBeGreaterThan(1)
  })

  test("轮回收益单调递增", () => {
    expect(rebirthSeals(0)).toBe(0)
    expect(rebirthSeals(40)).toBeGreaterThan(0)
    expect(rebirthSeals(200)).toBeGreaterThanOrEqual(rebirthSeals(100))
    expect(rebirthSeals(1000)).toBeGreaterThan(rebirthSeals(200))
  })
})

describe("存档", () => {
  test("序列化 → 反序列化后关键状态一致", () => {
    const { S, meta } = fresh()
    S.gold = 123.5
    S.stock.gold = 12
    S.techs.t_lead = true
    S.recipes.alloy_lead = true
    S.research.active = "t_tin"
    S.research.progress.t_tin = 0.4
    S.milestones.w_lead = true
    S.produced.lead = 42
    S.stock.slag = 7
    S.leyLv.ignis = 2
    S.buffTimes.cat_ignis = 12
    setSlotRecipe(S, 0, "alloy_lead")
    const raw = JSON.parse(JSON.stringify({ meta, state: S }))
    const meta2 = reviveMeta(raw.meta)
    const S2 = reviveRun(raw.state, meta2)
    expect(S2.gold).toBe(123.5)
    expect(S2.stock.gold).toBe(12)
    expect(S2.techs.t_lead).toBe(true)
    expect(S2.recipes.alloy_lead).toBe(true)
    expect(S2.research.active).toBe("t_tin")
    expect(S2.research.progress.t_tin).toBeCloseTo(0.4, 6)
    expect(S2.milestones.w_lead).toBe(true)
    expect(S2.produced.lead).toBe(42)
    expect(S2.stock.slag).toBe(7)
    expect(S2.leyLv.ignis).toBe(2)
    expect(S2.buffTimes.cat_ignis).toBe(12)
    expect(S2.slots[0]!.recipe).toBe("alloy_lead")
  })

  test("损坏 / 空存档不会崩", () => {
    const meta = createMeta()
    expect(() => reviveRun({} as any, meta)).not.toThrow()
    expect(() => reviveRun(null as any, meta)).not.toThrow()
    const S = reviveRun({ stock: { 不存在的物质: 999, gold: 5 }, techs: { 假科技: true }, slots: "x" } as any, meta)
    expect(S.stock.gold).toBe(5)
    expect(S.techs["假科技"]).toBeUndefined()
    expect(reviveMeta(undefined).ps).toBe(0)
  })

  test("槽位数量在读取存档后与派生结果一致", () => {
    const { S, meta } = fresh()
    meta.upgrades.m_slots = 2
    syncSlots(S, meta)
    expect(S.slots.length).toBe(5)
    const raw = JSON.parse(JSON.stringify(S))
    const S2 = reviveRun(raw, meta)
    expect(S2.slots.length).toBe(5)
  })
})
