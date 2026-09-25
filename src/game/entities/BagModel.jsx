import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { AdditiveBlending } from 'three'

import { bagById } from '../../shared/gameData'
import { local } from '../bus'
import { glowTexture, mat } from '../textures'
import { Glow } from '../world/props'

/**
 * Backpacks, built from boxes in world units (the avatar is ~1.8 tall). The origin
 * is the middle of the torso's back: +Z points into the body, so every bag grows
 * toward -Z, and its decorated face is the one the follow camera sees.
 */

const glow = (c, i = 1) => mat(c, { emissive: c, emissiveIntensity: i })
const metal = (c) => mat(c, { metalness: 0.55, roughness: 0.35 })

function Box({ size, position, m, rotation }) {
  return (
    <mesh position={position} rotation={rotation} material={typeof m === 'string' ? mat(m) : m} castShadow>
      <boxGeometry args={size} />
    </mesh>
  )
}

/** Two shoulder straps running over the top of the shoulders. */
function Straps({ color, w }) {
  return [-1, 1].map((s) => (
    <group key={s}>
      <Box size={[0.07, 0.05, 0.3]} position={[s * w * 0.3, 0.33, 0.1]} m={color} />
      <Box size={[0.07, 0.3, 0.03]} position={[s * w * 0.3, 0.2, -0.02]} m={color} />
    </group>
  ))
}

function Pouch() {
  return (
    <group>
      <Straps color="#5a3a1e" w={0.42} />
      <Box size={[0.42, 0.44, 0.2]} position={[0, 0, -0.1]} m="#9a6a3a" />
      <Box size={[0.44, 0.18, 0.22]} position={[0, 0.16, -0.11]} m="#7a4a22" />
      <Box size={[0.08, 0.08, 0.02]} position={[0, 0.06, -0.225]} m={metal('#e8c14a')} />
      <Box size={[0.3, 0.14, 0.04]} position={[0, -0.12, -0.22]} m="#8a5a2e" />
    </group>
  )
}

function Explorer() {
  return (
    <group>
      <Straps color="#3a4a22" w={0.52} />
      <Box size={[0.52, 0.6, 0.26]} position={[0, -0.02, -0.13]} m="#5f8a3a" />
      <Box size={[0.54, 0.2, 0.28]} position={[0, 0.2, -0.14]} m="#4a6e2a" />
      <Box size={[0.34, 0.2, 0.08]} position={[0, -0.14, -0.3]} m="#4a6e2a" />
      {[-1, 1].map((s) => (
        <Box key={s} size={[0.08, 0.28, 0.18]} position={[s * 0.3, -0.08, -0.13]} m="#4a6e2a" />
      ))}
      <Box size={[0.06, 0.06, 0.02]} position={[0, 0.12, -0.285]} m={metal('#c9a256')} />
      {/* Bedroll on top */}
      <mesh position={[0, 0.38, -0.13]} rotation={[0, 0, Math.PI / 2]} material={mat('#c9a256')} castShadow>
        <cylinderGeometry args={[0.1, 0.1, 0.62, 10]} />
      </mesh>
      {[-0.18, 0.18].map((x) => (
        <mesh key={x} position={[x, 0.38, -0.13]} rotation={[0, 0, Math.PI / 2]} material={mat('#5a3a1e')}>
          <cylinderGeometry args={[0.105, 0.105, 0.04, 10]} />
        </mesh>
      ))}
    </group>
  )
}

function Knight() {
  return (
    <group>
      <Straps color="#2a2a33" w={0.56} />
      <Box size={[0.56, 0.62, 0.26]} position={[0, 0, -0.13]} m={metal('#aab3c5')} />
      <Box size={[0.4, 0.44, 0.03]} position={[0, -0.02, -0.27]} m="#c21a2e" />
      <Box size={[0.08, 0.44, 0.035]} position={[0, -0.02, -0.285]} m={metal('#f2c230')} />
      <Box size={[0.4, 0.07, 0.035]} position={[0, 0.06, -0.285]} m={metal('#f2c230')} />
      {[-1, 1].map((s) => (
        <group key={s}>
          <Box size={[0.07, 0.07, 0.03]} position={[s * 0.22, 0.26, -0.27]} m={metal('#f2c230')} />
          <Box size={[0.07, 0.07, 0.03]} position={[s * 0.22, -0.26, -0.27]} m={metal('#f2c230')} />
        </group>
      ))}
      <Box size={[0.6, 0.08, 0.3]} position={[0, 0.33, -0.13]} m={metal('#7a8295')} />
    </group>
  )
}

function Crystal() {
  return (
    <group>
      <Straps color="#1b2440" w={0.54} />
      <Box size={[0.54, 0.58, 0.26]} position={[0, -0.02, -0.13]} m="#243466" />
      <Box size={[0.36, 0.36, 0.03]} position={[0, -0.04, -0.27]} m={glow('#3ef6ff', 0.8)} />
      <Box size={[0.56, 0.06, 0.28]} position={[0, -0.3, -0.13]} m={metal('#c9d6ff')} />
      {[
        [-0.16, 0.34, 0.28, 0.3],
        [0.02, 0.4, 0.4, -0.1],
        [0.18, 0.33, 0.26, -0.35],
      ].map(([x, y, h, tilt], i) => (
        <mesh key={i} position={[x, y, -0.13]} rotation={[0, i, tilt]} scale={[1, h / 0.2, 1]} material={glow('#7cf6ff', 1.2)}>
          <octahedronGeometry args={[0.1, 0]} />
        </mesh>
      ))}
      <Glow position={[0, 0.3, -0.2]} color="#3ef6ff" size={0.9} opacity={0.5} />
    </group>
  )
}

function Dragon() {
  const wings = [useRef(), useRef()]
  useFrame(({ clock }) => {
    const f = Math.sin(clock.elapsedTime * 3) * 0.25
    if (wings[0].current) wings[0].current.rotation.y = -0.4 - f
    if (wings[1].current) wings[1].current.rotation.y = 0.4 + f
  })
  return (
    <group>
      <Straps color="#3a0a0a" w={0.58} />
      <Box size={[0.56, 0.62, 0.28]} position={[0, 0, -0.14]} m="#b8141e" />
      <Box size={[0.58, 0.08, 0.3]} position={[0, 0.3, -0.14]} m={metal('#ffc629')} />
      <Box size={[0.58, 0.08, 0.3]} position={[0, -0.3, -0.14]} m={metal('#ffc629')} />
      {/* Scales */}
      {[0.14, 0, -0.14].map((y, r) =>
        [-0.15, 0, 0.15].map((x) => (
          <Box key={`${x}${y}`} size={[0.12, 0.1, 0.03]} position={[x + (r % 2) * 0.07, y, -0.29]} rotation={[0, 0, Math.PI / 4]} m="#8a0a12" />
        )),
      )}
      <Box size={[0.1, 0.1, 0.04]} position={[0, 0.2, -0.3]} m={glow('#ffb000', 1.2)} />
      {[-1, 1].map((s, i) => (
        <group key={s}>
          <group ref={wings[i]} position={[s * 0.24, 0.12, -0.2]}>
            <Box size={[0.5, 0.04, 0.3]} position={[s * 0.27, 0.05, 0]} rotation={[0, 0, s * 0.35]} m="#7a0a12" />
            <Box size={[0.4, 0.035, 0.26]} position={[s * 0.32, -0.12, 0]} rotation={[0, 0, s * 0.8]} m="#b8141e" />
          </group>
          <mesh position={[s * 0.18, 0.42, -0.14]} rotation={[0, 0, -s * 0.4]} material={mat('#f4efe0')}>
            <coneGeometry args={[0.05, 0.2, 5]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function VoidBag() {
  const ring = useRef()
  useFrame((_, dt) => {
    if (ring.current) ring.current.rotation.z += dt * 2.2
  })
  return (
    <group>
      <Straps color="#12031f" w={0.56} />
      <Box size={[0.56, 0.62, 0.28]} position={[0, 0, -0.14]} m="#1b0630" />
      <Box size={[0.58, 0.06, 0.3]} position={[0, 0.3, -0.14]} m={glow('#b400ff', 0.8)} />
      <group ref={ring} position={[0, -0.02, -0.3]}>
        <mesh material={glow('#ff4df2', 1.3)}>
          <torusGeometry args={[0.17, 0.025, 6, 24]} />
        </mesh>
        {[0, 1, 2, 3].map((i) => (
          <Box key={i} size={[0.04, 0.04, 0.02]} position={[Math.cos((i * Math.PI) / 2) * 0.1, Math.sin((i * Math.PI) / 2) * 0.1, 0]} m={glow('#ffffff', 1.5)} />
        ))}
      </group>
      <mesh position={[0, -0.02, -0.29]} material={mat('#000000')}>
        <circleGeometry args={[0.15, 20]} />
      </mesh>
      <Glow position={[0, 0, -0.34]} color="#d24dff" size={0.9} opacity={0.55} />
    </group>
  )
}

function Celestial() {
  const halo = useRef()
  useFrame(({ clock }) => {
    if (halo.current) halo.current.position.y = 0.5 + Math.sin(clock.elapsedTime * 2) * 0.03
  })
  return (
    <group>
      <Straps color="#e8c14a" w={0.56} />
      <Box size={[0.56, 0.64, 0.28]} position={[0, 0, -0.14]} m="#f4f6fb" />
      <Box size={[0.58, 0.07, 0.3]} position={[0, 0.3, -0.14]} m={metal('#ffd23b')} />
      <Box size={[0.58, 0.07, 0.3]} position={[0, -0.3, -0.14]} m={metal('#ffd23b')} />
      {/* A four-point star on the flap */}
      <Box size={[0.06, 0.3, 0.03]} position={[0, 0, -0.29]} m={glow('#ffe07a', 1.2)} />
      <Box size={[0.3, 0.06, 0.03]} position={[0, 0, -0.29]} m={glow('#ffe07a', 1.2)} />
      <Box size={[0.12, 0.12, 0.03]} position={[0, 0, -0.29]} rotation={[0, 0, Math.PI / 4]} m={glow('#ffffff', 1.4)} />
      {[-1, 1].map((s) => (
        <Box key={s} size={[0.3, 0.035, 0.18]} position={[s * 0.4, 0.12, -0.16]} rotation={[0, 0, s * 0.45]} m="#ffffff" />
      ))}
      <group ref={halo} position={[0, 0.5, -0.14]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} material={glow('#ffd23b', 1.4)}>
          <torusGeometry args={[0.2, 0.025, 6, 24]} />
        </mesh>
      </group>
      <Glow position={[0, 0.1, -0.3]} color="#fff3a0" size={1.1} opacity={0.5} />
    </group>
  )
}

const MODELS = {
  pouch: Pouch,
  explorer: Explorer,
  knight: Knight,
  crystal: Crystal,
  dragon: Dragon,
  void: VoidBag,
  celestial: Celestial,
}

/**
 * A worn backpack. On the local player it also flashes and pops whenever loot
 * lands in it (`local.bagFlashAt`).
 */
export function BagModel({ bagId, isLocal = false }) {
  const bag = bagById(bagId)
  const Model = MODELS[bag.look] || Pouch
  const pop = useRef()
  const flash = useRef()
  useFrame(() => {
    if (!isLocal || !pop.current) return
    const t = (performance.now() - (local.bagFlashAt || 0)) / 450
    const k = t < 1 ? 1 - t : 0
    pop.current.scale.setScalar(1 + Math.sin(Math.min(1, t) * Math.PI) * 0.22 * (t < 1 ? 1 : 0))
    if (flash.current) {
      flash.current.visible = k > 0
      flash.current.material.opacity = k * 0.9
      flash.current.scale.setScalar(0.8 + (1 - k) * 1.2)
    }
  })
  return (
    <group ref={pop}>
      <Model />
      {isLocal && (
        <sprite ref={flash} position={[0, 0, -0.25]} visible={false}>
          <spriteMaterial map={glowTexture()} color="#fff6c0" transparent opacity={0} depthWrite={false} blending={AdditiveBlending} />
        </sprite>
      )}
    </group>
  )
}

export default BagModel
