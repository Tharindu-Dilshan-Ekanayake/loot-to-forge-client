import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, Color } from 'three'

import { getRoom } from '../../net/network'
import { useGame } from '../../net/store'
import { enemyStats, formatNum } from '../../shared/gameData'
import { fx, local } from '../bus'
import { addAnchor, makeHealthPlate } from '../labels'
import { pauseMatrices, stageShown } from '../stageWindow'
import { glowTexture, mat } from '../textures'
import { Block, BlockyCharacter, Glow } from '../world/props'
import WeaponModel from './WeaponModel'

/** Base character scale: BlockyCharacter is 5 units tall at 1, goblins ~1.7. */
const BASE = 0.34

/**
 * Per-kind look. `body` comes from the enemy type; everything else here is paint.
 * Every enemy is a BlockyCharacter person; golems add boulder shoulders.
 */
const LOOKS = {
  pinkslime: { skin: '#e8b48a', shirt: '#6a4a2a', pants: '#3a2e24', face: 'angry', hat: 'bandana', hatColor: '#c21a2e', weapon: 'rusty_shiv' },
  blossomfox: { skin: '#f0c090', shirt: '#c21a2e', pants: '#2f4a8a', face: 'angry', hat: 'hood', hatColor: '#7a4a22', weapon: 'woodcutter' },
  goblinshaman: { skin: '#62c94a', shirt: '#6a2ab8', pants: '#3a1a5a', face: 'glow', hat: 'wizard', hatColor: '#4a1a8a', glow: '#6dff4a', ears: true, weapon: 'jade_needle' },
  goblin: { skin: '#62c94a', shirt: '#8a5a30', pants: '#5a3a1e', face: 'angry', weapon: 'woodcutter', ears: true },
  goblin2: { skin: '#58b844', shirt: '#6b6b73', pants: '#4a3320', face: 'angry', weapon: 'stone_hatchet', ears: true },
  wolf: { skin: '#58b844', shirt: '#7a3a1e', pants: '#3a2a1a', face: 'angry', weapon: 'stone_hatchet', ears: true, fur: true },
  banditthief: { skin: '#d8a070', shirt: '#2a2a36', pants: '#1b1b22', face: 'angry', hat: 'hood', hatColor: '#1b1b22', weapon: 'shadow_talon' },
  archer: { skin: '#62c94a', shirt: '#3f7a3a', pants: '#3a2a1a', face: 'angry', hat: 'helmet', hatColor: '#3f7a3a', bow: '#8a5a30', ears: true },
  brute: { skin: '#4f9e3e', shirt: '#5a3a1e', pants: '#3a2a1a', face: 'angry', weapon: 'stone_hatchet', ears: true, fur: true },
  boar: { skin: '#4f9e3e', shirt: '#8a2a2a', pants: '#3a2a1a', face: 'angry', hat: 'horns', weapon: 'copper_reaver', ears: true },
  goblinwarlock: { skin: '#4f9e3e', shirt: '#2a1a4a', pants: '#1b1030', face: 'glow', hat: 'wizard', hatColor: '#2a1a4a', glow: '#b35bff', ears: true, weapon: 'venom_kiss' },
  archer2: { skin: '#58b844', shirt: '#2a4a2a', pants: '#2a1a10', face: 'angry', hat: 'helmet', hatColor: '#2a4a2a', bow: '#5a3a1e', ears: true },
  goblin3: { skin: '#4fae3e', shirt: '#7a2a2a', pants: '#3a2a1a', face: 'angry', hat: 'helmet', weapon: 'iron_blade', ears: true },
  keepknight: { skin: '#f2d0b0', shirt: '#9aa0a8', pants: '#5b6070', face: 'angry', hat: 'helmet', hatColor: '#c9ced6', weapon: 'silverbrand', fur: true },
  crossbow: { skin: '#4fae3e', shirt: '#6b6b73', pants: '#2e2e3a', face: 'angry', hat: 'helmet', hatColor: '#9aa0a8', bow: '#3a3d48', ears: true },
  captain: { skin: '#3fd6c8', shirt: '#2a5aa8', pants: '#2e2e3a', face: 'angry', weapon: 'iron_blade', fur: true, ears: true },
  spider: { skin: '#7a8a6a', shirt: '#4a3a2a', pants: '#2e2418', face: 'angry', hat: 'horns', hatColor: '#d8d4c6', weapon: 'stone_hatchet', fur: true },
  bat: { skin: '#c9b8d6', shirt: '#3a2a4a', pants: '#24183a', face: 'glow', hat: 'hood', hatColor: '#3a2a4a', glow: '#ff3b3b', weapon: 'venom_kiss' },
  caveslime: { skin: '#b8e0a0', shirt: '#6a6a2a', pants: '#3a3a1a', face: 'angry', hat: 'helmet', hatColor: '#ffd23b', weapon: 'copper_kris', glow: '#6dff4a' },
  skeleton: { skin: '#f0eee4', shirt: '#d8d4c6', pants: '#c8c4b4', face: 'skull', weapon: 'ronin_blade' },
  skelarcher: { skin: '#f0eee4', shirt: '#b8b4a6', pants: '#a8a494', face: 'skull', bow: '#6b5a4a' },
  ghost: { skin: '#b8c9b0', shirt: '#4a4a5a', pants: '#2e2e3a', face: 'skull', weapon: 'rusty_shiv' },
  lich: { skin: '#c9d6c0', shirt: '#3a1a5a', pants: '#24103a', face: 'glow', hat: 'crown', hatColor: '#9a7bff', weapon: 'shadow_talon', glow: '#9a7bff', fur: true },
  frostwolf: { skin: '#f2d0b0', shirt: '#5f8fc8', pants: '#e8f4ff', face: 'angry', hat: 'viking', hatColor: '#bfe6fa', weapon: 'frost_splitter', fur: true },
  snowslime: { skin: '#f2d0b0', shirt: '#e8f6ff', pants: '#7fb6e8', face: 'angry', hat: 'hood', hatColor: '#e8f6ff', weapon: 'frostbite' },
  icegolem: { skin: '#9fd8f5', shirt: '#7fb6e8', pants: '#5f8fc8', face: 'glow', glow: '#5fd0ff', rock: '#bfeaff' },
  icewisp: { skin: '#bfe6fa', shirt: '#2f6bd8', pants: '#1f4a9a', face: 'glow', hat: 'wizard', hatColor: '#8ff8ff', glow: '#8ff8ff', weapon: 'tidal_stiletto' },
  yeti: { skin: '#f4f6fb', shirt: '#e8ecf5', pants: '#d8dee8', face: 'angry', hat: 'horns', hatColor: '#bfe6fa', weapon: 'woodcutter', fur: true, rock: '#ffffff' },
  frosttitan: { skin: '#7fb6e8', shirt: '#5f8fc8', pants: '#3f6fa8', face: 'glow', hat: 'crown', hatColor: '#bfeaff', glow: '#8ff8ff', rock: '#bfeaff' },
  mummy: { skin: '#7fc86a', shirt: '#ece8d8', pants: '#dcd8c6', face: 'angry', weapon: 'rusty_shiv' },
  scorpion: { skin: '#e8e4d4', shirt: '#ece8d8', pants: '#dcd8c6', face: 'glow', glow: '#6dff4a', weapon: 'rusty_shiv' },
  sandgolem: { skin: '#6fb85a', shirt: '#ece8d8', pants: '#dcd8c6', face: 'angry', hat: 'pharaoh', weapon: 'sunfang' },
  voidknight: { skin: '#3a2a6e', shirt: '#2a1d52', pants: '#1b1238', face: 'glow', hat: 'helmet', hatColor: '#2a1d52', weapon: 'phantom_saber', glow: '#b04dff' },
  voideye: { skin: '#c9a0ff', shirt: '#2a1d52', pants: '#1b1238', face: 'glow', hat: 'wizard', hatColor: '#2a1d52', glow: '#c64dff', weapon: 'voidwhisper' },
  voidslime: { skin: '#8a6aa8', shirt: '#3a0a8a', pants: '#1b0a40', face: 'glow', hat: 'hood', hatColor: '#3a0a8a', glow: '#c64dff', weapon: 'shadow_talon' },
  imp: { skin: '#d83a2a', shirt: '#5a0a0a', pants: '#2a0505', face: 'angry', hat: 'horns', weapon: 'bloodmoon_edge', glow: '#ff5a3b' },
  hellhound: { skin: '#5a1a14', shirt: '#2a0a0a', pants: '#1a0505', face: 'glow', hat: 'helmet', hatColor: '#3a0a0a', glow: '#ff5a1f', weapon: 'crimson_tyrant', fur: true },
  magmagolem: { skin: '#3a1a14', shirt: '#2a100a', pants: '#1a0805', face: 'glow', glow: '#ff5a1f', rock: '#4a2a20' },
  firespirit: { skin: '#ffb080', shirt: '#c21a0a', pants: '#5a0a0a', face: 'glow', hat: 'wizard', hatColor: '#ff5a1f', glow: '#ff7a2e', weapon: 'sunfang' },
  netherlord: { skin: '#8a1a1a', shirt: '#2a0505', pants: '#1a0202', face: 'glow', hat: 'crown', hatColor: '#ff5a1f', weapon: 'hellfire_reaper', glow: '#ff3b1f', fur: true },
  // Stage 13 — Emerald Jungle
  panther: { skin: '#b87a4a', shirt: '#2f7a3a', pants: '#5a3a1e', face: 'angry', hat: 'bandana', hatColor: '#2fa84a', weapon: 'bamboo_viper', fur: true },
  vineslime: { skin: '#9ae07a', shirt: '#1f6a2a', pants: '#3a2a1a', face: 'glow', hat: 'wizard', hatColor: '#1f8a3a', glow: '#6dff4a', weapon: 'jade_cleaver' },
  junglehunter: { skin: '#c98a5a', shirt: '#3f7a3a', pants: '#5a3a1e', face: 'angry', hat: 'helmet', hatColor: '#2f6a2a', bow: '#6b4a2a' },
  // Stage 14 — Coral Depths
  crab: { skin: '#e8b48a', shirt: '#f4f4f4', pants: '#2f4a8a', face: 'angry', hat: 'bandana', hatColor: '#e0303c', weapon: 'tidebreaker' },
  jelly: { skin: '#bfe0d6', shirt: '#2f86a8', pants: '#1a506a', face: 'glow', hat: 'wizard', hatColor: '#ff7ae0', glow: '#ff7ae0', weapon: 'tsunami_edge' },
  tidegolem: { skin: '#2f86a8', shirt: '#236a88', pants: '#1a506a', face: 'glow', glow: '#5ff0ff', rock: '#3cc3cf' },
  // Stage 15 — Crystal Caverns
  crystalbat: { skin: '#e8d6ff', shirt: '#6a4aa0', pants: '#3a2a6e', face: 'glow', hat: 'wizard', hatColor: '#ff7ae0', glow: '#5ff0ff', weapon: 'amethyst_oath' },
  shardslime: { skin: '#f2d0b0', shirt: '#ff7ae0', pants: '#8a2ab0', face: 'angry', hat: 'helmet', hatColor: '#ff7ae0', weapon: 'sakura_storm', fur: true },
  gemgolem: { skin: '#b35bff', shirt: '#8a3ad8', pants: '#5a1ea8', face: 'glow', glow: '#ff7ae0', rock: '#d6a1ff' },
  crystalqueen: { skin: '#f4e0ff', shirt: '#c64dff', pants: '#6a1ec8', face: 'glow', hat: 'crown', hatColor: '#5ff0ff', glow: '#ff7ae0', weapon: 'amethyst_oath', fur: true },
  // Stage 16 — Storm Peaks
  stormwolf: { skin: '#f2d0b0', shirt: '#56637a', pants: '#3e485c', face: 'angry', hat: 'viking', hatColor: '#ffe23b', weapon: 'stormcaller', fur: true },
  thunderbird: { skin: '#f2d0b0', shirt: '#ffe23b', pants: '#56637a', face: 'glow', hat: 'wizard', hatColor: '#3e485c', glow: '#ffe23b', weapon: 'stormcaller' },
  stormgiant: { skin: '#8a96ac', shirt: '#56637a', pants: '#3e485c', face: 'glow', glow: '#ffe23b', rock: '#a8b4c8' },
  // Stage 17 — Sky Citadel
  skyknight: { skin: '#f5d36b', shirt: '#e8ecf5', pants: '#c6cedf', face: 'angry', hat: 'helmet', hatColor: '#ffd23b', weapon: 'solar_crown' },
  angelarcher: { skin: '#f5d36b', shirt: '#ffffff', pants: '#e8ecf5', face: 'angry', hat: 'crown', hatColor: '#ffd23b', bow: '#ffd23b' },
  cloudspirit: { skin: '#f5d36b', shirt: '#ffffff', pants: '#c6cedf', face: 'smile', hat: 'hood', hatColor: '#ffffff', glow: '#8fe0ff', weapon: 'moonlit_fang' },
  // Stage 18 — Shadow Realm
  shade: { skin: '#3a3350', shirt: '#1c1830', pants: '#120e20', face: 'glow', hat: 'hood', hatColor: '#1c1830', glow: '#8a6aff', weapon: 'shadow_talon' },
  shadowstalker: { skin: '#2a2440', shirt: '#2a2440', pants: '#120e20', face: 'glow', hat: 'bandana', hatColor: '#8a6aff', glow: '#8a6aff', weapon: 'oni_slayer' },
  nightmare: { skin: '#2a2440', shirt: '#1c1830', pants: '#120e20', face: 'glow', hat: 'horns', weapon: 'phantom_saber', glow: '#8a6aff' },
  shadowking: { skin: '#3a2a5a', shirt: '#1c1830', pants: '#120e20', face: 'glow', hat: 'crown', hatColor: '#8a6aff', weapon: 'voidwhisper', glow: '#8a6aff', fur: true },
  // Stage 19 — Dragon's Lair
  drake: { skin: '#ff9a5a', shirt: '#8a1a0a', pants: '#4a2014', face: 'glow', hat: 'horns', hatColor: '#ffb000', glow: '#ff7a1f', weapon: 'sunfang' },
  dragonkin: { skin: '#c8401a', shirt: '#6a3222', pants: '#4a2014', face: 'angry', hat: 'horns', weapon: 'dragon_maw', glow: '#ff7a1f' },
  lavawyrm: { skin: '#c8401a', shirt: '#2a0a05', pants: '#4a1a0a', face: 'angry', hat: 'viking', hatColor: '#ff7a1f', glow: '#ff5a1f', weapon: 'hellfire_reaper', fur: true },
  // Stage 20 — Celestial Summit
  starguard: { skin: '#c3cbff', shirt: '#a3acec', pants: '#838cd0', face: 'glow', glow: '#ffe07a', rock: '#f1eeff' },
  cosmicslime: { skin: '#e8e0ff', shirt: '#8a6aff', pants: '#3a2a8a', face: 'glow', hat: 'hood', hatColor: '#8a6aff', glow: '#ffe07a', weapon: 'starpiercer' },
  celestialseraph: { skin: '#fff3d0', shirt: '#ffffff', pants: '#ffe07a', face: 'glow', hat: 'crown', hatColor: '#ffe07a', bow: '#ffe07a', glow: '#ffe07a' },
  starsovereign: { skin: '#fff3d0', shirt: '#ffe07a', pants: '#c3cbff', face: 'glow', hat: 'crown', hatColor: '#ffffff', weapon: 'celestial_verdict', glow: '#ffe07a', fur: true },
}

/** Where the health plate sits, per body at scale 1. */
const PLATE_HEIGHT = { humanoid: 1.95, golem: 1.95 }

/** Boulder colour for a golem whose look doesn't name one. */
const ROCK = '#9aa0a8'

const eyeMat = (c) => mat(c, { emissive: c, emissiveIntensity: 1.1 })

/** Deterministic 0..1 hash of a string, so the same enemy id always rolls the same variant. */
function hash01(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967296
}

const _tintColor = new Color()
/** Nudges a hex color's hue/lightness a little; small shifts read as "a different person". */
function tint(hex, hue, light) {
  _tintColor.set(hex)
  _tintColor.offsetHSL(hue, 0, light)
  return `#${_tintColor.getHexString()}`
}

/**
 * Same kind, different individual: every enemy id gets its own small nudge to
 * skin/outfit colour, and — for kinds that carry a weapon or a bow — roughly a
 * third swap loadouts, so a pack of goblins doesn't read as one clone repeated.
 */
function useVariant(kind, id, look) {
  return useMemo(() => {
    if (!look.skin && !look.fur) return look
    const h = hash01(`${kind}:${id}`)
    const hue = (h - 0.5) * 0.06
    const light = ((h * 5) % 1 - 0.5) * 0.14
    const next = { ...look }
    if (look.skin) next.skin = tint(look.skin, hue, light)
    if (look.fur) next.fur = tint(look.fur, hue, light * 0.6)
    if (look.shirt) next.shirt = tint(look.shirt, -hue, -light * 0.5)
    if (look.pants) next.pants = tint(look.pants, hue * 0.5, light * 0.4)
    const roll = (h * 13) % 1
    if (look.weapon && !look.bow && roll < 0.34) {
      next.weapon = undefined
      next.bow = tint(look.shirt || look.pants || '#5a3a1e', 0, -0.15)
    } else if (look.bow && !look.weapon && roll < 0.34) {
      next.bow = undefined
      next.weapon = 'iron_blade'
    }
    return next
  }, [kind, id, look])
}

/* ---------------------------------------------------------------------------
 * Bodies. Each faces +Z, has its feet at y=0 and reads `pose`:
 * { walk: 0..1, phase, attack: 0..1 }.
 * ------------------------------------------------------------------------- */

function Bow({ color }) {
  return (
    <group rotation={[0, 0, Math.PI / 2]}>
      <mesh material={mat(color)} castShadow>
        <torusGeometry args={[1.3, 0.13, 6, 14, Math.PI]} />
      </mesh>
      <Block size={[2.6, 0.05, 0.05]} m="#f4f4f4" cast={false} />
    </group>
  )
}

function Humanoid({ look, pose, scale, golem }) {
  const extra = (
    <>
      {look.fur && <Block size={[2.6, 0.7, 1.6]} position={[0, 1.05, 0]} m={golem ? look.rock || ROCK : '#f2ede0'} />}
      {look.ears && (
        <>
          <Block size={[0.7, 0.35, 0.25]} position={[-0.9, 1.7, 0]} m={look.skin} />
          <Block size={[0.7, 0.35, 0.25]} position={[0.9, 1.7, 0]} m={look.skin} />
        </>
      )}
      {golem && (
        <>
          {/* Boulder shoulders and glowing cracks */}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 1.5, 1.1, 0]} material={mat(look.rock || ROCK, { flatShading: true })} castShadow>
              <dodecahedronGeometry args={[0.85, 0]} />
            </mesh>
          ))}
          {look.glow && (
            <>
              <Block size={[0.2, 1.2, 0.05]} position={[-0.4, 0, 0.51]} rotation={[0, 0, 0.4]} m={eyeMat(look.glow)} cast={false} />
              <Block size={[0.2, 0.9, 0.05]} position={[0.5, -0.3, 0.51]} rotation={[0, 0, -0.5]} m={eyeMat(look.glow)} cast={false} />
            </>
          )}
        </>
      )}
    </>
  )
  const held = look.bow ? <Bow color={look.bow} /> : look.weapon ? <WeaponModel weaponId={look.weapon} scale={2.8} /> : null
  return (
    <BlockyCharacter
      scale={BASE * scale}
      skin={look.skin}
      shirt={look.shirt}
      pants={look.pants}
      face={look.face}
      hat={look.hat}
      hatColor={look.hatColor}
      emissive={look.glow}
      pose={pose}
      held={held}
      extra={extra}
    />
  )
}

function Body({ bodyType, look, pose, scale }) {
  return <Humanoid look={look} pose={pose} scale={scale} golem={bodyType === 'golem'} />
}

export function Enemy({ id }) {
  const group = useRef()
  const body = useRef()
  const pose = useRef({ walk: 0, phase: 0, attack: 0 })
  const flash = useRef()
  const st = useRef({
    init: false,
    lastAtk: -1,
    atkAt: -10,
    hitAt: -10,
    deadAt: -10,
    alive: true,
    shown: true,
    /** Where the server has it, eased; the drawn body adds knockback on top. */
    bx: 0,
    bz: 0,
    /** Knockback: unit direction away from the hitter and how hard (decays). */
    kbX: 0,
    kbZ: 0,
    kb: 0,
    crit: false,
  })

  const e0 = getRoom()?.state.enemies.get(id)
  const kind = e0?.kind || 'goblin'
  const elite = Boolean(e0?.elite)
  const type = useMemo(() => enemyStats(kind, elite), [kind, elite])
  const look = useVariant(kind, id, LOOKS[kind] || LOOKS.goblin)
  const bodyType = type.body || 'humanoid'

  useEffect(() => {
    const plate = makeHealthPlate(type.name, type.boss ? 'wl-boss' : elite ? 'wl-elite' : '')
    const off = addAnchor(`enemy-${id}`, {
      el: plate.el,
      getPos: () => (st.current.alive && st.current.shown ? group.current?.position : null),
      offsetY: (PLATE_HEIGHT[bodyType] || 2) * type.scale + 0.4,
      maxDist: 55,
      update: () => {
        const e = getRoom()?.state.enemies.get(id)
        if (e) plate.set(e.hp, e.maxHp, formatNum)
      },
    })
    const unsub = fx.on((t, data) => {
      if (data?.id !== id) return
      if ((t === 'hit' && data.kind === 'enemy') || t === 'kill') {
        const s = st.current
        // Shoved away from the player who landed it.
        let dx = data.x - local.pos.x
        let dz = data.z - local.pos.z
        const len = Math.hypot(dx, dz) || 1
        s.kbX = dx / len
        s.kbZ = dz / len
        if (t === 'hit') {
          s.hitAt = performance.now()
          s.crit = Boolean(data.crit)
          s.kb = Math.min(1.4, s.kb + (data.crit ? 0.95 : 0.6) / Math.max(0.8, type.scale))
        }
      }
    })
    return () => {
      off()
      unsub()
    }
  }, [id, type, bodyType, elite])

  useFrame((state, delta) => {
    const e = getRoom()?.state.enemies.get(id)
    const g = group.current
    if (!e || !g) return
    const s = st.current
    const now = state.clock.elapsedTime

    // Every enemy is mounted from the start; far stages are just hidden. Hidden
    // ones still track their position, so they never slide in when shown.
    // From the lobby the dungeon's enemies stay out of sight: they show once you're inside.
    const shown = useGame.getState().stage > 0 && stageShown(e.stage)
    if (!shown) {
      if (s.shown) g.visible = false
      // Out of sight, it also sits out the scene's per-frame matrix pass.
      pauseMatrices(g, true)
      s.shown = false
      s.init = false
      return
    }
    if (!s.shown) {
      // Coming into view: take the server's state as-is, no death or spawn replay.
      s.shown = true
      pauseMatrices(g, false)
      s.alive = e.alive
      s.deadAt = -10
      if (e.alive) body.current.rotation.x = 0
      g.visible = e.alive
    }

    if (!s.init) {
      g.position.set(e.x, 0, e.z)
      s.bx = e.x
      s.bz = e.z
      s.kb = 0
      s.init = true
    }

    // Death: blown back off its feet away from the killing blow, then sinks away.
    if (!e.alive) {
      if (s.alive) {
        s.alive = false
        s.deadAt = now
        s.dieX = g.position.x
        s.dieZ = g.position.z
        if (!s.kbX && !s.kbZ) {
          s.kbX = -Math.sin(g.rotation.y)
          s.kbZ = -Math.cos(g.rotation.y)
        }
      }
      const t = Math.min(1, (now - s.deadAt) / 0.9)
      const fly = 1 - Math.pow(1 - Math.min(1, t / 0.55), 3)
      const push = 3.2 / Math.max(0.8, type.scale * 0.8)
      g.position.x = s.dieX + s.kbX * fly * push
      g.position.z = s.dieZ + s.kbZ * fly * push
      // A hop up off the ground, then down and through it.
      g.position.y = Math.sin(Math.min(1, t / 0.55) * Math.PI) * 0.9 - Math.max(0, t - 0.55) * Math.max(0, t - 0.55) * 8
      body.current.rotation.x = -Math.min(1, t / 0.45) * 1.5
      body.current.scale.setScalar(1)
      body.current.position.set(0, 0, 0)
      if (flash.current) flash.current.material.opacity = Math.max(0, 0.9 - t * 3)
      g.visible = t < 1
      return
    }
    if (!s.alive) {
      s.alive = true
      g.position.set(e.x, 0, e.z)
      s.bx = e.x
      s.bz = e.z
      s.kb = 0
      s.kbX = 0
      s.kbZ = 0
      body.current.rotation.x = 0
      g.visible = true
      // Pop in on respawn.
      s.spawnAt = now
    }

    // Ease toward the server position, then add the knockback shove on top.
    s.bx += (e.x - s.bx) * Math.min(1, delta * 10)
    s.bz += (e.z - s.bz) * Math.min(1, delta * 10)
    s.kb *= Math.pow(0.004, delta)
    g.position.x = s.bx + s.kbX * s.kb
    g.position.z = s.bz + s.kbZ * s.kb
    g.position.y = 0

    let diff = e.ry - g.rotation.y
    diff = Math.atan2(Math.sin(diff), Math.cos(diff))
    g.rotation.y += diff * Math.min(1, delta * 10)

    if (s.lastAtk !== e.atk) {
      if (s.lastAtk !== -1) s.atkAt = now
      s.lastAtk = e.atk
    }
    const p = pose.current
    // Frozen for a beat while your blade bites (hit-stop), like the player's swing.
    const stopped = performance.now() < local.hitStopUntil && performance.now() - s.hitAt < 140
    if (!stopped) {
      p.walk += ((e.moving ? 1 : 0) - p.walk) * Math.min(1, delta * 8)
      p.phase += delta * 9 * p.walk
    }
    const at = (now - s.atkAt) / 0.45
    p.attack = at > 0 && at < 1 ? at : 0

    // Hit reaction: stagger back and squash, with a white flash; a pop on respawn.
    const ht = (performance.now() - s.hitAt) / (s.crit ? 320 : 240)
    const k = ht < 1 ? 1 - ht : 0
    const spawn = s.spawnAt ? Math.min(1, (now - s.spawnAt) / 0.35) : 1
    const pop = spawn < 1 ? 0.2 + spawn * 0.8 + Math.sin(spawn * Math.PI) * 0.25 : 1
    body.current.scale.set((1 + k * 0.14) * pop, (1 - k * 0.16) * pop, (1 + k * 0.14) * pop)
    // Attacks lunge forward into the swing; hits rock it back on its heels.
    const lunge = p.attack > 0 ? Math.sin(Math.min(1, p.attack * 1.4) * Math.PI) * 0.55 * type.scale : 0
    body.current.position.set(Math.sin(ht * 40) * k * 0.1, 0, lunge)
    body.current.rotation.x = -k * k * (s.crit ? 0.55 : 0.38)
    if (flash.current) {
      flash.current.material.opacity = k * k * (s.crit ? 0.95 : 0.7)
      flash.current.visible = k > 0.01
    }
  })

  return (
    <group ref={group}>
      <group ref={body}>
        <Body bodyType={bodyType} look={look} pose={pose} scale={type.scale} />
        {look.glow && bodyType === 'humanoid' && <Glow position={[0, 3.2 * BASE * type.scale, 0]} color={look.glow} size={4 * type.scale} opacity={0.35} />}
      </group>
      {/* Blob shadow keeps enemies grounded even when far from the shadow camera. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <circleGeometry args={[0.9 * type.scale, 16]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.22} depthWrite={false} />
      </mesh>
      {/* White flash on each hit. */}
      <sprite ref={flash} position={[0, 2.6 * BASE * type.scale, 0]} scale={[4.2 * type.scale, 5.2 * type.scale, 1]} visible={false} renderOrder={3}>
        <spriteMaterial map={glowTexture()} color="#ffffff" transparent opacity={0} blending={AdditiveBlending} depthWrite={false} />
      </sprite>
      {/* Elites stand in a golden aura. */}
      {elite && <Glow position={[0, 0.5, 0]} color="#ffb000" size={4 * type.scale} opacity={0.5} />}
    </group>
  )
}

export default Enemy
