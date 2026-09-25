import { create } from 'zustand'

/**
 * Client game state for React. Live, per-frame data (entity positions, hp) is NOT
 * here — 3D components read it straight off the Colyseus room in `useFrame`. This
 * store only holds what the UI renders and the lists of entity ids to mount.
 */

const SETTINGS_KEY = 'ltf.settings'

function loadSettings() {
  const defaults = { sfx: 0.8, muted: false, shadows: true, names: true }
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }
  } catch {
    return defaults
  }
}

let toastId = 0

export const useGame = create((set, get) => ({
  /** 'title' | 'connecting' | 'playing' */
  screen: 'title',
  connError: '',
  sessionId: '',
  /** serverNow - Date.now(); add to local time to get server time. */
  serverOffset: 0,

  profile: null,

  playerIds: [],
  enemyIds: [],
  oreIds: [],
  leaderboard: {},
  stageRespawn: {},
  events: {},

  /** The dungeon stage the local player stands in (0 = hub). */
  stage: 0,

  /** Open modal panel name, or null. */
  panel: null,
  panelArg: null,
  /** What "E" does right now: a hub station id or 'pickup'. */
  prompt: null,
  /** Loot on the ground for this player: id -> { ore, x, z, fromX, fromZ, born, picking }. */
  drops: {},

  /** { item, isNew, phase: 'melt' | 'card' } while the forge cinematic runs. */
  forging: null,
  /** Weapon uid the player was just nudged to equip. */
  equipHint: null,
  /** Last roll result shown in the race / enchant / extra skill panels. */
  lastRoll: null,

  toasts: [],
  announcement: null,
  hurtAt: 0,
  deadAt: 0,
  hideHud: false,
  autoAttack: false,
  /** Set once the 3D world has rendered its first frame (drives the loading bar). */
  worldReady: false,
  /** True once the loading screen has finished and handed over to the lobby. */
  entered: false,
  settings: loadSettings(),

  set: (patch) => set(patch),

  openPanel: (panel, panelArg = null) => set({ panel, panelArg }),
  closePanel: () => set({ panel: null, panelArg: null }),

  toast: (text, kind = 'info') => {
    const id = ++toastId
    set({ toasts: [...get().toasts.slice(-3), { id, text, kind }] })
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 2600)
  },

  announce: (text, kind = 'info', rarity = null) => {
    const id = ++toastId
    set({ announcement: { id, text, kind, rarity } })
    setTimeout(() => {
      if (get().announcement?.id === id) set({ announcement: null })
    }, 4200)
  },

  addDrop: (d) => set({ drops: { ...get().drops, [d.id]: { ...d, born: performance.now(), picking: 0 } } }),
  removeDrops: (ids) => {
    const drops = { ...get().drops }
    for (const id of ids) delete drops[id]
    set({ drops })
  },

  setSetting: (key, value) => {
    const settings = { ...get().settings, [key]: value }
    set({ settings })
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    } catch {
      // Private mode / blocked storage: the setting still applies this session.
    }
  },
}))

export const serverNow = () => Date.now() + useGame.getState().serverOffset
