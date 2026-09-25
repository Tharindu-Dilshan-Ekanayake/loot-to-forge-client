import { getRoom } from '../net/network'
import { useGame } from '../net/store'
import { DUMMIES, enemyStats } from '../shared/gameData'

export const ATTACK_REACH = 5.2

/**
 * Picks what a swing should hit: the closest enemy, ore or training dummy in reach,
 * favouring whatever is in front of the player. Returns null when nothing is close.
 */
export function findTarget(x, z, facing) {
  const room = getRoom()
  if (!room) return null
  const fx = Math.sin(facing)
  const fz = Math.cos(facing)
  let best = null
  let bestScore = Infinity

  const consider = (kind, id, tx, tz, size) => {
    const dx = tx - x
    const dz = tz - z
    const d = Math.hypot(dx, dz)
    if (d > ATTACK_REACH + size) return
    // Behind the player costs extra distance, so you hit what you're facing.
    const dot = d > 0.01 ? (dx * fx + dz * fz) / d : 1
    const score = d - size + (1 - dot) * 1.8 + (kind === 'dummy' ? 0.5 : 0)
    if (score < bestScore) {
      bestScore = score
      best = { kind, id, x: tx, z: tz }
    }
  }

  // Only our own copy of the dungeon can be hit.
  for (const [id, e] of room.state.enemies) {
    if (e.alive && e.owner === room.sessionId) consider('enemy', id, e.x, e.z, enemyStats(e.kind, e.elite).scale)
  }
  // Caged ore nodes can't be hit until their stage is cleared.
  const respawn = useGame.getState().stageRespawn
  for (const [id, o] of room.state.ores) {
    if (o.alive && (o.event || o.owner === room.sessionId) && (respawn[String(o.stage)] || 0) > 0) consider('ore', id, o.x, o.z, o.event ? 2.2 : 0.8)
  }
  for (const d of DUMMIES) consider('dummy', d.id, d.pos[0], d.pos[2], 0.8)
  return best
}
