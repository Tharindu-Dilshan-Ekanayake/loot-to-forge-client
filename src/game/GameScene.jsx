import { Environment, Lightformer, PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { NeutralToneMapping } from 'three'

import { useBloxity } from '../bloxity/BloxityContext'
import { getRoom } from '../net/network'
import { useGame } from '../net/store'
import Atmosphere from './Atmosphere'
import Effects from './Effects'
import Enemy from './entities/Enemy'
import OreNode from './entities/OreNode'
import RemotePlayer from './entities/RemotePlayer'
import FollowCamera from './FollowCamera'
import { LabelProjector } from './labels'
import Player from './Player'
import LootDrops from './entities/LootDrops'
import Dungeon from './world/Dungeon'
import Hub from './world/Hub'

/**
 * Draws the whole world once with everything forced visible and unculled, so
 * every shader is compiled and every mesh and texture is on the GPU up front.
 * Without it, the first sight of each stage stalls the frame while the driver
 * compiles, a visible hitch as you walk through a gate.
 *
 * Runs once when the world mounts (then ends the loading screen) and once more
 * when the stage entities first arrive. It draws to the screen on purpose: an
 * offscreen target would compile different shader variants (no tone mapping).
 */
function Prewarm({ onDone }) {
  const hasEntities = useGame((s) => s.screen === 'playing' && s.enemyIds.length > 0)
  const st = useRef({ key: null, wait: 0, done: false })
  useFrame(({ gl, scene, camera }) => {
    const s = st.current
    if (s.key !== hasEntities) {
      // Give freshly mounted objects a frame to settle before drawing them.
      s.key = hasEntities
      s.wait = 2
    }
    if (s.wait === 0 || --s.wait > 0) return
    const restore = []
    scene.traverse((o) => {
      if (!o.visible) {
        o.visible = true
        restore.push(() => (o.visible = false))
      }
      if (o.frustumCulled) {
        o.frustumCulled = false
        restore.push(() => (o.frustumCulled = true))
      }
    })
    try {
      gl.render(scene, camera)
    } catch (err) {
      console.warn('[prewarm] failed', err)
    } finally {
      for (const undo of restore) undo()
    }
    if (!s.done) {
      s.done = true
      onDone()
    }
  })
  return null
}

/**
 * Every enemy and ore node in the dungeon, mounted once. Each hides itself
 * outside the stages around the player (stageWindow.js), so walking between
 * stages never mounts anything.
 */
function StageEntities() {
  const enemyIds = useGame((s) => s.enemyIds)
  const oreIds = useGame((s) => s.oreIds)
  if (!getRoom()) return null
  return (
    <>
      {enemyIds.map((id) => (
        <Enemy key={id} id={id} />
      ))}
      {oreIds.map((id) => (
        <OreNode key={id} id={id} />
      ))}
    </>
  )
}

function RemotePlayers() {
  const ids = useGame((s) => s.playerIds)
  const me = useGame((s) => s.sessionId)
  return ids.filter((id) => id !== me).map((id) => <RemotePlayer key={id} id={id} />)
}

/** Soft studio-style reflections without downloading an HDR. */
function Reflections() {
  return (
    <Environment resolution={128} environmentIntensity={0.25}>
      <Lightformer intensity={2.5} form="rect" position={[0, 10, -10]} scale={[20, 8, 1]} color="#dff1ff" />
      <Lightformer intensity={1.5} form="rect" position={[-10, 5, 10]} scale={[10, 10, 1]} color="#fff3d6" />
      <Lightformer intensity={1} form="ring" position={[10, 3, 0]} scale={6} color="#ffffff" />
      <color attach="background" args={['#6aa8e8']} />
    </Environment>
  )
}

export function GameScene() {
  const { game } = useBloxity()
  const playerBodyRef = useRef(null)
  const screen = useGame((s) => s.screen)
  const shadows = useGame((s) => s.settings.shadows)
  const loadingEnded = useRef(false)
  const playing = screen === 'playing'
  // Resolution adapts to the machine: drop it when frames slip, raise it back
  // when there's headroom, so the game stays smooth rather than sharp-but-choppy.
  const maxDpr = Math.min(1.75, window.devicePixelRatio || 1)
  const [dpr, setDpr] = useState(() => Math.min(1.5, maxDpr))

  const handleFirstFrame = useCallback(() => {
    if (loadingEnded.current) return
    loadingEnded.current = true
    useGame.setState({ worldReady: true })
    game.loadingEnd()
  }, [game])

  useEffect(() => {
    game.loadingStep('Building the castle…')
  }, [game])

  return (
    <Canvas
      shadows={shadows ? 'soft' : false}
      dpr={dpr}
      camera={{ position: [40, 26, 40], fov: 62, near: 0.3, far: 900 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl, scene }) => {
        // Dev only: lets the perf scripts read draw calls and scene size.
        if (import.meta.env.DEV) window.__three = { gl, scene }
        gl.toneMapping = NeutralToneMapping
        gl.toneMappingExposure = 1
      }}
    >
      <PerformanceMonitor
        flipflops={4}
        onIncline={() => setDpr((d) => Math.min(maxDpr, d + 0.25))}
        onDecline={() => setDpr((d) => Math.max(1, d - 0.25))}
        onFallback={() => setDpr(1)}
      />
      <Atmosphere />
      <Suspense fallback={null}>
        <Reflections />
      </Suspense>

      {/* Stepped first each frame, so everything after (the camera above all) reads
          this frame's interpolated body positions rather than last frame's. */}
      <Physics gravity={[0, -24, 0]} updatePriority={-1}>
        <Hub />
        <Dungeon />
        {playing && (
          <Suspense fallback={null}>
            <Player bodyRef={playerBodyRef} />
          </Suspense>
        )}
      </Physics>

      {playing && (
        <>
          <RemotePlayers />
          <StageEntities />
          <LootDrops />
        </>
      )}
      <Effects />
      <LabelProjector />
      <FollowCamera bodyRef={playerBodyRef} />
      <Prewarm onDone={handleFirstFrame} />
    </Canvas>
  )
}

export default GameScene
