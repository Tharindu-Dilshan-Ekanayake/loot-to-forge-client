import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, MeshBasicMaterial, MeshStandardMaterial, SRGBColorSpace } from 'three'

import { DUMMIES } from '../../shared/gameData'
import TrainingDummy from '../entities/TrainingDummy'
import { glowTexture, mat, textTexture } from '../textures'
import { Block, Floaty, Glow, Label, Solid, Torch } from './props'

/**
 * The training area: one row of pads along the lobby's west side, weakest in
 * the south. Each pad has its own floor, a glowing rim and a particle effect
 * that matches its dummy.
 */

const PAD = { w: 8.5, d: 8.9 }

/**
 * Per theme: floor/trim materials, rim colour, and the particle effect.
 * fx.mode: 'rise' floats up from the floor, 'fall' drifts down from above,
 * 'burst' shoots up fast and fades, 'orbit' circles the dummy.
 */
const THEMES = {
  basic: { floor: 'sand', trim: 'gold', rim: '#ffd23b', fx: { mode: 'orbit', color: '#ffe07a', size: 0.6, count: 30, speed: 0.35, height: 4.5 } },
  grass: { floor: 'grassDark', trim: 'wood', rim: '#6dff4a', fx: { mode: 'rise', color: '#8aff5a', size: 0.55, count: 34, speed: 0.22, height: 5 } },
  fire: { floor: 'lavaRock', trim: '#ff5a1f', rim: '#ff7a1f', fx: { mode: 'rise', color: '#ff8a2a', size: 0.55, count: 50, speed: 0.55, height: 6 } },
  grave: { floor: 'stoneDark', trim: '#6b7280', rim: '#b98aff', fx: { mode: 'rise', color: '#c9a2ff', size: 0.9, count: 20, speed: 0.14, height: 4.5 } },
  ice: { floor: 'ice', trim: 'snow', rim: '#7fe3ff', fx: { mode: 'fall', color: '#f2fbff', size: 0.34, count: 50, speed: 0.2, height: 7 } },
  lava: { floor: 'nether', trim: '#ff3b1f', rim: '#ff3b1f', fx: { mode: 'burst', color: '#ffb02a', size: 0.55, count: 50, speed: 0.7, height: 7 } },
  void: { floor: 'voidFloor', trim: '#6a3ad8', rim: '#c64dff', fx: { mode: 'orbit', color: '#d88aff', size: 0.6, count: 40, speed: 0.4, height: 5 } },
  shadow: { floor: 'shadowFloor', trim: '#3a2a5a', rim: '#8a6aff', fx: { mode: 'rise', color: '#a08aff', size: 0.8, count: 30, speed: 0.18, height: 5 } },
  crystal: { floor: 'crystalFloor', trim: '#c64dff', rim: '#5ff0ff', fx: { mode: 'fall', color: '#bff8ff', size: 0.4, count: 50, speed: 0.22, height: 7 } },
  celestial: { floor: 'celestialFloor', trim: 'gold', rim: '#ffe07a', fx: { mode: 'orbit', color: '#fff3a0', size: 0.7, count: 44, speed: 0.3, height: 6 } },
}

/** A ring of runes, drawn once and tinted per pad: the glowing circle under each dummy. */
let runeTex = null
function runeTexture() {
  if (runeTex) return runeTex
  const S = 512
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')
  const mid = S / 2
  ctx.strokeStyle = '#ffffff'
  ctx.fillStyle = '#ffffff'
  ctx.lineCap = 'round'
  for (const [r, w] of [
    [236, 10],
    [206, 4],
    [150, 6],
    [120, 3],
  ]) {
    ctx.lineWidth = w
    ctx.beginPath()
    ctx.arc(mid, mid, r, 0, Math.PI * 2)
    ctx.stroke()
  }
  // Runes: little angular glyphs between the two outer rings.
  const rand = seeded(9)
  ctx.lineWidth = 5
  for (let i = 0; i < 24; i += 1) {
    const a = (i / 24) * Math.PI * 2
    ctx.save()
    ctx.translate(mid + Math.cos(a) * 221, mid + Math.sin(a) * 221)
    ctx.rotate(a + Math.PI / 2)
    ctx.beginPath()
    const strokes = 2 + Math.floor(rand() * 3)
    for (let k = 0; k < strokes; k += 1) {
      ctx.moveTo((rand() - 0.5) * 16, (rand() - 0.5) * 12)
      ctx.lineTo((rand() - 0.5) * 16, (rand() - 0.5) * 12)
    }
    ctx.stroke()
    ctx.restore()
  }
  // A six-pointed star in the middle.
  ctx.lineWidth = 5
  for (const off of [0, Math.PI / 3]) {
    ctx.beginPath()
    for (let k = 0; k <= 3; k += 1) {
      const a = off + (k / 3) * Math.PI * 2 - Math.PI / 2
      const x = mid + Math.cos(a) * 146
      const y = mid + Math.sin(a) * 146
      if (k === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  runeTex = new CanvasTexture(c)
  runeTex.colorSpace = SRGBColorSpace
  return runeTex
}

const runeMaterials = new Map()
function runeMaterial(color) {
  if (!runeMaterials.has(color)) {
    runeMaterials.set(
      color,
      new MeshBasicMaterial({ map: runeTexture(), color, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
    )
  }
  return runeMaterials.get(color)
}

/** The rune circles turn slowly; one frame hook turns them all. */
function RuneCircles({ pads }) {
  const refs = useRef([])
  useFrame((_, dt) => {
    for (const m of refs.current) if (m) m.rotation.z += dt * 0.25
  })
  return pads.map((d, i) => {
    const theme = THEMES[d.theme] || THEMES.basic
    return (
      <mesh
        key={d.id}
        ref={(m) => {
          refs.current[i] = m
        }}
        position={[d.pos[0] - 0.85, 0.33, d.pos[2]]}
        rotation={[-Math.PI / 2, 0, i]}
        material={runeMaterial(theme.rim)}
        renderOrder={1}
      >
        <planeGeometry args={[6.4, 6.4]} />
      </mesh>
    )
  })
}

/** Deterministic pseudo-random so the particles don't reshuffle on remount. */
function seeded(seed) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

/** The pad's particle effect: a few dozen glowing points animated on the CPU. */
function PadFx({ position, fx, seed }) {
  const { geometry, seeds } = useMemo(() => {
    const rand = seeded(seed)
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(fx.count * 3), 3))
    const seeds = Array.from({ length: fx.count }, () => [rand(), rand(), rand()])
    return { geometry: g, seeds }
  }, [fx.count, seed])
  useEffect(() => () => geometry.dispose(), [geometry])

  const points = useRef()
  useFrame(({ clock, camera }) => {
    const pts = points.current
    if (!pts) return
    // Nobody's looking from across the lobby: skip the work.
    const far = Math.hypot(camera.position.x - position[0], camera.position.z - position[2]) > 70
    pts.visible = !far
    if (far) return
    const t = clock.elapsedTime
    const arr = geometry.attributes.position.array
    const hw = PAD.w / 2 - 0.6
    const hd = PAD.d / 2 - 0.6
    for (let i = 0; i < fx.count; i += 1) {
      const [a, b, c] = seeds[i]
      const life = (t * fx.speed * (0.7 + c * 0.6) + a) % 1
      let x
      let y
      let z
      if (fx.mode === 'orbit') {
        const ang = a * Math.PI * 2 + t * (0.6 + c * 0.6)
        const r = 1.6 + b * 1.8
        x = Math.cos(ang) * r
        z = Math.sin(ang) * r
        y = 0.6 + ((b + t * 0.15 * (0.5 + c)) % 1) * fx.height
      } else if (fx.mode === 'fall') {
        x = (a - 0.5) * 2 * hw + Math.sin(t * 0.9 + c * 9) * 0.4
        z = (b - 0.5) * 2 * hd + Math.cos(t * 0.7 + a * 9) * 0.4
        y = 0.4 + (1 - life) * fx.height
      } else if (fx.mode === 'burst') {
        // Sparks thrown up from the two lava pools, arcing out.
        const pool = i % 2 ? 2.5 : -2.5
        const spread = (b - 0.5) * 2.4
        x = -2.55 + spread * life
        z = pool + (c - 0.5) * 2.4 * life
        y = 0.4 + Math.sin(life * Math.PI) * fx.height * (0.4 + c * 0.6)
      } else {
        // rise: drifting upward with a lazy sway
        x = (a - 0.5) * 2 * hw + Math.sin(t * 1.3 + c * 12) * 0.35
        z = (b - 0.5) * 2 * hd + Math.cos(t * 1.1 + a * 12) * 0.35
        y = 0.4 + life * fx.height
      }
      arr[i * 3] = x
      arr[i * 3 + 1] = y
      arr[i * 3 + 2] = z
    }
    geometry.attributes.position.needsUpdate = true
  })

  return (
    <points ref={points} position={position} geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        map={glowTexture()}
        color={fx.color}
        size={fx.size}
        sizeAttenuation
        transparent
        opacity={0.9}
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </points>
  )
}

/** A glowing strip around the pad's edge that breathes in and out. */
function PadRim({ position, color, phase }) {
  const material = useMemo(() => new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1, roughness: 0.4 }), [color])
  useEffect(() => () => material.dispose(), [material])
  useFrame(({ clock }) => {
    material.emissiveIntensity = 0.7 + Math.sin(clock.elapsedTime * 2 + phase) * 0.45
  })
  const [x, , z] = position
  const hw = PAD.w / 2 + 0.05
  const hd = PAD.d / 2 + 0.05
  return (
    <>
      <Block size={[PAD.w + 0.3, 0.12, 0.18]} position={[x, 0.36, z - hd]} m={material} cast={false} />
      <Block size={[PAD.w + 0.3, 0.12, 0.18]} position={[x, 0.36, z + hd]} m={material} cast={false} />
      <Block size={[0.18, 0.12, PAD.d]} position={[x - hw, 0.36, z]} m={material} cast={false} />
      <Block size={[0.18, 0.12, PAD.d]} position={[x + hw, 0.36, z]} m={material} cast={false} />
    </>
  )
}

/**
 * A raised frame in the pad's trim, and two lantern posts on its front corners
 * glowing in the pad's colour. All static, so the world batches it.
 */
function PadFrame({ x, z, theme }) {
  const t = THEMES[theme] || THEMES.basic
  const cx = x - 0.85
  // Just outside the breathing rim (PadRim), so the two never overlap.
  const hw = PAD.w / 2 + 0.45
  // (and clear of the next pad's frame: the first row's pads are 10.15 apart).
  const hd = PAD.d / 2 + 0.35
  const trim = t.trim
  const glow = mat(t.rim, { emissive: t.rim, emissiveIntensity: 1.2 })
  return (
    <>
      <Block size={[PAD.w + 1.3, 0.42, 0.4]} position={[cx, 0, z - hd]} base m={trim} tile={1.5} />
      <Block size={[PAD.w + 1.3, 0.42, 0.4]} position={[cx, 0, z + hd]} base m={trim} tile={1.5} />
      <Block size={[0.4, 0.42, PAD.d + 0.3]} position={[cx - hw, 0, z]} base m={trim} tile={1.5} />
      <Block size={[0.4, 0.42, PAD.d + 0.3]} position={[cx + hw, 0, z]} base m={trim} tile={1.5} />
      {[-1, 1].map((s) => (
        <group key={s} position={[cx + hw, 0, z + s * hd]}>
          <Block size={[0.6, 2.4, 0.6]} base m={trim} tile={1} />
          <Block size={[0.8, 0.2, 0.8]} position={[0, 2.4, 0]} base m="stoneDark" tile={1} />
          <Block size={[0.45, 0.45, 0.45]} position={[0, 2.6, 0]} base m={glow} cast={false} />
        </group>
      ))}
    </>
  )
}

/** The small props that dress each pad, on its back (west) edge. */
function PadDecor({ theme, x, z }) {
  if (theme === 'void') {
    return [-2.8, 2.8].map((o) => (
      <Floaty key={o} position={[x - 3.7, 2.2, z + o]} amp={0.35} speed={1.1}>
        <mesh material={mat('#b04dff', { emissive: '#b04dff', emissiveIntensity: 0.9 })}>
          <octahedronGeometry args={[0.55, 0]} />
        </mesh>
      </Floaty>
    ))
  }
  if (theme === 'shadow') {
    return [-3, 0, 3].map((o) => (
      <mesh key={o} position={[x - 3.8, 1.6, z + o]} material={mat('#1c1830', { flatShading: true })} castShadow>
        <coneGeometry args={[0.5, 3.2, 5]} />
      </mesh>
    ))
  }
  if (theme === 'crystal') {
    return [-2.8, 2.8].map((o) => (
      <group key={o} position={[x - 3.7, 0.3, z + o]}>
        {[
          [0, 0, 2.2, 0],
          [0.4, 0.2, 1.4, 0.4],
          [-0.35, -0.2, 1.2, -0.5],
        ].map(([cx, cz, h, tilt], i) => (
          <mesh key={i} position={[cx, h * 0.45, cz]} rotation={[tilt * 0.4, i, tilt]} scale={[1, h, 1]} material={mat(i ? '#ff7ae0' : '#5ff0ff', { emissive: i ? '#ff7ae0' : '#5ff0ff', emissiveIntensity: 0.7 })}>
            <octahedronGeometry args={[0.4, 0]} />
          </mesh>
        ))}
      </group>
    ))
  }
  if (theme === 'celestial') {
    return [-3, 3].map((o) => (
      <group key={o} position={[x - 3.8, 0.3, z + o]}>
        <Block size={[0.7, 3.2, 0.7]} base m="gold" tile={1} />
        <mesh position={[0, 3.7, 0]} material={mat('#fff3a0', { emissive: '#ffe07a', emissiveIntensity: 1.2 })}>
          <sphereGeometry args={[0.45, 12, 8]} />
        </mesh>
      </group>
    ))
  }
  if (theme === 'fire') {
    return (
      <>
        <Torch position={[x - 3.8, 0.3, z - 3]} />
        <Torch position={[x - 3.8, 0.3, z + 3]} />
        <Glow position={[x - 0.85, 1, z]} color="#ff5a1f" size={6.8} opacity={0.3} />
      </>
    )
  }
  if (theme === 'grave') {
    return [-2.5, 0, 2.5].map((o) => (
      <group key={o} position={[x - 3.8, 0.3, z + o]}>
        <Block size={[0.4, 1.6, 1.2]} base m="stone" tile={1} />
        <Block size={[0.45, 0.25, 0.3]} position={[0, 1.1, 0]} m="#3b3f48" />
      </group>
    ))
  }
  if (theme === 'ice') {
    return [-3, 0, 3].map((o) => (
      <mesh key={o} position={[x - 3.9, 1.4, z + o]} material={mat('#bfeaff', { emissive: '#7fe3ff', emissiveIntensity: 0.4, roughness: 0.1 })}>
        <coneGeometry args={[0.6, 2.8, 5]} />
      </mesh>
    ))
  }
  if (theme === 'lava') {
    return (
      <>
        <Block size={[2, 0.05, 2]} position={[x - 3.4, 0.32, z - 2.5]} m={mat('#ff5a1f', { emissive: '#ff3b00', emissiveIntensity: 1 })} cast={false} />
        <Block size={[2, 0.05, 2]} position={[x - 3.4, 0.32, z + 2.5]} m={mat('#ff5a1f', { emissive: '#ff3b00', emissiveIntensity: 1 })} cast={false} />
        <Glow position={[x - 0.85, 1, z]} color="#ff3b1f" size={7.6} opacity={0.35} />
      </>
    )
  }
  if (theme === 'grass') {
    return [-3, 3].map((o) => (
      <group key={o} position={[x - 3.8, 0.3, z + o]}>
        <Block size={[0.9, 0.9, 0.9]} base m="grassLime" tile={1} />
        <Block size={[0.6, 0.5, 0.6]} position={[0, 0.9, 0]} base m="grassDark" tile={1} />
      </group>
    ))
  }
  // basic: a pair of gold posts
  return [-3.4, 3.4].map((o) => (
    <group key={o} position={[x - 3.8, 0.3, z + o]}>
      <Block size={[0.5, 1.8, 0.5]} base m="gold" tile={1} />
      <Glow position={[0, 2.1, 0]} color="#ffe07a" size={1.6} opacity={0.55} />
    </group>
  ))
}

export function TrainArea() {
  // Baked onto the plaque itself (see the sign below) rather than a floating
  // billboard, so there's no separate sprite to drift out of step with the
  // board as you walk around it.
  const sign = useMemo(() => textTexture('Training', { colors: ['#8fe0ff', '#2f7dff'], stroke: '#0d1a4a', size: 110 }), [])
  useEffect(() => () => sign.texture.dispose(), [sign])

  const pads = DUMMIES.filter((d) => d.theme)
  // The first row runs unbroken along the wall; the second sits either side of
  // the road, so each of its pads gets its own base instead of one walkway.
  const firstX = pads[0].pos[0]
  const row = pads.filter((d) => d.pos[0] === firstX)
  const zs = row.map((d) => d.pos[2])
  const zMin = Math.min(...zs) - PAD.d / 2 - 1
  const zMax = Math.max(...zs) + PAD.d / 2 + 1
  const px = firstX - 0.85

  return (
    <>
      {/* One stone walkway under the whole first row, so it reads as a single area. */}
      <Block size={[PAD.w + 2, 0.1, zMax - zMin]} position={[px, 0.05, (zMin + zMax) / 2]} m="stoneDark" tile={1.4} cast={false} />
      <Block size={[0.5, 0.16, zMax - zMin]} position={[px + PAD.w / 2 + 0.75, 0.08, (zMin + zMax) / 2]} m="gold" tile={1.25} cast={false} />
      {pads
        .filter((d) => d.pos[0] !== firstX)
        .map((d) => (
          <Block key={`base${d.id}`} size={[PAD.w + 2, 0.1, PAD.d + 1.4]} position={[d.pos[0] - 0.85, 0.05, d.pos[2]]} m="stoneDark" tile={1.4} cast={false} />
        ))}
      <RuneCircles pads={pads} />
      {pads.map((d, i) => {
        const theme = THEMES[d.theme] || THEMES.basic
        const [x, , z] = d.pos
        return (
          <group key={d.id}>
            <Solid>
              <Block size={[PAD.w, 0.3, PAD.d]} position={[x - 0.85, 0, z]} base m={theme.floor} tile={2} />
            </Solid>
            <PadFrame x={x} z={z} theme={d.theme} />
            <PadRim position={[x - 0.85, 0, z]} color={theme.rim} phase={i * 0.9} />
            <PadDecor theme={d.theme} x={x} z={z} />
            <PadFx position={[x - 0.85, 0, z]} fx={theme.fx} seed={101 + i * 37} />
            <TrainingDummy dummy={d} />
            <Label text={`x${d.mult} Power`} position={[x, 6.4, z]} height={1.25} colors={['#ffffff', theme.rim]} stroke="#1a1a2e" />
            {d.rebirths > 0 && (
              <Label text={`Rebirth ${d.rebirths}+`} position={[x, 7.6, z]} height={0.95} colors={['#ffffff', '#ff9a9a']} stroke="#5a0a0a" />
            )}
          </group>
        )
      })}
      {/* "Training" sign over the middle of the row. The text is painted onto its
          own small plane on each face of the plaque — not a floating billboard —
          so it's pinned flat to the board and reads correctly from both sides. */}
      <group position={[-28.3, 0, 0]}>
        <Block size={[0.4, 9, 0.4]} position={[0, 0, -3.8]} base m="woodDark" />
        <Block size={[0.4, 9, 0.4]} position={[0, 0, 3.8]} base m="woodDark" />
        <Block size={[0.5, 2.6, 8.4]} position={[0, 9, 0]} m="#2f7dff" />
        <Block size={[0.6, 2.1, 7.8]} position={[0.02, 9, 0]} m="#ffffff" />
        {[1, -1].map((side) => (
          <mesh key={side} position={[0.02 + side * 0.32, 9, 0]} rotation={[0, (side * Math.PI) / 2, 0]}>
            <planeGeometry args={[1.5 * sign.aspect, 1.5]} />
            <meshBasicMaterial map={sign.texture} transparent toneMapped={false} />
          </mesh>
        ))}
      </group>
    </>
  )
}

export default TrainArea
