import { sfx } from '../audio/sound'
import { send, travel } from '../net/network'
import { useGame } from '../net/store'
import { ONLINE_REWARD_MS, WEAPONS } from '../shared/gameData'
import { serverNow } from '../net/store'

/**
 * The one-press actions behind the top-right buttons and their keys. Kept out
 * of the components so the buttons and the keyboard share the same logic.
 */

/** Keys for the actions (panel keys live in hotkeys.js). */
export const ACTION_KEYS = { home: 'H', sound: 'N', gift: 'K', swap: 'X', autoFight: 'V' }

/** Turns Auto Fight on or off: the hero hunts down the stage's enemies on their own. */
export function toggleAutoFight() {
  const on = !useGame.getState().autoAttack
  sfx('click')
  useGame.setState({ autoAttack: on })
  useGame.getState().toast(on ? 'Auto Fight ON' : 'Auto Fight OFF', on ? 'success' : 'info')
}

/** Back to the lobby from anywhere. */
export function goHome() {
  sfx('click')
  travel(0)
}

/** Mutes or unmutes every sound effect (remembered in settings). */
export function toggleSound() {
  const game = useGame.getState()
  game.setSetting('muted', !game.settings.muted)
  sfx('click')
}

/** The weapon class you'd switch to: Axe while holding a Sword, else Sword. */
export function swapTarget(profile) {
  return WEAPONS[profile?.weaponId]?.class === 'Sword' ? 'Axe' : 'Sword'
}

/** Your strongest weapon of class `cls`, or null if you don't own one. */
export function bestOfClass(profile, cls) {
  const owned = (profile?.items || []).filter((i) => i.kind !== 'armor' && WEAPONS[i.id]?.class === cls)
  return owned.sort((a, b) => (b.power || 0) - (a.power || 0))[0] || null
}

/** Equip your best Sword, or your best Axe if a Sword is in hand. */
export function swapWeapon() {
  const game = useGame.getState()
  const cls = swapTarget(game.profile)
  const item = bestOfClass(game.profile, cls)
  if (!item) {
    game.toast(`Forge ${cls === 'Axe' ? 'an Axe' : 'a Sword'} first!`, 'error')
    sfx('error')
    return
  }
  sfx('unlock')
  send('equip', { uid: item.uid })
  game.toast(`${WEAPONS[item.id].name} equipped!`, 'success')
}

/** Time since the last free gift was claimed (server clock), capped at the wait. */
export function onlineProgress(profile) {
  const at = profile?.giftAt ?? 0
  return Math.max(0, Math.min(ONLINE_REWARD_MS, serverNow() - at))
}

export const giftReady = (profile) => onlineProgress(profile) >= ONLINE_REWARD_MS
