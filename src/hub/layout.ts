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

export interface HubTrip {
  t: EffTrip
  dir: Dir
  dock: number // 碼頭序號;碼頭滿時為 -1,停在臨時車位
  yard: number // 臨時車位序號
  ev: number // 發車或抵達時刻(分鐘)
  d0: number // 靠碼頭開始
  d1: number // 離開碼頭
}

export function directionOf(t: EffTrip, hub: HubLayout): Dir | null {
  if (t.o === hub.name) return 'out'
  if (t.x === hub.name) return 'in'
  return null
}

// 依時間順序把車趟分到碼頭;沒有空碼頭時停到臨時車位
export function schedule(trips: EffTrip[], hub: HubLayout): HubTrip[] {
  const items: HubTrip[] = []
  for (const t of trips) {
    if (t.removed) continue
    const dir = directionOf(t, hub)
    if (!dir) continue
    if (dir === 'out') items.push({ t, dir, dock: -1, yard: -1, ev: t.h, d0: t.h - LOAD_MIN, d1: t.h })
    else {
      const arr = (t.h + t.du) % 1440
      items.push({ t, dir, dock: -1, yard: -1, ev: arr, d0: arr, d1: arr + UNLOAD_MIN })
    }
  }
  items.sort((a, b) => a.d0 - b.d0)
  const free: Record<Dir, number[]> = {
    in: Array(hub.inDocks).fill(-Infinity),
    out: Array(hub.outDocks).fill(-Infinity),
  }
  const yardFree: number[] = []
  for (const it of items) {
    const docks = free[it.dir]
    const i = docks.findIndex((f) => f <= it.d0 - MOVE_MIN)
    if (i >= 0) {
      it.dock = i
      docks[i] = it.d1 + MOVE_MIN
    } else {
      let y = yardFree.findIndex((f) => f <= it.d0)
      if (y < 0) { y = yardFree.length; yardFree.push(0) }
      it.yard = y
      yardFree[y] = it.d1
    }
  }
  return items
}

// 一天中碼頭最忙的時刻,切換轉運中心時用來決定預設時間
export function busiestMinute(items: HubTrip[]): number {
  const occ = new Array(1440).fill(0)
  for (const it of items) for (let m = it.d0; m < it.d1; m++) occ[((m % 1440) + 1440) % 1440]++
  let best = 0
  for (let m = 1; m < 1440; m++) if (occ[m] > occ[best]) best = m
  return best
}

export function truckLength(tn: number): number {
  if (tn >= 25) return 12
  if (tn > 17) return 9.5
  return 8.5
}

export type Phase = 'approach' | 'dock' | 'leave'

export interface Pose {
  x: number
  z: number
  yaw: number
  phase: Phase
  p: number // 靠碼頭期間的進度 0–1
}

// 把時間差換算到 (−720, 720] 之間,處理跨午夜
function rel(time: number, at: number): number {
  let d = time - at
  while (d > 720) d -= 1440
  while (d <= -720) d += 1440
  return d
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

export function poseAt(it: HubTrip, hub: HubLayout, time: number): Pose | null {
  const s = rel(time, it.d0)
  const dur = it.d1 - it.d0
  if (s < -MOVE_MIN || s > dur + MOVE_MIN) return null
  const L = truckLength(it.t.eTn)
  if (it.dock < 0) {
    if (s < 0 || s > dur) return null
    const y = yardPoint(hub, it.yard)
    return { ...y, phase: 'dock', p: s / dur }
  }
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
  if (it.dock < 0) return '臨時車位等候'
  return it.dir === 'out' ? '裝貨中' : '卸貨中'
}

export function dockLabel(it: HubTrip): string {
  if (it.dock < 0) return '臨時車位'
  return (it.dir === 'out' ? '發車 O' : '進站 I') + (it.dock + 1)
}
