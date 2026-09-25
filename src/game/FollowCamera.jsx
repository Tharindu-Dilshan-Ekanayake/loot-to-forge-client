import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Vector3 } from 'three'

import { useGame } from '../net/store'
import { local } from './bus'
import { PLAYER_HEIGHT } from './Player'
import { FORGE_CAM } from './world/forgeCam'

/** A/D camera turn rate, radians per second. */
const TURN_SPEED = 2.4

/** How high above the player's origin the camera aims. */
const LOOK_HEIGHT = 1.4

const MIN_DISTANCE = 3
const MAX_DISTANCE = 20
const START_DISTANCE = 8

// Pitch limits, in radians. Stops the camera flipping over the top or sinking
// under the track.
const MIN_PITCH = -0.15
const MAX_PITCH = 1.25
const START_PITCH = 0.32

const DRAG_SENSITIVITY = 0.005
const ZOOM_SENSITIVITY = 0.01
/** Touch: a finger drag turns the view a little faster than the mouse; pinch zooms. */
const TOUCH_SENSITIVITY = 0.0075
const PINCH_SENSITIVITY = 0.03

/**
 * How fast the camera's follow point catches up with the player, per second
 * (1/rate is the lag). Tight across the ground so the view feels attached to
 * the character, not towed behind it; softer vertically so jumps, landings and
 * steps don't bob the whole view.
 */
const FOLLOW_RATE_XZ = 16
const FOLLOW_RATE_Y = 7
/** Mouse-wheel zoom glides rather than jumping a notch at a time. */
const ZOOM_RATE = 12

const _desired = new Vector3()
const _target = new Vector3()
const _cineLook = new Vector3()
/** The camera's field of view at rest; impacts kick it wider for a moment. */
const BASE_FOV = 62

/**
 * Third-person orbit camera.
 *
 * Orbits a follow point that eases after the player (tightly across the ground,
 * softer vertically). Right-click drag orbits, the mouse wheel zooms.
 *
 * Reads the Rapier body directly rather than React state - the body is the
 * authoritative transform and updates every physics step, not every render.
 *
 * @param {{ bodyRef: React.MutableRefObject<any> }} props
 */
export function FollowCamera({ bodyRef }) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)

  // Spherical offset from the player. A ref, not state: pointer events write to it
  // every mousemove and the frame loop reads it - re-rendering would be wasteful.
  const orbit = useRef({ yaw: 0, pitch: START_PITCH, distance: START_DISTANCE })
  const lookAt = useRef(new Vector3())
  /** The smoothed point on the player the camera orbits, and the eased zoom. */
  const focus = useRef(new Vector3())
  const zoom = useRef(START_DISTANCE)
  const initialised = useRef(false)

  useEffect(() => {
    const el = gl.domElement
    if (!el) return

    let dragging = false
    let lastX = 0
    let lastY = 0
    /** Fingers on the screen (touch): one drags the view round, two pinch to zoom. */
    const touches = new Map()
    let pinch = 0

    const spread = () => {
      const [a, b] = [...touches.values()]
      return Math.hypot(a.x - b.x, a.y - b.y)
    }

    const onPointerDown = (e) => {
      if (e.pointerType === 'touch') {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
        el.setPointerCapture?.(e.pointerId)
        if (touches.size === 2) pinch = spread()
        return
      }
      if (e.button !== 2) return // right button only
      dragging = true
      lastX = e.clientX
      lastY = e.clientY
      el.setPointerCapture?.(e.pointerId)
    }

    const onPointerMove = (e) => {
      const o = orbit.current
      if (e.pointerType === 'touch') {
        const t = touches.get(e.pointerId)
        if (!t) return
        const dx = e.clientX - t.x
        const dy = e.clientY - t.y
        t.x = e.clientX
        t.y = e.clientY
        if (touches.size === 1) {
          o.yaw -= dx * TOUCH_SENSITIVITY
          o.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, o.pitch + dy * TOUCH_SENSITIVITY))
        } else if (touches.size === 2) {
          const s = spread()
          o.distance = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, o.distance - (s - pinch) * PINCH_SENSITIVITY))
          pinch = s
        }
        return
      }
      if (!dragging) return
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY

      o.yaw -= dx * DRAG_SENSITIVITY
      o.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, o.pitch + dy * DRAG_SENSITIVITY))
    }

    const endDrag = (e) => {
      if (e.pointerType === 'touch') {
        touches.delete(e.pointerId)
        if (touches.size === 2) pinch = spread()
        el.releasePointerCapture?.(e.pointerId)
        return
      }
      if (!dragging) return
      dragging = false
      el.releasePointerCapture?.(e.pointerId)
    }

    const onWheel = (e) => {
      // Without this the page scrolls behind the canvas.
      e.preventDefault()
      const o = orbit.current
      o.distance = Math.min(
        MAX_DISTANCE,
        Math.max(MIN_DISTANCE, o.distance + e.deltaY * ZOOM_SENSITIVITY),
      )
    }

    // Right-dragging otherwise opens the browser context menu mid-orbit.
    const onContextMenu = (e) => e.preventDefault()

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', endDrag)
    el.addEventListener('pointercancel', endDrag)
    el.addEventListener('contextmenu', onContextMenu)
    // passive:false is required for preventDefault() on wheel to take effect.
    el.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', endDrag)
      el.removeEventListener('pointercancel', endDrag)
      el.removeEventListener('contextmenu', onContextMenu)
      el.removeEventListener('wheel', onWheel)
    }
  }, [gl])

  useFrame((state, delta) => {
    const game = useGame.getState()

    // Title screen: a slow orbit over the hub.
    if (game.screen !== 'playing' || !local.ready) {
      const t = state.clock.elapsedTime * 0.06
      _desired.set(Math.sin(t) * 55, 26, Math.cos(t) * 55)
      camera.position.lerp(_desired, 1 - Math.pow(0.05, delta))
      lookAt.current.lerp(_target.set(0, 4, 0), 1 - Math.pow(0.05, delta))
      camera.lookAt(lookAt.current)
      initialised.current = false
      return
    }

    // Forging cinematic: look down into the crucible.
    if (game.forging?.phase === 'melt') {
      _desired.fromArray(FORGE_CAM.position)
      _cineLook.fromArray(FORGE_CAM.target)
      camera.position.lerp(_desired, 1 - Math.pow(0.02, delta))
      lookAt.current.lerp(_cineLook, 1 - Math.pow(0.02, delta))
      camera.lookAt(lookAt.current)
      return
    }

    if (local.cameraFacing !== null) {
      // Swing behind the player after a teleport. yaw puts the camera at
      // (sin, cos) * distance, so "behind" a facing of ry is ry + PI.
      orbit.current.yaw = local.cameraFacing + Math.PI
      local.cameraFacing = null
      initialised.current = false
    }

    // Follow what's drawn (interpolated between physics steps), not the raw body.
    const body = bodyRef?.current
    if (local.visual) {
      local.visual.getWorldPosition(_target)
      _target.y += PLAYER_HEIGHT / 2
    } else {
      const pos = body ? body.translation() : local.pos
      _target.set(pos.x, pos.y, pos.z)
    }

    // A/D turn the view. Positive yaw swings the camera's forward to the left.
    if (local.turn) orbit.current.yaw += local.turn * TURN_SPEED * delta

    const f = focus.current
    if (!initialised.current || f.distanceTo(_target) > 30) {
      // Avoid a long swoop in from wherever the camera was (spawn, teleports).
      f.copy(_target)
      zoom.current = orbit.current.distance
      initialised.current = true
    }
    // 1 - exp(-rate * delta) keeps the easing the same at any framerate.
    const kxz = 1 - Math.exp(-FOLLOW_RATE_XZ * delta)
    const ky = 1 - Math.exp(-FOLLOW_RATE_Y * delta)
    f.x += (_target.x - f.x) * kxz
    f.z += (_target.z - f.z) * kxz
    f.y += (_target.y - f.y) * ky
    zoom.current += (orbit.current.distance - zoom.current) * (1 - Math.exp(-ZOOM_RATE * delta))

    // Spherical -> cartesian. yaw 0 puts the camera behind the player on +Z.
    // Placed exactly on the orbit round the follow point, so the camera and its
    // aim always agree and the player sits steady in frame.
    const { yaw, pitch } = orbit.current
    const distance = zoom.current
    const horizontal = Math.cos(pitch) * distance
    _desired.set(f.x + Math.sin(yaw) * horizontal, f.y + Math.sin(pitch) * distance + LOOK_HEIGHT, f.z + Math.cos(yaw) * horizontal)
    camera.position.copy(_desired)
    lookAt.current.set(f.x, f.y + LOOK_HEIGHT, f.z)

    // Shake on impacts: a decaying wobble layered on top of the smoothed follow.
    const shakeLeft = local.shakeUntil - performance.now()
    if (shakeLeft > 0) {
      const k = local.shake * Math.min(1, shakeLeft / 180)
      const t = state.clock.elapsedTime * 60
      camera.position.x += Math.sin(t * 1.3) * k * 0.5
      camera.position.y += Math.cos(t * 1.7) * k * 0.5
    }
    camera.lookAt(lookAt.current)

    // Heavy hits kick the field of view wider for a beat, then it eases back.
    const fov = BASE_FOV + local.punch
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
    local.punch *= Math.pow(0.0005, delta)
    if (local.punch < 0.02) local.punch = 0
  })

  return null
}

export default FollowCamera
