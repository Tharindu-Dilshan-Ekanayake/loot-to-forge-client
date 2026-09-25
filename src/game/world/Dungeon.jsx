import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { memo, useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, CanvasTexture, Color, DoubleSide, ShaderMaterial, SRGBColorSpace } from 'three'

import { useGame } from '../../net/store'
import { DUNGEON, formatNum, gateZ, stageById, stageLock, STAGES } from '../../shared/gameData'
import { local } from '../bus'
import { pauseMatrices, stageShown } from '../stageWindow'
import { mat } from '../textures'
import { DUNGEON_THEMES } from './dungeonThemes'
import { Block, Cloud, Floaty, Glow, Label, Torch, Tree, Wall } from './props'
import StaticBatch from './StaticBatch'

/**
 * The dungeon: one long walled corridor running north out of the castle, split
 * into stages by gates. Each gate is an energy barrier that stays red and shut until
 * every enemy in the stage before it is down (then it turns blue); the stage's ore nodes unlock at the same moment.
 *
 * Physics for the whole corridor is a handful of big static cuboids mounted once,
 * so walking between stages never waits on colliders. Every stage's visuals are
 * mounted once too, then only shown or hidden (see stageWindow.js): nothing is
 * built while you walk, so crossing a gate never stalls a frame.
 */

const HW = DUNGEON.halfWidth
const L = DUNGEON.stageLength
const N = STAGES.length
const WALL_H = 10
const GATE_W = 10
const TOTAL = L * N
const Z_END = gateZ(N)
/** The lobby's walkable floor: a bit past the castle walls on every side. */
const HUB_HALF_W = 57
const HUB_SOUTH = 57

function seeded(seed) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

const glowMat = (c, i = 0.9) => mat(c, { emissive: c, emissiveIntensity: i })

/** The local player's Damage and rebirths, which decide which stages are open. */
const strength = (g) => ({
  damage: g.profile?.damage ?? 0,
  rebirths: g.profile?.rebirths ?? 0,
})

/**
 * Is the gate at the north end of `stageId` open for the local player? The stage
 * must be cleared, and the player strong enough for the next one.
 */
function gateOpen(stageId, g) {
  if (stageLock(stageId + 1, strength(g))) return false
  return (g.stageRespawn[String(stageId)] || 0) > 0
}

/* ---------------------------------------------------------------------------
 * Physics
 * ------------------------------------------------------------------------- */

/** Half the walkable gap in a gate: the door width minus the pillars' inner edge. */
const OPEN_HALF = GATE_W / 2 - 0.6
/** Half-length of the wall collider either side of a gate's opening. */
const GATE_SIDE = (HW - OPEN_HALF) / 2
/**
 * The visible gate wall runs from the pillar's outer edge to just short of the
 * side wall's cap, so no two faces share a plane (that flickers: z-fighting).
 */
const GATE_WALL_X0 = GATE_W / 2 + 1.8
const GATE_WALL_X1 = HW - 0.3

/**
 * Ground, side walls and gate walls: static, mounted once for all stages.
 *
 * The ground is one cuboid under the lobby and the whole corridor. Two floor
 * boxes meeting at the gate would leave an internal edge that a capsule can
 * catch on, a stumble right in the doorway.
 */
function DungeonColliders() {
  const midZ = DUNGEON.z0 - TOTAL / 2
  const groundS = HUB_SOUTH
  const groundN = Z_END - 4
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[HUB_HALF_W, 0.5, (groundS - groundN) / 2]} position={[0, -0.5, (groundS + groundN) / 2]} />
      <CuboidCollider args={[1.5, 9, TOTAL / 2 + 2]} position={[-HW - 1.5, 9, midZ]} />
      <CuboidCollider args={[1.5, 9, TOTAL / 2 + 2]} position={[HW + 1.5, 9, midZ]} />
      <CuboidCollider args={[HW + 3, 9, 1.5]} position={[0, 9, Z_END - 1.5]} />
      {STAGES.slice(0, -1).map((s) =>
        [-1, 1].map((side) => <CuboidCollider key={`${s.id}${side}`} args={[GATE_SIDE, 9, 1.5]} position={[side * (OPEN_HALF + GATE_SIDE), 9, gateZ(s.id)]} />),
      )}
    </RigidBody>
  )
}

/**
 * The door in one gate. Its collider only blocks from the south: once through, you
 * can always walk back, even if the stage behind you respawns and re-locks.
 */
function GateDoor({ stageId }) {
  const col = useRef()
  const z = gateZ(stageId)
  useFrame(() => {
    const c = col.current
    if (!c) return
    const g = useGame.getState()
    const locked = !gateOpen(stageId, g)
    const enable = locked && local.pos.z > z + 1.8
    if (c.isEnabled() !== enable) c.setEnabled(enable)
  })
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider ref={col} args={[GATE_W / 2, 9, 0.6]} position={[0, 9, z]} />
    </RigidBody>
  )
}

/* ---------------------------------------------------------------------------
 * Gates
 * ------------------------------------------------------------------------- */

const BARRIER_LOCKED = new Color('#ff3b3b')
const BARRIER_OPEN = new Color('#3ba8ff')

/** The see-through energy wall filling a gate: scanlines, a grid and a bright rim. */
function barrierMaterial() {
  return new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: BARRIER_LOCKED.clone() },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
      void main(){
        float edge = max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)) * 2.0;
        float scan = sin(vUv.y * 60.0 - uTime * 3.0) * 0.5 + 0.5;
        vec2 cell = fract(vec2(vUv.x * 8.0, vUv.y * 8.0 - uTime * 0.25));
        float grid = step(0.94, max(cell.x, cell.y));
        float a = 0.16 + 0.35 * smoothstep(0.75, 1.0, edge) + 0.07 * scan + 0.14 * grid;
        gl_FragColor = vec4(uColor * (0.9 + 0.5 * scan + 0.6 * grid), a);
      }`,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  })
}

const BAR_TEX_W = 1024
const BAR_TEX_H = 512

/** A blank canvas texture for one face of a barrier's lettering. */
function barrierCanvas() {
  const c = document.createElement('canvas')
  c.width = BAR_TEX_W
  c.height = BAR_TEX_H
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 4
  return { ctx: c.getContext('2d'), tex }
}

/**
 * A gate: stone pillars and arch round a see-through energy barrier. Red while
 * it's locked (enemies left, or you're not strong enough yet), blue once you can
 * walk through. The next stage's number, name and what it asks for are written
 * on the barrier itself.
 */
function Gate({ stageId }) {
  const stage = stageById(stageId)
  const next = stageById(stageId + 1)
  const theme = DUNGEON_THEMES[stage.theme]
  const respawn = useGame((s) => s.stageRespawn)
  const lock = useGame((s) => (next ? stageLock(next.id, strength(s))?.text : null) ?? null)
  const cleared = (respawn[String(stageId)] || 0) > 0
  const open = cleared && !lock
  const z = gateZ(stageId)
  const barrier = useMemo(() => barrierMaterial(), [])
  const text = useMemo(() => barrierCanvas(), [])
  // The far side, seen when you turn round inside the next stage: the stage you
  // just came through. It never changes, so it's drawn once.
  const back = useMemo(() => {
    const b = barrierCanvas()
    b.ctx.textAlign = 'center'
    b.ctx.textBaseline = 'middle'
    b.ctx.font = signFont(150)
    drawOutlined(b.ctx, `STAGE ${stage.id}`, BAR_TEX_W / 2, 150, '#ffffff', '#15151f', 20)
    b.ctx.font = signFont(72)
    drawOutlined(b.ctx, stage.name, BAR_TEX_W / 2, 285, '#ffe07a', '#15151f', 13)
    b.ctx.font = signFont(54, true)
    drawOutlined(b.ctx, '\u2190 Back this way', BAR_TEX_W / 2, 400, '#9fd8ff', '#10204a', 11)
    b.tex.needsUpdate = true
    return b
  }, [stage])
  useEffect(
    () => () => {
      barrier.dispose()
      text.tex.dispose()
      back.tex.dispose()
    },
    [barrier, text, back],
  )

  // Redraw the writing on the barrier whenever what it says changes.
  useEffect(() => {
    const { ctx, tex } = text
    ctx.clearRect(0, 0, BAR_TEX_W, BAR_TEX_H)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = signFont(150)
    drawOutlined(ctx, `STAGE ${next.id}`, BAR_TEX_W / 2, 110, '#ffffff', '#15151f', 20)
    ctx.font = signFont(64)
    drawOutlined(ctx, next.name, BAR_TEX_W / 2, 225, '#ffe07a', '#15151f', 12)
    ctx.font = signFont(62, true)
    drawOutlined(ctx, `Recommend: \u2694 ${formatNum(next.recommend)}`, BAR_TEX_W / 2, 315, '#9fd8ff', '#10204a', 12)
    const status = open ? 'UNLOCKED \u2192' : lock || 'Defeat all enemies!'
    ctx.font = signFont(72)
    drawOutlined(ctx, status, BAR_TEX_W / 2, 425, open ? '#b6ff7a' : '#ffb0b0', '#15151f', 14)
    tex.needsUpdate = true
  }, [text, next, open, lock])

  useFrame(({ clock }, dt) => {
    barrier.uniforms.uTime.value = clock.elapsedTime
    barrier.uniforms.uColor.value.lerp(open ? BARRIER_OPEN : BARRIER_LOCKED, Math.min(1, dt * 4))
  })

  return (
    <group position={[0, 0, z]}>
      {/* Wall either side of the opening, in the outgoing stage's style. */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * ((GATE_WALL_X0 + GATE_WALL_X1) / 2), 0, 0]}>
          <Wall position={[0, 0, 0]} length={GATE_WALL_X1 - GATE_WALL_X0} height={WALL_H} m={theme.wall} cap={theme.cap} />
        </group>
      ))}
      {/* Pillars and arch */}
      {[-1, 1].map((side) => (
        <group key={`p${side}`}>
          <Block size={[2.4, WALL_H + 3, 3.4]} position={[side * (GATE_W / 2 + 0.6), 0, 0]} base m="stoneDark" tile={2} />
          <Block size={[2.8, 0.8, 3.8]} position={[side * (GATE_W / 2 + 0.6), WALL_H + 3, 0]} base m={glowMat(theme.accent, 0.6)} cast={false} />
        </group>
      ))}
      <Block size={[GATE_W + 5.2, 2.2, 3.6]} position={[0, WALL_H + 0.8, 0]} base m="stoneDark" tile={2} />
      <Block size={[GATE_W + 1, 0.4, 3.7]} position={[0, WALL_H + 0.6, 0]} base m={glowMat(theme.accent, 0.8)} cast={false} />

      {/* The barrier and the stage info written across it. */}
      <mesh position={[0, WALL_H / 2 + 0.3, 0]} material={barrier} renderOrder={1}>
        <planeGeometry args={[GATE_W, WALL_H + 0.6]} />
      </mesh>
      <mesh position={[0, WALL_H / 2 + 0.6, 0.08]} renderOrder={2}>
        <planeGeometry args={[GATE_W - 0.4, (GATE_W - 0.4) / 2]} />
        <meshBasicMaterial map={text.tex} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, WALL_H / 2 + 0.6, -0.08]} rotation={[0, Math.PI, 0]} renderOrder={2}>
        <planeGeometry args={[GATE_W - 0.4, (GATE_W - 0.4) / 2]} />
        <meshBasicMaterial map={back.tex} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <Glow position={[0, 5, 1.2]} color={open ? '#3ba8ff' : '#ff3b3b'} size={10} opacity={0.3} />
    </group>
  )
}

/** The far end of the last stage: a portal home once the throne is cleared. */
function FinalPortal() {
  const ring = useRef()
  useFrame((_, dt) => {
    if (ring.current) ring.current.rotation.z += dt * 0.8
  })
  return (
    <group position={[0, 0, Z_END + 1]}>
      <Block size={[HW * 2 + 6, WALL_H + 4, 3]} position={[0, 0, -2.5]} base m="celestialWall" tile={4} />
      <group ref={ring} position={[0, 6, 0]}>
        <mesh material={glowMat('#ffd23b', 1.2)}>
          <torusGeometry args={[4.5, 0.5, 8, 40]} />
        </mesh>
      </group>
      <mesh position={[0, 6, -0.2]}>
        <circleGeometry args={[4.2, 40]} />
        <meshBasicMaterial color="#ffe89a" transparent opacity={0.55} blending={AdditiveBlending} depthWrite={false} />
      </mesh>
      <Glow position={[0, 6, 1]} color="#ffd23b" size={16} opacity={0.5} />
      <Label text="Back to Lobby" position={[0, 12.5, 1]} height={1.6} colors={['#ffffff', '#ffe07a']} stroke="#3a1a00" />
    </group>
  )
}

/* ---------------------------------------------------------------------------
 * Canvas lettering for the gate barriers, plus stage props
 * ------------------------------------------------------------------------- */

const signFont = (px, italic = false) => `${italic ? 'italic ' : ''}800 ${px}px Fredoka, 'Arial Rounded MT Bold', sans-serif`

function drawOutlined(ctx, text, x, y, fill, stroke, lw) {
  ctx.lineJoin = 'round'
  ctx.lineWidth = lw
  ctx.strokeStyle = stroke
  ctx.strokeText(text, x, y)
  ctx.fillStyle = fill
  ctx.fillText(text, x, y)
}

/** A wooden barrel with two iron hoops, for the Ironwood Yard. */
function Barrel({ position, scale = 1 }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.8, 0]} material={mat('wood')} castShadow>
        <cylinderGeometry args={[0.62, 0.62, 1.6, 12]} />
      </mesh>
      {[0.35, 1.25].map((y) => (
        <mesh key={y} position={[0, y, 0]} material={mat('#4b5363', { metalness: 0.5, roughness: 0.4 })}>
          <cylinderGeometry args={[0.66, 0.66, 0.14, 12]} />
        </mesh>
      ))}
    </group>
  )
}

/** A riveted iron lamp post with a warm lantern. */
function LampPost({ position }) {
  return (
    <group position={position}>
      <Block size={[0.4, 4.6, 0.4]} base m="metalDark" tile={1} />
      <Block size={[0.9, 0.9, 0.9]} position={[0, 4.6, 0]} base m={mat('#ffe7a0', { emissive: '#ffb000', emissiveIntensity: 1.1 })} cast={false} />
      <Block size={[1.1, 0.2, 1.1]} position={[0, 5.5, 0]} base m="metalDark" tile={1} />
      <Glow position={[0, 5, 0]} color="#ffd06a" size={3} opacity={0.5} />
    </group>
  )
}

/* ---------------------------------------------------------------------------
 * Decorations
 * ------------------------------------------------------------------------- */

function Pine({ position, scale = 1, snow = false }) {
  const leaf = snow ? '#e8f4ff' : '#2f7a4a'
  return (
    <group position={position} scale={scale}>
      <Block size={[0.8, 2, 0.8]} base m="woodDark" tile={2} cast={false} />
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0, 2.4 + i * 1.6, 0]} material={mat(i === 2 && !snow ? '#3f9a5a' : leaf)} castShadow>
          <coneGeometry args={[2.4 - i * 0.6, 2.6, 6]} />
        </mesh>
      ))}
    </group>
  )
}

function Crystal({ position, color, scale = 1 }) {
  return (
    <group position={position} scale={scale}>
      {[
        [0, 0, 2.6, 0],
        [0.6, 0.2, 1.7, 0.4],
        [-0.5, -0.3, 1.4, -0.5],
      ].map(([x, z, hgt, tilt], i) => (
        <mesh key={i} position={[x, hgt * 0.45, z]} rotation={[tilt * 0.4, i, tilt]} scale={[1, hgt, 1]} material={glowMat(color, 0.7)}>
          <octahedronGeometry args={[0.45, 0]} />
        </mesh>
      ))}
      <Glow position={[0, 1.4, 0]} color={color} size={3.4} opacity={0.4} />
    </group>
  )
}

function Tent({ position, rotation = 0, color = '#c9a256' }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <Block size={[3.6, 0.3, 4.2]} position={[-0.95, 1.2, 0]} rotation={[0, 0, 0.95]} m={color} tile={2} />
      <Block size={[3.6, 0.3, 4.2]} position={[0.95, 1.2, 0]} rotation={[0, 0, -0.95]} m={color} tile={2} />
      <Block size={[0.3, 3, 0.3]} position={[0, 0, 2]} base m="woodDark" cast={false} />
      <Block size={[1, 1.6, 0.1]} position={[0, 0, 2.05]} base m="#2a1a10" cast={false} />
    </group>
  )
}

function Campfire({ position }) {
  return (
    <group position={position}>
      <Block size={[1.8, 0.35, 0.35]} position={[0, 0.2, 0]} rotation={[0, 0.5, 0]} m="woodDark" cast={false} />
      <Block size={[1.8, 0.35, 0.35]} position={[0, 0.2, 0]} rotation={[0, -0.5, 0]} m="woodDark" cast={false} />
      <Torch position={[0, -2.1, 0]} color="#ff7a1f" />
      <Glow position={[0, 0.8, 0]} color="#ff9a2e" size={5} opacity={0.5} />
    </group>
  )
}

function Grave({ position, rotation = 0 }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <Block size={[1.2, 1.7, 0.4]} base m="stone" tile={1} />
      <Block size={[0.8, 0.2, 0.42]} position={[0, 1.2, 0]} m="#3b3f48" cast={false} />
      <Block size={[1.6, 0.15, 2.4]} position={[0, 0, 1.3]} base m="#3a3040" cast={false} />
    </group>
  )
}

function DeadTree({ position, scale = 1 }) {
  return (
    <group position={position} scale={scale}>
      <Block size={[0.8, 5, 0.8]} base m="#3a2e2a" tile={2} />
      <Block size={[2.2, 0.4, 0.4]} position={[0.9, 3.6, 0]} rotation={[0, 0, 0.6]} m="#3a2e2a" />
      <Block size={[1.8, 0.4, 0.4]} position={[-0.8, 4.2, 0]} rotation={[0, 0, -0.7]} m="#3a2e2a" />
    </group>
  )
}

function Cactus({ position, scale = 1 }) {
  return (
    <group position={position} scale={scale}>
      <Block size={[0.9, 4, 0.9]} base m="#3fae4a" tile={2} />
      <Block size={[0.6, 1.8, 0.6]} position={[0.9, 1.6, 0]} base m="#3fae4a" tile={2} />
      <Block size={[0.9, 0.5, 0.6]} position={[0.6, 1.5, 0]} base m="#3fae4a" tile={2} />
      <Block size={[0.6, 1.4, 0.6]} position={[-0.9, 2.2, 0]} base m="#3fae4a" tile={2} />
      <Block size={[0.9, 0.5, 0.6]} position={[-0.6, 2.1, 0]} base m="#3fae4a" tile={2} />
    </group>
  )
}

function Banner({ position, color }) {
  return (
    <group position={position}>
      <Block size={[0.3, 7, 0.3]} base m="woodDark" />
      <Block size={[1.8, 3.4, 0.12]} position={[0, 3.2, 0.2]} base m={color} cast={false} />
      <Block size={[0.6, 0.6, 0.14]} position={[0, 4.6, 0.22]} base m="gold" cast={false} />
    </group>
  )
}

function LavaPool({ position, size = 3 }) {
  return (
    <group position={position}>
      <Block size={[size, 0.06, size]} position={[0, 0.03, 0]} m={glowMat('#ff5a1f', 1.3)} cast={false} />
      <Glow position={[0, 0.6, 0]} color="#ff5a1f" size={size * 1.6} opacity={0.45} />
    </group>
  )
}

/** One edge prop for a theme. `r` in [0,1) picks the variant. */
function EdgeProp({ deco, x, z, r }) {
  const p = [x, 0, z]
  switch (deco) {
    case 'ironwood':
      if (r < 0.3) return <Block size={[1.5, 1.5, 1.5]} position={p} base m="wood" tile={1.5} />
      if (r < 0.55) return <Barrel position={p} scale={0.9 + r * 0.4} />
      if (r < 0.7) return <LampPost position={p} />
      return <Tree position={p} scale={0.75 + r * 0.3} leaf={r < 0.85 ? '#3fbf4a' : '#58d34a'} />
    case 'jungle':
      if (r < 0.6) return <Tree position={p} scale={0.9 + r * 0.5} leaf={r < 0.3 ? '#1f8a3a' : '#2fa84a'} />
      return <Block size={[1.8, 1.2, 1.8]} position={p} base m="grassDark" tile={2} />
    case 'reef':
      return <Crystal position={p} color={r < 0.33 ? '#ff7a8a' : r < 0.66 ? '#ffb05a' : '#5ff0ff'} scale={0.8 + r * 0.6} />
    case 'meadow':
      return <Tree position={p} scale={0.75 + r * 0.3} leaf={r < 0.4 ? '#3fbf4a' : '#58d34a'} />
    case 'camp':
      if (r < 0.2) return <Tent position={p} rotation={x > 0 ? -Math.PI / 2 : Math.PI / 2} color={r < 0.1 ? '#c9a256' : '#8a6a3a'} />
      if (r < 0.32) return <Campfire position={p} />
      if (r < 0.6) return <Block size={[1.4, 1.4, 1.4]} position={p} base m="wood" tile={2} />
      return <Block size={[0.5, 2.6, 0.5]} position={p} base m="palisade" tile={2} />
    case 'keep':
      if (r < 0.3) return <Banner position={p} color="#c21a2e" />
      if (r < 0.55) return <Torch position={p} light={false} />
      return <Block size={[1.6, 3 + r * 3, 1.6]} position={p} base m="stone" tile={2} />
    case 'cave':
      if (r < 0.35) return <Crystal position={p} color={r < 0.18 ? '#4dffb8' : '#b35bff'} scale={0.9 + r} />
      if (r < 0.55) return <Crystal position={p} color="#3fa8ff" scale={0.6} />
      return (
        <mesh position={[x, 1.6, z]} material={mat('#4a525e', { flatShading: true })} castShadow>
          <coneGeometry args={[0.8 + r * 0.5, 3.2 + r * 2, 5]} />
        </mesh>
      )
    case 'crypt':
      if (r < 0.4) return <Grave position={p} rotation={(r - 0.2) * 0.8} />
      if (r < 0.6) return <DeadTree position={p} scale={0.8 + r * 0.4} />
      return <Torch position={p} color="#9a7bff" />
    case 'frost':
      if (r < 0.4) return <Pine position={p} scale={0.8 + r * 0.5} snow={r < 0.2} />
      return (
        <mesh
          position={[x, 1.4 + r, z]}
          material={mat('#bfeaff', {
            emissive: '#7fe3ff',
            emissiveIntensity: 0.35,
            roughness: 0.1,
          })}
          castShadow
        >
          <coneGeometry args={[0.5 + r * 0.6, 2.8 + r * 3, 5]} />
        </mesh>
      )
    case 'glacier':
      if (r < 0.35)
        return (
          <Block
            size={[1.8, 4 + r * 6, 1.8]}
            position={p}
            base
            m={mat('#bfeaff', {
              emissive: '#5fd0ff',
              emissiveIntensity: 0.3,
              roughness: 0.1,
            })}
          />
        )
      if (r < 0.6) return <Pine position={p} scale={0.9} snow />
      return <Crystal position={p} color="#8ff8ff" scale={0.8} />
    case 'desert':
      if (r < 0.35) return <Cactus position={p} scale={0.8 + r * 0.6} />
      if (r < 0.55) return <Block size={[1.6, 2 + r * 5, 1.6]} position={p} base m="desertWall" tile={2} />
      return <Block size={[1.2, 0.8, 1.2]} position={p} base m="sand" tile={2} />
    case 'void':
      return (
        <Floaty position={[x, 2 + r * 3, z]} amp={0.4} speed={0.8 + r}>
          <mesh material={glowMat('#b04dff')}>
            <octahedronGeometry args={[0.4 + r * 0.6, 0]} />
          </mesh>
          <Glow position={[0, 0, 0]} color="#c64dff" size={2.5} opacity={0.4} />
        </Floaty>
      )
    case 'inferno':
      if (r < 0.35) return <LavaPool position={p} size={2 + r * 3} />
      if (r < 0.6) return <Torch position={p} color="#ff3b1f" />
      return (
        <mesh position={[x, 1.6, z]} material={mat('#1b0a12', { flatShading: true })} castShadow>
          <coneGeometry args={[0.7, 3.4 + r * 2, 4]} />
        </mesh>
      )
    case 'throne':
      if (r < 0.3) return <LavaPool position={p} size={2.5} />
      if (r < 0.6) return <Banner position={p} color="#8a0a1a" />
      return (
        <group position={p}>
          <Block size={[1.4, 5, 1.4]} base m="gold" tile={2} />
          <Torch position={[0, 3, 0]} color="#ff5a1f" />
        </group>
      )
    default:
      return null
  }
}

/** Big set-dressing past the walls, so the skyline isn't just wall. */
function Backdrop({ deco, side, z, r }) {
  const x = side * (HW + 9 + r * 8)
  const p = [x, 0, z]
  switch (deco) {
    case 'ironwood':
    case 'meadow':
    case 'camp':
    case 'jungle':
      return <Tree position={p} scale={2 + r} leaf={r < 0.5 ? '#3fbf4a' : '#2f9a44'} />
    case 'keep':
      return (
        <group position={p}>
          <mesh position={[0, 11, 0]} material={mat('castle')} castShadow>
            <cylinderGeometry args={[4, 4.3, 22, 16]} />
          </mesh>
          <mesh position={[0, 25, 0]} material={mat('#e0303c')}>
            <coneGeometry args={[5, 6, 16]} />
          </mesh>
        </group>
      )
    case 'cave':
    case 'crypt':
    case 'reef':
      return (
        <Block
          size={[8 + r * 6, 16 + r * 14, 8]}
          position={p}
          base
          m={{ cave: 'caveWall', crypt: 'cryptWall', reef: 'reefWall' }[deco]}
          tile={4}
          cast={false}
        />
      )
    case 'frost':
    case 'glacier':
      return (
        <mesh position={[x, 11 + r * 6, z]} material={mat('#e8f4ff', { flatShading: true })}>
          <coneGeometry args={[10 + r * 6, 22 + r * 12, 6]} />
        </mesh>
      )
    case 'desert':
      return (
        <mesh position={[x, 8 + r * 4, z]} rotation={[0, Math.PI / 4, 0]} material={mat('desertWall')}>
          <coneGeometry args={[12 + r * 5, 16 + r * 8, 4]} />
        </mesh>
      )
    case 'void':
      return (
        <Floaty position={[x, 18 + r * 10, z]} amp={1.2} speed={0.4} spin={0.1}>
          <Block size={[8, 3, 8]} m="voidWall" tile={4} cast={false} />
          <Crystal position={[0, 1.5, 0]} color="#c64dff" scale={1.6} />
        </Floaty>
      )
    case 'inferno':
    case 'throne':
      return (
        <group position={p}>
          <mesh position={[0, 10 + r * 5, 0]} material={mat('#2a0a0a', { flatShading: true })}>
            <coneGeometry args={[9 + r * 4, 20 + r * 10, 6]} />
          </mesh>
          <Glow position={[0, 21 + r * 10, 0]} color="#ff5a1f" size={16} opacity={0.5} />
        </group>
      )
    default:
      return null
  }
}

/* ---------------------------------------------------------------------------
 * A stage's visuals
 * ------------------------------------------------------------------------- */

const StageSegment = memo(function StageSegment({ stageId }) {
  const root = useRef()
  useFrame(() => {
    if (!root.current) return
    const shown = stageShown(stageId)
    root.current.visible = shown
    // A hidden stage (hundreds of objects) also skips the per-frame matrix pass.
    pauseMatrices(root.current, !shown)
  })
  const stage = stageById(stageId)
  const theme = DUNGEON_THEMES[stage.theme]
  const cz = stage.center[1]

  const { edge, back, lamps, clouds } = useMemo(() => {
    const rand = seeded(stageId * 7919 + 17)
    // Keep props off the ore nodes.
    const busy = stage.ores.map(([, x, z]) => [x, z])
    const edge = []
    for (let i = 0; i < 40 && edge.length < 26; i += 1) {
      const side = rand() < 0.5 ? -1 : 1
      const x = side * (HW - 1.5 - rand() * 3.5)
      const z = (rand() - 0.5) * (L - 10)
      if (busy.some(([bx, bz]) => Math.hypot(bx - x, bz - z) < 4)) continue
      edge.push([x, z, rand()])
    }
    const back = []
    for (let i = 0; i < 8; i += 1) back.push([i % 2 ? 1 : -1, (rand() - 0.5) * L, rand()])
    const lamps = []
    for (let z = -L / 2 + 8; z < L / 2 - 4; z += 14) lamps.push(z)
    // One sky for the whole game: the same soft clouds drift over every stage.
    const clouds = Array.from({ length: 3 }, () => [(rand() - 0.5) * 220, 48 + rand() * 18, (rand() - 0.5) * L, 0.8 + rand()])
    return { edge, back, lamps, clouds }
  }, [stageId, stage])

  return (
    <group ref={root} visible={stageShown(stageId)}>
      <StaticBatch>
        <group position={[0, 0, cz]}>
          <Block size={[HW * 2 + 6, 1, L]} position={[0, -0.5, 0]} m={theme.floor} tile={4} cast={false} />
          {/* The road down the middle, like the hub's brick path. */}
          <Block size={[10, 0.06, L]} position={[0, 0.03, 0]} m={theme.path} tile={4} cast={false} />
          <Block size={[1, 0.08, L]} position={[-5.5, 0.04, 0]} m={theme.trim} tile={2} cast={false} />
          <Block size={[1, 0.08, L]} position={[5.5, 0.04, 0]} m={theme.trim} tile={2} cast={false} />
          {/* Side walls */}
          {[-1, 1].map((side) => (
            <group key={side} position={[side * (HW + 1.5), 0, 0]} rotation={[0, Math.PI / 2, 0]}>
              <Wall position={[0, 0, 0]} length={L} height={WALL_H} m={theme.wall} cap={theme.cap} />
            </group>
          ))}
          {edge.map(([x, z, r], i) => (
            <EdgeProp key={i} deco={theme.deco} x={x} z={z} r={r} />
          ))}
          {back.map(([side, z, r], i) => (
            <Backdrop key={`b${i}`} deco={theme.deco} side={side} z={z} r={r} />
          ))}
          {clouds.map(([x, y, z, sc], i) => (
            <Cloud key={`c${i}`} position={[x, y, z]} scale={sc} speed={0.5} />
          ))}
          {lamps.map((z) => (
            <group key={z}>
              <Torch position={[-7, 0, z]} color={theme.accent} />
              <Torch position={[7, 0, z]} color={theme.accent} />
            </group>
          ))}
        </group>
        {stageId < N ? <Gate stageId={stageId} /> : <FinalPortal />}
      </StaticBatch>
    </group>
  )
})

/** The whole dungeon: static physics plus every stage, shown near the player. */
export const Dungeon = memo(function Dungeon() {
  return (
    <>
      <DungeonColliders />
      {STAGES.slice(0, -1).map((s) => (
        <GateDoor key={s.id} stageId={s.id} />
      ))}
      {STAGES.map((s) => (
        <StageSegment key={s.id} stageId={s.id} />
      ))}
    </>
  )
})

export default Dungeon
