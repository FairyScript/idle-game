/**
 * 平衡回归护栏：用自适应试玩机器人跑完整局，确保
 *   1. 主线真的能被打通（伟大工作可解锁、能产出贤者之石）
 *   2. 各阶段耗时落在可接受区间
 *   3. 轮回后下一局明显更快
 * 这些断言是防止以后调数值时把游戏改成"打不通"或"五分钟通关"。
 */
import { describe, expect, test } from "bun:test"
import { createMeta, createRun, derive, rebirth, rebirthSeals } from "../src/sim/engine"
import { simulate } from "../tools/playtest"

describe("平衡护栏（机器人试玩）", () => {
  test("基础局：60 分钟内解锁伟大工作，并攒到可观的贤者之石", () => {
    const meta = createMeta()
    const S = createRun(meta)
    simulate(S, meta, 60 * 60, 0.25)

    expect(S.recipes.magnum_opus).toBe(true)
    expect(S.runPs).toBeGreaterThan(80)
    expect(derive(S, meta).slotCount).toBeGreaterThanOrEqual(7)
    // 机器人会用掉绝大多数科技，说明科技树没有死结
    expect(derive(S, meta).techCount).toBeGreaterThanOrEqual(30)
    // 数值不允许失控
    expect(Number.isFinite(S.gold)).toBe(true)
    expect(Number.isFinite(S.stock.gold)).toBe(true)
    for (const k of Object.keys(S.stock)) expect(Number.isFinite(S.stock[k]!)).toBe(true)
  })

  test("第一颗贤者之石不会来得太晚（15 分钟内）", () => {
    const meta = createMeta()
    const S = createRun(meta)
    let t = -1
    simulate(S, meta, 60 * 60, 0.25, (st) => {
      if (t < 0 && st.runPs > 0) t = st.t
    })
    expect(t).toBeGreaterThan(0)
    expect(t).toBeLessThan(15 * 60)
  })

  test("轮回后下一局明显更快", () => {
    const meta = createMeta()
    const S = createRun(meta)
    simulate(S, meta, 40 * 60, 0.25)
    expect(rebirthSeals(S.runPs)).toBeGreaterThan(0)
    const seals = rebirth(S, meta)
    expect(seals).toBeGreaterThanOrEqual(3)

    let t2 = -1
    simulate(S, meta, 25 * 60, 0.25, (st) => {
      if (t2 < 0 && st.recipes.magnum_opus) t2 = st.t
    })
    // 第二局 25 分钟内就能再次解锁伟大工作
    expect(t2).toBeGreaterThan(0)
    expect(t2).toBeLessThan(25 * 60)
    expect(derive(S, meta).speedMul).toBeGreaterThan(1.1)
  })

  test("开局 3 分钟内一定有事可做（不会开局就卡死）", () => {
    const meta = createMeta()
    const S = createRun(meta)
    simulate(S, meta, 3 * 60, 0.25)
    expect(derive(S, meta).techCount).toBeGreaterThanOrEqual(1)
    expect(S.produced.sulfur).toBeGreaterThan(4)
    expect(S.produced.salt).toBeGreaterThan(3)
  })
})
