/**
 * Per-stage dungeon palettes, shared by the corridor builder and the effects.
 *
 * floor: texture name, path/trim: the centre road, wall/cap: side walls,
 * accent: gate glow and banners, deco: which props line the edges.
 */
export const DUNGEON_THEMES = {
  ironwood: { floor: 'woodFloor', path: 'metalPlate', trim: 'metalDark', wall: 'ironwoodWall', cap: 'metalDark', accent: '#ffb000', deco: 'ironwood' },
  meadow: { floor: 'grassLime', path: 'path', trim: 'sand', wall: 'dirtWall', cap: 'grassLime', accent: '#ffd23b', deco: 'meadow' },
  camp: { floor: 'campDirt', path: 'wood', trim: 'woodDark', wall: 'palisade', cap: 'woodDark', accent: '#ff7a1f', deco: 'camp' },
  keep: { floor: 'grass', path: 'stone', trim: 'stoneDark', wall: 'castle', cap: 'castleDark', accent: '#ff4d4d', deco: 'keep' },
  cave: { floor: 'caveFloor', path: 'stoneDark', trim: '#4dffb8', wall: 'caveWall', cap: 'caveWall', accent: '#4dffb8', deco: 'cave' },
  crypt: { floor: 'cryptFloor', path: 'stoneDark', trim: '#9a7bff', wall: 'cryptWall', cap: 'stoneDark', accent: '#9a7bff', deco: 'crypt' },
  frost: { floor: 'snow', path: 'ice', trim: 'white', wall: 'frostWall', cap: 'snow', accent: '#5fd0ff', deco: 'frost' },
  glacier: { floor: 'glacier', path: 'snow', trim: '#8ff8ff', wall: 'frostWall', cap: 'ice', accent: '#8ff8ff', deco: 'glacier' },
  desert: { floor: 'desertTile', path: 'sand', trim: 'desertWall', wall: 'desertWall', cap: 'sand', accent: '#ffb000', deco: 'desert' },
  void: { floor: 'voidFloor', path: 'voidWall', trim: '#c64dff', wall: 'voidWall', cap: '#6a3ad8', accent: '#c64dff', deco: 'void' },
  inferno: { floor: 'nether', path: 'magma', trim: '#ff5a1f', wall: 'netherWall', cap: '#3a0a0a', accent: '#ff5a1f', deco: 'inferno' },
  throne: { floor: 'magma', path: 'nether', trim: 'gold', wall: 'netherWall', cap: 'gold', accent: '#ff3b1f', deco: 'throne' },
  jungle: { floor: 'grassDark', path: 'campDirt', trim: 'woodDark', wall: 'jungleWall', cap: 'grassDark', accent: '#6dff4a', deco: 'jungle' },
  reef: { floor: 'reefFloor', path: 'sand', trim: 'white', wall: 'reefWall', cap: 'reefCoral', accent: '#5ff0ff', deco: 'reef' },
  crystal: { floor: 'crystalFloor', path: 'stoneDark', trim: '#ff7ae0', wall: 'crystalWall', cap: '#c64dff', accent: '#ff7ae0', deco: 'cave' },
  storm: { floor: 'stormFloor', path: 'stoneDark', trim: '#ffe23b', wall: 'stormWall', cap: 'snow', accent: '#ffe23b', deco: 'frost' },
  sky: { floor: 'white', path: 'gold', trim: '#8fe0ff', wall: 'skyWall', cap: 'gold', accent: '#8fe0ff', deco: 'keep' },
  shadow: { floor: 'shadowFloor', path: 'cryptFloor', trim: '#8a6aff', wall: 'shadowWall', cap: '#3a2a5a', accent: '#8a6aff', deco: 'crypt' },
  dragon: { floor: 'lavaRock', path: 'magma', trim: '#ff9a1f', wall: 'dragonWall', cap: 'gold', accent: '#ff7a1f', deco: 'inferno' },
  celestial: { floor: 'celestialFloor', path: 'gold', trim: '#ffe07a', wall: 'celestialWall', cap: 'gold', accent: '#ffe07a', deco: 'void' },
}
