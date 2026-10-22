import { useMemo } from 'react'
import { BUCKETS, BUCKET_ORDER, GROUP_COLOR, GROUP_LABEL, TYPE_LABEL, type BucketGroup } from '../data/codes'
import { nodeXZ } from '../data/nodes'
import type { BucketCode, TripType } from '../data/types'
import { emptyCost } from '../lib/effective'
import { routeCurve, pointAt } from '../lib/geo'
import { fmtMoney, fmtTime, useSceneTrips, useScopeBaseline } from '../lib/selectors'
import { useStore, type TonKey } from '../store'

interface Row { code: Exclude<BucketCode, 'OK'>; n: number; empty: number }

function Pareto() {
  const base = useScopeBaseline()
  const bucketFilter = useStore((s) => s.bucketFilter)
  const setBucketFilter = useStore((s) => s.setBucketFilter)
  const { rows, total, max } = useMemo(() => {
    const m = new Map<string, Row>()
    for (const t of base) {
      if (t.bk === 'OK') continue
      const r = m.get(t.bk) ?? { code: t.bk, n: 0, empty: 0 }
      r.n++
      r.empty += emptyCost(t)
      m.set(t.bk, r)
    }
    const rows = BUCKET_ORDER.map((c) => m.get(c) ?? { code: c, n: 0, empty: 0 })
    const total = rows.reduce((a, r) => a + r.empty, 0)
    return { rows, total, max: Math.max(1, ...rows.map((r) => r.empty)) }
  }, [base])

  const groups = useMemo(() => {
    const g = new Map<BucketGroup, Row[]>()
    for (const r of rows) {
      const k = BUCKETS[r.code].group
      g.set(k, [...(g.get(k) ?? []), r])
    }
    return [...g.entries()]
  }, [rows])

  return (
    <section className="card">
      <div className="card-title">
        低裝載歸因 <span className="muted">空載成本 {fmtMoney(total)}</span>
      </div>
      <div className="hint">點選一列,地圖上只亮出該類車趟</div>
      {groups.map(([g, list]) => {
        const sum = list.reduce((a, r) => a + r.empty, 0)
        return (
          <div key={g} className="pgroup">
            <div className="pgroup-head">
              <span className="dot" style={{ background: GROUP_COLOR[g] }} />
              {GROUP_LABEL[g]}
              <span className="muted">{total ? Math.round((sum / total) * 100) : 0}%</span>
            </div>
            {list.map((r) => (
              <button
                key={r.code}
                className={'prow' + (bucketFilter === r.code ? ' on' : '') + (r.n === 0 ? ' empty' : '')}
                onClick={() => setBucketFilter(bucketFilter === r.code ? null : r.code)}
              >
                <span className="prow-label">{BUCKETS[r.code].label}</span>
                <span className="prow-bar">
                  <span style={{ width: `${(r.empty / max) * 100}%`, background: GROUP_COLOR[g] }} />
                </span>
                <span className="prow-num">{r.n}趟</span>
                <span className="prow-num w">{fmtMoney(r.empty)}</span>
              </button>
            ))}
          </div>
        )
      })}
    </section>
  )
}

function Filters() {
  const s = useStore()
  return (
    <section className="card">
      <div className="card-title">篩選</div>
      <div className="chips">
        {(['c', 't', 'd'] as TripType[]).map((t) => (
          <button key={t} className={'chip' + (s.types[t] ? ' on' : '')} onClick={() => s.toggleType(t)}>
            {TYPE_LABEL[t]}
          </button>
        ))}
        {(['17', '18.5', '35'] as TonKey[]).map((t) => (
          <button key={t} className={'chip' + (s.tons[t] ? ' on' : '')} onClick={() => s.toggleTon(t)}>
            {t}噸
          </button>
        ))}
        <button className={'chip' + (s.onlyLow ? ' on' : '')} onClick={() => s.setOnlyLow(!s.onlyLow)}>
          只看 &lt;80%
        </button>
      </div>
    </section>
  )
}

function TopLowTrips() {
  const trips = useSceneTrips()
  const bucketFilter = useStore((s) => s.bucketFilter)
  const select = useStore((s) => s.select)
  const setTime = useStore((s) => s.setTime)
  const focusOn = useStore((s) => s.focusOn)
  const list = useMemo(
    () =>
      trips
        .filter((t) => t.lr < 80 && (bucketFilter === null || t.bk === bucketFilter))
        .sort((a, b) => b.emp - a.emp)
        .slice(0, 8),
    [trips, bucketFilter],
  )
  return (
    <section className="card">
      <div className="card-title">當日空載最高車趟</div>
      {list.length === 0 && <div className="hint">沒有符合條件的低裝載車趟</div>}
      {list.map((t) => (
        <button
          key={t.id}
          className="trip-row"
          onClick={() => {
            select({ kind: 'trip', id: t.id })
            // 前一天發車的車趟取落在當天的那一段;當天發車的最晚到 23:59
            setTime(Math.min(1439, Math.max(0, (t.carry ? t.h - 1440 : t.h) + t.du * 0.5)))
            const [x, z] = pointAt(routeCurve(t.o, t.x), 0.5)
            const [ax, az] = nodeXZ(t.o)
            const [bx, bz] = nodeXZ(t.x)
            focusOn(x, z, Math.min(240, Math.max(60, Math.hypot(bx - ax, bz - az) * 1.5)))
          }}
        >
          <span className={'lr ' + (t.lr < 50 ? 'bad' : 'watch')}>{Math.round(t.lr)}%</span>
          <span className="trip-route">{t.o} → {t.x}</span>
          <span className="muted">{TYPE_LABEL[t.ty]} {t.tn}噸 {fmtTime(t.h)}</span>
          <span className="trip-emp">{fmtMoney(t.emp)}</span>
        </button>
      ))}
    </section>
  )
}

export function LeftPanel() {
  return (
    <aside className="left">
      <Pareto />
      <Filters />
      <TopLowTrips />
    </aside>
  )
}
