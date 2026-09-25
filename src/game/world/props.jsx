import { useFrame } from '@react-three/fiber'
import { RigidBody } from '@react-three/rapier'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, DoubleSide } from 'three'

import { faceTexture, glowTexture, mat, signboardTexture, textTexture, worldBox } from '../textures'

/**
 * A few millimetres of padding, different for every box size. Blocks that
 * overlap or butt together would otherwise share a face plane and flicker
 * where the two surfaces fight for the same depth (z-fighting); with sizes
 * nudged apart, one face is always clearly in front.
 */
function pad(w, h, d) {
  const x = Math.sin(w * 12.9898 + h * 78.233 + d * 37.719) * 43758.5453
  return 0.004 + (x - Math.floor(x)) * 0.012
}

/**
 * A textured box. `m` is a material name from textures.js or a `#hex` colour.
 * Position is the box centre unless `base` is set, in which case y is the bottom.
 */
export function Block({ size = [1, 1, 1], position = [0, 0, 0], rotation, m = 'stone', tile = 4, base = false, cast = true, receive = true, ...rest }) {
  const [w, h, d] = size
  const pos = base ? [position[0], position[1] + h / 2, position[2]] : position
  const e = pad(w, h, d)
  return (
    <mesh
      geometry={worldBox(w + e, h + e, d + e, tile)}
      material={typeof m === 'string' ? mat(m) : m}
      position={pos}
      rotation={rotation}
      castShadow={cast}
      receiveShadow={receive}
      {...rest}
    />
  )
}

/**
 * Brings the whole scene's world matrices up to date during commit.
 *
 * @react-three/rapier sizes auto-colliders from each mesh's matrixWorld, but
 * meshes mounted mid-game (a dungeon arena appearing on teleport) haven't been
 * through a render yet, so their matrices are still identity and every collider
 * lands offset by the parent group's position. Rendered as the sibling *before*
 * a RigidBody, this layout effect runs first and fixes the matrices in time.
 */
function MatrixSync() {
  const ref = useRef()
  useLayoutEffect(() => {
    let root = ref.current
    while (root?.parent) root = root.parent
    root?.updateMatrixWorld(true)
  }, [])
  return <group ref={ref} />
}

/** Everything inside gets fixed cuboid colliders (one per mesh). */
export function Solid({ children, ...rest }) {
  return (
    <>
      <MatrixSync />
      <RigidBody type="fixed" colliders="cuboid" {...rest}>
        {children}
      </RigidBody>
    </>
  )
}

/** Billboard text, like a Roblox BillboardGui. `height` is in world units. */
export function Label({ text, position, height = 1.6, colors, stroke, italic, depthTest = true, renderOrder }) {
  const colorKey = colors?.join('|')
  const { texture, aspect } = useMemo(
    () => textTexture(text, { colors: colorKey?.split('|'), stroke, italic }),
    [text, colorKey, stroke, italic],
  )
  useEffect(() => () => texture.dispose(), [texture])
  return (
    <sprite position={position} scale={[height * aspect, height, 1]} renderOrder={renderOrder}>
      <spriteMaterial map={texture} transparent depthTest={depthTest} depthWrite={false} />
    </sprite>
  )
}

/** Soft additive glow sprite for torches, crystals and portals. */
export function Glow({ position, color = '#ffffff', size = 2, opacity = 0.8 }) {
  return (
    <sprite position={position} scale={[size, size, 1]}>
      <spriteMaterial map={glowTexture()} color={color} transparent opacity={opacity} blending={AdditiveBlending} depthWrite={false} />
    </sprite>
  )
}

/** A vertical beam of light, like the ones marking ore nodes. */
export function LightBeam({ position, color = '#ffffff', height = 8, radius = 0.35, opacity = 0.35 }) {
  return (
    <mesh position={[position[0], position[1] + height / 2, position[2]]}>
      <cylinderGeometry args={[radius * 0.6, radius, height, 12, 1, true]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} blending={AdditiveBlending} depthWrite={false} side={DoubleSide} />
    </mesh>
  )
}

/* ---------------------------------------------------------------------------
 * Nature
 * ------------------------------------------------------------------------- */

export function Cloud({ position, scale = 1, speed = 0.4 }) {
  const ref = useRef()
  const parts = useMemo(
    () =>
      Array.from({ length: 5 }, (_, i) => ({
        p: [(i - 2) * 3.2 + Math.random() * 1.5, Math.random() * 1.4, (Math.random() - 0.5) * 3],
        s: [4 + Math.random() * 3, 1.6 + Math.random() * 1.2, 3 + Math.random() * 2],
      })),
    [],
  )
  useFrame((_, dt) => {
    if (!ref.current) return
    ref.current.position.x += dt * speed
    if (ref.current.position.x > 220) ref.current.position.x = -220
  })
  return (
    <group ref={ref} position={position} scale={scale}>
      {parts.map((part, i) => (
        <mesh key={i} position={part.p} material={mat('#ffffff', { roughness: 1, emissive: '#dfefff', emissiveIntensity: 0.35 })}>
          <boxGeometry args={part.s} />
        </mesh>
      ))}
    </group>
  )
}

export function Tree({ position, scale = 1, leaf = '#3fbf4a' }) {
  return (
    <group position={position} scale={scale}>
      <Block size={[1.2, 4, 1.2]} position={[0, 0, 0]} base m="woodDark" tile={2} />
      <Block size={[5, 3, 5]} position={[0, 3.6, 0]} base m={leaf} />
      <Block size={[3.4, 2, 3.4]} position={[0, 6.4, 0]} base m={leaf} />
    </group>
  )
}

export function Torch({ position, color = '#ff9a2e', light = false }) {
  const flame = useRef()
  useFrame(({ clock }) => {
    if (!flame.current) return
    const t = clock.elapsedTime * 8 + position[0]
    flame.current.scale.setScalar(1 + Math.sin(t) * 0.12)
  })
  return (
    <group position={position}>
      <Block size={[0.3, 2.2, 0.3]} base m="woodDark" tile={1} />
      <Block size={[0.6, 0.3, 0.6]} position={[0, 2.2, 0]} base m="stoneDark" tile={1} />
      <group ref={flame} position={[0, 2.8, 0]}>
        <mesh>
          <boxGeometry args={[0.4, 0.55, 0.4]} />
          <meshBasicMaterial color={color} />
        </mesh>
        <mesh position={[0, 0.1, 0]}>
          <boxGeometry args={[0.22, 0.4, 0.22]} />
          <meshBasicMaterial color="#fff3a0" />
        </mesh>
      </group>
      <Glow position={[0, 2.85, 0]} color={color} size={2.4} opacity={0.7} />
      {light && <pointLight position={[0, 3, 0]} color={color} intensity={8} distance={10} decay={2} />}
    </group>
  )
}

/* ---------------------------------------------------------------------------
 * Castle
 * ------------------------------------------------------------------------- */

/** Crenellated wall segment running along X (rotate for Z). */
export function Wall({ position, length, height = 10, thickness = 3, m = 'castle', cap = 'castleDark' }) {
  const merlons = Math.floor(length / 3)
  return (
    <group position={position}>
      <Block size={[length, height, thickness]} base m={m} tile={4} />
      <Block size={[length, 0.8, thickness + 0.6]} position={[0, height, 0]} base m={cap} tile={4} />
      {Array.from({ length: merlons }, (_, i) =>
        i % 2 === 0 ? (
          <Block
            key={i}
            size={[1.6, 1.6, thickness + 0.6]}
            position={[-length / 2 + 1.5 + i * 3, height + 0.8, 0]}
            base
            m={cap}
            tile={4}
          />
        ) : null,
      )}
    </group>
  )
}

export function Tower({ position, radius = 5, height = 20, m = 'castle', flag = '#e0303c' }) {
  const flagRef = useRef()
  useFrame(({ clock }) => {
    if (flagRef.current) flagRef.current.rotation.y = Math.sin(clock.elapsedTime * 1.4 + position[0]) * 0.25
  })
  const material = useMemo(() => {
    const base = mat(m)
    const clone = base.clone()
    clone.map = base.map.clone()
    clone.map.repeat.set((radius * Math.PI * 2) / 4, height / 4)
    clone.map.needsUpdate = true
    return clone
  }, [m, radius, height])
  const merlons = 10
  return (
    <group position={position}>
      <mesh position={[0, height / 2, 0]} material={material} castShadow receiveShadow>
        <cylinderGeometry args={[radius, radius * 1.05, height, 20]} />
      </mesh>
      <mesh position={[0, height + 0.5, 0]} material={mat('castleDark')} castShadow>
        <cylinderGeometry args={[radius + 0.8, radius + 0.8, 1, 20]} />
      </mesh>
      {Array.from({ length: merlons }, (_, i) => {
        const a = (i / merlons) * Math.PI * 2
        return (
          <Block
            key={i}
            size={[1.6, 1.8, 1.2]}
            position={[Math.sin(a) * (radius + 0.3), height + 1, Math.cos(a) * (radius + 0.3)]}
            rotation={[0, a, 0]}
            base
            m="castleDark"
          />
        )
      })}
      {/* Window slits */}
      {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((a, i) => (
        <mesh key={i} position={[Math.sin(a) * (radius + 0.02), height * 0.62, Math.cos(a) * (radius + 0.02)]} rotation={[0, a, 0]}>
          <planeGeometry args={[0.9, 2.6]} />
          <meshBasicMaterial color="#f4f6ff" />
        </mesh>
      ))}
      <group ref={flagRef} position={[0, height + 1, 0]}>
        <Block size={[0.3, 7, 0.3]} base m="#6b4a2b" />
        <Block size={[3.2, 2, 0.15]} position={[1.7, 5.2, 0]} base m={flag} />
      </group>
    </group>
  )
}

/* ---------------------------------------------------------------------------
 * Market stall
 * ------------------------------------------------------------------------- */

/** Height of a stall's counter, not counting its top plank. */
export const STALL_COUNTER_H = 1.2

/** Wooden counter with a striped awning. Faces +Z (the customer side). */
export function Stall({ position, rotation = 0, stripes = ['#e0303c', '#ffffff'], width = 8, mat: matColor, children }) {
  const n = 8
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* A bright welcome mat in front of the counter, in the shop's colour. */}
      {matColor && (
        <>
          <Block size={[width - 0.8, 0.1, 3.4]} position={[0, 0.09, 4.6]} base m={matColor} tile={1.5} cast={false} />
          <Block size={[width - 1.6, 0.12, 2.6]} position={[0, 0.1, 4.6]} base m={mat(matColor, { emissive: matColor, emissiveIntensity: 0.25 })} tile={1.5} cast={false} />
        </>
      )}
      <Solid>
        {/* A low counter, so the shopkeeper behind it stays in view. */}
        <Block size={[width, STALL_COUNTER_H, 2]} position={[0, 0, 1.5]} base m="wood" tile={2} />
        <Block size={[width + 0.4, 0.3, 2.4]} position={[0, STALL_COUNTER_H, 1.5]} base m="woodDark" tile={2} />
        <Block size={[width, 5, 0.6]} position={[0, 0, -2.2]} base m="wood" tile={2} />
        {[-1, 1].map((s) => (
          <Block key={s} size={[0.6, 6, 0.6]} position={[s * (width / 2 - 0.3), 0, 2.4]} base m="woodDark" tile={2} />
        ))}
        {[-1, 1].map((s) => (
          <Block key={`b${s}`} size={[0.6, 6, 0.6]} position={[s * (width / 2 - 0.3), 0, -2.2]} base m="woodDark" tile={2} />
        ))}
      </Solid>
      {/* Awning: alternating coloured slats, tilted toward the front. */}
      <group position={[0, 6.1, 0.2]} rotation={[0.28, 0, 0]}>
        {Array.from({ length: n }, (_, i) => (
          <Block
            key={i}
            size={[(width + 1) / n, 0.35, 5.6]}
            position={[-(width + 1) / 2 + ((width + 1) / n) * (i + 0.5), 0, 0]}
            m={stripes[i % 2]}
            tile={2}
          />
        ))}
        {/* Scalloped valance along the front edge. */}
        {Array.from({ length: n }, (_, i) => (
          <Block
            key={`v${i}`}
            size={[(width + 1) / n, 0.7, 0.3]}
            position={[-(width + 1) / 2 + ((width + 1) / n) * (i + 0.5), -0.45, 2.8]}
            m={stripes[i % 2]}
            tile={2}
          />
        ))}
      </group>
      {/* Lanterns hanging off the front posts. */}
      {[-1, 1].map((s) => (
        <group key={`l${s}`} position={[s * (width / 2 - 0.3), 3.7, 2.95]}>
          <Block size={[0.12, 0.12, 0.6]} position={[0, 0.5, -0.3]} base m="#2a2a30" cast={false} />
          <Block size={[0.08, 0.3, 0.08]} position={[0, 0.25, 0]} base m="#2a2a30" cast={false} />
          <Block size={[0.55, 0.12, 0.55]} position={[0, 0.2, 0]} base m="#2a2a30" cast={false} />
          <mesh position={[0, -0.1, 0]} material={mat('#ffcf6b', { emissive: '#ffb030', emissiveIntensity: 1.4 })}>
            <boxGeometry args={[0.4, 0.5, 0.4]} />
          </mesh>
          <Block size={[0.5, 0.1, 0.5]} position={[0, -0.45, 0]} base m="#2a2a30" cast={false} />
          <Glow position={[0, -0.1, 0]} color="#ffc060" size={2.4} opacity={0.55} />
        </group>
      ))}
      {/* Potted shrubs either side of the counter. */}
      {[-1, 1].map((s) => (
        <group key={`p${s}`} position={[s * (width / 2 + 0.2), 0, 3.4]}>
          <Block size={[0.9, 0.8, 0.9]} base m="#b0522c" tile={1} />
          <Block size={[1, 0.14, 1]} position={[0, 0.8, 0]} base m="#8a3a1c" cast={false} />
          <mesh position={[0, 1.4, 0]} material={mat('#3fae3a', { flatShading: true })} castShadow>
            <icosahedronGeometry args={[0.62, 0]} />
          </mesh>
        </group>
      ))}
      {children}
    </group>
  )
}

/**
 * The shop's name board above the awning, on two posts up from the back wall:
 * a painted wooden plank with the name lettered on both sides.
 */
export function StallSign({ text, width = 8, y = 10.2, z = -2.2, frame, colors, stroke, icon }) {
  const colorKey = colors?.join('|')
  const texture = useMemo(
    () => signboardTexture(text, { frame, colors: colorKey?.split('|'), stroke, icon }),
    [text, frame, colorKey, stroke, icon],
  )
  useEffect(() => () => texture.dispose(), [texture])
  const w = width
  const h = w / 4
  return (
    <group position={[0, 0, z]}>
      {[-1, 1].map((s) => (
        <Block key={s} size={[0.34, y - 5.8, 0.34]} position={[s * (w / 2 - 0.7), 5.8, 0]} base m="woodDark" tile={2} />
      ))}
      <Block size={[w + 0.3, h + 0.3, 0.3]} position={[0, y - h / 2 - 0.15, 0]} base m="woodDark" tile={2} />
      <Block size={[w + 0.5, 0.22, 0.5]} position={[0, y + h / 2 + 0.1, 0]} base m={frame || 'gold'} tile={2} cast={false} />
      {[0.17, -0.17].map((dz, i) => (
        <mesh key={dz} position={[0, y, dz]} rotation={[0, i ? Math.PI : 0, 0]}>
          <planeGeometry args={[w, h]} />
          <meshStandardMaterial map={texture} roughness={0.8} emissive="#ffffff" emissiveMap={texture} emissiveIntensity={0.18} />
        </mesh>
      ))}
    </group>
  )
}

/* ---------------------------------------------------------------------------
 * Blocky R6-style characters for NPCs and training dummies
 * ------------------------------------------------------------------------- */

const HATS = {
  sombrero: (c) => (
    <group position={[0, 1.02, 0]}>
      <mesh castShadow material={mat(c || '#f2c230')}>
        <cylinderGeometry args={[1.6, 1.6, 0.14, 20]} />
      </mesh>
      <mesh castShadow position={[0, 0.42, 0]} material={mat(c || '#f2c230')}>
        <cylinderGeometry args={[0.45, 0.62, 0.8, 16]} />
      </mesh>
      <mesh position={[0, 0.12, 0]} material={mat('#e0303c')}>
        <cylinderGeometry args={[0.64, 0.64, 0.14, 16]} />
      </mesh>
    </group>
  ),
  tophat: (c) => (
    <group position={[0, 1.02, 0]}>
      <mesh castShadow material={mat(c || '#1b1b22')}>
        <cylinderGeometry args={[0.95, 0.95, 0.1, 18]} />
      </mesh>
      <mesh castShadow position={[0, 0.6, 0]} material={mat(c || '#1b1b22')}>
        <cylinderGeometry args={[0.55, 0.55, 1.2, 18]} />
      </mesh>
      <mesh position={[0, 0.15, 0]} material={mat('#e0303c')}>
        <cylinderGeometry args={[0.57, 0.57, 0.2, 18]} />
      </mesh>
    </group>
  ),
  wizard: (c) => (
    <group position={[0, 1.0, 0]}>
      <mesh castShadow material={mat(c || '#c21a2e')}>
        <cylinderGeometry args={[1.2, 1.2, 0.12, 18]} />
      </mesh>
      <mesh castShadow position={[0.1, 0.9, 0]} rotation={[0, 0, -0.15]} material={mat(c || '#c21a2e')}>
        <coneGeometry args={[0.7, 1.9, 18]} />
      </mesh>
      <mesh position={[0.2, 0.7, 0.62]} material={mat('#ffd23b', { emissive: '#ffb000', emissiveIntensity: 0.6 })}>
        <octahedronGeometry args={[0.2]} />
      </mesh>
    </group>
  ),
  helmet: (c) => (
    <group position={[0, 0.55, 0]}>
      <Block size={[1.3, 0.7, 1.3]} m={c || '#9aa0a8'} />
      <Block size={[0.2, 0.6, 0.9]} position={[0, 0.5, 0]} m="#e0303c" />
    </group>
  ),
  horns: (c) => (
    <group position={[0, 0.7, 0]}>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.55, 0.35, 0]} rotation={[0, 0, -s * 0.5]} material={mat(c || '#2a1a1a')} castShadow>
          <coneGeometry args={[0.18, 0.8, 8]} />
        </mesh>
      ))}
    </group>
  ),
  /** A cloth hood draped over the head and shoulders. */
  hood: (c) => (
    <group position={[0, 0.1, -0.05]}>
      <Block size={[1.36, 1.3, 1.36]} position={[0, 0.1, -0.05]} m={c || '#3a2a4a'} />
      <Block size={[1.0, 0.9, 0.2]} position={[0, -0.05, 0.62]} m="#15151f" />
      <Block size={[0.9, 0.5, 0.9]} position={[0, 0.85, -0.2]} m={c || '#3a2a4a'} />
    </group>
  ),
  /** A cloth band tied round the head, knot at the back. */
  bandana: (c) => (
    <group position={[0, 0.42, 0]}>
      <Block size={[1.3, 0.3, 1.3]} m={c || '#c21a2e'} />
      <Block size={[0.3, 0.5, 0.2]} position={[0.2, -0.25, -0.72]} rotation={[0.3, 0, 0.4]} m={c || '#c21a2e'} />
    </group>
  ),
  /** Iron cap with two curved horns. */
  viking: (c) => (
    <group position={[0, 0.55, 0]}>
      <Block size={[1.34, 0.55, 1.34]} m="#9aa0a8" />
      <Block size={[1.38, 0.14, 1.38]} position={[0, -0.25, 0]} m={c || '#c9a256'} />
      {[-1, 1].map((sd) => (
        <mesh key={sd} position={[sd * 0.85, 0.35, 0]} rotation={[0, 0, -sd * 0.7]} material={mat('#f4efe2')} castShadow>
          <coneGeometry args={[0.2, 0.9, 8]} />
        </mesh>
      ))}
    </group>
  ),
  /** Striped nemes headdress, for the desert's Jackal Zombies. */
  pharaoh: (c) => (
    <group position={[0, 0.3, 0]}>
      <Block size={[1.36, 0.5, 1.36]} position={[0, 0.3, 0]} m={c || '#ffd23b'} />
      <Block size={[1.4, 0.16, 1.4]} position={[0, 0.08, 0]} m="#2f5ad8" />
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.72, -0.45, -0.05]}>
          <Block size={[0.22, 1.1, 0.95]} m="#2f5ad8" />
          {[-0.3, 0.05, 0.4].map((y) => (
            <Block key={y} size={[0.24, 0.12, 0.97]} position={[0, y, 0]} m={c || '#ffd23b'} />
          ))}
        </group>
      ))}
      <Block size={[0.3, 0.3, 0.2]} position={[0, 0.45, 0.72]} m="#2f5ad8" />
    </group>
  ),
  crown: (c) => (
    <group position={[0, 0.72, 0]}>
      <Block size={[1.2, 0.35, 1.2]} m={c || '#ffd23b'} />
      {[-0.45, 0, 0.45].map((x) => (
        <Block key={x} size={[0.22, 0.4, 0.22]} position={[x, 0.35, 0.5]} m={c || '#ffd23b'} />
      ))}
    </group>
  ),
}

/**
 * A Roblox R6-proportioned character built from boxes. Origin at the feet,
 * total height ~5 units at scale 1 (sized to match the avatar at ~0.4 scale).
 *
 * `pose` is a ref the caller animates: { walk: 0..1, phase, attack: 0..1 }.
 */
export function BlockyCharacter({
  skin = '#f5d36b',
  shirt = '#2b6be0',
  pants = '#2f9a44',
  face = 'smile',
  hat,
  hatColor,
  held,
  pose,
  scale = 1,
  extra,
  emissive,
  ...rest
}) {
  const armL = useRef()
  const armR = useRef()
  const legL = useRef()
  const legR = useRef()
  const torso = useRef()
  const faceMat = useMemo(() => {
    const t = faceTexture(face, skin)
    return mat('#ffffff', { map: t })
  }, [face, skin])
  const skinMat = emissive ? mat(skin, { emissive, emissiveIntensity: 0.25 }) : mat(skin)

  useFrame(({ clock }) => {
    const p = pose?.current
    const t = clock.elapsedTime
    const walk = p?.walk ?? 0
    const phase = p?.phase ?? t * 8
    const swing = Math.sin(phase) * 0.8 * walk
    const idle = Math.sin(t * 1.8) * 0.05 * (1 - walk)
    if (legL.current) legL.current.rotation.x = swing
    if (legR.current) legR.current.rotation.x = -swing
    if (armL.current) armL.current.rotation.x = -swing + idle
    if (armR.current) {
      const atk = p?.attack ?? 0
      // Attack: raise then chop down.
      const chop = atk > 0 ? -Math.sin(atk * Math.PI) * 2.2 : 0
      armR.current.rotation.x = swing + chop - idle - (held ? 0.35 : 0)
    }
    if (torso.current) torso.current.position.y = 3 + Math.abs(Math.cos(phase)) * 0.12 * walk
  })

  return (
    <group scale={scale} {...rest}>
      <group ref={torso} position={[0, 3, 0]}>
        {/* Torso */}
        <Block size={[2, 2, 1]} m={shirt} tile={2} />
        {/* Head */}
        <group position={[0, 1.6, 0]}>
          <mesh castShadow material={skinMat}>
            <boxGeometry args={[1.2, 1.2, 1.2]} />
          </mesh>
          <mesh position={[0, 0, 0.605]} material={faceMat}>
            <planeGeometry args={[1.18, 1.18]} />
          </mesh>
          {hat && HATS[hat]?.(hatColor)}
        </group>
        {/* Arms pivot at the shoulder. */}
        <group ref={armL} position={[-1.5, 0.8, 0]}>
          <mesh castShadow position={[0, -0.8, 0]} material={skinMat}>
            <boxGeometry args={[1, 2, 1]} />
          </mesh>
        </group>
        <group ref={armR} position={[1.5, 0.8, 0]}>
          <mesh castShadow position={[0, -0.8, 0]} material={skinMat}>
            <boxGeometry args={[1, 2, 1]} />
          </mesh>
          {held && <group position={[0, -1.7, 0.2]} rotation={[Math.PI / 2, 0, 0]}>{held}</group>}
        </group>
        {extra}
      </group>
      {/* Legs pivot at the hip. */}
      <group ref={legL} position={[-0.5, 2, 0]}>
        <Block size={[1, 2, 1]} position={[0, -1, 0]} m={pants} tile={2} />
      </group>
      <group ref={legR} position={[0.5, 2, 0]}>
        <Block size={[1, 2, 1]} position={[0, -1, 0]} m={pants} tile={2} />
      </group>
    </group>
  )
}

/** Floating, bobbing and spinning — for crystals, the gift, etc. */
export function Floaty({ children, amp = 0.3, speed = 1.5, spin = 0.6, ...rest }) {
  const ref = useRef()
  const offset = useMemo(() => Math.random() * 10, [])
  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.elapsedTime + offset
    ref.current.position.y = Math.sin(t * speed) * amp
    ref.current.rotation.y = t * spin
  })
  return (
    <group {...rest}>
      <group ref={ref}>{children}</group>
    </group>
  )
}

