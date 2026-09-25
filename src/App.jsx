import { useEffect, useState } from 'react'

import { prepareAudio, setVolumes, unlockAudio } from './audio/sound'
import GameScene from './game/GameScene'
import { setLabelLayer } from './game/labels'
import { useGame } from './net/store'
import Hud from './ui/Hud'
import { ForgeCinematic } from './ui/panels/ForgePanel'
import { PanelHost } from './ui/panels/MiscPanels'
import LoadingScreen from './ui/LoadingScreen'
import TouchControls from './ui/TouchControls'

/**
 * World labels and 3D signs are drawn with the Fredoka web font, so wait for it
 * (briefly) before building the scene — otherwise canvas text bakes in a fallback.
 */
function useFontsReady() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const done = () => setReady(true)
    const timeout = setTimeout(done, 2500)
    Promise.all([document.fonts.load('700 64px Fredoka'), document.fonts.load('600 32px Fredoka')])
      .then(done, done)
      .finally(() => clearTimeout(timeout))
    return () => clearTimeout(timeout)
  }, [])
  return ready
}

/** Keeps sound-effect volume in step with settings and unlocks audio on the first gesture. */
function AudioDirector() {
  const settings = useGame((s) => s.settings)

  useEffect(() => {
    // Built now, during loading: creating it can stall a frame or two, and on
    // the first key press that stall would land on your first step.
    prepareAudio()
    const unlock = () => unlockAudio()
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  useEffect(() => {
    setVolumes({ sfx: settings.muted ? 0 : settings.sfx })
  }, [settings.sfx, settings.muted])

  return null
}

function App() {
  const fontsReady = useFontsReady()
  const screen = useGame((s) => s.screen)
  const showNames = useGame((s) => s.settings.names)
  // Reset by the network layer on disconnect, so the loading screen comes back and rejoins.
  const entered = useGame((s) => s.entered)
  const playing = screen === 'playing'

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#0b0f1c]">
      <div id="labels" ref={setLabelLayer} className={showNames ? '' : 'hidden-names'} />
      {fontsReady && <GameScene />}
      <AudioDirector />
      {playing && (
        <>
          <Hud />
          <TouchControls />
          <PanelHost />
          <ForgeCinematic />
        </>
      )}
      {!(entered && playing) && <LoadingScreen onDone={() => useGame.setState({ entered: true })} />}
    </div>
  )
}

export default App
