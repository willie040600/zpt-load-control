import { useMemo } from 'react'
import * as THREE from 'three'
import { Grid } from '@react-three/drei'
import { ISLANDS, TAIWAN_OUTLINE, project, SCALE } from '../data/nodes'
import { ISLAND_TOP } from '../lib/geo'

function outlineShape(points: [number, number][]): THREE.Shape {
  const shape = new THREE.Shape()
  points.forEach(([lon, lat], i) => {
    const [x, z] = project(lon, lat)
    if (i === 0) shape.moveTo(x, -z)
    else shape.lineTo(x, -z)
  })
  shape.closePath()
  return shape
}

const EXTRUDE = { depth: ISLAND_TOP, bevelEnabled: false }

export function Island() {
  const main = useMemo(() => new THREE.ExtrudeGeometry(outlineShape(TAIWAN_OUTLINE), EXTRUDE), [])
  const edges = useMemo(() => new THREE.EdgesGeometry(main, 30), [main])

  return (
    <group>
      {/* 海面 */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.02} receiveShadow>
        <planeGeometry args={[1400, 1400]} />
        <meshStandardMaterial color="#10161b" roughness={1} />
      </mesh>
      <Grid
        position={[0, 0.01, 0]}
        args={[900, 900]}
        cellSize={4}
        cellThickness={0.5}
        cellColor="#1b2329"
        sectionSize={20}
        sectionThickness={0.9}
        sectionColor="#24303a"
        fadeDistance={600}
        fadeStrength={1.2}
        infiniteGrid
      />
      <mesh geometry={main} rotation-x={-Math.PI / 2} receiveShadow castShadow>
        <meshStandardMaterial color="#2a3238" roughness={0.95} flatShading />
      </mesh>
      <lineSegments geometry={edges} rotation-x={-Math.PI / 2}>
        <lineBasicMaterial color="#56462a" />
      </lineSegments>
      {ISLANDS.map((is) => {
        const [x, z] = project(is.lon, is.lat)
        const r = is.r * SCALE
        return (
          <mesh key={is.name} position={[x, ISLAND_TOP / 2, z]} receiveShadow castShadow>
            <cylinderGeometry args={[r, r * 1.08, ISLAND_TOP, 7]} />
            <meshStandardMaterial color="#2a3238" roughness={0.95} flatShading />
          </mesh>
        )
      })}
    </group>
  )
}
