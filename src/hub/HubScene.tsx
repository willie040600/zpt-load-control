import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Html, Line, MapControls } from '@react-three/drei'
import * as THREE from 'three'
import type { MapControls as MapControlsImpl } from 'three-stdlib'
import { BUCKETS } from '../data/codes'
import { loadLevel } from '../lib/effective'
import { Ticker } from '../scene/Trucks'
import { useStore } from '../store'
import { DOCK, HUBS, ROAD_GAP, poseAt, truckLength, type HubLayout, type HubTrip } from './layout'
import { useHubDay } from './useHub'

const STRIPE = { good: '#2fa866', watch: '#e8a317', bad: '#e0483e' } as const
const DIM = '#b9bec4'
const FLOOR_Y = 0.4

function groupOf(t: HubTrip['t']): string | null {
  return t.bk === 'OK' ? null : BUCKETS[t.bk].group
}

// 黃黑斜紋貼圖,用在碼頭前的地面
function useHazardTexture() {
  return useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 64
    c.height = 16
    const g = c.getContext('2d')!
    g.fillStyle = '#2b2f36'
    g.fillRect(0, 0, 64, 16)
    g.fillStyle = '#e8a317'
    for (let x = -16; x < 80; x += 16) {
      g.beginPath()
      g.moveTo(x, 16)
      g.lineTo(x + 8, 16)
      g.lineTo(x + 16, 0)
      g.lineTo(x + 8, 0)
      g.fill()
    }
    const tex = new THREE.CanvasTexture(c)
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }, [])
}

function Ground({ hub }: { hub: HubLayout }) {
  const { W, D } = hub
  const roadZ = D / 2 + ROAD_GAP
  const roadX = W / 2 + ROAD_GAP
  const dashes = useMemo(() => {
    const out: [number, number, number][] = []
    for (let x = -W / 2 - 120; x < roadX - 10; x += 8) out.push([x, roadZ, 0])
    for (let z = -D / 2 - 120; z < roadZ - 10; z += 8) out.push([roadX, z, 1])
    return out
  }, [W, D, roadX, roadZ])
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.01} receiveShadow>
        <planeGeometry args={[1200, 1200]} />
        <meshStandardMaterial color="#e9e6df" roughness={1} />
      </mesh>
      {/* 場站鋪面 */}
      <mesh rotation-x={-Math.PI / 2} position={[ROAD_GAP / 2, 0.01, ROAD_GAP / 2]} receiveShadow>
        <planeGeometry args={[W + ROAD_GAP * 2 + 20, D + ROAD_GAP * 2 + 20]} />
        <meshStandardMaterial color="#dedbd4" roughness={1} />
      </mesh>
      {/* 南側與東側道路 */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, roadZ]} receiveShadow>
        <planeGeometry args={[1200, 12]} />
        <meshStandardMaterial color="#cfccc5" roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[roadX, 0.025, 0]} receiveShadow>
        <planeGeometry args={[12, 1200]} />
        <meshStandardMaterial color="#cfccc5" roughness={1} />
      </mesh>
      {dashes.map(([a, b, v], i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[a, 0.04, b]} rotation-z={v ? Math.PI / 2 : 0}>
          <planeGeometry args={[4, 0.35]} />
          <meshBasicMaterial color="#f7f6f2" />
        </mesh>
      ))}
    </group>
  )
}

function Building({ hub }: { hub: HubLayout }) {
  const { W, D } = hub
  const hazard = useHazardTexture()
  const showLabels = useStore((s) => s.showLabels)
  const outX = (i: number) => -W / 2 + 9 + DOCK * (i + 0.5)
  const inZ = (i: number) => -D / 2 + 9 + DOCK * (i + 0.5)
  const stagingOut = useMemo(
    () => [
      [-W / 2 + 6, FLOOR_Y + 0.05, D / 2 - 15], [W / 2 - 17, FLOOR_Y + 0.05, D / 2 - 15],
      [W / 2 - 17, FLOOR_Y + 0.05, D / 2 - 2], [-W / 2 + 6, FLOOR_Y + 0.05, D / 2 - 2], [-W / 2 + 6, FLOOR_Y + 0.05, D / 2 - 15],
    ] as [number, number, number][],
    [W, D],
  )
  const stagingIn = useMemo(
    () => [
      [W / 2 - 15, FLOOR_Y + 0.05, -D / 2 + 6], [W / 2 - 2, FLOOR_Y + 0.05, -D / 2 + 6],
      [W / 2 - 2, FLOOR_Y + 0.05, D / 2 - 17], [W / 2 - 15, FLOOR_Y + 0.05, D / 2 - 17], [W / 2 - 15, FLOOR_Y + 0.05, -D / 2 + 6],
    ] as [number, number, number][],
    [W, D],
  )
  const sorterLen = W - 46
  return (
    <group>
      {/* 地板與後牆(剖面式,前牆壓低方便看到內部) */}
      <mesh position={[0, FLOOR_Y / 2, 0]} receiveShadow castShadow>
        <boxGeometry args={[W, FLOOR_Y, D]} />
        <meshStandardMaterial color="#f4f2ed" roughness={0.9} />
      </mesh>
      <mesh position={[0, 5, -D / 2 + 0.4]} castShadow receiveShadow>
        <boxGeometry args={[W, 10, 0.8]} />
        <meshStandardMaterial color="#d6d4ce" roughness={0.9} />
      </mesh>
      <mesh position={[-W / 2 + 0.4, 5, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.8, 10, D]} />
        <meshStandardMaterial color="#cfcdc7" roughness={0.9} />
      </mesh>
      {/* 後牆上的採光窗 */}
      {Array.from({ length: Math.floor(W / 14) }, (_, i) => (
        <mesh key={'w' + i} position={[-W / 2 + 10 + i * 14, 7.5, -D / 2 + 0.85]}>
          <boxGeometry args={[7, 1.6, 0.1]} />
          <meshStandardMaterial color="#b9c7d3" roughness={0.4} />
        </mesh>
      ))}
      {/* 辦公室 */}
      <mesh position={[-W / 2 + 9, 3, -D / 2 + 7]} castShadow receiveShadow>
        <boxGeometry args={[16, 6, 12]} />
        <meshStandardMaterial color="#e3e1db" roughness={0.8} />
      </mesh>
      <mesh position={[-W / 2 + 9, 3.4, -D / 2 + 13.05]}>
        <boxGeometry args={[12, 1.4, 0.1]} />
        <meshStandardMaterial color="#9fb2c2" />
      </mesh>
      {/* 空籠車存放區(示意) */}
      {Array.from({ length: 24 }, (_, i) => (
        <mesh key={'e' + i} position={[-W / 2 + 22 + (i % 8) * 1.5, FLOOR_Y + 0.85, -D / 2 + 4 + Math.floor(i / 8) * 1.5]} castShadow>
          <boxGeometry args={[1.25, 1.7, 1.25]} />
          <meshStandardMaterial color="#d3d7dc" roughness={0.5} metalness={0.2} />
        </mesh>
      ))}
      <Html position={[-W / 2 + 27, FLOOR_Y + 3, -D / 2 + 6]} center className="hx-zone" zIndexRange={[5, 0]}>空籠車區</Html>
      {/* 分揀線:主線四條,另有通往碼頭區的支線 */}
      {Array.from({ length: Math.max(2, Math.floor((W - 40) / 16)) }, (_, i) => (
        <mesh key={'f' + i} position={[-W / 2 + 26 + i * 16, FLOOR_Y + 0.7, (9.5 + D / 2 - 15) / 2]} castShadow receiveShadow>
          <boxGeometry args={[1.8, 0.9, D / 2 - 15 - 9.5]} />
          <meshStandardMaterial color="#6a737e" roughness={0.6} />
        </mesh>
      ))}
      {[-11, -5, 1, 7].map((z, i) => (
        <mesh key={'g' + i} position={[W / 2 - 22, FLOOR_Y + 0.7, z]} castShadow receiveShadow>
          <boxGeometry args={[14, 0.9, 1.8]} />
          <meshStandardMaterial color="#6a737e" roughness={0.6} />
        </mesh>
      ))}
      {[-9, -3, 3, 9].map((dz) => (
        <group key={dz} position={[-6, FLOOR_Y, dz - 2]}>
          <mesh position-y={0.9} castShadow receiveShadow>
            <boxGeometry args={[sorterLen, 1.2, 2.6]} />
            <meshStandardMaterial color="#5b6470" roughness={0.6} />
          </mesh>
          <mesh position-y={1.55}>
            <boxGeometry args={[sorterLen, 0.12, 2.2]} />
            <meshStandardMaterial color="#3d444d" />
          </mesh>
          <mesh position={[0, 1.6, 1.35]}>
            <boxGeometry args={[sorterLen, 0.25, 0.12]} />
            <meshStandardMaterial color="#e8a317" />
          </mesh>
        </group>
      ))}
      <Line points={stagingOut} color="#e8a317" lineWidth={2} dashed dashSize={1.2} gapSize={0.8} />
      <Line points={stagingIn} color="#e8a317" lineWidth={2} dashed dashSize={1.2} gapSize={0.8} />
      {/* 南面發車碼頭 */}
      {Array.from({ length: hub.outDocks }, (_, i) => (
        <group key={'o' + i} position={[outX(i), 0, D / 2]}>
          <mesh position={[DOCK / 2, 2.6, -0.2]} castShadow>
            <boxGeometry args={[0.5, 5.2, 0.5]} />
            <meshStandardMaterial color="#c3c1bb" />
          </mesh>
          <mesh position={[0, FLOOR_Y + 0.05, 0.9]}>
            <boxGeometry args={[3.6, 0.15, 1.8]} />
            <meshStandardMaterial color="#6b737d" />
          </mesh>
          <mesh rotation-x={-Math.PI / 2} position={[0, 0.06, 2.6]}>
            <planeGeometry args={[4, 0.9]} />
            <meshBasicMaterial map={hazard} />
          </mesh>
          {showLabels && (
            <Html position={[0, 0.2, 4]} center className="hx-dockno" zIndexRange={[5, 0]}>O{i + 1}</Html>
          )}
        </group>
      ))}
      {/* 東面進站碼頭 */}
      {Array.from({ length: hub.inDocks }, (_, i) => (
        <group key={'i' + i} position={[W / 2, 0, inZ(i)]}>
          <mesh position={[-0.2, 2.6, DOCK / 2]} castShadow>
            <boxGeometry args={[0.5, 5.2, 0.5]} />
            <meshStandardMaterial color="#c3c1bb" />
          </mesh>
          <mesh position={[0.9, FLOOR_Y + 0.05, 0]}>
            <boxGeometry args={[1.8, 0.15, 3.6]} />
            <meshStandardMaterial color="#6b737d" />
          </mesh>
          <mesh rotation-x={-Math.PI / 2} rotation-z={Math.PI / 2} position={[2.6, 0.06, 0]}>
            <planeGeometry args={[4, 0.9]} />
            <meshBasicMaterial map={hazard} />
          </mesh>
          {showLabels && (
            <Html position={[4, 0.2, 0]} center className="hx-dockno" zIndexRange={[5, 0]}>I{i + 1}</Html>
          )}
        </group>
      ))}
      <Html position={[-W / 2 + 22, FLOOR_Y + 0.2, D / 2 - 8]} center className="hx-zone" zIndexRange={[5, 0]}>發車裝貨區 OUTBOUND</Html>
      <Html position={[W / 2 - 8, FLOOR_Y + 0.2, -D / 2 + 18]} center className="hx-zone" zIndexRange={[5, 0]}>進站卸貨區 INBOUND</Html>
      <Html position={[-6, FLOOR_Y + 3.2, -6]} center className="hx-zone" zIndexRange={[5, 0]}>分揀線 SORTER</Html>
    </group>
  )
}

// 碼頭內側的籠車堆:裝貨時減少、卸貨時增加
const MAX_CAGES = 900
const cageGeo = new THREE.BoxGeometry(1.25, 1.7, 1.25)
const dummy = new THREE.Object3D()
const hidden = new THREE.Matrix4().makeScale(0, 0, 0)
const CAGE_NORMAL = new THREE.Color('#c4c9cf')
const CAGE_COLD = new THREE.Color('#8fb8de')

function Cages({ items, hub }: { items: HubTrip[]; hub: HubLayout }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useFrame(() => {
    const m = ref.current
    if (!m) return
    const time = useStore.getState().time
    let k = 0
    for (const it of items) {
      if (it.dock < 0) continue
      const ps = poseAt(it, hub, time)
      if (!ps || ps.phase !== 'dock') continue
      const n = Math.min(it.t.eN, it.t.eCap)
      const stack = Math.round(it.dir === 'out' ? n * (1 - ps.p) : n * ps.p)
      const color = it.t.cold ? CAGE_COLD : CAGE_NORMAL
      for (let c = 0; c < stack && k < MAX_CAGES; c++, k++) {
        const col = c % 3
        const row = Math.floor(c / 3)
        if (it.dir === 'out') {
          const x = -hub.W / 2 + 9 + DOCK * (it.dock + 0.5) + (col - 1) * 1.45
          dummy.position.set(x, FLOOR_Y + 0.85, hub.D / 2 - 2 - row * 1.45)
        } else {
          const z = -hub.D / 2 + 9 + DOCK * (it.dock + 0.5) + (col - 1) * 1.45
          dummy.position.set(hub.W / 2 - 2 - row * 1.45, FLOOR_Y + 0.85, z)
        }
        dummy.updateMatrix()
        m.setMatrixAt(k, dummy.matrix)
        m.setColorAt(k, color)
      }
    }
    for (let i = k; i < m.count; i++) m.setMatrixAt(i, hidden)
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  })
  return (
    <instancedMesh ref={ref} args={[cageGeo, undefined, MAX_CAGES]} castShadow frustumCulled={false}>
      <meshStandardMaterial roughness={0.5} metalness={0.2} />
    </instancedMesh>
  )
}

function shortName(name: string): string {
  return name.replace('(外島空運件)', '').replace('物流', '')
}

function Truck({ it, hub }: { it: HubTrip; hub: HubLayout }) {
  const g = useRef<THREE.Group>(null)
  const select = useStore((s) => s.select)
  const selected = useStore((s) => s.selected?.kind === 'trip' && s.selected.id === it.t.id)
  const showLabels = useStore((s) => s.showLabels)
  const groupFilter = useStore((s) => s.groupFilter)
  const [docked, setDocked] = useState(false)
  const t = it.t
  const L = truckLength(t.eTn)
  const dim = groupFilter !== null && groupOf(t) !== groupFilter
  const stripe = dim ? DIM : STRIPE[loadLevel(t.eLr)]
  const trailer = L - 2.4

  useFrame(() => {
    const ps = poseAt(it, hub, useStore.getState().time)
    if (!g.current) return
    g.current.visible = !!ps
    if (!ps) return
    g.current.position.set(ps.x, 0, ps.z)
    g.current.rotation.y = ps.yaw
    const d = ps.phase === 'dock'
    if (d !== docked) setDocked(d)
  })

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    select({ kind: 'trip', id: t.id })
  }
  const other = it.dir === 'out' ? t.x : t.o
  return (
    <group ref={g} onClick={onClick}
      onPointerOver={() => { document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { document.body.style.cursor = '' }}>
      {/* 貨箱:車尾在 −x(靠碼頭),車頭在 +x */}
      <mesh position={[-1.2, 2.05, 0]} castShadow receiveShadow>
        <boxGeometry args={[trailer, 2.9, 2.6]} />
        <meshStandardMaterial color={dim ? '#e4e5e7' : '#f6f5f1'} roughness={0.6} />
      </mesh>
      <mesh position={[-1.2, 1.55, 1.32]}>
        <boxGeometry args={[trailer - 0.6, 0.45, 0.06]} />
        <meshStandardMaterial color={stripe} />
      </mesh>
      <mesh position={[-1.2, 1.55, -1.32]}>
        <boxGeometry args={[trailer - 0.6, 0.45, 0.06]} />
        <meshStandardMaterial color={stripe} />
      </mesh>
      <mesh position={[-1.2, 3.52, 0]}>
        <boxGeometry args={[trailer, 0.06, 2.6]} />
        <meshStandardMaterial color={stripe} />
      </mesh>
      <mesh position={[L / 2 - 1.15, 1.45, 0]} castShadow>
        <boxGeometry args={[2.1, 2.3, 2.5]} />
        <meshStandardMaterial color={dim ? '#9aa1a9' : '#33404f'} roughness={0.5} />
      </mesh>
      <mesh position={[L / 2 - 0.08, 1.9, 0]}>
        <boxGeometry args={[0.08, 0.9, 2.1]} />
        <meshStandardMaterial color="#1c232c" />
      </mesh>
      <mesh position={[0, 0.35, 0]}>
        <boxGeometry args={[L - 0.4, 0.5, 2.2]} />
        <meshStandardMaterial color="#2a2f36" />
      </mesh>
      {selected && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.08}>
          <ringGeometry args={[L * 0.62, L * 0.62 + 0.6, 48]} />
          <meshBasicMaterial color="#e8a317" transparent opacity={0.95} />
        </mesh>
      )}
      {/* 預設只標示低裝載車;開啟「全部標籤」時標示所有靠碼頭的車 */}
      {(selected || (docked && !dim && (showLabels || t.eLr < 80))) && (
        <Html position={[0, 5.2, 0]} center className={'hx-tag' + (selected ? ' on' : '')} zIndexRange={[20, 10]}>
          <span className="dot" style={{ background: stripe }} />
          {shortName(other)} {Math.round(t.eLr)}%
        </Html>
      )}
    </group>
  )
}

function Trucks({ items, hub }: { items: HubTrip[]; hub: HubLayout }) {
  const [visible, setVisible] = useState<HubTrip[]>([])
  const key = useRef('')
  useFrame(() => {
    const time = useStore.getState().time
    const vis = items.filter((it) => poseAt(it, hub, time) !== null)
    const k = vis.map((v) => v.t.id).join(',')
    if (k !== key.current) {
      key.current = k
      setVisible(vis)
    }
  })
  return (
    <group>
      {visible.map((it) => (
        <Truck key={it.t.id} it={it} hub={hub} />
      ))}
    </group>
  )
}

function CameraRig({ hub }: { hub: HubLayout }) {
  const controls = useRef<MapControlsImpl>(null)
  const { camera, size } = useThree()
  const focus = useStore((s) => s.focus)
  const goal = useRef<{ target: THREE.Vector3; zoom: number } | null>(null)
  const fitZoom = Math.min(size.width / (hub.W + hub.D + 110), size.height / ((hub.W + hub.D) * 0.62 + 70))

  useEffect(() => {
    goal.current = { target: new THREE.Vector3(hub.W * 0.16, 0, hub.D * 0.24), zoom: fitZoom * 1.08 }
  }, [hub, fitZoom])

  useEffect(() => {
    if (!focus) return
    goal.current = { target: new THREE.Vector3(focus.x, 0, focus.z), zoom: fitZoom * 1.9 }
  }, [focus, fitZoom])

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
    const cam = camera as THREE.OrthographicCamera
    if (goal.current) {
      const k = 1 - Math.exp(-dt * 4)
      const off = cam.position.clone().sub(c.target)
      c.target.lerp(goal.current.target, k)
      cam.position.copy(c.target).add(off)
      cam.zoom += (goal.current.zoom - cam.zoom) * k
      cam.updateProjectionMatrix()
      if (c.target.distanceTo(goal.current.target) < 0.05 && Math.abs(cam.zoom - goal.current.zoom) < 0.01) goal.current = null
    }
    const lim = { x: hub.W / 2 + ROAD_GAP + 30, z: hub.D / 2 + ROAD_GAP + 30 }
    const t = c.target
    const cx = THREE.MathUtils.clamp(t.x, -lim.x, lim.x)
    const cz = THREE.MathUtils.clamp(t.z, -lim.z, lim.z)
    if (cx !== t.x || cz !== t.z) {
      cam.position.x += cx - t.x
      cam.position.z += cz - t.z
      t.set(cx, t.y, cz)
    }
    c.update()
  })

  return (
    <MapControls ref={controls} makeDefault enableRotate={false} enableDamping dampingFactor={0.15}
      minZoom={fitZoom * 0.7} maxZoom={fitZoom * 5} screenSpacePanning={false} />
  )
}

function Scene() {
  const hubName = useStore((s) => s.hub)
  const hub = HUBS[hubName]
  const { items } = useHubDay()
  return (
    <>
      <color attach="background" args={['#ece9e2']} />
      <hemisphereLight args={['#ffffff', '#cfcac0', 0.9]} />
      <directionalLight
        castShadow
        position={[-80, 160, 120]}
        intensity={1.4}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-160}
        shadow-camera-right={160}
        shadow-camera-top={160}
        shadow-camera-bottom={-160}
        shadow-camera-far={500}
        shadow-bias={-0.0004}
      />
      <Ground hub={hub} />
      <Building hub={hub} />
      <Cages items={items} hub={hub} />
      <Trucks items={items} hub={hub} />
      <Ticker />
      <CameraRig hub={hub} />
    </>
  )
}

export function HubScene() {
  const select = useStore((s) => s.select)
  return (
    <Canvas shadows orthographic dpr={[1, 2]} camera={{ position: [260, 300, 300], zoom: 4, near: -1000, far: 3000 }}
      onPointerMissed={() => select(null)}>
      <Scene />
    </Canvas>
  )
}
