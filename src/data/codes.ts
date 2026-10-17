import type { BucketCode, RawTrip, TripType } from './types'

export const TYPE_LABEL: Record<TripType, string> = { c: '集貨', t: '轉運', d: '繼送' }

export type BucketGroup = 'structural' | 'vehicle' | 'merge' | 'pool' | 'other'

export const GROUP_LABEL: Record<BucketGroup, string> = {
  structural: '結構性(派車改不了)',
  vehicle: '車型錯配',
  merge: '同站/跨站併車',
  pool: '時窗受限(需先調整發車時間)',
  other: '需預排資料判定',
}

export const BUCKETS: Record<Exclude<BucketCode, 'OK'>, { label: string; group: BucketGroup }> = {
  '1A': { label: '低溫/特殊溫層', group: 'structural' },
  '1B': { label: '偏遠/外島/港口機場', group: 'structural' },
  '1C': { label: '補空/收空調度', group: 'structural' },
  '2A1': { label: '35T 載 ≤14 籠,可改 17T', group: 'vehicle' },
  '2A2': { label: '35T 小量但為成套價', group: 'vehicle' },
  '2B': { label: '35T 小量,17T 少用需確認', group: 'vehicle' },
  '2C': { label: '35T 小量,同線從未用 17T', group: 'vehicle' },
  '3A': { label: '同站同日多趟,時差 ≤30 分', group: 'merge' },
  '3B': { label: '同站同日多趟,時差 30–120 分', group: 'pool' },
  '3C': { label: '同站同日多趟,時間分散', group: 'pool' },
  '4A': { label: '跨站共車,時差 ≤30 分', group: 'merge' },
  '4B': { label: '跨站共車,時差 30–120 分', group: 'pool' },
  '5': { label: '週日貨少', group: 'other' },
  '6': { label: '其他(需預排資料)', group: 'other' },
}

// 數字開頭的鍵在 Object.keys 會被排到最前面,所以明確列出順序
export const BUCKET_ORDER: Exclude<BucketCode, 'OK'>[] = [
  '1A', '1B', '1C', '2A1', '2A2', '2B', '2C', '3A', '3B', '3C', '4A', '4B', '5', '6',
]

// 各歸因群組在圖表上的顏色(與裝載率紅綠色系分開)
export const GROUP_COLOR: Record<BucketGroup, string> = {
  structural: '#7c8a99',
  vehicle: '#f5a524',
  merge: '#e8743b',
  pool: '#b58cf0',
  other: '#4d6275',
}

// 現場回填用原因代碼(SOP 簡報)
export const REASON_CODES: { code: string; label: string }[] = [
  { code: 'A1', label: '貨量異常增加' },
  { code: 'A2', label: '站所臨時回報' },
  { code: 'A3', label: '車型限制' },
  { code: 'A4', label: '低溫/特殊貨' },
  { code: 'A5', label: '時效要求' },
  { code: 'A6', label: '籠車/載具異常' },
  { code: 'A7', label: '車隊異常' },
  { code: 'R1', label: '低溫/特殊溫層' },
  { code: 'R2', label: '交換櫃/回空/空桶' },
  { code: 'R3', label: '外島/港口/機場時效' },
  { code: 'R4', label: '場地限制' },
  { code: 'R5', label: '共車後影響時效' },
  { code: 'R6', label: '跨區限制' },
  { code: 'R7', label: '跨日異常車趟' },
  { code: 'R8', label: '補空/載具調撥' },
  { code: 'R9', label: '系統分類需確認' },
]

// 依歸因代碼預設建議的原因代碼
export const DEFAULT_REASON: Partial<Record<BucketCode, string>> = {
  '1A': 'R1', '1B': 'R3', '1C': 'R8', '2C': 'R4', '3C': 'R5', '4B': 'R5',
}

const fmt = (n: number) => n.toLocaleString('zh-TW')

export function suggestion(t: RawTrip): string {
  switch (t.bk) {
    case 'OK': return '裝載率達 80% 以上,維持預排。'
    case '1A': return '低溫車不可與常溫貨混載,列為不可減(R1)。'
    case '1B': return '偏遠或外島線,派車層面難以改善;建議改談計價方式(按籠計價或最低保證)或固定班次。'
    case '1C': return '車上載有補空/收空籠車,屬載具調度;建議納入南北籠車平衡規劃。'
    case '2A1': return `同線已常態使用 17 噸,改派 17 噸約 ${fmt(t.nC ?? 0)} 元,這一趟可省 ${fmt(t.sv ?? 0)} 元。`
    case '2A2': return '同線雖有 17 噸,但 35 噸為成套價,換車反而更貴,建議維持。'
    case '2B': return `同線 17 噸只出現過幾次${t.p17 ? `(約 ${fmt(t.p17)} 元)` : ''},先與車隊確認場地與時效再試。`
    case '2C': return '同線從未使用 17 噸,可能有貨櫃或場地限制;先向車隊確認並詢價。'
    case '3A': return t.act === 'dr' ? '與同站同時段的車趟合併,這一趟可以不用開。' : '與同站同時段的車趟合併,由這台車一起載。'
    case '3B': return '同站同日有其他車趟,但發車時差 30–120 分;先把發車時間壓到 30 分內才可併。'
    case '3C': return '同站同日有其他車趟,但發車時間差距大(不同波次),理論上可併,實務上時窗不允許。'
    case '4A': return t.act === 'dr' ? '可與同方向的其他站所共車(時差 ≤30 分),這一趟可以不用開。' : '可與同方向的其他站所共車(時差 ≤30 分)。'
    case '4B': return '可與其他站所共車,但時差 30–120 分;需先調整發車時窗。'
    case '5': return '週日貨少,建議依週日繼送同區合併規則處理。'
    case '6': return '沒有明顯可併的對象,可能是預估誤差或合理尾趟;需要預排資料才能判定。'
  }
}
