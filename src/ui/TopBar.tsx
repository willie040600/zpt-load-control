import { useMemo } from 'react'
import { DATES, WEEKDAY, weekdayOf } from '../data/load'
import { REGION_VIEW } from '../data/nodes'
import type { Region } from '../data/types'
import { computeKpis } from '../lib/kpi'
import { fmtMoney, useScopeBaseline, useScopeTrips } from '../lib/selectors'
import { useStore } from '../store'

function Delta({ now, base, unit = '', better = 'up', money = false }: {
  now: number; base: number; unit?: string; better?: 'up' | 'down'; money?: boolean
}) {
  const d = now - base
  if (Math.abs(d) < 0.05) return null
  const good = better === 'up' ? d > 0 : d < 0
  const text = money ? fmtMoney(Math.abs(d)) : Math.abs(d).toFixed(unit === '%' ? 1 : 0)
  return <span className={'delta ' + (good ? 'good' : 'bad')}>{d > 0 ? '▲' : '▼'} {text}{unit}</span>
}

function Kpi({ label, value, sub, children, accent }: {
  label: string; value: string; sub?: string; children?: React.ReactNode; accent?: boolean
}) {
  return (
    <div className={'kpi' + (accent ? ' kpi-accent' : '')}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-sub">{sub}{children}</div>
    </div>
  )
}

export function TopBar() {
  const s = useStore()
  const trips = useScopeTrips()
  const base = useScopeBaseline()
  const k = useMemo(() => computeKpis(trips), [trips])
  const b = useMemo(() => computeKpis(base), [base])
  const rec = s.mode === 'recommended'

  return (
    <header className="topbar">
      <div className="topbar-row">
        <div className="brand">
          <div className="brand-mark">宅</div>
          <div>
            <div className="brand-title">宅配通 車趟裝載控制塔</div>
            <div className="brand-sub">集貨・轉運・繼送 逐車趟裝載率管理(示意版)</div>
          </div>
        </div>
        <div className="controls">
          <button className="back-hub" onClick={() => s.setView('hub')}>← 轉運中心視角</button>
          <div className="seg">
            {(Object.keys(REGION_VIEW) as Region[]).map((r) => (
              <button key={r} className={s.region === r ? 'on' : ''} onClick={() => s.setRegion(r)}>
                {REGION_VIEW[r].label}
              </button>
            ))}
          </div>
          <select value={s.date} onChange={(e) => s.setDate(e.target.value)}>
            {DATES.map((d) => (
              <option key={d} value={d}>{d.slice(5).replace('-', '/')}(週{WEEKDAY[weekdayOf(d)]})</option>
            ))}
          </select>
          <div className="seg">
            <button className={s.scope === 'day' ? 'on' : ''} onClick={() => s.setScope('day')}>當日</button>
            <button className={s.scope === 'all' ? 'on' : ''} onClick={() => s.setScope('all')}>全期間</button>
          </div>
          <div className="seg seg-mode">
            <button className={!rec ? 'on' : ''} onClick={() => s.setMode('current')}>現況</button>
            <button className={rec ? 'on' : ''} onClick={() => s.setMode('recommended')}>套用建議</button>
          </div>
          <label className={'check' + (rec ? '' : ' disabled')}>
            <input type="checkbox" checked={s.includeWindow} disabled={!rec}
              onChange={(e) => s.setIncludeWindow(e.target.checked)} />
            含時窗調整池
          </label>
        </div>
      </div>
      <div className="kpis">
        <Kpi label="車趟數" value={k.trips.toLocaleString('zh-TW')} sub={rec && k.removed ? `可少開 ${k.removed} 趟` : s.scope === 'day' ? '當日' : '6/1–7/20'} />
        <Kpi label="平均裝載率" value={k.avgLr.toFixed(1) + '%'} sub="目標 ≥90%">
          {rec && <Delta now={k.avgLr} base={b.avgLr} unit="%" />}
        </Kpi>
        <Kpi label="達標趟比例(≥90%)" value={k.pctStandard.toFixed(1) + '%'}>
          {rec && <Delta now={k.pctStandard} base={b.pctStandard} unit="%" />}
        </Kpi>
        <Kpi label="低裝載趟(<80%)" value={k.low.toLocaleString('zh-TW')} sub={`占 ${(k.trips ? (k.low / k.trips) * 100 : 0).toFixed(1)}% `}>
          {rec && <Delta now={k.low} base={b.low} better="down" />}
        </Kpi>
        <Kpi label="低裝載空載成本(估)" value={fmtMoney(k.emptyCost)} sub={`車次費用 ${fmtMoney(k.cost)} `}>
          {rec && <Delta now={k.emptyCost} base={b.emptyCost} better="down" money />}
        </Kpi>
        <Kpi accent label={rec ? '本模式節省' : '可省金額'}
          value={rec ? fmtMoney(b.cost - k.cost) : fmtMoney(k.savingVerified)}
          sub={rec ? (s.includeWindow ? '已驗證+時窗池' : '僅已驗證項目') : `已驗證;時窗池另 ${fmtMoney(k.savingWindow)}`} />
      </div>
    </header>
  )
}
