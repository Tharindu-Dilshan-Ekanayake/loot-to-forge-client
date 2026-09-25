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
      /** Local axis to rotate about for a twist round the vertical. */
      entry.axisY = new Vector3(0, 1, 0).applyQuaternion(relInv).normalize()
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
const STANCE_SPLAY = 0.04
/** The idle stance fades out over this much of full stride as you speed up. */
const IDLE_BLEND = 0.25

/** Swing a limb forward/back - the plane a walk cycle actually moves in. */
const swing = (rig, name, angle) => rotateBone(rig, name, 'axisX', angle)
/** Sway a limb out to the side. */
const sway = (rig, name, angle) => rotateBone(rig, name, 'axisZ', angle)
/** Twist about the vertical (the spine turning into a swing). */
const twist = (rig, name, angle) => rotateBone(rig, name, 'axisY', angle)

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
  const pace = speed / Math.max(maxSpeed, 0.001)
  const ratio = Math.min(pace, 1)

  // The stride's phase is advanced by each frame's step rather than computed as
  // time * rate: with a long-running clock, any change in rate (setting off,
  // stopping, sprinting, even tiny speed wobbles) would jump the phase by
  // hundreds of radians and flick the legs to a random pose every frame.
  const dt = Math.min(0.1, Math.max(0, time - (rig.animTime ?? time)))
  rig.animTime = time
  // Step frequency rises with speed (up to a sprint) so a run doesn't look like a moonwalk.
  rig.stridePhase = ((rig.stridePhase ?? 0) + dt * (6.5 + Math.min(pace, 1.6) * 4)) % (Math.PI * 2)

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

  // --- A strike on the ground: step in onto a bent front knee --------------
  // The left foot plants forward with the knee bent, the back leg stretches out
  // behind and the body drops and leans into the blow, then rises back up.
  const attack = motion.attack || 0
  if (grounded && attack > 0 && attack < 1 && (motion.combo || 0) !== 4) {
    const lunge = Math.sin(Math.min(1, attack / 0.35) * (Math.PI / 2)) * (attack > 0.75 ? (1 - attack) / 0.25 : 1)
    const walk = ratio * 0.4
    swing(rig, 'LegL1', -0.85 * lunge + Math.sin(time * 10) * walk)
    swing(rig, 'LegL2', 1.0 * lunge)
    swing(rig, 'LegR1', 0.55 * lunge - Math.sin(time * 10) * walk)
    swing(rig, 'LegR2', 0.25 * lunge)
    swing(rig, 'Spine1', -0.22 * lunge)
    swing(rig, 'ArmL1', 0.5 * lunge)
    rig.root.position.y = rig.rootRestY - 0.22 * lunge
    return
  }

  // --- Standing still: a slow breathing sway --------------------------------
  // Faded out as the walk fades in, so setting off and stopping blend instead
  // of snapping between two poses.
  const still = Math.max(0, 1 - ratio / IDLE_BLEND)
  const idle = Math.sin(time * 1.6)
  if (still > 0) {
    // Standing normally, feet under the hips, breathing.
    sway(rig, 'LegL1', -STANCE_SPLAY * still)
    sway(rig, 'LegR1', STANCE_SPLAY * still)
    sway(rig, 'ArmL1', (-0.07 - idle * 0.03) * still)
    if (!motion.armed) sway(rig, 'ArmR1', (0.07 + idle * 0.03) * still)
    swing(rig, 'Spine1', idle * 0.02 * still)
  }
  if (ratio < 0.01) {
    rig.root.position.y = rig.rootRestY + idle * 0.03
    return
  }

  // --- Walk / run cycle -----------------------------------------------------
  // Kept upright and even: a clean stride with the legs in full view, rather than
  // a crouched, leaning scurry.
  const phase = rig.stridePhase
  const cycle = Math.sin(phase)
  const legAmp = 0.95 * ratio
  const armAmp = 0.85 * ratio

  // Legs swing in opposition; the knee folds as each foot comes through.
  swing(rig, 'LegL1', cycle * legAmp)
  swing(rig, 'LegR1', -cycle * legAmp)
  swing(rig, 'LegL2', Math.max(0, -cycle) * 1.0 * ratio)
  swing(rig, 'LegR2', Math.max(0, cycle) * 1.0 * ratio)

  // The free arm counter-swings; the sword arm keeps the blade on its shoulder
  // (see poseWeaponArm) and only rocks with the step.
  swing(rig, 'ArmL1', -cycle * armAmp)
  swing(rig, 'ArmL2', -Math.max(0, cycle) * 0.6 * ratio)
  if (motion.armed) swing(rig, 'ArmR1', cycle * 0.08 * ratio)
  else {
    swing(rig, 'ArmR1', cycle * armAmp)
    swing(rig, 'ArmR2', -Math.max(0, -cycle) * 0.6 * ratio)
  }

  // A little lean into the stride, and a bob once per step.
  swing(rig, 'Spine1', -0.1 * ratio)
  sway(rig, 'Spine1', cycle * 0.05 * ratio)
  rig.root.position.y = rig.rootRestY + idle * 0.03 * still + Math.abs(Math.cos(phase)) * 0.14 * ratio
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
    if ((motion.combo || 0) === 4) {
      // Spin slash: blade held straight out while the whole body turns a full circle.
      swing(rig, 'ArmR1', -1.5)
      sway(rig, 'ArmR1', 1.3)
      swing(rig, 'ArmR2', -0.1)
      return
    }
    // A flat, circular sweep: the blade comes off the shoulder out to one side,
    // arm straight and level, and scythes round in front of you to the other
    // side, the body turning with it; then it settles back onto the shoulder.
    // Alternate clicks sweep in opposite directions.
    const dir = (motion.combo || 0) % 2 === 0 ? 1 : -1
    const wind = easeOut(Math.min(1, attack / 0.22))
    const strike = easeOut(Math.min(1, Math.max(0, (attack - 0.22) / 0.55)))
    const settle = smooth(Math.min(1, Math.max(0, (attack - 0.8) / 0.2)))
    const from = dir > 0 ? 1.9 : -1.5
    const to = dir > 0 ? -1.5 : 1.9
    const armOut = from + (to - from) * strike
    const blend = (sweepV, carryV) => sweepV + (carryV - sweepV) * settle
    // Wind-up lifts it off the shoulder into the level sweep.
    const lift = (a, b) => a + (b - a) * wind
    swing(rig, 'ArmR1', blend(lift(CARRY_POSE.shoulder, -1.5), CARRY_POSE.shoulder))
    sway(rig, 'ArmR1', blend(lift(CARRY_POSE.out, armOut), CARRY_POSE.out))
    swing(rig, 'ArmR2', blend(lift(CARRY_POSE.elbow, -0.12), CARRY_POSE.elbow))
    twist(rig, 'Spine1', dir * (0.45 * wind - 0.95 * strike) * (1 - settle))
    swing(rig, 'ArmL1', -0.4 * wind * (1 - settle))
    return
  }

  if (armed) {
    // The blade rests on the shoulder, standing or on the move.
    swing(rig, 'ArmR1', CARRY_POSE.shoulder)
    sway(rig, 'ArmR1', CARRY_POSE.out)
    swing(rig, 'ArmR2', CARRY_POSE.elbow)
  }
}

/**
 * Carrying the blade on the shoulder: hand up in front of the shoulder, elbow
 * folded, so the blade leans back over the sword-side shoulder. Solved against
 * the grip PlayerAvatar aims for READY_POSE.
 */
const CARRY_POSE = { shoulder: -0.1, out: 0.45, elbow: -2.55 }

const smooth = (t) => t * t * (3 - 2 * t)

/**
 * Relaxed sword-arm stance: hanging by the hip, a little forward and out, so the
 * held blade juts out to the side. PlayerAvatar aims the grip against this pose.
 */
export const READY_POSE = { shoulder: -0.3, out: 0.16, elbow: -0.3 }

const easeOut = (t) => 1 - (1 - t) * (1 - t)
