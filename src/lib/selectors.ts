import { useMemo } from 'react'
import { NODES } from '../data/nodes'
import { TRIPS, TRIPS_BY_DATE } from '../data/load'
import type { EffTrip, RawTrip, Region } from '../data/types'
import { useStore, type TonKey } from '../store'
import { effective } from './effective'

export function tonKey(tn: number): TonKey {
  if (tn >= 25) return '35'
  if (tn > 17) return '18.5'
  return '17'
}

export function inRegion(t: RawTrip, region: Region): boolean {
  if (region === 'all') return true
  return NODES[t.o]?.region === region || NODES[t.x]?.region === region
}

// KPI 與柏拉圖用:依範圍(當日/全期間)、區域、類型、噸級篩選
export function useScopeTrips(): EffTrip[] {
  const { date, scope, region, types, tons, mode, includeWindow } = useStore()
  return useMemo(() => {
    const src = scope === 'day' ? TRIPS_BY_DATE.get(date) ?? [] : TRIPS
    return src
      .filter((t) => types[t.ty] && tons[tonKey(t.tn)] && inRegion(t, region))
      .map((t) => effective(t, mode, includeWindow))
  }, [date, scope, region, types, tons, mode, includeWindow])
}

// 同一範圍的「現況」版本,用來和建議模式比較
export function useScopeBaseline(): EffTrip[] {
  const { date, scope, region, types, tons } = useStore()
  return useMemo(() => {
    const src = scope === 'day' ? TRIPS_BY_DATE.get(date) ?? [] : TRIPS
    return src
      .filter((t) => types[t.ty] && tons[tonKey(t.tn)] && inRegion(t, region))
      .map((t) => effective(t, 'current', false))
  }, [date, scope, region, types, tons])
}

// 3D 場景用:當日車趟,不受區域限制
export function useSceneTrips(): EffTrip[] {
  const { date, types, tons, onlyLow, mode, includeWindow } = useStore()
  return useMemo(() => {
    const src = TRIPS_BY_DATE.get(date) ?? []
    return src
      .filter((t) => types[t.ty] && tons[tonKey(t.tn)] && (!onlyLow || t.lr < 80))
      .map((t) => effective(t, mode, includeWindow))
  }, [date, types, tons, onlyLow, mode, includeWindow])
}

export function fmtMoney(n: number): string {
  if (Math.abs(n) >= 10000) return (n / 10000).toFixed(n >= 1e6 ? 0 : 1) + ' 萬'
  return Math.round(n).toLocaleString('zh-TW')
}

export function fmtTime(min: number): string {
  const m = Math.floor(((min % 1440) + 1440) % 1440)
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0')
}
