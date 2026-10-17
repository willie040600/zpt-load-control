import { useMemo, useRef, useState } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { MINOR_SITES, NODES, nodeXZ } from '../data/nodes'
import { ISLAND_TOP } from '../lib/geo'
import { emptyCost } from '../lib/effective'
import { useScopeTrips } from '../lib/selectors'
import { useStore } from '../store'

// 低裝載空載成本歸到「非轉運中心」那一端;轉運中心之間的車趟歸到發車端
function usePainByNode(): Map<string, number> {
  const trips = useScopeTrips()
  return useMemo(() => {
    const m = new Map<string, number>()
    for (const t of trips) {
      if (t.removed || t.eLr >= 80) continue
      const key = NODES[t.o]?.hub && !NODES[t.x]?.hub ? t.x : t.o
      m.set(key, (m.get(key) ?? 0) + emptyCost(t))
    }
    return m
  }, [trips])
}

const amber = new THREE.Color('#f5a524')
const red = new THREE.Color('#ef4d4d')

function Hub({ name }: { name: string }) {
  const [x, z] = nodeXZ(name)
  const select = useStore((s) => s.select)
  const focusOn = useStore((s) => s.focusOn)
  const selected = useStore((s) => s.selected?.kind === 'node' && s.selected.name === name)
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    select({ kind: 'node', name })
    focusOn(x, z, 55)
  }
  return (
    <group position={[x, ISLAND_TOP, z]}>
      <mesh position-y={0.8} castShadow receiveShadow onClick={onClick}>
        <boxGeometry args={[4, 1.6, 2.8]} />
        <meshStandardMaterial color={selected ? '#3a4650' : '#313b43'} roughness={0.7} flatShading />
      </mesh>
      <mesh position-y={1.85} castShadow>
        <boxGeometry args={[4.15, 0.5, 2.95]} />
        <meshStandardMaterial color="#c58a1e" roughness={0.6} flatShading />
      </mesh>
      {[-1.5, -0.75, 0, 0.75, 1.5].map((dx) => (
        <mesh key={dx} position={[dx, 0.45, 1.41]}>
          <boxGeometry args={[0.55, 0.7, 0.05]} />
          <meshStandardMaterial color="#f5a524" emissive="#f5a524" emissiveIntensity={0.35} />
        </mesh>
      ))}
      <Html position={[0, 3.1, 0]} center className="label label-hub" zIndexRange={[20, 0]}>
        {name}
      </Html>
    </group>
  )
}

function Station({ name, pain, maxPain, showLabel }: { name: string; pain: number; maxPain: number; showLabel: boolean }) {
  const [x, z] = nodeXZ(name)
  const select = useStore((s) => s.select)
  const focusOn = useStore((s) => s.focusOn)
  const selected = useStore((s) => s.selected?.kind === 'node' && s.selected.name === name)
  const k = maxPain > 0 ? Math.sqrt(pain / maxPain) : 0
  const h = 0.2 + k * 7
  const color = useMemo(() => amber.clone().lerp(red, k), [k])
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    select({ kind: 'node', name })
    focusOn(x, z, 40)
  }
  return (
    <group position={[x, ISLAND_TOP, z]}>
      <mesh position-y={0.25} castShadow receiveShadow onClick={onClick}>
        <boxGeometry args={[0.85, 0.5, 0.85]} />
        <meshStandardMaterial color={selected ? '#f5a524' : '#46525c'} roughness={0.8} flatShading />
      </mesh>
      {pain > 0 && (
        <mesh position-y={0.5 + h / 2} onClick={onClick} castShadow>
          <cylinderGeometry args={[0.22, 0.22, h, 6]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} transparent opacity={0.85} />
        </mesh>
      )}
      {(showLabel || selected) && (
        <Html position={[0, 1.1 + (pain > 0 ? h : 0), 0]} center className="label" zIndexRange={[10, 0]}>
          {name}
        </Html>
      )}
    </group>
  )
}

// 拉近時只顯示畫面中心附近的站名,避免遠處標籤擠成一團
const LABEL_HEIGHT = 120
const LABEL_RADIUS = 45

export function Nodes() {
  const pain = usePainByNode()
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3 } | null
  const [center, setCenter] = useState<[number, number] | null>(null)
  const last = useRef('')
  useFrame(({ camera }) => {
    let key = 'off'
    let next: [number, number] | null = null
    if (controls && camera.position.y < LABEL_HEIGHT) {
      next = [Math.round(controls.target.x / 4) * 4, Math.round(controls.target.z / 4) * 4]
      key = next.join(',')
    }
    if (key !== last.current) {
      last.current = key
      setCenter(next)
    }
  })
  const near = (name: string) => {
    if (!center || MINOR_SITES.has(name)) return false
    const [x, z] = nodeXZ(name)
    return Math.hypot(x - center[0], z - center[1]) < LABEL_RADIUS
  }
  const names = useMemo(() => Object.keys(NODES), [])
  const maxPain = useMemo(() => Math.max(1, ...pain.values()), [pain])
  return (
    <group>
      {names.map((n) =>
        NODES[n].hub ? (
          <Hub key={n} name={n} />
        ) : (
          <Station key={n} name={n} pain={pain.get(n) ?? 0} maxPain={maxPain} showLabel={near(n)} />
        ),
      )}
    </group>
  )
}
