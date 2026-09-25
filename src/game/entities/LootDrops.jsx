import { useFrame } from '@react-three/fiber'
import { memo, useEffect, useMemo, useRef } from 'react'
import { MeshStandardMaterial, Vector3 } from 'three'

import { sfx } from '../../audio/sound'
import { useGame } from '../../net/store'
import { ORES, RARITY_INDEX, rarityOf } from '../../shared/gameData'
import { fx, local } from '../bus'
import { addAnchor, h } from '../labels'
import { PICKUP_RADIUS } from '../loot'
import { Glow, LightBeam } from '../world/props'

const POP_S = 0.55
const LIFT_S = 0.18
const FLY_S = 0.5

const _bag = new Vector3()
const _a = new Vector3()
const _b = new Vector3()

const materials = new Map()
function oreMaterial(type) {
  if (!materials.has(type)) {
    const ore = ORES[type]
    materials.set(
      type,
      new MeshStandardMaterial({
        color: ore.color,
        emissive: ore.color,
        emissiveIntensity: type === 'stone' ? 0.15 : 0.55,
        roughness: 0.2,
        metalness: 0.2,
        flatShading: true,
      }),
    )
  }
  return materials.get(type)
}

/** Where loot flies to: the backpack if the avatar has one, else the upper back. */
function bagTarget(out) {
  if (local.bag) return local.bag.getWorldPosition(out)
  return out.copy(local.pos).setY(local.pos.y + 0.6)
}

/**
 * One ore chunk on the ground. It pops out of whatever dropped it, hovers with a
 * rarity-coloured beam, and when picked up lifts, then arcs into the backpack
 * trailing sparkles.
 */
const LootDrop = memo(function LootDrop({ id }) {
  const group = useRef()
  const spin = useRef()
  const d0 = useGame.getState().drops[id]
  const ore = ORES[d0.ore]
  const rarity = rarityOf(ore.rarity)
  const m = oreMaterial(d0.ore)
  const st = useRef({ inRange: false, from: null, sparkAt: 0, done: false })

  useEffect(() => {
    const key = h('div', 'pp-key', 'E')
    const text = h('div', 'pp-text', [h('div', 'pp-action', 'Pick up'), h('div', `pp-name wl-r-${ore.rarity}`, ore.name)])
    const el = h('div', 'pp', [key, text])
    return addAnchor(`drop-${id}`, {
      el,
      getPos: () => {
        const d = useGame.getState().drops[id]
        return group.current && d && !d.picking ? group.current.position : null
      },
      offsetY: 1.5,
      maxDist: 30,
      update: () => {
        el.classList.toggle('pp-near', st.current.inRange)
      },
    })
  }, [id, ore])

  useFrame(({ clock }) => {
    const d = useGame.getState().drops[id]
    const g = group.current
    if (!d || !g) return
    const s = st.current
    const now = performance.now()
    const age = (now - d.born) / 1000

    if (d.picking) {
      const t = (now - d.picking) / 1000
      if (!s.from) s.from = g.position.clone()
      if (t < LIFT_S) {
        // Lift and swell before the flight.
        const k = t / LIFT_S
        g.position.set(s.from.x, s.from.y + k * 0.9, s.from.z)
        g.scale.setScalar(1 + k * 0.35)
      } else {
        const k = Math.min(1, (t - LIFT_S) / FLY_S)
        const e = k * k * (3 - 2 * k)
        bagTarget(_bag)
        _a.set(s.from.x, s.from.y + 0.9, s.from.z)
        // Quadratic arc through a point above the midpoint.
        _b.copy(_a).lerp(_bag, 0.5)
        _b.y += 2.2
        const u = 1 - e
        g.position.set(
          u * u * _a.x + 2 * u * e * _b.x + e * e * _bag.x,
          u * u * _a.y + 2 * u * e * _b.y + e * e * _bag.y,
          u * u * _a.z + 2 * u * e * _b.z + e * e * _bag.z,
        )
        g.scale.setScalar(1.35 - e * 1.1)
        if (now - s.sparkAt > 28) {
          s.sparkAt = now
          fx.emit('sparkle', { x: g.position.x, y: g.position.y, z: g.position.z, color: ore.color })
        }
        if (k >= 1 && !s.done) {
          s.done = true
          local.bagFlashAt = now
          fx.emit('bagIn', { ore: d.ore, x: _bag.x, y: _bag.y, z: _bag.z, color: ore.color })
          sfx('bagIn', RARITY_INDEX[ore.rarity])
          useGame.getState().removeDrops([id])
        }
      }
      if (spin.current) spin.current.rotation.y += 0.35
      return
    }

    // Pop out of the enemy / rock / chest in a little arc, then hover.
    if (age < POP_S) {
      const k = age / POP_S
      g.position.set(d.fromX + (d.x - d.fromX) * k, 0.7 + Math.sin(k * Math.PI) * 2.2, d.fromZ + (d.z - d.fromZ) * k)
      g.scale.setScalar(0.4 + k * 0.6)
    } else {
      g.position.set(d.x, 0.75 + Math.sin(clock.elapsedTime * 2.6 + d.x) * 0.15, d.z)
      g.scale.setScalar(1)
    }
    if (spin.current) spin.current.rotation.y = clock.elapsedTime * 1.6 + d.z
    s.inRange = Math.hypot(local.pos.x - d.x, local.pos.z - d.z) <= PICKUP_RADIUS
  })

  return (
    <group ref={group} position={[d0.fromX, 0.7, d0.fromZ]}>
      <group ref={spin}>
        <mesh material={m} scale={[1, 1.5, 1]} castShadow>
          <octahedronGeometry args={[0.32, 0]} />
        </mesh>
        <mesh material={m} position={[0.22, -0.12, 0.05]} rotation={[0, 0, -0.5]} scale={[0.7, 1.1, 0.7]}>
          <octahedronGeometry args={[0.24, 0]} />
        </mesh>
        <mesh material={m} position={[-0.2, -0.14, -0.06]} rotation={[0, 0, 0.5]} scale={[0.65, 1, 0.65]}>
          <octahedronGeometry args={[0.22, 0]} />
        </mesh>
      </group>
      <Glow position={[0, 0, 0]} color={ore.color} size={2.2} opacity={0.65} />
      <LightBeam position={[0, -0.7, 0]} color={rarity.color} height={4} radius={0.35} opacity={0.3} />
    </group>
  )
})

/** Everything this player has waiting on the ground. */
export function LootDrops() {
  const drops = useGame((s) => s.drops)
  const ids = useMemo(() => Object.keys(drops), [drops])
  return ids.map((id) => <LootDrop key={id} id={id} />)
}

export default LootDrops
