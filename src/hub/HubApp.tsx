import { useMemo } from 'react'
import { BUCKETS, DEFAULT_REASON, GROUP_COLOR, GROUP_LABEL, REASON_CODES, TYPE_LABEL, suggestion, type BucketGroup } from '../data/codes'
import { DATES, TRIPS_BY_DATE, TRIP_BY_ID, WEEKDAY, weekdayOf } from '../data/load'
import { TAIWAN_OUTLINE } from '../data/nodes'
import type { EffTrip, HubName, TripType } from '../data/types'
import { adoptKey, effective, emptyCost, isEmptyRun, truckLevel } from '../lib/effective'
import { computeKpis } from '../lib/kpi'
import { fmtMoney, fmtTime } from '../lib/selectors'
import { useStore } from '../store'
import { HubScene } from './HubScene'
import { HUBS, HUB_ORDER, dockLabel, hubOf, phaseLabel, poseAt, type HubTrip } from './layout'
import { jumpToBusiest, useHubDay } from './useHub'
import './hub.css'

const LEVEL_COLOR = { good: '#2fa866', watch: '#e8a317', bad: '#e0483e', empty: '#7d858f' } as const

// 裝載率文字;空車不顯示系統裝載率(含空籠車)
function lrText(t: EffTrip): string {
  return isEmptyRun(t) ? '空車' : `${Math.round(t.eLr)}%`
}
// 播放速度:1× = 每秒推進 5 分鐘
const SPEEDS = [
  { v: 2.5, label: '0.5×' },
  { v: 5, label: '1×' },
  { v: 10, label: '2×' },
]

function Delta({ now, base, unit = '', better = 'up', money = false }: {
  now: number; base: number; unit?: string; better?: 'up' | 'down'; money?: boolean
}) {
  const d = now - base
  if (Math.abs(d) < 0.05) return null
  const good = better === 'up' ? d > 0 : d < 0
  return (
    <span className={'hx-delta ' + (good ? 'good' : 'bad')}>
      {d > 0 ? '+' : '−'}{money ? fmtMoney(Math.abs(d)) : Math.abs(d).toFixed(unit === '%' ? 1 : 0)}{unit}
    </span>
  )
}

function TopBar() {
  const s = useStore()
  const { all, base, items } = useHubDay()
  const k = useMemo(() => computeKpis(all), [all])
  const b = useMemo(() => computeKpis(base), [base])
  const nIn = items.filter((i) => i.dir === 'in').length
  const nOut = items.filter((i) => i.dir === 'out').length
  const saved = b.cost - k.cost
  return (
    <header className="hx-top">
      <div className="hx-brand">
        <div className="hx-logo">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 2 3 7v10l9 5 9-5V7z" fill="#f0b23a" /><path d="M12 12 3 7l9-5 9 5z" fill="#ffd27a" /><path d="M12 12v10l9-5V7z" fill="#c98a12" /></svg>
        </div>
        <div>
          <div className="hx-brand-title">轉運中心指揮台</div>
          <div className="hx-brand-sub">ZPT LOAD CONTROL・{HUBS[s.hub].title}</div>
        </div>
      </div>
      <div className="hx-tabs">
        {HUB_ORDER.map((h) => (
          <button key={h} className={s.hub === h ? 'on' : ''} onClick={() => { s.setHub(h); jumpToBusiest(s.date, h) }}>{h}</button>
        ))}
      </div>
      <div className="hx-kpis">
        <div className="hx-kpi">
          <div className="hx-kpi-label">今日車趟・TRIPS</div>
          <div className="hx-kpi-value">{k.trips}<small> 趟</small> {k.removed > 0 && <span className="hx-delta good">−{k.removed}</span>}</div>
          <div className="hx-kpi-sub">進站 {nIn}・發車 {nOut}</div>
        </div>
        <div className="hx-kpi">
          <div className="hx-kpi-label">平均裝載率・LOAD</div>
          <div className="hx-kpi-value">{k.avgLr.toFixed(1)}<small>%</small> <Delta now={k.avgLr} base={b.avgLr} unit="%" /></div>
          <div className="hx-bar"><span style={{ width: `${Math.min(100, k.avgLr)}%` }} /><i style={{ left: '90%' }} /></div>
        </div>
        <div className="hx-kpi">
          <div className="hx-kpi-label">低裝載 &lt;80%・LOW</div>
          <div className="hx-kpi-value warn">{k.low}<small> 趟</small> <Delta now={k.low} base={b.low} better="down" /></div>
          <div className="hx-kpi-sub">占 {k.trips ? ((k.low / k.trips) * 100).toFixed(1) : 0}%</div>
        </div>
        <div className="hx-kpi">
          <div className="hx-kpi-label">空載成本(估)・EMPTY</div>
          <div className="hx-kpi-value">{fmtMoney(k.emptyCost)} <Delta now={k.emptyCost} base={b.emptyCost} better="down" money /></div>
          <div className="hx-kpi-sub">車次費用 {fmtMoney(k.cost)}</div>
        </div>
        <div className="hx-kpi accent">
          <div className="hx-kpi-label">{saved > 0 ? '已採納節省・SAVED' : '可省(已驗證)・SAVE'}</div>
          <div className="hx-kpi-value">{fmtMoney(saved > 0 ? saved : k.savingVerified)}</div>
          <div className="hx-kpi-sub">{saved > 0 ? `尚可省 ${fmtMoney(Math.max(0, k.savingVerified - saved))}` : `時窗池另 ${fmtMoney(k.savingWindow)}`}</div>
        </div>
      </div>
      <div className="hx-clock">
        <div className="hx-time">{fmtTime(s.time)}</div>
        <select value={s.date} onChange={(e) => { s.setDate(e.target.value); jumpToBusiest(e.target.value, s.hub) }} aria-label="作業日期">
          {DATES.map((d) => (
            <option key={d} value={d}>{d.slice(5).replace('-', '/')}(週{WEEKDAY[weekdayOf(d)]})</option>
          ))}
        </select>
      </div>
    </header>
  )
}

function focusTrip(it: HubTrip) {
  const s = useStore.getState()
  const hub = HUBS[s.hub]
  s.select({ kind: 'trip', id: it.t.id })
  const mid = (it.d0 + it.d1) / 2
  s.setTime(mid)
  const ps = poseAt(it, hub, ((mid % 1440) + 1440) % 1440)
  if (ps) s.focusOn(ps.x, ps.z, 0)
}

function Events() {
  const { items } = useHubDay()
  const time = useStore((s) => Math.floor(s.time))
  const list = useMemo(() => {
    return items
      .map((it) => {
        let ago = time - it.ev
        if (ago < 0) ago += 1440
        return { it, ago }
      })
      .filter((e) => e.ago <= 240)
      .sort((a, b) => a.ago - b.ago)
      .slice(0, 5)
  }, [items, time])
  return (
    <section className="hx-card">
      <div className="hx-card-title">事件動態 <span>EVENTS</span></div>
      {list.length === 0 && <div className="hx-empty">這段時間沒有進出車趟</div>}
      {list.map(({ it }) => {
        const t = it.t
        const lvl = truckLevel(t)
        return (
          <button key={t.id} className="hx-event" onClick={() => focusTrip(it)}>
            <span className="hx-ev-time">{fmtTime(it.ev)}</span>
            <span className="hx-ev-dot" style={{ background: LEVEL_COLOR[lvl] }} />
            <span className={'hx-ev-text' + (lvl === 'bad' ? ' strong' : '')}>
              {it.dir === 'out' ? `${t.x} ${TYPE_LABEL[t.ty]}發車` : `${t.o} ${TYPE_LABEL[t.ty]}抵達`}・{t.eTn}噸 {lrText(t)}
            </span>
          </button>
        )
      })}
    </section>
  )
}

const GROUPS: BucketGroup[] = ['structural', 'vehicle', 'merge', 'pool', 'other']

function Causes() {
  const { base } = useHubDay()
  const groupFilter = useStore((s) => s.groupFilter)
  const setGroupFilter = useStore((s) => s.setGroupFilter)
  const rows = useMemo(() => {
    const m = new Map<BucketGroup, { n: number; empty: number }>()
    for (const t of base) {
      if (t.bk === 'OK') continue
      const g = BUCKETS[t.bk].group
      const r = m.get(g) ?? { n: 0, empty: 0 }
      r.n++
      r.empty += emptyCost(t)
      m.set(g, r)
    }
    return GROUPS.map((g) => ({ g, ...(m.get(g) ?? { n: 0, empty: 0 }) }))
  }, [base])
  const max = Math.max(1, ...rows.map((r) => r.empty))
  return (
    <section className="hx-card">
      <div className="hx-card-title">今日低裝載歸因 <span>CAUSES</span></div>
      {rows.map((r) => (
        <button key={r.g} className={'hx-cause' + (groupFilter === r.g ? ' on' : '') + (r.n === 0 ? ' empty' : '')}
          onClick={() => setGroupFilter(groupFilter === r.g ? null : r.g)}>
          <span className="hx-cause-label">{GROUP_LABEL[r.g]}</span>
          <span className="hx-cause-bar"><span style={{ width: `${(r.empty / max) * 100}%`, background: GROUP_COLOR[r.g] }} /></span>
          <span className="hx-cause-num">{r.n}趟・{fmtMoney(r.empty)}</span>
        </button>
      ))}
    </section>
  )
}

// 小地圖:台灣輪廓與四個轉運中心
const HUB_POS: Record<HubName, [number, number]> = { 北轉: [121.42, 25.06], 桃轉: [121.25, 24.98], 中轉: [120.62, 24.17], 高轉: [120.35, 22.7] }
function mm(lon: number, lat: number): [number, number] {
  return [(lon - 119.9) * 70, (25.45 - lat) * 70]
}

function Minimap() {
  const s = useStore()
  const counts = useMemo(() => {
    const c: Record<HubName, number> = { 北轉: 0, 桃轉: 0, 中轉: 0, 高轉: 0 }
    for (const t of TRIPS_BY_DATE.get(s.date) ?? []) c[hubOf(t)]++
    return c
  }, [s.date])
  const path = TAIWAN_OUTLINE.map(([lon, lat], i) => (i ? 'L' : 'M') + mm(lon, lat).join(' ')).join(' ') + 'Z'
  return (
    <section className="hx-card hx-mini">
      <div className="hx-card-title">小地圖 <span>MINIMAP</span>
        <button className="hx-link" onClick={() => s.setView('network')}>全台網路 3D</button>
      </div>
      <svg viewBox="0 0 160 200" className="hx-mini-map" role="img" aria-label="台灣四個轉運中心位置">
        <path d={path} fill="#e3e0d8" stroke="#c9c4b8" strokeWidth="1" />
        {HUB_ORDER.map((h) => {
          const [x, y] = mm(...HUB_POS[h])
          const on = s.hub === h
          return (
            <g key={h} onClick={() => { s.setHub(h); jumpToBusiest(s.date, h) }} style={{ cursor: 'pointer' }}>
              <circle cx={x} cy={y} r={on ? 7 : 5} fill={on ? '#e8a317' : '#5b6470'} stroke="#fbfaf7" strokeWidth="2" />
            </g>
          )
        })}
      </svg>
      <div className="hx-mini-list">
        {HUB_ORDER.map((h) => (
          <button key={h} className={s.hub === h ? 'on' : ''} onClick={() => { s.setHub(h); jumpToBusiest(s.date, h) }}>
            {h}<span>{counts[h]} 趟</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function Cages({ n, cap, color }: { n: number; cap: number; color: string }) {
  return (
    <div className="hx-cages" style={{ gridTemplateColumns: `repeat(${cap === 20 ? 10 : 7}, 1fr)` }}>
      {Array.from({ length: cap }, (_, i) => <span key={i} style={i < n ? { background: color } : undefined} />)}
    </div>
  )
}

function TruckIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 80 48" width="80" height="48" aria-hidden="true">
      <rect x="4" y="10" width="50" height="26" rx="2" fill="#f6f5f1" stroke="#cfd3d8" />
      <rect x="8" y="26" width="42" height="4" fill={color} />
      <path d="M56 18h12l8 9v9H56z" fill="#33404f" />
      <rect x="62" y="21" width="7" height="6" fill="#9fb2c2" />
      <circle cx="16" cy="39" r="4" fill="#2a2f36" /><circle cx="44" cy="39" r="4" fill="#2a2f36" /><circle cx="66" cy="39" r="4" fill="#2a2f36" />
    </svg>
  )
}

function TripPanel({ id }: { id: string }) {
  const s = useStore()
  const { items } = useHubDay()
  const raw = TRIP_BY_ID.get(id)
  if (!raw) return null
  const t: EffTrip = effective(raw, 'current', false, s.adopted)
  const it = items.find((i) => i.t.id === id)
  const pose = it ? poseAt(it, HUBS[s.hub], s.time) : null
  const lvl = truckLevel(t)
  const key = adoptKey(raw)
  const adopted = !!s.adopted[key]
  const group = raw.gid ? (TRIPS_BY_DATE.get(raw.d) ?? []).filter((x) => x.gid === raw.gid && x.id !== raw.id) : []
  const reason = s.reasons[raw.id]
  const regions = raw.rg ? Object.entries(raw.rg) as [string, number][] : []
  const arrive = (raw.h + raw.du) % 1440
  return (
    <div className="hx-detail">
      <div className="hx-detail-head">
        <div className="hx-thumb"><TruckIcon color={LEVEL_COLOR[lvl]} /></div>
        <div>
          <div className="hx-detail-title">{raw.o} → {raw.x}</div>
          <div className="hx-detail-sub">{TYPE_LABEL[raw.ty]}・{t.eTn} 噸・派車單 {raw.id}</div>
          <div className="hx-chips">
            <span className="hx-chip dark"><i style={{ background: LEVEL_COLOR[lvl] }} />{it ? phaseLabel(it, pose) : t.removed ? '已併入同組' : '不在本中心'}</span>
            {it && <span className="hx-chip">{dockLabel(it)}</span>}
          </div>
        </div>
      </div>

      <div className="hx-sec-head"><b>裝載</b><span>{t.eN} / {t.eCap} 籠・{Math.round(t.eLr)}%</span></div>
      <Cages n={Math.min(t.eN, t.eCap)} cap={t.eCap} color={LEVEL_COLOR[lvl]} />
      {t.changed && !t.removed && <div className="hx-note">原為 {raw.tn} 噸 {raw.n} 籠 {Math.round(raw.lr)}%(已採納建議)</div>}
      {isEmptyRun(t) && <div className="hx-note">空車:沒有載貨,只載空籠車 {raw.ec ?? 0} 個回送;系統裝載率 {Math.round(raw.lr)}% 含空籠車</div>}

      <div className="hx-stats">
        <div><span>發車</span><b>{fmtTime(raw.h)}</b></div>
        <div><span>抵達</span><b>{fmtTime(arrive)}</b></div>
        <div><span>任務時長</span><b>{(raw.du / 60).toFixed(1)} 時</b></div>
        <div><span>車次費用</span><b>{t.eC.toLocaleString('zh-TW')}</b></div>
        <div><span>空載(估)</span><b>{Math.round(emptyCost(t)).toLocaleString('zh-TW')}</b></div>
        <div><span>承運</span><b className="small">{raw.cr}</b></div>
      </div>

      {regions.length > 0 && (
        <>
          <div className="hx-sec-head"><b>籠車去向</b><span>{regions.length} 區</span></div>
          {regions.map(([r, n]) => (
            <div key={r} className="hx-manifest">
              <div><b>{r}區</b><span>{n} 籠</span></div>
              <div className="hx-mbar"><span style={{ width: `${(n / Math.max(raw.n, 1)) * 100}%` }} /></div>
            </div>
          ))}
        </>
      )}

      <div className="hx-sec-head"><b>歸因與建議</b>{raw.bk !== 'OK' && <span style={{ color: GROUP_COLOR[BUCKETS[raw.bk].group] }}>{raw.bk}</span>}</div>
      <p className="hx-suggest">{raw.bk === 'OK' ? '裝載率達 80% 以上,維持預排。' : <><b>{BUCKETS[raw.bk].label}</b>:{suggestion(raw)}</>}</p>
      {raw.act && (
        <div className="hx-saving">
          <span className={'hx-tier ' + raw.tier}>{raw.tier === 'v' ? '已驗證' : '時窗調整池'}</span>
          {raw.sv ? <span>{raw.sv > 0 ? '可省' : '加價'} {Math.abs(raw.sv).toLocaleString('zh-TW')} 元</span> : null}
          {group.length > 0 && <span className="hx-muted">同組 {group.length + 1} 趟</span>}
        </div>
      )}

      <div className="hx-sec-head"><b>指令</b><span>COMMANDS</span></div>
      <div className="hx-cmds">
        <button className={'hx-cmd' + (adopted ? ' on' : '')} disabled={!raw.act} onClick={() => s.toggleAdopt(key)}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M5 12l4 4 10-10" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
          {adopted ? '取消採納' : '採納建議'}
        </button>
        <button className="hx-cmd" onClick={() => { if (it) focusTrip(it) }} disabled={!it}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" strokeWidth="2" /></svg>
          定位車輛
        </button>
        <button className="hx-cmd" onClick={() => { s.setView('network'); s.select({ kind: 'trip', id: raw.id }) }}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
          全台路線
        </button>
      </div>
      {raw.lr < 80 && (
        <div className="hx-reason">
          <select value={reason ?? DEFAULT_REASON[raw.bk] ?? ''} onChange={(e) => s.setReason(raw.id, e.target.value)} aria-label="回填原因代碼">
            <option value="">D+1 回填原因代碼…</option>
            {REASON_CODES.map((r) => <option key={r.code} value={r.code}>{r.code} {r.label}</option>)}
          </select>
          <span>{reason ? `已回填 ${reason}` : DEFAULT_REASON[raw.bk] ? '系統預填,待現場確認' : '低於 80% 仍發車需回填'}</span>
        </div>
      )}
    </div>
  )
}

function HubSummary() {
  const s = useStore()
  const { all, items } = useHubDay()
  const lows = useMemo(() => items.filter((i) => i.t.eLr < 80).sort((a, b) => emptyCost(b.t) - emptyCost(a.t)).slice(0, 6), [items])
  const verified = useMemo(() => {
    const keys = new Set<string>()
    let sv = 0
    for (const t of all) if (t.act && t.tier === 'v') { keys.add(adoptKey(t)); sv += t.sv ?? 0 }
    return { keys: [...keys], sv }
  }, [all])
  const anyAdopted = Object.keys(s.adopted).length > 0
  const others = items.filter((i) => hubOf(i.t) !== s.hub).length
  return (
    <div className="hx-detail">
      <div className="hx-detail-title">{s.hub} 今日概況</div>
      <div className="hx-detail-sub">{HUBS[s.hub].title}・點選卡車看細節與建議</div>
      {others > 0 && <div className="hx-note">畫面顯示實際進出的 {items.length} 趟,其中 {others} 趟由其他中心結帳,不計入上方 KPI</div>}
      <div className="hx-adopt">
        <div>
          <b>已驗證建議 {verified.keys.length} 項</b>
          <span>一次採納可省約 {fmtMoney(verified.sv)} 元</span>
        </div>
        <button onClick={() => (anyAdopted ? s.clearAdopted() : s.adoptMany(verified.keys))} disabled={!anyAdopted && verified.keys.length === 0}>
          {anyAdopted ? '清除採納' : '全部採納'}
        </button>
      </div>
      <div className="hx-sec-head"><b>空載最高車趟</b><span>TOP {lows.length}</span></div>
      {lows.map((it) => (
        <button key={it.t.id} className="hx-row" onClick={() => focusTrip(it)}>
          <span className="hx-row-lr" style={{ color: LEVEL_COLOR[truckLevel(it.t)] }}>{lrText(it.t)}</span>
          <span className="hx-row-main"><b>{it.t.o} → {it.t.x}</b><span>{TYPE_LABEL[it.t.ty]} {it.t.eTn}噸・{fmtTime(it.ev)} {it.dir === 'out' ? '發車' : '抵達'}</span></span>
          <span className="hx-row-emp">{Math.round(emptyCost(it.t)).toLocaleString('zh-TW')}</span>
        </button>
      ))}
      <div className="hx-legend">
        <span><i style={{ background: LEVEL_COLOR.good }} />≥90%</span>
        <span><i style={{ background: LEVEL_COLOR.watch }} />80–90%</span>
        <span><i style={{ background: LEVEL_COLOR.bad }} />&lt;80%</span>
        <span><i style={{ background: LEVEL_COLOR.empty }} />空車</span>
        <span><i style={{ background: '#8fb8de' }} />低溫籠車</span>
      </div>
    </div>
  )
}

function RightPanel() {
  const selected = useStore((s) => s.selected)
  const select = useStore((s) => s.select)
  return (
    <aside className="hx-right">
      <section className="hx-card hx-panel">
        {selected?.kind === 'trip' && <button className="hx-close" onClick={() => select(null)} aria-label="關閉">×</button>}
        {selected?.kind === 'trip' ? <TripPanel id={selected.id} /> : <HubSummary />}
      </section>
    </aside>
  )
}

function Toolbar() {
  const s = useStore()
  return (
    <div className="hx-toolbar">
      <button className="hx-play" onClick={() => s.setPlaying(!s.playing)} aria-label={s.playing ? '暫停' : '播放'}>
        {s.playing ? '❚❚' : '▶'}
      </button>
      <div className="hx-speed">
        {SPEEDS.map((sp) => (
          <button key={sp.v} className={s.speed === sp.v ? 'on' : ''} onClick={() => { s.setSpeed(sp.v); s.setPlaying(true) }}>{sp.label}</button>
        ))}
      </div>
      <div className="hx-track">
        <input type="range" min={0} max={1439} value={Math.floor(s.time)} onChange={(e) => s.setTime(Number(e.target.value))} aria-label="時間" />
        {/* 時間刻度:每小時一格,每 3 小時標數字 */}
        <div className="hx-ticks" aria-hidden="true">
          {Array.from({ length: 25 }, (_, h) => (
            <span key={h} className={h % 6 === 0 ? 'major six' : h % 3 === 0 ? 'major' : ''} style={{ left: `${(h / 24) * 100}%` }}>
              {h % 3 === 0 && <b>{String(h).padStart(2, '0')}</b>}
            </span>
          ))}
        </div>
      </div>
      <div className="hx-tools">
        <button className={s.showLabels ? 'on' : ''} onClick={() => s.setShowLabels(!s.showLabels)}>全部標籤</button>
        <button className={s.onlyLow ? 'on' : ''} onClick={() => s.setOnlyLow(!s.onlyLow)}>只看 &lt;80%</button>
        {(['c', 't', 'd'] as TripType[]).map((ty) => (
          <button key={ty} className={s.types[ty] ? 'on' : ''} onClick={() => s.toggleType(ty)}>{TYPE_LABEL[ty]}</button>
        ))}
      </div>
    </div>
  )
}

export function HubApp() {
  return (
    <div className="hx-root">
      <div className="hx-canvas"><HubScene /></div>
      <TopBar />
      <aside className="hx-left">
        <Events />
        <Causes />
        <Minimap />
      </aside>
      <RightPanel />
      <Toolbar />
      <div className="hx-foot">碼頭分配與裝卸時間為示意(資料無碼頭紀錄);車趟、籠數、裝載率、費用與歸因為 115 年 6–7 月真實資料;KPI 依結帳單位計算。</div>
    </div>
  )
}
