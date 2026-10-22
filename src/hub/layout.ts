import type { EffTrip, HubName, RawTrip } from '../data/types'

// 轉運中心的示意配置:南面為發車碼頭、東面為進站碼頭。碼頭數為示意,資料中沒有碼頭編號。
export const DOCK = 5.5
const MARGIN = 9

export interface HubLayout {
  name: HubName // 同時是資料中的節點名稱
  title: string
  inDocks: number
  outDocks: number
  W: number // 東西向長度
  D: number // 南北向長度
}

function layout(name: HubName, title: string, inDocks: number, outDocks: number): HubLayout {
  return { name, title, inDocks, outDocks, W: outDocks * DOCK + MARGIN * 2, D: inDocks * DOCK + MARGIN * 2 }
}

export const HUBS: Record<HubName, HubLayout> = {
  北轉: layout('北轉', '北區轉運中心', 12, 16),
  桃轉: layout('桃轉', '桃園轉運中心', 8, 10),
  中轉: layout('中轉', '中區轉運中心', 8, 12),
  高轉: layout('高轉', '南區轉運中心', 8, 10),
}

export const HUB_ORDER: HubName[] = ['北轉', '桃轉', '中轉', '高轉']

// 車趟的 KPI 歸屬(依結帳單位):結帳在北轉的車趟,發車或到著為桃轉的歸桃轉;
// 北轉與桃轉之間的對開車歸發車端。場景則顯示所有實際進出的車趟,不受此限
export function hubOf(t: RawTrip): HubName {
  if (t.bh === '北轉' && (t.o === '桃轉' || (t.x === '桃轉' && t.o !== '北轉'))) return '桃轉'
  return t.bh
}

export const ROAD_GAP = 34 // 建築到道路中心線的距離
const LOAD_MIN = 45 // 發車前裝貨時間(示意)
const UNLOAD_MIN = 40 // 抵達後卸貨時間(示意)
const MOVE_MIN = 6 // 進出場行駛時間

export type Dir = 'in' | 'out'

// 時間都是相對於檢視日 00:00 的分鐘數,可以小於 0(前一天)或大於 1440(隔天),
// 這樣跨午夜的進出與碼頭占用才接得起來
export interface HubTrip {
  t: EffTrip
  dir: Dir
  dock: number // 碼頭序號
  yard: number // 排隊時的臨時車位序號;不需排隊為 -1
  ev: number // 資料上的發車或抵達時刻(分鐘)
  q0: number // 抵達臨時車位開始排隊;不需排隊時等於 d0
  d0: number // 靠碼頭開始(排隊時延後)
  d1: number // 離開碼頭
}

// 車趟與它的日期相對於檢視日的分鐘偏移(前一天 −1440、當天 0、隔天 +1440)
export interface HubEntry {
  t: EffTrip
  off: number
}

// 檢視日前後多遠的車趟還會影響當天:前一天的排隊可能延到當天,隔天凌晨的裝貨從前一晚開始
const LOOK_BACK = 600
const LOOK_AHEAD = 60

export function directionOf(t: EffTrip, hub: HubLayout): Dir | null {
  if (t.o === hub.name) return 'out'
  if (t.x === hub.name) return 'in'
  return null
}

// 依時間順序把車趟分到碼頭;碼頭全滿時先到臨時車位排隊,最早空出的碼頭一空就開進去,
// 裝卸時間不變、整段往後延。等待不超過一段進場行駛時間的,直接晚一點進場,不進臨時車位
export function schedule(entries: HubEntry[], hub: HubLayout): HubTrip[] {
  const items: HubTrip[] = []
  for (const { t, off } of entries) {
    if (t.removed) continue
    const dir = directionOf(t, hub)
    if (!dir) continue
    let it: HubTrip
    if (dir === 'out') {
      const ev = off + t.h
      it = { t, dir, dock: -1, yard: -1, ev, q0: ev - LOAD_MIN, d0: ev - LOAD_MIN, d1: ev }
    } else {
      const arr = off + t.h + t.du
      it = { t, dir, dock: -1, yard: -1, ev: arr, q0: arr, d0: arr, d1: arr + UNLOAD_MIN }
    }
    // 離檢視日太遠、碰不到當天的車趟不用排
    if (it.d1 < -LOOK_BACK || it.d0 > 1440 + LOOK_AHEAD) continue
    items.push(it)
  }
  items.sort((a, b) => a.d0 - b.d0)
  // 各碼頭可以開始進場的時刻(上一台離開碼頭再駛離之後)
  const free: Record<Dir, number[]> = {
    in: Array(hub.inDocks).fill(-Infinity),
    out: Array(hub.outDocks).fill(-Infinity),
  }
  const yardFree: number[] = []
  for (const it of items) {
    const docks = free[it.dir]
    let i = docks.findIndex((f) => f <= it.d0 - MOVE_MIN)
    if (i < 0) {
      i = docks.indexOf(Math.min(...docks))
      const wait = docks[i] + MOVE_MIN - it.d0
      it.d0 += wait
      it.d1 += wait
      if (wait > MOVE_MIN) {
        it.q0 = it.d0 - wait
        let y = yardFree.findIndex((f) => f <= it.q0 - MOVE_MIN)
        if (y < 0) { y = yardFree.length; yardFree.push(0) }
        it.yard = y
        yardFree[y] = it.d0
      } else it.q0 = it.d0
    }
    it.dock = i
    docks[i] = it.d1 + MOVE_MIN
  }
  // 只留下和當天 00:00–24:00 有重疊的(含進出場行駛時間)
  return items.filter((it) => it.q0 - MOVE_MIN < 1440 && it.d1 + MOVE_MIN > 0)
}

// 資料上的發車或抵達落在檢視日當天的車趟
export function inDay(it: HubTrip): boolean {
  return it.ev >= 0 && it.ev < 1440
}

// 一天中碼頭最忙的時刻,切換轉運中心或日期時用來決定預設時間
export function busiestMinute(items: HubTrip[]): number {
  const occ = new Array(1440).fill(0)
  for (const it of items) for (let m = Math.max(0, Math.floor(it.d0)); m < Math.min(1440, it.d1); m++) occ[m]++
  let best = 0
  for (let m = 1; m < 1440; m++) if (occ[m] > occ[best]) best = m
  return best
}

export function truckLength(tn: number): number {
  if (tn >= 25) return 12
  if (tn > 17) return 9.5
  return 8.5
}

export type Phase = 'approach' | 'queue' | 'dock' | 'leave'

export interface Pose {
  x: number
  z: number
  yaw: number
  phase: Phase
  p: number // 靠碼頭期間的進度 0–1
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const YAW_PX = 0 // 車頭朝 +x
const YAW_PZ = -Math.PI / 2 // 車頭朝 +z

export function dockPoint(hub: HubLayout, dir: Dir, dock: number, L: number) {
  if (dir === 'out') {
    const x = -hub.W / 2 + MARGIN + DOCK * (dock + 0.5)
    return { x, z: hub.D / 2 + L / 2 + 0.6, yaw: YAW_PZ }
  }
  const z = -hub.D / 2 + MARGIN + DOCK * (dock + 0.5)
  return { x: hub.W / 2 + L / 2 + 0.6, z, yaw: YAW_PX }
}

export function yardPoint(hub: HubLayout, yard: number) {
  return { x: -hub.W / 2 + 6 + yard * 4.2, z: hub.D / 2 + ROAD_GAP + 14, yaw: YAW_PZ }
}

// 沿折線等速移動,k 為 0–1;rev 列出倒車的路段(車頭朝移動的反方向)
function along(pts: [number, number][], k: number, rev: number[] = []): { x: number; z: number; yaw: number } {
  const lens = pts.slice(1).map(([x, z], i) => Math.hypot(x - pts[i][0], z - pts[i][1]))
  let dist = Math.min(1, Math.max(0, k)) * lens.reduce((a, b) => a + b, 0)
  let i = 0
  while (i < lens.length - 1 && dist > lens[i]) dist -= lens[i++]
  const [ax, az] = pts[i]
  const [bx, bz] = pts[i + 1]
  const f = lens[i] > 0 ? dist / lens[i] : 1
  const yaw = Math.atan2(-(bz - az), bx - ax) + (rev.includes(i) ? Math.PI : 0)
  return { x: lerp(ax, bx, f), z: lerp(az, bz, f), yaw }
}

// 排隊車輛:沿道路開進臨時車位、等候,碼頭空出後倒出車位、開到碼頭倒車靠好
function queuePose(it: HubTrip, hub: HubLayout, s: number, L: number): Pose | null {
  const wait = it.d0 - it.q0
  const y = yardPoint(hub, it.yard)
  const d = dockPoint(hub, it.dir, it.dock, L)
  const roadZ = hub.D / 2 + ROAD_GAP
  const roadX = hub.W / 2 + ROAD_GAP
  if (s < 0) {
    const k = (s + MOVE_MIN) / MOVE_MIN
    const path: [number, number][] = it.dir === 'out'
      ? [[-hub.W / 2 - 70, roadZ], [y.x, roadZ], [y.x, y.z]]
      : [[roadX, -hub.D / 2 - 70], [roadX, roadZ], [y.x, roadZ], [y.x, y.z]]
    return { ...along(path, k), phase: 'approach', p: 0 }
  }
  if (s <= wait - MOVE_MIN) return { ...y, phase: 'queue', p: 0 }
  const k = (s - (wait - MOVE_MIN)) / MOVE_MIN
  if (it.dir === 'out') {
    return { ...along([[y.x, y.z], [y.x, roadZ], [d.x, roadZ], [d.x, d.z]], k, [0, 2]), phase: 'approach', p: 0 }
  }
  return { ...along([[y.x, y.z], [y.x, roadZ], [roadX, roadZ], [roadX, d.z], [d.x, d.z]], k, [0, 3]), phase: 'approach', p: 0 }
}

export function poseAt(it: HubTrip, hub: HubLayout, time: number): Pose | null {
  // 以抵達(排隊或靠碼頭)時刻為基準的相對時間
  const s0 = time - it.q0
  const wait = it.d0 - it.q0
  const s = s0 - wait
  const dur = it.d1 - it.d0
  if (s0 < -MOVE_MIN || s > dur + MOVE_MIN) return null
  const L = truckLength(it.t.eTn)
  if (it.yard >= 0 && s < 0) return queuePose(it, hub, s0, L)
  const d = dockPoint(hub, it.dir, it.dock, L)
  if (s >= 0 && s <= dur) return { ...d, phase: 'dock', p: s / dur }
  // 進場:沿道路開到碼頭前,再倒車靠碼頭;離場:開出到道路後駛離
  const approach = s < 0
  const k = approach ? (s + MOVE_MIN) / MOVE_MIN : (s - dur) / MOVE_MIN
  if (it.dir === 'out') {
    const roadZ = hub.D / 2 + ROAD_GAP
    if (approach) {
      if (k < 0.65) return { x: lerp(-hub.W / 2 - 70, d.x, k / 0.65), z: roadZ, yaw: YAW_PX, phase: 'approach', p: 0 }
      return { x: d.x, z: lerp(roadZ, d.z, (k - 0.65) / 0.35), yaw: YAW_PZ, phase: 'approach', p: 0 }
    }
    if (k < 0.35) return { x: d.x, z: lerp(d.z, roadZ, k / 0.35), yaw: YAW_PZ, phase: 'leave', p: 1 }
    return { x: lerp(d.x, hub.W / 2 + ROAD_GAP + 70, (k - 0.35) / 0.65), z: roadZ, yaw: YAW_PX, phase: 'leave', p: 1 }
  }
  const roadX = hub.W / 2 + ROAD_GAP
  if (approach) {
    if (k < 0.65) return { x: roadX, z: lerp(-hub.D / 2 - 70, d.z, k / 0.65), yaw: YAW_PZ, phase: 'approach', p: 0 }
    return { x: lerp(roadX, d.x, (k - 0.65) / 0.35), z: d.z, yaw: YAW_PX, phase: 'approach', p: 0 }
  }
  if (k < 0.35) return { x: lerp(d.x, roadX, k / 0.35), z: d.z, yaw: YAW_PX, phase: 'leave', p: 1 }
  return { x: roadX, z: lerp(d.z, hub.D / 2 + ROAD_GAP + 70, (k - 0.35) / 0.65), yaw: YAW_PZ, phase: 'leave', p: 1 }
}

export function phaseLabel(it: HubTrip, pose: Pose | null): string {
  if (!pose) return '不在場'
  if (pose.phase === 'approach') return '進場中'
  if (pose.phase === 'leave') return '離場中'
  if (pose.phase === 'queue') return '臨時車位排隊'
  return it.dir === 'out' ? '裝貨中' : '卸貨中'
}

export function dockLabel(it: HubTrip): string {
  return (it.dir === 'out' ? '發車 O' : '進站 I') + (it.dock + 1)
}

// 等碼頭的分鐘數(含不進臨時車位、只是晚一點進場的)
export function waitMin(it: HubTrip): number {
  return Math.round(it.d0 - (it.dir === 'out' ? it.ev - LOAD_MIN : it.ev))
}
