import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, Color, Fog, ShaderMaterial } from 'three'

import { useGame } from '../net/store'
import { stageById } from '../shared/gameData'
import BlockyBackdrop from './BlockyBackdrop'
import { local } from './bus'
import { glowTexture } from './textures'

/**
 * One sky, sun and fog for the whole game: the bright lobby day carries on
 * through every stage, so walking deeper never switches the sky.
 */
const LOOK = { top: '#2e8bff', bottom: '#b4e0ff', fog: '#c6e8ff', near: 140, far: 420, sun: '#fff0d4', sunI: 3.1, hemiSky: '#c6e6ff', hemiGround: '#8a6a3a', hemiI: 0.8 }

/**
 * Every zone gets more direct sun and less flat fill than its table values, for
 * crisper shading and richer colour.
 */
const SUN_BOOST = 1.12
const FILL_SCALE = 0.8

/** Light ambient particles for the few stages where weather belongs; the rest stay clear. */
const PARTICLES = {
  frost: { color: '#ffffff', rise: false },
  glacier: { color: '#ffffff', rise: false },
  storm: { color: '#ffffff', rise: false },
  celestial: { color: '#fff3a0', rise: true },
}

/** The current stage's theme, or null in the lobby. */
function useZoneTheme() {
  const stage = useGame((s) => s.stage)
  return stage ? stageById(stage)?.theme ?? null : null
}

function Sky() {
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        uniforms: { uTop: { value: new Color(LOOK.top) }, uBottom: { value: new Color(LOOK.bottom) } },
        vertexShader: `varying vec3 vPos; void main(){ vPos = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 uTop; uniform vec3 uBottom; varying vec3 vPos;
          void main(){ float h = clamp(vPos.y * 1.4 + 0.25, 0.0, 1.0); gl_FragColor = vec4(mix(uBottom, uTop, pow(h, 0.8)), 1.0); }`,
      }),
    [],
  )
  const ref = useRef()
  useFrame(() => {
    // The sky dome follows the camera so it never clips.
    ref.current?.position.copy(local.pos)
  })
  return (
    <mesh ref={ref} material={mat} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[400, 32, 16]} />
    </mesh>
  )
}

/**
 * Falling snow / rising embers / drifting motes around the player. Mounted once
 * and only recoloured or hidden per zone: remounting it on every stage change
 * would rebuild its buffers mid-walk.
 */
function Weather({ particle }) {
  const rise = Boolean(particle?.rise)
  const COUNT = 500
  const geo = useMemo(() => {
    const g = new BufferGeometry()
    const pos = new Float32Array(COUNT * 3)
    for (let i = 0; i < COUNT; i += 1) {
      pos[i * 3] = (Math.random() - 0.5) * 80
      pos[i * 3 + 1] = Math.random() * 30
      pos[i * 3 + 2] = (Math.random() - 0.5) * 80
    }
    g.setAttribute('position', new BufferAttribute(pos, 3))
    return g
  }, [])
  const ref = useRef()
  useFrame((state, dt) => {
    if (!particle) return
    const arr = geo.attributes.position.array
    for (let i = 0; i < COUNT; i += 1) {
      arr[i * 3 + 1] += (rise ? 1.5 : -3) * dt
      arr[i * 3] += Math.sin(state.clock.elapsedTime + i) * dt * 0.5
      if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] = 30
      if (arr[i * 3 + 1] > 30) arr[i * 3 + 1] = 0
    }
    geo.attributes.position.needsUpdate = true
    ref.current?.position.set(local.pos.x, 0, local.pos.z)
  })
  return (
    <points ref={ref} geometry={geo} frustumCulled={false} visible={Boolean(particle)}>
      <pointsMaterial map={glowTexture()} color={particle?.color || '#ffffff'} size={rise ? 0.5 : 0.35} transparent depthWrite={false} blending={AdditiveBlending} />
    </points>
  )
}

export function Atmosphere() {
  const theme = useZoneTheme()
  const scene = useThree((s) => s.scene)
  const shadows = useGame((s) => s.settings.shadows)
  const sun = useRef()

  useEffect(() => {
    scene.fog = new Fog(LOOK.fog, LOOK.near, LOOK.far)
    return () => {
      scene.fog = null
    }
  }, [scene])

  useFrame(() => {
    if (sun.current) {
      // Keep the shadow frustum centred on the player for crisp shadows anywhere.
      const p = local.pos
      sun.current.position.set(p.x + 35, p.y + 60, p.z + 25)
      sun.current.target.position.set(p.x, p.y, p.z)
      sun.current.target.updateMatrixWorld()
    }
  })

  return (
    <>
      <Sky />
      <BlockyBackdrop />
      <hemisphereLight args={[LOOK.hemiSky, LOOK.hemiGround, LOOK.hemiI * FILL_SCALE]} />
      <ambientLight intensity={0.12} />
      <directionalLight
        ref={sun}
        castShadow={shadows}
        intensity={LOOK.sunI * SUN_BOOST}
        color={LOOK.sun}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-45}
        shadow-camera-right={45}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
        shadow-camera-near={1}
        shadow-camera-far={160}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
      <Weather particle={PARTICLES[theme]} />
    </>
  )
}

export default Atmosphere
