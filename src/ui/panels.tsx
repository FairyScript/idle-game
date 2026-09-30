/** @jsxImportSource @kikojs/dom */
/** 各个页签面板。全部使用"静态结构 + 信号绑定"，DOM 只建一次。 */
import { computed, untrack } from "@kikojs/signal"
import {
  CATALYSTS,
  ELEMENT_IDS,
  MILESTONES,
  META_UPGRADES,
  OMEN_MAP,
  PS_ID,
  RECIPES,
  SUBSTANCES,
  SUB_MAP,
  TECHS,
  TECH_BRANCH_LABEL,
  TECH_MAP,
} from "../sim/content"
import { REBIRTH_REQUIREMENT } from "../sim/engine"
import { fmt, fmtClock, fmtPct, fmtRate, fmtTime, fmtX } from "../sim/format"
import type { RecipeId, SubId, TechId } from "../sim/types"
import type { View } from "./view"
import { Bar, Chip, Glyph, RecipeIO, StatusChip, SubName, TechCosts } from "./components"
import { For, Show } from "@kikojs/dom"

export interface Actions {
  setRecipe(i: number, r: RecipeId | null): void
  togglePause(i: number): void
  openPicker(i: number | null): void
  sell(sub: SubId, amount: number | "all"): void
  buy(sub: SubId, amount: number | "all"): void
  ley(sub: SubId): void
  catalyst(id: string): void
  research(id: TechId): void
  stopResearch(): void
  buyMeta(id: string): void
  rebirth(): void
  hardReset(): void
  toggleAutoResearch(): void
  toggleAutoSell(): void
  setTab(t: string): void
  confirmHardReset(b: boolean): void
  setShowOffline(b: boolean): void
}

/**
 * 组件统一入参。kiko 的组件契约是"单个 props 对象"：HMR 重挂载实例时注册表
 * 用 `impl(inst.props)` 重放，多位置参数只会保住第一个（`SlotCard(v, a, i)`
 * 会被重放成 `SlotCard(v)`，`a`/`i` 变 undefined，整棵子树直接抛错并退化成
 * 整页刷新）。所以所有组件都收一个对象，开发时改代码才能安全热替换。
 */
export interface Ctx {
  v: View
  a: Actions
}

const nameOf = (id: SubId) => (id === PS_ID ? "贤者之石" : (SUB_MAP[id]?.name ?? id))

const STORABLE = SUBSTANCES.filter((s) => s.kind !== "element" && s.kind !== "meta")

// ════════════════════════════════════════════════════════════════════════
// 顶栏 / 天象 / 页签
// ════════════════════════════════════════════════════════════════════════

export function Header({ v, a }: Ctx) {
  const savedText = computed(() => {
    v.runTime.get()
    const s = v.savedAt.get()
    if (!s) return "尚未存档"
    const d = Math.max(0, (Date.now() - s) / 1000)
    return d < 3 ? "已保存" : `${Math.floor(d)}s 前已保存`
  })
  const rebirthLabel = computed(() => {
    if (!v.canRebirth.get()) return `轮回需 ${REBIRTH_REQUIREMENT} 石`
    return `轮回 +${v.sealsGain.get()} 印`
  })
  return (
    <header class="al-top">
      <div class="al-brand">
        <b>贤者之途</b>
        <span>Magnum Opus</span>
      </div>
      <div class="al-res ps" title="贤者之石：局外成长代币，跨轮回保留">
        <i>贤者之石</i>
        <b>{computed(() => fmt(v.ps.get(), 1))}</b>
      </div>
      <div class="al-res gold" title="金币：买元素、强化地脉、买催化剂">
        <i>金币</i>
        <b>{computed(() => fmt(v.gold.get(), 1))}</b>
      </div>
      <div class="al-res" title="本局累计获得的贤者之石">
        <i>本局</i>
        <b>{computed(() => fmt(v.runPs.get(), 1))}</b>
      </div>
      <div class="al-res" title="全局炼金速度倍率">
        <i>速度</i>
        <b>{computed(() => fmtX(v.speed.get()))}</b>
      </div>
      <div class="al-res" title="元素地脉产出倍率">
        <i>地脉</i>
        <b>{computed(() => fmtX(v.supplyBonus.get()))}</b>
      </div>
      <div class="al-res" title="仓储上限倍率">
        <i>仓储</i>
        <b>{computed(() => fmtX(v.capBonus.get()))}</b>
      </div>
      <div class="al-res" title="废渣会拖慢地脉产出">
        <i>废渣</i>
        <b>{computed(() => fmt(v.slag.get(), 0))}</b>
        <i>{computed(() => `×${v.slagPenalty.get().toFixed(2)}`)}</i>
      </div>
      <div class="al-spacer" />
      <span class="al-mini">{savedText}</span>
      <button class="al-btn ghost" onClick={() => a.confirmHardReset(true)} title="清空所有进度（含元升级）">
        重置存档
      </button>
      <button
        class="al-btn rose"
        disabled={computed(() => !v.canRebirth.get())}
        title="重置本局，换取永久的贤者之印"
        onClick={() => a.rebirth()}
      >
        {rebirthLabel}
      </button>
    </header>
  )
}

export function OmenBar({ v }: { v: View }) {
  const cur = computed(() => (v.omenId.get() ? (OMEN_MAP[v.omenId.get()!] ?? null) : null))
  const nxt = computed(() => (v.nextOmenId.get() ? (OMEN_MAP[v.nextOmenId.get()!] ?? null) : null))
  const frac = computed(() => {
    const total = v.omenTotal.get()
    return total > 0 ? Math.max(0, Math.min(1, v.omenLeft.get() / total)) : 0
  })
  // 预告窗口随"预知天象"元升级变长（用离散开关，避免每 tick 重建预告节点）
  const showNext = computed(() => {
    if (!v.forecastVisible.get()) return null
    return nxt.get()
  })
  return (
    <div class={computed(() => `al-omen ${cur.get()?.tone ?? ""}`)}>
      <span class="al-tag">天象</span>
      {computed(() => {
        const c = cur.get()
        if (!c) return <span class="al-tag">平静 · 地脉按各自固有的潮汐起伏</span>
        return (
          <span>
            <b>{c.name}</b>
            <span> · {c.desc}</span>
          </span>
        )
      })}
      <span style="width:110px" class="al-omenbar">
        <Bar v={frac} tone={computed(() => (cur.get()?.tone === "bad" ? "bad" : "good"))} />
      </span>
      <span class="al-mini">{computed(() => (cur.get() ? fmtClock(v.omenLeft.get()) : ""))}</span>
      <div class="al-spacer" />
      {computed(() => {
        const n = showNext.get()
        if (!n) return null
        return untrack(() => (
          <span class="al-mini">
            预告：<b>{n.name}</b>
            <span> — {n.desc}</span>
            <span>
              （<span>{computed(() => fmtClock(v.nextIn.get()))}</span> 后）
            </span>
          </span>
        ))
      })}
    </div>
  )
}

const TABS: { id: string; label: string }[] = [
  { id: "workshop", label: "⚗ 工坊" },
  { id: "matter", label: "🧪 物质与配平" },
  { id: "recipes", label: "📜 配方图鉴" },
  { id: "tech", label: "🔬 研究" },
  { id: "market", label: "💰 市场" },
  { id: "eternal", label: "♾ 永恒" },
  { id: "help", label: "❓ 玩法" },
]

export function Tabs({ v, a }: Ctx) {
  return (
    <nav class="al-tabs">
      {TABS.map((t) => (
        <button class={computed(() => `al-tab${v.tab.get() === t.id ? " on" : ""}`)} onClick={() => a.setTab(t.id)}>
          {t.label}
        </button>
      ))}
    </nav>
  )
}

// ════════════════════════════════════════════════════════════════════════
// 工坊
// ════════════════════════════════════════════════════════════════════════

function SlotCard({ v, a, i }: Ctx & { i: number }) {
  const sv = v.slots[i]!
  const recipe = computed(() => {
    const id = sv.recipe.get()
    return id ? (RECIPES.find((r) => r.id === id) ?? null) : null
  })
  const open = computed(() => v.picker.get() === i)
  const pauseLabel = computed(() => (sv.status.get() === "paused" ? "继续" : "暂停"))
  return (
    <div
      class={computed(() => `al-slot${sv.recipe.get() ? " on" : " empty"}`)}
    >
      <div class="al-sh">
        <span class="al-mini" style="width:16px">
          {String(i + 1)}
        </span>
        <b>{computed(() => recipe.get()?.name ?? "空槽位")}</b>
        <StatusChip status={sv.status} />
      </div>

      {computed(() => {
        const r = recipe.get()
        return r ? <RecipeIO id={r.id} /> : <div class="al-note">选择配方后开始生产。</div>
      })}

      {/* 只在"换了配方"时重建这一行：内层绑定必须 untrack，否则它们会变成外层依赖，
          导致整行（含文字节点）随每一个信号变化被拆掉重建 —— 也就是肉眼看到的闪烁。 */}
      {computed(() => {
        const r = recipe.get()
        if (!r) return null
        return untrack(() => (
          <div class="al-io" style="color:var(--dim2)">
            <span class="k">速率 </span>
            <span>{computed(() => `${(v.speed.get() / r.time).toFixed(2)} 次/秒`)}</span>
            <span>{computed(() => (sv.throttled.get() ? ` × ${Math.round(sv.ratioShown.get() * 20) * 5}%` : ""))}</span>
          </div>
        ))
      })}

      {computed(() => {
        if (!sv.recipe.get()) return null
        return untrack(() => <Bar v={sv.phase} tall tone={computed(() => (sv.throttled.get() ? "warn" : ""))} />)
      })}

      <div class="al-flow">
        {computed(() => {
          const st = sv.status.get()
          if (st !== "starved" && st !== "throttled") return null
          return <Chip tone="bad">{`缺 ${nameOf(sv.bottleneck.get() ?? "")}`}</Chip>
        })}
        {computed(() => (sv.clog.get() ? <Chip tone="warn">{`壅塞 ${nameOf(sv.clog.get()!)}`}</Chip> : null))}
        {computed(() =>
          sv.status.get() === "running" && !sv.throttled.get() ? <Chip tone="good">满速</Chip> : null,
        )}
      </div>

      <div class="al-foot">
        <button class="al-btn sm" onClick={() => a.openPicker(open.get() ? null : i)}>
          {computed(() => (open.get() ? "收起" : "选择配方"))}
        </button>
        <button class="al-btn sm ghost" disabled={computed(() => !sv.recipe.get())} onClick={() => a.togglePause(i)}>
          {pauseLabel}
        </button>
        <button class="al-btn sm ghost" disabled={computed(() => !sv.recipe.get())} onClick={() => a.setRecipe(i, null)}>
          清空
        </button>
      </div>

      {computed(() => {
        if (!open.get()) return null
        return untrack(() => (
          <div class="al-picker">
            {RECIPES.map((r) => (
              <button
                class="al-rec"
                disabled={computed(() => !v.recipes[r.id]!.unlocked.get())}
                onClick={() => {
                  a.setRecipe(i, r.id)
                  a.openPicker(null)
                }}
              >
                <b>{computed(() => (v.recipes[r.id]!.unlocked.get() ? r.name : "??? 未解锁"))}</b>
                <RecipeIO id={r.id} />
              </button>
            ))}
          </div>
        ))
      })}
    </div>
  )
}

/** "可研究"列表的一行；由 keyed `For` 复用，科技 id 就是 key。 */
function ResearchRow({ v, a, id }: Ctx & { id: TechId }) {
  const t = TECH_MAP[id]!
  return (
    <div style="display:flex;align-items:center;gap:8px">
      <span class="al-chip teal" style="flex:0 0 auto">
        T{t.tier}
      </span>
      <b style="font-size:12px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
        {t.name}
      </b>
      <span class="al-mini" style="flex:0 0 auto">
        {fmtTime(t.time)}
      </span>
      <button
        class="al-btn sm primary"
        disabled={computed(() => v.activeTech.get() === id)}
        onClick={() => a.research(id)}
      >
        研究
      </button>
    </div>
  )
}

function ResearchCard({ v, a }: Ctx) {
  const activeTech = computed(() => (v.activeTech.get() ? (TECH_MAP[v.activeTech.get()!] ?? null) : null))
  return (
    <section class="al-card">
      <header>
        <h3>研究</h3>
        <span class="al-spacer" />
        <span class="al-hint">研究期间持续消耗底物</span>
      </header>
      <div class="al-body">
        {computed(() => {
          const t = activeTech.get() // 只有"换了一项研究"才重建
          if (!t) return null
          const p = computed(() => v.techs[t.id]!.progress.get())
          return untrack(() => (
            <div style="padding-bottom:8px">
              <div class="al-sh">
                <b style="flex:1;font-size:12.5px">{t.name}</b>
                <span class="al-mini">{computed(() => `${Math.round((p.get() * 100) / 1)}%`)}</span>
                <button class="al-btn sm ghost" onClick={() => a.stopResearch()}>
                  中止
                </button>
              </div>
              <div style="margin:7px 0">
                <Bar v={p} tone="gold" tall />
              </div>
              <TechCosts techId={t.id} have={(s) => v.subs[s]!.stock} />
              <p class="al-note" style="margin-top:6px">
                {t.desc}
              </p>
            </div>
          ))
        })}
        {computed(() => (activeTech.get() ? null : <div class="al-note">未在进行研究。</div>))}

        <div class="al-hr" />
        <div class="al-note" style="margin-bottom:6px">
          可研究：
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          {/* 用 keyed For：可研究集合变化时只增删变动的行；存活的行保持同一批
              DOM 节点（不重建 → 不丢 hover/focus，也不产生视觉跳动）。 */}
          <For each={v.researchSuggest} getKey={(id) => id}>
            {(id) => <ResearchRow v={v} a={a} id={id()} />}
          </For>
          {computed(() =>
            v.researchSuggest.get().length === 0 ? (
              <div class="al-note">暂无可研究项目：先完成前置研究，或提高产出。</div>
            ) : null,
          )}
        </div>
        <label style="display:flex;align-items:center;gap:6px;margin-top:10px;font-size:11.5px;color:var(--dim);cursor:pointer">
          <input type="checkbox" checked={computed(() => v.autoResearch.get())} onChange={() => a.toggleAutoResearch()} />
          自动开始下一项研究
        </label>
      </div>
    </section>
  )
}

export function WorkshopPanel({ v, a }: Ctx) {
  return (
    <div class="al-grid c2">
      <section class="al-card">
        <header>
          <h3>炼金釜</h3>
          <span class="al-hint">{computed(() => `${v.slotCount.get()} 座熔炉`)}</span>
        </header>
        <div class="al-body">
          {computed(() => {
            if (v.techCount.get() > 0) {
              return (
                <div class="al-warnbox" style="margin-bottom:10px">
                  元素供给每时每刻都在起伏，产物需求也在波动。盯着"缺料 / 壅塞"换配方，比一直挂同一套更划算。
                  研究卡住的真正原因，几乎总是某一种中间产物没人生产。
                </div>
              )
            }
            if (v.activeTech.get()) {
              return (
                <div class="al-warnbox" style="margin-bottom:10px">
                  第一项研究已经开始了。研究条走得慢 = 底物供不上：去「物质与配平」看谁在掉，
                  然后在熔炉里多加一座生产它的炉子。
                </div>
              )
            }
            return (
              <div class="al-warnbox" style="margin-bottom:10px">
                <b>第一步</b>：在右侧「研究」里开始《金属引论》。它要硫磺 6 + 盐 6 ——
                煅烧出硫磺、溶解出盐，让这两座炉子先跑起来（必要时再加一座）。
              </div>
            )
          })}
          <div class="al-slots">
            {v.slots.map((_, i) => (
              <Show when={v.slots[i]!.visible}>
                <SlotCard v={v} a={a} i={i} />
              </Show>
            ))}
          </div>
        </div>
      </section>
      <div class="al-grid" style="gap:12px">
        <ResearchCard v={v} a={a} />
        <section class="al-card">
          <header>
            <h3>编年史</h3>
          </header>
          <ChronicleLog v={v} />
        </section>
      </div>
    </div>
  )
}

/**
 * 编年史。
 *
 * 列表结构用 keyed `For` 做增量插入（新事件只建一行，旧行复用节点），
 * 这里再补上"刷新时不打扰读者"的滚动行为：
 *
 * - `overflow-anchor: none` 关掉浏览器自带的滚动锚定（`.al-log` 是 flex 容器，
 *   实测 Chrome 在这里并不锚定），改由我们统一接管，跨浏览器行为一致；
 * - 以"视口顶部那一行"为锚：刷新后把它放回原来的位置，正在读历史的读者不会
 *   被顶部插入的新事件推走，更不会被打回顶端；
 * - 读者本来就在顶端（scrollTop≈0，即正在看最新一条）时不介入，让它跟随最新。
 *
 * 修正发生在 MutationObserver 的微任务里（浏览器绘制之前），所以看不到跳动。
 */
function ChronicleLog({ v }: { v: View }) {
  return (
    <div
      class="al-log"
      ref={(el) => {
        const box = el as HTMLElement
        let anchorRow: HTMLElement | null = null
        let anchorOffset = 0
        let disposed = false

        const capture = () => {
          const boxTop = box.getBoundingClientRect().top
          if (box.scrollTop <= 1) {
            // 顶端 = 正在看最新的一条：跟随，不做锚定
            anchorRow = null
            return
          }
          for (const row of Array.from(box.children) as HTMLElement[]) {
            if (row.getBoundingClientRect().bottom > boxTop + 1) {
              anchorRow = row
              anchorOffset = row.getBoundingClientRect().top - boxTop
              return
            }
          }
          anchorRow = null
        }

        const restore = () => {
          if (disposed || !anchorRow || !anchorRow.isConnected) return
          const boxTop = box.getBoundingClientRect().top
          const drift = anchorRow.getBoundingClientRect().top - boxTop - anchorOffset
          if (drift) box.scrollTop = Math.max(0, box.scrollTop + drift)
        }

        box.addEventListener("scroll", capture, { passive: true })
        const observer = new MutationObserver(() => {
          restore()
          capture()
        })
        observer.observe(box, { childList: true })
        capture()

        return () => {
          disposed = true
          observer.disconnect()
          box.removeEventListener("scroll", capture)
        }
      }}
    >
      <For each={v.log} getKey={(e) => e.id}>
        {(item) => (
          <div class={item().tone}>
            <b>{fmtClock(item().t)}</b>
            <span>{item().text}</span>
          </div>
        )}
      </For>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// 物质与配平
// ════════════════════════════════════════════════════════════════════════

function ElementCard({ v, a, id }: Ctx & { id: SubId }) {
  const sv = v.subs[id]!
  const sub = SUB_MAP[id]
  const supplyText = computed(() => `${fmt(sv.supply.get(), 2)}/s`)
  return (
    <div class="al-card">
      <div class="al-body" style="padding:10px">
        <div class="al-sh" style="display:flex;align-items:center;gap:8px">
          <Glyph sub={id} />
          <b style="font-size:13px;flex:1">{sub.name}</b>
          <Chip tone={sv.tone}>
            {computed(() => `×${sv.supplyMul.get().toFixed(2)}`)}
          </Chip>
        </div>
        <div style="margin:8px 0 5px;display:flex;align-items:baseline;gap:6px">
          <span style="font-size:19px;font-variant-numeric:tabular-nums;font-weight:600">
            {computed(() => fmt(sv.stock.get(), 1))}
          </span>
          <span class="al-mini">{computed(() => `/ ${fmt(sv.cap.get(), 0)}`)}</span>
          <span class="al-spacer" style="flex:1" />
          <span class="al-mini">地脉 {supplyText}</span>
        </div>
        <Bar v={sv.fill} tone={computed(() => (sv.over.get() ? "warn" : ""))} />
        <div class="al-mini" style="margin-top:7px;display:flex;justify-content:space-between">
          <span>波动周期 {sub.period}s</span>
          <span>{computed(() => (sv.rising.get() ? "涨潮 ↓ 回落中" : "退潮 ↑ 回升中"))}</span>
        </div>
        <div style="margin-top:3px">
          <Bar v={sv.cycle} slim tone="gold" />
        </div>
        <div class="al-flow" style="margin-top:8px;align-items:center">
          <span class="al-chip">地脉 Lv.{computed(() => sv.leyLv.get())}</span>
          <span class="al-spacer" style="flex:1" />
          <button
            class="al-btn sm"
            disabled={computed(() => v.gold.get() < sv.leyCost.get() || sv.leyLv.get() >= 14)}
            onClick={() => a.ley(id)}
          >
            {computed(() => `强化 ${fmt(sv.leyCost.get(), 0)}金`)}
          </button>
        </div>
      </div>
    </div>
  )
}

function StorageRow({ v, a, id }: Ctx & { id: SubId }) {
  const sv = v.subs[id]!
  const sub = SUB_MAP[id]
  const sellable = !!sub.price
  const isWaste = sub.kind === "waste"
  return (
    <div class={computed(() => (sv.over.get() && !isWaste ? "al-subrow over" : "al-subrow"))}>
      <SubName sub={id} />
      <div>
        <Bar v={sv.fill} tone={computed(() => (sv.over.get() ? "bad" : ""))} />
        <div class="al-mini" style="margin-top:3px">
          {computed(() => `${fmt(sv.stock.get(), 1)} / ${fmt(sv.cap.get(), 0)}`)}
        </div>
      </div>
      <div class="al-num">
        <span>{computed(() => fmt(sv.stock.get(), 1))}</span>
        <small class={computed(() => (sv.netNeg.get() ? "al-neg" : "al-pos"))}>
          {computed(() => `${fmtRate(sv.net.get(), 2)}/s`)}
        </small>
      </div>
      <div class="al-num">
        {sellable ? (
          <span>
            <span>{computed(() => fmt(sv.price.get(), 1))}</span>
            <small class={computed(() => (sv.tone.get() === "good" ? "al-pos" : sv.tone.get() === "bad" ? "al-neg" : ""))}>
              {computed(() => fmtX(sv.demand.get(), 2))}
            </small>
          </span>
        ) : (
          <span class="al-mini">—</span>
        )}
      </div>
      <div class="al-acts" style="display:flex;gap:4px;justify-content:flex-end">
        {sellable ? (
          <span style="display:flex;gap:4px">
            <button class="al-btn sm" disabled={computed(() => sv.stock.get() < 10)} onClick={() => a.sell(id, 10)}>
              卖10
            </button>
            <button class="al-btn sm ghost" disabled={computed(() => sv.stock.get() < 1)} onClick={() => a.sell(id, "all")}>
              全卖
            </button>
          </span>
        ) : null}
      </div>
    </div>
  )
}

export function MatterPanel({ v, a }: Ctx) {
  return (
    <div class="al-grid" style="gap:12px">
      <section class="al-card">
        <header>
          <h3>地脉 · 元素供给</h3>
          <span class="al-spacer" />
          <span class="al-hint">供给按各自周期正弦波动，天象会叠加突变</span>
        </header>
        <div class="al-body">
          <div class="al-grid c4">
            {ELEMENT_IDS.map((id) => (
              <Show when={v.subs[id]!.known}>
                <ElementCard v={v} a={a} id={id} />
              </Show>
            ))}
          </div>
        </div>
      </section>

      <section class="al-card">
        <header>
          <h3>仓库 · 产出与消耗</h3>
          <span class="al-spacer" />
          <span class="al-hint">净流量为负说明在吃库存；接近上限会溢出并凝结废渣</span>
        </header>
        <div class="al-body tight">
          {STORABLE.map((s) => (
            <Show when={v.subs[s.id]!.known}>
              <StorageRow v={v} a={a} id={s.id} />
            </Show>
          ))}
        </div>
      </section>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// 配方图鉴
// ════════════════════════════════════════════════════════════════════════

export function RecipesPanel({ v, a }: Ctx) {
  const tiers = [0, 1, 2, 3, 4, 5]
  return (
    <div class="al-grid" style="gap:12px">
      <section class="al-card">
        <header>
          <h3>配方图鉴</h3>
          <span class="al-spacer" />
          <span class="al-hint">副产物（青色）是配平压力的来源：它不管你要不要，都会产出来</span>
        </header>
        <div class="al-body">
          {tiers.map((tier) => {
            const list = RECIPES.filter((r) => r.tier === tier)
            if (list.length === 0) return null
            return (
              <div style="margin-bottom:14px">
                <h4 style="margin:0 0 8px;font-size:12px;color:var(--teal);letter-spacing:.1em">
                  {tier === 0 ? "基础与循环" : `第 ${tier} 阶产物`}
                </h4>
                <div class="al-techs">
                  {list.map((r) => (
                    <div class={computed(() => `al-tech${v.recipes[r.id]!.unlocked.get() ? "" : " locked"}`)}>
                      <div class="al-th">
                        <b>{computed(() => (v.recipes[r.id]!.unlocked.get() ? r.name : "??? 未解锁"))}</b>
                        <span class="al-chip">{r.time}s</span>
                      </div>
                      <RecipeIO id={r.id} />
                      <p>{r.desc}</p>
                      <div class="al-note">
                        每秒：{" "}
                        <span style="color:var(--bad)">
                          {Object.entries(r.inputs)
                            .map(([k, n]) => `${(n / r.time).toFixed(2)} ${nameOf(k)}`)
                            .join(" / ")}
                        </span>{" "}
                        →{" "}
                        <span style="color:var(--good)">
                          {Object.entries(r.outputs)
                            .map(([k, n]) => `${(n / r.time).toFixed(2)} ${nameOf(k)}`)
                            .join(" / ")}
                        </span>
                        {r.byproducts
                          ? " ｜ " +
                            Object.entries(r.byproducts)
                              .map(([k, n]) => `${(n / r.time).toFixed(2)} ${nameOf(k)}`)
                              .join(" / ")
                          : ""}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// 研究（科技树）
// ════════════════════════════════════════════════════════════════════════

export function TechPanel({ v, a }: Ctx) {
  const branches: (keyof typeof TECH_BRANCH_LABEL)[] = ["main", "ley", "build", "trade", "meta"]
  return (
    <div class="al-grid" style="gap:12px">
      <section class="al-card">
        <header>
          <h3>研究 · 科技树</h3>
          <span class="al-spacer" />
          <span class="al-hint">{computed(() => `已完成 ${v.techCount.get()} / ${TECHS.length}`)}</span>
        </header>
        <div class="al-body">
          <div class="al-warnbox" style="margin-bottom:12px">
            研究不是一次性付清：它在<b>持续抽取</b>底物。所以真正的问题是"同时维持几条产线"——
            熔炉槽位有限，你得决定先屯什么、后产什么。
          </div>
          {branches.map((b) => (
            <div class="al-branch">
              <h4>{TECH_BRANCH_LABEL[b]}</h4>
              <div class="al-techs">
                {TECHS.filter((t) => t.branch === b).map((t) => {
                  const tv = v.techs[t.id]!
                  return (
                    <div
                      class={computed(
                        () =>
                          `al-tech${tv.done.get() ? " done" : ""}${tv.active.get() ? " active" : ""}${
                            !tv.done.get() && !tv.available.get() ? " locked" : ""
                          }`,
                      )}
                    >
                      <div class="al-th">
                        <b>{t.name}</b>
                        <span class="al-chip teal">T{t.tier}</span>
                        {computed(() => (tv.done.get() ? <Chip tone="good">已完成</Chip> : null))}
                        {computed(() => (tv.active.get() ? <Chip tone="warn">研究中</Chip> : null))}
                        {computed(() =>
                          !tv.done.get() && !tv.available.get() ? <Chip>未解锁</Chip> : null,
                        )}
                      </div>
                      <p>{t.desc}</p>
                      <TechCosts techId={t.id} have={(s) => v.subs[s]!.stock} />
                      <div class="al-meta-flow" style="display:flex;align-items:center;gap:6px">
                        <span class="al-mini">耗时 {fmtTime(t.time)}</span>
                        <span class="al-spacer" style="flex:1" />
                        <button
                          class="al-btn sm primary"
                          disabled={computed(() => tv.done.get() || !tv.available.get() || tv.active.get())}
                          onClick={() => a.research(t.id)}
                        >
                          {computed(() => (tv.done.get() ? "已完成" : tv.active.get() ? "进行中" : "开始研究"))}
                        </button>
                      </div>
                      {/* 分支条件必须读"离散量"：如果直接读 progress，
                          这个 computed 会每 tick 重跑并返回新节点 —— 进度条就一直在重建 */}
                      {computed(() => {
                        if (!tv.hasProgress.get()) return null
                        return untrack(() => (
                          <div style="margin-top:4px">
                            <Bar v={tv.progress} tone="gold" />
                          </div>
                        ))
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// 市场
// ════════════════════════════════════════════════════════════════════════

function CatalystCard({ v, a, id }: Ctx & { id: string }) {
  const c = CATALYSTS.find((x) => x.id === id)!
  const cv = v.catalysts[id]!
  return (
    <div class="al-card">
      <div class="al-body" style="padding:10px">
        <div style="display:flex;align-items:center;gap:8px">
          <span class="al-glyph" style="background:#3a3357;color:#e8e2d4">
            {c.glyph}
          </span>
          <b style="font-size:12.5px;flex:1">{c.name}</b>
          {computed(() => (cv.active.get() > 0 ? <Chip tone="good">{`${cv.active.get().toFixed(0)}s`}</Chip> : null))}
        </div>
        <p class="al-note" style="margin:7px 0 8px">
          {c.desc}
        </p>
        <div style="display:flex;align-items:center;gap:6px">
          <span class="al-mini" style="flex:1">
            {computed(() => (cv.locked.get() ? `需要完成 ${c.minTechs} 项研究` : `${fmt(c.cost, 0)} 金`))}
          </span>
          <button
            class="al-btn sm"
            disabled={computed(() => cv.locked.get() || !cv.affordable.get())}
            onClick={() => a.catalyst(id)}
          >
            施放
          </button>
        </div>
      </div>
    </div>
  )
}

export function MarketPanel({ v, a }: Ctx) {
  return (
    <div class="al-grid" style="gap:12px">
      <section class="al-card">
        <header>
          <h3>商会代理</h3>
          <span class="al-spacer" />
          <span class="al-hint">研究《商会代理》后解锁：仓库超过 85% 的商品自动卖出（需求低于基准价时不动手）</span>
        </header>
        <div class="al-body">
          <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--dim);cursor:pointer">
            <input
              type="checkbox"
              disabled={computed(() => !v.hasAutoSell.get())}
              checked={computed(() => v.autoSell.get() && v.hasAutoSell.get())}
              onChange={() => a.toggleAutoSell()}
            />
            {computed(() =>
              v.hasAutoSell.get()
                ? "自动出售已解锁——它只处理快溢出且行情不差的商品，手动择时（需求 ×2 时出手）依然更赚。"
                : "尚未解锁（研究 → 商会支线 → 商会代理）。",
            )}
          </label>
        </div>
      </section>

      <section class="al-card">
        <header>
          <h3>催化剂</h3>
          <span class="al-spacer" />
          <span class="al-hint">金币的用处之一：在供给低谷或需求高峰时临时改命</span>
        </header>
        <div class="al-body">
          <div class="al-grid c3">
            {CATALYSTS.map((c) => (
              <CatalystCard v={v} a={a} id={c.id} />
            ))}
          </div>
        </div>
      </section>

      <section class="al-card">
        <header>
          <h3>元素采购</h3>
          <span class="al-spacer" />
          <span class="al-hint">供给低谷时买贵，丰沛时买便宜</span>
        </header>
        <div class="al-body tight">
          <table class="al-table">
            <thead>
              <tr>
                <th>元素</th>
                <th>库存 / 上限</th>
                <th>供给倍率</th>
                <th>单价</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {ELEMENT_IDS.map((id) => {
                const sv = v.subs[id]!
                return (
                  <Show when={sv.known}>
                    <tr>
                      <td>
                        <SubName sub={id} />
                      </td>
                      <td>{computed(() => `${fmt(sv.stock.get(), 1)} / ${fmt(sv.cap.get(), 0)}`)}</td>
                      <td>
                        <Chip tone={sv.tone}>
                          {computed(() => `${fmtX(sv.supplyMul.get(), 2)} · ${fmt(sv.supply.get(), 2)}/s`)}
                        </Chip>
                      </td>
                      <td>{computed(() => (sv.buyCost.get() ? fmt(sv.buyCost.get(), 2) : "—"))}</td>
                      <td>
                        <span style="display:flex;gap:4px;justify-content:flex-end">
                          <button class="al-btn sm" onClick={() => a.buy(id, 10)}>
                            买 10
                          </button>
                          <button class="al-btn sm ghost" onClick={() => a.buy(id, "all")}>
                            买满
                          </button>
                        </span>
                      </td>
                    </tr>
                  </Show>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section class="al-card">
        <header>
          <h3>行情</h3>
          <span class="al-spacer" />
          <span class="al-hint">需求 ×2.0 时卖出等于双倍收益；周期位置可用来预判</span>
        </header>
        <div class="al-body tight">
          <table class="al-table">
            <thead>
              <tr>
                <th>商品</th>
                <th>库存</th>
                <th>净流量/秒</th>
                <th>需求</th>
                <th>售价</th>
                <th>周期</th>
              </tr>
            </thead>
            <tbody>
              {STORABLE.filter((s) => s.price).map((s) => {
                const sv = v.subs[s.id]!
                return (
                  <Show when={sv.known}>
                    <tr>
                      <td>
                        <SubName sub={s.id} />
                      </td>
                      <td>{computed(() => fmt(sv.stock.get(), 1))}</td>
                      <td class={computed(() => (sv.netNeg.get() ? "al-neg" : "al-pos"))}>
                        {computed(() => fmtRate(sv.net.get(), 2))}
                      </td>
                      <td>
                        <Chip tone={sv.tone}>
                          {computed(() => fmtX(sv.demand.get(), 2))}
                        </Chip>
                      </td>
                      <td>{computed(() => fmt(sv.price.get(), 1))}</td>
                      <td style="width:80px">
                        <Bar v={sv.cycle} slim tone="gold" />
                      </td>
                    </tr>
                  </Show>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// 永恒（元升级 / 轮回 / 伟业）
// ════════════════════════════════════════════════════════════════════════

export function EternalPanel({ v, a }: Ctx) {
  return (
    <div class="al-grid" style="gap:12px">
      <section class="al-card">
        <header>
          <h3>永恒炼金术 · 元升级</h3>
          <span class="al-spacer" />
          <span class="al-hint">用贤者之石购买，跨轮回永久保留</span>
        </header>
        <div class="al-body tight">
          {META_UPGRADES.map((m) => {
            const mv = v.meta[m.id]!
            return (
              <div class="al-meta">
                <div class="al-mh">
                  <b>{m.name}</b>
                  <Chip tone={computed(() => (mv.maxed.get() ? "good" : "teal"))}>
                    {computed(() => `Lv.${mv.lv.get()} / ${m.max}`)}
                  </Chip>
                </div>
                <p>{m.desc}</p>
                <div class="al-mf">
                  <span class="al-mini">
                    {computed(() => {
                      const eff = m.effect as Record<string, number>
                      const k = Object.keys(eff)[0]
                      if (!k || mv.lv.get() === 0) return ""
                      return `当前累计：${(eff[k]! * mv.lv.get() * 100).toFixed(0)}%`
                    })}
                  </span>
                  <span class="al-spacer" />
                  <span class="al-mini">
                    {computed(() => (mv.maxed.get() ? "已满级" : `${fmt(mv.cost.get(), 0)} 石`))}
                  </span>
                  <button
                    class="al-btn sm primary"
                    disabled={computed(() => !mv.affordable.get())}
                    onClick={() => a.buyMeta(m.id)}
                  >
                    升级
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <div class="al-grid c2">
        <section class="al-card">
          <header>
            <h3>轮回</h3>
          </header>
          <div class="al-body">
            <p class="al-note">
              重置本局的一切（元素、产物、科技、槽位、金币），换取永久的<b>贤者之印</b>：每枚 +4% 全局炼金速度。
              贤者之石与元升级不会失去。
            </p>
            <div style="margin:10px 0">
              <div class="al-kv">
                <span>本局贤者之石</span>
                <b>{computed(() => fmt(v.runPs.get(), 1))}</b>
              </div>
              <div class="al-kv">
                <span>轮回门槛</span>
                <b>{REBIRTH_REQUIREMENT} 石</b>
              </div>
              <div class="al-kv">
                <span>本次可得贤者之印</span>
                <b>{computed(() => `+${v.sealsGain.get()}`)}</b>
              </div>
              <div class="al-kv">
                <span>现有贤者之印</span>
                <b>{computed(() => `${v.seals.get()}（速度 +${(v.seals.get() * 4).toFixed(0)}%）`)}</b>
              </div>
              <div class="al-kv">
                <span>轮回次数</span>
                <b>{computed(() => String(v.rebirths.get()))}</b>
              </div>
              <div class="al-kv">
                <span>历史最佳单局</span>
                <b>{computed(() => fmt(v.bestRunPs.get(), 1))}</b>
              </div>
              <div class="al-kv">
                <span>历史累计贤者之石</span>
                <b>{computed(() => fmt(v.totalPsEarned.get(), 1))}</b>
              </div>
            </div>
            <button
              class="al-btn rose block"
              disabled={computed(() => !v.canRebirth.get())}
              onClick={() => a.rebirth()}
            >
              {computed(() => (v.canRebirth.get() ? `执行轮回（+${v.sealsGain.get()} 印）` : `还需 ${REBIRTH_REQUIREMENT} 石`))}
            </button>
            <p class="al-note" style="margin-top:8px">
              提示：先攒一批贤者之石再轮回收益更高；但印记带来的提速会让下一轮更快滚起来。
            </p>
          </div>
        </section>

        <section class="al-card">
          <header>
            <h3>伟业</h3>
            <span class="al-spacer" />
            <span class="al-hint">每局重置，是重复获得贤者之石的主要来源</span>
          </header>
          <div class="al-body">
            <div class="al-ms">
              {MILESTONES.map((m) => {
                const mv = v.milestones[m.id]!
                return (
                  <div class={computed(() => (mv.done.get() ? "done" : ""))}>
                    <span class={computed(() => `al-dot ${mv.done.get() ? "on" : ""}`)} />
                    <b>{m.name}</b>
                    <span class="al-ps">{`+${m.ps}`}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// 玩法说明
// ════════════════════════════════════════════════════════════════════════

export function HelpPanel() {
  return (
    <div class="al-grid c2 al-help">
      <section class="al-card">
        <header>
          <h3>这游戏在玩什么</h3>
        </header>
        <div class="al-body">
          <p>
            你是一位炼金术士。地脉会源源不断地吐出四大元素（<span class="k">水 火 土 风</span>
            ），但每条地脉都有自己的呼吸周期——<b>供给是随时间起伏的</b>
            。你把元素投进熔炉，用配方把它们炼成硫、汞、盐、金属、精华，最终析出<b>贤者之石</b>。
          </p>
          <h4>三个核心张力</h4>
          <ul>
            <li>
              <b>槽位有限，配方很多。</b>开局只有 3 座熔炉，最多 8 座（还能靠元升级再加）。后期一条完整产链要十几个配方，
              你不可能同时全开——必须决定先屯什么、后炼什么。
            </li>
            <li>
              <b>研究在持续抽血。</b>研究不是一次付清，而是研究期间<b>每秒消耗</b>那组底物。断了就慢下来（进度不会丢）。
              所以"配平"就是：让好几种中间产物同时供得上。
            </li>
            <li>
              <b>副产物不由你决定。</b>炼金会喷出铅、铜、铁、盐、硫……仓库有上限，满了就溢出，溢出的部分会凝结成
              <span class="k">废渣</span>，而废渣会拖慢所有地脉。要么把副产物喂给下游配方，要么趁行情好卖掉。
            </li>
          </ul>
          <h4>时间在变</h4>
          <p>
            每条地脉按自己的周期正弦波动（把鼠标放到"物质与配平"的地脉卡上看周期），
            每隔一段时间还会降临<b>天象</b>：焰潮、大旱、七星连珠、黄金热……它同时改变<b>供给</b>和<b>需求</b>
            。天象有预告，别等它来了才反应。
          </p>
          <h4>局外成长</h4>
          <p>
            贤者之石来自两处：<b>伟业</b>（首次炼出某物、完成若干研究、成交额达标…每局重置，可反复拿）
            与<b>伟大工作</b>配方（把万应灵药投进金与星光里）。石头用来买永恒炼金术，永久生效；
            <b>轮回</b>则把本局成绩换成贤者之印，每枚 +4% 全局速度。
          </p>
        </div>
      </section>

      <section class="al-card">
        <header>
          <h3>开局 5 分钟该做什么</h3>
        </header>
        <div class="al-body">
          <h4>1. 先看缺什么</h4>
          <p>
            开局三座熔炉分别跑着煅烧（→硫磺）、溶解（→盐）、升华（→水银+硫磺）。它们是"地脉→三原质"的第一步。
            某个元素飘红就是<b>缺料</b>：点开那座熔炉换一个不吃这种元素的配方，或者在市场买一点顶过去。
          </p>
          <h4>2. 第一项研究</h4>
          <p>
            工坊右侧的"研究"里选《金属引论》。它需要硫磺 6 + 盐 6，所以你得让煅烧和溶解都跑起来（可能得占两座熔炉）。
            研究条走得慢，就是底物供不上，去"物质与配平"看谁在掉。
          </p>
          <h4>3. 拿到铅以后</h4>
          <p>
            《金属引论》解锁【合金·铅】。接着优先研究<b>扩建熔炉</b>（只要硫磺+盐），因为槽位是最大的瓶颈：
            产链每往下走一阶，需要的并行配方就多一条。
          </p>
          <h4>4. 别让仓库满</h4>
          <p>
            仓库满了会溢出→废渣→所有地脉变慢。去"市场"把多余的东西卖掉，顺便攒金币强化地脉；
            或者干脆把副产物当原料喂给下游配方（比如铅会喂给锡、铁、虚之精华）。
          </p>
          <h4>5. 记住这条链</h4>
          <p class="al-note">
            水+土→盐 ｜ 火+土→硫 ｜ 火+风→汞(+硫) ｜ 硫+土→铅(+盐) ｜ 铅+风→锡(+铅) ｜ 铅+锡+火→铁(+硫) ｜
            铁+水+硫→铜(+铁) ｜ 铜+汞+水→银(+铜) ｜ 银+硫+火→金(+铅) ｜ 风+水+盐→以太(+盐) ｜
            金+盐+水→生之精华(+汞) ｜ 银+以太→星之精华(+银) ｜ 铅+以太+硫→虚之精华(+铅) ｜
            生+虚+以太→万能溶剂(+虚) ｜ 生+星+溶剂→万应灵药(+生) ｜ 灵药+金+星→贤者之石(+金)
          </p>
          <h4>小技巧</h4>
          <ul>
            <li>熔炉可以暂停：先屯上游，再一口气开下游，比平均分配更快。</li>
            <li>
              研究可以随时中止，进度保留。如果某项研究一直卡在 20%，先去做别的。
            </li>
            <li>槽位不是越多越好——每个槽位都要吃元素，元素不够时多开的熔炉只是互相抢料。</li>
            <li>行情有周期（市场页有周期条），在需求高峰卖出副产物，一轮能多赚一倍。</li>
            <li>离线也会继续挂机（最多 4 小时），而且离线不产生废渣，可以放心睡觉。</li>
          </ul>
        </div>
      </section>
    </div>
  )
}
