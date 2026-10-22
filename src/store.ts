import { create } from 'zustand'
import type { BucketCode, HubName, Mode, Region, TripType } from './data/types'

export type Selection = { kind: 'trip'; id: string } | { kind: 'node'; name: string } | null
export type Scope = 'day' | 'all'
export type View = 'hub' | 'network' | 'compare'
export type TonKey = '17' | '18.5' | '35'

export interface FocusGoal {
  x: number
  z: number
  dist: number
  seq: number
}

interface State {
  view: View
  hub: HubName
  adopted: Record<string, true> // 已採納的建議(以併車組 gid 或派車單號為鍵)
  showLabels: boolean
  groupFilter: string | null // 轉運中心視角的歸因群組篩選
  date: string
  scope: Scope
  time: number // 當日分鐘
  playing: boolean
  speed: number // 每秒推進的模擬分鐘
  mode: Mode
  includeWindow: boolean
  types: Record<TripType, boolean>
  tons: Record<TonKey, boolean>
  onlyLow: boolean
  bucketFilter: BucketCode | null
  region: Region
  selected: Selection
  hovered: string | null
  reasons: Record<string, string>
  focus: FocusGoal | null

  setView: (v: View) => void
  setHub: (h: HubName) => void
  toggleAdopt: (key: string) => void
  adoptMany: (keys: string[]) => void
  clearAdopted: () => void
  setShowLabels: (v: boolean) => void
  setGroupFilter: (g: string | null) => void
  setDate: (d: string) => void
  setScope: (s: Scope) => void
  setTime: (t: number) => void
  setPlaying: (p: boolean) => void
  setSpeed: (s: number) => void
  setMode: (m: Mode) => void
  setIncludeWindow: (v: boolean) => void
  toggleType: (t: TripType) => void
  toggleTon: (t: TonKey) => void
  setOnlyLow: (v: boolean) => void
  setBucketFilter: (b: BucketCode | null) => void
  setRegion: (r: Region) => void
  select: (s: Selection) => void
  setHovered: (id: string | null) => void
  setReason: (tripId: string, code: string) => void
  focusOn: (x: number, z: number, dist: number) => void
}

export const useStore = create<State>((set) => ({
  view: new URLSearchParams(window.location.search).get('view') === 'compare' ? 'compare' : 'hub',
  hub: '北轉',
  adopted: {},
  showLabels: false,
  groupFilter: null,
  date: '2026-06-24',
  scope: 'day',
  time: 23 * 60 + 30,
  playing: false,
  speed: 5,
  mode: 'current',
  includeWindow: false,
  types: { c: true, t: true, d: true },
  tons: { '17': true, '18.5': true, '35': true },
  onlyLow: false,
  bucketFilter: null,
  region: 'all',
  selected: null,
  hovered: null,
  reasons: {},
  focus: null,

  setView: (view) => set({ view, selected: null, bucketFilter: null }),
  setHub: (hub) => set({ hub, selected: null, groupFilter: null }),
  toggleAdopt: (key) =>
    set((s) => {
      const adopted = { ...s.adopted }
      if (adopted[key]) delete adopted[key]
      else adopted[key] = true
      return { adopted }
    }),
  adoptMany: (keys) => set((s) => ({ adopted: { ...s.adopted, ...Object.fromEntries(keys.map((k) => [k, true as const])) } })),
  clearAdopted: () => set({ adopted: {} }),
  setShowLabels: (showLabels) => set({ showLabels }),
  setGroupFilter: (groupFilter) => set({ groupFilter }),
  setDate: (date) => set({ date, selected: null }),
  setScope: (scope) => set({ scope }),
  setTime: (time) => set({ time: ((time % 1440) + 1440) % 1440 }),
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
  setMode: (mode) => set({ mode }),
  setIncludeWindow: (includeWindow) => set({ includeWindow }),
  toggleType: (t) => set((s) => ({ types: { ...s.types, [t]: !s.types[t] } })),
  toggleTon: (t) => set((s) => ({ tons: { ...s.tons, [t]: !s.tons[t] } })),
  setOnlyLow: (onlyLow) => set({ onlyLow }),
  setBucketFilter: (bucketFilter) => set({ bucketFilter }),
  setRegion: (region) => set({ region }),
  select: (selected) => set({ selected }),
  setHovered: (hovered) => set({ hovered }),
  setReason: (tripId, code) => set((s) => ({ reasons: { ...s.reasons, [tripId]: code } })),
  focusOn: (x, z, dist) => set((s) => ({ focus: { x, z, dist, seq: (s.focus?.seq ?? 0) + 1 } })),
}))
