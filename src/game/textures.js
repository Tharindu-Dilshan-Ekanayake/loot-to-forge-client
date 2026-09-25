import {
  BoxGeometry,
  CanvasTexture,
  Color,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three'

/**
 * Procedural block textures in the Roblox "studs" style, drawn once to canvases.
 *
 * Geometry from `worldBox()` carries world-space UVs (one texture repeat = `tile`
 * world units on every face), so a single shared material tiles correctly on boxes
 * of any size — no per-mesh texture clones.
 */

const SIZE = 256

function canvas() {
  const c = document.createElement('canvas')
  c.width = SIZE
  c.height = SIZE
  return [c, c.getContext('2d')]
}

const shade = (hex, amt) => {
  const c = new Color(hex)
  c.offsetHSL(0, 0, amt)
  return `#${c.getHexString()}`
}

/**
 * Every stud tile is split this many times each way (3 × 3 ≈ the "8 smaller
 * tiles" per old tile), so floors read as fine blocks rather than big slabs.
 */
const STUD_SPLIT = 3

/** Square tiles with a raised inner stud — grass, wood, the castle's inner blocks. */
function drawStuds(ctx, base, { cells: baseCells = 2, border = 0.09, inner = 0.18 } = {}) {
  const cells = baseCells * STUD_SPLIT
  const cell = SIZE / cells
  // Bevel sizes in pixels, scaled with the (now smaller) cell.
  const bev = Math.max(1, Math.round(4 / STUD_SPLIT))
  ctx.fillStyle = base
  ctx.fillRect(0, 0, SIZE, SIZE)
  for (let y = 0; y < cells; y += 1) {
    for (let x = 0; x < cells; x += 1) {
      const px = x * cell
      const py = y * cell
      // Slight per-cell variation keeps large floors from looking flat.
      ctx.fillStyle = shade(base, (Math.random() - 0.5) * 0.025)
      ctx.fillRect(px, py, cell, cell)

      // Groove between tiles.
      const b = cell * border
      ctx.fillStyle = shade(base, -0.12)
      ctx.fillRect(px, py, cell, b * 0.6)
      ctx.fillRect(px, py, b * 0.6, cell)
      ctx.fillStyle = shade(base, 0.05)
      ctx.fillRect(px + b * 0.6, py + b * 0.6, cell - b * 0.6, b * 0.35)

      // Inner raised square: light top-left edge, dark bottom-right edge.
      const i = cell * inner
      const w = cell - i * 2
      ctx.fillStyle = shade(base, 0.07)
      ctx.fillRect(px + i, py + i, w, w)
      ctx.fillStyle = shade(base, -0.09)
      ctx.fillRect(px + i + bev, py + i + bev, w - bev, w - bev)
      ctx.fillStyle = shade(base, 0.015)
      ctx.fillRect(px + i + bev, py + i + bev, w - bev * 2, w - bev * 2)
    }
  }
}

/** Running-bond bricks — the red path, castle walls, dungeon dirt walls. */
function drawBricks(ctx, base, { rows = 4, cols = 2, mortar, studs = false } = {}) {
  ctx.fillStyle = mortar || shade(base, -0.14)
  ctx.fillRect(0, 0, SIZE, SIZE)
  const bh = SIZE / rows
  const bw = SIZE / cols
  const gap = 5
  for (let r = 0; r < rows; r += 1) {
    const offset = r % 2 ? bw / 2 : 0
    for (let c = -1; c <= cols; c += 1) {
      const x = c * bw + offset
      const y = r * bh
      ctx.fillStyle = shade(base, (Math.random() - 0.5) * 0.04)
      ctx.fillRect(x + gap / 2, y + gap / 2, bw - gap, bh - gap)
      ctx.fillStyle = shade(base, 0.06)
      ctx.fillRect(x + gap / 2, y + gap / 2, bw - gap, 3)
      if (studs) {
        ctx.fillStyle = shade(base, -0.06)
        const s = bh * 0.34
        for (let k = 0; k < 2; k += 1) {
          ctx.fillRect(x + bw * (0.25 + k * 0.5) - s / 2, y + bh / 2 - s / 2, s, s)
        }
      }
    }
  }
}

/** Wooden planks with grain and faint stud squares, like the stalls and forge frame. */
function drawWood(ctx, base) {
  drawStuds(ctx, base, { cells: 2, border: 0.06, inner: 0.22 })
  ctx.globalAlpha = 0.08
  ctx.strokeStyle = '#000'
  for (let i = 0; i < 18; i += 1) {
    ctx.beginPath()
    const y = Math.random() * SIZE
    ctx.moveTo(0, y)
    ctx.bezierCurveTo(SIZE * 0.3, y + 6, SIZE * 0.6, y - 6, SIZE, y + 2)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

function drawNoise(ctx, base, amount = 0.05) {
  ctx.fillStyle = base
  ctx.fillRect(0, 0, SIZE, SIZE)
  for (let i = 0; i < 900; i += 1) {
    ctx.fillStyle = shade(base, (Math.random() - 0.5) * amount * 2)
    const s = 4 + Math.random() * 10
    ctx.fillRect(Math.random() * SIZE, Math.random() * SIZE, s, s)
  }
}

/**
 * Steel floor panels: bolted plates with a raised diamond tread, like a stage
 * built from sheet metal.
 */
function drawMetalPlate(ctx, base, { cells = 2, tread = true } = {}) {
  const cell = SIZE / cells
  ctx.fillStyle = base
  ctx.fillRect(0, 0, SIZE, SIZE)
  for (let y = 0; y < cells; y += 1) {
    for (let x = 0; x < cells; x += 1) {
      const px = x * cell
      const py = y * cell
      ctx.fillStyle = shade(base, (Math.random() - 0.5) * 0.03)
      ctx.fillRect(px, py, cell, cell)
      if (tread) {
        // Diamond tread: short raised bars in alternating directions.
        for (let ty = 0; ty < 6; ty += 1) {
          for (let tx = 0; tx < 6; tx += 1) {
            const cx = px + (tx + 0.5 + (ty % 2) * 0.5) * (cell / 6)
            const cy = py + (ty + 0.5) * (cell / 6)
            if (cx > px + cell - 6) continue
            ctx.save()
            ctx.translate(cx, cy)
            ctx.rotate((ty % 2 ? 1 : -1) * 0.7)
            ctx.fillStyle = shade(base, -0.1)
            ctx.fillRect(-7, -1, 14, 4)
            ctx.fillStyle = shade(base, 0.12)
            ctx.fillRect(-7, -2, 14, 2)
            ctx.restore()
          }
        }
      }
      // Seams between plates.
      ctx.fillStyle = shade(base, -0.22)
      ctx.fillRect(px, py, cell, 3)
      ctx.fillRect(px, py, 3, cell)
      ctx.fillStyle = shade(base, 0.1)
      ctx.fillRect(px + 3, py + 3, cell - 3, 2)
      // Bolts in each corner.
      for (const [bx, by] of [
        [10, 10],
        [cell - 10, 10],
        [10, cell - 10],
        [cell - 10, cell - 10],
      ]) {
        ctx.fillStyle = shade(base, -0.2)
        ctx.beginPath()
        ctx.arc(px + bx + 1, py + by + 1, 4.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = shade(base, 0.16)
        ctx.beginPath()
        ctx.arc(px + bx, py + by, 3.5, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
}

/** Vertical timber planks with two riveted iron bands across them. */
function drawIronwood(ctx) {
  const plank = SIZE / 4
  for (let i = 0; i < 4; i += 1) {
    ctx.fillStyle = shade('#8a5a30', (Math.random() - 0.5) * 0.06)
    ctx.fillRect(i * plank, 0, plank, SIZE)
    ctx.fillStyle = shade('#8a5a30', -0.14)
    ctx.fillRect(i * plank, 0, 4, SIZE)
    ctx.fillStyle = shade('#8a5a30', 0.06)
    ctx.fillRect(i * plank + 4, 0, 3, SIZE)
  }
  for (const y of [SIZE * 0.2, SIZE * 0.7]) {
    ctx.fillStyle = '#4b5363'
    ctx.fillRect(0, y, SIZE, 26)
    ctx.fillStyle = '#6b7488'
    ctx.fillRect(0, y, SIZE, 5)
    ctx.fillStyle = '#343a46'
    ctx.fillRect(0, y + 22, SIZE, 4)
    for (let x = plank / 2; x < SIZE; x += plank) {
      ctx.fillStyle = '#2a2f3a'
      ctx.beginPath()
      ctx.arc(x + 1, y + 14, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#9aa3b5'
      ctx.beginPath()
      ctx.arc(x, y + 13, 4, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

const TEXTURE_DEFS = {
  grass: (ctx) => drawStuds(ctx, '#3bbf52'),
  grassLime: (ctx) => drawStuds(ctx, '#72d63a'),
  grassDark: (ctx) => drawStuds(ctx, '#2f9a44'),
  path: (ctx) => drawBricks(ctx, '#d9505e', { rows: 4, cols: 2, mortar: '#b13a48' }),
  sand: (ctx) => drawBricks(ctx, '#f1c982', { rows: 2, cols: 1, mortar: '#d9ab62' }),
  castle: (ctx) => drawBricks(ctx, '#5a5fc8', { rows: 4, cols: 2, mortar: '#4247a6', studs: true }),
  castleDark: (ctx) => drawBricks(ctx, '#474ca8', { rows: 4, cols: 2, mortar: '#353a8a', studs: true }),
  wood: (ctx) => drawWood(ctx, '#c58a4c'),
  woodDark: (ctx) => drawWood(ctx, '#8a5a30'),
  stone: (ctx) => drawStuds(ctx, '#a3aab8', { cells: 2, border: 0.1, inner: 0.16 }),
  stoneDark: (ctx) => drawStuds(ctx, '#5b6070', { cells: 2, border: 0.1, inner: 0.16 }),
  dirtWall: (ctx) => drawBricks(ctx, '#b5613f', { rows: 4, cols: 2, mortar: '#8f4a2e' }),
  snow: (ctx) => drawStuds(ctx, '#e8f4ff'),
  ice: (ctx) => drawStuds(ctx, '#9fd8f5', { cells: 2, border: 0.08, inner: 0.2 }),
  frostWall: (ctx) => drawBricks(ctx, '#7f9fc9', { rows: 4, cols: 2, mortar: '#5f7ba6', studs: true }),
  voidFloor: (ctx) => drawStuds(ctx, '#3a2a6e'),
  voidWall: (ctx) => drawBricks(ctx, '#2a1d52', { rows: 4, cols: 2, mortar: '#1b1238', studs: true }),
  nether: (ctx) => drawStuds(ctx, '#7a2626'),
  netherWall: (ctx) => drawBricks(ctx, '#4a1414', { rows: 4, cols: 2, mortar: '#2e0a0a' }),
  lavaRock: (ctx) => drawNoise(ctx, '#3a2a2a', 0.08),
  gold: (ctx) => drawStuds(ctx, '#f2c230', { cells: 2, border: 0.08, inner: 0.2 }),
  white: (ctx) => drawStuds(ctx, '#f4f6fb'),
  red: (ctx) => drawStuds(ctx, '#e0303c'),
  purple: (ctx) => drawStuds(ctx, '#9b4dff'),
  // Dungeon themes
  // Stage 1: timber floor, plank walls bound with riveted iron.
  woodFloor: (ctx) => drawWood(ctx, '#b77a42'),
  ironwoodWall: (ctx) => drawIronwood(ctx),
  campDirt: (ctx) => drawStuds(ctx, '#b08850'),
  palisade: (ctx) => drawWood(ctx, '#9a6a3a'),
  caveFloor: (ctx) => drawStuds(ctx, '#3f4a52'),
  caveWall: (ctx) => drawBricks(ctx, '#353d4a', { rows: 4, cols: 2, mortar: '#252b36', studs: true }),
  cryptFloor: (ctx) => drawStuds(ctx, '#4d5160', { cells: 2, border: 0.1, inner: 0.16 }),
  cryptWall: (ctx) => drawBricks(ctx, '#5a5a6e', { rows: 4, cols: 2, mortar: '#3c3c4e', studs: true }),
  desertSand: (ctx) => drawStuds(ctx, '#f0c878'),
  desertTile: (ctx) => drawStuds(ctx, '#dd8448'),
  desertWall: (ctx) => drawBricks(ctx, '#d9a45a', { rows: 4, cols: 2, mortar: '#b8843e' }),
  glacier: (ctx) => drawStuds(ctx, '#bfe6fa', { cells: 2, border: 0.08, inner: 0.2 }),
  magma: (ctx) => drawNoise(ctx, '#2a1414', 0.1),
  // Lobby leaderboard stage
  metalPlate: (ctx) => drawMetalPlate(ctx, '#aeb7c4'),
  metalDark: (ctx) => drawMetalPlate(ctx, '#4b5363', { cells: 2, tread: false }),
  // Stages 13–20
  jungleWall: (ctx) => drawBricks(ctx, '#4f7a34', { rows: 4, cols: 2, mortar: '#35561f', studs: true }),
  reefFloor: (ctx) => drawStuds(ctx, '#3cc3cf'),
  reefWall: (ctx) => drawBricks(ctx, '#2f86a8', { rows: 4, cols: 2, mortar: '#1f6282', studs: true }),
  reefCoral: (ctx) => drawStuds(ctx, '#ff7a8a'),
  crystalFloor: (ctx) => drawStuds(ctx, '#6a4aa0', { cells: 2, border: 0.08, inner: 0.2 }),
  crystalWall: (ctx) => drawBricks(ctx, '#4a3688', { rows: 4, cols: 2, mortar: '#33246a', studs: true }),
  stormFloor: (ctx) => drawStuds(ctx, '#7d8b9c'),
  stormWall: (ctx) => drawBricks(ctx, '#56637a', { rows: 4, cols: 2, mortar: '#3e485c', studs: true }),
  skyWall: (ctx) => drawBricks(ctx, '#e8ecf5', { rows: 4, cols: 2, mortar: '#c6cedf', studs: true }),
  shadowFloor: (ctx) => drawStuds(ctx, '#3a3350'),
  shadowWall: (ctx) => drawBricks(ctx, '#2a2440', { rows: 4, cols: 2, mortar: '#1c1830', studs: true }),
  dragonWall: (ctx) => drawBricks(ctx, '#6a3222', { rows: 4, cols: 2, mortar: '#4a2014', studs: true }),
  celestialFloor: (ctx) => drawStuds(ctx, '#f1eeff'),
  celestialWall: (ctx) => drawBricks(ctx, '#c3cbff', { rows: 4, cols: 2, mortar: '#a3acec', studs: true }),
}

const textures = new Map()
export function getTexture(name) {
  if (!textures.has(name)) {
    const [c, ctx] = canvas()
    TEXTURE_DEFS[name](ctx)
    const tex = new CanvasTexture(c)
    tex.wrapS = RepeatWrapping
    tex.wrapT = RepeatWrapping
    tex.colorSpace = SRGBColorSpace
    tex.anisotropy = 8
    textures.set(name, tex)
  }
  return textures.get(name)
}

const materials = new Map()
/**
 * Shared material for a texture name, or a plain colour (`#rrggbb`).
 * Plain colours still get the smooth Roblox "plastic" finish.
 */
export function mat(name, extra) {
  const key = extra ? `${name}|${JSON.stringify(extra)}` : name
  if (!materials.has(key)) {
    const isColor = name.startsWith('#')
    materials.set(
      key,
      new MeshStandardMaterial({
        map: isColor ? null : getTexture(name),
        color: isColor ? name : '#ffffff',
        roughness: 0.78,
        metalness: 0,
        ...extra,
      }),
    )
  }
  return materials.get(key)
}

const boxes = new Map()
/**
 * Box geometry with world-space UVs. `tile` is the world size of one texture
 * repeat. BoxGeometry lays faces out as +x, -x, +y, -y, +z, -z (4 verts each).
 */
export function worldBox(w, h, d, tile = 4) {
  const key = `${w}|${h}|${d}|${tile}`
  if (!boxes.has(key)) {
    const g = new BoxGeometry(w, h, d)
    const uv = g.attributes.uv
    const faceDims = [
      [d, h],
      [d, h],
      [w, d],
      [w, d],
      [w, h],
      [w, h],
    ]
    for (let f = 0; f < 6; f += 1) {
      const [fu, fv] = faceDims[f]
      for (let v = 0; v < 4; v += 1) {
        const i = f * 4 + v
        uv.setXY(i, (uv.getX(i) * fu) / tile, (uv.getY(i) * fv) / tile)
      }
    }
    uv.needsUpdate = true
    boxes.set(key, g)
  }
  return boxes.get(key)
}

/* ---------------------------------------------------------------------------
 * Faces & text
 * ------------------------------------------------------------------------- */

const faces = new Map()
/** The classic smiley, drawn onto a head texture. */
export function faceTexture(kind = 'smile', skin = '#f5d36b') {
  const key = `${kind}|${skin}`
  if (!faces.has(key)) {
    const [c, ctx] = canvas()
    ctx.fillStyle = skin
    ctx.fillRect(0, 0, SIZE, SIZE)
    ctx.fillStyle = '#1b1b1b'
    ctx.strokeStyle = '#1b1b1b'
    ctx.lineCap = 'round'
    if (kind === 'angry') {
      ctx.lineWidth = 10
      ctx.beginPath()
      ctx.moveTo(60, 80)
      ctx.lineTo(110, 100)
      ctx.moveTo(196, 80)
      ctx.lineTo(146, 100)
      ctx.stroke()
      ctx.fillStyle = '#ffec3b'
      ctx.fillRect(74, 108, 30, 22)
      ctx.fillRect(152, 108, 30, 22)
      ctx.fillStyle = '#1b1b1b'
      ctx.fillRect(84, 112, 12, 16)
      ctx.fillRect(160, 112, 12, 16)
      ctx.lineWidth = 9
      ctx.beginPath()
      ctx.moveTo(88, 186)
      ctx.quadraticCurveTo(128, 166, 168, 186)
      ctx.stroke()
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(98, 170, 12, 14)
      ctx.fillRect(146, 170, 12, 14)
    } else if (kind === 'skull') {
      ctx.fillRect(66, 88, 42, 46)
      ctx.fillRect(148, 88, 42, 46)
      ctx.fillRect(118, 146, 20, 24)
      for (let i = 0; i < 5; i += 1) ctx.fillRect(84 + i * 20, 190, 10, 22)
    } else if (kind === 'glow') {
      ctx.fillStyle = '#c64dff'
      ctx.shadowColor = '#e7a3ff'
      ctx.shadowBlur = 20
      ctx.fillRect(66, 104, 50, 16)
      ctx.fillRect(140, 104, 50, 16)
    } else {
      ctx.beginPath()
      ctx.ellipse(96, 104, 11, 20, 0, 0, Math.PI * 2)
      ctx.ellipse(160, 104, 11, 20, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.lineWidth = 9
      ctx.beginPath()
      ctx.arc(128, 132, 52, 0.2 * Math.PI, 0.8 * Math.PI)
      ctx.stroke()
    }
    const tex = new CanvasTexture(c)
    tex.colorSpace = SRGBColorSpace
    faces.set(key, tex)
  }
  return faces.get(key)
}

/**
 * Roblox-style billboard text: chunky Fredoka, vertical gradient fill, thick dark
 * outline. Returns { texture, aspect } — size the sprite as (aspect * h, h).
 */
export function textTexture(text, { colors = ['#ffffff', '#ffffff'], stroke = '#1a1a2e', font = 700, italic = false, size = 96 } = {}) {
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d')
  const fontStr = `${italic ? 'italic ' : ''}${font} ${size}px Fredoka, 'Arial Rounded MT Bold', sans-serif`
  ctx.font = fontStr
  const w = Math.ceil(ctx.measureText(text).width + size * 0.5)
  const h = Math.ceil(size * 1.4)
  c.width = w
  c.height = h
  ctx.font = fontStr
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = size * 0.16
  ctx.strokeStyle = stroke
  ctx.strokeText(text, w / 2, h / 2)
  const grad = ctx.createLinearGradient(0, h * 0.2, 0, h * 0.8)
  colors.forEach((col, i) => grad.addColorStop(colors.length === 1 ? 0 : i / (colors.length - 1), col))
  ctx.fillStyle = grad
  ctx.fillText(text, w / 2, h / 2)
  const texture = new CanvasTexture(c)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  return { texture, aspect: w / h }
}

/**
 * A painted shop signboard: wooden planks in a coloured frame with gold bolts
 * and the shop's name lettered across it. The texture is 4:1.
 */
export function signboardTexture(text, { frame = '#ffd23b', colors = ['#fff27a', '#ffb000'], stroke = '#3a1a00', icon = '', planks: plankColors = ['#86532a', '#7a4a24'] } = {}) {
  const W = 1024
  const H = 256
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')
  // Planks with a little grain.
  const planks = 4
  for (let i = 0; i < planks; i += 1) {
    const y = (H / planks) * i
    ctx.fillStyle = plankColors[i % 2]
    ctx.fillRect(0, y, W, H / planks)
    ctx.fillStyle = 'rgba(0,0,0,0.28)'
    ctx.fillRect(0, y, W, 3)
    ctx.strokeStyle = 'rgba(40,18,4,0.22)'
    ctx.lineWidth = 2
    for (let g = 0; g < 5; g += 1) {
      const gy = y + 10 + g * (H / planks / 5)
      ctx.beginPath()
      ctx.moveTo(0, gy)
      for (let x = 0; x <= W; x += 64) ctx.lineTo(x, gy + Math.sin(x * 0.013 + i * 3 + g) * 3)
      ctx.stroke()
    }
  }
  // Coloured frame with a darker inner line.
  ctx.lineWidth = 26
  ctx.strokeStyle = frame
  ctx.strokeRect(13, 13, W - 26, H - 26)
  ctx.lineWidth = 5
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'
  ctx.strokeRect(29, 29, W - 58, H - 58)
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.strokeRect(3, 3, W - 6, H - 6)
  // Gold bolts in the corners.
  for (const [x, y] of [[48, 48], [W - 48, 48], [48, H - 48], [W - 48, H - 48]]) {
    ctx.fillStyle = '#5a3a00'
    ctx.beginPath()
    ctx.arc(x + 2, y + 2, 12, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffd23b'
    ctx.beginPath()
    ctx.arc(x, y, 11, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff6c0'
    ctx.beginPath()
    ctx.arc(x - 3, y - 3, 4, 0, Math.PI * 2)
    ctx.fill()
  }
  // The name, shrunk to fit.
  const label = icon ? `${icon} ${text} ${icon}` : text
  const font = (s) => `700 ${s}px Fredoka, 'Arial Rounded MT Bold', sans-serif`
  let size = 150
  ctx.font = font(size)
  while (ctx.measureText(label).width > W - 150 && size > 40) {
    size -= 6
    ctx.font = font(size)
  }
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.fillStyle = 'rgba(0,0,0,0.4)'
  ctx.fillText(label, W / 2 + 5, H / 2 + 11)
  ctx.lineWidth = size * 0.17
  ctx.strokeStyle = stroke
  ctx.strokeText(label, W / 2, H / 2 + 6)
  const grad = ctx.createLinearGradient(0, H / 2 - size / 2, 0, H / 2 + size / 2)
  colors.forEach((col, i) => grad.addColorStop(colors.length === 1 ? 0 : i / (colors.length - 1), col))
  ctx.fillStyle = grad
  ctx.fillText(label, W / 2, H / 2 + 6)
  const texture = new CanvasTexture(c)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

let glowTex = null
/** Soft white radial falloff, tinted per use for glows and particles. */
export function glowTexture() {
  if (glowTex) return glowTex
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  glowTex = new CanvasTexture(c)
  return glowTex
}
