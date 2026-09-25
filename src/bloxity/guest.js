import { assetUrls, isRealId } from './avatarAssets'

/**
 * Guests (not signed in to Bloxity) still get a proper identity: a fun name and a
 * colourful outfit instead of the bare default skin, picked once per device and
 * kept in localStorage so they stay the same between visits.
 */

const ADJECTIVES = ['Swift', 'Brave', 'Lucky', 'Mighty', 'Clever', 'Sneaky', 'Fiery', 'Frosty', 'Golden', 'Shadow', 'Stormy', 'Iron', 'Happy', 'Wild', 'Cosmic', 'Turbo']
const NOUNS = ['Fox', 'Wolf', 'Tiger', 'Panda', 'Falcon', 'Dragon', 'Knight', 'Ninja', 'Bear', 'Otter', 'Raven', 'Lion', 'Shark', 'Golem', 'Viking', 'Wizard']

/** Bloxity skins with bright, distinct outfits (see static.bloxity.io/avatars/skins). */
export const GUEST_SKINS = ['2', '3', '4', '6', '7', '9', '12', '20']

/**
 * Copies of the guest skins (and the default "0") ship in public/avatars/skins, so
 * guests' outfits and name-tag faces load instantly even when the Bloxity CDN is
 * slow or down. Any other skin comes from the CDN.
 */
const BUNDLED_SKINS = new Set(['0', ...GUEST_SKINS])

export function skinUrl(id) {
  const key = String(id)
  return BUNDLED_SKINS.has(key) ? `${import.meta.env.BASE_URL}avatars/skins/${key}.png` : assetUrls.skinTexture(key)
}

function stored(key, make) {
  try {
    let v = localStorage.getItem(key)
    if (!v) {
      v = make()
      localStorage.setItem(key, v)
    }
    return v
  } catch {
    return make()
  }
}

const pick = (list) => list[Math.floor(Math.random() * list.length)]

/** e.g. "SwiftFox42": this device's guest name. */
export function guestName() {
  return stored('ltf.guestName', () => `${pick(ADJECTIVES)}${pick(NOUNS)}${10 + Math.floor(Math.random() * 90)}`)
}

/** This device's guest outfit, in the SDK's equipped-avatar shape. */
export function guestLook() {
  return { skinId: stored('ltf.guestSkin', () => pick(GUEST_SKINS)) }
}

/** A stable guest outfit for someone else, picked from `seed` (their name or id). */
export function fallbackLook(seed = '') {
  let n = 0
  for (const ch of String(seed)) n = (n * 31 + ch.charCodeAt(0)) >>> 0
  return { skinId: GUEST_SKINS[n % GUEST_SKINS.length] }
}

/**
 * The outfit to wear: the Bloxity avatar when it has a real skin, else the
 * guest outfit (never the bare default skin).
 */
export function lookOrGuest(equipped) {
  if (equipped && isRealId(equipped.skinId)) return equipped
  return { ...(equipped || {}), ...guestLook() }
}

/* ---------------------------------------------------------------------------
 * Headshots for name tags
 * ------------------------------------------------------------------------- */

/** The face on a 64×64 Bloxity skin: 8×8 at (1, 20), plus a row of hair above. */
const FACE = { x: 1, y: 19, w: 8, h: 9 }
const headshots = new Map()

/**
 * A round-tag portrait cut from the skin's face, as a data URL. Resolves to null
 * if the skin can't be loaded (CDN down), so the tag falls back to an initial.
 */
export function skinHeadshot(skinId) {
  const id = isRealId(skinId) ? String(skinId) : GUEST_SKINS[0]
  if (!headshots.has(id)) {
    headshots.set(
      id,
      new Promise((resolve) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
          try {
            const c = document.createElement('canvas')
            c.width = c.height = 64
            const ctx = c.getContext('2d')
            ctx.imageSmoothingEnabled = false
            // Fill the square: scale the face up and centre it.
            const s = 64 / FACE.w
            ctx.drawImage(img, FACE.x, FACE.y, FACE.w, FACE.h, 0, (64 - FACE.h * s) / 2 + 4, 64, FACE.h * s)
            resolve(c.toDataURL())
          } catch {
            resolve(null)
          }
        }
        img.onerror = () => resolve(null)
        img.src = skinUrl(id)
      }),
    )
  }
  return headshots.get(id)
}

/* ---------------------------------------------------------------------------
 * Stand-in colours
 * ------------------------------------------------------------------------- */

/** Outfit colours read off each guest skin, for the blocky stand-in body. */
const SKIN_COLORS = {
  0: { skin: '#e8a070', shirt: '#9ad63a', pants: '#b09070' },
  2: { skin: '#8a5a3a', shirt: '#2f7de0', pants: '#e08a3a' },
  3: { skin: '#f0a878', shirt: '#f2f2f2', pants: '#a09a5a' },
  4: { skin: '#e8a070', shirt: '#a0522d', pants: '#4a4a2a' },
  6: { skin: '#e8a070', shirt: '#2aa0a8', pants: '#7a5a3a' },
  7: { skin: '#e8a070', shirt: '#f07a1a', pants: '#6a6a6a' },
  9: { skin: '#e8a070', shirt: '#b08050', pants: '#6a5a2a' },
  12: { skin: '#e8a070', shirt: '#9a9050', pants: '#8a8a8a' },
  20: { skin: '#c89060', shirt: '#c02020', pants: '#303040' },
}
const SHIRTS = ['#e0303c', '#2f7de0', '#2aa0a8', '#f07a1a', '#8a3ad8', '#3fae4a']

/**
 * Colours for the blocky body shown while someone's real avatar downloads, so
 * the stand-in already looks like them instead of a generic figure.
 */
export function standInColors(skinId) {
  if (SKIN_COLORS[skinId]) return SKIN_COLORS[skinId]
  let n = 0
  for (const ch of String(skinId ?? '')) n = (n * 31 + ch.charCodeAt(0)) >>> 0
  return { skin: '#e8a070', shirt: SHIRTS[n % SHIRTS.length], pants: '#34384a' }
}
