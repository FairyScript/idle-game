/**
 * 自动试玩机器人：用一套自适应的"配平"策略把游戏跑一遍，
 * 用来验证 —— 科技主线真的能被打通，以及各阶段的耗时可接受。
 *
 * 策略要点（也代表了一个"会玩的玩家"）：
 *  - 只研究当前材料链能产出的科技（可达性 BFS）
 *  - 槽位按"缺口"打分：目标库存 − 实际库存 − 净流量，缺口大的产物优先排产
 *  - 库存快满时强烈避开，鼓励把副产物用掉或卖掉
 *
 *   bun run tools/playtest.ts [模拟分钟数]
 */
import { SUBSTANCES, SUB_MAP, RECIPES, TECH_MAP, PS_ID } from "../src/sim/content"
import {
  availableTechs,
  capOf,
  createMeta,
  createRun,
  derive,
  metaCost,
  applyCatalyst,
  buyMeta,
  rebirth,
  rebirthSeals,
  sellSubstance,
  setSlotRecipe,
  startResearch,
  step,
} from "../src/sim/engine"
import type { GameState, MetaState } from "../src/sim/types"

const MINUTES = Number(Bun.argv[2] ?? 90)
const DT = 0.25
const TECHS_TOTAL = Object.keys(TECH_MAP).length
const BRANCH_PRIORITY: Record<string, number> = { build: 0, main: 1, ley: 2, trade: 3, meta: 4 }

export interface Bot {
  lastAssign: number
}

export const META_UP_IDS = [
  "m_ley", "m_speed", "m_cap", "m_price", "m_research", "m_slag", "m_forecast", "m_work", "m_slots",
]

/** 当前材料链能产出哪些物质（BFS：元素 + 库存里有的 → 配方可跑就解锁其产出） */
function reachable(S: GameState): Set<string> {
  const have = new Set<string>()
  for (const s of SUBSTANCES) {
    if (s.kind === "element") have.add(s.id)
    if ((S.stock[s.id] ?? 0) > 0.01) have.add(s.id)
  }
  let grew = true
  while (grew) {
    grew = false
    for (const r of RECIPES) {
      if (!S.recipes[r.id]) continue
      if (!Object.keys(r.inputs).every((k) => have.has(k))) continue
      for (const k of [...Object.keys(r.outputs), ...Object.keys(r.byproducts ?? {})]) {
        if (!have.has(k)) {
          have.add(k)
          grew = true
        }
      }
    }
  }
  return have
}

export function botPolicy(S: GameState, meta: MetaState, bot: Bot) {
  const D = derive(S, meta)

  // ── 1. 研究：优先能产出的科技，建设支线优先（槽位是最大的瓶颈）
  if (!S.research.active) {
    const reach = reachable(S)
    const pool = availableTechs(S).filter((t) => Object.keys(t.cost).every((k) => reach.has(k)))
    pool.sort(
      (a, b) =>
        (BRANCH_PRIORITY[a.branch] ?? 9) - (BRANCH_PRIORITY[b.branch] ?? 9) ||
        a.tier - b.tier ||
        a.time - b.time,
    )
    if (pool[0]) startResearch(S, meta, pool[0].id)
  }

  // ── 2. 金币：先把所有地脉推到 3 级，再买便宜的元升级
  while (S.gold > 150) {
    const cheapest = Object.keys(S.leyLv)
      .map((e) => ({ e, cost: 35 * Math.pow(1.75, S.leyLv[e] ?? 0) }))
      .filter((x) => x.cost <= S.gold && (S.leyLv[x.e] ?? 0) < 3)
      .sort((a, b) => a.cost - b.cost)[0]
    if (!cheapest) break
    S.gold -= cheapest.cost
    S.leyLv[cheapest.e] = (S.leyLv[cheapest.e] ?? 0) + 1
  }
  if (meta.ps > 0) {
    const affordable = META_UP_IDS.map((id) => ({ id, cost: metaCost(meta, id) }))
      .filter((x) => x.cost <= meta.ps)
      .sort((a, b) => a.cost - b.cost)
    for (const up of affordable.slice(0, 2)) buyMeta(S, meta, up.id)
  }

  // ── 3. 配平：每 4 秒重新指派熔炉
  if (S.t - bot.lastAssign < 4) return
  bot.lastAssign = S.t

  const wantStock: Record<string, number> = {}
  if (S.research.active) {
    const tech = TECH_MAP[S.research.active]!
    for (const [k, v] of Object.entries(tech.cost)) wantStock[k] = v * 3
  }

  const urgency: Record<string, number> = {}
  for (const s of SUBSTANCES) {
    if (s.kind === "meta") continue
    const stock = S.stock[s.id] ?? 0
    const want = wantStock[s.id] ?? 0
    const cap = capOf(s, D)
    const net = S.net[s.id] ?? 0
    if (s.kind === "waste") {
      urgency[s.id] = 0.05 - net
      continue
    }
    if (s.kind === "element") {
      // 元素是地脉白送的：只有"被抽干"才是问题，库存多不代表要赶紧烧掉
      const deficit = want > 0 ? ((want - stock) / Math.max(1, want)) * 4 : 0
      urgency[s.id] = deficit + Math.max(0, -net) * 2.5
      continue
    }
    let u = ((want - stock) / Math.max(1, want, cap * 0.3)) * 4 - net * 2.5
    if (stock > cap * 0.8) u -= 6
    urgency[s.id] = u
  }
  urgency[PS_ID] = 12

  // 反向传播：想产出某物，就应该同样"想要"它的原料（否则机器会停在半成品上不动）
  const knownRecipes = RECIPES.filter((r) => S.recipes[r.id])
  for (let pass = 0; pass < 5; pass++) {
    for (const r of knownRecipes) {
      let outUrg = 0
      for (const [k, v] of Object.entries(r.outputs)) outUrg += Math.max(0, urgency[k] ?? 0) * (v / r.time)
      if (outUrg <= 0.001) continue
      for (const [k, v] of Object.entries(r.inputs)) {
        const sub = SUBSTANCES.find((x) => x.id === k)
        if (sub?.kind === "element") continue
        urgency[k] = Math.min(12, (urgency[k] ?? 0) + Math.min(6, outUrg) * 0.5 * (v / r.time))
      }
    }
  }

  const scoreOf = (id: string) => {
    const r = RECIPES.find((x) => x.id === id)!
    let score = 0
    for (const [k, v] of Object.entries(r.outputs)) score += Math.max(0, urgency[k] ?? 0) * (v / r.time)
    for (const [k, v] of Object.entries(r.byproducts ?? {})) {
      score += Math.max(0, urgency[k] ?? 0) * (v / r.time) * 0.45
    }
    for (const [k, v] of Object.entries(r.inputs)) {
      const rate = v / r.time
      const sub = SUBSTANCES.find((x) => x.id === k)
      if (sub?.kind !== "element") {
        score += 0.4 * Math.min(6, -Math.min(0, urgency[k] ?? 0)) * rate
      }
      if ((S.stock[k] ?? 0) < 0.5 && (S.net[k] ?? 0) <= 0.001) score -= 4 * rate
    }
    return score
  }

  let pool = RECIPES.filter((r) => S.recipes[r.id])
    .map((r) => ({ id: r.id, s: scoreOf(r.id) }))
    .filter((x) => x.s > 0.001)
    .sort((a, b) => b.s - a.s)
  if (pool.length === 0) {
    // 兜底：按"最缺的产物"排序，保证熔炉不会集体停摆
    pool = RECIPES.filter((r) => S.recipes[r.id])
      .map((r) => {
        let sc = 0
        for (const [k, v] of Object.entries(r.outputs)) {
          const cap = capOf(SUB_MAP[k], D) || 1
          sc += (1 - Math.min(1, (S.stock[k] ?? 0) / cap)) * (v / r.time)
        }
        for (const [k, v] of Object.entries(r.inputs)) {
          if ((S.stock[k] ?? 0) < 0.5 && (S.net[k] ?? 0) <= 0.001) sc -= 20 * (v / r.time)
        }
        return { id: r.id, s: sc }
      })
      .sort((a, b) => b.s - a.s)
  }
  ;(globalThis as any).__lastPool = pool
  ;(globalThis as any).__lastUrgency = urgency

  const picks: string[] = []
  const penalty: Record<string, number> = {}
  for (let i = 0; i < S.slots.length; i++) {
    let best: { id: string; s: number } | null = null
    for (const cand of pool) {
      const s = cand.s * Math.pow(0.3, penalty[cand.id] ?? 0)
      if (!best || s > best.s) best = { id: cand.id, s }
    }
    if (!best) break
    picks.push(best.id)
    penalty[best.id] = (penalty[best.id] ?? 0) + 1
  }
  for (let i = 0; i < S.slots.length; i++) {
    const want = picks[i] ?? null
    if (S.slots[i]!.recipe !== want) setSlotRecipe(S, i, want)
  }
}

/** 卖货 + 清理废渣 */
export function housekeeping(S: GameState, meta: MetaState) {
  const D = derive(S, meta)
  for (const s of SUBSTANCES) {
    if (!s.price) continue
    const cap = capOf(s, D)
    if ((S.stock[s.id] ?? 0) > cap * 0.75 && S.demandMul[s.id] > 1.0) {
      sellSubstance(S, meta, s.id, (S.stock[s.id] ?? 0) - cap * 0.6)
    }
  }
  if (S.stock.slag > 260) applyCatalyst(S, meta, "cat_purge")
}

export function simulate(
  S: GameState,
  meta: MetaState,
  seconds: number,
  dt = DT,
  onTick?: (S: GameState) => void,
) {
  const bot: Bot = { lastAssign: -99 }
  for (let i = 0; i * dt < seconds; i++) {
    botPolicy(S, meta, bot)
    step(S, meta, dt)
    housekeeping(S, meta)
    onTick?.(S)
  }
}

function fmtT(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}m${String(s).padStart(2, "0")}s`
}

function main() {
  const meta = createMeta()
  const S = createRun(meta)
  const marks: string[] = []
  let tMagnum = -1
  let tFirstPs = -1
  let lastReport = 0

  simulate(S, meta, MINUTES * 60, DT, () => {
    if (S.recipes.magnum_opus && tMagnum < 0) {
      tMagnum = S.t
      marks.push(`t=${fmtT(S.t)} 解锁【伟大工作】`)
    }
    if (S.runPs > 0 && tFirstPs < 0) {
      tFirstPs = S.t
      marks.push(`t=${fmtT(S.t)} 第一颗贤者之石`)
    }
    if (S.t - lastReport >= 600) {
      lastReport = S.t
      const D = derive(S, meta)
      console.log(
        `t=${fmtT(S.t).padStart(8)} 科技${String(D.techCount).padStart(2)}/${TECHS_TOTAL} 槽位${D.slotCount} ` +
          `PS ${meta.ps.toFixed(0).padStart(4)} 金币${S.gold.toFixed(0).padStart(6)} ×${D.speedMul.toFixed(2)} ` +
          `供给×${D.supplyMul.toFixed(2)} 废渣${S.stock.slag.toFixed(0).padStart(4)} 研究:${S.research.active ?? "—"}`,
      )
    }
  })

  const D = derive(S, meta)
  console.log("\n=== 里程碑 ===")
  for (const m of marks) console.log("  " + m)
  console.log("\n=== 终局 ===")
  console.log(`  本局时长      ${fmtT(S.t)}`)
  console.log(`  完成科技      ${D.techCount} / ${TECHS_TOTAL}`)
  console.log(`  槽位          ${D.slotCount}`)
  console.log(`  本局贤者之石   ${S.runPs.toFixed(1)}   （伟业 ${Object.keys(S.milestones).length} 项）`)
  console.log(
    `  全局速度      ×${D.speedMul.toFixed(2)}   地脉 ×${D.supplyMul.toFixed(2)}   仓储 ×${D.capMul.toFixed(2)}`,
  )
  console.log(`  未解锁配方    ${RECIPES.filter((r) => !S.recipes[r.id]).map((r) => r.name).join("、") || "无"}`)
  console.log(`  轮回可得印记   ${rebirthSeals(S.runPs)}`)
  console.log(`  终局库存 (前 8)`)
  for (const s of [...SUBSTANCES].sort((a, b) => (S.stock[b.id] ?? 0) - (S.stock[a.id] ?? 0)).slice(0, 8)) {
    const net = S.net[s.id] ?? 0
    console.log(
      `      ${s.name.padEnd(6, "　")} ${(S.stock[s.id] ?? 0).toFixed(1).padStart(9)}  ${net >= 0 ? "+" : ""}${net.toFixed(3)}/s`,
    )
  }

  if (S.runPs >= 40) {
    const seals = rebirth(S, meta)
    console.log(`\n=== 轮回 === 获得 ${seals} 枚贤者之印（累计 ${meta.seals}，速度 +${(meta.seals * 4).toFixed(0)}%）`)
    let first = -1
    simulate(S, meta, 30 * 60, DT, (st) => {
      if (st.runPs > 0 && first < 0) first = st.t
    })
    console.log(
      `  第二轮：${fmtT(first)} 拿到第一颗贤者之石；30 分钟累计 ${S.runPs.toFixed(1)} 颗，科技 ${derive(S, meta).techCount} 项`,
    )
  }
}

if (import.meta.main) main()
