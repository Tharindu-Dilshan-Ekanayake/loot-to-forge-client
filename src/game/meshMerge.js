import { AdditiveBlending, BufferAttribute, Matrix4, Mesh } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Merging many small meshes into a few, to cut draw calls.
 *
 * Meshes are grouped by everything about their material *except its colour*
 * (plus their shadow flags); each group becomes one mesh. When a group's members
 * differ only in colour, each member's colour is baked into its vertices and the
 * group draws with one shared vertex-coloured copy of the material. That is only
 * safe for materials nothing changes later, so it's limited to the shared ones
 * from `mat()` (flagged `userData.cachedMat`) unless the caller vouches for all
 * of them (`immutable`); any other material only merges with itself.
 */

const _rel = new Matrix4()

/** Colour-free description of a material: two with the same one can share a draw. */
const SIG_KEYS = [
  'transparent',
  'blending',
  'side',
  'opacity',
  'alphaTest',
  'roughness',
  'metalness',
  'emissiveIntensity',
  'envMapIntensity',
  'flatShading',
  'fog',
  'toneMapped',
  'depthTest',
  'depthWrite',
  'wireframe',
  'polygonOffset',
  'polygonOffsetFactor',
  'polygonOffsetUnits',
]
const MAP_KEYS = ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaMap', 'envMap', 'lightMap', 'bumpMap']

function signature(m) {
  let s = m.type
  for (const k of SIG_KEYS) if (k in m) s += `|${m[k]}`
  for (const k of MAP_KEYS) if (m[k]) s += `|${k}:${m[k].uuid}`
  if (m.emissive) s += `|e${m.emissive.getHexString()}`
  return s
}

/** Shared vertex-coloured copies, one per signature, so batches share programs and uniforms. */
const vertexColored = new Map()
function vertexColorMaterial(source, sig) {
  let m = vertexColored.get(sig)
  if (!m) {
    m = source.clone()
    m.color.set('#ffffff')
    m.vertexColors = true
    m.userData = { ...source.userData, cachedMat: true, shared: true, vertexColored: true }
    vertexColored.set(sig, m)
  }
  return m
}

/**
 * Can this mesh join a merge? Plain, single-material, not skinned, instanced or
 * morphing, and drawn in the default order. Opaque, or additive glow that
 * doesn't write depth: that looks the same drawn in any order, so merging it
 * can't upset transparency sorting.
 */
export function mergeableMesh(o) {
  if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || o.userData.noBatch || o.userData.noMerge) return false
  if (o.renderOrder !== 0 || o.morphTargetInfluences) return false
  const m = o.material
  if (!m || Array.isArray(m) || m.vertexColors) return false
  if (m.transparent && !(m.blending === AdditiveBlending && !m.depthWrite)) return false
  if (!(m.isMeshStandardMaterial || m.isMeshBasicMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial)) return false
  const g = o.geometry
  return Boolean(g?.attributes.position && !g.morphAttributes.position)
}

/**
 * Groups `meshes` into merge batches. Returns [{ key, material, bake, meshes }].
 * `immutable` lets every material bake its colour, not just `mat()`'s.
 */
export function planMerge(meshes, { immutable = false } = {}) {
  const groups = new Map()
  for (const o of meshes) {
    const m = o.material
    const bakeable = immutable || m.userData.cachedMat
    // Unshared materials only ever merge with themselves.
    const sig = bakeable ? signature(m) : `uuid:${m.uuid}`
    const key = `${sig}|${o.castShadow}|${o.receiveShadow}`
    let g = groups.get(key)
    if (!g) groups.set(key, (g = { key, sig, bakeable, meshes: [] }))
    g.meshes.push(o)
  }
  const plans = []
  for (const g of groups.values()) {
    const first = g.meshes[0].material
    const oneMaterial = g.meshes.every((o) => o.material === first)
    const oneColor = oneMaterial || g.meshes.every((o) => !o.material.color || o.material.color.equals(first.color))
    const bake = g.bakeable && !oneColor
    plans.push({ key: g.key, material: bake ? vertexColorMaterial(first, g.sig) : first, bake, meshes: g.meshes })
  }
  return plans
}

/**
 * Builds one mesh from a plan, in the space whose world matrix inverse is
 * `rootInverse` (the members' matrixWorld must be current). Returns null when
 * the geometries can't be combined.
 */
export function buildMerged(plan, rootInverse) {
  const geos = []
  const anyNonIndexed = plan.meshes.some((o) => !o.geometry.index)
  for (const o of plan.meshes) {
    let g = o.geometry.clone()
    g.clearGroups()
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name)
    if (anyNonIndexed && g.index) {
      const flat = g.toNonIndexed()
      g.dispose()
      g = flat
    }
    const count = g.attributes.position.count
    if (!g.attributes.normal) g.computeVertexNormals()
    if (!g.attributes.uv) g.setAttribute('uv', new BufferAttribute(new Float32Array(count * 2), 2))
    if (plan.bake) {
      const c = o.material.color
      const colors = new Float32Array(count * 3)
      for (let i = 0; i < count; i += 1) {
        colors[i * 3] = c.r
        colors[i * 3 + 1] = c.g
        colors[i * 3 + 2] = c.b
      }
      g.setAttribute('color', new BufferAttribute(colors, 3))
    }
    g.applyMatrix4(_rel.multiplyMatrices(rootInverse, o.matrixWorld))
    geos.push(g)
  }
  const geometry = geos.length === 1 ? geos[0] : mergeGeometries(geos, false)
  if (geos.length > 1) for (const g of geos) g.dispose()
  if (!geometry) return null
  geometry.computeBoundingSphere()
  geometry.computeBoundingBox()
  const first = plan.meshes[0]
  const mesh = new Mesh(geometry, plan.material)
  mesh.castShadow = first.castShadow
  mesh.receiveShadow = first.receiveShadow
  return mesh
}

/** A mirrored transform would turn a member inside out once baked into shared geometry. */
export const mirrored = (o) => o.matrixWorld.determinant() < 0
