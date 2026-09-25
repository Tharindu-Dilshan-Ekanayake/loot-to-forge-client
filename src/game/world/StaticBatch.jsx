import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Matrix4, Mesh } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { pauseMatrices } from '../stageWindow'

/**
 * Static batching for the world's blocks and props.
 *
 * The castle and the dungeon are built from thousands of small meshes (mostly
 * `Block`s), and drawing each one on its own (twice, with shadows) made the
 * game CPU-bound. This merges the static meshes under it that share a material
 * into one mesh per material, and hides the originals (their physics colliders are
 * untouched: those were built from them when they mounted).
 *
 * Nothing has to be marked by hand. A block is only merged once it has sat
 * still and visible for a while, so anything animated (flags, floating props,
 * the champion's dance) or hidden stays as it is. Things that only move when
 * something happens to them set `userData.noBatch` on their root. A watchdog then keeps an eye
 * on every merged block: if one moves, is hidden, swaps geometry or material,
 * or unmounts, its whole batch is split back into the original meshes.
 */

/** Frames to wait before the first look, and between that look and merging. */
const SETTLE_FRAMES = 20
const STABLE_FRAMES = 30
/** After the first pass, look for newly mounted blocks this often (seconds). */
const RESCAN_S = 6
/** The watchdog checks this many merged blocks per frame, round-robin. */
const WATCH_PER_FRAME = 30
/** Batches smaller than this aren't worth merging. */
const MIN_BATCH = 3

const _inv = new Matrix4()
const _local = new Matrix4()
const _world = new Matrix4()

/**
 * Plain, opaque, single-material meshes: blocks and the other static props
 * (posts, lamps, rocks). Transparent ones keep their own draw order, and
 * anything skinned, instanced, morphing or marked `userData.noBatch` is left be.
 */
function mergeable(o) {
  if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || o.name === 'static-batch' || o.userData.noBatch) return false
  const m = o.material
  if (!m || Array.isArray(m) || m.transparent || !m.isMeshStandardMaterial) return false
  const g = o.geometry
  return Boolean(g?.attributes.position && g.attributes.normal && !g.morphAttributes.position)
}

/** Is every ancestor between `obj` and `root` visible? (Ignores obj itself.) */
function chainVisible(obj, root) {
  for (let p = obj.parent; p && p !== root; p = p.parent) if (!p.visible) return false
  return true
}

/** Does `obj` still hang under `root`? */
function under(obj, root) {
  for (let p = obj.parent; p; p = p.parent) if (p === root) return true
  return false
}

/** `m`'s world matrix, computed now from its own and its parents' transforms. */
function worldOf(m) {
  m.updateMatrix()
  m.updateWorldMatrix(true, false)
  return m.matrixWorld.clone()
}

const sameMatrix = (a, b) => {
  const x = a.elements
  const y = b.elements
  for (let i = 0; i < 16; i += 1) if (Math.abs(x[i] - y[i]) > 1e-5) return false
  return true
}

export default function StaticBatch({ children }) {
  const root = useRef()
  const st = useRef({
    frame: 0,
    /** Candidates seen at the first look: Map<mesh, matrixWorld clone>. */
    pending: null,
    /** Live batches: [{ mesh, members: [{ m, geometry, material, matrix, batch }] }] */
    batches: [],
    /** Every merged member across all batches, for the round-robin watchdog. */
    members: [],
    /** Meshes that moved or changed once: never merged again. */
    excluded: new WeakSet(),
    merged: new WeakSet(),
    watch: 0,
    nextScan: 0,
  })

  // Split everything back apart on unmount.
  useEffect(() => {
    const s = st.current
    return () => {
      for (const b of [...s.batches]) unbatch(b)
    }
  }, [])

  function candidates(r, s) {
    const out = []
    // Walks only visible branches, and skips anything marked noBatch (things
    // that stand still until something happens to them, like a dummy you hit).
    const walk = (o) => {
      if (!o.visible || o.userData.noBatch) return
      if (mergeable(o) && !s.merged.has(o) && !s.excluded.has(o)) out.push(o)
      for (const c of o.children) walk(c)
    }
    for (const c of r.children) walk(c)
    return out
  }

  function unbatch(b) {
    const s = st.current
    b.mesh.parent?.remove(b.mesh)
    b.mesh.geometry.dispose()
    for (const { m } of b.members) {
      m.visible = true
      pauseMatrices(m, false)
      s.merged.delete(m)
    }
    s.batches = s.batches.filter((x) => x !== b)
    s.members = s.members.filter((e) => e.batch !== b)
  }

  function merge(r, s, meshes) {
    r.updateWorldMatrix(true, false)
    _inv.copy(r.matrixWorld).invert()
    // One batch per material (and shadow settings).
    const groups = new Map()
    for (const m of meshes) {
      const key = `${m.material.uuid}|${m.castShadow}|${m.receiveShadow}|${m.geometry.index ? 1 : 0}|${m.geometry.attributes.uv ? 1 : 0}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(m)
    }
    for (const list of groups.values()) {
      if (list.length < MIN_BATCH) continue
      const geos = []
      for (const m of list) {
        const g = m.geometry.clone()
        g.clearGroups()
        for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name)
        g.applyMatrix4(_local.multiplyMatrices(_inv, m.matrixWorld))
        geos.push(g)
      }
      const geometry = mergeGeometries(geos, false)
      for (const g of geos) g.dispose()
      if (!geometry) continue
      geometry.computeBoundingSphere()
      const mesh = new Mesh(geometry, list[0].material)
      mesh.castShadow = list[0].castShadow
      mesh.receiveShadow = list[0].receiveShadow
      mesh.matrixAutoUpdate = false
      mesh.name = 'static-batch'
      r.add(mesh)
      const batch = { mesh, members: null }
      batch.members = list.map((m) => {
        s.merged.add(m)
        // Hidden, and left out of the scene's per-frame matrix pass: with
        // thousands of blocks that pass was a large share of each frame. The
        // watchdog recomputes the few it samples itself.
        m.visible = false
        pauseMatrices(m, true)
        return { m, geometry: m.geometry, material: m.material, matrix: m.matrixWorld.clone(), batch }
      })
      s.batches.push(batch)
      s.members.push(...batch.members)
    }
  }

  useFrame(({ clock }) => {
    const r = root.current
    const s = st.current
    if (!r) return
    s.frame += 1

    // First look: note where every block is.
    if (s.frame === SETTLE_FRAMES || (s.frame > SETTLE_FRAMES + STABLE_FRAMES && !s.pending && clock.elapsedTime > s.nextScan)) {
      const list = candidates(r, s)
      // Computed here rather than read: a hidden stage's matrices aren't kept current.
      s.pending = list.length >= MIN_BATCH ? new Map(list.map((m) => [m, worldOf(m)])) : null
      s.pendingAt = s.frame
      s.nextScan = clock.elapsedTime + RESCAN_S
    }
    // Second look: merge the ones that are still where they were, and visible.
    if (s.pending && s.frame >= s.pendingAt + STABLE_FRAMES) {
      const still = []
      for (const [m, mat0] of s.pending) {
        if (!m.parent || !under(m, r) || !m.visible || !chainVisible(m, r)) continue
        if (sameMatrix(worldOf(m), mat0)) still.push(m)
        else s.excluded.add(m)
      }
      s.pending = null
      if (still.length >= MIN_BATCH) merge(r, s, still)
    }

    // Watchdog: a merged block that changed splits its batch back apart.
    const total = s.members.length
    if (!total) return
    const budget = Math.min(WATCH_PER_FRAME, total)
    for (let k = 0; k < budget; k += 1) {
      s.watch = (s.watch + 1) % total
      const e = s.members[s.watch]
      const m = e.m
      let broken = !m.parent || !under(m, r) || m.geometry !== e.geometry || m.material !== e.material || !chainVisible(m, r)
      if (!broken) {
        // Its own matrices are paused: rebuild them from its transform and its
        // parent's (which the scene keeps current).
        m.updateMatrix()
        _world.multiplyMatrices(m.parent.matrixWorld, m.matrix)
        broken = !sameMatrix(_world, e.matrix)
      }
      if (broken) {
        unbatch(e.batch)
        s.excluded.add(m)
        break
      }
    }
  })

  return <group ref={root}>{children}</group>
}
