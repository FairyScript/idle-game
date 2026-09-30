/** 从内容表生成 DESIGN.md 用的 markdown 表格，保证文档和代码不会脱节。 */
import { RECIPES, SUBSTANCES, TECHS, SUB_MAP, META_UPGRADES, CATALYSTS, MILESTONES, OMENS } from "../src/sim/content"

const nm = (id: string) => SUB_MAP[id]?.name ?? id
const n = (x: number) => (Number.isInteger(x) ? String(x) : String(Math.round(x * 100) / 100))

console.log("### 配方全表\n")
console.log("| 配方 | 周期 | 消耗 | 主产物 | 副产物 | 每秒净消耗（1 座满速） |")
console.log("|---|---|---|---|---|---|")
for (const r of RECIPES) {
  const ins = Object.entries(r.inputs).map(([k, v]) => `${n(v)} ${nm(k)}`).join(" + ")
  const outs = Object.entries(r.outputs).map(([k, v]) => `${n(v)} ${nm(k)}`).join(" + ")
  const byp = Object.entries(r.byproducts ?? {}).map(([k, v]) => `${n(v)} ${nm(k)}`).join(" + ") || "—"
  const per = Object.entries(r.inputs).map(([k, v]) => `${nm(k)} ${(v / r.time).toFixed(2)}/s`).join("，")
  console.log(`| ${r.name} | ${r.time}s | ${ins} | ${outs} | ${byp} | ${per} |`)
}

console.log("\n### 元素地脉\n")
console.log("| 元素 | 基础产出 | 波动周期 | 初始仓储 | 购入基价 |")
console.log("|---|---|---|---|---|")
for (const s of SUBSTANCES.filter((x) => x.kind === "element")) {
  console.log(`| ${s.name} | ${s.supply}/s | ${s.period}s | ${s.cap} | ${s.buyPrice} |`)
}

console.log("\n### 科技树\n")
console.log("| 分支 | 科技 | 耗时 | 底物 | 前置 | 效果 |")
console.log("|---|---|---|---|---|---|")
for (const t of TECHS) {
  const cost = Object.entries(t.cost).map(([k, v]) => `${n(v)} ${nm(k)}`).join(" + ")
  const fmtEff = (k: string, v: number) =>
    k === "slots" ? `+${n(v)} 熔炉槽位` : `${k} +${Math.round(v * 100)}%`
  const eff = [
    ...(t.unlockRecipes ?? []).map((r) => `解锁 ${r}`),
    ...Object.entries(t.effects ?? {}).map(([k, v]) => fmtEff(k, v)),
  ].join("，") || "—"
  console.log(`| ${t.branch} | ${t.name} | ${t.time}s | ${cost} | ${t.requires?.join("+") ?? "—"} | ${eff} |`)
}

console.log("\n### 元升级\n")
console.log("| 升级 | 效果 | 上限 | 首级价格 | 成长 |")
console.log("|---|---|---|---|---|")
for (const m of META_UPGRADES) {
  const e =
    m.id === "m_work"
      ? "伟业奖励 +35%/级"
      : Object.entries(m.effect)
          .map(([k, v]) => (k === "slots" ? `开局 +${n(Number(v))} 槽位/级` : `${k} +${Math.round(Number(v) * 100)}%/级`))
          .join("，")
  console.log(`| ${m.name} | ${e} | ${m.max} | ${m.baseCost} 石 | ×${m.growth} |`)
}

console.log("\n### 催化剂\n")
console.log("| 催化剂 | 价格 | 时长 | 效果 |")
console.log("|---|---|---|---|")
for (const c of CATALYSTS) console.log(`| ${c.name} | ${c.cost} 金 | ${c.dur || "立即"} | ${c.desc} |`)

console.log(`\n### 天象（${OMENS.length} 种）\n`)
console.log("| 天象 | 时长 | 供给变化 | 需求变化 |")
console.log("|---|---|---|---|")
for (const o of OMENS) {
  const s = Object.entries(o.supply ?? {}).map(([k, v]) => `${nm(k)} ${v > 0 ? "+" : ""}${v}`).join("，") || "—"
  const d = Object.entries(o.demand ?? {}).map(([k, v]) => `${nm(k)} ${v > 0 ? "+" : ""}${v}`).join("，") || "—"
  console.log(`| ${o.name} | ${o.dur}s | ${s} | ${d} |`)
}

console.log(`\n### 伟业（${MILESTONES.length} 项，合计 ${MILESTONES.reduce((a, m) => a + m.ps, 0)} 石）\n`)
console.log(MILESTONES.map((m) => `- **${m.name}**（+${m.ps} 石）：${m.desc}`).join("\n"))
