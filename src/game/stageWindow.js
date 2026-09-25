import { useGame } from '../net/store'

/**
 * Is `stageId` drawn right now? The stage behind you, yours and the two ahead
 * (seen through open gates); from the lobby, Stages 1–2.
 *
 * Everything in the dungeon is mounted once and only shown or hidden with this,
 * so walking between stages never builds anything mid-stride.
 */
export function stageShown(stageId) {
  const s = useGame.getState().stage
  return stageId >= Math.max(1, s - 1) && stageId <= Math.max(2, s + 2)
}

/**
 * Pauses (or resumes) the scene's per-frame matrix pass for `obj` and everything
 * under it. three.js recomputes every object's matrices every frame, visible or
 * not; with every stage, enemy and ore mounted at once that was a large share of
 * each frame. A paused subtree keeps its last matrices, and when resumed the
 * next pass brings it all up to date before it's drawn.
 */
export function pauseMatrices(obj, paused) {
  if (!obj.__pausable) {
    const base = obj.updateMatrixWorld
    obj.updateMatrixWorld = function updateMatrixWorld(force) {
      if (!this.__matricesPaused) base.call(this, force)
    }
    obj.__pausable = true
  }
  obj.__matricesPaused = paused
}
