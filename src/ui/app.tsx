/** @jsxImportSource @kikojs/dom */
/** 根组件：布局、页签切换、弹层、提示条。 */
import { computed, untrack } from "@kikojs/signal"
import { Style } from "@kikojs/dom"
import { MILESTONES } from "../sim/content"
import { fmt, fmtTime } from "../sim/format"
import type { Actions, Ctx } from "./panels"
import {
  EternalPanel,
  Header,
  HelpPanel,
  MarketPanel,
  MatterPanel,
  OmenBar,
  RecipesPanel,
  Tabs,
  TechPanel,
  WorkshopPanel,
} from "./panels"
import type { View } from "./view"
import { CSS } from "./styles"

function panelFor(tab: string, v: View, a: Actions) {
  switch (tab) {
    case "matter":
      return <MatterPanel v={v} a={a} />
    case "recipes":
      return <RecipesPanel v={v} a={a} />
    case "tech":
      return <TechPanel v={v} a={a} />
    case "market":
      return <MarketPanel v={v} a={a} />
    case "eternal":
      return <EternalPanel v={v} a={a} />
    case "help":
      return <HelpPanel />
    default:
      return <WorkshopPanel v={v} a={a} />
  }
}

function Modals({ v, a }: Ctx) {
  return (
    <span>
      {computed(() => {
        if (!v.showOffline.get()) return null
        const r = v.offlineReport.get()
        if (!r) return null
        return (
          <div class="al-modal-bg" onClick={() => a.setShowOffline(false)}>
            <div class="al-modal" onClick={(e: MouseEvent) => e.stopPropagation()}>
              <h2>熔炉在你离开时继续燃烧</h2>
              <p>
                离线时长 {fmtTime(r.seconds)}
                {r.capped ? "（已按 4 小时上限结算）" : ""}。离线期间不会因溢出产生废渣。
              </p>
              <div style="margin:12px 0">
                <div class="al-kv">
                  <span>获得金币</span>
                  <b>{computed(() => fmt(r.gold, 1))}</b>
                </div>
                <div class="al-kv">
                  <span>获得贤者之石</span>
                  <b>{computed(() => fmt(r.ps, 1))}</b>
                </div>
                <div class="al-kv">
                  <span>完成研究</span>
                  <b>{computed(() => String(r.techs))}</b>
                </div>
                <div class="al-kv">
                  <span>达成伟业</span>
                  <b>
                    {computed(() =>
                      r.milestones
                        .map((id) => MILESTONES.find((m) => m.id === id)?.name ?? id)
                        .join("、") || "无",
                    )}
                  </b>
                </div>
              </div>
              <div class="al-actions">
                <button class="al-btn primary" onClick={() => a.setShowOffline(false)}>
                  继续
                </button>
              </div>
            </div>
          </div>
        )
      })}

      {computed(() => {
        if (!v.confirmHardReset.get()) return null
        return (
          <div class="al-modal-bg" onClick={() => a.confirmHardReset(false)}>
            <div class="al-modal" onClick={(e: MouseEvent) => e.stopPropagation()}>
              <h2>清空全部进度？</h2>
              <p>
                这会删除存档，包括贤者之石、贤者之印与所有永恒炼金术升级。此操作不可撤销。
                如果你只是想让下一轮更快，请用<b>轮回</b>——它保留贤者之石与元升级。
              </p>
              <div class="al-actions">
                <button class="al-btn ghost" onClick={() => a.confirmHardReset(false)}>
                  取消
                </button>
                <button class="al-btn rose" onClick={() => a.hardReset()}>
                  确认清空
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </span>
  )
}

export function App({ v, a }: Ctx) {
  return (
    <div class="al-app">
      <Style global>{CSS}</Style>
      <Header v={v} a={a} />
      <OmenBar v={v} />
      <Tabs v={v} a={a} />
      {/*
        面板切换必须用 untrack 包住：kiko 构建 DOM 时会"读一次"每个绑定所用的信号，
        这些读取如果发生在计算里，就会把整块面板变成"每一 tick 都要重建"——
        表现就是按钮/下拉/滚动条不停地闪。untrack 之后计算只依赖 tab，
        面板内部各自的绑定仍然由 kiko 自己的 watcher 驱动，照常细粒度更新。
      */}
      <main class="al-main">
        {computed(() => {
          const tab = v.tab.get()
          return untrack(() => panelFor(tab, v, a))
        })}
      </main>
      <Modals v={v} a={a} />
      {computed(() => {
        const t = v.toast.get()
        if (!t) return null
        return <div class={`al-toast ${v.toastTone.get()}`}>{t}</div>
      })}
    </div>
  )
}
