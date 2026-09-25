import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, Color, Fog, ShaderMaterial, Vector3 } from 'three'

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

/** Where the sun sits relative to the player, and the shadow map it casts. */
const SUN_OFFSET = new Vector3(35, 60, 25)
const SHADOW_MAP = 2048
const SHADOW_HALF = 40
/**
 * The shadow area is centred this far ahead of the player, along the view: what
 * you look at keeps its shadows, and things well behind the camera drop out of
 * the shadow pass instead of being drawn into it for nothing.
 */
const SHADOW_AHEAD = 14
const SHADOW_TEXEL = (SHADOW_HALF * 2) / SHADOW_MAP
/** The shadow camera's right and up axes (it looks from SUN_OFFSET at the player). */
const SUN_BACK = SUN_OFFSET.clone().normalize()
const SUN_RIGHT = new Vector3(0, 1, 0).cross(SUN_BACK).normalize()
const SUN_UP = SUN_BACK.clone().cross(SUN_RIGHT)
const _sunAt = new Vector3()
const _view = new Vector3()

/** Light ambient particles for the few stages where weather belongs; the rest stay clear. */
const PARTICLES = {
  frost: { color: '#ffffff', rise: false },
  glacier: { color: '#ffffff', rise: false },
  storm: { color: '#ffffff', rise: false },
  celestial: { color: '#fff3a0', rise: true },
  // The deep dungeon: fireflies, ash, spores and embers.
  marsh: { color: '#b6ff6a', rise: true },
  bonewaste: { color: '#d8d0bc', rise: false },
  plague: { color: '#a8ff3a', rise: true },
  abyss: { color: '#7ffcff', rise: true },
  grove: { color: '#f08aff', rise: true },
  cathedral: { color: '#ff5a5a', rise: true },
  ashland: { color: '#ff8a3a', rise: true },
  eclipse: { color: '#ffd06a', rise: true },
  endless: { color: '#ff6ae6', rise: true },
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

  useFrame(({ camera }) => {
    if (sun.current) {
      // Keep the shadow frustum on the player (a little ahead, where you're
      // looking) for crisp shadows anywhere, moved only in whole shadow-map
      // texels: sliding it smoothly re-samples every shadow edge each frame, and
      // they crawl and shimmer as you walk.
      camera.getWorldDirection(_view)
      _view.y = 0
      if (_view.lengthSq() > 1e-6) _view.normalize()
      const p = _sunAt.copy(local.pos).addScaledVector(_view, SHADOW_AHEAD)
      const u = p.dot(SUN_RIGHT)
      const v = p.dot(SUN_UP)
      _sunAt
        .addScaledVector(SUN_RIGHT, Math.round(u / SHADOW_TEXEL) * SHADOW_TEXEL - u)
        .addScaledVector(SUN_UP, Math.round(v / SHADOW_TEXEL) * SHADOW_TEXEL - v)
      sun.current.position.copy(_sunAt).add(SUN_OFFSET)
      sun.current.target.position.copy(_sunAt)
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
        shadow-mapSize={[SHADOW_MAP, SHADOW_MAP]}
        shadow-camera-left={-SHADOW_HALF}
        shadow-camera-right={SHADOW_HALF}
        shadow-camera-top={SHADOW_HALF}
        shadow-camera-bottom={-SHADOW_HALF}
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
