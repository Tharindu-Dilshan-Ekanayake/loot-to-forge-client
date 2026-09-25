import { useGLTF } from '@react-three/drei'
import { createPortal, useFrame } from '@react-three/fiber'
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import { Box3, Group, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'

import {
  assetUrls,
  BASE_BODY_URL,
  isRealId,
  PART_SLOTS,
  skinIdOrDefault,
} from '../bloxity/avatarAssets'
import { loadOBJ, loadPartGLB, loadTexture } from '../bloxity/avatarLoader'
import { useBloxity } from '../bloxity/BloxityContext'
import { lookOrGuest, skinUrl } from '../bloxity/guest'
import { DEFAULT_PROPORTIONS } from '../bloxity/store'
import {
  animateRig,
  applyPart,
  applyProportions,
  applySkin,
  attachAccessory,
  collectRig,
  READY_POSE,
} from './avatarRig'
import BagModel from './entities/BagModel'
import WeaponModel from './entities/WeaponModel'
import { weaponLook } from './weaponTier'
import { local } from './bus'

/**
 * Keeps the avatar breathing when it is rendered outside the game (a menu preview,
 * say) with no physics body feeding it motion.
 */
const _idleMotion = { time: 0, speed: 0, grounded: true, maxSpeed: 6 }
function fallbackMotion(delta) {
  _idleMotion.time += delta
  return _idleMotion
}

/**
 * How a weapon sits in the fist, in character space. Aimed so that in the ready
 * pose the blade juts out past the sword hip (+X), forward and up, edge down,
 * like a Roblox sword-sim stance.
 */
const GRIP_QUAT = (() => {
  const arm = new Quaternion()
    .setFromAxisAngle(new Vector3(1, 0, 0), READY_POSE.shoulder)
    .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), READY_POSE.out))
    .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), READY_POSE.elbow))
    .invert()
  const blade = new Vector3(0.32, 0.72, 0.62).normalize().applyQuaternion(arm)
  const down = new Vector3(0, -1, 0.2).applyQuaternion(arm)
  // The blade's edge is its local +X: point it as close to `down` as the blade allows.
  const edge = down.addScaledVector(blade, -down.dot(blade)).normalize()
  const flat = new Vector3().crossVectors(edge, blade)
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(edge, blade, flat))
})()
const _scale = new Vector3()
/** Chunky, Roblox-sized weapons read better than true-to-scale ones. */
const WEAPON_SCALE = 2.05

/**
 * A Bloxity avatar, assembled at runtime.
 *
 * `player.glb` is the base humanoid rig: six skinned meshes (head, torso, two arms,
 * two legs) sharing one skeleton. Assembly means, per equipped slot:
 *   - body parts  -> swap the matching mesh's geometry
 *   - hat / back  -> attach an OBJ to the Neck1 / Spine2 bone
 *   - skin        -> set one texture as the map on every skinned mesh
 *
 * The local player's avatar comes from the Bloxity session; remote players pass
 * their `equipped` / `proportions` in explicitly (they arrive over the network).
 *
 * @param {{ onReady?: () => void, targetHeight?: number, weaponId?: string,
 *           equipped?: object, proportions?: object, isLocal?: boolean }} props
 */
export const PlayerAvatar = forwardRef(function PlayerAvatar(
  {
    onReady,
    targetHeight = 1.8,
    motionRef,
    weaponId,
    /** Weapon tier (weaponTier.js): bigger, more colourful and glowier with Damage. */
    weaponTier = 0,
    bagId,
    equipped: equippedProp,
    proportions: proportionsProp,
    isLocal = true,
    ...props
  },
  ref,
) {
  const session = useBloxity()
  const equipped = useMemo(() => (isLocal ? lookOrGuest(session.avatar) : equippedProp), [isLocal, session.avatar, equippedProp])
  const proportions = isLocal ? session.proportions : proportionsProp || DEFAULT_PROPORTIONS
  const { game } = session
  const { scene: baseScene } = useGLTF(BASE_BODY_URL)
  const [assembled, setAssembled] = useState(false)

  // The GLTF cache hands back one shared scene. Clone via SkeletonUtils so this
  // instance gets an independent, still-working skeleton.
  const character = useMemo(() => cloneSkeleton(baseScene), [baseScene])

  // Rig lookup tables (bones, part meshes, pristine geometries) built once per clone.
  const rig = useMemo(() => {
    const collected = collectRig(character)

    // The base body ships with an empty texture; give every skinned mesh its own
    // material instance so a skin swap here can't leak into another avatar.
    for (const mesh of collected.skinnedMeshes) {
      mesh.material = new MeshStandardMaterial({
        color: 0xffffff,
        metalness: 0,
        roughness: 1,
      })
    }

    if (!collected.skeleton) {
      console.warn('[bloxity] player.glb has no skeleton - avatar will not deform')
    }
    return collected
  }, [character])

  // A holder parented to the forearm bone; the weapon is portalled into it.
  // Created in a memo but attached in an effect, so StrictMode's double render
  // can't leave a stray holder on the bone.
  const hand = useMemo(() => (rig.hand ? new Group() : null), [rig])
  useEffect(() => {
    if (!hand) return undefined
    hand.position.copy(rig.hand.offset)
    hand.quaternion.copy(rig.hand.relInv).multiply(GRIP_QUAT)
    rig.hand.bone.add(hand)
    return () => rig.hand.bone.remove(hand)
  }, [hand, rig])

  // Same idea for the backpack, on the spine bone behind the torso.
  const back = useMemo(() => (rig.back ? new Group() : null), [rig])
  useEffect(() => {
    if (!back) return undefined
    back.position.copy(rig.back.offset)
    back.quaternion.copy(rig.back.relInv)
    rig.back.bone.add(back)
    if (isLocal) local.bag = back
    return () => {
      rig.back.bone.remove(back)
      if (local.bag === back) local.bag = null
    }
  }, [back, rig, isLocal])

  // Measured once, from the bind pose, before proportions touch the root scale.
  const fit = useMemo(() => {
    const box = new Box3().setFromObject(character)
    const size = box.getSize(new Vector3())
    if (!Number.isFinite(size.y) || size.y <= 0) return { scale: 1, footOffset: 0 }
    const scale = targetHeight / size.y
    // The rig's feet sit at its bbox minimum; drop the group so they land on y=0
    // of the parent (which Player positions at the bottom of the capsule).
    return { scale, footOffset: -box.min.y * scale }
  }, [character, targetHeight])

  // --- Assemble equipped cosmetics --------------------------------------------
  useEffect(() => {
    let cancelled = false
    // Accessories are re-attached on every rebuild; track them so the previous
    // hat/back can be removed rather than stacking up.
    const attached = []

    if (isLocal) game.loadingStep('Loading avatar…')

    const jobs = []

    // Skin always loads - "0" is the fallback, since the base body has no baked map.
    jobs.push(
      loadTexture(skinUrl(skinIdOrDefault(equipped?.skinId))).then(
        (texture) => ({ kind: 'skin', texture }),
      ),
    )

    // Body parts: fetch only real ids; a missing slot resets to the base geometry.
    for (const [slot, cfg] of Object.entries(PART_SLOTS)) {
      const id = equipped?.[cfg.idKey]
      if (!isRealId(id)) {
        jobs.push(Promise.resolve({ kind: 'part', slot, scene: null }))
        continue
      }
      jobs.push(
        loadPartGLB(assetUrls.part(slot, id)).then((scene) => ({
          kind: 'part',
          slot,
          scene,
        })),
      )
    }

    // Accessories.
    for (const [kind, idKey, meshUrl, texUrl] of [
      ['hat', 'hatId', assetUrls.hatMesh, assetUrls.hatTexture],
      ['back', 'backId', assetUrls.backMesh, assetUrls.backTexture],
    ]) {
      const id = equipped?.[idKey]
      if (!isRealId(id)) continue
      jobs.push(
        Promise.all([loadOBJ(meshUrl(id)), loadTexture(texUrl(id))]).then(
          ([object, texture]) => ({ kind: 'accessory', accessory: kind, object, texture }),
        ),
      )
    }

    Promise.all(jobs)
      .then((results) => {
        if (cancelled) return

        for (const result of results) {
          // One bad slot must not take the rest of the character down.
          try {
            if (result.kind === 'skin') {
              applySkin(rig, result.texture)
            } else if (result.kind === 'part') {
              applyPart(rig, result.slot, result.scene)
            } else if (result.kind === 'accessory' && result.object) {
              if (result.texture) {
                result.object.traverse((child) => {
                  if (child.isMesh) {
                    child.material = new MeshStandardMaterial({ map: result.texture })
                  }
                })
              }
              const added = attachAccessory(rig, result.accessory, result.object)
              if (added) attached.push(added)
            }
          } catch (err) {
            console.warn(`[bloxity] failed to apply ${result.kind}`, err)
          }
        }

        setAssembled(true)
      })
      .catch((err) => {
        console.warn('[bloxity] avatar assembly failed; showing base body', err)
        if (!cancelled) setAssembled(true)
      })

    return () => {
      cancelled = true
      for (const object of attached) {
        object.parent?.remove(object)
        object.traverse((child) => child.geometry?.dispose())
      }
    }
  }, [rig, equipped, game, isLocal])

  // --- Proportions + animation -------------------------------------------------
  // Applied per frame rather than in an effect: every bone is reset to its rest pose
  // and re-scaled each pass, which keeps it idempotent and survives anything else
  // that touches the skeleton.
  const proportionsRef = useRef(proportions)
  proportionsRef.current = proportions

  useFrame((_state, delta) => {
    try {
      // Order matters: proportions reset every bone to its rest pose, and the
      // animation then rotates on top of that clean base.
      applyProportions(rig, proportionsRef.current)
      animateRig(rig, motionRef?.current ?? fallbackMotion(delta))
      if (hand?.parent) {
        // The weapon is modelled in world units; cancel the rig's scale so it
        // isn't shrunk by the avatar fit or stretched by arm proportions.
        hand.parent.getWorldScale(_scale)
        const s = (WEAPON_SCALE * weaponLook(weaponTier).scale) / ((_scale.x + _scale.y + _scale.z) / 3)
        hand.scale.setScalar(s)
      }
      if (back?.parent) {
        back.parent.getWorldScale(_scale)
        back.scale.setScalar((targetHeight / 1.8) / ((_scale.x + _scale.y + _scale.z) / 3))
      }
    } catch {
      // A malformed payload must not kill the render loop.
    }
  })

  // Signal readiness only once the model is actually standing there.
  useEffect(() => {
    if (assembled) onReady?.()
  }, [assembled, onReady])

  return (
    <group ref={ref} {...props}>
      {/* Fit scale lives on this wrapper, not on `character` - applyProportions
          overwrites the character's own scale every frame. */}
      <group scale={fit.scale} position={[0, fit.footOffset, 0]}>
        <primitive object={character} />
      </group>
      {hand && weaponId && createPortal(<WeaponModel weaponId={weaponId} tier={weaponTier} />, hand)}
      {back && bagId && createPortal(<BagModel bagId={bagId} isLocal={isLocal} />, back)}
    </group>
  )
})

useGLTF.preload(BASE_BODY_URL)

export default PlayerAvatar
