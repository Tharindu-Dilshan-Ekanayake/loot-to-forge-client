import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Matrix4 } from 'three'

import { abandonMerged, addToMerged, beginMerged, finishMerged, mergeableMesh, mirrored, planMerge } from '../meshMerge'
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
/**
 * After the first pass, look for newly mounted or newly still blocks this often
 * (seconds), or sooner after something split apart or thawed. Never while out of
 * sight: a far stage can't change, and walking thousands of objects for nothing
 * every few seconds was a steady trickle of stutters.
 */
const RESCAN_S = 30
const RESCAN_DIRTY_S = 2
/** The watchdog checks this many merged blocks per frame, round-robin. */
const WATCH_PER_FRAME = 12
/** Two draws into one is already worth it. */
const MIN_BATCH = 2

const _world = new Matrix4()
/**
 * The frame the last second look ran in: every stage settles at the same
 * moment, and checking them all in one frame would stall it. One per frame.
 */
let mergeFrame = -1

/**
 * Building the merged meshes is spread over frames: a big batch (the lobby has
 * hundreds of blocks per material) built in one go stalled the frame by 50–100
 * ms, a visible hitch just as you started walking. Every StaticBatch shares one
 * queue and gets this much time per frame, a member at a time.
 */
const JOB_BUDGET_MS = 3
const jobs = []
let jobFrame = -1

function runJobs(now) {
  if (jobFrame === now) return
  jobFrame = now
  const t0 = performance.now()
  while (jobs.length && performance.now() - t0 < JOB_BUDGET_MS) {
    const j = jobs[0]
    if (!j.inv) {
      j.r.updateWorldMatrix(true, false)
      j.inv = new Matrix4().copy(j.r.matrixWorld).invert()
    }
    const list = j.state.plan.meshes
    while (j.i < list.length && performance.now() - t0 < JOB_BUDGET_MS) {
      const m = list[j.i]
      j.i += 1
      // Still there, still shown, not merged elsewhere in the meantime.
      if (!m.parent || !under(m, j.r) || !m.visible || j.s.merged.has(m)) continue
      worldOf(m)
      addToMerged(j.state, m, j.inv)
      j.members.push(m)
    }
    if (j.i < list.length) break
    jobs.shift()
    j.finish(j)
  }
}

/**
 * Plain, opaque, single-material meshes: blocks and the other static props
 * (posts, lamps, rocks, window panes). Transparent ones keep their own draw
 * order, and anything skinned, instanced, morphing, mirrored or marked
 * `userData.noBatch` is left be.
 */
function mergeable(o) {
  return o.name !== 'static-batch' && mergeableMesh(o)
}

/** Is `obj` drawn at all, i.e. is it and every ancestor visible? */
function shownInWorld(obj) {
  for (let p = obj; p; p = p.parent) if (!p.visible) return false
  return true
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
    /** Waiting in the build queue. */
    queued: new WeakSet(),
    watch: 0,
    nextScan: 0,
    /** At the first look: where every object stood, for freezing (Map<obj, matrixWorld>). */
    freezeSnap: null,
    scanAt: 0,
    /** Every object under a frozen subtree, with its transform then: the thaw watchdog's list. */
    frozenEntries: [],
    freezeWatch: 0,
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
      if (mergeable(o) && !s.merged.has(o) && !s.queued.has(o) && !s.excluded.has(o)) out.push(o)
      for (const c of o.children) walk(c)
    }
    for (const c of r.children) walk(c)
    return out
  }

  /**
   * Freezing: whole subtrees that held perfectly still between the two looks
   * (walls, stalls, trees, lamps, the groups that hold merged blocks) leave the
   * scene's per-frame matrix pass, like merged blocks do. Their matrices were
   * just computed and can't change while nothing moves. Anything animated, or
   * marked noBatch / noFreeze, stays in.
   */
  function snapshotForFreeze(r) {
    const snap = new Map()
    const walk = (o) => {
      if (o.__matricesPaused || o.userData.noBatch || o.userData.noFreeze) return
      snap.set(o, o.matrixWorld.clone())
      for (const c of o.children) walk(c)
    }
    for (const c of r.children) if (c.name !== 'static-batch') walk(c)
    return snap
  }

  function freezeStill(r, s, snap) {
    // A node is still when it and everything under it held its place.
    const still = new Map()
    const visit = (o) => {
      if (o.__matricesPaused) return true
      if (o.userData.noBatch || o.userData.noFreeze) return false
      const before = snap.get(o)
      let ok = Boolean(before) && sameMatrix(o.matrixWorld, before)
      for (const c of o.children) if (!visit(c)) ok = false
      still.set(o, ok)
      return ok
    }
    const tops = r.children.filter((c) => c.name !== 'static-batch')
    for (const c of tops) visit(c)
    // Freeze the largest still subtrees.
    const freeze = (o) => {
      if (o.__matricesPaused) return
      if (still.get(o)) {
        pauseMatrices(o, true)
        o.traverse((x) => {
          s.frozenEntries.push({ node: o, o: x, p: x.position.clone(), q: x.quaternion.clone(), sc: x.scale.clone(), kids: x.children.length })
        })
        return
      }
      for (const c of o.children) freeze(c)
    }
    for (const c of tops) freeze(c)
  }

  /** Something frozen moved or changed: back into the matrix pass, for good. */
  function thaw(s, node) {
    pauseMatrices(node, false)
    node.userData.noFreeze = true
    s.frozenEntries = s.frozenEntries.filter((e) => e.node !== node)
    // Its still parts can be frozen again, a level down.
    s.dirty = true
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
    // The rest of the batch can merge again.
    s.dirty = true
  }

  function merge(r, s, meshes) {
    // One batch per kind of material (colours of the shared `mat()` ones are
    // baked into the vertices) and shadow settings, each built over a few
    // frames (see runJobs); the originals keep drawing until it's ready.
    for (const plan of planMerge(meshes.filter((m) => !mirrored(m)))) {
      if (plan.meshes.length < MIN_BATCH) continue
      // Spoken for: a rescan mustn't queue them into a second batch meanwhile.
      for (const m of plan.meshes) s.queued.add(m)
      jobs.push({ r, s, state: beginMerged(plan), i: 0, inv: null, members: [], finish: finishBatch })
    }
  }

  function finishBatch(j) {
    const { r, s, members } = j
    for (const m of j.state.plan.meshes) s.queued.delete(m)
    // Unmounted meanwhile, or too few left to be worth it.
    if (!root.current || members.length < MIN_BATCH) {
      abandonMerged(j.state)
      return
    }
    const mesh = finishMerged(j.state)
    if (!mesh) return
    mesh.matrixAutoUpdate = false
    mesh.name = 'static-batch'
    r.add(mesh)
    mesh.updateWorldMatrix(false, false)
    const batch = { mesh, members: null }
    batch.members = members.map((m) => {
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

  useFrame(({ clock }) => {
    const r = root.current
    const s = st.current
    if (!r) return
    s.frame += 1
    runJobs(clock.elapsedTime)

    const shown = shownInWorld(r)

    // Something split apart or thawed, or a far stage just came into view (its
    // still parts can freeze now its matrices are kept current): look again soon.
    if (s.dirty || (shown && !s.wasShown)) {
      s.dirty = false
      s.nextScan = Math.min(s.nextScan, clock.elapsedTime + RESCAN_DIRTY_S)
    }
    s.wasShown = shown
    // First look: note where every block is.
    if (s.frame === SETTLE_FRAMES || (shown && s.frame > SETTLE_FRAMES + STABLE_FRAMES && !s.pending && !s.freezeSnap && clock.elapsedTime > s.nextScan)) {
      const list = candidates(r, s)
      // Computed here rather than read: a hidden stage's matrices aren't kept current.
      s.pending = list.length >= MIN_BATCH ? new Map(list.map((m) => [m, worldOf(m)])) : null
      // Freezing reads the matrices the scene keeps: only while they're kept current.
      s.freezeSnap = shown ? snapshotForFreeze(r) : null
      s.scanAt = s.frame
      s.nextScan = clock.elapsedTime + RESCAN_S
    }
    // Second look: merge the ones that are still where they were, and visible;
    // freeze whatever held still.
    if ((s.pending || s.freezeSnap) && s.frame >= s.scanAt + STABLE_FRAMES && mergeFrame !== clock.elapsedTime) {
      mergeFrame = clock.elapsedTime
      if (s.pending) {
        const still = []
        for (const [m, mat0] of s.pending) {
          if (!m.parent || !under(m, r) || !m.visible || !chainVisible(m, r)) continue
          if (sameMatrix(worldOf(m), mat0)) still.push(m)
          else s.excluded.add(m)
        }
        s.pending = null
        if (still.length >= MIN_BATCH) merge(r, s, still)
      }
      if (s.freezeSnap) {
        if (shown) freezeStill(r, s, s.freezeSnap)
        s.freezeSnap = null
      }
    }

    if (!shown) return

    // Thaw watchdog: a frozen object that moved, turned, rescaled or gained a
    // child puts its whole subtree back into the matrix pass.
    const frozenCount = s.frozenEntries.length
    for (let k = 0; k < Math.min(WATCH_PER_FRAME * 2, frozenCount); k += 1) {
      s.freezeWatch = (s.freezeWatch + 1) % s.frozenEntries.length
      const e = s.frozenEntries[s.freezeWatch]
      const o = e.o
      if ((o !== e.node && !o.parent) || !e.node.parent || !o.position.equals(e.p) || !o.quaternion.equals(e.q) || !o.scale.equals(e.sc) || o.children.length !== e.kids) {
        thaw(s, e.node)
        break
      }
    }

    // Watchdog: a merged block that changed splits its batch back apart. Not
    // while the whole lot is out of sight (a far stage): nothing moves there.
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
