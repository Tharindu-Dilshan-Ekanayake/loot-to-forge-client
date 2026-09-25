import { DUMMIES, HUB, stageAt, stageById } from '../shared/gameData'

/** What each dungeon theme's floor sounds like underfoot (see SURFACES in sound.js). */
const THEME_SURFACE = {
  ironwood: 'wood',
  meadow: 'grass',
  camp: 'dirt',
  keep: 'stone',
  cave: 'stone',
  crypt: 'stone',
  frost: 'snow',
  glacier: 'snow',
  desert: 'sand',
  void: 'stone',
  inferno: 'stone',
  throne: 'stone',
  jungle: 'grass',
  reef: 'sand',
  crystal: 'stone',
  storm: 'stone',
  sky: 'stone',
  shadow: 'stone',
  dragon: 'stone',
  celestial: 'stone',
  marsh: 'mud',
  bonewaste: 'dirt',
  plague: 'stone',
  fortress: 'metal',
  abyss: 'stone',
  grove: 'grass',
  cathedral: 'stone',
  ashland: 'dirt',
  eclipse: 'stone',
  endless: 'stone',
}

/** The ground under (x, z), for footstep sounds. */
export function surfaceAt(x, z) {
  const stage = stageAt(x, z)
  if (stage) {
    const theme = stageById(stage)?.theme
    // The paved road down the middle of every stage.
    if (Math.abs(x) < 5.5) return theme === 'fortress' ? 'metal' : theme === 'ironwood' ? 'wood' : 'stone'
    return THEME_SURFACE[theme] || 'stone'
  }
  // The lobby: paved roads and the fountain plaza, the forge's boards, grass elsewhere.
  if (Math.abs(x) < 9 && Math.abs(z) < 9) return 'stone'
  if (Math.abs(x) < 5 && z > HUB.portal.pos[2] && z < 30) return 'stone'
  if (Math.abs(z) < 5 && x > -30 && x < 45) return 'stone'
  if (Math.hypot(x - HUB.stations.forge.pos[0], z - HUB.stations.forge.pos[2]) < 6) return 'wood'
  if (z < -15 && z > -30 && x > 6 && x < 45) return 'stone'
  if (DUMMIES.some((d) => Math.abs(x - (d.pos[0] - 0.85)) < 5 && Math.abs(z - d.pos[2]) < 5)) return 'stone'
  return 'grass'
}
