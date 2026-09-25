import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, CanvasTexture, Color, DoubleSide, MeshBasicMaterial, ShaderMaterial, SRGBColorSpace } from 'three'

import { getRoom } from '../../net/network'
import { serverNow, useGame } from '../../net/store'
import { EVENT_ORES, formatNum, HUB, ORES, rarityOf } from '../../shared/gameData'
import { mat } from '../textures'
import { Block, BlockyCharacter, Glow, Label, LightBeam, Solid } from './props'

const FONT = (px, w = 700) => `${w} ${px}px Fredoka, 'Arial Rounded MT Bold', sans-serif`

function strokeText(ctx, text, x, y, fill, stroke = '#10101c', lw = 8) {
  ctx.lineJoin = 'round'
  ctx.lineWidth = lw
  ctx.strokeStyle = stroke
  ctx.strokeText(text, x, y)
  ctx.fillStyle = fill
  ctx.fillText(text, x, y)
}

function useCanvasTexture(w, h) {
  return useMemo(() => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const tex = new CanvasTexture(c)
    tex.colorSpace = SRGBColorSpace
    tex.anisotropy = 4
    return { canvas: c, ctx: c.getContext('2d'), tex }
  }, [w, h])
}

const fmtTime = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/* ---------------------------------------------------------------------------
 * Dungeon portal + ore timer board
 * ------------------------------------------------------------------------- */

/**
 * The shimmer across the dungeon gate: clear in the middle so you can see down
 * the corridor, a swirling pink haze toward the frame.
 */
function veilMaterial() {
  return new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uFade: { value: 1 },
      uA: { value: new Color('#ff7ae0') },
      uB: { value: new Color('#b026ff') },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform float uTime; uniform float uFade; uniform vec3 uA; uniform vec3 uB; varying vec2 vUv;
      void main(){
        vec2 p = vUv - 0.5;
        float edge = max(abs(p.x) * 2.0, abs(p.y) * 2.0);
        float a = atan(p.y, p.x);
        float swirl = sin(a * 5.0 + length(p) * 18.0 - uTime * 3.0) * 0.5 + 0.5;
        float ripple = sin(vUv.y * 30.0 - uTime * 4.0) * 0.5 + 0.5;
        vec3 col = mix(uB, uA, swirl * 0.7 + ripple * 0.3);
        float alpha = smoothstep(0.55, 1.0, edge) * 0.75 + 0.04 + swirl * 0.05;
        gl_FragColor = vec4(col, alpha * uFade);
      }`,
    transparent: true,
    depthWrite: false,
  })
}

function OreTimerBoard() {
  const { canvas, ctx, tex } = useCanvasTexture(640, 300)
  const events = useGame((s) => s.events)
  const last = useRef('')

  useFrame(() => {
    const now = serverNow()
    // Where each event ore is right now (a random stage each time), if it's up.
    const ores = getRoom()?.state.ores
    const rows = EVENT_ORES.map((ev) => {
      const live = ores?.get(`ev_${ev.ore}`)
      return [ev, events[ev.ore] ? events[ev.ore] - now : 0, live?.alive ? live.stage : 0]
    })
    const key = rows.map(([, ms, at]) => `${Math.ceil(ms / 1000)}:${at}`).join('|')
    if (key === last.current) return
    last.current = key

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height)
    g.addColorStop(0, '#2a1450')
    g.addColorStop(1, '#170a30')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#c85cff'
    ctx.lineWidth = 10
    ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10)

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = FONT(26, 600)
    strokeText(ctx, 'Event ores appear', 150, 70, '#ffffff', '#10101c', 6)
    strokeText(ctx, 'in a random stage', 150, 104, '#ffe07a', '#10101c', 6)
    ctx.font = FONT(22, 600)
    strokeText(ctx, 'Clear the stage,', 150, 200, '#e6d6ff', '#10101c', 5)
    strokeText(ctx, 'then mine together!', 150, 230, '#e6d6ff', '#10101c', 5)

    rows.forEach(([ev, ms, at], i) => {
      const y = 62 + i * 88
      ctx.fillStyle = 'rgba(0,0,0,0.35)'
      ctx.fillRect(292, y - 34, 330, 68)
      ctx.font = FONT(34)
      const color = rarityOf(ORES[ev.ore].rarity).color
      const name = ev.label.split(' ')[0]
      strokeText(ctx, at ? `${name}: Stage ${at}!` : `${name} ${fmtTime(ms)}`, 457, y, color, '#10101c', 7)
    })
    tex.needsUpdate = true
  })

  return (
    <mesh>
      <planeGeometry args={[10, 4.7]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  )
}

/**
 * The dungeon gate in the castle's north wall. There's no teleport: the corridor
 * starts right behind it, so you can look straight down Stage 1 and walk in.
 */
export function DungeonPortal() {
  const [px, , pz] = HUB.portal.pos
  const veil = useMemo(() => veilMaterial(), [])
  useFrame(({ clock, camera }) => {
    veil.uniforms.uTime.value = clock.elapsedTime
    // Fade out as the camera passes through, so it never smears across the view.
    const d = Math.hypot(camera.position.x - px, camera.position.z - pz)
    veil.uniforms.uFade.value = Math.min(1, Math.max(0, (d - 5) / 7))
  })

  const W = HUB.portal.width
  const H = 11
  return (
    <group position={[px, 0, pz]}>
      <Solid>
        <Block size={[2.6, H, 3.6]} position={[-W / 2 - 1.3, 0, 0]} base m="purple" tile={2} />
        <Block size={[2.6, H, 3.6]} position={[W / 2 + 1.3, 0, 0]} base m="purple" tile={2} />
        <Block size={[W + 5.2, 2.4, 3.8]} position={[0, H, 0]} base m="purple" tile={2} />
      </Solid>
      {/* Glowing inner frame */}
      <Block size={[0.3, H, 3.7]} position={[-W / 2 - 0.1, 0, 0]} base m={mat('#ff7ae0', { emissive: '#ff5fd0', emissiveIntensity: 0.9 })} cast={false} />
      <Block size={[0.3, H, 3.7]} position={[W / 2 + 0.1, 0, 0]} base m={mat('#ff7ae0', { emissive: '#ff5fd0', emissiveIntensity: 0.9 })} cast={false} />
      <Block size={[W + 0.4, 0.3, 3.7]} position={[0, H - 0.2, 0]} base m={mat('#ff7ae0', { emissive: '#ff5fd0', emissiveIntensity: 0.9 })} cast={false} />
      <Block size={[W + 6, 0.5, 4.2]} position={[0, H + 2.4, 0]} base m="#ff7ae0" />
      {/* Pink bushes on the lintel */}
      {[-5, -2, 1.5, 4.5].map((x) => (
        <Block key={x} size={[1.6, 1.1, 1.6]} position={[x, H + 2.9, 0.4]} base m="#ff5fd0" />
      ))}
      <mesh position={[0, H / 2, 0.2]} material={veil}>
        <planeGeometry args={[W, H]} />
      </mesh>
      <Label text="Dungeon" position={[0, H / 2 + 0.6, 1.4]} height={2.6} colors={['#ffffff', '#ffe6fb']} stroke="#6a1a8a" />
      <Label text="Rebirth to get stronger!" position={[0, H + 5.2, 2.2]} height={1.6} colors={['#ffffff', '#f4f4ff']} stroke="#1a1a2e" />
      <Glow position={[0, H / 2, 0.6]} color="#ff7ae0" size={11} opacity={0.22} />
      <pointLight position={[0, H / 2, 4]} color="#ff6ae0" intensity={20} distance={16} decay={2} />
      <group position={[0, H + 10.2, 0.8]}>
        <Block size={[10.6, 5.3, 0.4]} position={[0, 0, -0.3]} m="#7a2ad8" />
        <OreTimerBoard />
      </group>
    </group>
  )
}

/* ---------------------------------------------------------------------------
 * Leaderboards
 * ------------------------------------------------------------------------- */

const BOARD_STYLE = {
  power: { title: 'POWER', color: '#ff6a3b', fmt: (v) => formatNum(v) },
  rebirths: { title: 'REBIRTHS', color: '#ffd23b', fmt: (v) => formatNum(v) },
  playtime: { title: 'PLAYTIME', color: '#7fe3ff', fmt: (v) => `${v}h` },
}

/** The #1 name's mascot: a gold-decked figure dancing beside its board. */
function Champion({ name }) {
  const group = useRef()
  const pose = useRef({ walk: 1, phase: 0, attack: 0 })
  useFrame((_, delta) => {
    pose.current.phase += delta * 9
    const g = group.current
    if (!g) return
    const t = pose.current.phase
    g.position.y = Math.abs(Math.sin(t * 0.5)) * 0.18
    g.rotation.y = Math.sin(t * 0.5) * 0.55
    g.rotation.z = Math.sin(t * 0.7) * 0.09
  })
  return (
    <group position={[0, 0.5, 1.7]}>
      <group ref={group}>
        <BlockyCharacter scale={0.42} pose={pose} skin="#ffd23b" shirt="#fff6c0" pants="#e0a000" hat="crown" hatColor="#ffffff" face="smile" emissive="#ffd23b" />
      </group>
      <Label text={name} position={[0, 3, 0]} height={0.8} colors={['#ffffff', '#ffe07a']} stroke="#4a2a00" />
    </group>
  )
}

export function Leaderboard({ kind, position, rotation = [0, 0, 0] }) {
  const { canvas, ctx, tex } = useCanvasTexture(512, 640)
  const rows = useGame((s) => s.leaderboard?.[kind])
  const style = BOARD_STYLE[kind]

  useEffect(() => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#10182e'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#1c2a4f'
    ctx.fillRect(0, 0, canvas.width, 110)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = FONT(64)
    strokeText(ctx, style.title, canvas.width / 2, 58, style.color, '#05070f', 10)
    ;(rows || []).forEach(([name, value], i) => {
      const y = 160 + i * 66
      ctx.fillStyle = i % 2 ? '#16213d' : '#1a2748'
      ctx.fillRect(18, y - 30, canvas.width - 36, 60)
      ctx.textAlign = 'left'
      ctx.font = FONT(30)
      const medal = ['#ffd23b', '#d6dde6', '#e08a4a'][i] || '#8fa3c8'
      strokeText(ctx, `${i + 1}`, 34, y, medal, '#05070f', 6)
      ctx.font = FONT(28, 600)
      strokeText(ctx, name.slice(0, 14), 78, y, '#ffffff', '#05070f', 5)
      ctx.textAlign = 'right'
      strokeText(ctx, style.fmt(value), canvas.width - 34, y, style.color, '#05070f', 5)
    })
    if (!rows?.length) {
      ctx.font = FONT(28, 600)
      strokeText(ctx, 'Be the first!', canvas.width / 2, 300, '#8fa3c8', '#05070f', 5)
    }
    tex.needsUpdate = true
  }, [rows, ctx, canvas, tex, style])

  const champion = rows?.[0]?.[0]

  return (
    <group position={position} rotation={rotation}>
      {/* A little stage of its own, not just standing on the lobby floor. */}
      <Solid>
        <mesh position={[0, 0.25, 0]} material={mat('stone', { roughness: 0.7 })} castShadow receiveShadow>
          <cylinderGeometry args={[3.3, 3.5, 0.5, 20]} />
        </mesh>
      </Solid>
      <mesh position={[0, 0.51, 0]} material={mat('#ffd23b', { metalness: 0.4, roughness: 0.3 })}>
        <cylinderGeometry args={[3.32, 3.32, 0.06, 20]} />
      </mesh>
      <Solid>
        <Block size={[5.4, 7, 0.5]} position={[0, 1.1, -0.3]} base m="#e8ecf5" />
      </Solid>
      <Block size={[0.5, 0.8, 0.5]} position={[-2, 0.5, -0.3]} base m="#ffd23b" />
      <Block size={[0.5, 0.8, 0.5]} position={[2, 0.5, -0.3]} base m="#ffd23b" />
      <mesh position={[0, 4.6, 0]}>
        <planeGeometry args={[5, 6.25]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
      <mesh position={[0, 4.6, 0.02]}>
        <planeGeometry args={[5, 6.25]} />
        <meshBasicMaterial color="#6ab0ff" transparent opacity={0.05} blending={AdditiveBlending} />
      </mesh>
      {champion && <Champion name={champion} />}
    </group>
  )
}

/** Shared by every spot cone (additive, so order-free): the world batches them into one draw. */
const spotMaterials = new Map()
function spotMaterial(color) {
  if (!spotMaterials.has(color)) {
    const m = new MeshBasicMaterial({ color, transparent: true, opacity: 0.08, blending: AdditiveBlending, depthWrite: false, side: DoubleSide })
    m.userData.cachedMat = true
    spotMaterials.set(color, m)
  }
  return spotMaterials.get(color)
}

/** A soft cone of light from a truss lamp down onto the stage. */
function SpotCone({ position, height, color = '#bfefff' }) {
  return (
    <mesh position={[position[0], position[1] - height / 2, position[2]]} material={spotMaterial(color)}>
      <cylinderGeometry args={[0.35, 2.4, height, 20, 1, true]} />
    </mesh>
  )
}

/**
 * The leaderboards' stage: a raised platform of bolted steel plates with a
 * lighting truss overhead, placed where you see it from spawn. The three
 * boards fan out slightly toward the front.
 */
export function LeaderboardStage() {
  const { pos, rotation } = HUB.boards
  const W = 22
  const D = 11
  const TOP = 0.6
  const steel = mat('metalPlate', { metalness: 0.35, roughness: 0.42 })
  const dark = mat('metalDark', { metalness: 0.4, roughness: 0.45 })
  const neon = mat('#5fd0ff', { emissive: '#2fb4ff', emissiveIntensity: 1.4 })
  const gold = mat('#ffd23b', { emissive: '#ffb000', emissiveIntensity: 0.9 })
  const lamps = [-9, -4.5, 0, 4.5, 9]
  return (
    <group position={pos} rotation={[0, rotation, 0]}>
      <Solid>
        {/* A low step all round, deeper at the front, then the steel deck. */}
        <Block size={[W + 1.6, 0.3, D + 2]} position={[0, 0, 0.6]} base m={dark} tile={2.5} />
        <Block size={[W, TOP, D]} base m={steel} tile={2.5} />
        {/* Riser for the #1 board in the middle. */}
        <Block size={[7, 0.4, 7]} position={[0, TOP, -1.8]} base m={dark} tile={2.5} />
        {/* Truss: two back pillars and a beam across the top. */}
        {[-1, 1].map((sd) => (
          <Block key={sd} size={[0.9, 10.4, 0.9]} position={[sd * (W / 2 - 0.6), TOP, -D / 2 + 0.6]} base m={dark} tile={2} />
        ))}
        <Block size={[W, 7.2, 0.4]} position={[0, TOP, -D / 2 + 0.3]} base m={dark} tile={2.5} />
      </Solid>
      <Block size={[W - 0.4, 0.9, 0.9]} position={[0, TOP + 10.4, -D / 2 + 0.6]} base m={dark} tile={2} />
      {/* Neon trim round the deck and along the backdrop. */}
      <Block size={[W + 0.1, 0.1, 0.22]} position={[0, TOP + 0.02, D / 2]} m={neon} cast={false} />
      {[-1, 1].map((sd) => (
        <Block key={sd} size={[0.22, 0.1, D]} position={[sd * (W / 2), TOP + 0.02, 0]} m={neon} cast={false} />
      ))}
      <Block size={[W - 1.4, 0.18, 0.1]} position={[0, TOP + 7, -D / 2 + 0.52]} m={neon} cast={false} />
      <Block size={[7.1, 0.08, 0.16]} position={[0, TOP + 0.42, 1.72]} m={gold} cast={false} />
      {/* Lamps under the truss, each throwing a cone of light onto the deck. */}
      {lamps.map((x) => (
        <group key={x} position={[x, TOP + 10.1, -D / 2 + 1.2]}>
          <Block size={[1, 0.6, 1]} m={dark} />
          <mesh position={[0, -0.31, 0]} rotation={[Math.PI / 2, 0, 0]} material={mat('#ffffff', { emissive: '#dff6ff', emissiveIntensity: 1.5 })}>
            <circleGeometry args={[0.38, 16]} />
          </mesh>
          <Glow position={[0, -0.4, 0.1]} color="#bfefff" size={2.2} opacity={0.55} />
          <SpotCone position={[0, -0.3, 2.2]} height={9.6} />
        </group>
      ))}
      {/* Light pillars on the deck's front corners. */}
      {[-1, 1].map((sd) => (
        <group key={sd} position={[sd * (W / 2 - 0.5), TOP, D / 2 - 0.5]}>
          <Block size={[0.7, 1.8, 0.7]} base m={dark} tile={2} />
          <Block size={[0.5, 0.4, 0.5]} position={[0, 1.8, 0]} base m={neon} cast={false} />
          <Glow position={[0, 2.1, 0]} color="#5fd0ff" size={2.6} opacity={0.6} />
          <LightBeam position={[0, 2.2, 0]} color="#5fd0ff" height={14} radius={0.3} opacity={0.18} />
        </group>
      ))}
      <Label text="LEADERBOARDS" position={[0, TOP + 12.6, -D / 2 + 0.6]} height={2.2} colors={['#fff27a', '#ffb000']} stroke="#3a1a00" />
      <Leaderboard kind="rebirths" position={[-7.2, TOP, -1.8]} rotation={[0, 0.22, 0]} />
      <Leaderboard kind="power" position={[0, TOP + 0.4, -1.8]} />
      <Leaderboard kind="playtime" position={[7.2, TOP, -1.8]} rotation={[0, -0.22, 0]} />
    </group>
  )
}

export function BoardTitle({ text, position }) {
  return <Label text={text} position={position} height={1.2} colors={['#ffffff', '#cfe2ff']} />
}
