import { nodeXZ } from '../data/nodes'

export const ISLAND_TOP = 1.2

export interface Curve {
  ax: number
  az: number
  cx: number
  cz: number
  bx: number
  bz: number
}

const cache = new Map<string, Curve>()

// 起訖點之間的二次貝茲曲線;往右偏移,讓去程與回程分開
export function routeCurve(o: string, x: string): Curve {
  const key = o + '>' + x
  const hit = cache.get(key)
  if (hit) return hit
  const [ax, az] = nodeXZ(o)
  const [bx, bz] = nodeXZ(x)
  const dx = bx - ax
  const dz = bz - az
  const len = Math.hypot(dx, dz) || 1
  const off = Math.min(6, len * 0.12)
  const curve = {
    ax, az, bx, bz,
    cx: (ax + bx) / 2 + (-dz / len) * off,
    cz: (az + bz) / 2 + (dx / len) * off,
  }
  cache.set(key, curve)
  return curve
}

export function pointAt(c: Curve, t: number): [number, number] {
  const u = 1 - t
  return [u * u * c.ax + 2 * u * t * c.cx + t * t * c.bx, u * u * c.az + 2 * u * t * c.cz + t * t * c.bz]
}

export function tangentAt(c: Curve, t: number): [number, number] {
  const u = 1 - t
  return [2 * u * (c.cx - c.ax) + 2 * t * (c.bx - c.cx), 2 * u * (c.cz - c.az) + 2 * t * (c.bz - c.cz)]
}

// 依時間算行駛進度(0–1);不在路上回傳 -1。
// carry 是前一天發車、跨午夜後仍在路上的車趟:發車時刻 h 屬於前一天
export function progressAt(h: number, du: number, time: number, carry = false): number {
  const dt = time - (carry ? h - 1440 : h)
  if (dt < 0 || dt > du) return -1
  return dt / du
}
