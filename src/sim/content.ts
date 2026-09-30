/**
 * 游戏内容数据表：物质、配方、科技树、天象、元升级、伟业。
 *
 * 设计要点
 * - 元素供给随时间正弦波动 + 天象突变 → 玩家必须调整在跑的配方。
 * - 配方带副产物 → 产出的不只是"想要的东西"，逼玩家把副产物也消耗掉。
 * - 科技研究持续消耗一组物质 → 必须同时维持多条产线，这就是"配平"。
 * - 仓储有上限，溢出产生废渣，废渣拖慢全局 → 产出必须有去处。
 */
import type {
  Catalyst,
  MetaUpgrade,
  Milestone,
  Omen,
  Recipe,
  Substance,
  SubId,
  Tech,
} from "./types"

/** 贤者之石的伪物质 id */
export const PS_ID = "ps"
export const SLAG_ID = "slag"

export const SUBSTANCES: Substance[] = [
  // ── 四大元素 + 以太：由地脉自动产出，速率随时间波动 ──────────────────────
  {
    id: "aqua", name: "水", latin: "Aqua", glyph: "水", kind: "element", tier: 0,
    color: "#4aa3df", cap: 70, supply: 1.5, period: 96, phase: 0,
    buyPrice: 3.2, desc: "一切溶解与净化的载体。潮汐涨落决定它的丰沛程度。",
  },
  {
    id: "ignis", name: "火", latin: "Ignis", glyph: "火", kind: "element", tier: 0,
    color: "#e2603c", cap: 70, supply: 1.5, period: 132, phase: 1.7,
    buyPrice: 3.2, desc: "煅烧与合金的驱动力。焰潮来临时效率翻倍，退潮时寸步难行。",
  },
  {
    id: "terra", name: "土", latin: "Terra", glyph: "土", kind: "element", tier: 0,
    color: "#a5793f", cap: 70, supply: 1.5, period: 168, phase: 3.1,
    buyPrice: 3.2, desc: "承载形体的基质。几乎所有固体产物都要从它开始。",
  },
  {
    id: "aer", name: "风", latin: "Aer", glyph: "风", kind: "element", tier: 0,
    color: "#8fb8a8", cap: 70, supply: 1.5, period: 114, phase: 4.6,
    buyPrice: 3.2, desc: "升华与蒸馏的媒介。它最善变，周期最短。",
  },
  {
    id: "aether", name: "以太", latin: "Aether", glyph: "玄", kind: "element", tier: 2,
    color: "#b48ce0", cap: 40, supply: 0.38, period: 300, phase: 2.2,
    buyPrice: 14, desc: "第五元素，星界的呼吸。产出极慢，是后期所有高级配方的咽喉。",
  },

  // ── 三原质 ────────────────────────────────────────────────────────────
  {
    id: "sulfur", name: "硫磺", latin: "Sulphur", glyph: "硫", kind: "material", tier: 0,
    color: "#e0b73c", cap: 90, price: 2.0, period: 150, phase: 0.6,
    desc: "可燃的灵魂。三原质中最常被消耗的一种。",
  },
  {
    id: "mercury", name: "水银", latin: "Mercurius", glyph: "汞", kind: "material", tier: 0,
    color: "#b9c6cf", cap: 90, price: 3.0, period: 190, phase: 2.9,
    desc: "流动的精神。它总以副产物的身份不请自来。",
  },
  {
    id: "salt", name: "盐", latin: "Sal", glyph: "盐", kind: "material", tier: 0,
    color: "#e6e2d0", cap: 90, price: 2.0, period: 130, phase: 4.2,
    desc: "凝固的肉身。市场对它的需求相当规律。",
  },

  // ── 七曜金属 ──────────────────────────────────────────────────────────
  {
    id: "lead", name: "铅", latin: "Plumbum", glyph: "铅", kind: "metal", tier: 1,
    color: "#6f7480", cap: 70, price: 3.5, period: 210, phase: 1.2,
    desc: "最卑贱的金属。所有黄金之路都从它（的副产物）流过。",
  },
  {
    id: "tin", name: "锡", latin: "Stannum", glyph: "锡", kind: "metal", tier: 1,
    color: "#9aa4a8", cap: 70, price: 5.0, period: 165, phase: 3.4,
    desc: "柔软的中介。炼铁时缺了它就什么都做不成。",
  },
  {
    id: "iron", name: "铁", latin: "Ferrum", glyph: "铁", kind: "metal", tier: 1,
    color: "#8d6a52", cap: 70, price: 6.5, period: 145, phase: 5.1,
    desc: "战神之金属。既是产物也是消耗品。",
  },
  {
    id: "copper", name: "铜", latin: "Cuprum", glyph: "铜", kind: "metal", tier: 1,
    color: "#c07248", cap: 70, price: 8.0, period: 200, phase: 0.9,
    desc: "维纳斯之金属，通往白银的最后一级台阶。",
  },
  {
    id: "silver", name: "银", latin: "Argentum", glyph: "银", kind: "metal", tier: 2,
    color: "#cdd6e0", cap: 60, price: 12, period: 230, phase: 2.6,
    desc: "月之光。星辰萃取与黄金合成的共同前提。",
  },
  {
    id: "gold", name: "金", latin: "Aurum", glyph: "金", kind: "metal", tier: 2,
    color: "#e8c256", cap: 50, price: 22, period: 260, phase: 4.8,
    desc: "太阳之金属。合成它会喷出大量铅——这是最经典的一课。",
  },

  // ── 三精华 ────────────────────────────────────────────────────────────
  {
    id: "anima", name: "生之精华", latin: "Anima", glyph: "生", kind: "essence", tier: 3,
    color: "#79c98a", cap: 30, price: 40, period: 240, phase: 1.9,
    desc: "从黄金中蒸馏出的生命之火，万能溶剂的一半。",
  },
  {
    id: "astra", name: "星之精华", latin: "Astra", glyph: "星", kind: "essence", tier: 3,
    color: "#8fb6ff", cap: 30, price: 46, period: 280, phase: 3.7,
    desc: "凝自以太的星光，伟大工作的必要材料。",
  },
  {
    id: "void", name: "虚之精华", latin: "Void", glyph: "虚", kind: "essence", tier: 3,
    color: "#9a7ac4", cap: 30, price: 52, period: 320, phase: 5.6,
    desc: "铅腐化后的残余，来自nigredo的深渊。",
  },

  // ── 高级 ──────────────────────────────────────────────────────────────
  {
    id: "alkahest", name: "万能溶剂", latin: "Alkahest", glyph: "溶", kind: "high", tier: 4,
    color: "#5fd0c8", cap: 20, price: 90, period: 300, phase: 0.4,
    desc: "能溶解一切的物质，也是再往上一步的门票。",
  },
  {
    id: "azoth", name: "万应灵药", latin: "Azoth", glyph: "灵", kind: "high", tier: 4,
    color: "#e07ac0", cap: 12, price: 160, period: 340, phase: 2.4,
    desc: "最后的灵药。投入伟大工作即可析出贤者之石。",
  },

  // ── 废渣与贤者之石 ────────────────────────────────────────────────────
  {
    id: SLAG_ID, name: "废渣", latin: "Scoria", glyph: "渣", kind: "waste", tier: 0,
    color: "#5c5648", cap: 1e9,
    desc: "仓储溢出后凝结的残渣。每一点都会拖慢地脉的吐息。",
  },
  {
    id: PS_ID, name: "贤者之石", latin: "Lapis Philosophorum", glyph: "石", kind: "meta", tier: 5,
    color: "#ff5f8f", cap: 0,
    desc: "局外成长的代币。伟大工作析出的每一颗都照亮下一轮循环。",
  },
]

export const SUB_MAP: Record<SubId, Substance> = Object.fromEntries(
  SUBSTANCES.map((s) => [s.id, s]),
)

export const ELEMENT_IDS = SUBSTANCES.filter((s) => s.kind === "element").map((s) => s.id)
export const START_ELEMENTS = ["aqua", "ignis", "terra", "aer"]

// ────────────────────────────────────────────────────────────────────────────
// 配方
// ────────────────────────────────────────────────────────────────────────────

export const RECIPES: Recipe[] = [
  {
    id: "calcine", name: "煅烧·硫磺", tier: 0, time: 2,
    inputs: { ignis: 2, terra: 1 }, outputs: { sulfur: 1 },
    desc: "烧掉土的形体，留下可燃的灵魂。",
  },
  {
    id: "dissolve", name: "溶解·盐", tier: 0, time: 2,
    inputs: { aqua: 2, terra: 1 }, outputs: { salt: 1 },
    desc: "以水分解土，析出凝固的肉身。",
  },
  {
    id: "sublime", name: "升华·水银", tier: 0, time: 3,
    inputs: { ignis: 2, aer: 2 }, outputs: { mercury: 1 }, byproducts: { sulfur: 1 },
    desc: "风与火托起流动的精神，副产一点硫磺。",
  },

  {
    id: "alloy_lead", name: "合金·铅", tier: 1, time: 3,
    inputs: { sulfur: 2, terra: 3 }, outputs: { lead: 2 }, byproducts: { salt: 1 },
    desc: "让硫磺咬住土，得到最卑贱也最万用的金属。",
  },
  {
    id: "alloy_tin", name: "合金·锡", tier: 1, time: 3,
    inputs: { lead: 2, aer: 2 }, outputs: { tin: 2 }, byproducts: { lead: 1 },
    desc: "风穿过铅，柔软的中介诞生，同时吐出更多的铅。",
  },
  {
    id: "alloy_iron", name: "合金·铁", tier: 1, time: 3.5,
    inputs: { lead: 1, tin: 1, ignis: 3 }, outputs: { iron: 2 }, byproducts: { sulfur: 1 },
    desc: "铅锡同炉、烈焰加持，战神之金属成型。",
  },
  {
    id: "alloy_copper", name: "合金·铜", tier: 1, time: 3.5,
    inputs: { iron: 1, aqua: 2, sulfur: 1 }, outputs: { copper: 2 }, byproducts: { iron: 1 },
    desc: "以水与硫磺淬炼铁，铜的红色显现。",
  },

  {
    id: "alloy_silver", name: "合金·银", tier: 2, time: 4,
    inputs: { copper: 2, mercury: 1, aqua: 2 }, outputs: { silver: 2 }, byproducts: { copper: 1 },
    desc: "水银把铜洗成月色，余下的铜仍是铜。",
  },
  {
    id: "alloy_gold", name: "合金·金", tier: 2, time: 5,
    inputs: { silver: 2, sulfur: 2, ignis: 3 }, outputs: { gold: 1 }, byproducts: { lead: 2 },
    desc: "银与硫磺在烈焰中转为黄金——代价是喷涌而出的铅。",
  },
  {
    id: "distill_aether", name: "蒸馏·以太", tier: 2, time: 6,
    inputs: { aer: 3, aqua: 3, salt: 2 }, outputs: { aether: 1 }, byproducts: { salt: 1 },
    desc: "把风与水反复蒸馏，直到只剩第五元素。",
  },

  {
    id: "extract_anima", name: "萃取·生之精华", tier: 3, time: 6,
    inputs: { gold: 1, salt: 2, aqua: 3 }, outputs: { anima: 1 }, byproducts: { mercury: 1 },
    desc: "在黄金里煮出生命的火苗，汞随之渗出。",
  },
  {
    id: "extract_astra", name: "萃取·星之精华", tier: 3, time: 7,
    inputs: { silver: 2, aether: 2 }, outputs: { astra: 1 }, byproducts: { silver: 1 },
    desc: "以太在银的镜面上冷凝成星光。",
  },
  {
    id: "extract_void", name: "萃取·虚之精华", tier: 3, time: 7,
    inputs: { lead: 3, aether: 1, sulfur: 2 }, outputs: { void: 1 }, byproducts: { lead: 2 },
    desc: "铅的彻底腐化（nigredo），深渊由此渗出。",
  },

  {
    id: "make_alkahest", name: "合成·万能溶剂", tier: 4, time: 8,
    inputs: { anima: 1, void: 1, aether: 2 }, outputs: { alkahest: 1 }, byproducts: { void: 1 },
    desc: "生与虚在以太中互溶，得到能溶解一切之物。",
  },
  {
    id: "make_azoth", name: "合成·万应灵药", tier: 4, time: 10,
    inputs: { anima: 2, astra: 2, alkahest: 1 }, outputs: { azoth: 1 }, byproducts: { anima: 1 },
    desc: "三精华归一，最后的灵药在瓶中翻涌。",
  },
  {
    id: "magnum_opus", name: "伟大工作", tier: 5, time: 20,
    inputs: { azoth: 1, gold: 3, astra: 2 }, outputs: { [PS_ID]: 1 }, byproducts: { gold: 1 },
    desc: "把灵药投入黄金与星光之中，析出贤者之石。这是整个循环的出口。",
  },
  {
    id: "purify", name: "净化·废渣", tier: 0, time: 3,
    inputs: { [SLAG_ID]: 4, aqua: 2 }, outputs: { salt: 1 },
    desc: "把仓库溢出凝结的废渣溶回盐水，让它重新有用。",
  },
]

export const RECIPE_MAP: Record<string, Recipe> = Object.fromEntries(
  RECIPES.map((r) => [r.id, r]),
)

/** 开局就掌握的配方（其余靠研究解锁） */
export const START_RECIPES = ["calcine", "dissolve", "sublime"]

// ────────────────────────────────────────────────────────────────────────────
// 科技树
// ────────────────────────────────────────────────────────────────────────────

export const TECHS: Tech[] = [
  // ── 主线：把物质阶梯一路推上去 ────────────────────────────────────────
  {
    id: "t_lead", name: "金属引论", tier: 1, branch: "main", time: 10,
    cost: { sulfur: 6, salt: 6 },
    unlockRecipes: ["alloy_lead"],
    desc: "硫与盐的比例是金属生成的关键。解锁【合金·铅】。",
  },
  {
    id: "t_tin", name: "锡之相", tier: 2, branch: "main", time: 18,
    cost: { lead: 14, sulfur: 8 }, requires: ["t_lead"],
    unlockRecipes: ["alloy_tin"],
    desc: "铅在风中会变软。解锁【合金·锡】。",
  },
  {
    id: "t_iron", name: "铁之心", tier: 3, branch: "main", time: 22,
    cost: { lead: 10, tin: 10, salt: 8 }, requires: ["t_tin"],
    unlockRecipes: ["alloy_iron"],
    desc: "铅锡合金在火中硬化。解锁【合金·铁】。",
  },
  {
    id: "t_copper", name: "铜之脉", tier: 4, branch: "main", time: 26,
    cost: { iron: 12, sulfur: 10, aqua: 18 }, requires: ["t_iron"],
    unlockRecipes: ["alloy_copper"],
    desc: "铁经水火淬炼显出铜色。解锁【合金·铜】。",
  },
  {
    id: "t_alloy", name: "合金总纲", tier: 5, branch: "main", time: 34,
    cost: { lead: 16, tin: 16, iron: 16, copper: 16 }, requires: ["t_copper"],
    unlockRecipes: ["alloy_silver"], effects: { cap: 0.3 },
    desc: "四种贱金属同时备齐，才能窥见白银。解锁【合金·银】，仓储 +30%。",
  },
  {
    id: "t_gold", name: "黄金之秘", tier: 6, branch: "main", time: 44,
    cost: { silver: 24, sulfur: 24, copper: 14 }, requires: ["t_alloy"],
    unlockRecipes: ["alloy_gold"],
    desc: "银 → 金。注意它会喷出巨量铅。解锁【合金·金】。",
  },
  {
    id: "t_aether", name: "以太论", tier: 6, branch: "main", time: 46,
    cost: { salt: 18, sulfur: 18, iron: 10 }, requires: ["t_alloy"],
    unlockRecipes: ["distill_aether"], effects: { cap: 0.2 },
    desc: "风与水的极限蒸馏指向第五元素。解锁【蒸馏·以太】。",
  },
  {
    id: "t_anima", name: "生命蒸馏", tier: 7, branch: "main", time: 56,
    cost: { gold: 8, salt: 20, silver: 12 }, requires: ["t_gold"],
    unlockRecipes: ["extract_anima"],
    desc: "从黄金中蒸馏生命。解锁【萃取·生之精华】。",
  },
  {
    id: "t_astra", name: "星辰冷凝", tier: 7, branch: "main", time: 56,
    cost: { silver: 20, aether: 8 }, requires: ["t_aether"],
    unlockRecipes: ["extract_astra"],
    desc: "星光是可冷凝的。解锁【萃取·星之精华】。",
  },
  {
    id: "t_void", name: "虚空腐化", tier: 7, branch: "main", time: 58,
    cost: { lead: 30, aether: 8, sulfur: 18 }, requires: ["t_aether"],
    unlockRecipes: ["extract_void"],
    desc: "让铅彻底腐化，nigredo 的深渊。解锁【萃取·虚之精华】。",
  },
  {
    id: "t_alkahest", name: "万能溶剂", tier: 8, branch: "main", time: 70,
    cost: { anima: 6, void: 6, aether: 10 }, requires: ["t_anima", "t_void"],
    unlockRecipes: ["make_alkahest"],
    desc: "生与虚必须同时供应。解锁【合成·万能溶剂】。",
  },
  {
    id: "t_azoth", name: "万应灵药", tier: 9, branch: "main", time: 84,
    cost: { anima: 12, astra: 12, alkahest: 4 }, requires: ["t_alkahest", "t_astra"],
    unlockRecipes: ["make_azoth"],
    desc: "三精华归一。解锁【合成·万应灵药】。",
  },
  {
    id: "t_magnum", name: "伟大工作", tier: 10, branch: "main", time: 110,
    cost: { azoth: 3, gold: 24, astra: 10 }, requires: ["t_azoth"],
    unlockRecipes: ["magnum_opus"], effects: { speed: 0.05 },
    desc: "终局配方。解锁【伟大工作】——将灵药转化为贤者之石。",
  },

  // ── 地脉支线：抬高元素供给与稳定性 ────────────────────────────────────
  {
    id: "ley1", name: "地脉汲引 I", tier: 1, branch: "ley", time: 20,
    cost: { salt: 14, sulfur: 14 }, effects: { supply: 0.25 },
    desc: "所有元素地脉产出 +25%。",
  },
  {
    id: "steady", name: "星象平衡", tier: 2, branch: "ley", time: 44,
    cost: { mercury: 16, salt: 20 }, requires: ["ley1"], effects: { steady: 0.35 },
    desc: "削减供给与需求的波动幅度 35%。",
  },
  {
    id: "ley2", name: "地脉汲引 II", tier: 3, branch: "ley", time: 34,
    cost: { lead: 20, copper: 14 }, requires: ["ley1"], effects: { supply: 0.3 },
    desc: "所有元素地脉产出 +30%。",
  },
  {
    id: "ley3", name: "地脉汲引 III", tier: 5, branch: "ley", time: 52,
    cost: { silver: 16, iron: 18, aether: 6 }, requires: ["ley2"], effects: { supply: 0.35 },
    desc: "所有元素地脉产出 +35%。",
  },
  {
    id: "aether_vein", name: "以太矿脉", tier: 6, branch: "ley", time: 60,
    cost: { aether: 14, void: 4 }, requires: ["t_aether", "ley2"], effects: { supply: 0.25 },
    desc: "找到以太的源头。地脉产出 +25%，以太不再总是卡住整条产线。",
  },
  {
    id: "ley4", name: "地脉汲引 IV", tier: 8, branch: "ley", time: 76,
    cost: { gold: 10, astra: 8 }, requires: ["ley3"], effects: { supply: 0.4 },
    desc: "所有元素地脉产出 +40%。",
  },

  // ── 建设支线：槽位、仓储、速度、废渣处理 ──────────────────────────────
  {
    id: "slot1", name: "扩建熔炉 I", tier: 1, branch: "build", time: 16,
    cost: { sulfur: 14, salt: 14 }, effects: { slots: 1 },
    desc: "多一座熔炉：+1 炼金槽位。",
  },
  {
    id: "store1", name: "仓库扩建 I", tier: 2, branch: "build", time: 20,
    cost: { lead: 14, salt: 14 }, effects: { cap: 0.5 },
    desc: "所有物质仓储上限 +50%。",
  },
  {
    id: "purge", name: "净化术", tier: 2, branch: "build", time: 22,
    cost: { lead: 12, salt: 12 }, unlockRecipes: ["purify"], effects: { slag: 0.3 },
    desc: "解锁【净化·废渣】，废渣惩罚 -30%。",
  },
  {
    id: "slot2", name: "扩建熔炉 II", tier: 3, branch: "build", time: 32,
    cost: { lead: 22, tin: 14 }, requires: ["slot1"], effects: { slots: 1 },
    desc: "+1 炼金槽位。",
  },
  {
    id: "speed1", name: "火候精进 I", tier: 3, branch: "build", time: 30,
    cost: { sulfur: 20, mercury: 12 }, effects: { speed: 0.2 },
    desc: "全局炼金速度 +20%。",
  },
  {
    id: "store2", name: "仓库扩建 II", tier: 4, branch: "build", time: 46,
    cost: { copper: 20, silver: 10 }, requires: ["store1"], effects: { cap: 0.6 },
    desc: "所有物质仓储上限 +60%。",
  },
  {
    id: "slot3", name: "扩建熔炉 III", tier: 4, branch: "build", time: 48,
    cost: { iron: 22, copper: 22 }, requires: ["slot2", "t_iron"], effects: { slots: 1 },
    desc: "+1 炼金槽位。",
  },
  {
    id: "purge2", name: "灰烬归元", tier: 5, branch: "build", time: 50,
    cost: { iron: 16, void: 4 }, requires: ["purge", "t_void"], effects: { slag: 0.4 },
    desc: "废渣惩罚再 -40%。",
  },
  {
    id: "speed2", name: "火候精进 II", tier: 5, branch: "build", time: 54,
    cost: { iron: 20, gold: 5 }, requires: ["speed1"], effects: { speed: 0.25 },
    desc: "全局炼金速度 +25%。",
  },
  {
    id: "slot4", name: "扩建熔炉 IV", tier: 5, branch: "build", time: 60,
    cost: { silver: 18, copper: 24 }, requires: ["slot3", "t_alloy"], effects: { slots: 1 },
    desc: "+1 炼金槽位。产链越深，需要的并行配方越多。",
  },
  {
    id: "furnace", name: "反射熔炉", tier: 8, branch: "build", time: 70,
    cost: { silver: 20, alkahest: 2 }, requires: ["speed2", "t_alkahest"], effects: { speed: 0.3 },
    desc: "全局炼金速度 +30%。",
  },
  {
    id: "slot5", name: "扩建熔炉 V", tier: 7, branch: "build", time: 84,
    cost: { aether: 16, silver: 20 }, requires: ["slot4", "t_aether"], effects: { slots: 1 },
    desc: "+1 炼金槽位。后期需要它来同时跑满整条链。",
  },

  // ── 商会支线：售价、研究速度、观星 ────────────────────────────────────
  {
    id: "trade1", name: "商会门路", tier: 1, branch: "trade", time: 24,
    cost: { salt: 16, mercury: 10 }, effects: { price: 0.2 },
    desc: "售价 +20%。",
  },
  {
    id: "scribe", name: "抄写室", tier: 2, branch: "trade", time: 30,
    cost: { salt: 22, sulfur: 22 }, effects: { research: 0.25 },
    desc: "研究速度 +25%（消耗速率同步提高，总成本不变）。",
  },
  {
    id: "foresight", name: "观星台", tier: 3, branch: "trade", time: 40,
    cost: { mercury: 18, aether: 4 }, effects: { steady: 0.25, research: 0.1 },
    desc: "波动幅度 -25%，研究速度 +10%，并延长天象预告。",
  },
  {
    id: "trade_auto", name: "商会代理", tier: 3, branch: "trade", time: 36,
    cost: { mercury: 14, salt: 24 }, requires: ["trade1"],
    desc: "解锁自动出售：仓库超过 85% 的商品会在需求不差时自动卖掉（手动择时依然更赚）。",
  },
  {
    id: "trade2", name: "市场嗅觉", tier: 4, branch: "trade", time: 42,
    cost: { silver: 14, copper: 16 }, requires: ["trade1"], effects: { price: 0.25 },
    desc: "售价 +25%。",
  },
  {
    id: "scribe2", name: "大图书馆", tier: 7, branch: "trade", time: 58,
    cost: { silver: 18, anima: 4 }, requires: ["scribe", "t_anima"], effects: { research: 0.3 },
    desc: "研究速度 +30%。",
  },
  {
    id: "trade3", name: "黄金会计", tier: 7, branch: "trade", time: 64,
    cost: { gold: 8, astra: 6 }, requires: ["trade2"], effects: { price: 0.3 },
    desc: "售价 +30%。",
  },

  // ── 循环支线：为下一轮铺路 ────────────────────────────────────────────
  {
    id: "elixir", name: "贤者之酿", tier: 9, branch: "meta", time: 90,
    cost: { azoth: 2, gold: 20, anima: 10 }, requires: ["t_azoth"],
    effects: { speed: 0.15, cap: 0.5, price: 0.2 },
    desc: "速度 +15%、仓储 +50%、售价 +20%。",
  },
  {
    id: "lapis_mind", name: "石之心", tier: 10, branch: "meta", time: 120,
    cost: { azoth: 4, alkahest: 8, astra: 14 }, requires: ["t_magnum"],
    effects: { research: 0.5, supply: 0.3, steady: 0.2 },
    desc: "研究速度 +50%、地脉 +30%、波动 -20%。",
  },
]

export const TECH_MAP: Record<string, Tech> = Object.fromEntries(TECHS.map((t) => [t.id, t]))
export const TECH_BRANCH_LABEL: Record<Tech["branch"], string> = {
  main: "主线 · 物质阶梯",
  ley: "地脉 · 供给与稳定",
  build: "建设 · 槽位与处理",
  trade: "商会 · 价格与研究",
  meta: "循环 · 为下一轮铺路",
}

// ────────────────────────────────────────────────────────────────────────────
// 天象
// ────────────────────────────────────────────────────────────────────────────

export const OMENS: Omen[] = [
  {
    id: "ignis_flood", name: "焰潮", tone: "mixed", weight: 3, minTechs: 0, dur: 45,
    desc: "火元素喷涌，水元素退去",
    supply: { ignis: 1.2, aqua: -0.45 },
  },
  {
    id: "aqua_tide", name: "潮汐上涨", tone: "mixed", weight: 3, minTechs: 0, dur: 50,
    desc: "水源丰沛，大地被淹没",
    supply: { aqua: 1.1, terra: -0.4 },
  },
  {
    id: "terra_still", name: "大地静默", tone: "mixed", weight: 3, minTechs: 0, dur: 50,
    desc: "土元素稳固，风元素停滞",
    supply: { terra: 1.0, aer: -0.5 },
  },
  {
    id: "aer_gale", name: "长风", tone: "mixed", weight: 3, minTechs: 0, dur: 45,
    desc: "狂风灌入熔炉，土元素被吹散",
    supply: { aer: 1.3, terra: -0.4 },
  },
  {
    id: "rain", name: "甘霖", tone: "good", weight: 2, minTechs: 1, dur: 55,
    desc: "水与盐的需求同步上升",
    supply: { aqua: 0.7 }, demand: { salt: 0.5, sulfur: 0.3 },
  },
  {
    id: "eclipse", name: "日蚀", tone: "mixed", weight: 2, minTechs: 2, dur: 45,
    desc: "火光黯淡，水银与黄金的需求暴涨",
    supply: { ignis: -0.5, aqua: 0.5 }, demand: { mercury: 0.7, gold: 0.6 },
  },
  {
    id: "drought", name: "大旱", tone: "bad", weight: 2, minTechs: 2, dur: 50,
    desc: "水脉枯竭，大地干裂",
    supply: { aqua: -0.65, terra: 0.6, ignis: 0.3 },
  },
  {
    id: "gold_rush", name: "黄金热", tone: "good", weight: 2, minTechs: 4, dur: 50,
    desc: "金价暴涨，银价跟涨",
    demand: { gold: 1.2, silver: 0.5 },
  },
  {
    id: "lead_glut", name: "铅市崩塌", tone: "bad", weight: 2, minTechs: 4, dur: 55,
    desc: "铅的副产物泛滥，价格腰斩",
    demand: { lead: -0.7, tin: -0.2 },
  },
  {
    id: "conjunction", name: "七星连珠", tone: "good", weight: 1, minTechs: 5, dur: 40,
    desc: "所有地脉同时高涨，所有商品同时抢手",
    supply: { aqua: 0.7, ignis: 0.7, terra: 0.7, aer: 0.7, aether: 0.5 },
    demand: { sulfur: 0.4, salt: 0.4, mercury: 0.4, lead: 0.4, tin: 0.4, iron: 0.4, copper: 0.4 },
  },
  {
    id: "void_rift", name: "虚空裂隙", tone: "good", weight: 2, minTechs: 8, dur: 45,
    desc: "以太涌入，虚之精华奇货可居",
    supply: { aether: 0.9, terra: -0.3 }, demand: { void: 0.8, astra: 0.4 },
  },
  {
    id: "starfall", name: "陨星", tone: "good", weight: 2, minTechs: 9, dur: 50,
    desc: "星尘落下，以太与星之精华需求飙升",
    supply: { aether: 0.5 }, demand: { astra: 0.9, aether: 0.4 },
  },
]

export const OMEN_MAP: Record<string, Omen> = Object.fromEntries(OMENS.map((o) => [o.id, o]))

// ────────────────────────────────────────────────────────────────────────────
// 元升级（用贤者之石购买，跨轮回保留）
// ────────────────────────────────────────────────────────────────────────────

export const META_UPGRADES: MetaUpgrade[] = [
  {
    id: "m_ley", name: "起始地脉", desc: "每级：所有元素地脉产出 +12%",
    max: 12, baseCost: 4, growth: 1.5, effect: { supply: 0.12 },
  },
  {
    id: "m_speed", name: "永恒流速", desc: "每级：全局炼金速度 +10%",
    max: 12, baseCost: 6, growth: 1.55, effect: { speed: 0.1 },
  },
  {
    id: "m_cap", name: "广阔仓库", desc: "每级：所有仓储上限 +30%",
    max: 12, baseCost: 3, growth: 1.45, effect: { cap: 0.3 },
  },
  {
    id: "m_price", name: "市场洞察", desc: "每级：售价 +10%",
    max: 10, baseCost: 5, growth: 1.5, effect: { price: 0.1 },
  },
  {
    id: "m_slots", name: "额外熔炉", desc: "每级：开局炼金槽位 +1",
    max: 3, baseCost: 20, growth: 2.2, effect: { slots: 1 },
  },
  {
    id: "m_research", name: "研究火花", desc: "每级：研究速度 +12%",
    max: 10, baseCost: 5, growth: 1.5, effect: { research: 0.12 },
  },
  {
    id: "m_forecast", name: "预知天象", desc: "每级：供给/需求波动 -10%，天象预告提前 6 秒",
    max: 5, baseCost: 8, growth: 1.8, effect: { steady: 0.1 },
  },
  {
    id: "m_work", name: "伟业铭刻", desc: "每级：伟业奖励的贤者之石 +35%",
    max: 8, baseCost: 10, growth: 1.7, effect: {},
  },
  {
    id: "m_slag", name: "净化精通", desc: "每级：废渣惩罚 -15%",
    max: 6, baseCost: 4, growth: 1.5, effect: { slag: 0.15 },
  },
]

export const META_MAP: Record<string, MetaUpgrade> = Object.fromEntries(
  META_UPGRADES.map((m) => [m.id, m]),
)

// ────────────────────────────────────────────────────────────────────────────
// 催化剂：金币的主要去处，让玩家在供给低谷/需求高峰时有事可做
// ────────────────────────────────────────────────────────────────────────────

export const CATALYSTS: Catalyst[] = [
  {
    id: "cat_ignis", name: "焰心之引", glyph: "火", cost: 55, dur: 45, minTechs: 0,
    desc: "45 秒内火元素供给 ×3（在波动之外额外加成）", supply: { ignis: 2.0 },
  },
  {
    id: "cat_aqua", name: "潮汐之引", glyph: "水", cost: 55, dur: 45, minTechs: 0,
    desc: "45 秒内水元素供给 ×3", supply: { aqua: 2.0 },
  },
  {
    id: "cat_terra", name: "磐石之引", glyph: "土", cost: 55, dur: 45, minTechs: 0,
    desc: "45 秒内土元素供给 ×3", supply: { terra: 2.0 },
  },
  {
    id: "cat_aer", name: "长风之引", glyph: "风", cost: 55, dur: 45, minTechs: 0,
    desc: "45 秒内风元素供给 ×3", supply: { aer: 2.0 },
  },
  {
    id: "cat_speed", name: "疾火之油", glyph: "速", cost: 130, dur: 30, minTechs: 2,
    desc: "30 秒内全局炼金速度 ×2", effects: { speed: 1.0 },
  },
  {
    id: "cat_insight", name: "灵感之尘", glyph: "悟", cost: 160, dur: 30, minTechs: 2,
    desc: "30 秒内研究速度 ×2.5", effects: { research: 1.5 },
  },
  {
    id: "cat_market", name: "行情先知", glyph: "价", cost: 190, dur: 60, minTechs: 3,
    desc: "60 秒内售价 +100%", effects: { price: 1.0 },
  },
  {
    id: "cat_purge", name: "净火", glyph: "净", cost: 90, dur: 0, minTechs: 0, purge: 60,
    desc: "立即清除 60 点废渣", 
  },
  {
    id: "cat_aether", name: "星界之引", glyph: "玄", cost: 260, dur: 40, minTechs: 6,
    desc: "40 秒内以太供给 ×3.5", supply: { aether: 2.5 },
  },
]

export const CATALYST_MAP: Record<string, Catalyst> = Object.fromEntries(
  CATALYSTS.map((c) => [c.id, c]),
)

// ────────────────────────────────────────────────────────────────────────────
// 伟业（每局重置，是重复获得贤者之石的主要来源之一）
// ────────────────────────────────────────────────────────────────────────────

export const MILESTONES: Milestone[] = [
  { id: "w_lead", name: "第一块铅", desc: "累计产出 1 铅", ps: 1, produced: { sub: "lead", amount: 1 } },
  { id: "w_tin", name: "锡的诞生", desc: "累计产出 1 锡", ps: 2, produced: { sub: "tin", amount: 1 } },
  { id: "w_iron", name: "铁的意志", desc: "累计产出 1 铁", ps: 3, produced: { sub: "iron", amount: 1 } },
  { id: "w_copper", name: "铜的脉络", desc: "累计产出 1 铜", ps: 3, produced: { sub: "copper", amount: 1 } },
  { id: "w_research5", name: "学徒出师", desc: "完成 5 项研究", ps: 5, techs: 5 },
  { id: "w_silver", name: "月光初现", desc: "累计产出 1 银", ps: 5, produced: { sub: "silver", amount: 1 } },
  { id: "w_aether", name: "触到第五元素", desc: "累计产出 1 以太", ps: 6, produced: { sub: "aether", amount: 1 } },
  { id: "w_gold", name: "黄金之手", desc: "累计产出 1 金", ps: 8, produced: { sub: "gold", amount: 1 } },
  { id: "w_anima", name: "生命之火", desc: "累计产出 1 生之精华", ps: 10, produced: { sub: "anima", amount: 1 } },
  { id: "w_astra", name: "凝住星光", desc: "累计产出 1 星之精华", ps: 10, produced: { sub: "astra", amount: 1 } },
  { id: "w_void", name: "凝视深渊", desc: "累计产出 1 虚之精华", ps: 10, produced: { sub: "void", amount: 1 } },
  { id: "w_trade", name: "商会常客", desc: "本局累计成交 2000 金币", ps: 8, goldEarned: 2000 },
  { id: "w_alkahest", name: "溶解一切", desc: "累计产出 1 万能溶剂", ps: 15, produced: { sub: "alkahest", amount: 1 } },
  { id: "w_research14", name: "学者", desc: "完成 14 项研究", ps: 14, techs: 14 },
  { id: "w_azoth", name: "万应灵药", desc: "累计产出 1 万应灵药", ps: 25, produced: { sub: "azoth", amount: 1 } },
  { id: "w_stone", name: "贤者之石", desc: "本局首次获得贤者之石", ps: 30, psEarned: 1 },
  { id: "w_gold200", name: "遍地黄金", desc: "累计产出 200 金", ps: 12, produced: { sub: "gold", amount: 200 } },
]
