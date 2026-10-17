import type { EffTrip } from '../data/types'
import { emptyCost } from './effective'

export interface Kpis {
  trips: number
  removed: number
  avgLr: number
  pctStandard: number
  low: number
  emptyCost: number
  cost: number
  baseCost: number
  savingVerified: number
  savingWindow: number
}

export function computeKpis(list: EffTrip[]): Kpis {
  let trips = 0, removed = 0, sumLr = 0, standard = 0, low = 0, empty = 0, cost = 0, baseCost = 0
  let savingVerified = 0, savingWindow = 0
  for (const t of list) {
    baseCost += t.c
    if (t.act && t.sv) {
      if (t.tier === 'v') savingVerified += t.sv
      else savingWindow += t.sv
    }
    if (t.removed) { removed++; continue }
    trips++
    sumLr += Math.min(t.eLr, 100)
    if (t.eLr >= 90) standard++
    if (t.eLr < 80) {
      low++
      // 只計低裝載車趟的空載,與第 0 步分析口徑一致
      empty += emptyCost(t)
    }
    cost += t.eC
  }
  return {
    trips,
    removed,
    avgLr: trips ? sumLr / trips : 0,
    pctStandard: trips ? (standard / trips) * 100 : 0,
    low,
    emptyCost: empty,
    cost,
    baseCost,
    savingVerified,
    savingWindow,
  }
}
