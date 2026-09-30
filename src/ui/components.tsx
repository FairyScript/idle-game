/** @jsxImportSource @kikojs/dom */
/** 共享小组件：进度条、物质标签、配方输入输出、状态点。 */
import { computed } from "@kikojs/signal"
import type { Signal } from "signal-polyfill"
import { PS_ID, RECIPE_MAP, SUB_MAP, TECH_MAP } from "../sim/content"
import type { RecipeId, SlotStatus, SubId } from "../sim/types"

export type State<T> = Signal.State<T>

/** 允许把常量或信号塞进样式类名 */
type Maybe<T> = T | Signal.State<T> | Signal.Computed<T>

function resolve<T>(v: Maybe<T> | undefined): T | undefined {
  if (v === undefined || v === null) return undefined
  if (typeof v === "object" && typeof (v as Signal.State<T>).get === "function") {
    return (v as Signal.State<T>).get()
  }
  return v as T
}

export function Bar(props: {
  v: Maybe<number>
  tone?: Maybe<string>
  tall?: boolean
  slim?: boolean
}) {
  const pct = computed(() => `${(Math.max(0, Math.min(1, resolve(props.v) ?? 0)) * 100).toFixed(1)}%`)
  const cls = computed(() => {
    const tone = resolve(props.tone)
    return `al-bar${tone ? " " + tone : ""}${props.tall ? " tall" : ""}${props.slim ? " slim" : ""}`
  })
  return (
    <div class={cls}>
      <i style={pct} />
    </div>
  )
}

export function Glyph(props: { sub: SubId; size?: string }) {
  const s = SUB_MAP[props.sub]
  if (!s) return <span />
  return (
    <span class="al-glyph" style={`background:${s.color}`}>
      {s.glyph}
    </span>
  )
}

export function SubName(props: { sub: SubId }) {
  const s = SUB_MAP[props.sub]
  if (!s) return <span />
  return (
    <div class="al-name">
      <Glyph sub={props.sub} />
      <span class="al-t">
        <b>{s.name}</b>
        <i>{s.latin}</i>
      </span>
    </div>
  )
}

export function Chip(props: { tone?: Maybe<string>; children?: unknown }) {
  const cls = computed(() => {
    const tone = resolve(props.tone)
    return `al-chip${tone ? " " + tone : ""}`
  })
  return <span class={cls}>{props.children}</span>
}

const nameOf = (id: SubId): string => (id === PS_ID ? "贤者之石" : (SUB_MAP[id]?.name ?? id))

/** 配方的消耗 → 产出（含副产物，副产物用青色标出） */
export function RecipeIO(props: { id: RecipeId; time?: boolean }) {
  const r = RECIPE_MAP[props.id]
  if (!r) return <div class="al-io" />
  const ins = Object.entries(r.inputs).map(([k, n]) => `−${round(n)}${nameOf(k)} `)
  const outs = Object.entries(r.outputs).map(([k, n]) => `+${round(n)}${nameOf(k)} `)
  const byp = Object.entries(r.byproducts ?? {}).map(([k, n]) => `副+${round(n)}${nameOf(k)} `)
  return (
    <div class="al-io">
      {props.time === false ? null : <span class="k">{`${r.time}s `}</span>}
      {ins.map((t) => (
        <span class="c">{t}</span>
      ))}
      <span class="k">→ </span>
      {outs.map((t) => (
        <span class="p">{t}</span>
      ))}
      {byp.map((t) => (
        <span class="b">{t}</span>
      ))}
    </div>
  )
}

function round(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100)
}

const STATUS_META: Record<SlotStatus, { dot: string; label: string; chip: string }> = {
  empty: { dot: "", label: "空闲", chip: "" },
  running: { dot: "on", label: "运转中", chip: "good" },
  throttled: { dot: "warn", label: "供给不足", chip: "warn" },
  starved: { dot: "bad", label: "断料停机", chip: "bad" },
  clogged: { dot: "warn", label: "产物壅塞", chip: "warn" },
  paused: { dot: "pause", label: "已暂停", chip: "" },
}

export function StatusChip(props: { status: State<SlotStatus> }) {
  const cls = computed(() => STATUS_META[props.status.get()]?.chip ?? "")
  const label = computed(() => STATUS_META[props.status.get()]?.label ?? "")
  return (
    <span class={computed(() => `al-chip${cls.get() ? " " + cls.get() : ""}`)}>
      <span class={computed(() => `al-dot ${STATUS_META[props.status.get()]?.dot ?? ""}`)} />
      {label}
    </span>
  )
}

/** 科技成本列表，"够/不够"实时着色 */
export function TechCosts(props: { techId: string; have: (s: SubId) => State<number> }) {
  const tech = TECH_MAP[props.techId]
  if (!tech) return <div />
  const items = Object.entries(tech.cost)
  return (
    <div class="al-costs">
      {items.map(([k, v]) => {
        const h = props.have(k)
        const enough = computed(() => h.get() >= v)
        const label = computed(() => `${round(v)} ${nameOf(k)}`)
        return (
          <span class={computed(() => `al-cost${enough.get() ? " ok" : " no"}`)}>
            <em>{label}</em>
          </span>
        )
      })}
    </div>
  )
}
