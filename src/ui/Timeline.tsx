import { useMemo } from 'react'
import { fmtTime, useSceneTrips } from '../lib/selectors'
import { useStore } from '../store'

const BINS = 48

export function Timeline() {
  const trips = useSceneTrips()
  const time = useStore((s) => s.time)
  const playing = useStore((s) => s.playing)
  const speed = useStore((s) => s.speed)
  const setTime = useStore((s) => s.setTime)
  const setPlaying = useStore((s) => s.setPlaying)
  const setSpeed = useStore((s) => s.setSpeed)

  const { bins, max } = useMemo(() => {
    const bins = Array.from({ length: BINS }, () => ({ ok: 0, low: 0 }))
    for (const t of trips) {
      if (t.removed) continue
      const b = bins[Math.floor(t.h / 30) % BINS]
      if (t.eLr < 80) b.low++
      else b.ok++
    }
    return { bins, max: Math.max(1, ...bins.map((b) => b.ok + b.low)) }
  }, [trips])

  return (
    <footer className="timeline">
      <button className="play" onClick={() => setPlaying(!playing)} aria-label={playing ? '暫停' : '播放'}>
        {playing ? '❚❚' : '▶'}
      </button>
      <div className="clock">{fmtTime(time)}</div>
      <div className="track">
        <div className="hist">
          {bins.map((b, i) => (
            <div key={i} className="hbar" title={`${fmtTime(i * 30)} 發車 ${b.ok + b.low} 趟,其中低裝載 ${b.low} 趟`}>
              <span className="ok" style={{ height: `${(b.ok / max) * 100}%` }} />
              <span className="low" style={{ height: `${(b.low / max) * 100}%` }} />
            </div>
          ))}
        </div>
        <input type="range" min={0} max={1439} step={1} value={Math.floor(time)}
          onChange={(e) => setTime(Number(e.target.value))} aria-label="時間" />
        <div className="ticks">
          {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => <span key={h}>{String(h).padStart(2, '0')}</span>)}
        </div>
      </div>
      <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="播放速度">
        <option value={2.5}>1 秒 = 2.5 分</option>
        <option value={5}>1 秒 = 5 分</option>
        <option value={10}>1 秒 = 10 分</option>
        <option value={20}>1 秒 = 20 分</option>
        <option value={60}>1 秒 = 1 小時</option>
      </select>
    </footer>
  )
}
