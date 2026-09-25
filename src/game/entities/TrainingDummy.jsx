import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'

import { fx } from '../bus'
import Merged from '../Merged'
import { mat } from '../textures'
import { Block, BlockyCharacter } from '../world/props'
import WeaponModel from './WeaponModel'

/** Dummies shake when hit: keep them out of the world's static batching. */
const NO_BATCH = { noBatch: true }

let targetTex = null
function targetTexture() {
  if (targetTex) return targetTex
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#f4efe2'
  ctx.fillRect(0, 0, 256, 256)
  for (const [r, col] of [
    [96, '#e0202c'],
    [74, '#f4efe2'],
    [52, '#e0202c'],
    [30, '#f4efe2'],
    [14, '#e0202c'],
  ]) {
    ctx.fillStyle = col
    ctx.beginPath()
    ctx.arc(128, 128, r, 0, Math.PI * 2)
    ctx.fill()
  }
  targetTex = new CanvasTexture(c)
  targetTex.colorSpace = SRGBColorSpace
  return targetTex
}

const LOOKS = {
  goblin: { skin: '#62c94a', shirt: '#8a5a30', pants: '#5a3a1e', face: 'angry', weapon: 'woodcutter' },
  knight: { skin: '#f5d36b', shirt: '#9aa0a8', pants: '#5b6070', face: 'angry', hat: 'helmet', weapon: 'iron_blade' },
  skeleton: { skin: '#f0eee4', shirt: '#d8d4c6', pants: '#c8c4b4', face: 'skull', weapon: 'ronin_blade' },
  frost: { skin: '#bfe8ff', shirt: '#5f9fd6', pants: '#3b6f9a', face: 'glow', hat: 'crown', hatColor: '#9fe6ff', weapon: 'frost_splitter', glow: '#7fe3ff' },
  demon: { skin: '#b3261e', shirt: '#2a0505', pants: '#1a0202', face: 'glow', hat: 'horns', weapon: 'hellfire_reaper', glow: '#ff5a3b' },
  void: { skin: '#3a2a6e', shirt: '#2a1d52', pants: '#1b1238', face: 'glow', hat: 'wizard', hatColor: '#2a1d52', weapon: 'voidwhisper', glow: '#c64dff' },
  shadow: { skin: '#2a2440', shirt: '#1c1830', pants: '#120e20', face: 'glow', hat: 'spikes', hatColor: '#8a6aff', weapon: 'oni_slayer', glow: '#8a6aff' },
  crystal: { skin: '#e8d6ff', shirt: '#6a4aa0', pants: '#3a2a6e', face: 'glow', hat: 'crown', hatColor: '#5ff0ff', weapon: 'amethyst_oath', glow: '#5ff0ff' },
  celestial: { skin: '#fff3d0', shirt: '#ffe07a', pants: '#c3cbff', face: 'glow', hat: 'crown', hatColor: '#ffffff', weapon: 'celestial_verdict', glow: '#ffe07a' },
}

/** A training target. Swaying on hit is the whole AI. */
export function TrainingDummy({ dummy }) {
  const ref = useRef()
  const hitAt = useRef(-10)
  const pose = useRef({ walk: 0, attack: 0 })
  const faceMat = useMemo(() => mat('#ffffff', { map: targetTexture() }), [])

  useEffect(
    () =>
      fx.on((t, data) => {
        if (t === 'hit' && data.kind === 'dummy' && data.id === dummy.id) hitAt.current = performance.now()
      }),
    [dummy.id],
  )

  useFrame(({ clock }) => {
    if (!ref.current) return
    const ht = (performance.now() - hitAt.current) / 400
    const k = ht < 1 ? 1 - ht : 0
    ref.current.rotation.x = -Math.sin(ht * 18) * k * 0.25
    if (dummy.look !== 'target') ref.current.rotation.y = Math.sin(clock.elapsedTime * 0.8 + dummy.pos[2]) * 0.15
  })

  const [x, y, z] = dummy.pos

  if (dummy.look === 'target') {
    return (
      <group position={[x, y, z]} rotation={[0, -Math.PI / 2, 0]} userData={NO_BATCH}>
        <Block size={[0.5, 1.6, 0.5]} base m="woodDark" tile={2} />
        <Block size={[1.8, 0.35, 1.8]} base m="woodDark" tile={2} />
        <Merged ref={ref} position={[0, 1.4, 0]}>
          <Block size={[0.35, 1.8, 0.35]} base m="wood" tile={2} />
          <Block size={[2, 2, 0.5]} position={[0, 2.4, 0]} m="#f4efe2" />
          <mesh position={[0, 2.4, 0.26]} material={faceMat}>
            <planeGeometry args={[1.9, 1.9]} />
          </mesh>
          <mesh position={[0, 2.4, -0.26]} rotation={[0, Math.PI, 0]} material={faceMat}>
            <planeGeometry args={[1.9, 1.9]} />
          </mesh>
        </Merged>
      </group>
    )
  }

  const look = LOOKS[dummy.look] || LOOKS.goblin
  return (
    <group position={[x, y, z]} rotation={[0, Math.PI / 2, 0]} userData={NO_BATCH}>
      <group ref={ref}>
        <BlockyCharacter
          scale={0.42}
          skin={look.skin}
          shirt={look.shirt}
          pants={look.pants}
          face={look.face}
          hat={look.hat}
          hatColor={look.hatColor}
          emissive={look.glow}
          pose={pose}
          held={<WeaponModel weaponId={look.weapon} scale={2.6} />}
        />
      </group>
    </group>
  )
}

export default TrainingDummy
