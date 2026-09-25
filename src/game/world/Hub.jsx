import { useFrame } from '@react-three/fiber'
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import { memo, useMemo, useRef } from 'react'

import { useGame } from '../../net/store'
import { HUB } from '../../shared/gameData'
import { pauseMatrices } from '../stageWindow'
import { mat } from '../textures'
import { DungeonPortal, LeaderboardStage } from './Boards'
import Forge from './Forge'
import FrostboundTower from './FrostboundTower'
import StaticBatch from './StaticBatch'
import TrainArea from './Training'
import {
  Block,
  BlockyCharacter,
  Cloud,
  Glow,
  Label,
  Solid,
  Stall,
  STALL_COUNTER_H,
  StallSign,
  Torch,
  Tower,
  Tree,
  Wall,
} from './props'

const WALL = 44
/** Half-width of the gap in the north wall that the dungeon gate fills. */
const GATE_GAP = HUB.portal.width / 2 + 2.6
const NORTH_LEN = WALL + 2 - GATE_GAP
/** East wall runs from the Frostbound gate (|z| = 8) out to each corner. */
const EAST_LEN = WALL + 2 - 8

/** Deterministic pseudo-random so decorations don't reshuffle on remount. */
function seeded(seed) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

function Ground() {
  return (
    <>
      {/* Visual only: one ground collider in Dungeon.jsx runs under both the lobby
          and the corridor, so there's no seam to trip on at the gate. */}
      {/* Visual only. Its north edge stops exactly at the dungeon corridor's own
          floor (DUNGEON.z0) so nothing shows through the gate; the other three
          sides run out far enough to sit under the tree line outside the walls. */}
      <Block size={[118, 1, 107.5]} position={[0, -0.5, 8.25]} m="grass" tile={2.5} cast={false} />
      {/* Red brick paths with sand trim; the north one runs to the dungeon gate. */}
      <Block size={[8.5, 0.06, 72]} position={[0, 0.03, -8]} m="path" tile={2.5} cast={false} />
      <Block size={[0.85, 0.08, 72]} position={[-4.65, 0.04, -8]} m="sand" tile={1.25} cast={false} />
      <Block size={[0.85, 0.08, 72]} position={[4.65, 0.04, -8]} m="sand" tile={1.25} cast={false} />
      <Block size={[73, 0.06, 8.5]} position={[7.6, 0.03, 0]} m="path" tile={2.5} cast={false} />
      <Block size={[73, 0.08, 0.85]} position={[7.6, 0.04, -4.65]} m="sand" tile={1.25} cast={false} />
      <Block size={[73, 0.08, 0.85]} position={[7.6, 0.04, 4.65]} m="sand" tile={1.25} cast={false} />
      {/* Plaza */}
      <Block size={[17, 0.1, 17]} position={[0, 0.05, 0]} m="stone" tile={1.4} cast={false} />
      <Block size={[18.6, 0.08, 0.85]} position={[0, 0.04, -8.9]} m="sand" tile={1.25} cast={false} />
      <Block size={[18.6, 0.08, 0.85]} position={[0, 0.04, 8.9]} m="sand" tile={1.25} cast={false} />
    </>
  )
}

function Fountain() {
  const water = useRef()
  const jet = useRef()
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (water.current) water.current.material.opacity = 0.82 + Math.sin(t * 2) * 0.05
    if (jet.current) jet.current.scale.y = 1 + Math.sin(t * 5) * 0.08
  })
  return (
    <group>
      <RigidBody type="fixed" colliders="hull">
        <mesh position={[0, 0.55, 0]} material={mat('stone')} castShadow receiveShadow>
          <cylinderGeometry args={[4.4, 4.6, 1.1, 8]} />
        </mesh>
      </RigidBody>
      <mesh ref={water} position={[0, 1.02, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 8]}>
        <circleGeometry args={[3.9, 8]} />
        <meshStandardMaterial color="#39b8ff" roughness={0.05} metalness={0.2} transparent opacity={0.85} />
      </mesh>
      <mesh position={[0, 1.8, 0]} material={mat('stone')} castShadow>
        <cylinderGeometry args={[0.55, 0.7, 2.4, 8]} />
      </mesh>
      <mesh position={[0, 3.1, 0]} material={mat('#f2c230', { metalness: 0.5, roughness: 0.3 })} castShadow>
        <cylinderGeometry args={[1.4, 0.6, 0.4, 8]} />
      </mesh>
      <mesh ref={jet} position={[0, 3.9, 0]}>
        <cylinderGeometry args={[0.12, 0.3, 1.4, 8]} />
        <meshStandardMaterial color="#9fe6ff" transparent opacity={0.7} emissive="#5fd0ff" emissiveIntensity={0.4} />
      </mesh>
    </group>
  )
}

// [x, z, radius, height, flag]
const TOWERS = [
  [-WALL, -WALL, 6, 22, '#e0303c'],
  [WALL, -WALL, 6, 22, '#e0303c'],
  [-WALL, WALL, 6, 22, '#e0303c'],
  [WALL, WALL, 6, 22, '#e0303c'],
  [-22, -WALL, 4.5, 17, '#ffd23b'],
  [22, -WALL, 4.5, 17, '#ffd23b'],
  [-22, WALL, 4.5, 17, '#ffd23b'],
  [22, WALL, 4.5, 17, '#ffd23b'],
  [-WALL, 0, 4.5, 17, '#2f7dff'],
]

function CastleWalls() {
  return (
    <>
      <Solid>
        {/* North wall, split around the dungeon gate. */}
        <Wall position={[-(GATE_GAP + NORTH_LEN / 2), 0, -WALL]} length={NORTH_LEN} />
        <Wall position={[GATE_GAP + NORTH_LEN / 2, 0, -WALL]} length={NORTH_LEN} />
        <Wall position={[0, 0, WALL]} length={WALL * 2 + 4} />
        <group rotation={[0, Math.PI / 2, 0]} position={[-WALL, 0, 0]}>
          <Wall position={[0, 0, 0]} length={WALL * 2 + 4} />
        </group>
        {/* East wall has a gap for the Frostbound Tower gate. */}
        <group rotation={[0, Math.PI / 2, 0]} position={[WALL, 0, -(8 + EAST_LEN / 2)]}>
          <Wall position={[0, 0, 0]} length={EAST_LEN} />
        </group>
        <group rotation={[0, Math.PI / 2, 0]} position={[WALL, 0, 8 + EAST_LEN / 2]}>
          <Wall position={[0, 0, 0]} length={EAST_LEN} />
        </group>
      </Solid>
      {TOWERS.map(([x, z, r, hgt, flag]) => (
        <group key={`${x},${z}`}>
          <Tower position={[x, 0, z]} radius={r} height={hgt} flag={flag} />
          <RigidBody type="fixed" colliders={false} position={[x, hgt / 2, z]}>
            <CylinderCollider args={[hgt / 2, r]} />
          </RigidBody>
        </group>
      ))}
    </>
  )
}

function Npc({ position, rotation = 0, ...look }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <BlockyCharacter scale={0.44} {...look} />
    </group>
  )
}

/** Width of each shop in the market row (they stand 8.4 apart). */
const STALL_W = 7.4
/** The shops are built at full size, then scaled down to sit neatly in the row. */
const STALL_SCALE = 0.82
/** Where the counter's top surface is, for things set out on it. */
const COUNTER_TOP = STALL_COUNTER_H + 0.3

/** The shopkeeper, stood on a step behind the counter so they're seen from the plaza. */
function Keeper(look) {
  return (
    <>
      <Block size={[2.4, 0.5, 1.4]} position={[0, 0, -0.2]} base m="woodDark" tile={1.2} cast={false} />
      <Npc position={[0, 0.5, 0.1]} {...look} />
    </>
  )
}

/**
 * The market: Sell, Upgrade, Enchant and Skill Index side by side in one row on
 * the north-east side, all facing south onto a stone plaza off the main road.
 */
function Stations() {
  const { sell, upgrade, enchant, skillIndex } = HUB.stations
  const row = [sell, upgrade, enchant, skillIndex]
  const x0 = Math.min(...row.map((st) => st.pos[0])) - STALL_W / 2 - 1.2
  const x1 = Math.max(...row.map((st) => st.pos[0])) + STALL_W / 2 + 1.2
  const z = sell.pos[2]
  return (
    <>
      {/* Plaza under the row, joined to the road's sand trim. */}
      <Block size={[x1 - x0, 0.08, 11]} position={[(x0 + x1) / 2, 0.04, z + 2.5]} m="stone" tile={1.4} cast={false} />
      <Block size={[x1 - x0, 0.1, 0.6]} position={[(x0 + x1) / 2, 0.05, z + 8.2]} m="gold" tile={1.25} cast={false} />
      <Label text="MARKET" position={[(x0 + x1) / 2, 11.8, z - 1]} height={2} colors={['#ffffff', '#ffe07a']} stroke="#4a2a00" />

      {/* Sell */}
      <group position={sell.pos} scale={STALL_SCALE}>
        <Stall width={STALL_W} mat="#ffd23b">
          <Keeper skin="#ffcc6b" shirt="#ffd23b" pants="#2b6be0" hat="sombrero" />
          {/* A pile of gold on the counter and crates stacked at the side. */}
          {[
            [-1.9, 0, 1.3],
            [-1.5, 0, 1.7],
            [-2.3, 0, 1.6],
            [-1.9, 0.18, 1.55],
            [-1.7, 0.36, 1.45],
          ].map(([x, y, z], i) => (
            <mesh key={i} position={[x, COUNTER_TOP + 0.08 + y, z]} material={mat('#ffd23b', { metalness: 0.6, roughness: 0.3, emissive: '#b37a00', emissiveIntensity: 0.3 })} castShadow>
              <cylinderGeometry args={[0.32, 0.32, 0.14, 12]} />
            </mesh>
          ))}
          <Block size={[1.3, 1.3, 1.3]} position={[-STALL_W / 2 - 0.9, 0, 1.6]} base m="wood" tile={1.3} />
          <Block size={[1, 1, 1]} position={[-STALL_W / 2 - 0.9, 1.3, 1.6]} rotation={[0, 0.3, 0]} base m="woodDark" tile={1} />
        </Stall>
        <StallSign text="SELL" icon="💰" width={STALL_W} frame="#ffd23b" colors={['#fff27a', '#ffb000']} stroke="#4a1a00" />
      </group>

      {/* Upgrade */}
      <group position={upgrade.pos} scale={STALL_SCALE}>
        <Stall width={STALL_W} stripes={['#2f5ad8', '#ffffff']} mat="#2fd32f">
          <Keeper skin="#f2d0b0" shirt="#3a3a4a" pants="#1b1b22" hat="tophat" />
        </Stall>
        <StallSign text="UPGRADE" icon="⬆️" width={STALL_W} frame="#2fd32f" colors={['#c6ff7a', '#2fd32f']} stroke="#0a3a0a" />
      </group>

      {/* Enchant */}
      <group position={enchant.pos} scale={STALL_SCALE}>
        <Stall width={STALL_W} stripes={['#9b4dff', '#5b1aa8']} mat="#b35bff">
          <Keeper skin="#f2d0b0" shirt="#c21a2e" pants="#3a0a14" hat="wizard" face="smile" />
          <Block size={[0.8, 0.5, 0.8]} position={[1.8, COUNTER_TOP, 1.5]} base m="#2a1a3a" />
          <mesh position={[1.8, COUNTER_TOP + 1.05, 1.5]} material={mat('#ff4d2e', { emissive: '#ff2a00', emissiveIntensity: 1.2, roughness: 0.1 })}>
            <sphereGeometry args={[0.55, 16, 12]} />
          </mesh>
          <Glow position={[1.8, COUNTER_TOP + 1.05, 1.5]} color="#ff4d2e" size={3} opacity={0.6} />
        </Stall>
        <StallSign text="ENCHANT" icon="✨" width={STALL_W} frame="#b35bff" colors={['#ffd6ff', '#d04dff']} stroke="#2a0a4a" />
      </group>

      {/* Skill Index */}
      <group position={skillIndex.pos} scale={STALL_SCALE}>
        <Stall width={STALL_W} stripes={['#ffd23b', '#ffffff']} mat="#ff9a1f">
          <Keeper skin="#b8c0cf" shirt="#9aa3b5" pants="#8a93a6" face="smile" />
        </Stall>
        <StallSign text="SKILL INDEX" icon="📜" width={STALL_W} frame="#ff9a1f" colors={['#fff27a', '#ffc629']} stroke="#4a2a00" />
      </group>
    </>
  )
}

function Decorations() {
  const { trees, torches, clouds } = useMemo(() => {
    const rand = seeded(42)
    // A forest belt just outside the castle walls, not scattered through the
    // yard. Skipped on the north side: the dungeon corridor starts a couple of
    // units past that wall, with no room for a tree line before it.
    const trees = [
      ...[-40, -26, -12, 12, 26, 40].map((z) => [-58, z]),
      ...[-40, -26, -12, 12, 26, 40].map((x) => [x, 58]),
      ...[-30, -18, 18, 30].map((z) => [58, z]),
    ]
    const torches = []
    for (const z of [-27.1, -18.6, -11.8, 11.8]) torches.push([5.8, z])
    // West of the road the leaderboard stage stands where the north torch was.
    for (const z of [-18.6, -11.8, 11.8]) torches.push([-5.8, z])
    for (const x of [-22.8, -14.4, 11.8, 21.2, 31.3]) torches.push([x, -5.8], [x, 5.8])
    const clouds = Array.from({ length: 14 }, () => [(rand() - 0.5) * 400, 48 + rand() * 20, (rand() - 0.5) * 300, 0.8 + rand() * 1.2])
    return { trees, torches, clouds }
  }, [])

  return (
    <>
      {trees.map(([x, z]) => (
        <group key={`${x},${z}`}>
          <RigidBody type="fixed" colliders={false} position={[x, 2, z]}>
            <CuboidCollider args={[0.6, 2, 0.6]} />
          </RigidBody>
          <Tree position={[x, 0, z]} scale={1} leaf={Math.abs(x + z) % 3 < 1 ? '#2f9a44' : '#3fbf4a'} />
        </group>
      ))}
      {torches.map(([x, z]) => (
        <Torch key={`${x},${z}`} position={[x, 0, z]} />
      ))}
      {clouds.map(([x, y, z, s], i) => (
        <Cloud key={i} position={[x, y, z]} scale={s} speed={0.6 + (i % 3) * 0.2} />
      ))}
    </>
  )
}

/**
 * The whole lobby world. Static, so memoised against store-driven re-renders.
 * Hidden (and out of the matrix pass) once you're two stages into the dungeon,
 * where walls stand between you and it. It holds no lights, so hiding it
 * doesn't change the light count (which would make three.js recompile every
 * material, a long freeze mid-walk).
 */
export const Hub = memo(function Hub() {
  const root = useRef()
  useFrame(() => {
    const g = root.current
    if (!g) return
    const shown = useGame.getState().stage < 2
    if (g.visible !== shown) g.visible = shown
    pauseMatrices(g, !shown)
  })
  return (
    <group ref={root}>
      <StaticBatch>
        <Ground />
        <Fountain />
        <CastleWalls />
        <FrostboundTower wall={WALL} />
        <Stations />
        <Forge />
        <DungeonPortal />
        <TrainArea />
        <LeaderboardStage />
        <Decorations />
      </StaticBatch>
    </group>
  )
})

export default Hub
