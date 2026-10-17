import { useMemo } from 'react'
import { TRIPS_BY_DATE } from '../data/load'
import type { EffTrip, RawTrip } from '../data/types'
import { effective } from '../lib/effective'
import { useStore } from '../store'
import type { HubName } from '../data/types'
import { HUBS, busiestMinute, hubOf, schedule, type HubTrip } from './layout'

export interface HubDay {
  all: EffTrip[] // 套用已採納建議後
  base: EffTrip[] // 現況
  items: HubTrip[] // 場景中的車趟(含碼頭分配)
}

// 場景車趟:實際發車或到著為本中心的車趟,不論結帳單位(KPI 才依結帳單位計)
function sceneSource(trips: RawTrip[], hub: HubName): RawTrip[] {
  return trips.filter((t) => t.o === hub || t.x === hub)
}

// 切換轉運中心或日期時,跳到該中心當天碼頭最忙的時刻
export function jumpToBusiest(date: string, hub: HubName) {
  const src = sceneSource(TRIPS_BY_DATE.get(date) ?? [], hub).map((t) => effective(t, 'current', false))
  useStore.getState().setTime(busiestMinute(schedule(src, HUBS[hub])))
}

export function useHubDay(): HubDay {
  const date = useStore((s) => s.date)
  const hub = useStore((s) => s.hub)
  const types = useStore((s) => s.types)
  const onlyLow = useStore((s) => s.onlyLow)
  const adopted = useStore((s) => s.adopted)
  return useMemo(() => {
    const day = (TRIPS_BY_DATE.get(date) ?? []).filter((t) => types[t.ty])
    const src = day.filter((t) => hubOf(t) === hub)
    const all = src.map((t) => effective(t, 'current', false, adopted))
    const base = src.map((t) => effective(t, 'current', false))
    const scene = sceneSource(day, hub).map((t) => effective(t, 'current', false, adopted))
    const items = schedule(onlyLow ? scene.filter((t) => t.lr < 80) : scene, HUBS[hub])
    return { all, base, items }
  }, [date, hub, types, onlyLow, adopted])
}
