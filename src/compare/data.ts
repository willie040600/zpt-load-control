import raw from '../data/prompt-comparison.json'
import { TRIPS, addDays } from '../data/load'
import type { EffTrip, HubName, RawTrip } from '../data/types'
import { effective } from '../lib/effective'
import { HUBS, hubOf, inDay, schedule } from '../hub/layout'
import type { HubDay } from '../hub/useHub'

export type ScenarioKey = 'A' | 'B' | 'C' | 'D'
export type CompareMode = 'current' | 'legacy' | ScenarioKey
export interface PlanTrip extends RawTrip { sourceId?: string; groupId?: string }
export interface GroupResult {
  groupId: string; date: string; lane: string; temp: string; bucket: number; ids: string[]
  current: number; cost: number; saving: number; cages: number; demand: number
  fixed: number; freeCapacity: number; mix: Record<string, number>; rates: Record<string, number>
}
export interface Scenario {
  label: string; cost: number; saving: number; savingPct: number; monthly: number; annual: number
  updates: Record<string, { removed?: boolean; n?: number }>; added: PlanTrip[]; groups: GroupResult[]
}
interface Baseline { n: number; c: number; lr: number; cap: number; bd: string; lane: string; temp: string }
interface ComparisonData {
  algorithmName: string
  parameters: { windowHours: number; cap35: number; cap17: number; minCarrierSamples: number; carrierShift: number }
  audit: {
    rawRows: number; trips: number; rawCost: number; baselineCost: number; allocatedCost: number
    duplicateCost: number; operationDays: number; start: string; end: string; missingDates: string[]
    capacityAnomalies: number; overloadedTrips: number; fixedCost: number; fixedTrips: number; freeLoadedTrips: number
  }
  baseline: Record<string, Baseline>; scenarios: Record<ScenarioKey, Scenario>
  validation: { name: string; value: number; threshold: string; passed: boolean }[]
  sensitivity: { multiplier: number | null; limit: number | null; used35: number; cost: number; saving: number; savingPct: number }[]
  decomposition: { source: string; saving: number }[]; limitations: string[]
}

export const COMPARISON = raw as unknown as ComparisonData
export const BUSINESS_DATES = [...new Set(Object.values(COMPARISON.baseline).map((t) => t.bd))].sort()
// 既有建議與新演算法都從相同的去重成本、貨量與單號出發。
const BASE = TRIPS.map((t) => ({ ...t, ...COMPARISON.baseline[t.id] }))
const cache = new Map<CompareMode, EffTrip[]>()

export function sourceOf(t: RawTrip): string { return (t as PlanTrip).sourceId ?? t.id }
export function businessDate(t: RawTrip): string { return COMPARISON.baseline[sourceOf(t)].bd }

export function comparisonTrips(mode: CompareMode): EffTrip[] {
  const cached = cache.get(mode)
  if (cached) return cached
  let trips: EffTrip[]
  if (mode === 'current' || mode === 'legacy') {
    trips = BASE.map((t) => effective(t, mode === 'legacy' ? 'recommended' : 'current', false))
  } else {
    const plan = COMPARISON.scenarios[mode]
    trips = BASE.map((t) => {
      const update = plan.updates[t.id]
      const e = effective(t, 'current', false)
      if (!update) return e
      const n = update.n ?? e.n
      return { ...e, eN: update.removed ? 0 : n, eC: update.removed ? 0 : e.c,
        eLr: update.removed ? 0 : n / e.cap * 100, removed: !!update.removed, changed: true }
    })
    trips.push(...plan.added.map((t) => ({ ...effective(t, 'current', false), changed: true })))
  }
  cache.set(mode, trips)
  return trips
}

export function scopedTrips(mode: CompareMode, date: string, scope: 'day' | 'all', hub: HubName | 'all'): EffTrip[] {
  return comparisonTrips(mode).filter((t) => (scope === 'all' || businessDate(t) === date) && (hub === 'all' || hubOf(t) === hub))
}

export function sceneDay(mode: CompareMode, date: string, hub: HubName): HubDay {
  const offsets = new Map([[addDays(date, -1), -1440], [date, 0], [addDays(date, 1), 1440]])
  const entries = comparisonTrips(mode).filter((t) => offsets.has(t.d) && (t.o === hub || t.x === hub))
    .map((t) => ({ t, off: offsets.get(t.d)! }))
  const items = schedule(entries, HUBS[hub])
  return { items, dayItems: items.filter(inDay), all: scopedTrips(mode, date, 'day', hub), base: scopedTrips('current', date, 'day', hub) }
}

export function stats(trips: EffTrip[]) {
  const live = trips.filter((t) => !t.removed)
  const cages = live.reduce((s, t) => s + t.eN, 0)
  const cap = live.reduce((s, t) => s + t.eCap, 0)
  return { cost: live.reduce((s, t) => s + t.eC, 0), trips: live.length, cages,
    load: cap ? cages / cap * 100 : 0, paid35: live.filter((t) => t.eTn === 35 && t.eC > 0 && t.eN > 0).length }
}
