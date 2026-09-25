import { useMemo } from 'react'
import { Color, ExtrudeGeometry, MeshStandardMaterial, Shape } from 'three'

import { RARITY_INDEX, WEAPONS } from '../../shared/gameData'
import Merged from '../Merged'
import { weaponLook } from '../weaponTier'
import { Glow } from '../world/props'

/**
 * Procedural weapon meshes. Local space: the grip is at the origin, the weapon
 * points up +Y, the blade's flat faces ±Z. Sized for a ~1.8 unit tall avatar.
 */

const geoCache = new Map()
function cached(key, build) {
  if (!geoCache.has(key)) geoCache.set(key, build())
  return geoCache.get(key)
}

const EXTRUDE = (depth) => ({
  depth,
  bevelEnabled: true,
  bevelThickness: depth * 0.35,
  bevelSize: 0.008,
  bevelSegments: 1,
  curveSegments: 10,
})

function extrude(shape, depth) {
  const g = new ExtrudeGeometry(shape, EXTRUDE(depth))
  g.translate(0, 0, -depth / 2)
  return g
}

const KATANA_LEN = 0.92
/** How far the blade bows back (toward -X) at the tip. */
const KATANA_SORI = 0.05

/**
 * A slim katana blade: back (mune) on -X, edge on +X, bowing gently backwards
 * toward a raked kissaki point. `back` / `edge` are x offsets at the base.
 */
function katanaShape(back, edge, depth = 0.02) {
  const L = KATANA_LEN
  const bow = (y) => -KATANA_SORI * (y / L) ** 2
  const tipStart = L - 0.13
  const s = new Shape()
  s.moveTo(-back, 0)
  s.lineTo(edge, 0)
  for (let i = 1; i <= 10; i += 1) {
    const y = (tipStart * i) / 10
    s.lineTo(edge + bow(y), y)
  }
  // The kissaki: the edge sweeps up and back to meet the spine at the point.
  s.quadraticCurveTo(edge + bow(L) + 0.004, L - 0.03, -back + bow(L) + 0.004, L)
  for (let i = 10; i >= 0; i -= 1) {
    const y = ((L - 0.02) * i) / 10
    s.lineTo(-back + bow(y), y)
  }
  return extrude(s, depth)
}

const BLADES = {
  Katana: () => katanaShape(0.028, 0.032),
  /** The bright cutting edge (hamon) along the katana's front. */
  KatanaEdge: () => katanaShape(-0.016, 0.034, 0.026),
  Sword: () => {
    // Broad blade that flares slightly past the guard, then runs to a long point.
    const s = new Shape()
    s.moveTo(-0.055, 0)
    s.lineTo(0.055, 0)
    s.lineTo(0.075, 0.12)
    s.lineTo(0.07, 0.82)
    s.lineTo(0, 1.02)
    s.lineTo(-0.07, 0.82)
    s.lineTo(-0.075, 0.12)
    s.lineTo(-0.055, 0)
    return extrude(s, 0.022)
  },
  Dagger: () => {
    const s = new Shape()
    s.moveTo(-0.035, 0)
    s.lineTo(0.035, 0)
    s.quadraticCurveTo(0.045, 0.3, 0, 0.46)
    s.quadraticCurveTo(-0.045, 0.3, -0.035, 0)
    return extrude(s, 0.016)
  },
  Axe: () => {
    // Crescent axe head, hung off the right of the haft.
    const s = new Shape()
    s.moveTo(0, -0.1)
    s.lineTo(0.12, -0.08)
    s.quadraticCurveTo(0.28, -0.24, 0.36, -0.26)
    s.quadraticCurveTo(0.26, 0.02, 0.36, 0.3)
    s.quadraticCurveTo(0.28, 0.26, 0.12, 0.12)
    s.lineTo(0, 0.14)
    s.lineTo(0, -0.1)
    return extrude(s, 0.035)
  },
}

function useMaterials(def, tier) {
  return useMemo(() => {
    const r = RARITY_INDEX[def.rarity]
    const look = weaponLook(tier)
    // Past the first tier the blade takes on the tier's colour and glows with it.
    const glow = look.index > 0 ? look.color : def.glow || def.blade
    // Polished steel first: plain blades lean silver so they read as metal in the
    // bright daylight, then the tier's colour takes over as you grow.
    const blade = new Color(def.blade).lerp(new Color('#e8eef5'), r <= 1 ? 0.45 : 0.15).lerp(new Color(look.color), Math.min(0.55, look.index * 0.12))
    return {
      blade: new MeshStandardMaterial({
        color: blade,
        metalness: 0.42,
        roughness: 0.18,
        emissive: glow,
        emissiveIntensity: Math.max(r >= 4 ? 0.7 : r >= 2 ? 0.28 : 0.05, look.glow * 1.3),
      }),
      accent: new MeshStandardMaterial({
        color: def.accent,
        metalness: 0.35,
        roughness: 0.45,
        emissive: r >= 6 ? def.accent : '#000000',
        emissiveIntensity: r >= 6 ? 0.6 : 0,
      }),
      grip: new MeshStandardMaterial({ color: '#1f1a24', roughness: 0.9 }),
      wrap: new MeshStandardMaterial({ color: def.accent, roughness: 0.7 }),
      // The glowing groove down the middle of a sword blade.
      fuller: new MeshStandardMaterial({
        color: glow,
        metalness: 0.3,
        roughness: 0.2,
        emissive: glow,
        emissiveIntensity: r >= 4 ? 1.4 : 0.6,
      }),
      // Katana fittings: the tsuba, habaki and kashira are always gold.
      gold: new MeshStandardMaterial({ color: '#e0a526', metalness: 0.75, roughness: 0.3, emissive: '#5a3a00', emissiveIntensity: 0.25 }),
      edge: new MeshStandardMaterial({
        color: '#ffffff',
        metalness: 0.3,
        roughness: 0.1,
        emissive: r >= 4 ? glow : '#ffffff',
        emissiveIntensity: r >= 4 ? 0.9 : 0.35,
      }),
      diamond: new MeshStandardMaterial({ color: '#f4f4f4', roughness: 0.6 }),
      glow,
      rarity: r,
      tier: look,
    }
  }, [def, tier])
}

export function WeaponModel({ weaponId, scale = 1, tier = 0, ...rest }) {
  const def = WEAPONS[weaponId] || WEAPONS.wooden_katana
  const m = useMaterials(def, tier)
  const blade = cached(def.class, BLADES[def.class])

  let body
  if (def.class === 'Axe') {
    body = (
      <>
        <mesh material={m.grip} position={[0, 0.35, 0]} castShadow>
          <cylinderGeometry args={[0.022, 0.026, 1.05, 8]} />
        </mesh>
        <mesh material={m.accent} position={[0, 0.84, 0]} castShadow>
          <boxGeometry args={[0.07, 0.2, 0.07]} />
        </mesh>
        <mesh geometry={blade} material={m.blade} position={[0.02, 0.8, 0]} castShadow />
        <mesh geometry={blade} material={m.blade} position={[-0.02, 0.8, 0]} rotation={[0, Math.PI, 0]} scale={[0.55, 0.7, 1]} castShadow />
        <mesh material={m.accent} position={[0, -0.18, 0]}>
          <sphereGeometry args={[0.04, 8, 6]} />
        </mesh>
      </>
    )
  } else if (def.class === 'Katana') {
    // Long two-hand grip wrapped in a diamond (hishigami) pattern, a round gold
    // tsuba, and a slim bowed blade with a bright hamon edge.
    const gripLen = 0.32
    body = (
      <>
        <mesh material={m.wrap} position={[0, gripLen / 2 - 0.06, 0]} scale={[1, 1, 0.8]} castShadow>
          <cylinderGeometry args={[0.027, 0.029, gripLen, 10]} />
        </mesh>
        {Array.from({ length: 6 }, (_, i) =>
          [-1, 1].map((side) => (
            <mesh
              key={`${i}${side}`}
              material={m.diamond}
              position={[0, -0.03 + i * 0.047, side * 0.021]}
              rotation={[0, 0, Math.PI / 4]}
            >
              <boxGeometry args={[0.022, 0.022, 0.008]} />
            </mesh>
          )),
        )}
        {/* Kashira (pommel cap) */}
        <mesh material={m.gold} position={[0, -0.075, 0]} scale={[1, 1, 0.8]}>
          <cylinderGeometry args={[0.031, 0.029, 0.035, 10]} />
        </mesh>
        {/* Tsuba (guard) and habaki (blade collar) */}
        <mesh material={m.gold} position={[0, gripLen - 0.045, 0]} scale={[1, 1, 0.78]} castShadow>
          <cylinderGeometry args={[0.078, 0.078, 0.022, 16]} />
        </mesh>
        <mesh material={m.gold} position={[0, gripLen - 0.02, 0]}>
          <boxGeometry args={[0.066, 0.04, 0.03]} />
        </mesh>
        <mesh geometry={blade} material={m.blade} position={[0, gripLen - 0.03, 0]} castShadow />
        <mesh geometry={cached('KatanaEdge', BLADES.KatanaEdge)} material={m.edge} position={[0, gripLen - 0.03, 0]} />
      </>
    )
  } else {
    const gripLen = def.class === 'Dagger' ? 0.14 : 0.22
    body = (
      <>
        <mesh material={m.grip} position={[0, gripLen / 2 - 0.06, 0]} castShadow>
          <cylinderGeometry args={[0.024, 0.024, gripLen, 8]} />
        </mesh>
        {/* Diamond wrap on the grip. */}
        {Array.from({ length: 3 }, (_, i) => (
          <mesh key={i} material={m.wrap} position={[0, -0.03 + i * (gripLen / 3), 0]} rotation={[0, Math.PI / 4, 0]}>
            <boxGeometry args={[0.042, 0.02, 0.042]} />
          </mesh>
        ))}
        {def.class === 'Sword' ? (
          <group position={[0, gripLen - 0.05, 0]}>
            {/* Crossguard with flared ends and a gem at its heart. */}
            <mesh material={m.accent} castShadow>
              <boxGeometry args={[0.38, 0.05, 0.07]} />
            </mesh>
            {[-1, 1].map((side) => (
              <mesh key={side} material={m.accent} position={[side * 0.2, 0.03, 0]} rotation={[0, 0, side * -0.5]} castShadow>
                <boxGeometry args={[0.05, 0.1, 0.075]} />
              </mesh>
            ))}
            <mesh material={m.fuller} position={[0, 0.01, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <octahedronGeometry args={[0.042, 0]} />
            </mesh>
          </group>
        ) : (
          <mesh material={m.accent} position={[0, gripLen - 0.05, 0]} castShadow>
            <boxGeometry args={[def.class === 'Dagger' ? 0.16 : 0.3, 0.045, 0.06]} />
          </mesh>
        )}
        <mesh material={m.accent} position={[0, -0.08, 0]}>
          <sphereGeometry args={[0.032, 8, 6]} />
        </mesh>
        <mesh geometry={blade} material={m.blade} position={[0, gripLen - 0.04, 0]} castShadow />
        {def.class === 'Sword' && (
          <mesh material={m.fuller} position={[0, gripLen + 0.4, 0]}>
            <boxGeometry args={[0.024, 0.66, 0.044]} />
          </mesh>
        )}
      </>
    )
  }

  const tipY = def.class === 'Katana' ? 1.2 : def.class === 'Sword' ? 1.2 : def.class === 'Axe' ? 0.95 : 0.55

  return (
    <group scale={scale} {...rest}>
      {/* A dozen small parts, but rigid and never recoloured once built: drawn
          merged, one draw per kind of finish. */}
      <Merged immutable>{body}</Merged>
      {(m.rarity >= 3 || m.tier.index > 0) && (
        <Glow
          position={[0, tipY * 0.6, 0]}
          color={m.glow}
          size={Math.max(m.rarity >= 5 ? 1.4 : m.rarity >= 3 ? 0.9 : 0, 0.7 + m.tier.glow * 1.3)}
          opacity={0.35 + m.tier.glow * 0.3}
        />
      )}
      {/* Top tiers light the tip too. */}
      {m.tier.index >= 4 && <Glow position={[0, tipY * 0.95, 0]} color="#ffffff" size={0.5 + m.tier.glow * 0.6} opacity={0.5} />}
    </group>
  )
}

export default WeaponModel
