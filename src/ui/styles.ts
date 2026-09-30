/** 全局样式（通过 kiko 的 <Style global> 注入构造式样式表）。 */
export const CSS = `
:root {
  --bg: #0b0a10;
  --panel: #141221;
  --panel2: #1a1730;
  --panel3: #211d38;
  --line: #2c2745;
  --line2: #3a3357;
  --text: #e9e3d5;
  --dim: #8d8577;
  --dim2: #6a6358;
  --gold: #e8c256;
  --rose: #ff5f8f;
  --teal: #5fd0c8;
  --good: #79c98a;
  --bad: #e2603c;
  --warn: #e0a83c;
  --shadow: 0 2px 14px rgba(0,0,0,.45);
  --radius: 10px;
}
* { box-sizing: border-box; }
.al-app {
  display: flex; flex-direction: column; height: 100vh; overflow: hidden;
  background:
    radial-gradient(1100px 500px at 12% -8%, rgba(120,70,200,.16), transparent 60%),
    radial-gradient(900px 460px at 88% 4%, rgba(232,194,86,.09), transparent 62%),
    var(--bg);
  color: var(--text); font-size: 13px; line-height: 1.45;
}
.al-app ::-webkit-scrollbar { width: 9px; height: 9px; }
.al-app ::-webkit-scrollbar-thumb { background: #322b52; border-radius: 5px; }
.al-app ::-webkit-scrollbar-track { background: transparent; }

/* ── 顶栏 ───────────────────────────────────────────── */
.al-top {
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  padding: 9px 16px; border-bottom: 1px solid var(--line);
  background: linear-gradient(180deg, rgba(30,25,55,.92), rgba(16,14,26,.92));
  backdrop-filter: blur(6px);
}
.al-brand { display: flex; align-items: baseline; gap: 9px; margin-right: 4px; }
.al-brand b { font-size: 16px; letter-spacing: .06em; color: var(--gold); font-weight: 700; }
.al-brand span { color: var(--dim2); font-size: 11px; letter-spacing: .18em; text-transform: uppercase; }
.al-res { display: flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px;
  background: rgba(255,255,255,.035); border: 1px solid var(--line); white-space: nowrap; }
.al-res i { font-style: normal; color: var(--dim); font-size: 11px; }
.al-res b { font-variant-numeric: tabular-nums; font-weight: 600; letter-spacing: .01em; }
.al-res.ps b { color: var(--rose); text-shadow: 0 0 10px rgba(255,95,143,.45); }
.al-res.gold b { color: var(--gold); }
.al-spacer { flex: 1 1 auto; }
.al-mini { color: var(--dim2); font-size: 11px; font-variant-numeric: tabular-nums; }

/* ── 天象条 ─────────────────────────────────────────── */
.al-omen {
  display: flex; align-items: center; gap: 12px; padding: 7px 16px;
  border-bottom: 1px solid var(--line); font-size: 12px; min-height: 38px;
  background: rgba(255,255,255,.012);
}
.al-omen.good { background: linear-gradient(90deg, rgba(121,201,138,.10), transparent 62%); }
.al-omen.bad { background: linear-gradient(90deg, rgba(226,96,60,.13), transparent 62%); }
.al-omen.mixed { background: linear-gradient(90deg, rgba(224,168,60,.10), transparent 62%); }
.al-omen b { letter-spacing: .05em; }
.al-omen .al-omenbar { width: 110px; }
.al-omen .al-tag { color: var(--dim); }

/* ── 标签页 ─────────────────────────────────────────── */
.al-tabs { display: flex; gap: 2px; padding: 0 12px; border-bottom: 1px solid var(--line); overflow-x: auto; }
.al-tab {
  appearance: none; border: 0; background: transparent; color: var(--dim); cursor: pointer;
  padding: 9px 13px; font: inherit; font-size: 13px; white-space: nowrap;
  border-bottom: 2px solid transparent; transition: color .12s, border-color .12s;
}
.al-tab:hover { color: var(--text); }
.al-tab.on { color: var(--gold); border-bottom-color: var(--gold); }
.al-tab .al-badge { display: inline-block; min-width: 16px; padding: 0 4px; margin-left: 5px;
  border-radius: 8px; background: var(--rose); color: #1b0b14; font-size: 10px; font-weight: 700; text-align: center; }

/* ── 主体 ───────────────────────────────────────────── */
.al-main { flex: 1 1 auto; overflow: auto; padding: 14px 16px 60px; }
.al-grid { display: grid; gap: 12px; }
.al-grid.c2 { grid-template-columns: minmax(0,1.35fr) minmax(0,1fr); }
.al-grid.c3 { grid-template-columns: repeat(3, minmax(0,1fr)); }
.al-grid.c4 { grid-template-columns: repeat(4, minmax(0,1fr)); }
@media (max-width: 1080px) {
  .al-grid.c2, .al-grid.c3, .al-grid.c4 { grid-template-columns: minmax(0,1fr); }
}

/* ── 卡片 ───────────────────────────────────────────── */
.al-card { background: linear-gradient(180deg, rgba(31,27,54,.72), rgba(20,18,33,.72));
  border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); overflow: hidden; }
.al-card > header { display: flex; align-items: center; gap: 8px; padding: 9px 12px;
  border-bottom: 1px solid var(--line); background: rgba(255,255,255,.018); }
.al-card > header h3 { margin: 0; font-size: 12.5px; font-weight: 600; letter-spacing: .1em; color: var(--gold); }
.al-card > header .al-hint { color: var(--dim2); font-size: 11px; letter-spacing: 0; }
.al-card > header .al-spacer { flex: 1; }
.al-body { padding: 10px 12px; }
.al-body.tight { padding: 0; }

/* ── 进度条 ─────────────────────────────────────────── */
.al-bar { height: 6px; border-radius: 4px; background: #191531; overflow: hidden; border: 1px solid rgba(255,255,255,.04); }
.al-bar > i { display: block; height: 100%; width: 0%; background: linear-gradient(90deg, #4a7fd0, #5fd0c8);
  transition: width .1s linear; }
.al-bar.gold > i { background: linear-gradient(90deg, #a9822f, var(--gold)); }
.al-bar.rose > i { background: linear-gradient(90deg, #a8365e, var(--rose)); }
.al-bar.good > i { background: linear-gradient(90deg, #3f8a55, var(--good)); }
.al-bar.warn > i { background: linear-gradient(90deg, #a8762a, var(--warn)); }
.al-bar.bad > i { background: linear-gradient(90deg, #8f3a22, var(--bad)); }
.al-bar.tall { height: 8px; }
.al-bar.slim { height: 4px; }

/* ── 按钮 ───────────────────────────────────────────── */
.al-btn {
  appearance: none; font: inherit; font-size: 12px; cursor: pointer; color: var(--text);
  background: linear-gradient(180deg, #2b2548, #221d3a); border: 1px solid var(--line2);
  border-radius: 7px; padding: 5px 10px; transition: filter .12s, transform .06s, border-color .12s;
  white-space: nowrap;
}
.al-btn:hover:not(:disabled) { filter: brightness(1.25); border-color: #4d4470; }
.al-btn:active:not(:disabled) { transform: translateY(1px); }
.al-btn:disabled { opacity: .38; cursor: not-allowed; }
.al-btn.primary { background: linear-gradient(180deg, #7a5f1e, #5c4615); border-color: #9a7c2c; color: #ffeec2; }
.al-btn.rose { background: linear-gradient(180deg, #7d2a4b, #5b1e37); border-color: #a43a63; color: #ffd9e6; }
.al-btn.ghost { background: transparent; border-color: var(--line); color: var(--dim); }
.al-btn.ghost:hover:not(:disabled) { color: var(--text); }
.al-btn.sm { padding: 2px 7px; font-size: 11px; border-radius: 5px; }
.al-btn.block { display: block; width: 100%; }

/* ── 徽章 / 小标签 ──────────────────────────────────── */
.al-chip { display: inline-flex; align-items: center; gap: 4px; padding: 1px 6px; border-radius: 5px;
  font-size: 10.5px; letter-spacing: .03em; background: rgba(255,255,255,.05); color: var(--dim);
  border: 1px solid transparent; white-space: nowrap; }
.al-chip.good { background: rgba(121,201,138,.14); color: var(--good); }
.al-chip.bad { background: rgba(226,96,60,.16); color: var(--bad); }
.al-chip.warn { background: rgba(224,168,60,.15); color: var(--warn); }
.al-chip.rose { background: rgba(255,95,143,.14); color: var(--rose); }
.al-chip.teal { background: rgba(95,208,200,.13); color: var(--teal); }
.al-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--dim2); flex: 0 0 auto; }
.al-dot.on { background: var(--good); box-shadow: 0 0 7px rgba(121,201,138,.75); }
.al-dot.warn { background: var(--warn); box-shadow: 0 0 7px rgba(224,168,60,.7); }
.al-dot.bad { background: var(--bad); box-shadow: 0 0 7px rgba(226,96,60,.7); }
.al-dot.pause { background: #6c7bb0; }

/* ── 物质行 ─────────────────────────────────────────── */
.al-subrow { display: grid; grid-template-columns: 132px minmax(70px,1fr) 74px 74px 104px; gap: 8px; align-items: center;
  padding: 5px 12px; border-bottom: 1px solid rgba(255,255,255,.035); min-height: 46px; }
@media (max-width: 760px) {
  .al-subrow { grid-template-columns: 110px minmax(50px,1fr) 64px 64px; }
  .al-subrow > .al-acts { grid-column: 1 / -1; justify-content: flex-start !important; }
}
.al-subrow:last-child { border-bottom: 0; }
.al-subrow.over { background: rgba(226,96,60,.07); }
.al-name { display: flex; align-items: center; gap: 7px; min-width: 0; }
.al-glyph { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px;
  border-radius: 6px; font-size: 11.5px; font-weight: 700; flex: 0 0 auto; color: #0f0d18; }
.al-name .al-t { min-width: 0; }
.al-name .al-t b { display: block; font-weight: 600; font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.al-name .al-t i { display: block; font-style: normal; color: var(--dim2); font-size: 10px; }
.al-num { text-align: right; font-variant-numeric: tabular-nums; }
.al-num small { display: block; color: var(--dim2); font-size: 10px; }
.al-pos { color: var(--good); }
.al-neg { color: var(--bad); }

/* ── 熔炉槽位 ───────────────────────────────────────── */
.al-slots { display: grid; grid-template-columns: repeat(auto-fill, minmax(232px, 1fr)); gap: 10px; }
.al-slot { border: 1px solid var(--line); border-radius: 9px; background: rgba(255,255,255,.02);
  padding: 9px 10px; display: flex; flex-direction: column; gap: 7px; min-height: 116px; }
.al-slot.on { border-color: rgba(232,194,86,.35); background: linear-gradient(180deg, rgba(232,194,86,.05), rgba(255,255,255,.015)); }
.al-slot.empty { border-style: dashed; opacity: .72; }
.al-sh { display: flex; align-items: center; gap: 6px; }
.al-slot > .al-sh b { font-size: 12.5px; font-weight: 600; flex: 1; min-width: 0; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
.al-slot .al-io { font-size: 11px; color: var(--dim); line-height: 1.55; }
.al-slot .al-io em { font-style: normal; }
.al-slot .al-io .k { color: var(--dim2); }
.al-slot .al-io .p { color: var(--good); }
.al-slot .al-io .c { color: var(--bad); }
.al-slot .al-io .b { color: var(--teal); }
.al-slot .al-foot { display: flex; align-items: center; gap: 5px; margin-top: auto; }
.al-slot .al-pct { font-variant-numeric: tabular-nums; font-size: 10.5px; color: var(--dim2); }

/* ── 配方选择器 ─────────────────────────────────────── */
.al-picker { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; margin-top: 10px;
  padding: 10px; border: 1px solid var(--line2); border-radius: 9px; background: rgba(10,9,18,.6); }
.al-rec { text-align: left; cursor: pointer; border: 1px solid var(--line); border-radius: 8px;
  background: rgba(255,255,255,.025); padding: 7px 9px; font: inherit; color: var(--text); }
.al-rec:hover:not(:disabled) { border-color: var(--gold); background: rgba(232,194,86,.07); }
.al-rec:disabled { opacity: .32; cursor: not-allowed; }
.al-rec b { display: block; font-size: 12px; margin-bottom: 3px; }
.al-rec .al-io { font-size: 10.5px; color: var(--dim); }
.al-rec .al-io .p { color: var(--good); } .al-rec .al-io .c { color: var(--bad); }
.al-rec .al-io .b { color: var(--teal); }

/* ── 科技树 ─────────────────────────────────────────── */
.al-branch { margin-bottom: 14px; }
.al-branch > h4 { margin: 0 0 8px; font-size: 12px; color: var(--teal); letter-spacing: .12em; font-weight: 600; }
.al-techs { display: grid; grid-template-columns: repeat(auto-fill, minmax(268px, 1fr)); gap: 9px; }
.al-tech { border: 1px solid var(--line); border-radius: 9px; padding: 9px 10px; background: rgba(255,255,255,.02);
  display: flex; flex-direction: column; gap: 6px; }
.al-tech.done { border-color: rgba(121,201,138,.4); background: rgba(121,201,138,.05); }
.al-tech.active { border-color: var(--gold); box-shadow: 0 0 0 1px rgba(232,194,86,.25) inset; }
.al-tech.locked { opacity: .45; }
.al-tech > .al-th { display: flex; align-items: center; gap: 6px; }
.al-tech > .al-th b { flex: 1; font-size: 12.5px; }
.al-tech p { margin: 0; font-size: 11px; color: var(--dim); line-height: 1.5; }
.al-costs { display: flex; flex-wrap: wrap; gap: 4px; }
.al-cost { display: inline-flex; align-items: center; gap: 3px; font-size: 10.5px; padding: 1px 5px;
  border-radius: 4px; background: rgba(255,255,255,.045); color: var(--dim); font-variant-numeric: tabular-nums; }
.al-cost.ok { color: var(--good); background: rgba(121,201,138,.10); }
.al-cost.no { color: var(--bad); background: rgba(226,96,60,.12); }
.al-cost em { font-style: normal; opacity: .75; }

/* ── 表格 ───────────────────────────────────────────── */
.al-table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.al-table th { text-align: right; font-weight: 500; color: var(--dim2); font-size: 10.5px;
  padding: 5px 8px; border-bottom: 1px solid var(--line); letter-spacing: .06em; }
.al-table th:first-child { text-align: left; }
.al-table td { text-align: right; padding: 4px 8px; border-bottom: 1px solid rgba(255,255,255,.035); font-size: 12px; }
.al-table td:first-child { text-align: left; }
.al-table tr:last-child td { border-bottom: 0; }

/* ── 日志 ───────────────────────────────────────────── */
/* overflow-anchor: none —— 滚动位置的保持由 ChronicleLog 自己接管（见 panels.tsx）：
   新事件从顶部插入时，浏览器自带的锚定在 flex 容器里不可靠，两者会互相打架。 */
.al-log { max-height: 220px; overflow: auto; overflow-anchor: none; display: flex; flex-direction: column; gap: 4px; padding: 8px 12px; }
.al-log div { font-size: 11.5px; color: var(--dim); line-height: 1.5; }
.al-log div b { color: var(--dim2); font-weight: 500; margin-right: 5px; font-variant-numeric: tabular-nums; }
.al-log div.good { color: var(--good); } .al-log div.bad { color: var(--warn); }

/* ── 网格小卡片 ─────────────────────────────────────── */
.al-meta { display: flex; flex-direction: column; gap: 7px; padding: 9px 12px; border-bottom: 1px solid rgba(255,255,255,.04); }
.al-meta .al-mh { display: flex; align-items: center; gap: 8px; }
.al-meta .al-mh b { font-size: 12.5px; }
.al-meta p { margin: 0; font-size: 11px; color: var(--dim); }
.al-meta .al-mf { display: flex; align-items: center; gap: 8px; }
.al-meta .al-mf .al-spacer { flex: 1; }

.al-ms { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 7px; }
.al-ms > div { display: flex; align-items: center; gap: 7px; padding: 6px 9px; border-radius: 7px;
  border: 1px solid var(--line); font-size: 11.5px; color: var(--dim); }
.al-ms > div.done { border-color: rgba(121,201,138,.35); color: var(--text); background: rgba(121,201,138,.05); }
.al-ms > div b { font-weight: 600; font-size: 12px; }
.al-ms > div .al-ps { margin-left: auto; color: var(--rose); font-variant-numeric: tabular-nums; }

.al-help h4 { margin: 14px 0 6px; font-size: 12.5px; color: var(--gold); }
.al-help p, .al-help li { font-size: 12.5px; color: #c8c1b2; line-height: 1.75; }
.al-help ul { margin: 4px 0; padding-left: 20px; }
.al-help code { background: rgba(255,255,255,.07); padding: 1px 5px; border-radius: 4px; font-size: 11.5px; }
.al-help .k { color: var(--teal); }

/* ── 弹层 ───────────────────────────────────────────── */
.al-modal-bg { position: fixed; inset: 0; background: rgba(5,4,10,.72); backdrop-filter: blur(3px);
  display: flex; align-items: center; justify-content: center; z-index: 50; padding: 20px; }
.al-modal { width: min(520px, 100%); background: var(--panel2); border: 1px solid var(--line2);
  border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,.6); padding: 18px 20px; max-height: 82vh; overflow: auto; }
.al-modal h2 { margin: 0 0 6px; font-size: 15px; color: var(--gold); letter-spacing: .05em; }
.al-modal p { margin: 6px 0; font-size: 12.5px; color: #c8c1b2; }
.al-modal .al-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
.al-kv { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,.05); font-size: 12.5px; }
.al-kv span { color: var(--dim); } .al-kv b { font-variant-numeric: tabular-nums; }

/* ── 提示条 ─────────────────────────────────────────── */
.al-toast { position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%);
  background: var(--panel3); border: 1px solid var(--line2); color: var(--text);
  padding: 8px 16px; border-radius: 999px; font-size: 12.5px; z-index: 60; box-shadow: var(--shadow); }
.al-toast.good { border-color: rgba(121,201,138,.5); } .al-toast.bad { border-color: rgba(226,96,60,.5); }

.al-empty { color: var(--dim2); font-size: 12px; padding: 10px 12px; }
.al-hr { height: 1px; background: var(--line); margin: 10px 0; }
.al-flow { display: flex; flex-wrap: wrap; gap: 5px; }
.al-note { font-size: 11.5px; color: var(--dim); line-height: 1.6; }
.al-warnbox { border: 1px solid rgba(226,96,60,.4); background: rgba(226,96,60,.08); border-radius: 8px;
  padding: 8px 10px; font-size: 11.5px; color: #f0b7a4; }
`
