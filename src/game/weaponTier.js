import { RARITIES } from '../shared/gameData'

/**
 * Held weapons grow with the player: past each Damage threshold the blade gets
 * bigger, takes on that tier's rarity colour and glows harder. One tier per
 * rarity, so the colours read the same as loot (green, blue, purple, gold…).
 */
export const WEAPON_TIERS = [0, 50, 200, 800, 3000, 12000, 50000, 200000]

/** Tier index (0–7) for a Damage value. */
export function tierIndexFor(damage = 0) {
  let i = 0
  while (i + 1 < WEAPON_TIERS.length && damage >= WEAPON_TIERS[i + 1]) i += 1
  return i
}

/** How a weapon of tier `index` looks: size multiplier, colour, glow strength. */
export function weaponLook(index = 0) {
  const i = Math.max(0, Math.min(WEAPON_TIERS.length - 1, index))
  return {
    index: i,
    scale: 1 + i * 0.08,
    color: RARITIES[i].color,
    /** 0 for the plain starter look, up to 1 at the top tier. */
    glow: i / (WEAPON_TIERS.length - 1),
  }
}
