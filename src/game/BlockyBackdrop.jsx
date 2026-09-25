import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { BoxGeometry, Color, MeshBasicMaterial, MeshLambertMaterial, Object3D } from 'three'

import { local } from './bus'

/**
 * The far-away blocky world round every scene: two rings of voxel mountains,
 * a sky of chunky drifting clouds and a square pixel sun. It all travels with
 * the player like a skybox (the dungeon runs a long way north), and each layer is
 * one instanced mesh, so the whole backdrop costs three draw calls.
 */

const unitBox = new BoxGeometry(1, 1, 1)
const _o = new Object3D()
const _c = new Color()

function seeded(seed) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

/** Smooth rolling ridge heights from a few sine waves, stepped into blocks. */
function ridge(a, seed) {
  return (
    Math.sin(a * 3 + seed) * 0.5 +
    Math.sin(a * 7 + seed * 2.3) * 0.3 +
    Math.sin(a * 13 + seed * 0.7) * 0.2 +
    Math.sin(a * 23 + seed * 5.1) * 0.08
  )
}

/**
 * Rings of terraced columns: each column is stacked from a few boxes, stepping
 * in as it climbs so peaks read as pixel-art mountains. Tall ones get a snow cap.
 */
const RINGS = [
  // Near: green hills with grassy tops.
  { radius: 300, count: 84, base: 38, amp: 44, seed: 1.7, rock: '#6a9a70', top: '#86d06a', snow: null, steps: 3 },
  // Far: tall blue-grey peaks with snow.
  { radius: 380, count: 72, base: 80, amp: 70, seed: 4.2, rock: '#96abcf', top: '#b4c5e4', snow: '#ffffff', steps: 4 },
]

function buildMountains() {
  const boxes = []
  for (const ring of RINGS) {
    const width = ((Math.PI * 2 * ring.radius) / ring.count) * 1.08
    for (let i = 0; i < ring.count; i += 1) {
      const a = (i / ring.count) * Math.PI * 2
      const h = Math.max(12, ring.base + ridge(a, ring.seed) * ring.amp)
      const x = Math.sin(a) * ring.radius
      const z = Math.cos(a) * ring.radius
      // Terraces: each step up is narrower and sits on the one below.
      let y = -6
      for (let s = 0; s < ring.steps; s += 1) {
        const stepH = s === 0 ? h * 0.55 : (h * 0.45) / (ring.steps - 1)
        const w = width * (1 - s * 0.2)
        const top = s === ring.steps - 1
        const color = top && ring.snow && h > ring.base + ring.amp * 0.15 ? ring.snow : s === ring.steps - 1 || (s === 1 && !ring.snow) ? ring.top : ring.rock
        boxes.push({ x, y: y + stepH / 2, z, w, h: stepH, rot: a, color })
        y += stepH
      }
    }
  }
  return boxes
}

function Mountains() {
  const ref = useRef()
  const boxes = useMemo(() => buildMountains(), [])
  // No fog: the colours above are already hazed for distance, and fog this far
  // out would wash the ranges into the sky.
  const material = useMemo(() => new MeshLambertMaterial({ color: '#ffffff', fog: false }), [])

  useLayoutEffect(() => {
    const mesh = ref.current
    boxes.forEach((b, i) => {
      _o.position.set(b.x, b.y, b.z)
      _o.rotation.set(0, b.rot, 0)
      _o.scale.set(b.w, b.h, b.w * 0.9)
      _o.updateMatrix()
      mesh.setMatrixAt(i, _o.matrix)
      mesh.setColorAt(i, _c.set(b.color))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [boxes])

  useFrame(() => {
    // Like a skybox: centred on the player in x/z, so it's always on the horizon.
    ref.current?.position.set(local.pos.x, 0, local.pos.z)
  })

  return <instancedMesh ref={ref} args={[unitBox, material, boxes.length]} frustumCulled={false} renderOrder={-1} />
}

/** Chunky clouds drifting east, wrapped round the player so the sky never runs out. */
const CLOUD_COUNT = 26
const CLOUD_SPAN = 640
const CLOUD_SPEED = 2.2

function buildClouds() {
  const rand = seeded(9173)
  const clouds = []
  for (let i = 0; i < CLOUD_COUNT; i += 1) {
    const cx = (rand() - 0.5) * CLOUD_SPAN
    const cz = (rand() - 0.5) * CLOUD_SPAN
    const cy = 78 + rand() * 30
    const size = 0.8 + rand() * 0.9
    const parts = []
    const n = 3 + Math.floor(rand() * 4)
    for (let j = 0; j < n; j += 1) {
      parts.push({
        x: (j - n / 2) * 7 * size + (rand() - 0.5) * 4,
        y: (j % 2) * 2.2 * size,
        z: (rand() - 0.5) * 8 * size,
        w: (10 + rand() * 8) * size,
        h: (3.2 + rand() * 2.2) * size,
        d: (8 + rand() * 6) * size,
      })
    }
    // A flat, slightly shaded underside keeps them from reading as pure white slabs.
    parts.push({ x: 0, y: -1.6 * size, z: 0, w: n * 7 * size, h: 1.4 * size, d: 9 * size, under: true })
    clouds.push({ cx, cy, cz, parts })
  }
  return clouds
}

function Clouds() {
  const ref = useRef()
  const clouds = useMemo(() => buildClouds(), [])
  const count = useMemo(() => clouds.reduce((n, c) => n + c.parts.length, 0), [clouds])
  const material = useMemo(() => new MeshLambertMaterial({ color: '#ffffff', emissive: '#dcecff', emissiveIntensity: 0.55, fog: false }), [])

  useLayoutEffect(() => {
    const mesh = ref.current
    let i = 0
    for (const c of clouds) for (const p of c.parts) mesh.setColorAt(i++, _c.set(p.under ? '#d6e4f5' : '#ffffff'))
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [clouds])

  useFrame((state) => {
    const mesh = ref.current
    if (!mesh) return
    const drift = state.clock.elapsedTime * CLOUD_SPEED
    const half = CLOUD_SPAN / 2
    let i = 0
    for (const c of clouds) {
      // Wrap each cloud into the square around the player.
      const wx = ((((c.cx + drift - local.pos.x + half) % CLOUD_SPAN) + CLOUD_SPAN) % CLOUD_SPAN) - half + local.pos.x
      const wz = ((((c.cz - local.pos.z + half) % CLOUD_SPAN) + CLOUD_SPAN) % CLOUD_SPAN) - half + local.pos.z
      for (const p of c.parts) {
        _o.position.set(wx + p.x, c.cy + p.y, wz + p.z)
        _o.rotation.set(0, 0, 0)
        _o.scale.set(p.w, p.h, p.d)
        _o.updateMatrix()
        mesh.setMatrixAt(i++, _o.matrix)
      }
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return <instancedMesh ref={ref} args={[unitBox, material, count]} frustumCulled={false} />
}

/** A square pixel sun with a stepped halo, up where the sunlight comes from. */
const SUN_DIR = [0.52, 0.5, 0.36]
const SUN_DIST = 360

function Sun() {
  const ref = useRef()
  const layers = useMemo(
    () => [
      { size: 64, color: '#fff3b0', opacity: 0.12 },
      { size: 46, color: '#ffe680', opacity: 0.22 },
      { size: 32, color: '#fff6c8', opacity: 1 },
      { size: 22, color: '#ffffff', opacity: 1 },
    ].map((l) => ({ ...l, mat: new MeshBasicMaterial({ color: l.color, transparent: l.opacity < 1, opacity: l.opacity, fog: false, toneMapped: false, depthWrite: false }) })),
    [],
  )
  useFrame(({ camera }) => {
    const g = ref.current
    if (!g) return
    const len = Math.hypot(...SUN_DIR)
    g.position.set(
      local.pos.x + (SUN_DIR[0] / len) * SUN_DIST,
      (SUN_DIR[1] / len) * SUN_DIST,
      local.pos.z + (SUN_DIR[2] / len) * SUN_DIST,
    )
    g.lookAt(camera.position)
  })
  return (
    <group ref={ref}>
      {layers.map((l, i) => (
        <mesh key={i} material={l.mat} position={[0, 0, i * 0.5]} renderOrder={-1}>
          <planeGeometry args={[l.size, l.size]} />
        </mesh>
      ))}
    </group>
  )
}

export function BlockyBackdrop() {
  return (
    <>
      <Sun />
      <Mountains />
      <Clouds />
    </>
  )
}

export default BlockyBackdrop
