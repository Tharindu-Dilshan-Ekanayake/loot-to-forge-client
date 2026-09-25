import { useCallback, useLayoutEffect, useRef } from 'react'
import { Matrix4 } from 'three'

import { buildMerged, mergeableMesh, planMerge } from './meshMerge'

const _inv = new Matrix4()
const _rel = new Matrix4()

/** Meshes under `root` to merge: skips hidden and `noMerge` branches, and nested Merged groups. */
function collect(root) {
  const out = []
  const walk = (o) => {
    for (const c of o.children) {
      if (!c.visible || c.userData.noMerge || c.userData.mergedRoot || c.userData.mergedOutput) continue
      if (mergeableMesh(c)) out.push(c)
      walk(c)
    }
  }
  walk(root)
  return out
}

/**
 * Draws its contents as a few merged meshes (one per kind of material) instead
 * of one draw per part. The group itself can move, spin or be hidden freely;
 * what's inside must hold still relative to it, so put animated parts in a
 * `userData.noMerge` group (or outside), and put Merged *inside* anything that
 * toggles visibility. Re-merges whenever it re-renders.
 *
 * `immutable`: every material inside is left alone after mount, so parts that
 * differ only in colour can share one draw (colours baked into the vertices).
 */
export function Merged({ children, immutable = false, ref: outerRef, ...rest }) {
  const ref = useRef()
  // The caller may want the group too (to animate it).
  const setRef = useCallback(
    (g) => {
      ref.current = g
      if (typeof outerRef === 'function') outerRef(g)
      else if (outerRef) outerRef.current = g
    },
    [outerRef],
  )
  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return undefined
    root.userData.mergedRoot = true
    const meshes = collect(root)
    if (meshes.length < 2) return undefined
    root.updateWorldMatrix(true, true)
    _inv.copy(root.matrixWorld).invert()
    // A mirrored part would come out inside-out in shared geometry: leave it be.
    const usable = meshes.filter((o) => _rel.multiplyMatrices(_inv, o.matrixWorld).determinant() >= 0)
    const made = []
    for (const plan of planMerge(usable, { immutable })) {
      if (plan.meshes.length < 2) continue
      const mesh = buildMerged(plan, _inv)
      if (!mesh) continue
      mesh.userData.mergedOutput = true
      mesh.name = 'merged'
      root.add(mesh)
      for (const o of plan.meshes) o.visible = false
      made.push({ mesh, members: plan.meshes })
    }
    return () => {
      for (const { mesh, members } of made) {
        root.remove(mesh)
        mesh.geometry.dispose()
        for (const o of members) o.visible = true
      }
    }
  })
  return (
    <group ref={setRef} {...rest}>
      {children}
    </group>
  )
}

export default Merged
