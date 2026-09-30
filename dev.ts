/**
 * 开发服务器：`Bun.serve` + kiko HMR（模块热替换，保留游戏状态）。
 *
 *   bun run dev                                      # 默认 http://localhost:4173/
 *   PORT=8080 bun run dev
 *   DEV_ALLOWED_HOSTS=idle.10111234.xyz bun run dev  # 追加允许的对外域名
 *
 * ── 为什么是两个监听器 ────────────────────────────────────────────────────
 *
 * Bun 的 dev server 内置 DNS-rebinding 防护：Host 头不是本机地址（localhost /
 * 127.0.0.1 / ::1）时一律 403 `Blocked: Host header does not match the dev
 * server`。Bun 1.4.x 还没有开放这个允许名单（`development.allowedHosts`
 * 尚未发布），而反向代理/隧道转发过来的 Host 恰恰是公网域名 —— 于是经由
 * https://idle.10111234.xyz/ 访问会直接 403。
 *
 *  公网 / 隧道 ──▶ 外层监听器（0.0.0.0:PORT，Host 允许名单 + 反向代理）
 *                      │  转发时把 Host/Origin 改写成环回地址
 *                      ▼
 *                内层 dev server（127.0.0.1:随机端口，HTML 路由 + HMR + /hmr）
 *
 * 外层只放行允许名单里的 Host；WebSocket（Bun 自带 HMR 的 `/_bun/hmr` 与 kiko
 * 的 `/hmr`）由外层升级后桥接到内层，所以经域名访问时热替换照常工作。
 *
 * 与生产构建的区别：
 *   - `bun run build` 产出 `dist/game.js`（IIFE 单文件，可 file:// 直开）；
 *   - `bun run dev` 用 `dev.html` + Bun 的 HTML 路由即时打包 `src/main.tsx`，
 *     配合 `bunfig.toml` 里的 `[serve.static] plugins` 注入 HMR 胶水。
 *
 * 注意：必须在项目根目录运行（`bun run dev` 即是），因为打包插件与 watcher
 * 都用 `process.cwd()` 归一化模块 id，两者必须一致。
 */
import devHtml from "./dev.html"
import { createBunHmr } from "@kikojs/hmr/bun"

const wantPort = Number(process.env.PORT ?? 4173)

/** 默认放行的对外域名（本机回环地址总是放行）。 */
const DEFAULT_PUBLIC_HOSTS = ["idle.10111234.xyz"]

/** 回环 / 本机地址：Bun 自己就放行，也是代理转发时改写成的目标。 */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"])

/** 取 Host 头里的主机名：去端口、去 IPv6 方括号、转小写。 */
function hostnameOf(host: string | null | undefined): string {
  if (!host) return ""
  const h = host.trim().toLowerCase()
  if (h.startsWith("[")) {
    const end = h.indexOf("]")
    return end === -1 ? h : h.slice(1, end)
  }
  // 只有恰好一个冒号时才是 "host:port"（IPv6 会有多个冒号）
  const first = h.indexOf(":")
  if (first !== -1 && first === h.lastIndexOf(":")) return h.slice(0, first)
  return h
}

/** 允许的对外域名：内置默认值 + `DEV_ALLOWED_HOSTS`（逗号分隔，`*` 表示不限制）。 */
function allowedPublicHosts(): string[] {
  const extra = (process.env.DEV_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  return [...DEFAULT_PUBLIC_HOSTS, ...extra]
}

function isAllowedHost(host: string | null | undefined): boolean {
  const name = hostnameOf(host)
  if (!name) return false
  if (LOOPBACK_HOSTS.has(name)) return true
  for (const allowed of allowedPublicHosts()) {
    if (allowed === "*") return true
    const a = hostnameOf(allowed)
    // ".example.com" 形式：该域本身及其所有子域都放行
    if (a.startsWith(".") && (name === a.slice(1) || name.endsWith(a))) return true
    if (name === a) return true
  }
  return false
}

function blockedResponse(host: string | null): Response {
  const allowed = [...LOOPBACK_HOSTS, ...allowedPublicHosts()].join(", ")
  return new Response(
    `403 Forbidden\n\nHost "${host ?? ""}" 不在开发服务器的允许名单里。\n` +
      `当前允许：${allowed}\n\n` +
      `要追加域名：DEV_ALLOWED_HOSTS=your.host bun run dev\n`,
    { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } },
  )
}

// ── 内层：真正的 dev server（HTML 路由 + HMR），只绑环回地址 ────────────────
// 独立 HMR 端点：GET /hmr → SSE，Upgrade: websocket → WebSocket。
// watcher 监听 src/ 的变化并 publish（模块 id 与打包插件一致）。
const hmr = createBunHmr({ watch: ["src"], debounceMs: 30 })

const inner = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  // Bun 自带的模块 HMR（import.meta.hot）+ 终端回显
  development: { hmr: true, console: true },
  routes: {
    // 非本端点的请求（undefined）继续走下面的 HTML 路由
    "/hmr": (request, server) => hmr.fetch(request, server) ?? new Response(null, { status: 404 }),
    // 开发外壳：即时打包 src/main.tsx，改代码即热替换
    "/index.html": devHtml,
    "/*": devHtml,
  },
  websocket: hmr.websocket,
})

const INNER_ORIGIN = `http://127.0.0.1:${inner.port}`
const INNER_WS = `ws://127.0.0.1:${inner.port}`

// ── 外层：公网监听器（允许名单 + 反向代理） ────────────────────────────────
type Frame = string | ArrayBuffer

interface Peer {
  /** 需要转发的路径（含查询串）。 */
  target: string
  /** WebSocket 建连前先攒着的消息。 */
  queue: Frame[]
  socket: WebSocket | null
}

/** 统一成 `string | ArrayBuffer`，避免 Buffer / SharedArrayBuffer 视图的类型差异。 */
function toFrame(message: unknown): Frame {
  if (typeof message === "string") return message
  if (message instanceof ArrayBuffer) return message
  if (ArrayBuffer.isView(message)) {
    const view = message as ArrayBufferView
    return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer
  }
  return String(message)
}

/** 逐跳头 + 会让内层 dev server 误判的请求头，转发前一律去掉。 */
const DROP_REQUEST_HEADERS = [
  "host", // 由 fetch 改成环回地址（内层据此通过 Host 校验）
  "origin", // 内层会拿它和 Host 比对，公网 Origin 会被判不匹配
  "connection",
  "upgrade",
  "keep-alive",
  "transfer-encoding",
  "te",
  "trailer",
  "proxy-authorization",
  "proxy-connection",
  "accept-encoding", // 让内层返回未压缩内容，避免解压/头不一致
]

function proxyRequest(request: Request, target: string): Promise<Response> {
  const headers = new Headers(request.headers)
  for (const name of DROP_REQUEST_HEADERS) headers.delete(name)
  const hasBody = request.method !== "GET" && request.method !== "HEAD"
  return fetch(`${INNER_ORIGIN}${target}`, {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    redirect: "manual",
  })
}

const outer = (() => {
  const start = (port: number) =>
    Bun.serve({
      port,
      fetch(request, server) {
        if (!isAllowedHost(request.headers.get("host"))) {
          return blockedResponse(request.headers.get("host"))
        }
        const url = new URL(request.url)
        const target = `${url.pathname}${url.search}`

        // WebSocket（Bun 自带 HMR 的 /_bun/hmr、kiko 的 /hmr）→ 本端升级后桥接到内层
        if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
          const peer: Peer = { target, queue: [], socket: null }
          return server.upgrade(request, { data: peer })
            ? undefined
            : new Response("WebSocket upgrade failed", { status: 400 })
        }

        return proxyRequest(request, target)
      },
      websocket: {
        // 指定 `ws.data` 的类型（Bun 的 TypeScript 限制，需要用 data 字段声明）
        data: {} as Peer,
        open(ws) {
          const peer = ws.data
          const socket = new WebSocket(INNER_WS + peer.target)
          socket.binaryType = "arraybuffer"
          peer.socket = socket
          socket.onopen = () => {
            for (const message of peer.queue) socket.send(message)
            peer.queue.length = 0
          }
          socket.onmessage = (event) => ws.send(toFrame(event.data))
          socket.onclose = () => ws.close()
          socket.onerror = () => ws.close()
        },
        message(ws, message) {
          const peer = ws.data
          const frame = toFrame(message)
          // 内层 socket 还没连上：先攒着，避免丢失首帧
          if (!peer.socket || peer.socket.readyState !== WebSocket.OPEN) {
            peer.queue.push(frame)
            return
          }
          peer.socket.send(frame)
        },
        close(ws) {
          const peer = ws.data
          peer.socket?.close()
          peer.socket = null
        },
      },
    })

  // 端口被占用时退到系统分配的端口，避免"起了但没起来"
  try {
    return start(wantPort)
  } catch {
    console.warn(`端口 ${wantPort} 被占用，改用系统分配的端口`)
    return start(0)
  }
})()

console.log(`\n《贤者之途》 dev  http://localhost:${outer.port}/`)
console.log(`允许的 Host       ${[...LOOPBACK_HOSTS, ...allowedPublicHosts()].join(", ")}`)
console.log(`HMR 端点          ${hmr.path}（SSE / WebSocket，监听 src/）`)
console.log(`内层 dev server   127.0.0.1:${inner.port}（HTML 路由 + Bun HMR）`)
console.log("改 src/ 下的代码即可热替换；Ctrl+C 退出。\n")

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    hmr.close()
    void outer.stop(true)
    void inner.stop(true)
    process.exit(0)
  })
}
