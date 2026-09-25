import { useEffect, useRef, useState } from 'react'

import { useBloxity } from '../bloxity/BloxityContext'
import { guestName, lookOrGuest } from '../bloxity/guest'
import { identityAvatarUrl, identityName } from '../bloxity/sdk'
import { connect } from '../net/network'
import { useGame } from '../net/store'
import { Btn, St } from './common'
import { OreIcon, WeaponIcon } from './Icons'

/** A stable key for the player's saved progress: Bloxity user, else a local guest id. */
function playerKey(identity, isLoggedIn) {
  const id = identity?.id ?? identity?.userId ?? identity?.guestId ?? identity?.username
  if (isLoggedIn && id) return `bloxity:${id}`
  try {
    let g = localStorage.getItem('ltf.guestKey')
    if (!g) {
      g = `guest:${Math.random().toString(36).slice(2, 12)}`
      localStorage.setItem('ltf.guestKey', g)
    }
    return g
  } catch {
    return `guest:${Math.random().toString(36).slice(2, 12)}`
  }
}

/** How long to wait for the Bloxity session before joining as a guest anyway. */
const SESSION_WAIT_MS = 4000

/** Tips that rotate under the loading bar. */
const TIPS = [
  'Click fast to chain a 5-hit combo, ending in a spin slash!',
  'Press Q to leap forward and smash the ground.',
  'Stand on a training pad to train by yourself.',
  'Bring ores to the Forge and pick Sword or Axe.',
  'Upgrade your bag at the Shop to carry more ores.',
  'Red barrier: clear the stage. Blue barrier: walk on through!',
  'Press H any time to head Home.',
]

/** Ores drifting up the background: [ore, left %, size, delay s, duration s]. */
const FLOATERS = [
  ['ruby', 8, 54, 0, 9],
  ['sapphire', 20, 40, 3, 11],
  ['gold', 33, 46, 6, 10],
  ['emerald', 66, 44, 1.5, 12],
  ['amethyst', 78, 56, 4.5, 9.5],
  ['jade', 90, 38, 7, 11],
]

/** A row of castle towers along the bottom edge. */
function CastleSkyline() {
  const towers = [
    [0, 90, 150], [70, 60, 110], [120, 110, 190], [220, 70, 130], [280, 90, 160],
    [360, 60, 120], [410, 120, 210], [520, 70, 140], [580, 100, 175], [670, 60, 115],
    [720, 110, 200], [820, 80, 145], [890, 100, 170], [980, 70, 130],
  ]
  return (
    <svg className="ls-castle" viewBox="0 0 1060 220" preserveAspectRatio="none" aria-hidden="true">
      {towers.map(([x, w, h]) => (
        <g key={x}>
          <rect x={x} y={220 - h} width={w} height={h} />
          {Array.from({ length: Math.floor(w / 20) }, (_, i) => (
            <rect key={i} x={x + i * 20 + 2} y={220 - h - 12} width={12} height={12} />
          ))}
        </g>
      ))}
    </svg>
  )
}

/**
 * The "+1 Loot to Forge" loading screen. Joins the first lobby with a free seat
 * (the server opens a new one once every lobby holds 8), fills its bar 0 → 100%
 * as the world, session and server come up, then drops straight into the lobby.
 */
export function LoadingScreen({ onDone }) {
  const { identity, isLoggedIn, status, avatar, proportions } = useBloxity()
  const screen = useGame((s) => s.screen)
  const connError = useGame((s) => s.connError)
  const worldReady = useGame((s) => s.worldReady)
  const [pct, setPct] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const [sessionTimedOut, setSessionTimedOut] = useState(false)
  const attempted = useRef(false)

  const sessionSettled = status === 'ready' || status === 'error' || sessionTimedOut
  const playing = screen === 'playing'
  const failed = screen === 'title' && Boolean(connError)

  const join = () => {
    attempted.current = true
    connect({
      name: identityName(identity) || guestName(),
      key: playerKey(identity, isLoggedIn),
      avatar: JSON.stringify({ e: lookOrGuest(avatar), p: proportions || null }),
      pfp: (isLoggedIn && identityAvatarUrl(identity)) || '',
    })
  }

  useEffect(() => {
    const id = setTimeout(() => setSessionTimedOut(true), SESSION_WAIT_MS)
    return () => clearTimeout(id)
  }, [])

  // Join once, as soon as we know who the player is.
  useEffect(() => {
    if (!sessionSettled || attempted.current || screen !== 'title') return
    join()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionSettled, screen])

  // Ease the bar toward how far loading has really got, creeping so it never stalls.
  const target = playing ? 100 : 12 + (worldReady ? 38 : 0) + (sessionSettled ? 20 : 0) + (screen === 'connecting' ? 18 : 0)
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const tick = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      setPct((p) => {
        const cap = target >= 100 ? 100 : target - 1
        if (p >= cap) return p
        return Math.min(cap, p + Math.max((cap - p) * dt * 3, dt * (target >= 100 ? 60 : 4)))
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])

  useEffect(() => {
    if (!playing || pct < 100 || leaving) return undefined
    const fade = setTimeout(() => setLeaving(true), 250)
    const done = setTimeout(() => onDone?.(), 700)
    return () => {
      clearTimeout(fade)
      clearTimeout(done)
    }
  }, [playing, pct, leaving, onDone])

  const shown = Math.floor(pct)
  const [tip, setTip] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTip((t) => (t + 1) % TIPS.length), 3200)
    return () => clearInterval(id)
  }, [])

  return (
    <div
      className="hud-scale absolute inset-0 z-50 flex flex-col items-center justify-center transition-opacity duration-500"
      style={{
        opacity: leaving ? 0 : 1,
        pointerEvents: leaving ? 'none' : 'auto',
        background: 'radial-gradient(ellipse at 50% 42%, #3a55c8 0%, #1d2a78 38%, #0d1440 70%, #060818 100%)',
      }}
    >
      {/* Background: slow light rays, drifting ores, twinkles and a castle skyline. */}
      <div className="ls-rays pointer-events-none" />
      {FLOATERS.map(([ore, left, size, delay, dur]) => (
        <div key={ore} className="ls-float pointer-events-none" style={{ left: `${left}%`, animationDelay: `${delay}s`, animationDuration: `${dur}s` }}>
          <OreIcon type={ore} size={size} />
        </div>
      ))}
      {Array.from({ length: 18 }, (_, i) => (
        <span
          key={i}
          className="ls-twinkle pointer-events-none"
          style={{ left: `${(i * 53) % 100}%`, top: `${(i * 37) % 70}%`, animationDelay: `${(i % 6) * 0.45}s` }}
        />
      ))}
      <CastleSkyline />

      <div className="ls-logo relative flex flex-col items-center">
        {/* Two blades crossed behind the title, swaying. */}
        <div className="ls-sword ls-sword-l pointer-events-none absolute">
          <WeaponIcon weaponId="golden_dragon" size={210} />
        </div>
        <div className="ls-sword ls-sword-r pointer-events-none absolute">
          <WeaponIcon weaponId="azure_apex" size={210} />
        </div>
        <St className="new-tag ls-plus !text-[84px]" style={{ transform: 'rotate(-8deg)' }}>
          +1
        </St>
        <St className="grad-gold ls-title -mt-4 text-[150px] leading-none italic" style={{ transform: 'rotate(-4deg)' }}>
          LOOT
        </St>
        <St className="ls-title text-[96px] leading-none italic" style={{ transform: 'rotate(-4deg)', color: '#8fe0ff' }}>
          TO FORGE
        </St>
        <div className="ls-ores mt-6 flex gap-2">
          <OreIcon type="ruby" size={58} />
          <OreIcon type="gold" size={58} />
          <OreIcon type="sapphire" size={58} />
        </div>
      </div>

      <div className="mt-10 flex w-[640px] max-w-[88vw] flex-col items-center gap-3">
        {failed ? (
          <>
            <St className="st-thin text-center text-lg" style={{ color: '#ff9a8a' }}>
              {connError}
            </St>
            <Btn variant="gold" className="px-10 text-3xl" onClick={join}>
              Retry
            </Btn>
          </>
        ) : (
          <>
            <div className="ls-bar relative h-[44px] w-full">
              <div className="ls-fill" style={{ width: `${pct}%` }} />
              {/* A little sword rides the leading edge of the bar. */}
              <div className="ls-rider pointer-events-none absolute" style={{ left: `calc(${pct}% - 26px)` }}>
                <WeaponIcon weaponId="solar_crown" size={52} />
              </div>
              <div className="absolute inset-0 grid place-items-center">
                <St className="text-2xl">{shown}%</St>
              </div>
            </div>
            <St className="text-xl" style={{ color: '#ffe07a' }}>
              {playing ? 'Entering the lobby…' : screen === 'connecting' ? 'Finding a lobby…' : worldReady ? 'Loading player…' : 'Building the castle…'}
            </St>
            <div key={tip} className="ls-tip">
              <St className="st-thin text-lg">💡 {TIPS[tip]}</St>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default LoadingScreen
