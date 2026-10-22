import { useMemo } from 'react'
import { TRIPS_BY_DATE, placedTrips } from '../data/load'
import type { EffTrip, HubName } from '../data/types'
import { effective } from '../lib/effective'
import { useStore } from '../store'
import { HUBS, busiestMinute, hubOf, inDay, schedule, type HubEntry, type HubTrip } from './layout'

export interface HubDay {
  all: EffTrip[] // 套用已採納建議後
  base: EffTrip[] // 現況
  items: HubTrip[] // 場景中的車趟(含碼頭分配,含前後一天跨午夜的進出)
  dayItems: HubTrip[] // items 中資料上的發車或抵達落在當天的
}

// 場景車趟:實際發車或到著為本中心的車趟,不論結帳單位(KPI 才依結帳單位計),
// 含前後一天的車趟,讓跨午夜的進出與碼頭占用接得起來
function sceneEntries(date: string, hub: HubName, keep: (t: EffTrip) => boolean, adopted?: Record<string, true>): HubEntry[] {
  return placedTrips(date)
    .filter(({ t }) => t.o === hub || t.x === hub)
    .map(({ t, off }) => ({ t: effective(t, 'current', false, adopted), off }))
    .filter(({ t }) => keep(t))
}

// 切換轉運中心或日期時,跳到該中心當天碼頭最忙的時刻
export function jumpToBusiest(date: string, hub: HubName) {
  const entries = sceneEntries(date, hub, () => true)
  useStore.getState().setTime(busiestMinute(schedule(entries, HUBS[hub])))
}

export function useHubDay(): HubDay {
  const date = useStore((s) => s.date)
  const hub = useStore((s) => s.hub)
  const types = useStore((s) => s.types)
  const onlyLow = useStore((s) => s.onlyLow)
  const adopted = useStore((s) => s.adopted)
  return useMemo(() => {
    // KPI:當天發車的車趟,依結帳單位歸屬
    const src = (TRIPS_BY_DATE.get(date) ?? []).filter((t) => types[t.ty] && hubOf(t) === hub)
    const all = src.map((t) => effective(t, 'current', false, adopted))
    const base = src.map((t) => effective(t, 'current', false))
    const entries = sceneEntries(date, hub, (t) => types[t.ty] && (!onlyLow || t.lr < 80), adopted)
    const items = schedule(entries, HUBS[hub])
    return { all, base, items, dayItems: items.filter(inDay) }
  }, [date, hub, types, onlyLow, adopted])
}
