import { useEffect, useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { EffTrip } from '../data/types'
import { ISLAND_TOP, pointAt, progressAt, routeCurve, tangentAt } from '../lib/geo'
import { isEmptyRun, truckLevel } from '../lib/effective'
import { useSceneTrips } from '../lib/selectors'
import { useStore } from '../store'

const MAX = 420 // 單日車趟上限約 330 趟

export const LOAD_COLOR = { good: '#3ccf7a', watch: '#f5b93a', bad: '#ef4d4d', empty: '#9aa3ab' } as const
const DIM = new THREE.Color('#3a4249')
const CAB = new THREE.Color('#d9dee2')

const box = new THREE.BoxGeometry(1, 1, 1)
const dummy = new THREE.Object3D()
const hidden = new THREE.Matrix4().makeScale(0, 0, 0)
const bigSphere = new THREE.Sphere(new THREE.Vector3(), 600)

function truckLength(tn: number): number {
  if (tn >= 25) return 1.7
  if (tn > 17) return 1.35
  return 1.15
}

// 計算車趟在指定時間的位置與朝向;不在路上回傳 null
function pose(t: EffTrip, time: number) {
  const p = progressAt(t.h, t.du, time)
  if (p < 0) return null
  const c = routeCurve(t.o, t.x)
  const [x, z] = pointAt(c, p)
  const [dx, dz] = tangentAt(c, p)
  return { x, z, yaw: -Math.atan2(dz, dx) }
}

function useBigSphere(ref: React.RefObject<THREE.InstancedMesh>) {
  useEffect(() => {
    if (ref.current) ref.current.boundingSphere = bigSphere
  }, [ref])
}

export function Trucks() {
  const trips = useSceneTrips()
  const live = useMemo(() => trips.filter((t) => !t.removed), [trips])
  const ghosts = useMemo(() => trips.filter((t) => t.removed), [trips])
  const bucketFilter = useStore((s) => s.bucketFilter)
  const select = useStore((s) => s.select)
  const selectedId = useStore((s) => (s.selected?.kind === 'trip' ? s.selected.id : null))

  const body = useRef<THREE.InstancedMesh>(null)
  const cab = useRef<THREE.InstancedMesh>(null)
  const gauge = useRef<THREE.InstancedMesh>(null)
  const ghost = useRef<THREE.InstancedMesh>(null)
  const ring = useRef<THREE.Mesh>(null)
  useBigSphere(body)
  useBigSphere(ghost)

  // 顏色只在資料或篩選改變時更新
  useEffect(() => {
    const color = new THREE.Color()
    live.forEach((t, i) => {
      const dim = bucketFilter !== null && t.bk !== bucketFilter
      color.set(dim ? DIM : LOAD_COLOR[truckLevel(t)])
      body.current?.setColorAt(i, color)
      gauge.current?.setColorAt(i, color)
      cab.current?.setColorAt(i, dim ? DIM : CAB)
    })
    for (const m of [body.current, gauge.current, cab.current]) {
      if (m?.instanceColor) m.instanceColor.needsUpdate = true
    }
  }, [live, bucketFilter])

  useFrame(({ camera }) => {
    const time = useStore.getState().time
    // 拉遠時把卡車放大,全台視角也看得到
    const k = THREE.MathUtils.clamp(camera.position.y / 90, 1, 2.6)
    const b = body.current, c = cab.current, g = gauge.current, gh = ghost.current
    if (!b || !c || !g || !gh) return
    let selectedPose: { x: number; z: number } | null = null
    live.forEach((t, i) => {
      const ps = pose(t, time)
      if (!ps) {
        b.setMatrixAt(i, hidden); c.setMatrixAt(i, hidden); g.setMatrixAt(i, hidden)
        return
      }
      if (t.id === selectedId) selectedPose = ps
      const L = truckLength(t.eTn) * k
      const y = ISLAND_TOP + 0.4 * k
      dummy.position.set(ps.x, y, ps.z)
      dummy.rotation.set(0, ps.yaw, 0)
      dummy.scale.set(L, 0.62 * k, 0.56 * k)
      dummy.updateMatrix()
      b.setMatrixAt(i, dummy.matrix)
      // 車頭在行進方向前方
      const fx = Math.cos(ps.yaw), fz = -Math.sin(ps.yaw)
      const off = L / 2 + 0.2 * k
      dummy.position.set(ps.x + fx * off, y - 0.05 * k, ps.z + fz * off)
      dummy.scale.set(0.38 * k, 0.52 * k, 0.54 * k)
      dummy.updateMatrix()
      c.setMatrixAt(i, dummy.matrix)
      // 上方裝載率柱:高度 = 裝載率;空車只留底座
      const h = (0.1 + (isEmptyRun(t) ? 0 : Math.min(t.eLr, 100) / 100 * 1.8)) * k
      dummy.position.set(ps.x, y + 0.43 * k + h / 2, ps.z)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(0.18 * k, h, 0.18 * k)
      dummy.updateMatrix()
      g.setMatrixAt(i, dummy.matrix)
    })
    ghosts.forEach((t, i) => {
      const ps = pose(t, time)
      if (!ps) { gh.setMatrixAt(i, hidden); return }
      if (t.id === selectedId) selectedPose = ps
      dummy.position.set(ps.x, ISLAND_TOP + 0.4 * k, ps.z)
      dummy.rotation.set(0, ps.yaw, 0)
      dummy.scale.set(truckLength(t.tn) * k, 0.62 * k, 0.56 * k)
      dummy.updateMatrix()
      gh.setMatrixAt(i, dummy.matrix)
    })
    b.count = c.count = g.count = live.length
    gh.count = ghosts.length
    for (const m of [b, c, g, gh]) m.instanceMatrix.needsUpdate = true
    if (ring.current) {
      const sp = selectedPose as { x: number; z: number } | null
      ring.current.visible = !!sp
      if (sp) {
        ring.current.position.set(sp.x, ISLAND_TOP + 0.1, sp.z)
        ring.current.scale.setScalar(k)
      }
    }
  })

  const pick = (list: EffTrip[]) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (e.instanceId === undefined) return
    const t = list[e.instanceId]
    if (t) select({ kind: 'trip', id: t.id })
  }
  const hover = (on: boolean) => () => { document.body.style.cursor = on ? 'pointer' : '' }

  return (
    <group>
      <instancedMesh ref={body} args={[box, undefined, MAX]} castShadow frustumCulled={false}
        onClick={pick(live)} onPointerOver={hover(true)} onPointerOut={hover(false)}>
        <meshStandardMaterial roughness={0.55} flatShading />
      </instancedMesh>
      <instancedMesh ref={cab} args={[box, undefined, MAX]} castShadow frustumCulled={false}>
        <meshStandardMaterial roughness={0.5} flatShading />
      </instancedMesh>
      <instancedMesh ref={gauge} args={[box, undefined, MAX]} frustumCulled={false}>
        <meshStandardMaterial emissive="#ffffff" emissiveIntensity={0.15} roughness={0.4} />
      </instancedMesh>
      <instancedMesh ref={ghost} args={[box, undefined, MAX]} frustumCulled={false}
        onClick={pick(ghosts)} onPointerOver={hover(true)} onPointerOut={hover(false)}>
        <meshStandardMaterial color="#ef4d4d" transparent opacity={0.22} depthWrite={false} />
      </instancedMesh>
      <mesh ref={ring} rotation-x={-Math.PI / 2} visible={false}>
        <ringGeometry args={[1.4, 1.8, 32]} />
        <meshBasicMaterial color="#f5a524" transparent opacity={0.9} />
      </mesh>
    </group>
  )
}

// 播放時推進時間
export function Ticker() {
  useFrame((_, dt) => {
    const s = useStore.getState()
    if (s.playing) s.setTime(s.time + Math.min(dt, 0.1) * s.speed)
  })
  return null
}
