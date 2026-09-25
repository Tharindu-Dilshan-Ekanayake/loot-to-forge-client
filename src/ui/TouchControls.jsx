import { useEffect, useRef, useState } from 'react'

import { local } from '../game/bus'
import { useGame } from '../net/store'
import { skillFor } from '../shared/gameData'
import { IS_TOUCH } from './device'
import { SkillIcon, SwordIcon } from './Icons'

/** How far (px) the thumb travels from the stick's centre for full speed. */
const STICK_RADIUS = 56

/**
 * A floating thumbstick: touch anywhere in the lower-left of the screen and it
 * appears under your thumb; push to walk, push all the way to run. The view is
 * turned by dragging anywhere else (FollowCamera), and pinched to zoom.
 */
function Joystick() {
  const [active, setActive] = useState(null)
  const knob = useRef()
  const drag = useRef(null)

  useEffect(
    () => () => {
      local.stick.x = 0
      local.stick.y = 0
    },
    [],
  )

  const release = () => {
    drag.current = null
    local.stick.x = 0
    local.stick.y = 0
    if (knob.current) knob.current.style.transform = ''
    setActive(null)
  }

  // Lost capture too (a panel opening over it) lets go of the stick.
  return (
    <div
      className="touch-zone"
      onPointerDown={(e) => {
        if (drag.current) return
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
        // The stick is drawn inside the zone, so place it in the zone's coordinates.
        const r = e.currentTarget.getBoundingClientRect()
        setActive({ x: e.clientX - r.left, y: e.clientY - r.top })
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d || d.id !== e.pointerId) return
        let dx = e.clientX - d.x
        let dy = e.clientY - d.y
        const len = Math.hypot(dx, dy)
        if (len > STICK_RADIUS) {
          dx = (dx / len) * STICK_RADIUS
          dy = (dy / len) * STICK_RADIUS
        }
        local.stick.x = dx / STICK_RADIUS
        local.stick.y = -dy / STICK_RADIUS
        if (knob.current) knob.current.style.transform = `translate(${dx}px, ${dy}px)`
      }}
      onPointerUp={(e) => drag.current?.id === e.pointerId && release()}
      onPointerCancel={(e) => drag.current?.id === e.pointerId && release()}
      onLostPointerCapture={(e) => drag.current?.id === e.pointerId && release()}
    >
      <div className={`stick-base ${active ? 'on' : ''}`} style={active ? { left: active.x, top: active.y } : undefined}>
        <div ref={knob} className="stick-knob" />
      </div>
    </div>
  )
}

/** Fires `event` on press, and again every `ms` while held. */
function useHold(event, ms) {
  const timer = useRef(null)
  useEffect(() => () => clearInterval(timer.current), [])
  return {
    onPointerDown: (e) => {
      e.preventDefault()
      window.dispatchEvent(new Event(event))
      clearInterval(timer.current)
      if (ms) timer.current = setInterval(() => window.dispatchEvent(new Event(event)), ms)
    },
    onPointerUp: () => clearInterval(timer.current),
    onPointerCancel: () => clearInterval(timer.current),
    onPointerLeave: () => clearInterval(timer.current),
    onContextMenu: (e) => e.preventDefault(),
  }
}

function SkillButton() {
  const weaponId = useGame((s) => s.profile?.weaponId)
  const skillCd = useGame((s) => s.skillCd)
  const [now, setNow] = useState(0)
  const skill = weaponId && skillFor(weaponId)
  useEffect(() => {
    if (!skillCd) return undefined
    let raf
    const loop = () => {
      const t = performance.now()
      setNow(t)
      if (t < skillCd.until) raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [skillCd])
  const left = skillCd ? Math.max(0, skillCd.until - now) / 1000 : 0
  const pct = skillCd && left > 0 ? left / skillCd.total : 0
  const hold = useHold('ltf:skill', 0)
  return (
    <button type="button" className="touch-btn touch-skill" aria-label="Skill" {...hold}>
      {skill ? <SkillIcon skill={skill.key} size={44} /> : <span className="touch-btn-label">Q</span>}
      {pct > 0 && <span className="touch-cd" style={{ background: `conic-gradient(rgba(0,0,0,0.65) ${pct * 360}deg, transparent 0)` }} />}
    </button>
  )
}

/** Big attack button (hold to keep swinging), the skill, and jump, under the right thumb. */
function ActionPad() {
  const attack = useHold('ltf:attack', 160)
  const jump = useHold('ltf:jump', 0)
  return (
    <div className="touch-pad">
      <button type="button" className="touch-btn touch-attack" aria-label="Attack" {...attack}>
        <SwordIcon size={58} color="#fff" />
      </button>
      <SkillButton />
      <button type="button" className="touch-btn touch-jump" aria-label="Jump" {...jump}>
        <svg width="34" height="34" viewBox="0 0 64 64">
          <path d="M32 8 L54 34 H40 V56 H24 V34 H10 Z" fill="#fff" stroke="#151522" strokeWidth="5" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  )
}

/** On phones and tablets: thumbstick on the left, actions on the right. */
export function TouchControls() {
  const panel = useGame((s) => s.panel)
  const forging = useGame((s) => s.forging)
  if (!IS_TOUCH || forging || panel === 'forge') return null
  return (
    <div className={`touch-layer ${panel ? 'hidden' : ''}`}>
      <Joystick />
      <ActionPad />
    </div>
  )
}

export default TouchControls
