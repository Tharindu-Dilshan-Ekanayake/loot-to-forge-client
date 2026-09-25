import { HUB } from '../../shared/gameData'

const [FX, , FZ] = HUB.stations.forge.pos

/** Camera pose for the forging cinematic: above the crucible, looking in. */
export const FORGE_CAM = {
  position: [FX, 9.5, FZ + 7.5],
  target: [FX, 2.2, FZ],
}
