import { rarityOf } from '../shared/gameData'

/** Background for an item tile, keyed by rarity (green for UnCommon, etc). */
export function rarityBg(rarity) {
  const r = rarityOf(rarity)
  if (rarity === 'Secret') return 'linear-gradient(135deg, #2a0a40, #ff4df2 45%, #2cf2ff 70%, #1b0630)'
  if (rarity === 'Eternal') return 'linear-gradient(135deg, #0a3a5a, #2cf2ff 60%, #b8fbff)'
  return `radial-gradient(circle at 50% 35%, ${r.color}, ${r.dark})`
}
