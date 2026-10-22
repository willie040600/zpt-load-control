import raw from './trips.json'
import meta from './meta.json'
import type { RawTrip } from './types'

export const TRIPS = raw as RawTrip[]

// 車趟的日期是實際出發的日曆日期(不是作業日期)
export const TRIPS_BY_DATE = new Map<string, RawTrip[]>()
for (const t of TRIPS) {
  const list = TRIPS_BY_DATE.get(t.d)
  if (list) list.push(t)
  else TRIPS_BY_DATE.set(t.d, [t])
}

export const DATES = [...TRIPS_BY_DATE.keys()].sort()

// 資料不完整的日期:缺前一天或當天的作業日資料(例如 7/11 整天沒有資料)
export const PARTIAL_DATES = new Set<string>(meta.partialDates)

export const TRIP_BY_ID = new Map(TRIPS.map((t) => [t.id, t]))

// 同一組併車的所有車趟;同組車趟可能跨日期
export const TRIPS_BY_GID = new Map<string, RawTrip[]>()
for (const t of TRIPS) {
  if (!t.gid) continue
  const list = TRIPS_BY_GID.get(t.gid)
  if (list) list.push(t)
  else TRIPS_BY_GID.set(t.gid, [t])
}

export const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六']

export function weekdayOf(date: string): number {
  return new Date(date + 'T00:00:00').getDay()
}

export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// 下拉選單的日期標籤
export function dateLabel(d: string): string {
  return `${d.slice(5).replace('-', '/')}(週${WEEKDAY[weekdayOf(d)]})${PARTIAL_DATES.has(d) ? ' 資料不完整' : ''}`
}

// 檢視日前後一天的車趟;off 是該車趟的日期相對檢視日的分鐘偏移(−1440、0、+1440)。
// 轉運中心視角用它畫出跨午夜的進出,時間軸是連續的,不會把隔天凌晨接回當天
export interface Placed {
  t: RawTrip
  off: number
}

export function placedTrips(date: string): Placed[] {
  const out: Placed[] = []
  for (const [d, off] of [[addDays(date, -1), -1440], [date, 0], [addDays(date, 1), 1440]] as const) {
    for (const t of TRIPS_BY_DATE.get(d) ?? []) out.push({ t, off })
  }
  return out
}
