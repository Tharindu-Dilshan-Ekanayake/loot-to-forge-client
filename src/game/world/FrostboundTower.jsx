import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { useEffect, useMemo, useRef } from 'react'
import { DoubleSide, ShaderMaterial } from 'three'

import { HUB } from '../../shared/gameData'
import { mat, signboardTexture } from '../textures'
import { Block, Glow, Solid, Torch } from './props'

/**
 * The Frostbound Tower: an ice gate in the castle's east wall with the tower's
 * name on a painted board above it, and the tower itself out past the snowy
 * stairs. Touching the gate's frosted portal takes you to its stage.
 */

const OPEN = 16
const GATE_H = 14
const PILLAR_Z = OPEN / 2 + 1.5

const ice = (c = '#bfeaff', glow = '#5fd0ff', i = 0.45) => mat(c, { emissive: glow, emissiveIntensity: i, roughness: 0.15 })

/** Swirling frost filling the gateway, brighter at the rim. */
function portalMaterial() {
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform float uTime; varying vec2 vUv;
      void main(){
        vec2 p = vUv - 0.5;
        p.x *= 1.25;
        float r = length(p);
        float a = atan(p.y, p.x);
        float swirl = sin(a * 5.0 + r * 22.0 - uTime * 2.2) * 0.5 + 0.5;
        float swirl2 = sin(a * 3.0 - r * 14.0 + uTime * 1.3) * 0.5 + 0.5;
        float edge = smoothstep(0.36, 0.5, max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)));
        float sparkle = step(0.985, fract(sin(dot(floor(vUv * 60.0), vec2(12.9898, 78.233)) + floor(uTime * 6.0)) * 43758.5453));
        vec3 deep = vec3(0.18, 0.55, 0.95);
        vec3 pale = vec3(0.85, 0.98, 1.0);
        vec3 col = mix(deep, pale, swirl * 0.55 + swirl2 * 0.25 + edge * 0.5) + sparkle * 0.8;
        float alpha = 0.5 + 0.2 * swirl * (1.0 - r) + edge * 0.35 + sparkle * 0.4;
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.92));
      }`,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  })
}

/** A cluster of ice crystals, for pillar tops and the tower's crown. */
function IceCrystals({ position, scale = 1 }) {
  return (
    <group position={position} scale={scale}>
      {[
        [0, 0, 2.2, 0],
        [0.55, 0.2, 1.4, 0.45],
        [-0.5, -0.25, 1.2, -0.5],
        [0.1, -0.5, 1.0, 0.3],
      ].map(([x, z, h, tilt], i) => (
        <mesh key={i} position={[x, h * 0.45, z]} rotation={[tilt * 0.4, i, tilt]} scale={[1, h, 1]} material={ice('#dff8ff', '#5fd0ff', 0.7)}>
          <octahedronGeometry args={[0.5, 0]} />
        </mesh>
      ))}
      <Glow position={[0, 1.2, 0]} color="#8ff8ff" size={4} opacity={0.45} />
    </group>
  )
}

/** A board with printed lettering, facing into the courtyard (-X). */
function GateBoard({ text, icon, position, width, frame, colors, stroke, planks }) {
  const colorKey = colors.join('|')
  const plankKey = planks.join('|')
  const texture = useMemo(
    () => signboardTexture(text, { icon, frame, colors: colorKey.split('|'), stroke, planks: plankKey.split('|') }),
    [text, icon, frame, colorKey, stroke, plankKey],
  )
  useEffect(() => () => texture.dispose(), [texture])
  const h = width / 4
  return (
    <group position={position} rotation={[0, -Math.PI / 2, 0]}>
      <Block size={[width + 0.5, h + 0.5, 0.35]} position={[0, 0, -0.2]} m="#1b3a5c" tile={2} />
      <Block size={[width + 0.8, 0.28, 0.6]} position={[0, h / 2 + 0.3, -0.1]} m={ice('#e8fbff', '#8ff8ff', 0.6)} cast={false} />
      <mesh position={[0, 0, 0.0]}>
        <planeGeometry args={[width, h]} />
        <meshStandardMaterial map={texture} roughness={0.8} emissive="#ffffff" emissiveMap={texture} emissiveIntensity={0.55} />
      </mesh>
    </group>
  )
}

function Gate({ x }) {
  const portal = useMemo(() => portalMaterial(), [])
  useEffect(() => () => portal.dispose(), [portal])
  useFrame(({ clock }) => {
    portal.uniforms.uTime.value = clock.elapsedTime
  })
  const icicles = useMemo(
    () =>
      Array.from({ length: 13 }, (_, i) => {
        const z = -OPEN / 2 + 0.6 + (i / 12) * (OPEN - 1.2)
        return { z, len: 0.9 + ((i * 7) % 5) * 0.35 }
      }),
    [],
  )
  return (
    <group>
      <Solid>
        {[-1, 1].map((s) => (
          <Block key={s} size={[3.4, GATE_H, 3]} position={[x, 0, s * PILLAR_Z]} base m="frostWall" tile={2} />
        ))}
        <Block size={[3.6, 2.6, OPEN + 6]} position={[x, GATE_H, 0]} base m="frostWall" tile={2} />
      </Solid>
      {/* Pillar bases, glowing ice trim and crystal crowns. */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <Block size={[4.2, 1.4, 3.8]} position={[x, 0, s * PILLAR_Z]} base m="castleDark" tile={2} />
          <Block size={[0.25, GATE_H - 2, 0.5]} position={[x - 1.75, 1.4, s * (PILLAR_Z - 1.1)]} base m={ice()} cast={false} />
          <IceCrystals position={[x, GATE_H + 2.6, s * PILLAR_Z]} scale={1.2} />
        </group>
      ))}
      {/* Crenellated top and a glowing trim along the lintel. */}
      {Array.from({ length: 6 }, (_, i) => (
        <Block key={i} size={[3.6, 1.2, 1.6]} position={[x, GATE_H + 2.6, -OPEN / 2 - 2 + i * ((OPEN + 4) / 5)]} base m="castleDark" tile={1.5} />
      ))}
      <Block size={[0.3, 0.35, OPEN + 5]} position={[x - 1.85, GATE_H - 0.3, 0]} base m={ice('#e8fbff', '#8ff8ff', 0.8)} cast={false} />
      {/* Icicles hanging along the underside of the lintel. */}
      {icicles.map(({ z, len }) => (
        <mesh key={z} position={[x - 1.1, GATE_H - len / 2, z]} rotation={[Math.PI, 0, 0]} material={ice('#e8fbff', '#8ff8ff', 0.5)}>
          <coneGeometry args={[0.22, len, 5]} />
        </mesh>
      ))}

      {/* The name board over the gate, and the requirement plaque on the lintel. */}
      <GateBoard
        text="FROSTBOUND TOWER"
        icon="❄"
        position={[x - 2.1, GATE_H + 5.1, 0]}
        width={17}
        frame="#8ff8ff"
        colors={['#ffffff', '#9fe6ff', '#4fb8ff']}
        stroke="#0b2a4a"
        planks={['#1f4f86', '#255a95']}
      />
      <GateBoard
        text={`Requires ${HUB.tower.rebirths} Rebirths`}
        position={[x - 1.95, GATE_H + 1.3, 0]}
        width={9}
        frame="#ffd23b"
        colors={['#ffffff', '#ffe07a']}
        stroke="#3a1a00"
        planks={['#16345a', '#1b3d66']}
      />

      {/* The frosted portal itself. */}
      <mesh position={[x + 0.3, GATE_H / 2, 0]} rotation={[0, -Math.PI / 2, 0]} material={portal} renderOrder={1}>
        <planeGeometry args={[OPEN, GATE_H]} />
      </mesh>
      <Glow position={[x - 1, GATE_H / 2, 0]} color="#8ff8ff" size={18} opacity={0.35} />

      {/* Ice lanterns and snowy drifts either side of the way in. */}
      {[-1, 1].map((s) => (
        <group key={`d${s}`}>
          <Torch position={[x - 3, 0, s * (PILLAR_Z + 2.4)]} color="#7fe3ff" />
          <Block size={[4, 0.6, 3]} position={[x - 2.5, 0, s * (PILLAR_Z - 0.2)]} base m="snow" tile={2} cast={false} />
          <Block size={[2.4, 1, 2]} position={[x - 2.2, 0, s * (PILLAR_Z + 0.6)]} base m="snow" tile={2} cast={false} />
        </group>
      ))}
      <Block size={[6, 0.08, OPEN]} position={[x - 3.5, 0.04, 0]} m={ice('#cfefff', '#5fd0ff', 0.25)} tile={2} cast={false} />
    </group>
  )
}

/** The tower out past the stairs: ice brick, balconies, glowing windows and a crystal crown. */
function Tower({ x }) {
  const orbit = useRef()
  const crown = useRef()
  useFrame(({ clock }, dt) => {
    if (orbit.current) orbit.current.rotation.y += dt * 0.25
    if (crown.current) {
      crown.current.rotation.y += dt * 0.6
      crown.current.position.y = 80 + Math.sin(clock.elapsedTime * 1.2) * 0.8
    }
  })
  const wall = useMemo(() => {
    const base = mat('frostWall')
    const m = base.clone()
    m.map = base.map.clone()
    m.map.repeat.set(14, 15)
    m.map.needsUpdate = true
    return m
  }, [])
  const windowMat = mat('#9ff8ff', { emissive: '#5fe0ff', emissiveIntensity: 1.1 })
  return (
    <group position={[x, 0, 0]}>
      {/* Snowy plinth */}
      <mesh position={[0, 1.5, 0]} material={mat('snow')} receiveShadow>
        <cylinderGeometry args={[14, 15, 3, 20]} />
      </mesh>
      <mesh position={[0, 31.5, 0]} material={wall} castShadow>
        <cylinderGeometry args={[9, 11, 57, 20]} />
      </mesh>
      {/* Balconies with battlements */}
      {[22, 44].map((y) => (
        <group key={y} position={[0, y, 0]}>
          <mesh material={mat('castleDark')} castShadow>
            <cylinderGeometry args={[11.6, 11.2, 1.2, 20]} />
          </mesh>
          <mesh position={[0, 0.65, 0]} material={ice('#dff8ff', '#8ff8ff', 0.6)}>
            <torusGeometry args={[11.4, 0.18, 6, 40]} />
          </mesh>
          {Array.from({ length: 14 }, (_, i) => {
            const a = (i / 14) * Math.PI * 2
            return <Block key={i} size={[1.8, 1.4, 0.8]} position={[Math.sin(a) * 11.2, 0.6, Math.cos(a) * 11.2]} rotation={[0, a, 0]} base m="castleDark" />
          })}
        </group>
      ))}
      {/* Top rim, roof and a floating crystal crown */}
      <mesh position={[0, 60.5, 0]} material={mat('castleDark')} castShadow>
        <cylinderGeometry args={[10.5, 9.6, 1.6, 20]} />
      </mesh>
      <mesh position={[0, 68, 0]} material={ice('#8fdcff', '#2fb4ff', 0.55)} castShadow>
        <coneGeometry args={[11, 14, 20]} />
      </mesh>
      <group ref={crown} position={[0, 80, 0]}>
        <mesh scale={[1, 1.8, 1]} material={ice('#e8fbff', '#8ff8ff', 1)}>
          <octahedronGeometry args={[2.4, 0]} />
        </mesh>
        <Glow position={[0, 0, 0]} color="#8ff8ff" size={18} opacity={0.55} />
      </group>
      {/* Glowing arched windows in rings up the tower */}
      {[12, 30, 38, 52].map((y, row) =>
        Array.from({ length: 6 }, (_, i) => {
          const a = (i / 6) * Math.PI * 2 + row * 0.5
          const r = 10.7 - (y / 57) * 2 + 0.05
          return (
            <group key={`${y}-${i}`} position={[Math.sin(a) * r, y, Math.cos(a) * r]} rotation={[0, a, 0]}>
              <Block size={[2.2, 4.2, 0.3]} position={[0, 0, -0.05]} m="castleDark" cast={false} />
              <mesh position={[0, 0, 0.12]} material={windowMat}>
                <planeGeometry args={[1.5, 3.4]} />
              </mesh>
            </group>
          )
        }),
      )}
      {/* Ice crystals orbiting the tower, on a faint glowing ring. */}
      <group ref={orbit} position={[0, 36, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} material={ice('#dff8ff', '#8ff8ff', 0.9)}>
          <torusGeometry args={[15, 0.12, 6, 64]} />
        </mesh>
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2
          return (
            <mesh key={i} position={[Math.sin(a) * 15, Math.sin(i * 1.7) * 1.2, Math.cos(a) * 15]} scale={[1, 1.8, 1]} material={ice('#e8fbff', '#8ff8ff', 0.8)}>
              <octahedronGeometry args={[0.9, 0]} />
            </mesh>
          )
        })}
      </group>
      <Glow position={[0, 60, 0]} color="#5fd0ff" size={40} opacity={0.3} />
    </group>
  )
}

export function FrostboundTower({ wall }) {
  return (
    <group>
      <Gate x={wall} />
      {/* Invisible barrier: you enter the tower by touching the gate, not by walking out. */}
      <RigidBody type="fixed" colliders={false} position={[wall + 1.5, 6, 0]}>
        <CuboidCollider args={[0.5, 6, 8]} />
      </RigidBody>
      {/* Snowy stairs up to the tower, each step edged in ice. */}
      {Array.from({ length: 8 }, (_, i) => (
        <group key={i}>
          <Block size={[3, 1.2 + i * 1.2, 14]} position={[wall + 4 + i * 3, 0, 0]} base m="snow" />
          <Block size={[0.3, 0.2, 14]} position={[wall + 2.6 + i * 3, 1.2 + i * 1.2, 0]} base m={ice()} cast={false} />
        </group>
      ))}
      <Tower x={wall + 40} />
    </group>
  )
}

export default FrostboundTower
