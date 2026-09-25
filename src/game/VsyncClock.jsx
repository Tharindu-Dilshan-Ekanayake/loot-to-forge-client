import { addEffect, useThree } from '@react-three/fiber'
import { useLayoutEffect } from 'react'

/** The current frame's requestAnimationFrame timestamp (ms), or null before the first. */
let frameTime = null
addEffect((t) => {
  frameTime = t
})

/**
 * Times every frame from the browser's vsync timestamp instead of performance.now().
 *
 * R3F measures each frame from whenever its callback happens to start, which
 * slips by a few ms whenever a network patch or a React render lands just before
 * it. The world then advances unevenly against the screen's steady refresh: the
 * micro-stutter you see while running. The rAF timestamp is the frame's start
 * and ticks in even steps, so physics, animation and the camera all advance
 * exactly one refresh per frame.
 */
export function VsyncClock() {
  const clock = useThree((s) => s.clock)
  useLayoutEffect(() => {
    const original = clock.getDelta
    clock.getDelta = function getDelta() {
      if (frameTime === null) return original.call(this)
      if (!this.running) {
        this.start()
        this.oldTime = frameTime
        return 0
      }
      // Same time origin as performance.now(); never step backwards.
      const diff = Math.max(0, (frameTime - this.oldTime) / 1000)
      this.oldTime = Math.max(this.oldTime, frameTime)
      this.elapsedTime += diff
      return diff
    }
    return () => {
      clock.getDelta = original
    }
  }, [clock])
  return null
}

export default VsyncClock
