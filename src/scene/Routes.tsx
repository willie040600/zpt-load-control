import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { ISLAND_TOP, pointAt, routeCurve } from '../lib/geo'
import { useSceneTrips } from '../lib/selectors'

const SEGMENTS = 16

// 當日所有起訖路線,合併成一個 LineSegments 繪製
export function Routes() {
  const trips = useSceneTrips()
  const geometry = useMemo(() => {
    const pairs = new Set<string>()
    for (const t of trips) if (!t.removed) pairs.add(t.o + '>' + t.x)
    const pos: number[] = []
    for (const key of pairs) {
      const [o, x] = key.split('>')
      const c = routeCurve(o, x)
      let prev = pointAt(c, 0)
      for (let i = 1; i <= SEGMENTS; i++) {
        const p = pointAt(c, i / SEGMENTS)
        pos.push(prev[0], ISLAND_TOP + 0.08, prev[1], p[0], ISLAND_TOP + 0.08, p[1])
        prev = p
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    return g
  }, [trips])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#5b6b78" transparent opacity={0.35} />
    </lineSegments>
  )
}
