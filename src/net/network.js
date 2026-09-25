import { Client } from '@colyseus/sdk'

import { sfx } from '../audio/sound'
import { fx, local } from '../game/bus'
import { ARMORS, bagById, HUB, LEVEL_DAMAGE_BONUS, ORES, RARITY_INDEX, rarityOf, stageEntry, stageLock, WEAPONS } from '../shared/gameData'
import { useGame } from './store'

export const SERVER_URL =
  import.meta.env.VITE_SERVER_URL || `${window.location.protocol}//${window.location.hostname}:2567`

export const ROOM_NAME = 'forge'

/**
 * Hosted on Bloxity Legion, players come in through its matchmaker, which picks
 * (or boots) a server pod and relays the socket to it. Set both in the build's
 * env; without them the client talks straight to SERVER_URL (local dev).
 */
const MATCHMAKER_URL = import.meta.env.VITE_MATCHMAKER_URL || ''
const GAME_ID = import.meta.env.VITE_GAME_ID || ''

let client = null
let room = null

/** A Colyseus client for this join: via the matchmaker when hosted, else direct. */
async function makeClient() {
  if (!MATCHMAKER_URL || !GAME_ID) return client || (client = new Client(SERVER_URL))
  const res = await fetch(`${MATCHMAKER_URL}/v1/play/${GAME_ID}`, { method: 'POST' })
  if (!res.ok) throw new Error(`matchmaker answered ${res.status}`)
  const { roomId } = await res.json()
  if (!roomId) throw new Error('matchmaker gave no server')
  // Each join gets its own relay URL: a fresh client, pinned to that pod.
  return new Client(`${MATCHMAKER_URL.replace(/^http/, 'ws')}/v1/ws/${roomId}`)
}

export const getRoom = () => room

/** Throttled, fire-and-forget message to the server. */
export function send(type, payload) {
  if (!room) return
  try {
    room.send(type, payload)
  } catch {
    // Socket closing; the leave handler will reset the UI.
  }
}

function sameIds(a, b) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false
  return true
}

/** Mirrors the id lists and small shared fields from the room state into the store. */
function syncState(state) {
  // Before the first patch the decoded state has no collections yet.
  if (!state?.players) return
  const store = useGame.getState()
  const patch = {}

  const playerIds = [...state.players.keys()]
  if (!sameIds(playerIds, store.playerIds)) patch.playerIds = playerIds
  // Every player has a private copy of the dungeon. Keep only ours (and the
  // shared event ores); other players' enemies never reach the scene.
  const me = room?.sessionId || store.sessionId
  const enemyIds = []
  for (const [id, e] of state.enemies) if (e.owner === me) enemyIds.push(id)
  if (!sameIds(enemyIds, store.enemyIds)) patch.enemyIds = enemyIds
  const oreIds = []
  for (const [id, o] of state.ores) if (o.event || o.owner === me) oreIds.push(id)
  if (!sameIds(oreIds, store.oreIds)) patch.oreIds = oreIds

  if (state.leaderboard && state.leaderboard !== syncState.lastBoard) {
    syncState.lastBoard = state.leaderboard
    try {
      patch.leaderboard = JSON.parse(state.leaderboard)
    } catch {
      // Ignore a malformed board; the next refresh replaces it.
    }
  }

  // Stage clears are keyed `${sessionId}:${stage}`; the store keeps ours by stage.
  const respawn = {}
  const prefix = `${me}:`
  for (const [key, at] of state.stageRespawn) if (key.startsWith(prefix)) respawn[key.slice(prefix.length)] = at
  if (JSON.stringify(respawn) !== JSON.stringify(store.stageRespawn)) patch.stageRespawn = respawn
  const events = Object.fromEntries(state.events.entries())
  if (JSON.stringify(events) !== JSON.stringify(store.events)) patch.events = events

  if (Object.keys(patch).length) useGame.setState(patch)
}

const itemDef = (item) => WEAPONS[item.id] || ARMORS[item.id]

function bindMessages(r) {
  const store = () => useGame.getState()

  r.onMessage('welcome', (m) => {
    useGame.setState({ serverOffset: m.serverNow - Date.now(), sessionId: m.sessionId })
  })

  r.onMessage('profile', (profile) => {
    const prev = store().profile
    useGame.setState({ profile })
    if (prev && profile.level > prev.level) {
      store().toast(`Level up! Lv. ${profile.level} • Damage +${Math.round(LEVEL_DAMAGE_BONUS * 100)}%`, 'level')
    }
  })

  r.onMessage('toast', ({ text, kind }) => {
    store().toast(text, kind)
    if (kind === 'error') sfx('error')
  })

  r.onMessage('hit', (m) => {
    const mine = m.by === r.sessionId
    fx.emit('hit', { ...m, mine })
    if (!mine) {
      // Someone else's blow: heard nearby, softer with distance.
      const d = Math.hypot(local.pos.x - m.x, local.pos.z - m.z)
      if (d < 25 && m.kind === 'enemy') sfx('hitOther', 1 - d / 25)
      return
    }
    if (m.kind === 'ore') sfx('oreHit')
    else if (m.kind === 'dummy') sfx('dummy')
    else sfx(m.crit ? 'crit' : 'hit')
  })

  r.onMessage('trained', (m) => fx.emit('trained', m))

  r.onMessage('kill', (m) => {
    fx.emit('kill', m)
    if (m.by !== r.sessionId) return
    sfx('kill')
    if (m.boss) store().toast('Boss defeated! Rare loot dropped!', 'level')
    else if (m.elite) store().toast('Elite defeated! Bonus loot!', 'loot')
  })

  r.onMessage('mined', (m) => {
    fx.emit('mined', m)
    if (local.pos.distanceTo({ x: m.x, y: local.pos.y, z: m.z }) < 30) sfx('mined')
  })

  r.onMessage('loot', (m) => {
    fx.emit('loot', m)
    sfx('loot')
    store().toast(`+1 ${ORES[m.ore].name}${m.bonus ? ' (Lucky!)' : ''}`, 'loot')
  })

  r.onMessage('backpackFull', () => fx.emit('backpackFull'))

  // --- Loot on the ground -------------------------------------------------------
  r.onMessage('drop', (m) => {
    store().addDrop(m)
    const near = Math.hypot(local.pos.x - m.x, local.pos.z - m.z) < 40
    if (near) sfx('dropPop')
    if (m.bonus) store().toast('Lucky! Bonus ore', 'loot')
  })

  r.onMessage('picked', ({ items }) => {
    const now = performance.now()
    const drops = { ...store().drops }
    items.forEach(({ id }, i) => {
      // Stagger several pickups so they stream into the bag one after another.
      if (drops[id]) drops[id] = { ...drops[id], picking: now + i * 90 }
    })
    useGame.setState({ drops })
    sfx('pickup')
    const names = items.map((it) => ORES[it.ore].name)
    const counts = names.reduce((acc, n) => ({ ...acc, [n]: (acc[n] || 0) + 1 }), {})
    store().toast(Object.entries(counts).map(([n, c]) => `+${c} ${n}`).join('  '), 'loot')
  })

  r.onMessage('dropGone', ({ ids }) => store().removeDrops(ids))


  r.onMessage('stageClear', ({ stage }) => {
    fx.emit('stageClear', { stage })
    const mine = store().stage
    if (mine === stage || mine === stage + 1) sfx('unlock')
  })

  r.onMessage('shot', (m) => {
    fx.emit('shot', m)
    if (Math.hypot(local.pos.x - m.x, local.pos.z - m.z) < 30) sfx('arrow')
  })

  r.onMessage('bagEquipped', ({ id, bought }) => {
    const bag = bagById(id)
    local.bagFlashAt = performance.now()
    store().toast(bought ? `Bought ${bag.name}! ${bag.capacity} slots` : `Equipped ${bag.name}`, 'success')
    sfx(bought ? 'reveal' : 'bagIn', RARITY_INDEX[bag.rarity])
  })

  r.onMessage('forged', ({ item, isNew, bought }) => {
    store().closePanel()
    if (bought) {
      useGame.setState({ forging: { item, isNew, phase: 'card' } })
      sfx('reveal', RARITY_INDEX[itemDef(item).rarity])
    } else {
      useGame.setState({ forging: { item, isNew, phase: 'melt', startedAt: performance.now() } })
    }
  })

  r.onMessage('sold', ({ coins }) => {
    sfx('sell')
    store().toast(`+${coins} coins`, 'coin')
  })

  r.onMessage('rolled', (m) => {
    useGame.setState({ lastRoll: { ...m, at: Date.now() } })
  })

  r.onMessage('crate', ({ ores }) => {
    sfx('loot')
    store().toast(`Got ${ores.map((o) => ORES[o].name).join(' + ')}!`, 'loot')
  })

  r.onMessage('fx', ({ kind }) => sfx(kind))

  r.onMessage('announce', ({ text, kind, rarity }) => {
    // Solo game: other players coming and going isn't worth a banner.
    if (kind === 'join' || kind === 'leave') return
    store().announce(text, kind, rarity)
    sfx('announce')
  })

  r.onMessage('levelup', ({ id }) => {
    fx.emit('levelup', { id })
    if (id === r.sessionId) sfx('levelup')
  })

  r.onMessage('rebirth', ({ id, rebirths }) => {
    fx.emit('levelup', { id, big: true })
    if (id === r.sessionId) {
      sfx('reveal', 5)
      store().toast(`Rebirth ${rebirths}! Power gains x${1 + rebirths * 0.5}`, 'level')
    }
  })

  r.onMessage('hurt', (m) => {
    useGame.setState({ hurtAt: performance.now() })
    fx.emit('hurtLocal', m)
    local.shakeUntil = performance.now() + 180
    local.shake = Math.min(0.35, 0.12 + m.amount / Math.max(1, store().profile?.maxHp || 100))
    sfx('hurt')
  })

  r.onMessage('died', ({ spawn }) => {
    sfx('death')
    useGame.setState({ deadAt: performance.now(), stage: 0 })
    store().toast('The dungeon has reset. Get stronger and try again!', 'info')
    local.teleport?.(spawn, Math.PI)
  })

  r.onMessage('teleport', ({ pos, stage }) => {
    local.teleport?.(pos, Math.PI)
    useGame.setState({ stage })
  })

  r.onMessage('teleportOk', () => {})

  r.onMessage('skill', (m) => {
    if (m.by !== r.sessionId) fx.emit('skill', m)
  })

}

/**
 * Joins the first lobby with a free seat; Colyseus opens a new one once every
 * lobby holds 8 players.
 */
export async function connect({ name, key, avatar, pfp }) {
  useGame.setState({ screen: 'connecting', connError: '' })
  try {
    const c = await makeClient()
    const options = { name, key, avatar, pfp }
    room = await c.joinOrCreate(ROOM_NAME, options)
  } catch (err) {
    console.error('[net] join failed', err)
    room = null
    useGame.setState({
      screen: 'title',
      entered: false,
      connError: MATCHMAKER_URL
        ? `Could not join a server (${err?.message || err}). Please try again.`
        : `Could not join the server (${err?.message || err}). Is it running on ${SERVER_URL}?`,
    })
    return false
  }

  // Dev only: lets the test scripts read the room (who's alive, where) and the store.
  if (import.meta.env.DEV || import.meta.env.VITE_PERF_HOOKS) {
    window.__room = room
    window.__game = useGame
  }
  bindMessages(room)
  // The full state arrives just after the join resolves; don't enter the world
  // until it has, or every entity lookup would hit an empty state.
  const firstState = new Promise((resolve) => room.onStateChange.once(resolve))
  room.onStateChange((state) => syncState(state))
  room.onLeave(() => {
    room = null
    local.ready = false
    useGame.setState({
      screen: 'title',
      entered: false,
      profile: null,
      playerIds: [],
      enemyIds: [],
      oreIds: [],
      drops: {},
      panel: null,
      forging: null,
      connError: 'Disconnected from the server.',
    })
  })
  room.onError((code, message) => console.warn('[net] room error', code, message))

  await Promise.race([firstState, new Promise((r) => setTimeout(r, 5000))])
  syncState(room.state)
  useGame.setState({ screen: 'playing', stage: 0 })
  return true
}

/** Matches the server: no teleporting to a stage this soon after being hit. */
const COMBAT_LOCK_MS = 4000

/** Moves the local player to a stage (or the hub with 0) and tells the server. */
export function travel(stage) {
  const game = useGame.getState()
  const fail = (text) => {
    game.toast(text, 'error')
    sfx('error')
  }
  // Mirrors the server's checks: no hopping to a stage mid-fight, and only to
  // stages you're strong enough for.
  if (stage && performance.now() - game.hurtAt < COMBAT_LOCK_MS) return fail("Can't teleport in the middle of a fight!")
  const lock = stage && stageLock(stage, { damage: game.profile?.damage ?? 0, rebirths: game.profile?.rebirths ?? 0 })
  if (lock) return fail(`Stage ${stage}: ${lock.text}!`)
  const pos = stage ? stageEntry(stage) : HUB.spawn
  local.teleport?.(pos, Math.PI)
  useGame.setState({ stage })
  send('teleport', { stage })
  sfx('portal')
}

export { rarityOf }
