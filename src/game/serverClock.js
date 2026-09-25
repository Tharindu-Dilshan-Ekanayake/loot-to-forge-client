import { getRoom } from '../net/network'

/**
 * The moment of the server's simulation to draw server-driven things (enemies)
 * at: a little behind the newest state, on the server's own clock.
 *
 * Every patch carries the server time of its last simulation step (`state.st`,
 * ms). Positions are played back against those times, so enemies move at the
 * even pace the server moved them, not in the stops and starts of however the
 * patches happened to arrive. The delay adapts to how unevenly they arrive.
 */

/** The server steps its simulation this often. */
export const SERVER_TICK_S = 0.05
const MIN_DELAY_S = 0.08
const MAX_DELAY_S = 0.3
/** The playback clock only chases its target once it's off by more than this. */
const SLACK_S = 0.015

const clock = { offset: null, jitter: 0.04, play: null, lastSt: -1, lastNow: -1 }

/**
 * The server time (seconds) to draw at this frame, or null when the server sends
 * no clock (then callers fall back to easing toward the latest state). Cheap to
 * call from every entity: the work happens once per frame.
 */
export function serverPlayTime(now, delta) {
  if (now === clock.lastNow) return clock.play
  clock.lastNow = now
  const st = getRoom()?.state?.st
  if (!st) {
    clock.play = null
    return null
  }
  if (st !== clock.lastSt) {
    const lag = now - st / 1000
    // A different room (reconnect) restarts its clock: start the estimate over.
    if (clock.offset === null || st < clock.lastSt || Math.abs(lag - clock.offset) > 2) {
      clock.offset = lag
      clock.jitter = 0.04
      clock.play = null
    }
    clock.lastSt = st
    if (lag < clock.offset) clock.offset = lag
    const late = lag - clock.offset
    clock.offset += late * 0.002
    clock.jitter = late > clock.jitter ? late : clock.jitter + (late - clock.jitter) * 0.02
  }
  const delay = Math.min(MAX_DELAY_S, Math.max(MIN_DELAY_S, SERVER_TICK_S + clock.jitter + 0.02))
  const want = now - clock.offset - delay
  if (clock.play === null || Math.abs(want - clock.play) > 0.5) clock.play = want
  else {
    clock.play += delta
    const drift = want - clock.play
    if (Math.abs(drift) > SLACK_S) clock.play += (drift - Math.sign(drift) * SLACK_S) * (1 - Math.exp(-2 * delta))
  }
  return clock.play
}

/** The server time of the newest state (seconds), or 0. */
export const serverNowS = () => (getRoom()?.state?.st || 0) / 1000

/**
 * One entity's recent server positions, played back at `serverPlayTime`.
 * `push` records a new position (stamped with the newest server time); `at`
 * writes where it was at time `t` into `out` ({ x, z }).
 */
export function createTrack() {
  const buf = []
  return {
    reset(x, z, t) {
      buf.length = 0
      buf.push({ t, x, z })
    },
    push(t, x, z) {
      const last = buf[buf.length - 1]
      if (last && last.x === x && last.z === z) return
      // Setting off after standing still: hold the old spot until one step before.
      if (last && t - last.t > SERVER_TICK_S * 2.5) buf.push({ t: t - SERVER_TICK_S, x: last.x, z: last.z })
      buf.push({ t: last && t <= last.t ? last.t + 0.001 : t, x, z })
      if (buf.length > 16) buf.splice(0, buf.length - 16)
    },
    /** Returns false when there's nothing recorded yet. */
    at(t, out, { extrapolate = 0 } = {}) {
      if (!buf.length) return false
      let i = buf.length - 1
      while (i > 0 && buf[i - 1].t > t) i -= 1
      const b = buf[i]
      const a = buf[i - 1]
      if (!a || b.t <= a.t) {
        out.x = b.x
        out.z = b.z
        return true
      }
      const span = b.t - a.t
      // Further than this in one step is a respawn or a shove: jump, don't glide.
      if (Math.hypot(b.x - a.x, b.z - a.z) > 6) {
        const k = t < b.t ? a : b
        out.x = k.x
        out.z = k.z
        return true
      }
      let k = Math.max(0, (t - a.t) / span)
      if (k > 1) k = 1 + Math.min(t - b.t, extrapolate) / span
      out.x = a.x + (b.x - a.x) * k
      out.z = a.z + (b.z - a.z) * k
      return true
    },
  }
}
