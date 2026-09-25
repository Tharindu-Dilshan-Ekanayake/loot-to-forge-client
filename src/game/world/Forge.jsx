import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { MeshStandardMaterial } from 'three'

import { useGame } from '../../net/store'
import { HUB, ORES } from '../../shared/gameData'
import { mat } from '../textures'
import { Block, Glow, Label, Solid } from './props'

const [FX, , FZ] = HUB.stations.forge.pos
/** Marks a part that only moves now and then, so the world never freezes it (StaticBatch). */
const NO_FREEZE = { noFreeze: true }

function Chain({ position, links = 10, rotY = 0 }) {
  const m = mat('#e8edf5', { roughness: 0.4, metalness: 0.2 })
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      {Array.from({ length: links }, (_, i) => (
        <mesh key={i} material={m} position={[0, -i * 0.62, 0]} rotation={[0, i % 2 ? Math.PI / 2 : 0, 0]} castShadow>
          <torusGeometry args={[0.28, 0.09, 6, 12]} />
        </mesh>
      ))}
    </group>
  )
}

/** Diagonal wooden ladder-fence, like the frames either side of the crucible. */
function Fence({ position, rotY = 0 }) {
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      {[-1.6, 1.6].map((x) => (
        <Block key={x} size={[0.5, 4.2, 0.5]} position={[x, 0, 0]} base m="wood" tile={2} />
      ))}
      {[0.9, 2, 3.1].map((y) => (
        <Block key={y} size={[3.6, 0.35, 0.35]} position={[0, y, 0]} m="wood" tile={2} />
      ))}
    </group>
  )
}

function Crucible() {
  const molten = useRef()
  const drops = useRef()
  const lavaMat = useMemo(
    () =>
      new MeshStandardMaterial({
        color: '#ffb000',
        emissive: '#ff7a00',
        emissiveIntensity: 1.2,
        roughness: 0.4,
      }),
    [],
  )
  const floorLava = useMemo(
    () => new MeshStandardMaterial({ color: '#ff5a1f', emissive: '#ff3b00', emissiveIntensity: 0.9, roughness: 0.6 }),
    [],
  )

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const forging = useGame.getState().forging
    const active = forging?.phase === 'melt'
    const boost = active ? 1.35 + Math.sin(t * 18) * 0.2 : 1
    lavaMat.emissiveIntensity = (0.9 + Math.sin(t * 2.2) * 0.12) * boost
    floorLava.emissiveIntensity = 0.8 + Math.sin(t * 3 + 1) * 0.2
    if (molten.current) molten.current.position.y = 3.25 + Math.sin(t * 1.5) * 0.04
    if (drops.current) {
      // Ore chunks tumbling into the pot while the cinematic runs.
      drops.current.visible = active
      if (active) {
        const elapsed = (performance.now() - forging.startedAt) / 1000
        drops.current.children.forEach((c, i) => {
          const k = Math.max(0, elapsed - i * 0.35)
          c.position.y = Math.max(3.2, 9 - k * k * 14)
          c.rotation.set(k * 4, k * 3, 0)
          c.visible = c.position.y > 3.25
        })
      }
    }
  })

  const oreTypes = ['ruby', 'quartz', 'silver', 'stone']

  return (
    <group>
      <Solid>
        <Block size={[4.6, 3.2, 4.6]} base m="stone" tile={2} />
        <Block size={[5.2, 0.6, 5.2]} base m="stoneDark" tile={2} />
      </Solid>
      {/* Rim */}
      <Block size={[4.8, 0.35, 0.4]} position={[0, 3.3, 2.2]} m="stoneDark" tile={2} />
      <Block size={[4.8, 0.35, 0.4]} position={[0, 3.3, -2.2]} m="stoneDark" tile={2} />
      <Block size={[0.4, 0.35, 4.8]} position={[2.2, 3.3, 0]} m="stoneDark" tile={2} />
      <Block size={[0.4, 0.35, 4.8]} position={[-2.2, 3.3, 0]} m="stoneDark" tile={2} />
      <mesh ref={molten} position={[0, 3.25, 0]} rotation={[-Math.PI / 2, 0, 0]} material={lavaMat}>
        <planeGeometry args={[4, 4]} />
      </mesh>
      {/* Spout and the lava channel in front */}
      <Block size={[1, 0.3, 1.2]} position={[0, 2.6, 2.7]} m={lavaMat} cast={false} />
      <Block size={[1.4, 0.12, 3]} position={[0, 0.06, 4.4]} m={floorLava} cast={false} />
      <Block size={[3, 0.3, 0.6]} position={[0, 0.15, 6.2]} m="stoneDark" tile={2} />
      {/* The fire's glow; no point light (every lit pixel in the world pays for one). */}
      <Glow position={[0, 4, 0]} color="#ffb000" size={11} opacity={0.62} />
      {/* Still between forgings, then tumbling: never frozen out of the matrix pass. */}
      <group ref={drops} userData={NO_FREEZE}>
        {oreTypes.map((o) => (
          <mesh key={o} material={mat(ORES[o].color, { emissive: ORES[o].color, emissiveIntensity: 0.4, flatShading: true })}>
            <octahedronGeometry args={[0.35, 0]} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

function Anvil({ position, rotY = 0 }) {
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <Solid>
        <Block size={[1.4, 0.9, 1.4]} base m="woodDark" tile={2} />
      </Solid>
      <Block size={[0.7, 0.5, 0.9]} position={[0, 0.9, 0]} base m="#4a4f5a" />
      <Block size={[2, 0.45, 0.9]} position={[0.2, 1.4, 0]} base m="#5b606c" />
      <mesh position={[1.35, 1.62, 0]} rotation={[0, 0, -Math.PI / 2]} material={mat('#5b606c')} castShadow>
        <coneGeometry args={[0.3, 0.6, 4]} />
      </mesh>
      {/* Hammer leaning on it */}
      <group position={[-0.6, 1.9, 0.6]} rotation={[0.3, 0, 0.5]}>
        <Block size={[0.14, 1.4, 0.14]} m="wood" tile={1} />
        <Block size={[0.7, 0.4, 0.4]} position={[0, 0.8, 0]} m="#8a8f98" />
      </group>
    </group>
  )
}

export function Forge() {
  return (
    <group position={[FX, 0, FZ]}>
      {/* Stone yard */}
      <Block size={[14, 0.12, 14]} position={[0, 0, 0]} base m="stone" tile={2} cast={false} />
      <Crucible />

      {/* Timber frame with hanging chains */}
      <Solid>
        {[
          [-5, -4.5],
          [5, -4.5],
          [-5, 4.5],
          [5, 4.5],
        ].map(([x, z]) => (
          <Block key={`${x}${z}`} size={[0.9, 10, 0.9]} position={[x, 0, z]} base m="wood" tile={2} />
        ))}
      </Solid>
      <Block size={[11, 0.9, 0.9]} position={[0, 10, -4.5]} base m="wood" tile={2} />
      <Block size={[11, 0.9, 0.9]} position={[0, 10, 4.5]} base m="wood" tile={2} />
      <Block size={[0.9, 0.9, 10]} position={[-5, 10.9, 0]} base m="wood" tile={2} />
      <Block size={[0.9, 0.9, 10]} position={[5, 10.9, 0]} base m="wood" tile={2} />
      <Chain position={[-2.2, 9.9, -4.5]} links={9} />
      <Chain position={[2.2, 9.9, -4.5]} links={9} rotY={0.4} />
      <Chain position={[-2.2, 9.9, 4.5]} links={6} rotY={0.2} />
      <Chain position={[2.2, 9.9, 4.5]} links={6} />

      <Fence position={[-4.2, 0, 1]} rotY={Math.PI / 2 + 0.35} />
      <Fence position={[4.2, 0, 1]} rotY={Math.PI / 2 - 0.35} />

      <Anvil position={[3.4, 0, 5.5]} rotY={-0.4} />

      {/* Water tub for quenching */}
      <group position={[-4.2, 0, 5.2]}>
        <Solid>
          <mesh position={[0, 0.9, 0]} material={mat('wood')} castShadow receiveShadow>
            <cylinderGeometry args={[1.4, 1.2, 1.8, 12]} />
          </mesh>
        </Solid>
        {[0.4, 1.4].map((y) => (
          <mesh key={y} position={[0, y, 0]} material={mat('#3b4a5c')}>
            <cylinderGeometry args={[1.42 + (y - 0.4) * 0.1, 1.3 + (y - 0.4) * 0.1, 0.22, 12]} />
          </mesh>
        ))}
        <mesh position={[0, 1.78, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[1.25, 16]} />
          <meshStandardMaterial color="#2fb4ff" roughness={0.1} metalness={0.1} transparent opacity={0.85} />
        </mesh>
      </group>

      <Label text="Forge" position={[0, 13.2, 0]} height={2.6} colors={['#8fe0ff', '#2f7dff']} stroke="#0d1a4a" />
    </group>
  )
}

export default Forge
