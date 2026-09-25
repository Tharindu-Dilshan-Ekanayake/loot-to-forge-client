import { useGame } from '../net/store'

/** Within this distance a drop shows its "E" key and can be picked up. */
export const PICKUP_RADIUS = 3.6

/** Ids of this player's drops close enough to pick up right now. */
export function dropsInReach(x, z) {
  const out = []
  for (const [id, d] of Object.entries(useGame.getState().drops)) {
    if (!d.picking && Math.hypot(x - d.x, z - d.z) <= PICKUP_RADIUS) out.push(id)
  }
  return out
}
