/** 全局类型定义：物质、配方、科技、天象、元升级、游戏状态。 */

export type SubId = string
export type RecipeId = string
export type TechId = string

/** 物质分类，仅用于 UI 分组与配色。 */
export type SubKind = "element" | "material" | "metal" | "essence" | "high" | "waste" | "meta"

export interface Substance {
  id: SubId
  /** 中文名 */
  name: string
  /** 拉丁/英文别名，营造炼金术氛围 */
  latin: string
  /** 单字符符号，用于紧凑 UI */
  glyph: string
  kind: SubKind
  tier: number
  color: string
  /** 基础仓储上限 */
  cap: number
  /** 元素：基础地脉产出（单位/秒）。非元素为 undefined。 */
  supply?: number
  /** 供给/需求波动周期（秒） */
  period?: number
  /** 波动相位偏移 */
  phase?: number
  /** 基础售价（金币/单位）。undefined 表示不可出售。 */
  price?: number
  /** 基础购入价（元素可从市场买入） */
  buyPrice?: number
  desc: string
}

export interface Recipe {
  id: RecipeId
  name: string
  tier: number
  /** 一个完整周期的秒数（速度 1.0 时） */
  time: number
  inputs: Record<SubId, number>
  /** 主产物 */
  outputs: Record<SubId, number>
  /** 副产物：与主产物同样产出，但不受玩家"想要"控制，是配平压力的来源 */
  byproducts?: Record<SubId, number>
  desc: string
}

export interface Effects {
  /** 元素地脉产出 +x */
  supply: number
  /** 全局炼金速度 +x */
  speed: number
  /** 仓储上限 +x */
  cap: number
  /** 售价 +x */
  price: number
  /** 研究速度 +x */
  research: number
  /** 额外熔炉槽位 +n */
  slots: number
  /** 废渣惩罚减免 +x */
  slag: number
  /** 需求波动幅度 -x（对买入价无影响） */
  steady: number
}

export const ZERO_EFFECTS: Effects = {
  supply: 0,
  speed: 0,
  cap: 0,
  price: 0,
  research: 0,
  slots: 0,
  slag: 0,
  steady: 0,
}

export interface Tech {
  id: TechId
  name: string
  /** 树层级，用于 UI 分栏 */
  tier: number
  branch: "main" | "ley" | "build" | "trade" | "meta"
  /** 研究所需时间（速度 1.0） */
  time: number
  /** 研究期间持续消耗的物质总量 */
  cost: Record<SubId, number>
  desc: string
  /** 前置科技 */
  requires?: TechId[]
  unlockRecipes?: RecipeId[]
  effects?: Partial<Effects>
}

export interface Omen {
  id: string
  name: string
  desc: string
  dur: number
  /** 供给乘数增量（加法，1.0 基准） */
  supply?: Record<SubId, number>
  /** 需求乘数增量（加法） */
  demand?: Record<SubId, number>
  weight: number
  /** 出现所需的最低科技数 */
  minTechs: number
  tone: "good" | "bad" | "mixed"
}

export interface MetaUpgrade {
  id: string
  name: string
  desc: string
  max: number
  baseCost: number
  growth: number
  effect: Partial<Effects>
}

export interface Milestone {
  id: string
  name: string
  desc: string
  ps: number
  /** 判定：累计产出某物质达到阈值 */
  produced?: { sub: SubId; amount: number }
  /** 判定：完成科技数 */
  techs?: number
  /** 判定：本局累计售出金币 */
  goldEarned?: number
  /** 判定：本局累计获得贤者之石 */
  psEarned?: number
}

/** 催化剂：花金币买一段时间的增益，用来对抗供给落差或需求窗口。 */
export interface Catalyst {
  id: string
  name: string
  desc: string
  cost: number
  /** 持续秒数；0 表示立即生效 */
  dur: number
  /** 直接加到供给乘数上 */
  supply?: Record<SubId, number>
  effects?: Partial<Effects>
  /** 立即清除的废渣量 */
  purge?: number
  glyph: string
  /** 需求达到的科技数才可购买 */
  minTechs: number
}

export type SlotStatus = "empty" | "running" | "starved" | "throttled" | "clogged" | "paused"

export interface Slot {
  recipe: RecipeId | null
  paused: boolean
  /** 当前周期进度 0..1 */
  phase: number
  status: SlotStatus
  /** 本 tick 的实际效率 0..1 */
  ratio: number
  /** 平滑后的效率（仅用于显示，避免数字每 tick 抖动） */
  ratioShown: number
  /** 限制效率的输入物质 */
  bottleneck: SubId | null
  /** 因仓储满而溢出的产物 */
  clog: SubId | null
}

export interface ResearchState {
  active: TechId | null
  /** 每个科技的累计进度（0..1） */
  progress: Record<TechId, number>
}

export interface LogEntry {
  id: number
  t: number
  text: string
  tone: "info" | "good" | "bad"
}

export interface MetaState {
  ps: number
  upgrades: Record<string, number>
  seals: number
  rebirths: number
  totalPsEarned: number
  /** 历史最佳本局 PS 收入 */
  bestRunPs: number
  runs: number
}

export interface GameState {
  /** 本局时间（秒） */
  t: number
  /** 世界时间戳（用于波动函数在轮回后仍连续） */
  world: number

  stock: Record<SubId, number>
  /** 本局累计产出，用于伟业 */
  produced: Record<SubId, number>
  /** 本 tick 的净流量（单位/秒），用于配平面板 */
  net: Record<SubId, number>
  /** 元素当前地脉产出（单位/秒） */
  supply: Record<SubId, number>
  /** 元素供给乘数 */
  supplyMul: Record<SubId, number>
  /** 商品需求乘数 */
  demandMul: Record<SubId, number>
  /** 元素购入单价 */
  buyCost: Record<SubId, number>

  slots: Slot[]
  /** 已解锁配方 */
  recipes: Record<RecipeId, true>
  /** 已完成科技 */
  techs: Record<TechId, true>
  research: ResearchState

  gold: number
  goldEarned: number
  /** 本局获得的贤者之石 */
  runPs: number

  /** 元素地脉的金币强化等级 */
  leyLv: Record<SubId, number>

  /** 催化剂剩余时间（秒） */
  buffTimes: Record<string, number>
  omens: {
    current: { id: string; startAt: number; endAt: number } | null
    next: { id: string; at: number } | null
  }
  /** 天象调度用的伪随机种子 */
  rngState: number

  milestones: Record<string, true>
  log: LogEntry[]
  logSeq: number

  /** 自动开始下一项研究 */
  autoResearch: boolean
  /** 自动出售快满仓的商品（需先研究「商会代理」） */
  autoSell: boolean
  /** 本局累计模拟的离线时间（秒） */
  lastTick: number
}
