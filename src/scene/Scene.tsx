import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Line, MapControls } from '@react-three/drei'
import * as THREE from 'three'
import type { MapControls as MapControlsImpl } from 'three-stdlib'
import { TRIP_BY_ID } from '../data/load'
import { REGION_VIEW, nodeXZ, project } from '../data/nodes'
import { ISLAND_TOP, pointAt, routeCurve } from '../lib/geo'
import { useStore } from '../store'
import { Island } from './Island'
import { Nodes } from './Nodes'
import { Routes } from './Routes'
import { Ticker, Trucks } from './Trucks'

const BOUNDS = { minX: -108, maxX: 80, minZ: -115, maxZ: 122 }
// 固定的等角視角方向(由目標點指向鏡頭)
const VIEW_DIR = new THREE.Vector3(0.35, 1, 0.75).normalize()

function SelectedRoute() {
  const id = useStore((s) => (s.selected?.kind === 'trip' ? s.selected.id : null))
  const points = useMemo(() => {
    const t = id ? TRIP_BY_ID.get(id) : undefined
    if (!t) return null
    const c = routeCurve(t.o, t.x)
    return Array.from({ length: 41 }, (_, i) => {
      const [x, z] = pointAt(c, i / 40)
      return new THREE.Vector3(x, ISLAND_TOP + 0.15, z)
    })
  }, [id])
  if (!points) return null
  return <Line points={points} color="#f5a524" lineWidth={3} dashed={false} />
}

function CameraRig() {
  const controls = useRef<MapControlsImpl>(null)
  const { camera } = useThree()
  const focus = useStore((s) => s.focus)
  const region = useStore((s) => s.region)
  const focusOn = useStore((s) => s.focusOn)
  const goal = useRef<{ target: THREE.Vector3; dist: number } | null>(null)

  useEffect(() => {
    const v = REGION_VIEW[region]
    const [x, z] = project(v.lon, v.lat)
    focusOn(x, z, v.dist)
  }, [region, focusOn])

  useEffect(() => {
    if (focus) goal.current = { target: new THREE.Vector3(focus.x, 0, focus.z), dist: focus.dist }
  }, [focus])

  useEffect(() => {
    const c = controls.current
    if (!c) return
    const stop = () => { goal.current = null }
    c.addEventListener('start', stop)
    return () => c.removeEventListener('start', stop)
  }, [])

  useFrame((_, dt) => {
    const c = controls.current
    if (!c) return
    if (goal.current) {
      const k = 1 - Math.exp(-dt * 3.5)
      const dist = camera.position.distanceTo(c.target)
      c.target.lerp(goal.current.target, k)
      const nd = dist + (goal.current.dist - dist) * k
      camera.position.copy(c.target).addScaledVector(VIEW_DIR, nd)
      if (c.target.distanceTo(goal.current.target) < 0.05 && Math.abs(nd - goal.current.dist) < 0.1) goal.current = null
    }
    // 限制在地圖範圍內
    const t = c.target
    const cx = THREE.MathUtils.clamp(t.x, BOUNDS.minX, BOUNDS.maxX)
    const cz = THREE.MathUtils.clamp(t.z, BOUNDS.minZ, BOUNDS.maxZ)
    if (cx !== t.x || cz !== t.z) {
      camera.position.x += cx - t.x
      camera.position.z += cz - t.z
      t.set(cx, t.y, cz)
    }
    c.update()
  })

  return (
    <MapControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.12}
      minDistance={20}
      maxDistance={380}
      minPolarAngle={0.35}
      maxPolarAngle={1.05}
      screenSpacePanning={false}
    />
  )
}

export function Scene() {
  const select = useStore((s) => s.select)
  const [hx, hz] = nodeXZ('中轉')
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [hx + VIEW_DIR.x * 285, VIEW_DIR.y * 285, hz + VIEW_DIR.z * 285], fov: 32, near: 1, far: 1600 }}
      onPointerMissed={() => select(null)}
    >
      <color attach="background" args={['#0b0e11']} />
      <fog attach="fog" args={['#0b0e11', 320, 760]} />
      <hemisphereLight args={['#c9d6e2', '#1a1f24', 0.55]} />
      <directionalLight
        castShadow
        position={[100, 200, 70]}
        intensity={1.6}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-160}
        shadow-camera-right={160}
        shadow-camera-top={160}
        shadow-camera-bottom={-160}
        shadow-camera-far={600}
        shadow-bias={-0.0005}
      />
      <Island />
      <Routes />
      <Nodes />
      <Trucks />
      <SelectedRoute />
      <Ticker />
      <CameraRig />
    </Canvas>
  )
}
