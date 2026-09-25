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

// Higher = snappier. Framerate-independent via the pow() smoothing below.
const POSITION_SMOOTHING = 4
const LOOK_SMOOTHING = 8

const _desired = new Vector3()
const _target = new Vector3()
const _cineLook = new Vector3()
/** The camera's field of view at rest; impacts kick it wider for a moment. */
const BASE_FOV = 62

/**
 * Third-person orbit camera.
 *
 * Trails the player's rigid body, easing both position and look-at target.
 * Right-click drag orbits, the mouse wheel zooms.
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
  /** The smoothed camera position before shake, so shake never feeds back into the follow. */
  const base = useRef(new Vector3())
  const initialised = useRef(false)

  useEffect(() => {
    const el = gl.domElement
    if (!el) return

    let dragging = false
    let lastX = 0
    let lastY = 0

    const onPointerDown = (e) => {
      if (e.button !== 2) return // right button only
      dragging = true
      lastX = e.clientX
      lastY = e.clientY
      el.setPointerCapture?.(e.pointerId)
    }

    const onPointerMove = (e) => {
      if (!dragging) return
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY

      const o = orbit.current
      o.yaw -= dx * DRAG_SENSITIVITY
      o.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, o.pitch + dy * DRAG_SENSITIVITY))
    }

    const endDrag = (e) => {
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

    // Spherical -> cartesian. yaw 0 puts the camera behind the player on +Z.
    const { yaw, pitch, distance } = orbit.current
    const horizontal = Math.cos(pitch) * distance
    _desired.set(
      _target.x + Math.sin(yaw) * horizontal,
      _target.y + Math.sin(pitch) * distance + LOOK_HEIGHT,
      _target.z + Math.cos(yaw) * horizontal,
    )

    if (!initialised.current || base.current.distanceTo(_desired) > 60) {
      // Avoid a long swoop in from wherever the camera was (spawn, teleports).
      base.current.copy(_desired)
      lookAt.current.copy(_target).setY(_target.y + LOOK_HEIGHT)
      initialised.current = true
    }

    // 1 - pow(x, delta) keeps the easing rate consistent across framerates.
    base.current.lerp(_desired, 1 - Math.pow(0.001, delta * (POSITION_SMOOTHING / 10)))
    camera.position.copy(base.current)

    _target.y += LOOK_HEIGHT
    lookAt.current.lerp(_target, 1 - Math.pow(0.001, delta * (LOOK_SMOOTHING / 10)))

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
