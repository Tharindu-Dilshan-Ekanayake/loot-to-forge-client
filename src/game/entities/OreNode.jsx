import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { MeshStandardMaterial } from 'three'

import { getRoom } from '../../net/network'
import { useGame } from '../../net/store'
import { formatNum, ORES, rarityOf } from '../../shared/gameData'
import { fx } from '../bus'
import { addAnchor, h, makeHealthPlate } from '../labels'
import { pauseMatrices, stageShown } from '../stageWindow'
import { mat } from '../textures'
import { Glow, LightBeam } from '../world/props'

/** Crystal cluster layout: [x, z, height, tilt] — reused by every node. */
const CRYSTALS = [
  [0, 0, 1.1, 0],
  [0.35, 0.15, 0.75, 0.45],
  [-0.32, 0.2, 0.7, -0.5],
  [0.1, -0.35, 0.65, 0.35],
  [-0.2, -0.25, 0.55, -0.3],
]

function crystalMaterials(type) {
  const ore = ORES[type]
  const r = rarityOf(ore.rarity)
  const shiny = type !== 'stone'
  return {
    crystal: new MeshStandardMaterial({
      color: ore.color,
      roughness: shiny ? 0.18 : 0.8,
      metalness: shiny ? 0.25 : 0,
      emissive: ore.color,
      emissiveIntensity: ore.event ? 0.9 : shiny ? 0.22 : 0,
      flatShading: true,
    }),
    rock: mat(ore.event ? '#2d2a38' : '#55585f', { flatShading: true }),
    beam: ore.event ? ore.color : r.color,
  }
}

const iron = mat('#4a4f5c', { metalness: 0.7, roughness: 0.4 })

/** Bars and chains around a node that can't be mined yet. */
function Cage() {
  return (
    <group>
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a = (i / 6) * Math.PI * 2
        return (
          <mesh key={i} position={[Math.sin(a) * 1.05, 0.9, Math.cos(a) * 1.05]} material={iron} castShadow>
            <boxGeometry args={[0.12, 1.8, 0.12]} />
          </mesh>
        )
      })}
      {[0.35, 1.55].map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={iron}>
          <torusGeometry args={[1.05, 0.07, 6, 18]} />
        </mesh>
      ))}
      <mesh position={[0, 1.9, 0]} rotation={[Math.PI / 2, 0, 0]} material={iron}>
        <torusGeometry args={[0.6, 0.07, 6, 14]} />
      </mesh>
      <mesh position={[0, 1.1, 1.12]} material={mat('#ffd23b', { metalness: 0.4, roughness: 0.35 })}>
        <boxGeometry args={[0.42, 0.36, 0.14]} />
      </mesh>
    </group>
  )
}

export function OreNode({ id }) {
  const group = useRef()
  const crystals = useRef()
  const st = useRef({ hitAt: -10, alive: true, shown: true })
  const o0 = getRoom()?.state.ores.get(id)
  const type = o0?.type || 'stone'
  const isEvent = Boolean(o0?.event)
  const ore = ORES[type]
  const m = useMemo(() => crystalMaterials(type), [type])
  const size = isEvent ? 2.4 : 1
  // Every node, event ores included, stays caged until every enemy in its stage is down.
  const stageId = o0?.stage ?? 0
  const locked = useGame((s) => !((s.stageRespawn[String(stageId)] || 0) > 0))

  useEffect(() => {
    let el
    let update
    if (isEvent) {
      const plate = makeHealthPlate(`${ore.name}`, `wl-event wl-r-${ore.rarity}`)
      el = plate.el
      update = () => {
        const o = getRoom()?.state.ores.get(id)
        if (o) plate.set(o.hp, o.maxHp, formatNum)
      }
    } else {
      // Name + sell value, like the "Stone · 8" tags over each node.
      el = h('div', 'wl-ore', [
        h('div', `wl-ore-name wl-r-${ore.rarity}`, ore.name),
        h('div', 'wl-ore-value', [h('span', 'coin-dot', ''), h('span', '', String(ore.sell))]),
        h('div', 'wl-ore-lock', 'Locked'),
      ])
      update = () => {
        const cleared = (useGame.getState().stageRespawn[String(stageId)] || 0) > 0
        el.classList.toggle('locked', !cleared)
      }
    }
    // An event ore's health bar only shows once you've beaten the stage's enemies.
    const cleared = () => (useGame.getState().stageRespawn[String(stageId)] || 0) > 0
    const off = addAnchor(`ore-${id}`, {
      el,
      getPos: () => (st.current.alive && st.current.shown && (!isEvent || cleared()) ? group.current?.position : null),
      offsetY: isEvent ? 5.4 : 2.9,
      maxDist: isEvent ? 90 : 40,
      update,
    })
    const unsub = fx.on((t, data) => {
      if (t === 'hit' && data.kind === 'ore' && data.id === id) st.current.hitAt = performance.now()
    })
    return () => {
      off()
      unsub()
    }
  }, [id, isEvent, ore, stageId])

  useFrame((state) => {
    const o = getRoom()?.state.ores.get(id)
    if (!o || !group.current) return
    st.current.shown = stageShown(o.stage)
    group.current.visible = st.current.shown
    // Hidden nodes skip the scene's per-frame matrix pass too.
    pauseMatrices(group.current, !st.current.shown)
    if (!st.current.shown) return
    st.current.alive = o.alive
    if (crystals.current) {
      crystals.current.visible = o.alive
      const ht = (performance.now() - st.current.hitAt) / 200
      const k = ht < 1 ? 1 - ht : 0
      crystals.current.position.x = Math.sin(ht * 50) * k * 0.08 * size
      const pop = 1 + k * 0.08
      crystals.current.scale.setScalar(pop)
      if (isEvent) crystals.current.rotation.y = state.clock.elapsedTime * 0.6
    }
  })

  if (!o0) return null

  return (
    <group ref={group} position={[o0.x, 0, o0.z]} visible={stageShown(stageId)}>
      {/* Rock base */}
      <mesh material={m.rock} position={[0, 0.25 * size, 0]} scale={[1.2 * size, 0.55 * size, 1.1 * size]} castShadow receiveShadow>
        <dodecahedronGeometry args={[0.8, 0]} />
      </mesh>
      <group ref={crystals} scale={1}>
        <group position={[0, 0.45 * size, 0]}>
          {CRYSTALS.map(([x, z, hgt, tilt], i) => (
            <mesh
              key={i}
              material={m.crystal}
              position={[x * size, (hgt * size) / 2, z * size]}
              rotation={[tilt * 0.6, i, tilt]}
              scale={[0.7, hgt * 2.4, 0.7]}
              castShadow
            >
              <octahedronGeometry args={[0.26 * size, 0]} />
            </mesh>
          ))}
        </group>
        {/* Toggled, never remounted: unlocking a stage mustn't build anything. */}
        <group visible={!locked}>
          <LightBeam position={[0, 0.6, 0]} color={m.beam} height={isEvent ? 26 : 7} radius={isEvent ? 1.3 : 0.28} opacity={isEvent ? 0.3 : 0.28} />
        </group>
        {(isEvent || type !== 'stone') && <Glow position={[0, 1 * size, 0]} color={ore.color} size={isEvent ? 12 : 2.2} opacity={isEvent ? 0.7 : 0.35} />}
        <group visible={locked} scale={isEvent ? 2.2 : 1}>
          <Cage />
        </group>
      </group>
    </group>
  )
}

export default OreNode
