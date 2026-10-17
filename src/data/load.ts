import raw from './trips.json'
import type { RawTrip } from './types'

export const TRIPS = raw as RawTrip[]

export const TRIPS_BY_DATE = new Map<string, RawTrip[]>()
for (const t of TRIPS) {
  const list = TRIPS_BY_DATE.get(t.d)
  if (list) list.push(t)
  else TRIPS_BY_DATE.set(t.d, [t])
}

export const DATES = [...TRIPS_BY_DATE.keys()].sort()

export const TRIP_BY_ID = new Map(TRIPS.map((t) => [t.id, t]))

export const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六']

export function weekdayOf(date: string): number {
  return new Date(date + 'T00:00:00').getDay()
}
