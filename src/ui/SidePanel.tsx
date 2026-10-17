import { useMemo } from 'react'
import { BUCKETS, DEFAULT_REASON, GROUP_COLOR, REASON_CODES, TYPE_LABEL, suggestion } from '../data/codes'
import { TRIPS_BY_DATE, TRIP_BY_ID, WEEKDAY, weekdayOf } from '../data/load'
import { NODES } from '../data/nodes'
import type { EffTrip, RawTrip } from '../data/types'
import { effective, emptyCost, loadLevel } from '../lib/effective'
import { fmtMoney, fmtTime, useScopeBaseline } from '../lib/selectors'
import { useStore } from '../store'
import { LOAD_COLOR } from '../scene/Trucks'

function Cages({ n, cap }: { n: number; cap: number }) {
  const lr = (n / cap) * 100
  const color = LOAD_COLOR[loadLevel(lr)]
  return (
    <div className="cages" style={{ gridTemplateColumns: `repeat(${cap === 20 ? 10 : 7}, 1fr)` }}>
      {Array.from({ length: cap }, (_, i) => (
        <span key={i} style={i < n ? { background: color, borderColor: color } : undefined} />
      ))}
    </div>
  )
}

function BucketChip({ t }: { t: RawTrip }) {
  if (t.bk === 'OK') return <span className="bchip ok">裝載達標</span>
  const b = BUCKETS[t.bk]
  return (
    <span className="bchip" style={{ borderColor: GROUP_COLOR[b.group], color: GROUP_COLOR[b.group] }}>
      {t.bk} {b.label}
    </span>
  )
}

function TripDetail({ id }: { id: string }) {
  const raw = TRIP_BY_ID.get(id)
  const s = useStore()
  if (!raw) return null
  const cur = effective(raw, 'current', false)
  const rec = effective(raw, 'recommended', true)
  const showAfter = s.mode === 'recommended' && (raw.tier === 'v' || (raw.tier === 'w' && s.includeWindow))
  const group = raw.gid ? (TRIPS_BY_DATE.get(raw.d) ?? []).filter((t) => t.gid === raw.gid && t.id !== raw.id) : []
  const reason = s.reasons[raw.id]
  const low = raw.lr < 80

  return (
    <div className="detail">
      <div className="detail-head">
        <span className="type-chip">{TYPE_LABEL[raw.ty]}</span>
        <div className="detail-route">{raw.o} → {raw.x}</div>
      </div>
      <div className="muted small">
        {raw.d.slice(5).replace('-', '/')}(週{WEEKDAY[weekdayOf(raw.d)]})發車 {fmtTime(raw.h)}・約 {Math.round(raw.du / 6) / 10} 小時・{raw.cr}
      </div>

      <div className="gauge-row">
        <div className="gauge" style={{ color: LOAD_COLOR[loadLevel(cur.lr)] }}>
          {Math.round(cur.lr)}<small>%</small>
        </div>
        <div className="gauge-meta">
          <div>{raw.tn} 噸・{raw.cold ? '低溫車' : '常溫車'}</div>
          <div>{raw.n} / {raw.cap} 籠{raw.ec ? `(含補空/收空 ${raw.ec})` : ''}</div>
          <div>車次費用 {raw.c.toLocaleString('zh-TW')} 元</div>
          <div className="muted">空載估計 {Math.round(emptyCost(cur)).toLocaleString('zh-TW')} 元</div>
        </div>
      </div>
      <Cages n={Math.min(raw.n, raw.cap)} cap={raw.cap} />

      <div className="block">
        <div className="block-title">歸因</div>
        <BucketChip t={raw} />
      </div>
      <div className="block">
        <div className="block-title">建議</div>
        <p className="suggest">{suggestion(raw)}</p>
        {raw.act && (
          <div className="saving">
            <span className={'tier ' + raw.tier}>{raw.tier === 'v' ? '已驗證・可立即執行' : '時窗調整池・需先協調'}</span>
            {raw.sv !== undefined && raw.sv !== 0 && (
              <span>{raw.sv > 0 ? '可省' : '加價'} {Math.abs(raw.sv).toLocaleString('zh-TW')} 元</span>
            )}
          </div>
        )}
      </div>

      {raw.act && (
        <div className={'block compare' + (showAfter ? ' active' : '')}>
          <div className="block-title">套用建議後 {showAfter ? '' : <span className="muted">(切換「套用建議」可在地圖上看到)</span>}</div>
          {rec.removed ? (
            <div className="after-removed">這一趟取消,貨併入同組其他車</div>
          ) : (
            <>
              <div className="after-line">
                {raw.tn}噸 {raw.n}籠 {Math.round(raw.lr)}% → <b>{rec.eTn}噸 {rec.eN}籠 {Math.round(rec.eLr)}%</b>
              </div>
              <Cages n={rec.eN} cap={rec.eCap} />
              <div className="muted small">費用 {raw.c.toLocaleString('zh-TW')} → {rec.eC.toLocaleString('zh-TW')} 元</div>
            </>
          )}
          {group.length > 0 && (
            <div className="group-list">
              <div className="muted small">同組車趟</div>
              {group.map((g) => (
                <button key={g.id} className="trip-row compact" onClick={() => s.select({ kind: 'trip', id: g.id })}>
                  <span className={'lr ' + loadLevel(g.lr)}>{Math.round(g.lr)}%</span>
                  <span className="trip-route">{g.o} → {g.x}</span>
                  <span className="muted">{g.tn}噸 {fmtTime(g.h)} {g.act === 'dr' ? '取消' : '保留'}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {low && (
        <div className="block">
          <div className="block-title">現場回填(D+1)</div>
          <select value={reason ?? DEFAULT_REASON[raw.bk] ?? ''} onChange={(e) => s.setReason(raw.id, e.target.value)}>
            <option value="">選擇原因代碼…</option>
            {REASON_CODES.map((r) => (
              <option key={r.code} value={r.code}>{r.code} {r.label}</option>
            ))}
          </select>
          <div className="muted small">
            {reason ? `已回填 ${reason}` : DEFAULT_REASON[raw.bk] ? '系統預填,請現場確認' : '低於 80% 仍發車需填寫原因'}
          </div>
        </div>
      )}
    </div>
  )
}

function NodeDetail({ name }: { name: string }) {
  const base = useScopeBaseline()
  const s = useStore()
  const info = NODES[name]
  const stats = useMemo(() => {
    const list = base.filter((t) => t.o === name || t.x === name)
    const lows = list.filter((t) => t.lr < 80)
    const byBucket = new Map<string, { n: number; empty: number }>()
    for (const t of lows) {
      const r = byBucket.get(t.bk) ?? { n: 0, empty: 0 }
      r.n++
      r.empty += emptyCost(t)
      byBucket.set(t.bk, r)
    }
    const top = [...byBucket.entries()].sort((a, b) => b[1].empty - a[1].empty).slice(0, 4)
    const avg = list.length ? list.reduce((a, t) => a + Math.min(t.lr, 100), 0) / list.length : 0
    return {
      n: list.length,
      low: lows.length,
      avg,
      empty: lows.reduce((a, t) => a + emptyCost(t), 0),
      top,
    }
  }, [base, name])
  const dayLows: EffTrip[] = useMemo(
    () =>
      (TRIPS_BY_DATE.get(s.date) ?? [])
        .filter((t) => (t.o === name || t.x === name) && t.lr < 80)
        .sort((a, b) => b.emp - a.emp)
        .slice(0, 6)
        .map((t) => effective(t, 'current', false)),
    [s.date, name],
  )
  return (
    <div className="detail">
      <div className="detail-head">
        <span className="type-chip">{info?.hub ? '轉運中心' : '站所'}</span>
        <div className="detail-route">{name}</div>
      </div>
      <div className="muted small">{s.scope === 'day' ? s.date.slice(5).replace('-', '/') + ' 當日' : '6/1–7/20 全期間'}・依目前篩選</div>
      <div className="stat-grid">
        <div><b>{stats.n}</b><span>車趟</span></div>
        <div><b>{stats.avg.toFixed(0)}%</b><span>平均裝載</span></div>
        <div><b>{stats.low}</b><span>低裝載趟</span></div>
        <div><b>{fmtMoney(stats.empty)}</b><span>空載成本</span></div>
      </div>
      <div className="block">
        <div className="block-title">主要歸因</div>
        {stats.top.length === 0 && <div className="muted small">沒有低裝載車趟</div>}
        {stats.top.map(([code, r]) => {
          const b = BUCKETS[code as keyof typeof BUCKETS]
          return (
            <div key={code} className="node-bucket">
              <span className="dot" style={{ background: GROUP_COLOR[b.group] }} />
              <span>{b.label}</span>
              <span className="muted">{r.n}趟・{fmtMoney(r.empty)}</span>
            </div>
          )
        })}
      </div>
      <div className="block">
        <div className="block-title">當日低裝載車趟</div>
        {dayLows.length === 0 && <div className="muted small">當日沒有低裝載車趟</div>}
        {dayLows.map((t) => (
          <button key={t.id} className="trip-row compact" onClick={() => { s.select({ kind: 'trip', id: t.id }); s.setTime(t.h + t.du / 2) }}>
            <span className={'lr ' + loadLevel(t.lr)}>{Math.round(t.lr)}%</span>
            <span className="trip-route">{t.o} → {t.x}</span>
            <span className="muted">{t.tn}噸 {fmtTime(t.h)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function SidePanel() {
  const selected = useStore((s) => s.selected)
  const select = useStore((s) => s.select)
  return (
    <aside className="right">
      {selected ? (
        <section className="card">
          <button className="close" onClick={() => select(null)} aria-label="關閉">×</button>
          {selected.kind === 'trip' ? <TripDetail id={selected.id} /> : <NodeDetail name={selected.name} />}
        </section>
      ) : (
        <section className="card intro">
          <div className="card-title">怎麼看這張圖</div>
          <ul>
            <li>每台卡車是一趟車,顏色是裝載率:<b className="c-good">≥90%</b>、<b className="c-watch">80–90%</b>、<b className="c-bad">&lt;80%</b>。車上的柱子越高,裝得越滿。</li>
            <li>站所上的紅色柱子越高,代表該站低裝載的空載成本越多。</li>
            <li>點卡車或站所看細節與建議;左側可依歸因篩選。</li>
            <li>切到「套用建議」,被併掉的車會變成半透明紅色,KPI 會重算。</li>
            <li>下方時間軸可以播放一整天的發車。</li>
          </ul>
        </section>
      )}
    </aside>
  )
}
