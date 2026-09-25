import { Vector3 } from 'three'

/**
 * Tiny event bus between the network layer and 3D effects (sparks, damage numbers,
 * slash arcs). Effects are fire-and-forget, so they don't belong in React state.
 */
const listeners = new Set()

export const fx = {
  emit(type, data) {
    for (const fn of listeners) fn(type, data)
  },
  on(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
}

/**
 * The local player's live transform and controls, shared with systems that live
 * outside the Player component (targeting, prompts, camera, network).
 */
export const local = {
  pos: new Vector3(0, 1, 12),
  ry: Math.PI,
  ready: false,
  /** Set by Player: (pos: [x,y,z], ry?) => void */
  teleport: null,
  /** One-shot request for the follow camera to swing behind this facing. */
  cameraFacing: null,
  /** A/D (or ←/→) held: +1 turns the camera left, -1 right. Set by Player. */
  turn: 0,
  /** Seconds-since-epoch of the last swing, drives the attack pose. */
  swingAt: 0,
  /** { key, at } of the last skill cast, drives skill poses and VFX. */
  skill: null,
  /** The local avatar's backpack holder (an Object3D); loot flies into it. */
  bag: null,
  /** performance.now() when loot last landed in the bag, for its glow pulse. */
  bagFlashAt: 0,
  /** performance.now() until which the camera shakes, and how hard. */
  shakeUntil: 0,
  shake: 0,
  /** performance.now() until which a landed hit freezes the swing (hit-stop). */
  hitStopUntil: 0,
  /** Degrees of field-of-view kick on a heavy impact; the camera eases it back. */
  punch: 0,
  /**
   * The local avatar's visual root (at the feet). Physics steps at a fixed rate
   * and this is drawn interpolated between steps, so the camera follows it
   * instead of the raw body - otherwise the player judders on 120Hz+ screens.
   */
  visual: null,
}
