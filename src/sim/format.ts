/** 数值与时间格式化。 */

const UNITS = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"]

/** 紧凑数字：1234 → 1.23K，0.4567 → 0.46 */
export function fmt(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "∞"
  const neg = n < 0
  let v = Math.abs(n)
  if (v < 1) {
    const s = v === 0 ? "0" : v.toFixed(digits)
    return (neg ? "-" : "") + s
  }
  if (v < 1000) {
    const s = v < 10 ? v.toFixed(Math.min(digits, 2)) : v < 100 ? v.toFixed(1) : v.toFixed(0)
    return (neg ? "-" : "") + trimZeros(s)
  }
  let i = 0
  while (v >= 1000 && i < UNITS.length - 1) {
    v /= 1000
    i++
  }
  return (neg ? "-" : "") + trimZeros(v.toFixed(v < 10 ? 2 : v < 100 ? 1 : 0)) + UNITS[i]
}

function trimZeros(s: string): string {
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s
}

/** 带符号的速率 */
export function fmtRate(n: number, digits = 2): string {
  if (Math.abs(n) < 1e-9) return "0"
  return (n > 0 ? "+" : "") + fmt(n, digits)
}

/** 秒 → 1h 23m 45s */
export function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "—"
  const s = Math.floor(sec % 60)
  const m = Math.floor((sec / 60) % 60)
  const h = Math.floor(sec / 3600)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const mm = String(Math.floor(s / 60)).padStart(2, "0")
  const ss = String(s % 60).padStart(2, "0")
  return `${mm}:${ss}`
}

/** 0.234 → +23.4% */
export function fmtPct(x: number, digits = 0): string {
  return `${x >= 0 ? "+" : ""}${(x * 100).toFixed(digits)}%`
}

export function fmtX(x: number, digits = 2): string {
  return `×${x.toFixed(digits)}`
}
