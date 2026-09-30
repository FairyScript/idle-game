/** 存档：localStorage 序列化 / 反序列化 / 离线进度结算。 */
import { CATALYST_MAP, META_MAP, RECIPE_MAP, SUBSTANCES, TECH_MAP, MILESTONES } from "./content"
import { createMeta, createRun, derive, step, syncSlots, OFFLINE_CAP_SECONDS, SAVE_VERSION } from "./engine"
import type { GameState, MetaState } from "./types"

export const SAVE_KEY = "magnum-opus-idle/save/v1"

export interface SaveBlob {
  v: number
  savedAt: number
  meta: MetaState
  state: GameState
}

export function hasStorage(): boolean {
  try {
    return typeof localStorage !== "undefined"
  } catch {
    return false
  }
}

export function writeSave(meta: MetaState, S: GameState): boolean {
  if (!hasStorage()) return false
  try {
    const blob: SaveBlob = { v: SAVE_VERSION, savedAt: Date.now(), meta, state: S }
    localStorage.setItem(SAVE_KEY, JSON.stringify(blob))
    return true
  } catch {
    return false
  }
}

export function readSave(): SaveBlob | null {
  if (!hasStorage()) return null
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SaveBlob
    if (!parsed || typeof parsed !== "object" || !parsed.state) return null
    return parsed
  } catch {
    return null
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch {
    /* ignore */
  }
}

type AnyRecord = Record<string, any>

/** 把任意（可能是旧版本 / 被裁剪的）存档修成当前结构完整的 GameState。 */
export function reviveRun(raw: AnyRecord, meta: MetaState): GameState {
  const hasRaw = !!raw && typeof raw === "object"
  const S = createRun(meta, hasRaw ? numOr(raw.world, 0) : 0)
  if (!hasRaw) return S

  if (typeof raw.t === "number") S.t = raw.t
  if (typeof raw.gold === "number") S.gold = raw.gold
  if (typeof raw.goldEarned === "number") S.goldEarned = raw.goldEarned
  if (typeof raw.runPs === "number") S.runPs = raw.runPs
  if (typeof raw.rngState === "number") S.rngState = raw.rngState
  if (typeof raw.logSeq === "number") S.logSeq = raw.logSeq
  if (typeof raw.autoResearch === "boolean") S.autoResearch = raw.autoResearch
  if (typeof raw.autoSell === "boolean") S.autoSell = raw.autoSell
  S.lastTick = Date.now()

  copyNumericRecord(S.stock, raw.stock)
  copyNumericRecord(S.produced, raw.produced)
  copyNumericRecord(S.net, raw.net)
  copyNumericRecord(S.supply, raw.supply)
  copyNumericRecord(S.leyLv, raw.leyLv)
  // 催化剂计时用催化剂 id 作为键，不能套用物质白名单
  if (raw.buffTimes && typeof raw.buffTimes === "object") {
    for (const [k, v] of Object.entries(raw.buffTimes as Record<string, unknown>)) {
      if (!CATALYST_MAP[k]) continue
      if (typeof v === "number" && Number.isFinite(v) && v > 0) S.buffTimes[k] = v
    }
  }

  // 配方 / 科技 / 伟业：只接受当前内容表里存在的 id
  S.recipes = {} as GameState["recipes"]
  for (const id of Object.keys(raw.recipes ?? {})) if (RECIPE_MAP[id]) S.recipes[id] = true
  S.techs = {}
  for (const id of Object.keys(raw.techs ?? {})) if (TECH_MAP[id]) S.techs[id] = true
  S.milestones = {}
  const validMilestones = new Set(MILESTONES.map((m) => m.id))
  for (const id of Object.keys(raw.milestones ?? {})) if (validMilestones.has(id)) S.milestones[id] = true

  const rp: Record<string, number> = {}
  for (const id of Object.keys(raw.research?.progress ?? {})) {
    if (TECH_MAP[id] && !S.techs[id]) rp[id] = Math.min(1, Number(raw.research.progress[id]) || 0)
  }
  S.research = {
    active: raw.research?.active && TECH_MAP[raw.research.active] && !S.techs[raw.research.active]
      ? raw.research.active
      : null,
    progress: rp,
  }

  if (raw.omens && typeof raw.omens === "object") {
    S.omens = {
      current: raw.omens.current ?? null,
      next: raw.omens.next ?? null,
    }
  }

  if (Array.isArray(raw.slots)) {
    // 先清空到 0，再按存档顺序填，最后 syncSlots 按派生结果补齐/裁剪
    const saved = raw.slots
    S.slots = []
    for (const s of saved) {
      const recipe = s?.recipe && RECIPE_MAP[s.recipe] && S.recipes[s.recipe] ? s.recipe : null
      S.slots.push({
        recipe,
        paused: !!s?.paused,
        phase: numOr(s?.phase, 0),
        status: "running",
        ratio: 1,
        ratioShown: 1,
        bottleneck: null,
        clog: null,
      })
    }
  }

  if (Array.isArray(raw.log)) S.log = raw.log.slice(0, 60)

  syncSlots(S, meta)
  derive(S, meta)
  return S
}

function numOr(v: unknown, d: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : d
}

function copyNumericRecord(target: Record<string, number>, src: unknown) {
  if (!src || typeof src !== "object") return
  const allowed = new Set(SUBSTANCES.map((s) => s.id))
  for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
    if (!allowed.has(k)) continue
    if (typeof v === "number" && Number.isFinite(v)) target[k] = v
  }
}

export interface OfflineReport {
  seconds: number
  capped: boolean
  goldEarned: number
  psEarned: number
  techsDone: number
  milestones: string[]
  logLines: number
}

/**
 * 结算离线进度。为了不让挂机玩家被自己的溢出惩罚，离线期间不产生废渣
 * （只浪费产出），这样"睡觉"不会被惩罚，而在线时的溢出依然有代价。
 */
export function runOffline(S: GameState, meta: MetaState, elapsedSeconds: number): OfflineReport {
  const capped = elapsedSeconds > OFFLINE_CAP_SECONDS
  const total = Math.max(0, Math.min(elapsedSeconds, OFFLINE_CAP_SECONDS))
  const before = {
    gold: S.gold,
    runPs: S.runPs,
    techs: Object.keys(S.techs).length,
    milestones: new Set(Object.keys(S.milestones)),
    log: S.log.length,
  }
  const DT = 0.5
  const steps = Math.floor(total / DT)
  for (let i = 0; i < steps; i++) step(S, meta, DT, true)
  const rest = total - steps * DT
  if (rest > 0) step(S, meta, rest, true)

  const gained: string[] = []
  for (const id of Object.keys(S.milestones)) {
    if (!before.milestones.has(id)) gained.push(id)
  }
  return {
    seconds: total,
    capped,
    goldEarned: S.gold - before.gold,
    psEarned: S.runPs - before.runPs,
    techsDone: Object.keys(S.techs).length - before.techs,
    milestones: gained,
    logLines: S.log.length - before.log,
  }
}

/** 反序列化 meta（补齐新增字段） */
export function reviveMeta(raw: AnyRecord | undefined): MetaState {
  const meta = createMeta()
  if (!raw || typeof raw !== "object") return meta
  meta.ps = numOr(raw.ps, 0)
  meta.seals = numOr(raw.seals, 0)
  meta.rebirths = numOr(raw.rebirths, 0)
  meta.totalPsEarned = numOr(raw.totalPsEarned, 0)
  meta.bestRunPs = numOr(raw.bestRunPs, 0)
  meta.runs = numOr(raw.runs, 0)
  meta.upgrades = {}
  for (const [k, v] of Object.entries(raw.upgrades ?? {})) {
    const up = META_MAP[k]
    if (!up) continue
    meta.upgrades[k] = Math.max(0, Math.min(up.max, Math.floor(Number(v) || 0)))
  }
  return meta
}
