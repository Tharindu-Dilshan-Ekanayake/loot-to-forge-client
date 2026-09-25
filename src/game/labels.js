import { useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { Vector3 } from 'three'

/**
 * World-anchored DOM labels: name plates, enemy health bars and floating damage
 * numbers. DOM text stays crisp and uses the UI font, and one projector pass per
 * frame moves every label — far cheaper than a React root per label.
 */

let layer = null
const anchors = new Map()
const floaters = new Set()
const _v = new Vector3()

export function setLabelLayer(el) {
  layer = el
}

/**
 * Registers a label that follows `getPos()` (world space).
 * `update(el, dist)` runs every frame the label is visible — keep it cheap and only
 * touch the DOM when a value actually changed.
 */
export function addAnchor(id, { el, getPos, offsetY = 0, maxDist = 60, update }) {
  if (!layer) return () => {}
  layer.appendChild(el)
  anchors.set(id, { el, getPos, offsetY, maxDist, update, visible: true })
  return () => {
    anchors.delete(id)
    el.remove()
  }
}

/**
 * A number that pops up at a world position, drifts up and fades. `text` may be a
 * list of [text, className] parts, so an emoji can sit beside gradient-filled digits.
 */
export function floatText(pos, text, className = '', { life = 1000, rise = 1.6, jitter = 0.8 } = {}) {
  if (!layer) return
  const el = document.createElement('div')
  el.className = `float-text ${className}`
  if (Array.isArray(text)) for (const [t, cls] of text) el.appendChild(h('span', cls, t))
  else el.textContent = text
  layer.appendChild(el)
  floaters.add({
    el,
    pos: new Vector3(pos.x + (Math.random() - 0.5) * jitter, pos.y, pos.z + (Math.random() - 0.5) * jitter),
    born: performance.now(),
    life,
    rise,
  })
}

function place(el, camera, size, pos, maxDist, extraScale = 1) {
  _v.copy(pos)
  const dist = _v.distanceTo(camera.position)
  _v.project(camera)
  if (_v.z > 1 || _v.z < -1 || dist > maxDist || Math.abs(_v.x) > 1.2 || Math.abs(_v.y) > 1.2) {
    return -1
  }
  const x = (_v.x * 0.5 + 0.5) * size.width
  const y = (-_v.y * 0.5 + 0.5) * size.height
  const scale = Math.max(0.45, Math.min(1.15, 14 / dist)) * extraScale
  el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%) scale(${scale.toFixed(3)})`
  return dist
}

/** Mount once inside the Canvas. */
export function LabelProjector() {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)

  useEffect(
    () => () => {
      for (const f of floaters) f.el.remove()
      floaters.clear()
    },
    [],
  )

  useFrame(() => {
    // The follow camera moved it this frame, but three only refreshes the view
    // matrix at render time: without this, labels are placed with last frame's.
    camera.updateMatrixWorld()
    for (const a of anchors.values()) {
      const p = a.getPos()
      let dist = -1
      if (p) {
        _v.copy(p)
        _v.y += a.offsetY
        dist = place(a.el, camera, size, _v, a.maxDist)
      }
      const show = dist >= 0
      if (show !== a.visible) {
        a.visible = show
        a.el.style.display = show ? '' : 'none'
      }
      if (show && a.update) a.update(a.el, dist)
    }

    const now = performance.now()
    for (const f of floaters) {
      const t = (now - f.born) / f.life
      if (t >= 1) {
        f.el.remove()
        floaters.delete(f)
        continue
      }
      _v.copy(f.pos)
      _v.y += t * f.rise
      const pop = t < 0.12 ? 0.6 + (t / 0.12) * 0.7 : 1.3 - Math.min(0.3, (t - 0.12) * 1.2)
      if (place(f.el, camera, size, _v, 90, pop) < 0) f.el.style.opacity = '0'
      else f.el.style.opacity = String(t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1)
    }
  })

  return null
}

/** Tiny DOM builder: h('div', 'class', [children|text]). */
export function h(tag, className, children) {
  const el = document.createElement(tag)
  if (className) el.className = className
  if (typeof children === 'string') el.textContent = children
  else if (children) for (const c of children) el.appendChild(c)
  return el
}

/**
 * A player's name tag: just the bold name over their head — no headshot, no
 * damage readout, kept deliberately plain. `set`/`setPfp` keep their old
 * signatures (callers still pass damage/a picture) but only the name renders.
 */
export function makeNameTag(className = '') {
  const name = h('div', 'wl-name', '')
  const el = h('div', `wl-player ${className}`, [name])
  let lastName = ''
  return {
    el,
    set(n) {
      if (n === lastName) return
      lastName = n
      name.textContent = n
    },
    setPfp() {},
  }
}

/** Enemy / event-ore health plate: name over a green bar with "hp/max". */
export function makeHealthPlate(name, className = '') {
  const title = h('div', 'wl-title', name)
  const fill = h('div', 'wl-bar-fill')
  const text = h('div', 'wl-bar-text', '')
  const bar = h('div', 'wl-bar', [fill, text])
  const el = h('div', `wl-plate ${className}`, [title, bar])
  let last = ''
  return {
    el,
    set(hp, max, fmt) {
      const key = `${Math.ceil(hp)}|${max}`
      if (key === last) return
      last = key
      const pct = Math.max(0, Math.min(1, hp / max))
      fill.style.width = `${pct * 100}%`
      fill.style.background = pct > 0.5 ? '' : pct > 0.25 ? 'linear-gradient(#ffd23b,#e0a000)' : 'linear-gradient(#ff5a4e,#c01a1a)'
      text.textContent = `${fmt(Math.ceil(hp))}/${fmt(max)}`
    },
  }
}
