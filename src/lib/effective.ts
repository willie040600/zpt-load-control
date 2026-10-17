import type { EffTrip, Mode, RawTrip } from '../data/types'

// 建議的採納鍵:併車以整組為單位,改派車型以單趟為單位
export function adoptKey(t: RawTrip): string {
  return t.gid ?? t.id
}

export function isApplied(t: RawTrip, mode: Mode, includeWindow: boolean, adopted?: Record<string, true>): boolean {
  if (!t.act) return false
  if (adopted?.[adoptKey(t)]) return true
  if (mode !== 'recommended') return false
  return t.tier === 'v' || (t.tier === 'w' && includeWindow)
}

export function effective(t: RawTrip, mode: Mode, includeWindow: boolean, adopted?: Record<string, true>): EffTrip {
  if (!isApplied(t, mode, includeWindow, adopted)) {
    return { ...t, removed: false, changed: false, eTn: t.tn, eCap: t.cap, eN: t.n, eLr: t.lr, eC: t.c }
  }
  if (t.act === 'dr') {
    return { ...t, removed: true, changed: true, eTn: t.tn, eCap: t.cap, eN: 0, eLr: 0, eC: 0 }
  }
  const cap = t.nCap ?? t.cap
  const n = t.nN ?? t.n
  return {
    ...t,
    removed: false,
    changed: true,
    eTn: t.nTn ?? t.tn,
    eCap: cap,
    eN: n,
    eLr: Math.round((n / cap) * 1000) / 10,
    eC: t.nC ?? t.c,
  }
}

export function emptyCost(t: EffTrip): number {
  if (t.removed) return 0
  return t.eC * (1 - Math.min(t.eLr, 100) / 100)
}

export type LoadLevel = 'good' | 'watch' | 'bad'

export function loadLevel(lr: number): LoadLevel {
  if (lr >= 90) return 'good'
  if (lr >= 80) return 'watch'
  return 'bad'
}

// 卡車顏色等級:沒載貨(總籠數 0,只載空籠車回送)的空車一律灰色,
// 不看系統裝載率(系統裝載率會把空籠車算進去)
export type TruckLevel = LoadLevel | 'empty'

export function isEmptyRun(t: EffTrip): boolean {
  return !t.removed && t.eN === 0
}

export function truckLevel(t: EffTrip): TruckLevel {
  return isEmptyRun(t) ? 'empty' : loadLevel(t.eLr)
}
