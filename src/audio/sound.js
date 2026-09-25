/**
 * All game audio, synthesised with the Web Audio API — no sound files to ship or
 * license. `sfx(name)` plays a one-shot.
 *
 * Browsers only allow audio after a user gesture, so the context is created lazily
 * by `unlockAudio()`, which the app calls on the first click / key press.
 */

let ctx = null
let master = null
let sfxBus = null
let noiseBuffer = null
let volumes = { sfx: 0.8 }

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = 0.9
    // A gentle compressor keeps stacked hits from clipping.
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.ratio.value = 4
    master.connect(comp).connect(ctx.destination)
    sfxBus = ctx.createGain()
    sfxBus.connect(master)
    applyVolumes()

    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1
  }
  if (ctx.state === 'suspended') ctx.resume()
}

export function setVolumes(next) {
  volumes = { ...volumes, ...next }
  applyVolumes()
}

function applyVolumes() {
  if (!ctx) return
  sfxBus.gain.setTargetAtTime(volumes.sfx * 0.9, ctx.currentTime, 0.02)
}

/* ---------------------------------------------------------------------------
 * Primitives
 * ------------------------------------------------------------------------- */

function tone({
  freq,
  to,
  type = 'sine',
  dur = 0.2,
  vol = 0.3,
  attack = 0.005,
  at = 0,
  bus = sfxBus,
  detune = 0,
}) {
  const t = ctx.currentTime + at
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  osc.detune.value = detune
  if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g).connect(bus)
  osc.start(t)
  osc.stop(t + dur + 0.05)
}

function noise({
  dur = 0.2,
  vol = 0.3,
  type = 'bandpass',
  freq = 1200,
  to,
  q = 1,
  at = 0,
  attack = 0.005,
  bus = sfxBus,
}) {
  const t = ctx.currentTime + at
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer
  src.loop = true
  const filter = ctx.createBiquadFilter()
  filter.type = type
  filter.frequency.setValueAtTime(freq, t)
  if (to) filter.frequency.exponentialRampToValueAtTime(to, t + dur)
  filter.Q.value = q
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(filter).connect(g).connect(bus)
  src.start(t, Math.random() * 0.5)
  src.stop(t + dur + 0.05)
}

/** An inharmonic metallic strike — anvils, ore picks. */
function clang(base, vol = 0.25, at = 0, decay = 0.6) {
  for (const [ratio, v] of [
    [1, 1],
    [2.76, 0.6],
    [5.4, 0.35],
    [8.93, 0.2],
  ]) {
    tone({ freq: base * ratio, dur: decay / ratio ** 0.3, vol: vol * v, at, type: 'sine' })
  }
  noise({ dur: 0.05, vol: vol * 0.8, freq: 4000, q: 0.7, at })
}

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12)

/* ---------------------------------------------------------------------------
 * Sound effects
 * ------------------------------------------------------------------------- */

const SFX = {
  click: () => {
    tone({ freq: 700, to: 1100, type: 'square', dur: 0.06, vol: 0.08 })
  },
  hover: () => tone({ freq: 1200, type: 'sine', dur: 0.04, vol: 0.04 }),
  open: () => {
    tone({ freq: 520, type: 'triangle', dur: 0.09, vol: 0.14 })
    tone({ freq: 780, type: 'triangle', dur: 0.12, vol: 0.14, at: 0.06 })
  },
  close: () => {
    tone({ freq: 700, type: 'triangle', dur: 0.08, vol: 0.12 })
    tone({ freq: 460, type: 'triangle', dur: 0.1, vol: 0.12, at: 0.05 })
  },
  error: () => {
    tone({ freq: 180, type: 'square', dur: 0.1, vol: 0.1 })
    tone({ freq: 140, type: 'square', dur: 0.14, vol: 0.1, at: 0.11 })
  },
  swing: () => noise({ dur: 0.16, vol: 0.22, freq: 700, to: 2600, q: 1.4, attack: 0.02 }),
  hit: () => {
    tone({ freq: 170, to: 55, type: 'sine', dur: 0.16, vol: 0.45 })
    noise({ dur: 0.07, vol: 0.3, freq: 2200, q: 0.8 })
  },
  crit: () => {
    SFX.hit()
    tone({ freq: 1500, to: 2400, type: 'triangle', dur: 0.18, vol: 0.12, at: 0.02 })
  },
  oreHit: () => {
    clang(1600 + Math.random() * 300, 0.12, 0, 0.3)
    noise({ dur: 0.08, vol: 0.2, freq: 900, type: 'lowpass' })
  },
  dummy: () => {
    tone({ freq: 240, to: 120, type: 'triangle', dur: 0.1, vol: 0.3 })
    noise({ dur: 0.06, vol: 0.18, freq: 500, type: 'lowpass' })
  },
  mined: () => {
    noise({ dur: 0.35, vol: 0.5, freq: 600, to: 150, type: 'lowpass' })
    tone({ freq: 90, to: 40, dur: 0.3, vol: 0.4 })
    tone({ freq: 880, type: 'triangle', dur: 0.12, vol: 0.12, at: 0.12 })
  },
  kill: () => {
    noise({ dur: 0.3, vol: 0.35, freq: 1200, to: 200, q: 0.8 })
    tone({ freq: 660, type: 'square', dur: 0.08, vol: 0.07, at: 0.05 })
    tone({ freq: 990, type: 'square', dur: 0.1, vol: 0.07, at: 0.12 })
  },
  coin: () => {
    tone({ freq: 988, type: 'square', dur: 0.08, vol: 0.09 })
    tone({ freq: 1319, type: 'square', dur: 0.28, vol: 0.09, at: 0.07 })
  },
  sell: () => {
    for (let i = 0; i < 4; i += 1) {
      tone({ freq: 1319 + i * 120, type: 'square', dur: 0.1, vol: 0.06, at: i * 0.06 })
    }
  },
  loot: () => {
    ;[72, 76, 79].forEach((n, i) => tone({ freq: NOTE(n), type: 'triangle', dur: 0.14, vol: 0.14, at: i * 0.06 }))
  },
  levelup: () => {
    ;[72, 76, 79, 84].forEach((n, i) => {
      tone({ freq: NOTE(n), type: 'square', dur: 0.18, vol: 0.08, at: i * 0.09 })
      tone({ freq: NOTE(n + 12), type: 'sine', dur: 0.3, vol: 0.06, at: i * 0.09 })
    })
    noise({ dur: 0.8, vol: 0.08, freq: 6000, type: 'highpass', at: 0.3, attack: 0.2 })
  },
  reward: () => {
    ;[67, 72, 76, 79, 84].forEach((n, i) => tone({ freq: NOTE(n), type: 'triangle', dur: 0.2, vol: 0.13, at: i * 0.07 }))
  },
  purchase: () => {
    SFX.coin()
    tone({ freq: NOTE(84), type: 'sine', dur: 0.4, vol: 0.1, at: 0.15 })
  },
  anvil: () => clang(420 + Math.random() * 40, 0.28, 0, 0.9),
  sizzle: () => noise({ dur: 1.2, vol: 0.12, freq: 5000, type: 'highpass', attack: 0.1 }),
  pour: () => {
    noise({ dur: 1.4, vol: 0.2, freq: 300, to: 900, type: 'lowpass', attack: 0.3 })
    tone({ freq: 60, to: 90, dur: 1.4, vol: 0.18, attack: 0.3 })
  },
  reveal: (rarityIndex = 0) => {
    const base = [60, 62, 64, 65, 67, 69, 71, 72][Math.min(7, rarityIndex)]
    const chord = [0, 4, 7, 12, 16]
    chord.forEach((c, i) => {
      tone({ freq: NOTE(base + c), type: 'square', dur: 0.5, vol: 0.06, at: i * 0.07 })
      tone({ freq: NOTE(base + c + 12), type: 'triangle', dur: 0.7, vol: 0.07, at: i * 0.07 })
    })
    if (rarityIndex >= 4) {
      noise({ dur: 1.4, vol: 0.12, freq: 7000, type: 'highpass', at: 0.2, attack: 0.3 })
      ;[84, 88, 91, 96].forEach((n, i) => tone({ freq: NOTE(n), type: 'sine', dur: 0.6, vol: 0.07, at: 0.45 + i * 0.1 }))
    }
  },
  hurt: () => {
    tone({ freq: 260, to: 110, type: 'square', dur: 0.14, vol: 0.1 })
    noise({ dur: 0.08, vol: 0.12, freq: 900 })
  },
  death: () => {
    ;[67, 63, 60, 55].forEach((n, i) => tone({ freq: NOTE(n), type: 'square', dur: 0.22, vol: 0.09, at: i * 0.16 }))
  },
  portal: () => {
    tone({ freq: 200, to: 1400, type: 'sine', dur: 0.7, vol: 0.18, attack: 0.05 })
    tone({ freq: 300, to: 2100, type: 'triangle', dur: 0.7, vol: 0.08, attack: 0.05, detune: 12 })
    noise({ dur: 0.7, vol: 0.12, freq: 400, to: 5000, q: 2 })
  },
  dash: () => {
    noise({ dur: 0.35, vol: 0.4, freq: 400, to: 4000, q: 1.2, attack: 0.02 })
    tone({ freq: 300, to: 900, type: 'sawtooth', dur: 0.2, vol: 0.05 })
  },
  whirl: () => {
    for (let i = 0; i < 3; i += 1) noise({ dur: 0.16, vol: 0.3, freq: 800, to: 3000, q: 1.5, at: i * 0.12 })
  },
  slam: () => {
    tone({ freq: 90, to: 28, dur: 0.6, vol: 0.6 })
    noise({ dur: 0.5, vol: 0.45, freq: 800, to: 100, type: 'lowpass' })
  },
  roll: () => tone({ freq: 900 + Math.random() * 500, type: 'square', dur: 0.04, vol: 0.05 }),
  // Another player's hit landing: a short, lighter clang.
  hitOther: (k = 1) => {
    noise({ dur: 0.08, vol: 0.12 * k, type: 'bandpass', freq: 2400, to: 900, q: 1.4 })
    tone({ freq: 520, to: 300, type: 'triangle', dur: 0.08, vol: 0.06 * k })
  },
  // A footfall: a soft heel thump plus a scuff, left and right feet a touch
  // apart in pitch so a walk has a rhythm. `k` scales it (quieter far away).
  step: (k = 1) => {
    stepFoot = !stepFoot
    const pitch = (stepFoot ? 1 : 0.88) * (0.95 + Math.random() * 0.1)
    tone({ freq: 150 * pitch, to: 60, type: 'sine', dur: 0.09, vol: 0.2 * k, attack: 0.003 })
    noise({ dur: 0.07, vol: 0.09 * k, type: 'bandpass', freq: 1500 * pitch, to: 700, q: 0.9, attack: 0.002 })
  },
  jump: () => tone({ freq: 300, to: 520, type: 'sine', dur: 0.12, vol: 0.08 }),
  announce: () => {
    tone({ freq: NOTE(79), type: 'triangle', dur: 0.15, vol: 0.1 })
    tone({ freq: NOTE(84), type: 'triangle', dur: 0.3, vol: 0.1, at: 0.12 })
  },
  // Loot
  dropPop: () => {
    tone({ freq: 380, to: 760, type: 'triangle', dur: 0.12, vol: 0.1 })
    tone({ freq: NOTE(84), type: 'sine', dur: 0.18, vol: 0.05, at: 0.08 })
  },
  pickup: () => {
    noise({ dur: 0.3, vol: 0.12, freq: 900, to: 5000, q: 1.2, attack: 0.03 })
    ;[79, 83, 86].forEach((n, i) => tone({ freq: NOTE(n), type: 'sine', dur: 0.16, vol: 0.08, at: i * 0.05 }))
  },
  bagIn: (rarityIndex = 0) => {
    tone({ freq: 160, to: 90, type: 'sine', dur: 0.12, vol: 0.25 })
    const top = 84 + Math.min(7, rarityIndex) * 2
    tone({ freq: NOTE(top), type: 'triangle', dur: 0.22, vol: 0.1, at: 0.03 })
    tone({ freq: NOTE(top + 7), type: 'sine', dur: 0.3, vol: 0.07, at: 0.08 })
    noise({ dur: 0.25, vol: 0.05, freq: 7000, type: 'highpass', at: 0.05 })
  },
  chest: () => {
    tone({ freq: 140, to: 200, type: 'sawtooth', dur: 0.25, vol: 0.05 })
    noise({ dur: 0.2, vol: 0.12, freq: 600, type: 'lowpass' })
    for (let i = 0; i < 6; i += 1) tone({ freq: 1200 + Math.random() * 900, type: 'square', dur: 0.07, vol: 0.05, at: 0.2 + i * 0.05 })
    ;[72, 76, 79, 84].forEach((n, i) => tone({ freq: NOTE(n), type: 'triangle', dur: 0.25, vol: 0.1, at: 0.25 + i * 0.07 }))
  },
  unlock: () => {
    clang(900, 0.12, 0, 0.4)
    noise({ dur: 0.5, vol: 0.18, freq: 300, to: 80, type: 'lowpass', at: 0.1 })
    ;[67, 72, 76, 79, 84, 88].forEach((n, i) => {
      tone({ freq: NOTE(n), type: 'square', dur: 0.22, vol: 0.06, at: 0.2 + i * 0.08 })
      tone({ freq: NOTE(n), type: 'triangle', dur: 0.4, vol: 0.09, at: 0.2 + i * 0.08 })
    })
    noise({ dur: 1, vol: 0.07, freq: 6000, type: 'highpass', at: 0.6, attack: 0.2 })
  },
  arrow: () => noise({ dur: 0.18, vol: 0.1, freq: 2500, to: 800, q: 2, attack: 0.01 }),
}

/** Which foot the last footstep was, so steps alternate in pitch. */
let stepFoot = false

export function sfx(name, arg) {
  if (!ctx || ctx.state !== 'running') return
  const fn = SFX[name]
  if (fn) fn(arg)
}

