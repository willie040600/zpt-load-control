// 運輸類型:c 集貨、t 轉運、d 繼送
export type TripType = 'c' | 't' | 'd'

// 歸因代碼(第 0 步分析結果);OK 代表裝載率 ≥80%
export type BucketCode =
  | 'OK'
  | '1A' | '1B' | '1C'
  | '2A1' | '2A2' | '2B' | '2C'
  | '3A' | '3B' | '3C'
  | '4A' | '4B'
  | '5' | '6'

// 建議動作:sw 改派 17 噸、mg 併車後保留、dr 併車後取消
export type ActionKind = 'sw' | 'mg' | 'dr'

// v 已驗證(可立即執行)、w 時窗調整池(需先協調發車時間)
export type Tier = 'v' | 'w'

export interface RawTrip {
  id: string
  d: string // 作業日期 YYYY-MM-DD
  ty: TripType
  o: string // 發車單位
  x: string // 到著單位
  tn: number // 噸級
  cap: number // 可載籠數
  n: number // 總籠車數
  lr: number // 系統裝載率 %
  c: number // 車次費用
  h: number // 發車時刻(當日分鐘)
  du: number // 任務時間(分鐘)
  bk: BucketCode
  emp: number // 空載成本估計 = 費用 × (1 − 裝載率)
  cr: string // 承運廠商
  cold?: 1
  ec?: number // 補空 + 收空籠車
  act?: ActionKind
  tier?: Tier
  gid?: string // 同一組併車
  sv?: number // 這一趟的可省金額(可為負:併車加價)
  nTn?: number
  nCap?: number
  nN?: number
  nC?: number
  p17?: number
  bh: BillUnit // 結帳單位(負責的轉運中心)
  rg?: Partial<Record<string, number>> // 籠車去向:各區籠數
}

// 結帳單位只有三個,桃轉的車趟結帳在北轉
export type BillUnit = '北轉' | '中轉' | '高轉'

// 轉運中心視角的四座轉運中心
export type HubName = BillUnit | '桃轉'

export type Region = 'all' | 'north' | 'central' | 'south' | 'east'

export interface NodeInfo {
  name: string
  lon: number
  lat: number
  hub: boolean
  region: Region
}

// 套用模式後實際呈現的車趟
export interface EffTrip extends RawTrip {
  removed: boolean // 建議模式下被併掉的車
  changed: boolean // 建議模式下車型或籠數有變
  eTn: number
  eCap: number
  eN: number
  eLr: number
  eC: number
  carry?: boolean // 前一天發車、跨午夜後仍在路上的車趟(全台視角用)
}

export type Mode = 'current' | 'recommended'
