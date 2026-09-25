import { useFrame } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Quaternion, Vector3 } from 'three'

import { fallbackLook, skinHeadshot, standInColors } from '../../bloxity/guest'
import { getRoom } from '../../net/network'
import { formatNum } from '../../shared/gameData'
import AvatarBoundary from '../AvatarBoundary'
import { sfx } from '../../audio/sound'
import { fx, local } from '../bus'
import { addAnchor, makeNameTag } from '../labels'
import PlayerAvatar from '../PlayerAvatar'
import { BlockyCharacter } from '../world/props'
import { tierIndexFor } from '../weaponTier'
import WeaponModel from './WeaponModel'

const HEIGHT = 1.8
/**
 * Other players are drawn this far in the past, between the two position
 * updates either side of it. Updates come ~12 times a second, so this leaves a
 * spare one in hand: movement is steady instead of lurching on each update.
 */
const INTERP_DELAY_S = 0.13
/** Update gaps longer than this mean they'd stopped: don't glide across the gap. */
const IDLE_GAP_S = 0.3
/** Footsteps of players this close are heard. */
const STEP_HEAR_DIST = 22
const _target = new Vector3()
const _q = new Quaternion()
const _up = new Vector3(0, 1, 0)

/** Falls back to a blocky body if the Bloxity avatar fails to load. */
function parseAvatar(json) {
  try {
    const v = JSON.parse(json || '{}')
    return { equipped: v.e || null, proportions: v.p || null }
  } catch {
    return { equipped: null, proportions: null }
  }
}

/**
 * Another player in the room. Server positions arrive ~12 times a second; the
 * visual eases toward them every frame so movement stays smooth.
 */
export function RemotePlayer({ id }) {
  const group = useRef()
  const inner = useRef()
  const [look, setLook] = useState(() => {
    const p = getRoom()?.state.players.get(id)
    return { weapon: p?.weapon || '', avatar: p?.avatar || '', bag: p?.bag || '', tier: tierIndexFor(p?.damage), pfp: p?.pfp || '', name: p?.name || '' }
  })
  const motionRef = useRef({ time: 0, speed: 0, grounded: true, maxSpeed: 7, armed: true, attack: 0, skill: null, skillT: 1 })
  const blockyPose = useRef({ walk: 0, attack: 0 })
  const anim = useRef({ lastAtk: -1, lastSkill: -1, swingAt: -10, skillAt: -10, spinUntil: 0, init: false, speed: 0, stepTimer: 0 })
  /** Recent server positions: [{ t, x, y, z }], oldest first. */
  const samples = useRef([])

  // Old clients may send no outfit: give them a stable colourful one, never the bare skin.
  const avatar = useMemo(() => {
    const a = parseAvatar(look.avatar)
    return { ...a, equipped: a.equipped?.skinId ? a.equipped : { ...(a.equipped || {}), ...fallbackLook(look.name || id) } }
  }, [look.avatar, look.name, id])

  const tag = useMemo(() => makeNameTag(), [])
  useEffect(
    () =>
      addAnchor(`player-${id}`, {
        el: tag.el,
        getPos: () => group.current?.position,
        offsetY: HEIGHT + 0.75,
        maxDist: 45,
        update: () => {
          const p = getRoom()?.state.players.get(id)
          if (p) tag.set(p.name, p.damage, formatNum)
        },
      }),
    [id, tag],
  )
  // Their Bloxity picture if they sent one, else the face off their skin.
  useEffect(() => {
    tag.setPfp(look.pfp || skinHeadshot(avatar.equipped?.skinId))
  }, [tag, look.pfp, avatar.equipped])

  useFrame((state, delta) => {
    const p = getRoom()?.state.players.get(id)
    const g = group.current
    if (!p || !g) return
    const now = state.clock.elapsedTime
    const a = anim.current

    const tier = tierIndexFor(p.damage)
    if (p.weapon !== look.weapon || p.avatar !== look.avatar || p.bag !== look.bag || tier !== look.tier || p.pfp !== look.pfp) {
      setLook({ weapon: p.weapon, avatar: p.avatar, bag: p.bag, tier, pfp: p.pfp, name: p.name })
    }

    // Record each new server position, stamped with when it arrived.
    const buf = samples.current
    const last = buf[buf.length - 1]
    const y = p.y - HEIGHT / 2
    if (!last || last.x !== p.x || last.y !== y || last.z !== p.z) {
      // Starting off after standing still: pin the old spot just before this
      // update, so they walk from it at their real pace rather than gliding.
      if (last && now - last.t > IDLE_GAP_S) buf.push({ t: now - 1 / 12, x: last.x, y: last.y, z: last.z })
      buf.push({ t: now, x: p.x, y, z: p.z })
      if (buf.length > 8) buf.splice(0, buf.length - 8)
    }

    // Where they were INTERP_DELAY_S ago, between the two samples around it.
    const at = now - INTERP_DELAY_S
    let i = buf.length - 1
    while (i > 0 && buf[i - 1].t > at) i -= 1
    const b = buf[i]
    const a0 = buf[i - 1]
    let segSpeed = 0
    if (a0 && at >= a0.t && b.t > a0.t) {
      const k = Math.min(1, (at - a0.t) / (b.t - a0.t))
      _target.set(a0.x + (b.x - a0.x) * k, a0.y + (b.y - a0.y) * k, a0.z + (b.z - a0.z) * k)
      segSpeed = Math.hypot(b.x - a0.x, b.z - a0.z) / (b.t - a0.t)
    } else {
      _target.set(b.x, b.y, b.z)
    }
    if (!a.init || g.position.distanceTo(_target) > 12) {
      g.position.copy(_target)
      a.init = true
    } else {
      // A light final ease hides any leftover unevenness in arrival times.
      g.position.lerp(_target, 1 - Math.pow(0.00001, delta))
    }
    // Stride speed eases too, so the walk cycle keeps an even rhythm.
    const wantSpeed = p.anim === 1 ? Math.min(segSpeed, 11) : 0
    a.speed += (wantSpeed - a.speed) * (1 - Math.exp(-10 * delta))

    if (now < a.spinUntil) {
      if (inner.current) inner.current.rotation.y += delta * 19
    } else {
      _q.setFromAxisAngle(_up, p.ry)
      inner.current?.quaternion.slerp(_q, 1 - Math.pow(0.001, delta))
    }

    if (a.lastAtk !== p.atk) {
      const combo = p.atk % 5
      if (a.lastAtk !== -1) {
        a.swingAt = now
        // Their slash shows for everyone nearby, the same arc they see.
        if (local.pos.distanceTo(g.position) < 45) {
          fx.emit('swing', { x: g.position.x, y: g.position.y + HEIGHT / 2, z: g.position.z, ry: p.ry, weaponId: p.weapon, combo })
        }
      }
      a.lastAtk = p.atk
      // Close enough to their real combo: cycle through the five moves.
      motionRef.current.combo = combo
      if (combo === 4 && a.lastAtk !== -1) a.spinUntil = now + 0.34
    }
    if (a.lastSkill !== p.skill) {
      if (a.lastSkill !== -1) a.skillAt = now
      a.lastSkill = p.skill
    }

    const m = motionRef.current
    m.time += delta
    m.speed = a.speed < 0.3 ? 0 : a.speed
    m.grounded = p.anim !== 2
    m.armed = Boolean(p.weapon)
    const swingT = (now - a.swingAt) / 0.34
    m.attack = swingT > 0 && swingT < 1 ? swingT : 0
    m.skillT = Math.min(1, (now - a.skillAt) / 0.6)

    blockyPose.current.walk = Math.min(1, m.speed / 7)

    // Their footsteps, quieter with distance.
    if (m.grounded && m.speed > 1) {
      a.stepTimer -= delta * (m.speed / 7)
      if (a.stepTimer <= 0) {
        a.stepTimer = 0.32
        const d = local.pos.distanceTo(g.position)
        if (d < STEP_HEAR_DIST) sfx('step', 0.6 * (1 - d / STEP_HEAR_DIST))
      }
    }
    blockyPose.current.attack = m.attack
  })

  // Remote skill VFX come from the room's broadcast; remember the key for the pose.
  useEffect(
    () =>
      fx.on((type, data) => {
        if (type === 'skill' && data.by === id) motionRef.current.skill = data.key
      }),
    [id],
  )

  const fallback = (
    <BlockyCharacter
      scale={0.36}
      {...standInColors(avatar.equipped?.skinId)}
      pose={blockyPose}
      held={look.weapon ? <WeaponModel weaponId={look.weapon} scale={2.6} tier={look.tier} /> : null}
    />
  )

  return (
    <group ref={group}>
      <group ref={inner}>
        <AvatarBoundary fallback={fallback}>
          <Suspense fallback={fallback}>
            <PlayerAvatar
              isLocal={false}
              equipped={avatar.equipped}
              proportions={avatar.proportions}
              targetHeight={HEIGHT}
              motionRef={motionRef}
              weaponId={look.weapon}
              weaponTier={look.tier}
              bagId={look.bag}
            />
          </Suspense>
        </AvatarBoundary>
      </group>
    </group>
  )
}

export default RemotePlayer
