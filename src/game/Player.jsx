import { useFrame, useThree } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, useRapier } from '@react-three/rapier'
import { memo, Suspense, useEffect, useMemo, useRef } from 'react'
import { Quaternion, Vector3 } from 'three'

import { sfx } from '../audio/sound'
import { useBloxity } from '../bloxity/BloxityContext'
import { lookOrGuest, skinHeadshot, standInColors } from '../bloxity/guest'
import { identityAvatarUrl } from '../bloxity/sdk'
import { getRoom, send, travel } from '../net/network'
import { useGame } from '../net/store'
import { DUMMIES, enemyStats, formatNum, gateZ, HUB, skillFor, stageAt, STAGES } from '../shared/gameData'
import AvatarBoundary from './AvatarBoundary'
import { fx, local } from './bus'
import { dropsInReach, PICKUP_RADIUS } from './loot'
import { addAnchor, makeNameTag } from './labels'
import PlayerAvatar from './PlayerAvatar'
import WeaponModel from './entities/WeaponModel'
import { ATTACK_REACH, findTarget } from './targeting'
import { tierIndexFor } from './weaponTier'
import useKeyboard, { isTyping } from './useKeyboard'
import { BlockyCharacter } from './world/props'

// Capsule roughly matching the humanoid. Rapier's capsule args are the half-height of
// the *cylindrical* section plus the radius, so total height = 2*(halfHeight+radius).
const CAPSULE_RADIUS = 0.35
const CAPSULE_HALF_HEIGHT = 0.55
const PLAYER_HEIGHT = 2 * (CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS)

const MOVE_SPEED = 7
const SPRINT_MULTIPLIER = 1.5
const JUMP_IMPULSE = 5.6
/** Extra ray length past the capsule bottom; tolerates small ground gaps. */
const GROUND_RAY_SLACK = 0.15
/** Stops one long Space press from re-triggering the moment the ray re-hits. */
const JUMP_COOLDOWN_S = 0.25
/** Slightly slower than the server's limit so swings are never rejected. */
const ATTACK_COOLDOWN_S = 0.46
const SWING_TIME_S = 0.34
const MOVE_SEND_INTERVAL_S = 1 / 12
/** Clicks closer together than this chain into the next combo move. */
const COMBO_WINDOW_S = 1.1
/** Chop, sweep, uppercut, thrust: see poseWeaponArm in avatarRig.js. */
const COMBO_MOVES = 5
/** The combo's last move spins you round once, blade out. */
const SPIN_MOVE = 4
const SPIN_TIME_S = 0.34
/**
 * Q: turn to face the nearest foe (or straight ahead), leap at it in a high arc
 * with the blade raised, and bring it down on it as you land. The weapon's skill
 * goes off at the landing spot.
 */
const LEAP_TIME_S = 0.5
const LEAP_HEIGHT = 2.6
/** How far Q looks for something to jump at, and how far it leaps with nothing there. */
const LEAP_RANGE = 13
const LEAP_DEFAULT = 7
/** Each connecting swing carries you a step into it. */
const LUNGE_IMPULSE = 2.2
/** How quickly the body reaches (or sheds) walking speed: high, but not instant. */
const ACCEL = 16
/** Auto Fight re-picks its target this often, and picks up loot at most this often. */
const AUTO_PICK_S = 0.2
const AUTO_PICKUP_S = 0.4
/** Standing on (or right at) a training pad you've unlocked trains you automatically. */
const PAD_HALF = [4.8, 4.6]
/** Ledges up to this high (pads, stage steps) are climbed just by walking into them. */
const STEP_MAX = 0.5
const STEP_LIFT = 4.2
const LAST_STAGE = STAGES.length

// Scratch objects, reused each frame so the loop allocates nothing.
const _input = new Vector3()
const _move = new Vector3()
const _camForward = new Vector3()
const _camRight = new Vector3()
const _rayOrigin = new Vector3()
const _targetQuat = new Quaternion()
const _up = new Vector3(0, 1, 0)

/**
 * Module-level on purpose: @react-three/rapier re-applies the body's transform
 * from its Object3D whenever an option prop changes identity. Inline array
 * literals would do that on every re-render and undo a teleport mid-flight.
 */
const SPAWN_POSITION = [HUB.spawn[0], HUB.spawn[1] + 1, HUB.spawn[2]]
const NO_ROTATION = [false, false, false]
const CAPSULE_ARGS = [CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS]

const near = (x, z, pos, r) => Math.hypot(x - pos[0], z - pos[2]) <= r

/** The enemy Q should jump at: the closest one in leaping range, favouring the front. */
function leapTarget(x, z, facing) {
  const room = getRoom()
  if (!room) return null
  const stage = stageAt(x, z)
  const fx0 = Math.sin(facing)
  const fz0 = Math.cos(facing)
  let best = null
  let bestScore = Infinity
  for (const [id, e] of room.state.enemies) {
    if (!e.alive || e.owner !== room.sessionId || e.stage !== stage) continue
    const size = enemyStats(e.kind, e.elite).scale
    const dx = e.x - x
    const dz = e.z - z
    const d = Math.hypot(dx, dz)
    if (d > LEAP_RANGE + size) continue
    const dot = d > 0.01 ? (dx * fx0 + dz * fz0) / d : 1
    const score = d + (1 - dot) * 4
    if (score < bestScore) {
      bestScore = score
      best = { kind: 'enemy', id, x: e.x, z: e.z, size }
    }
  }
  return best
}

/**
 * What Auto Fight goes for next in the stage you're in: the nearest enemy; once
 * they're all down, loot on the ground; then (with room in the bag) the ores.
 * It never walks you through a gate: that stays your call.
 */
function autoPick(pos, game) {
  const room = getRoom()
  const stage = stageAt(pos.x, pos.z)
  if (!room || !stage) return null
  let best = null
  let bestD = Infinity
  const consider = (kind, id, x, z, size) => {
    const d = Math.hypot(x - pos.x, z - pos.z)
    if (d < bestD) {
      bestD = d
      best = { kind, id, x, z, size }
    }
  }
  for (const [id, e] of room.state.enemies) {
    if (e.alive && e.owner === room.sessionId && e.stage === stage) consider('enemy', id, e.x, e.z, enemyStats(e.kind, e.elite).scale)
  }
  if (best) return best
  for (const [id, d] of Object.entries(game.drops)) {
    if (!d.picking && stageAt(d.x, d.z) === stage) consider('drop', id, d.x, d.z, 0)
  }
  if (best) return best
  const p = game.profile
  const cleared = (game.stageRespawn[String(stage)] || 0) > 0
  if (p && cleared && p.ores.length < p.capacity) {
    for (const [id, o] of room.state.ores) {
      if (o.alive && !o.event && o.owner === room.sessionId && o.stage === stage) consider('ore', id, o.x, o.z, 0.8)
    }
  }
  return best
}

/**
 * The local player: a dynamic Rapier capsule with the Bloxity avatar as its mesh.
 * Owns input — movement, attacks, the weapon skill and station interactions — and
 * streams its transform to the server.
 */
export const Player = memo(function Player({ onAvatarReady, bodyRef: externalBodyRef }) {
  const localBodyRef = useRef(null)
  const bodyRef = externalBodyRef || localBodyRef
  const visualRef = useRef(null)
  const keys = useKeyboard()
  const { rapier, world } = useRapier()
  const gl = useThree((s) => s.gl)

  const weaponId = useGame((s) => s.profile?.weaponId)
  const bagId = useGame((s) => s.profile?.bag)
  const weaponTier = useGame((s) => tierIndexFor(s.profile?.damage))
  const extraSkill = useGame((s) => s.profile?.extraSkill)

  const st = useRef({
    jumpCooldown: 0,
    attackQueued: false,
    skillQueued: false,
    interactQueued: false,
    lastAttack: 0,
    combo: 0,
    swingStart: -10,
    swingSpeed: 1,
    flurryLeft: 0,
    spinUntil: 0,
    /** The Q leap in flight: { key, start, dirX, dirZ, dist }. */
    leap: null,
    /** Auto Fight's current pick and when to look again. */
    auto: null,
    autoIn: 0,
    autoPickupIn: 0,
    facing: Math.PI,
    sendTimer: 0,
    lastSent: '',
    stage: 0,
    gateCooldown: 0,
    stepTimer: 0,
    wasGrounded: true,
    promptCheck: 0,
    holdAt: null,
    holdFrames: 0,
  })

  /** Pose for the stand-in body shown while the real avatar downloads. */
  const blockyPose = useRef({ walk: 0, attack: 0 })

  const motionRef = useRef({
    time: 0,
    speed: 0,
    grounded: true,
    maxSpeed: MOVE_SPEED,
    armed: true,
    attack: 0,
    skill: null,
    skillT: 1,
    leap: 0,
  })

  // --- Teleport hook for the network layer and UI ----------------------------
  useEffect(() => {
    local.teleport = (pos, ry = Math.PI) => {
      const body = bodyRef.current
      if (!body) return
      body.setTranslation({ x: pos[0], y: pos[1] + 1, z: pos[2] }, true)
      body.setLinvel({ x: 0, y: 0, z: 0 }, true)
      // Hold the player in place briefly: a freshly mounted arena's colliders
      // only appear a render or two later, and the mount hitch would otherwise
      // drop the player straight through the floor.
      st.current.holdAt = { x: pos[0], y: pos[1] + 1, z: pos[2] }
      st.current.holdFrames = 20
      st.current.facing = ry
      local.cameraFacing = ry
      st.current.gateCooldown = 1.2
      if (visualRef.current) visualRef.current.quaternion.setFromAxisAngle(_up, ry)
    }
    return () => {
      local.teleport = null
      local.ready = false
    }
  }, [bodyRef])

  // --- Getting hit: a shove away from the attacker ---------------------------
  useEffect(
    () =>
      fx.on((type, d) => {
        if (type !== 'hurtLocal') return
        const body = bodyRef.current
        if (!body || d.x === undefined) return
        const p = body.translation()
        let dx = p.x - d.x
        let dz = p.z - d.z
        const len = Math.hypot(dx, dz) || 1
        dx /= len
        dz /= len
        body.applyImpulse({ x: dx * 3.2, y: 1.6, z: dz * 3.2 }, true)
      }),
    [bodyRef],
  )

  // --- One-shot inputs: click to attack, Q skill, E interact ------------------
  useEffect(() => {
    const el = gl.domElement
    let down = null
    const onDown = (e) => {
      if (e.button !== 0) return
      down = { x: e.clientX, y: e.clientY, t: performance.now() }
    }
    const onUp = (e) => {
      if (e.button !== 0 || !down) return
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y)
      if (moved < 8 && performance.now() - down.t < 400) st.current.attackQueued = true
      down = null
    }
    const onKey = (e) => {
      if (isTyping(e) || e.repeat) return
      if (e.code === 'KeyF') st.current.attackQueued = true
      if (e.code === 'KeyQ') st.current.skillQueued = true
      if (e.code === 'KeyE') st.current.interactQueued = true
    }
    const onUiAttack = () => {
      st.current.attackQueued = true
    }
    const onUiSkill = () => {
      st.current.skillQueued = true
    }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerup', onUp)
    window.addEventListener('keydown', onKey)
    window.addEventListener('ltf:attack', onUiAttack)
    window.addEventListener('ltf:skill', onUiSkill)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerup', onUp)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('ltf:attack', onUiAttack)
      window.removeEventListener('ltf:skill', onUiSkill)
    }
  }, [gl])

  // --- Name tag: headshot, name, strength ---------------------------------------
  const { identity, isLoggedIn, avatar: equipped } = useBloxity()
  const tag = useMemo(() => makeNameTag('wl-self'), [])
  useEffect(
    () =>
      addAnchor('local-player', {
        el: tag.el,
        getPos: () => (local.ready ? local.pos : null),
        offsetY: PLAYER_HEIGHT * 0.5 + 0.35,
        maxDist: 40,
        update: () => {
          const p = useGame.getState().profile
          if (p) tag.set(p.name, p.damage, formatNum)
        },
      }),
    [tag],
  )
  // Bloxity profile picture when signed in, else the face off our skin.
  useEffect(() => {
    const pfp = isLoggedIn ? identityAvatarUrl(identity) : null
    tag.setPfp(pfp || skinHeadshot(lookOrGuest(equipped).skinId))
  }, [tag, identity, isLoggedIn, equipped])

  /** Does a short horizontal ray at height `y`, heading along `dir`, hit anything? */
  const probe = (pos, dir, y, reach) => {
    _rayOrigin.set(pos.x, y, pos.z)
    const ray = new rapier.Ray(_rayOrigin, { x: dir.x, y: 0, z: dir.z })
    const hit = world.castRay(ray, CAPSULE_RADIUS + reach, true, undefined, undefined, undefined, bodyRef.current)
    return hit !== null
  }

  const isGrounded = () => {
    const body = bodyRef.current
    if (!body) return false
    const pos = body.translation()
    _rayOrigin.set(pos.x, pos.y, pos.z)
    const ray = new rapier.Ray(_rayOrigin, { x: 0, y: -1, z: 0 })
    const maxDistance = CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS + GROUND_RAY_SLACK
    const hit = world.castRay(ray, maxDistance, true, undefined, undefined, undefined, body)
    return hit !== null && hit.timeOfImpact <= maxDistance
  }

  const doAttack = (now, pos, forced = null) => {
    const s = st.current
    const cd = ATTACK_COOLDOWN_S * (extraSkill === 'swift' ? 0.75 : 1)
    if (now - s.lastAttack < cd) return false
    // Each click in quick succession plays the next move of the combo.
    s.combo = now - s.lastAttack < COMBO_WINDOW_S ? (s.combo + 1) % COMBO_MOVES : 0
    motionRef.current.combo = s.combo
    if (s.combo === SPIN_MOVE) s.spinUntil = now + SPIN_TIME_S
    // The uppercut lifts you off your feet a little.
    if (s.combo === 2 && isGrounded()) bodyRef.current?.applyImpulse({ x: 0, y: 2.6, z: 0 }, true)
    s.lastAttack = now
    s.swingStart = now
    s.swingSpeed = 1
    local.swingAt = now

    const target = forced || findTarget(pos.x, pos.z, s.facing)
    if (target) {
      s.facing = Math.atan2(target.x - pos.x, target.z - pos.z)
      if (!forced && isGrounded()) bodyRef.current?.applyImpulse({ x: Math.sin(s.facing) * LUNGE_IMPULSE, y: 0, z: Math.cos(s.facing) * LUNGE_IMPULSE }, true)
    }
    send('attack', target ? { kind: target.kind, id: target.id } : {})
    fx.emit('swing', { x: pos.x, y: pos.y, z: pos.z, ry: s.facing, weaponId, combo: s.combo })
    sfx('swing')
    return Boolean(target)
  }

  const doSkill = (now, pos) => {
    const skill = weaponId && skillFor(weaponId)
    if (!skill) return
    const game = useGame.getState()
    const cd = game.skillCd
    if (cd && performance.now() < cd.until) {
      sfx('error')
      return
    }
    const s = st.current
    if (s.leap) return
    // Jump at the closest foe in front of you, or straight ahead if there's none.
    const target = leapTarget(pos.x, pos.z, s.facing) || findTarget(pos.x, pos.z, s.facing)
    let dirX = Math.sin(s.facing)
    let dirZ = Math.cos(s.facing)
    let dist = LEAP_DEFAULT
    if (target) {
      const dx = target.x - pos.x
      const dz = target.z - pos.z
      const d = Math.hypot(dx, dz)
      if (d > 0.01) {
        dirX = dx / d
        dirZ = dz / d
      }
      // Land just short of it, so the blade comes down right on top of it.
      dist = Math.min(LEAP_RANGE, Math.max(0.6, d - (1.1 + (target.size ?? 1) * 0.7)))
    }
    s.facing = Math.atan2(dirX, dirZ)
    useGame.setState({ skillCd: { until: performance.now() + skill.cooldown * 1000, total: skill.cooldown } })
    s.leap = { key: skill.key, start: now, dirX, dirZ, dist }
    fx.emit('leapStart', { x: pos.x, y: pos.y, z: pos.z })
    sfx('dash')
  }

  /** The leap's landing: the overhead strike, then the weapon's own skill. */
  const land = (now, pos) => {
    const s = st.current
    const p = s.leap
    s.leap = null
    const body = bodyRef.current
    if (body) {
      const v = body.linvel()
      body.setLinvel({ x: p.dirX * 1.5, y: Math.min(0, v.y), z: p.dirZ * 1.5 }, true)
    }
    send('skill', { dirX: p.dirX, dirZ: p.dirZ, x: pos.x, z: pos.z })
    // The skill's own pose follows the chop.
    local.skill = { key: p.key, at: now + 0.22 }
    fx.emit('skill', { key: p.key, x: pos.x, z: pos.z, dirX: p.dirX, dirZ: p.dirZ, local: true, weaponId })
    // The wind-up happened in the air: start the chop at its strike.
    motionRef.current.combo = 0
    s.swingStart = now - SWING_TIME_S * 0.35
    s.swingSpeed = 1.3
    local.swingAt = now
    fx.emit('slam', { x: pos.x + p.dirX * 1.6, z: pos.z + p.dirZ * 1.6, y: pos.y })
    sfx('slam')
    local.shakeUntil = performance.now() + 280
    local.shake = 0.45
    local.punch = 5
    if (p.key === 'whirlwind') {
      s.spinUntil = now + 0.55
      sfx('whirl')
    } else if (p.key === 'flurry') {
      s.flurryLeft = 3
      s.swingSpeed = 2.4
      sfx('swing')
    }
  }

  const interact = (stationId, pos) => {
    const game = useGame.getState()
    if (stationId === 'pickup') {
      const ids = dropsInReach(pos.x, pos.z)
      if (ids.length) send('pickup', { ids })
      return
    }
    const panel = { forge: 'forge', sell: 'sell', upgrade: 'upgrade', enchant: 'enchant', skillIndex: 'skills' }[stationId]
    if (panel) {
      sfx('open')
      game.openPanel(panel)
    }
  }

  useFrame((state, delta) => {
    const body = bodyRef.current
    if (!body) return
    const s = st.current
    const now = state.clock.elapsedTime
    const game = useGame.getState()
    const busy = Boolean(game.panel || game.forging)

    s.jumpCooldown = Math.max(0, s.jumpCooldown - delta)
    s.gateCooldown = Math.max(0, s.gateCooldown - delta)

    if (s.holdFrames > 0) {
      s.holdFrames -= 1
      body.setTranslation(s.holdAt, true)
      body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    }

    const k = busy ? {} : keys.current
    const grounded = isGrounded()
    const pos = body.translation()
    const linvel = body.linvel()

    // A landed hit freezes the swing for a few frames: the blade "bites".
    if (performance.now() < local.hitStopUntil) s.swingStart += delta

    // --- Auto Fight: pick what to go for --------------------------------------------
    const autoOn = game.autoAttack && !busy
    s.autoIn -= delta
    if (!autoOn) s.auto = null
    else if (s.autoIn <= 0) {
      s.autoIn = AUTO_PICK_S
      s.auto = autoPick(pos, game)
    }

    // --- Movement ------------------------------------------------------------------
    // W/S walk along the view; A/D turn the camera (FollowCamera) instead of strafing.
    local.turn = (k.left ? 1 : 0) - (k.right ? 1 : 0)
    _input.set(0, 0, (k.backward ? 1 : 0) - (k.forward ? 1 : 0))
    let speed = MOVE_SPEED * (k.sprint ? SPRINT_MULTIPLIER : 1)
    let moving = false

    if (_input.lengthSq() > 0) {
      _input.normalize()
      state.camera.getWorldDirection(_camForward)
      _camForward.y = 0
      _camForward.normalize()
      _camRight.crossVectors(_camForward, _up).normalize()
      _move
        .set(0, 0, 0)
        .addScaledVector(_camForward, -_input.z)
        .addScaledVector(_camRight, _input.x)
        .normalize()
      moving = true
    } else if (s.auto) {
      // Auto Fight walks over to its target (running when it's far) and stops in reach.
      const a = s.auto
      const dx = a.x - pos.x
      const dz = a.z - pos.z
      const d = Math.hypot(dx, dz)
      const stopAt = a.kind === 'drop' ? PICKUP_RADIUS - 1 : ATTACK_REACH - 1.4 + a.size
      if (d > stopAt) {
        _move.set(dx / d, 0, dz / d)
        if (d > 9) speed = MOVE_SPEED * SPRINT_MULTIPLIER
        moving = true
      } else if (now - s.swingStart > SWING_TIME_S) {
        s.facing = Math.atan2(dx, dz)
      }
    }

    if (s.leap) {
      // Q in flight: a scripted arc from where you took off to the landing spot.
      const L = s.leap
      const t = Math.min(1, (now - L.start) / LEAP_TIME_S)
      const vh = L.dist / LEAP_TIME_S
      const vy = (LEAP_HEIGHT * 4 * (1 - 2 * t)) / LEAP_TIME_S
      body.setLinvel({ x: L.dirX * vh, y: vy, z: L.dirZ * vh }, true)
      s.facing = Math.atan2(L.dirX, L.dirZ)
    } else {
      // Ease toward the wanted velocity rather than snapping to it: starts, stops
      // and knockback all read smoother.
      const blend = 1 - Math.exp(-ACCEL * delta)
      const wantX = moving ? _move.x * speed : 0
      const wantZ = moving ? _move.z * speed : 0
      let vy = linvel.y
      // Step up: something at the ankles but clear at step height is a ledge to climb.
      if (moving && grounded) {
        const feet = pos.y - (CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS)
        if (probe(pos, _move, feet + 0.05, 0.35) && !probe(pos, _move, feet + STEP_MAX + 0.05, 0.45)) vy = Math.max(vy, STEP_LIFT)
      }
      body.setLinvel({ x: linvel.x + (wantX - linvel.x) * blend, y: vy, z: linvel.z + (wantZ - linvel.z) * blend }, true)
      // Face travel, unless a swing is locking the facing toward a target.
      if (moving && now - s.swingStart > SWING_TIME_S) s.facing = Math.atan2(_move.x, _move.z)
    }

    if (k.jump && s.jumpCooldown === 0 && grounded) {
      body.applyImpulse({ x: 0, y: JUMP_IMPULSE, z: 0 }, true)
      s.jumpCooldown = JUMP_COOLDOWN_S
      sfx('jump')
    }

    // --- Facing (with whirlwind spin) --------------------------------------------
    if (visualRef.current) {
      if (now < s.spinUntil) {
        visualRef.current.rotation.y += delta * 26
      } else {
        _targetQuat.setFromAxisAngle(_up, s.facing)
        visualRef.current.quaternion.slerp(_targetQuat, 1 - Math.pow(0.0005, delta))
      }
    }

    // --- Combat --------------------------------------------------------------------
    if (!busy) {
      if (s.leap) {
        // No swinging mid-air: the leap ends in its own strike.
      } else if (s.attackQueued) doAttack(now, pos)
      else if (s.onPad) doAttack(now, pos, { kind: 'dummy', id: s.onPad.id, x: s.onPad.pos[0], z: s.onPad.pos[2] })
      else if (game.autoAttack && findTarget(pos.x, pos.z, s.facing)) doAttack(now, pos)
      if (s.skillQueued) doSkill(now, pos)
      // Auto Fight throws Q at any enemy in leaping range as soon as it's ready.
      else if (autoOn && s.auto?.kind === 'enemy' && !s.leap && weaponId) {
        const cd = game.skillCd
        const d = Math.hypot(s.auto.x - pos.x, s.auto.z - pos.z)
        if ((!cd || performance.now() >= cd.until) && d <= LEAP_RANGE) doSkill(now, pos)
      }
      // ...and scoops up loot it walks onto.
      s.autoPickupIn -= delta
      if (autoOn && s.autoPickupIn <= 0 && stageAt(pos.x, pos.z) > 0) {
        const ids = dropsInReach(pos.x, pos.z)
        if (ids.length) {
          s.autoPickupIn = AUTO_PICKUP_S
          send('pickup', { ids })
        }
      }
    }
    s.attackQueued = false
    s.skillQueued = false
    if (s.leap && now - s.leap.start >= LEAP_TIME_S) land(now, pos)

    if (s.flurryLeft > 0 && now - s.swingStart > 0.14) {
      s.flurryLeft -= 1
      if (s.flurryLeft > 0) {
        s.swingStart = now
        sfx('swing')
      }
    }

    // --- Interactions, portals and gates -------------------------------------------
    s.promptCheck -= delta
    if (s.promptCheck <= 0) {
      s.promptCheck = 0.15
      let prompt = null
      const here = stageAt(pos.x, pos.z)
      if (here === 0) {
        for (const [id, station] of Object.entries(HUB.stations)) {
          if (near(pos.x, pos.z, station.pos, station.radius)) prompt = id
        }
      } else if (dropsInReach(pos.x, pos.z).length) {
        prompt = 'pickup'
      }
      // On an unlocked training pad, swings come by themselves.
      const rebirths = game.profile?.rebirths ?? 0
      s.onPad =
        here === 0
          ? DUMMIES.find(
              (d) => d.theme && rebirths >= d.rebirths && Math.abs(pos.x - (d.pos[0] - 0.85)) < PAD_HALF[0] && Math.abs(pos.z - d.pos[2]) < PAD_HALF[1],
            ) || null
          : null
      if (prompt !== game.prompt) useGame.setState({ prompt })
    }
    if (s.interactQueued && game.prompt && !busy) interact(game.prompt, pos)
    s.interactQueued = false

    // The dungeon is walked, not teleported: only the Frostbound Tower and the
    // portal at the very end of the last stage move you.
    if (s.gateCooldown === 0 && !busy) {
      const stageId = stageAt(pos.x, pos.z)
      if (stageId === 0 && near(pos.x, pos.z, HUB.tower.pos, HUB.tower.radius)) {
        s.gateCooldown = 1.5
        if ((game.profile?.rebirths ?? 0) >= HUB.tower.rebirths) travel(HUB.tower.stage)
        else {
          game.toast(`Frostbound Tower requires ${HUB.tower.rebirths} rebirths!`, 'error')
          sfx('error')
        }
      } else if (
        stageId === LAST_STAGE &&
        (game.stageRespawn[String(LAST_STAGE)] || 0) > 0 &&
        near(pos.x, pos.z, [0, 0, gateZ(LAST_STAGE) + 2.5], 4)
      ) {
        s.gateCooldown = 1.5
        travel(0)
      }
    }

    // Fell off the world: back to the start of wherever you are.
    if (pos.y < -40) local.teleport?.(HUB.spawn)

    // --- Stage tracking ----------------------------------------------------------
    const stageNow = stageAt(pos.x, pos.z)
    if (stageNow !== s.stage) {
      // Only heading deeper announces the stage; walking back is quiet.
      if (stageNow > s.stage) fx.emit('enterStage', { stage: stageNow })
      s.stage = stageNow
      if (stageNow !== game.stage) useGame.setState({ stage: stageNow })
    }

    // --- Publish -----------------------------------------------------------------
    local.visual = visualRef.current
    local.pos.set(pos.x, pos.y, pos.z)
    local.ry = s.facing
    local.ready = true

    const vel = body.linvel()
    const horiz = Math.hypot(vel.x, vel.z)
    const motion = motionRef.current
    motion.time += delta
    motion.speed = horiz
    motion.grounded = grounded
    motion.maxSpeed = speed
    motion.armed = Boolean(weaponId)
    const swingT = ((now - s.swingStart) / SWING_TIME_S) * s.swingSpeed
    motion.attack = swingT > 0 && swingT < 1 ? swingT : 0
    blockyPose.current.walk = Math.min(1, horiz / MOVE_SPEED)
    blockyPose.current.attack = motion.attack
    const sk = local.skill && now >= local.skill.at ? local.skill : null
    motion.skill = sk?.key ?? null
    motion.skillT = sk ? Math.min(1, (now - sk.at) / 0.6) : 1
    motion.leap = s.leap ? Math.min(1, (now - s.leap.start) / LEAP_TIME_S) : 0

    // Footsteps and landing.
    if (grounded && horiz > 1) {
      s.stepTimer -= delta * (horiz / MOVE_SPEED)
      if (s.stepTimer <= 0) {
        s.stepTimer = 0.32
        sfx('step')
      }
    }
    s.wasGrounded = grounded

    s.sendTimer -= delta
    if (s.sendTimer <= 0 && getRoom()) {
      s.sendTimer = MOVE_SEND_INTERVAL_S
      const anim = !grounded ? 2 : horiz > 0.5 ? 1 : 0
      const msg = { x: +pos.x.toFixed(2), y: +pos.y.toFixed(2), z: +pos.z.toFixed(2), ry: +s.facing.toFixed(2), anim }
      const key = `${msg.x}|${msg.y}|${msg.z}|${msg.ry}|${anim}`
      if (key !== s.lastSent) {
        s.lastSent = key
        send('move', msg)
      }
    }
  })

  const standIn = (
    <BlockyCharacter
      scale={0.36}
      {...standInColors(lookOrGuest(equipped).skinId)}
      pose={blockyPose}
      held={weaponId ? <WeaponModel weaponId={weaponId} scale={2.6} tier={weaponTier} /> : null}
    />
  )

  return (
    <RigidBody
      ref={bodyRef}
      position={SPAWN_POSITION}
      colliders={false}
      mass={1}
      enabledRotations={NO_ROTATION}
      friction={0.2}
      linearDamping={0.1}
      ccd
      name="player"
    >
      <CapsuleCollider args={CAPSULE_ARGS} />
      {/* Avatar origin is at the feet; the capsule origin is at its centre. */}
      <group ref={visualRef} position={[0, -PLAYER_HEIGHT / 2, 0]} rotation={[0, Math.PI, 0]}>
        {/* The avatar comes from Bloxity's CDN. Only it waits on the download (or
            fails): the body, controls and camera work from the first frame, with a
            stand-in figure until the real avatar arrives. */}
        <AvatarBoundary fallback={standIn}>
          <Suspense fallback={standIn}>
            <PlayerAvatar
              onReady={onAvatarReady}
              targetHeight={PLAYER_HEIGHT}
              motionRef={motionRef}
              weaponId={weaponId}
              weaponTier={weaponTier}
              bagId={bagId}
            />
          </Suspense>
        </AvatarBoundary>
      </group>
    </RigidBody>
  )
})

export { PLAYER_HEIGHT }
export default Player
