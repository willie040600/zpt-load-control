import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { COMPARISON as C, BUSINESS_DATES, businessDate, comparisonTrips, sceneDay, scopedTrips, sourceOf, stats, type CompareMode, type GroupResult, type ScenarioKey } from './data'
import { DATES, dateLabel, addDays } from '../data/load'
import { HubScene } from '../hub/HubScene'
import { HUBS, HUB_ORDER, busiestMinute } from '../hub/layout'
import { fmtTime } from '../lib/selectors'
import { useStore } from '../store'
import '../hub/hub.css'
import './compare.css'

const money = (n: number) => n.toLocaleString('zh-TW', { maximumFractionDigits: 0 })
const pct = (n: number) => (n * 100).toFixed(1) + '%'
const LABEL: Record<CompareMode, string> = { current: '實際現況', legacy: '原專案規則法（改派＋併車）', A: 'DP＋MILP · A 保守', B: 'DP＋MILP · B 推薦', C: 'DP＋MILP · C 積極', D: 'DP＋MILP · D 理論上限' }

function groupWindow(g: GroupResult) { return g.bucket < 0 ? '全天（取消時窗）' : `${String(g.bucket * 2).padStart(2, '0')}:00–${String(g.bucket * 2 + 2).padStart(2, '0')}:00` }
function mixText(mix: Record<string, number>) { return Object.entries(mix).map(([t, n]) => `${Number(t)} 噸 × ${n}`).join(' ＋ ') || '無需付費載貨車' }

function downloadCsv(groups: GroupResult[], scenario: ScenarioKey) {
  const lines: (string | number)[][] = [['情境', '群組', '作業日期', '路線', '溫層', '時窗', '來源派車單號', '總籠車', '免費運能', '剩餘需求', '固定成本', '現況成本', '建議成本', '節省', '建議車型', '車型費率']]
  groups.forEach((g) => lines.push([scenario, g.groupId, g.date, g.lane, g.temp, groupWindow(g), g.ids.join(' / '), g.cages, g.freeCapacity, g.demand, g.fixed, g.current, g.cost, g.saving, mixText(g.mix), JSON.stringify(g.rates)]))
  const escape = (v: string | number) => '"' + String(v).replace(/^[=+@-]/, "'$&").replace(/"/g, '""') + '"'
  const blob = new Blob(['\uFEFF' + lines.map((r) => r.map(escape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `DP_MILP_${scenario}_比較群組.csv`
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function ComparisonTimeline() {
  const s = useStore()
  return <div className="cmp-timeline"><button aria-label={s.playing ? '暫停比較播放' : '同步播放比較'} onClick={() => s.setPlaying(!s.playing)}>{s.playing ? '❚❚' : '▶'}</button><b>{fmtTime(s.time)}</b><input aria-label="比較播放時間" type="range" min="0" max="1439" value={Math.floor(s.time)} onChange={(e) => s.setTime(Number(e.target.value))} /><select aria-label="比較播放速度" value={s.speed} onChange={(e) => s.setSpeed(Number(e.target.value))}><option value={2.5}>0.5×</option><option value={5}>1×</option><option value={10}>2×</option></select><span><i className="good" />≥90% <i className="warn" />80–90% <i className="bad" />&lt;80% <i className="empty" />空車</span></div>
}

export function CompareApp() {
  // 時鐘由小型 Timeline 自行訂閱，避免每個動畫影格重畫兩座場景與完整表格。
  const s = useStore(useShallow((state) => ({
    hub: state.hub, date: state.date, selected: state.selected, showLabels: state.showLabels,
    setView: state.setView, setHub: state.setHub, setDate: state.setDate, setTime: state.setTime,
    select: state.select, setShowLabels: state.setShowLabels,
  })))
  const [scenario, setScenario] = useState<ScenarioKey>('B')
  const [left, setLeft] = useState<'current' | 'legacy'>('legacy')
  const [scope, setScope] = useState<'day' | 'all'>('all')
  const [metricDate, setMetricDate] = useState(BUSINESS_DATES.includes(s.date) ? s.date : BUSINESS_DATES[0])
  const [localHub, setLocalHub] = useState(false)
  const [search, setSearch] = useState('')
  const [detail, setDetail] = useState<GroupResult | null>(null)
  const [tab, setTab] = useState<'groups' | 'validation' | 'sensitivity' | 'method'>('groups')
  const leftDay = useMemo(() => sceneDay(left, s.date, s.hub), [left, s.date, s.hub])
  const rightDay = useMemo(() => sceneDay(scenario, s.date, s.hub), [scenario, s.date, s.hub])
  const metricHub = localHub ? s.hub : 'all'
  const baseline = useMemo(() => stats(scopedTrips('current', metricDate, scope, metricHub)), [metricDate, scope, metricHub])
  const rows = useMemo(() => (['current', 'legacy', 'A', 'B', 'C', 'D'] as CompareMode[]).map((key) => ({ key, ...stats(scopedTrips(key, metricDate, scope, metricHub)) })), [metricDate, scope, metricHub])
  const lhs = rows.find((r) => r.key === left)!
  const rhs = rows.find((r) => r.key === scenario)!
  const groups = useMemo(() => {
    const allowed = new Set(scopedTrips('current', metricDate, scope, metricHub).map((t) => t.id))
    return C.scenarios[scenario].groups.filter((g) => g.ids.some((id) => allowed.has(id)) && (!search || `${g.lane} ${g.ids.join(' ')} ${g.temp}`.includes(search)))
      .sort((a, b) => b.saving - a.saving)
  }, [scenario, metricDate, scope, metricHub, search])
  const selected = useMemo(() => {
    if (s.selected?.kind !== 'trip') return null
    const id = s.selected.id
    const t = comparisonTrips(scenario).find((t) => t.id === id) ?? comparisonTrips(left).find((t) => t.id === id)
    if (!t) return null
    return { t, group: C.scenarios[scenario].groups.find((g) => g.ids.includes(sourceOf(t))) }
  }, [s.selected, scenario, left])
  const shownDetail = detail ?? selected?.group
  function focusGroup(g: GroupResult) {
    setDetail(g)
    const t = comparisonTrips('current').find((t) => g.ids.includes(t.id))!
    const hub = HUB_ORDER.find((h) => h === t.o || h === t.x) ?? s.hub
    const event = t.h + (t.o === hub ? 0 : t.du)
    s.setHub(hub); s.setDate(addDays(t.d, Math.floor(event / 1440)))
    s.select({ kind: 'trip', id: t.id }); s.setTime(event)
  }
  return (
    <div className="cmp hx-root">
      <header className="cmp-header">
        <div><span className="cmp-eyebrow">ZPT · LOCAL ALGORITHM LAB</span><h1>車趟成本 · 演算法比較</h1><p>{C.algorithmName} · 對照原專案規則法</p></div>
        <div className="cmp-nav"><button onClick={() => s.setView('hub')}>轉運中心</button><button onClick={() => s.setView('network')}>全台網路</button><span className="cmp-local">本地執行</span></div>
      </header>
      <main className="cmp-main">
        <section className="cmp-summary">
          <div><span>去重成本基準 · NT$</span><strong>{money(C.audit.baselineCost)}</strong><small>{C.audit.trips.toLocaleString()} 趟 · {C.audit.operationDays} 作業日 · {C.audit.start}–{C.audit.end}</small></div>
          <div><span>中繼重複費用校正 · NT$</span><strong>{money(C.audit.duplicateCost)}</strong><small>原始列合計 {money(C.audit.rawCost)} − 派車單號去重</small></div>
          <div className="cmp-highlight"><span>{C.scenarios[scenario].label} · 全期間節省 NT$</span><strong>{money(C.scenarios[scenario].saving)} <em>{pct(C.scenarios[scenario].savingPct)}</em></strong><small>月推估 {money(C.scenarios[scenario].monthly)} · 年推估 {money(C.scenarios[scenario].annual)}</small></div>
        </section>

        <div className="cmp-section-title"><h2>3D 同步對照</h2><span>卡車與籠數隨方案更新 · 碼頭與裝卸時間為示意</span></div>
        <div className="cmp-scene-controls">
          <div className="cmp-seg">{HUB_ORDER.map((h) => <button key={h} className={s.hub === h ? 'active' : ''} onClick={() => { s.setHub(h); s.setTime(busiestMinute(sceneDay(left, s.date, h).items)) }}>{h}</button>)}</div>
          <label>播放日曆日 <select aria-label="3D 播放日曆日" value={s.date} onChange={(e) => { s.setDate(e.target.value); s.setTime(busiestMinute(sceneDay(left, e.target.value, s.hub).items)) }}>{DATES.map((d) => <option key={d} value={d}>{dateLabel(d)}</option>)}</select></label>
          <button onClick={() => s.setTime(busiestMinute(leftDay.items))}>最忙時刻</button>
          <label><input type="checkbox" checked={s.showLabels} onChange={(e) => s.setShowLabels(e.target.checked)} />全部標籤</label>
        </div>
        <div className="cmp-scenes">
          <section className="cmp-scene-card"><div className="cmp-scene-heading"><span className="cmp-side">01</span><select aria-label="左側比較對象" value={left} onChange={(e) => setLeft(e.target.value as typeof left)}><option value="current">實際現況</option><option value="legacy">原專案規則法（改派＋併車）</option></select><small>{HUBS[s.hub].title}</small></div><div className="cmp-canvas"><HubScene data={leftDay} /></div><div className="cmp-scene-caption">當日日曆日進出 {leftDay.dayItems.length} 趟 · 拖曳移動／滾輪縮放</div></section>
          <section className="cmp-scene-card cmp-target"><div className="cmp-scene-heading"><span className="cmp-side">02</span><select aria-label="你的演算法情境" value={scenario} onChange={(e) => { setScenario(e.target.value as ScenarioKey); setDetail(null); s.select(null) }}>{(['A', 'B', 'C', 'D'] as ScenarioKey[]).map((m) => <option key={m} value={m}>{LABEL[m]}</option>)}</select><small>比較對象 · DP＋MILP</small></div><div className="cmp-canvas"><HubScene data={rightDay} tick={false} /></div><div className="cmp-scene-caption">當日日曆日進出 {rightDay.dayItems.length} 趟 · {scenario === 'D' ? '取消時窗，僅為理論示意' : scenario === 'C' ? '50% 移轉為混合費率試算' : '保留免費運能與空籠固定成本'}</div></section>
        </div>
        <ComparisonTimeline />
        {selected && <div className="cmp-selection">選取車趟 {selected.t.id} · 來源單號 {sourceOf(selected.t)} · {selected.t.o} → {selected.t.x} · 作業日 {businessDate(selected.t)} · {selected.t.eTn} 噸／{selected.t.eN} 籠／NT$ {money(selected.t.eC)} {selected.t.removed && '（此方案已取消）'}<button onClick={() => s.select(null)}>關閉</button></div>}

        <div className="cmp-section-title"><h2>成本與運能比較</h2><span>以下依作業日期與結帳歸屬統計；3D 依實際日曆日播放</span></div>
        <div className="cmp-filters"><div className="cmp-seg"><button className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>全期間</button><button className={scope === 'day' ? 'active' : ''} onClick={() => setScope('day')}>作業日</button></div>{scope === 'day' && <select aria-label="統計作業日期" value={metricDate} onChange={(e) => setMetricDate(e.target.value)}>{BUSINESS_DATES.map((d) => <option key={d}>{d}</option>)}</select>}<label><input type="checkbox" checked={localHub} onChange={(e) => setLocalHub(e.target.checked)} />僅 {s.hub} 結帳歸屬</label><span className="cmp-difference">{LABEL[scenario]} 比 {left === 'current' ? '現況' : '原專案規則法'}{rhs.cost <= lhs.cost ? '少' : '多'} NT$ {money(Math.abs(lhs.cost - rhs.cost))}</span></div>
        <div className="cmp-table-wrap"><table className="cmp-table"><thead><tr><th>方案</th><th>成本 NT$</th><th>節省 NT$</th><th>節省率</th><th>趟次</th><th>貨量（籠）</th><th>容量利用率</th><th>付費載貨 35t</th></tr></thead><tbody>{rows.map((r) => <tr key={r.key} className={r.key === scenario ? 'cmp-chosen' : ''}><td>{LABEL[r.key]}</td><td>{money(r.cost)}</td><td>{money(baseline.cost - r.cost)}</td><td>{pct(baseline.cost ? (baseline.cost - r.cost) / baseline.cost : 0)}</td><td>{r.trips.toLocaleString()}</td><td>{r.cages.toLocaleString()}</td><td>{r.load.toFixed(1)}%</td><td>{r.paid35.toLocaleString()}</td></tr>)}</tbody></table></div>
        <p className="cmp-note">A–D 貨量守恆；容量利用率＝貨量 ÷ 保留車趟總容量。既有建議採原專案的已驗證項目，沿用其併車規則。A 的群組報價與 B 的路線中位價不同，情境間節省不保證遞增。</p>
        <nav className="cmp-tabs" aria-label="比較細節">{([['groups', '群組追溯'], ['validation', '驗證結果'], ['sensitivity', '35 噸敏感度'], ['method', '方法與限制']] as const).map(([id, label]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>)}</nav>
        <section className="cmp-bottom">
          {tab === 'groups' && <><div className="cmp-detail-tools"><h2>{C.scenarios[scenario].label} · 節省群組 {groups.length.toLocaleString()} 組</h2><input aria-label="搜尋比較群組" placeholder="搜尋路線／派車單號／溫層" value={search} onChange={(e) => setSearch(e.target.value)} /><button onClick={() => downloadCsv(groups, scenario)}>匯出篩選群組 CSV</button></div><p className="cmp-note">列出有節省的完整群組，點選可定位到來源車趟。中心篩選採「群組包含該中心單號」，群組金額不切分。</p><div className="cmp-table-wrap cmp-group-table"><table className="cmp-table"><thead><tr><th>作業日／群組</th><th>路線／溫層</th><th>時窗</th><th>需求／免費運能</th><th>建議車型</th><th>現況 NT$</th><th>建議 NT$</th><th>節省 NT$</th></tr></thead><tbody>{groups.slice(0, 80).map((g) => <tr key={g.groupId} onClick={() => focusGroup(g)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') focusGroup(g) }}><td>{g.date}<small>{g.groupId}</small></td><td>{g.lane}<small>{g.temp}</small></td><td>{groupWindow(g)}</td><td>{g.demand}／{g.freeCapacity} 籠</td><td>{mixText(g.mix)}</td><td>{money(g.current)}</td><td>{money(g.cost)}</td><td className="cmp-saving">{money(g.saving)}</td></tr>)}</tbody></table>{!groups.length && <p className="cmp-note">此範圍沒有符合的節省群組。</p>}</div>{groups.length > 80 && <p className="cmp-note">畫面顯示節省最高的 80 組，CSV 包含全部 {groups.length} 組。</p>}{shownDetail && <div className="cmp-group-detail"><button onClick={() => { setDetail(null); s.select(null) }}>關閉明細</button><h3>{shownDetail.groupId} · {shownDetail.lane}</h3><p>來源單號：{shownDetail.ids.join('、')}</p><p>需求 = max(0, 總貨量 {shownDetail.cages} − 免費運能 {shownDetail.freeCapacity}) = {shownDetail.demand} 籠。空籠固定成本 NT$ {money(shownDetail.fixed)}。</p><p>建議：{mixText(shownDetail.mix)}；車型費率：{Object.entries(shownDetail.rates).map(([t, rate]) => `${t} 噸 NT$ ${money(rate)}`).join('、')}。建議費用 = min({money(shownDetail.current)}, 固定成本 + DP 費用) = NT$ {money(shownDetail.cost)}。</p></div>}</>}
          {tab === 'validation' && <><h2>全期間驗證結果</h2><table className="cmp-table"><thead><tr><th>驗證項目</th><th>實測值</th><th>門檻</th><th>結果</th></tr></thead><tbody>{C.validation.map((v) => <tr key={v.name}><td>{v.name}</td><td>{v.threshold.includes('%') ? pct(v.value) : v.value.toLocaleString('zh-TW', { maximumFractionDigits: 6 })}</td><td>{v.threshold}</td><td>{v.passed ? '通過' : '未通過，需覆核'}</td></tr>)}</tbody></table><p className="cmp-note">容量異常 {C.audit.capacityAnomalies} 趟（含超過標準容量 {C.audit.overloadedTrips} 趟）；付費零籠 {C.audit.fixedTrips} 趟／NT$ {money(C.audit.fixedCost)} 保留；免費載貨 {C.audit.freeLoadedTrips} 趟保留。缺漏作業日：{C.audit.missingDates.join('、') || '無'}。</p></>}
          {tab === 'sensitivity' && <><h2>B 推薦 · 全期間 35 噸運能上限</h2><p className="cmp-note">全域 MILP，付費載貨 35t 的全期間趟次上限；保留現況同時計入上限。固定空籠與免費車保持原車，不占此付費載貨上限。此表獨立於上方 3D 的無上限 DP 情境。</p><table className="cmp-table"><thead><tr><th>現況倍數</th><th>35t 上限</th><th>實際使用 35t</th><th>成本 NT$</th><th>節省 NT$</th><th>節省率</th></tr></thead><tbody>{C.sensitivity.map((r) => <tr key={r.multiplier ?? 'none'}><td>{r.multiplier == null ? '無限制' : `${r.multiplier.toFixed(1)}×`}</td><td>{r.limit == null ? '無限制' : money(r.limit)}</td><td>{money(r.used35)}</td><td>{money(r.cost)}</td><td>{money(r.saving)}</td><td>{pct(r.savingPct)}</td></tr>)}</tbody></table></>}
          {tab === 'method' && <><h2>{C.algorithmName} · 可追溯規則</h2><div className="cmp-method"><p>成本：同派車單號取 max(車次費用)，籠數取 sum(籠車數)。以日期 × 車次名稱 × 溫層 × floor(發車小時／2) 分群。</p><p>DP：dp[d] = minₜ(dp[max(0, d − capₜ)] + cₜ)，逐群取 min(現況, 固定成本 + DP)。費率只取同路線、同溫層實際車型的正費用中位價；最低承運商須至少 {C.parameters.minCarrierSamples} 筆報價。</p><p>A：群組既有車型／承運商；B：路線既有車型；C：50% 運量混合單價試算；D：全天、全面低價理論上限。月／年推估＝期間節省 ÷ {C.audit.operationDays} 實際作業日 × 30／365。</p>{C.limitations.map((text) => <p key={text}>• {text}</p>)}</div></>}
        </section>
        <footer className="cmp-footer">來源：115 年 6–7 月車趟派遣原始資料 · 群組完整明細與檢查報告保存於本地 analysis/out/prompt · 所有金額為新台幣</footer>
      </main>
    </div>
  )
}
