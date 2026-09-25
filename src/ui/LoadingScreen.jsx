import { useEffect, useRef, useState } from 'react'

import { useBloxity } from '../bloxity/BloxityContext'
import { guestName, lookOrGuest } from '../bloxity/guest'
import { identityAvatarUrl, identityName } from '../bloxity/sdk'
import { connect } from '../net/network'
import { useGame } from '../net/store'
import { Btn, St } from './common'

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
  'Press Q to leap at an enemy and strike it down.',
  'Press V to turn Auto Fight on or off.',
  'Forge armor to raise your max health.',
  'Stand on a training pad to train by yourself.',
  'Bring ores to the Forge and pick Sword or Axe.',
  'Upgrade your bag at the Shop to carry more ores.',
  'Red barrier: clear the stage. Blue barrier: walk on through!',
  'Press H any time to head Home.',
]

/** One sword standing point-up, centred on (100, 100) so two can be crossed about it. */
function Sword({ angle, guard }) {
  return (
    <g transform={`rotate(${angle} 100 100)`}>
      {/* Blade: a bright edge on the left, a shaded one on the right, a fuller down the middle. */}
      <path d="M100 8 L110 26 L110 132 L90 132 L90 26 Z" fill="url(#lsBlade)" stroke="#151522" strokeWidth="4" strokeLinejoin="round" />
      <path d="M100 8 L110 26 L110 132 L100 132 Z" fill="#000" opacity="0.14" />
      <rect x="98" y="30" width="4" height="96" rx="2" fill="#9aa6bd" />
      {/* Cross-guard with round ends and a gem */}
      <rect x="70" y="130" width="60" height="12" rx="6" fill={guard} stroke="#151522" strokeWidth="4" />
      <circle cx="100" cy="136" r="5" fill="#ff4d5e" stroke="#151522" strokeWidth="2" />
      {/* Wrapped grip and pommel */}
      <rect x="94" y="142" width="12" height="32" rx="3" fill="#5a3418" stroke="#151522" strokeWidth="4" />
      {[150, 158, 166].map((y) => (
        <line key={y} x1="95" y1={y} x2="105" y2={y + 4} stroke="#3a2010" strokeWidth="2" />
      ))}
      <circle cx="100" cy="181" r="8" fill={guard} stroke="#151522" strokeWidth="4" />
    </g>
  )
}

/** Two swords crossed in an X: the game's emblem. */
function CrossedSwords({ size = 190 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" aria-hidden="true">
      <defs>
        <linearGradient id="lsBlade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#dfe7f5" />
          <stop offset="1" stopColor="#b8c4da" />
        </linearGradient>
      </defs>
      <Sword angle={-38} guard="#ffc629" />
      <Sword angle={38} guard="#ffc629" />
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
        background: 'radial-gradient(ellipse at 50% 40%, #243a8f 0%, #16215e 45%, #0b1130 100%)',
      }}
    >
      <div className="ls-logo relative flex flex-col items-center">
        <CrossedSwords />
        <div className="relative -mt-8 flex items-start">
          <St className="grad-gold ls-title text-[132px] leading-none">LOOT</St>
          <St className="new-tag ls-plus absolute -right-16 -top-3 !text-[54px]">+1</St>
        </div>
        <St className="ls-title -mt-2 text-[84px] leading-none" style={{ color: '#8fe0ff' }}>
          TO FORGE
        </St>
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
            <div className="ls-bar relative h-[40px] w-full">
              <div className="ls-fill" style={{ width: `${pct}%` }} />
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
