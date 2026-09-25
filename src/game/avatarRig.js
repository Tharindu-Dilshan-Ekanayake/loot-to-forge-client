import { Box3, NearestFilter, Quaternion, SRGBColorSpace, Vector3 } from 'three'

import { BACK_BONE, HAT_BONE, NECK_OFFSET_BONE, PART_SLOTS } from '../bloxity/avatarAssets'

/**
 * Rig manipulation for the base `player.glb` character.
 *
 * The rig's real structure (confirmed by reading player.glb directly):
 *   character
 *     - default_arm_L / default_arm_R / default_head
 *     - default_leg_L / default_leg_R / default_torso   (6 SkinnedMeshes, 1 skeleton)
 *     - Rig1
 *         - Spine1 > Spine2 > { ArmL_Offset > ArmL1 > ArmL2,
 *                               ArmR_Offset > ArmR1 > ArmR2,
 *                               Neck_Offset > Neck1 }
 *         - LegL_Offset > LegL1 > LegL2, LegR_Offset > LegR1 > LegR2
 *
 * Two consequences drive everything below:
 *  1. Body parts are NOT attached to bones. Each is a separate SkinnedMesh sharing one
 *     skeleton, so equipping a part means swapping that mesh's geometry (remapping
 *     skin indices into the base skeleton's bone order first).
 *  2. Accessories DO attach to bones: hats to `Neck1`, back items to `Spine2`.
 *
 * player.glb ships no animation clips, so the character is posed, not animated.
 */

/**
 * Walks the loaded rig and collects everything later operations need.
 *
 * @param {import('three').Object3D} root
 */
export function collectRig(root) {
  const rig = {
    root,
    skeleton: null,
    /** slot -> SkinnedMesh */
    partMeshes: {},
    /** slot -> the pristine geometry to restore on unequip */
    originalGeometries: {},
    /** bone name -> { bone, origPos, origQuat, origScale } */
    bones: {},
    hatBone: null,
    backBone: null,
    neckOffsetBindY: 0,
    skinnedMeshes: [],
    /** Rest Y of the character root, so the run-cycle bob can return to it. */
    rootRestY: root.position.y,
  }

  const meshBySlot = new Map(
    Object.entries(PART_SLOTS).map(([slot, cfg]) => [cfg.mesh.toLowerCase(), slot]),
  )

  root.traverse((node) => {
    if (node.isSkinnedMesh) {
      node.castShadow = true
      node.receiveShadow = true
      rig.skinnedMeshes.push(node)
      if (!rig.skeleton) rig.skeleton = node.skeleton

      const slot = meshBySlot.get((node.name || '').toLowerCase())
      if (slot) {
        rig.partMeshes[slot] = node
        rig.originalGeometries[slot] = node.geometry.clone()
      }
    } else if (node.isMesh) {
      node.castShadow = true
      node.receiveShadow = true
    }
  })

  const skeleton = rig.skeleton
  if (skeleton) {
    for (const bone of skeleton.bones) {
      // Proportions are re-applied every frame from these rest values.
      bone.matrixAutoUpdate = true
      rig.bones[bone.name] = {
        bone,
        origPos: bone.position.clone(),
        origQuat: bone.quaternion.clone(),
        origScale: bone.scale.clone(),
      }
    }

    // Bone local axes are NOT world-aligned in this rig: a limb bone's local X
    // points along world -Z and its local Z along world -X, so rotating a leg about
    // its local X swings it sideways instead of forward/back. The offsets differ per
    // bone (Spine1 is identity, ArmL2 is off by ~14 degrees), so rather than hardcode
    // an axis, record for each bone the local-space axis matching each character-space
    // axis and animate about those.
    root.updateMatrixWorld(true)
    const rootQuat = new Quaternion()
    root.getWorldQuaternion(rootQuat)
    const rootQuatInv = rootQuat.invert()
    const boneWorld = new Quaternion()

    for (const bone of skeleton.bones) {
      const entry = rig.bones[bone.name]
      if (!entry) continue
      bone.getWorldQuaternion(boneWorld)
      // Bone orientation relative to the character, then inverted: this maps a
      // character-space axis into the bone's own local frame.
      const relInv = rootQuatInv.clone().multiply(boneWorld).invert()
      /** Local axis to rotate about for forward/back swing. */
      entry.axisX = new Vector3(1, 0, 0).applyQuaternion(relInv).normalize()
      /** Local axis to rotate about for lateral sway. */
      entry.axisZ = new Vector3(0, 0, 1).applyQuaternion(relInv).normalize()
      /** Maps a character-space orientation into this bone's local frame. */
      entry.relInv = relInv
    }

    // Where the right hand is, in the forearm bone's local space, so a held weapon
    // can be parented to the bone and follow every swing.
    const handBone = rig.bones.ArmR2?.bone || rig.bones.ArmR1?.bone
    const armMesh = rig.partMeshes.arm_R
    if (handBone && armMesh) {
      const box = new Box3().setFromObject(armMesh)
      const hand = new Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2)
      // Grip a little above the very bottom of the fist.
      hand.y += (box.max.y - box.min.y) * 0.08
      rig.hand = {
        bone: handBone,
        offset: handBone.worldToLocal(hand),
        relInv: rig.bones[handBone.name].relInv,
      }
    }

    // The middle of the torso's back face, in the spine bone's space: where a
    // backpack hangs. `depth` lets the bag sit flush whatever the body shape.
    const backBone = rig.bones[BACK_BONE]?.bone
    const torsoMesh = rig.partMeshes.torso
    if (backBone && torsoMesh) {
      const box = new Box3().setFromObject(torsoMesh)
      const back = new Vector3(
        (box.min.x + box.max.x) / 2,
        box.min.y + (box.max.y - box.min.y) * 0.55,
        box.min.z,
      )
      rig.back = {
        bone: backBone,
        offset: backBone.worldToLocal(back),
        relInv: rig.bones[BACK_BONE].relInv,
        width: box.max.x - box.min.x,
      }
    }

    rig.hatBone = skeleton.bones.find((b) => b.name === HAT_BONE) || null
    rig.backBone = skeleton.bones.find((b) => b.name === BACK_BONE) || null

    const neckIndex = skeleton.bones.findIndex((b) => b.name === NECK_OFFSET_BONE)
    if (neckIndex >= 0) {
      // elements[13] is the Y translation of the inverted bind matrix.
      rig.neckOffsetBindY = skeleton.boneInverses[neckIndex].clone().invert().elements[13]
    }
  }

  return rig
}

/** Bloxity textures are authored unflipped and pixel-art filtered. */
export function configureAvatarTexture(texture) {
  if (!texture) return texture
  texture.flipY = false
  // Skins are sRGB images. Left linear, three.js brightens every colour and the
  // avatars come out pale and washed out.
  texture.colorSpace = SRGBColorSpace
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  texture.needsUpdate = true
  return texture
}

/**
 * Applies the skin texture to every skinned mesh of the base body.
 * The base body ships with an empty texture, so this always runs - with skin "0"
 * standing in when nothing is equipped.
 */
export function applySkin(rig, texture) {
  if (!texture) return
  for (const mesh of rig.skinnedMeshes) {
    if (!mesh.material) continue
    mesh.material.map = texture
    // Matte, like blocky avatars should be: no shiny highlights bleaching the colours.
    if ('roughness' in mesh.material) mesh.material.roughness = 1
    if ('metalness' in mesh.material) mesh.material.metalness = 0
    mesh.material.needsUpdate = true
  }
}

/**
 * Swaps a body part's geometry onto its base skinned mesh.
 *
 * A part GLB carries its own skeleton whose bone *order* may differ from the base
 * rig's. Its `skinIndex` attribute therefore has to be remapped by bone name, or the
 * limb deforms against the wrong bones.
 *
 * @param {object} rig from `collectRig`
 * @param {string} slot key of PART_SLOTS
 * @param {import('three').Object3D|null} partScene loaded GLB scene, or null to reset
 */
export function applyPart(rig, slot, partScene) {
  const targetMesh = rig.partMeshes[slot]
  if (!targetMesh) return

  // Unequipped / failed download: restore the part baked into player.glb.
  if (!partScene) {
    const original = rig.originalGeometries[slot]
    if (original && targetMesh.geometry !== original) targetMesh.geometry = original
    return
  }

  let skinnedSource = null
  let plainSource = null
  partScene.traverse((node) => {
    if (node.isSkinnedMesh && !skinnedSource) skinnedSource = node
    else if (node.isMesh && !plainSource) plainSource = node
  })

  if (!skinnedSource) {
    // Some parts ship as plain meshes; use them as-is.
    if (plainSource) targetMesh.geometry = plainSource.geometry
    return
  }

  const baseSkeleton = rig.skeleton
  if (!baseSkeleton || !skinnedSource.skeleton) {
    targetMesh.geometry = skinnedSource.geometry
    return
  }

  const geometry = skinnedSource.geometry.clone()

  const baseIndexByName = new Map()
  baseSkeleton.bones.forEach((bone, i) => baseIndexByName.set(bone.name, i))

  const remap = new Map()
  skinnedSource.skeleton.bones.forEach((bone, i) => {
    const baseIndex = baseIndexByName.get(bone.name)
    if (baseIndex !== undefined) remap.set(i, baseIndex)
  })

  const skinIndex = geometry.getAttribute('skinIndex')
  if (skinIndex) {
    const array = skinIndex.array
    for (let i = 0; i < array.length; i += 1) {
      const mapped = remap.get(array[i])
      if (mapped !== undefined) array[i] = mapped
    }
    skinIndex.needsUpdate = true
  }

  targetMesh.geometry = geometry
}

/**
 * Attaches a hat or back accessory to its bone.
 * Offsets are the SDK's own: hats sit at y=0.8 on `Neck1`, back items at the origin
 * of `Spine2`.
 */
export function attachAccessory(rig, kind, object) {
  const bone = kind === 'hat' ? rig.hatBone : rig.backBone
  if (!object || !bone) return null

  object.scale.setScalar(1)
  object.position.set(0, kind === 'hat' ? 0.8 : 0, 0)
  object.traverse((child) => {
    if (child.isMesh) child.castShadow = true
  })

  bone.add(object)
  return object
}

/**
 * Applies Bloxity body proportions.
 *
 * Must run every frame: each bone is reset to its rest transform before the
 * multipliers are re-applied, which is what makes the result idempotent and lets
 * proportion changes take effect live.
 *
 * `height`, `armLength`, `headScale` and `neckHeight` are applied exactly as the
 * Bloxity portal does, so the in-game body matches the preview. The remaining three
 * (`shoulderWidth`, `torsoScaleX`, `legOffsetX`) are not implemented in the SDK's
 * preview renderer; they are applied here in the spirit of their names and are the
 * ones to sanity-check against the portal.
 */
export function applyProportions(rig, proportions) {
  const skeleton = rig.skeleton
  if (!skeleton || !proportions) return

  const height = proportions.height ?? 1
  const armLength = proportions.armLength ?? 1
  const headScale = proportions.headScale ?? 1
  const neckHeight = proportions.neckHeight ?? 1
  const shoulderWidth = proportions.shoulderWidth ?? 1
  const torsoScaleX = proportions.torsoScaleX ?? 1
  const legOffsetX = proportions.legOffsetX ?? 1

  // Overall height is a scale on the character root, not on a bone.
  rig.root.scale.set(1, height, 1)

  for (const bone of skeleton.bones) {
    const rest = rig.bones[bone.name]
    if (!rest) continue

    const { origScale, origPos, origQuat } = rest
    bone.position.copy(origPos)
    bone.quaternion.copy(origQuat)
    bone.scale.copy(origScale)

    const name = bone.name

    if (name.startsWith('Arm')) {
      bone.scale.y = origScale.y * armLength
      // Not in the SDK preview: widen the shoulders by pushing the arm roots out.
      if (name === 'ArmL_Offset' || name === 'ArmR_Offset') {
        bone.position.x = origPos.x * shoulderWidth
      }
    } else if (name === NECK_OFFSET_BONE) {
      // Keeps the head sitting on the neck as height/headScale change, then applies
      // neckHeight against the bind-pose offset.
      bone.position.y += (height - headScale) * origPos.y
      bone.position.y += rig.neckOffsetBindY * (neckHeight - 1) * 0.8
    } else if (name === HAT_BONE) {
      // Divided by height so the head stays uniform inside the stretched root.
      bone.scale.set(
        origScale.x * headScale,
        origScale.y * (headScale / height),
        origScale.z * headScale,
      )
    } else if (name === BACK_BONE) {
      // Not in the SDK preview: torso width.
      bone.scale.x = origScale.x * torsoScaleX
    } else if (name === 'LegL_Offset' || name === 'LegR_Offset') {
      // Not in the SDK preview: leg splay, mirrored about the rig centre.
      bone.position.x = origPos.x * legOffsetX
    }
  }
}

/* ---------------------------------------------------------------------------
 * Procedural animation
 *
 * player.glb ships zero animation clips, so a walk/run/jump cycle has to be
 * driven directly on the bones. Rotations are *multiplied onto* whatever
 * applyProportions() just wrote, so this must run immediately after it in the
 * same frame - proportions reset each bone to its rest pose, which is exactly
 * the clean base a pose needs.
 * ------------------------------------------------------------------------- */

const _animQ = new Quaternion()

/**
 * Rotates a bone about one of its precomputed character-space axes.
 * `which` is 'axisX' (forward/back swing) or 'axisZ' (lateral sway).
 */
function rotateBone(rig, name, which, angle) {
  if (!angle) return
  const entry = rig.bones[name]
  const axis = entry?.[which]
  if (!axis) return
  entry.bone.quaternion.multiply(_animQ.setFromAxisAngle(axis, angle))
}

/** How far each leg angles out to the side when standing still (radians). */
const STANCE_SPLAY = 0.17

/** Swing a limb forward/back - the plane a walk cycle actually moves in. */
const swing = (rig, name, angle) => rotateBone(rig, name, 'axisX', angle)
/** Sway a limb out to the side. */
const sway = (rig, name, angle) => rotateBone(rig, name, 'axisZ', angle)

/**
 * Poses the rig for the current motion state.
 *
 * @param {object} rig from `collectRig`
 * @param {{ time: number, speed: number, grounded: boolean, maxSpeed: number }} motion
 *   `speed` is horizontal speed in world units/sec; `maxSpeed` is what counts as a
 *   full-amplitude run, so the cycle scales smoothly from a walk to a sprint.
 */
export function animateRig(rig, motion) {
  if (!rig?.skeleton || !motion) return

  const { time = 0, speed = 0, grounded = true, maxSpeed = 6 } = motion
  const ratio = Math.min(speed / Math.max(maxSpeed, 0.001), 1)

  rig.root.position.y = rig.rootRestY

  // Q leap: blade hauled up overhead with the body arched back, legs tucked, then
  // the whole body snaps forward into the chop as it comes down.
  if (motion.leap > 0) {
    const t = motion.leap
    const raise = Math.min(1, t / 0.3)
    const chop = t > 0.72 ? (t - 0.72) / 0.28 : 0
    swing(rig, 'ArmR1', -3.0 * raise + 2.4 * chop)
    swing(rig, 'ArmL1', -2.7 * raise + 2.0 * chop)
    swing(rig, 'ArmR2', -0.45 * (1 - chop))
    swing(rig, 'ArmL2', -0.35 * (1 - chop))
    swing(rig, 'Spine1', 0.22 * raise * (1 - chop) - 0.45 * chop)
    swing(rig, 'LegL1', -1.0)
    swing(rig, 'LegL2', 1.3)
    swing(rig, 'LegR1', 0.25)
    swing(rig, 'LegR2', 0.9)
    return
  }

  // Upper-body overlays run on top of the locomotion pose below.
  poseWeaponArm(rig, motion)

  // --- Airborne: tuck the legs, throw the arms up ---------------------------
  if (!grounded) {
    swing(rig, 'LegL1', -0.55)
    swing(rig, 'LegL2', 0.75)
    swing(rig, 'LegR1', 0.3)
    swing(rig, 'LegR2', 0.2)
    swing(rig, 'ArmL1', -2.1)
    swing(rig, 'ArmR1', -2.1)
    swing(rig, 'Spine1', -0.1)
    return
  }

  // --- Standing still, armed: a ready stance --------------------------------
  // Upright with the feet planted apart, one to each side; the free fist up as a
  // guard and the blade held out in front, breathing as it waits.
  if (ratio < 0.04 && motion.armed && !(motion.attack > 0 && motion.attack < 1)) {
    const idle = Math.sin(time * 2.2)
    sway(rig, 'LegL1', -STANCE_SPLAY)
    sway(rig, 'LegR1', STANCE_SPLAY)
    swing(rig, 'Spine1', -0.04 + idle * 0.02)
    if (!motion.skill || motion.skillT >= 1) {
      swing(rig, 'ArmL1', -0.95 + idle * 0.05)
      sway(rig, 'ArmL1', -0.3)
      swing(rig, 'ArmL2', -1.05)
      swing(rig, 'ArmR1', idle * 0.05)
    }
    rig.root.position.y = rig.rootRestY - 0.03 + idle * 0.02
    return
  }

  // --- Standing still: a slow breathing sway --------------------------------
  if (ratio < 0.04) {
    const idle = Math.sin(time * 1.6)
    sway(rig, 'LegL1', -STANCE_SPLAY)
    sway(rig, 'LegR1', STANCE_SPLAY)
    sway(rig, 'ArmL1', -0.07 - idle * 0.03)
    sway(rig, 'ArmR1', 0.07 + idle * 0.03)
    swing(rig, 'Spine1', idle * 0.02)
    rig.root.position.y = rig.rootRestY + idle * 0.03
    return
  }

  // --- Walk / run cycle -----------------------------------------------------
  // Step frequency rises with speed so a sprint doesn't look like a moonwalk.
  // Kept upright and even: a clean stride with the legs in full view, rather than
  // a crouched, leaning scurry.
  const phase = time * (6 + ratio * 4)
  const cycle = Math.sin(phase)
  const legAmp = 0.7 * ratio
  const armAmp = 0.6 * ratio

  // Legs swing in opposition; the knee folds a little as each foot comes through.
  swing(rig, 'LegL1', cycle * legAmp)
  swing(rig, 'LegR1', -cycle * legAmp)
  swing(rig, 'LegL2', Math.max(0, -cycle) * 0.55 * ratio)
  swing(rig, 'LegR2', Math.max(0, cycle) * 0.55 * ratio)

  // Arms counter-swing against the legs. The sword arm swings less while armed.
  const armed = motion.armed ? 0.25 : 1
  swing(rig, 'ArmL1', -cycle * armAmp)
  swing(rig, 'ArmR1', cycle * armAmp * armed)
  swing(rig, 'ArmL2', Math.max(0, cycle) * 0.5 * ratio)
  swing(rig, 'ArmR2', Math.max(0, -cycle) * 0.5 * ratio * armed)

  // Barely any lean, and a light bob once per step (twice per full cycle).
  swing(rig, 'Spine1', -0.04 * ratio)
  rig.root.position.y = rig.rootRestY + Math.abs(Math.cos(phase)) * 0.07 * ratio
}

/**
 * Sword-arm pose: a relaxed ready stance while armed, a wind-up-and-chop while
 * `motion.attack` runs 0 → 1, and per-skill poses while `motion.skill` is set.
 */
function poseWeaponArm(rig, motion) {
  const { attack = 0, skill = null, skillT = 0, armed = false } = motion

  if (skill === 'dash' && skillT < 1) {
    // Blade thrust forward, body low.
    swing(rig, 'ArmR1', -1.55)
    swing(rig, 'ArmR2', -0.2)
    swing(rig, 'ArmL1', 0.6)
    swing(rig, 'Spine1', -0.35)
    return
  }
  if (skill === 'earthsplitter' && skillT < 1) {
    // Both arms overhead, then slammed down at the midpoint.
    const up = skillT < 0.5 ? skillT / 0.5 : 1 - (skillT - 0.5) / 0.5
    swing(rig, 'ArmR1', -2.8 * up - 0.4 * (1 - up))
    swing(rig, 'ArmL1', -2.8 * up)
    swing(rig, 'Spine1', 0.25 * (1 - up))
    return
  }
  if (skill === 'whirlwind' && skillT < 1) {
    sway(rig, 'ArmR1', 1.4)
    sway(rig, 'ArmL1', -1.2)
    return
  }

  if (attack > 0 && attack < 1) {
    // Every move winds up over 0–0.35 and strikes through 0.35–1.
    const windup = Math.min(attack / 0.35, 1)
    const strike = easeOut(Math.max(0, (attack - 0.35) / 0.65))
    switch (motion.combo || 0) {
      case 1:
        // Sweep: arm out to the side, then across the body.
        swing(rig, 'ArmR1', -1.35)
        sway(rig, 'ArmR1', 1.7 * windup - 2.6 * strike)
        swing(rig, 'ArmR2', -0.25)
        sway(rig, 'Spine1', 0.3 * windup - 0.5 * strike)
        break
      case 2:
        // Uppercut: blade low and back, then ripped up overhead.
        swing(rig, 'ArmR1', 0.7 * windup - 3.2 * strike)
        swing(rig, 'ArmR2', -0.5 * (1 - strike))
        swing(rig, 'Spine1', 0.2 * windup - 0.25 * strike)
        break
      case 4:
        // Spin slash: blade held straight out while the whole body turns a full circle.
        swing(rig, 'ArmR1', -1.45)
        sway(rig, 'ArmR1', 1.25)
        swing(rig, 'ArmR2', -0.1)
        break
      case 3:
        // Thrust: pull back, then lunge forward with the arm straight.
        swing(rig, 'ArmR1', 0.4 * windup - 1.95 * strike)
        swing(rig, 'ArmR2', -1.1 * windup * (1 - strike))
        swing(rig, 'Spine1', 0.1 * windup - 0.4 * strike)
        break
      default:
        // Chop: over the head and down through.
        swing(rig, 'ArmR1', -2.9 * windup + 2.9 * strike)
        swing(rig, 'ArmR2', -0.35 * (1 - strike))
        swing(rig, 'Spine1', 0.3 * strike - 0.12 * windup)
    }
    return
  }

  if (armed) {
    swing(rig, 'ArmR1', READY_POSE.shoulder)
    sway(rig, 'ArmR1', READY_POSE.out)
    swing(rig, 'ArmR2', READY_POSE.elbow)
  }
}

/**
 * Guard stance for the sword arm: raised in front with the elbow bent, so the
 * held blade points up and forward, ready to strike. PlayerAvatar aims the grip
 * against this pose.
 */
export const READY_POSE = { shoulder: -0.85, out: 0.22, elbow: -0.75 }

const easeOut = (t) => 1 - (1 - t) * (1 - t)
