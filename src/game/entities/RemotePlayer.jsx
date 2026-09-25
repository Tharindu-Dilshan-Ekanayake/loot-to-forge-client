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
import { surfaceAt } from '../surface'
import { BlockyCharacter } from '../world/props'
import { tierIndexFor } from '../weaponTier'
import WeaponModel from './WeaponModel'

const HEIGHT = 1.8
/** How often their client sends its position (Player.jsx). */
const SEND_INTERVAL_S = 1 / 20
/**
 * Other players are drawn a little in the past, between the two updates either
 * side of that moment, timed by *their* clock (each update carries it). The
 * delay adapts to how unevenly their updates reach us: just enough that the
 * next one has nearly always arrived before it's needed.
 */
const MIN_DELAY_S = 0.08
const MAX_DELAY_S = 0.35
/** Headroom on top of the worst lateness seen recently. */
const DELAY_MARGIN_S = 0.02
/** If the next update is late anyway, carry on at their last pace this long, then wait. */
const MAX_EXTRAPOLATE_S = 0.1
/** A gap longer than this between updates means they'd stood still: don't glide across it. */
const IDLE_GAP_S = 0.25
/** Further than this between two updates is a teleport (portal, respawn): jump, don't slide. */
const TELEPORT_DIST = 6
/**
 * The playback clock only chases its target once it's off by more than this,
 * so in the ordinary run of things it ticks at exactly our frame rate.
 */
const CLOCK_SLACK_S = 0.015
/** How quickly a correction (a late update landing mid-guess) is eased out, per second. */
const CORRECT_RATE = 10
const MAX_SAMPLES = 24
/** Footsteps of players this close are heard. */
const STEP_HEAR_DIST = 22
const _target = new Vector3()
const _was = new Vector3()
const _q = new Quaternion()
const _up = new Vector3(0, 1, 0)
/** playbackAt's extra results, reused so the frame loop allocates nothing. */
const _info = { speed: 0, ry: 0, anim: 0, snap: false }

/** From angle `a` toward `b` by `k`, the short way round. */
function lerpAngle(a, b, k) {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  else if (d < -Math.PI) d += Math.PI * 2
  return a + d * k
}

/**
 * Where the recorded updates put them at moment `at` (their clock): between the
 * two updates either side, or briefly carried on past the newest. Writes the
 * spot to `out`; pace, facing and animation state land in `_info`.
 */
function playbackAt(buf, at, out) {
  let i = buf.length - 1
  while (i > 0 && buf[i - 1].t > at) i -= 1
  const b = buf[i]
  const a0 = buf[i - 1]
  _info.speed = 0
  _info.ry = b.ry
  _info.anim = b.anim
  _info.snap = false
  if (!a0 || b.t <= a0.t) {
    out.set(b.x, b.y, b.z)
    return _info
  }
  const span = b.t - a0.t
  const jump = Math.hypot(b.x - a0.x, b.y - a0.y, b.z - a0.z) > TELEPORT_DIST
  let k = Math.max(0, (at - a0.t) / span)
  if (k > 1) {
    // Past the newest update: carry on at their last pace for a moment (unless
    // they were stopping), then wait for the next.
    k = jump || b.anim === 0 ? 1 : 1 + Math.min(at - b.t, MAX_EXTRAPOLATE_S) / span
  }
  if (jump) {
    k = k < 1 ? 0 : 1
    _info.snap = k === 1
  } else _info.speed = Math.hypot(b.x - a0.x, b.z - a0.z) / span
  out.set(a0.x + (b.x - a0.x) * k, a0.y + (b.y - a0.y) * k, a0.z + (b.z - a0.z) * k)
  _info.ry = lerpAngle(a0.ry, b.ry, Math.min(1, k))
  return _info
}

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
 * Another player in the room. Their position arrives ~20 times a second, stamped
 * with their own clock, and is played back a moment behind on that clock so the
 * walk is as even as it was on their screen.
 */
export function RemotePlayer({ id }) {
  const group = useRef()
  const inner = useRef()
  const [look, setLook] = useState(() => {
    const p = getRoom()?.state.players.get(id)
    return { weapon: p?.weapon || '', avatar: p?.avatar || '', bag: p?.bag || '', tier: tierIndexFor(p?.damage), pfp: p?.pfp || '', name: p?.name || '' }
  })
  const motionRef = useRef({ time: 0, speed: 0, grounded: true, maxSpeed: 7, armed: true, attack: 0, skill: null, skillT: 1, leap: 0 })
  const blockyPose = useRef({ walk: 0, attack: 0 })
  const anim = useRef({
    lastAtk: -1,
    lastSkill: -1,
    lastLeap: -1,
    swingAt: -10,
    swingSpeed: 1,
    skillAt: -10,
    skillKey: null,
    leapAt: -10,
    spinUntil: 0,
    init: false,
    speed: 0,
    stepTimer: 0,
  })
  /**
   * Playback clock. `offset` maps their clock onto ours (the quickest any update
   * has taken to arrive), `jitter` how much later than that they tend to come,
   * and `play` is the moment of theirs being drawn now.
   */
  const clock = useRef({ clocked: false, offset: null, jitter: 0.05, play: null })
  /** Recent updates: [{ t, stamp, x, y, z, ry, anim }], oldest first, `t` on their clock. */
  const samples = useRef([])
  /**
   * What was drawn last frame (moment and spot), and how far the drawn body is
   * off the played-back path while a correction eases out.
   */
  const drawn = useRef({ at: null, spot: new Vector3(), off: new Vector3() })

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

    // --- Record each new update ------------------------------------------------
    const buf = samples.current
    const c = clock.current
    const d = drawn.current
    const y = p.y - HEIGHT / 2
    // Their clock at that spot, in seconds; 0 from a client too old to send one.
    const stamp = p.mt ? p.mt / 1000 : 0
    let last = buf[buf.length - 1]
    if (stamp && !c.clocked) {
      // First update with a clock (or they just started moving after joining):
      // rebase onto their timeline, keeping only where they stood.
      c.clocked = true
      c.offset = null
      c.play = null
      d.at = null
      buf.length = 0
      if (last) buf.push((last = { ...last, t: stamp - SEND_INTERVAL_S }))
    }
    const fresh = stamp ? !last || stamp !== last.stamp : !last || last.x !== p.x || last.y !== y || last.z !== p.z || last.ry !== p.ry || last.anim !== p.anim
    const moved = last && (last.x !== p.x || last.y !== y || last.z !== p.z)
    const recorded = Boolean(fresh || moved)
    if (recorded) {
      // No new stamp but a new spot: the server moved them (a respawn).
      let t = !stamp ? now : fresh ? stamp : last.t + 0.001
      if (last && t <= last.t) t = last.t + 0.001
      if (fresh) {
        // How late this one is against the quickest seen. The quickest sets the
        // clock mapping; the recent worst sets how far behind to play.
        const lag = now - t
        if (c.offset === null || lag < c.offset) c.offset = lag
        const late = lag - c.offset
        c.offset += late * 0.002 // follows slow drift between the two clocks
        c.jitter = late > c.jitter ? late : c.jitter + (late - c.jitter) * 0.02
        // Arrival times say nothing about lateness: keep the old fixed margin.
        if (!stamp) c.jitter = Math.max(c.jitter, 0.06)
      }
      // Starting off after standing still (their client sends nothing while
      // idle): pin the old spot just before this update, so they walk from it at
      // their real pace rather than gliding. A gap mid-run is just lost updates.
      if (last && t - last.t > IDLE_GAP_S && last.anim === 0) buf.push({ ...last, t: t - SEND_INTERVAL_S })
      buf.push({ t, stamp, x: p.x, y, z: p.z, ry: p.ry, anim: p.anim })
      if (buf.length > MAX_SAMPLES) buf.splice(0, buf.length - MAX_SAMPLES)
    }

    // --- Play back --------------------------------------------------------------
    // The moment of theirs to draw. It ticks at our frame rate and is only nudged
    // once it drifts off target, so a change of estimate never makes them lurch.
    if (c.offset !== null) {
      const delay = Math.min(MAX_DELAY_S, Math.max(MIN_DELAY_S, SEND_INTERVAL_S + c.jitter + DELAY_MARGIN_S))
      const want = now - c.offset - delay
      if (c.play === null || Math.abs(want - c.play) > 0.5) c.play = want
      else {
        c.play += delta
        const drift = want - c.play
        if (Math.abs(drift) > CLOCK_SLACK_S) c.play += (drift - Math.sign(drift) * CLOCK_SLACK_S) * (1 - Math.exp(-2 * delta))
      }
    }
    const at = c.play ?? now
    // A new update can revise the moment drawn last frame (it was a guess past
    // the newest one). Keep what's on screen and ease the difference out, rather
    // than jumping.
    if (recorded && d.at !== null) {
      playbackAt(buf, d.at, _was)
      d.off.add(d.spot).sub(_was)
    }
    const info = playbackAt(buf, at, _target)
    const segSpeed = info.speed
    const ry = info.ry
    const playAnim = info.anim
    if (!a.init || info.snap || d.off.lengthSq() > TELEPORT_DIST * TELEPORT_DIST) {
      d.off.set(0, 0, 0)
      a.init = true
    } else d.off.multiplyScalar(Math.exp(-CORRECT_RATE * delta))
    // Exactly on the played-back path otherwise: no smoothing lag that would
    // change with the frame time and make the pace wobble.
    g.position.copy(_target).add(d.off)
    d.at = at
    d.spot.copy(_target)
    // Stride speed eases too, so the walk cycle keeps an even rhythm.
    const wantSpeed = playAnim === 1 ? Math.min(segSpeed, 11) : 0
    a.speed += (wantSpeed - a.speed) * (1 - Math.exp(-10 * delta))

    if (a.spinPending) {
      a.spinPending = false
      a.spinUntil = now + 0.77
    }
    if (now < a.spinUntil) {
      if (inner.current) inner.current.rotation.y += delta * 19
    } else {
      _q.setFromAxisAngle(_up, ry)
      inner.current?.quaternion.slerp(_q, 1 - Math.pow(0.001, delta))
    }

    // A counter the server hasn't set yet reads as 0.
    const atkNow = p.atk | 0
    const skillNow = p.skill | 0
    const leapNow = p.leap | 0
    if (a.lastLeap !== leapNow) {
      // Their Q take-off: blade up, arcing through the air (the arc itself comes
      // from their position updates).
      if (a.lastLeap !== -1) {
        a.leapAt = now
        if (local.pos.distanceTo(g.position) < 45) fx.emit('leapStart', { x: g.position.x, y: g.position.y + HEIGHT / 2, z: g.position.z })
      }
      a.lastLeap = leapNow
    }
    if (a.lastAtk !== atkNow) {
      // The same move of the combo they played.
      const combo = (p.combo | 0) % 5
      const seen = a.lastAtk !== -1
      if (seen) {
        a.swingAt = now
        a.swingSpeed = 1
        // Their slash shows for everyone nearby, the same arc they see.
        if (local.pos.distanceTo(g.position) < 45) {
          fx.emit('swing', { x: g.position.x, y: g.position.y + HEIGHT / 2, z: g.position.z, ry: p.ry, weaponId: p.weapon, combo })
        }
      }
      a.lastAtk = atkNow
      // Close enough to their real combo: cycle through the five moves.
      motionRef.current.combo = combo
      if (combo === 4 && seen) a.spinUntil = now + 0.34
    }
    if (a.lastSkill !== skillNow) {
      if (a.lastSkill !== -1) {
        // The landing: the chop comes down, then the weapon's skill pose, as they saw it.
        a.leapAt = -10
        a.swingAt = now - 0.4 * 0.35
        a.swingSpeed = 1.3
        motionRef.current.combo = 0
        a.skillAt = now + 0.22
      }
      a.lastSkill = skillNow
    }

    const m = motionRef.current
    m.time += delta
    m.speed = a.speed < 0.3 ? 0 : a.speed
    m.grounded = playAnim !== 2
    m.armed = Boolean(p.weapon)
    const swingT = ((now - a.swingAt) / 0.4) * a.swingSpeed
    m.attack = swingT > 0 && swingT < 1 ? swingT : 0
    m.skill = now >= a.skillAt ? a.skillKey : null
    m.skillT = now >= a.skillAt ? Math.min(1, (now - a.skillAt) / 0.6) : 1
    const leapT = (now - a.leapAt) / 0.5
    m.leap = leapT > 0 && leapT < 1 ? leapT : 0

    blockyPose.current.walk = Math.min(1, m.speed / 7)

    // Their footsteps, quieter with distance.
    if (m.grounded && m.speed > 1) {
      a.stepTimer -= delta * (m.speed / 7)
      if (a.stepTimer <= 0) {
        a.stepTimer = 0.32
        const d = local.pos.distanceTo(g.position)
        if (d < STEP_HEAR_DIST) sfx('step', 0.6 * (1 - d / STEP_HEAR_DIST), surfaceAt(g.position.x, g.position.z))
      }
    }
    blockyPose.current.attack = m.attack
  })

  // Remote skill VFX come from the room's broadcast; remember the key for the pose.
  useEffect(
    () =>
      fx.on((type, data) => {
        if (type !== 'skill' || data.by !== id) return
        anim.current.skillKey = data.key
        // Whirlwind spins them round, as it does for the caster.
        if (data.key === 'whirlwind') anim.current.spinPending = true
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
