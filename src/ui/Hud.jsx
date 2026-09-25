import { useEffect, useRef, useState } from 'react'

import { sfx } from '../audio/sound'
import { useBloxity } from '../bloxity/BloxityContext'
import { guestName, lookOrGuest, skinHeadshot } from '../bloxity/guest'
import { identityAvatarUrl } from '../bloxity/sdk'
import { fx } from '../game/bus'
import { getRoom } from '../net/network'
import { useGame } from '../net/store'
import {
  EXTRA_SKILLS,
  formatNum,
  HUB,
  rarityOf,
  skillFor,
} from '../shared/gameData'
import { St } from './common'
import { HOTKEYS } from './hotkeys'
import { ACTION_KEYS, bestOfClass, giftReady, goHome, swapTarget, swapWeapon, toggleAutoFight, toggleSound } from './quickActions'
import {
  BackpackIcon,
  BookIcon,
  CartIcon,
  CoinIcon,
  DiceIcon,
  EyeIcon,
  GearIcon,
  GiftIcon,
  HandIcon,
  HeartIcon,
  ItemIcon,
  MusicIcon,
  OreIcon,
  RebirthIcon,
  ScrollIcon,
  SkillIcon,
  SwordIcon,
  WingsIcon,
} from './Icons'

/** Re-render every `ms` — for values that live on the room state (hp, timers). */
function useTicker(ms) {
  const [, setT] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setT((t) => t + 1), ms)
    return () => clearInterval(id)
  }, [ms])
}

const open = (panel, arg) => {
  sfx('open')
  useGame.getState().openPanel(panel, arg)
}

/* ---------------------------------------------------------------------------
 * Left side
 * ------------------------------------------------------------------------- */

/** The key cap drawn on a button's top-left corner. */
function KeyBadge({ k, small = false }) {
  return <span className={`hotkey-badge ${small ? 'hotkey-sm' : ''}`}>{k}</span>
}

function BigButton({ bg, icon, label, onClick, bang, extra, hotkey }) {
  return (
    <button type="button" className={`hud-btn ${bg} grid h-[100px] w-[100px] place-items-center`} onClick={onClick}>
      <div className="-mt-3">{icon}</div>
      <St className="absolute bottom-1 text-[21px] leading-none">{label}</St>
      {bang && <span className="badge-bang">!</span>}
      {hotkey && <KeyBadge k={hotkey} />}
      {extra}
    </button>
  )
}

function MenuButtons() {
  const profile = useGame((s) => s.profile)
  const equipHint = useGame((s) => s.equipHint)
  const discovered = profile ? Object.keys(profile.discovered).length : 0
  const [indexSeen, setIndexSeen] = useState(() => Number(localStorage.getItem('ltf.indexSeen') || 1))
  const rebirthPct = profile ? Math.min(100, Math.floor((profile.level / profile.rebirthReq) * 100)) : 0

  return (
    <div className="hud-hideable pointer-events-auto absolute left-5 top-[27%] grid grid-cols-2 gap-6">
      <BigButton bg="bg-shop" icon={<CartIcon size={62} />} label="Shop" hotkey={HOTKEYS.shop} onClick={() => open('shop')} />
      <div className="relative">
        <BigButton
          bg="bg-backpack"
          icon={<BackpackIcon size={60} />}
          label="Backpack"
          hotkey={HOTKEYS.backpack}
          onClick={() => open('backpack')}
          bang={Boolean(equipHint)}
        />
        {equipHint && (
          <div className="bob pointer-events-none absolute -right-12 top-10">
            <HandIcon size={78} />
          </div>
        )}
      </div>
      <BigButton
        bg="bg-index"
        icon={<BookIcon size={60} />}
        label="Index"
        hotkey={HOTKEYS.index}
        bang={discovered > indexSeen}
        onClick={() => {
          localStorage.setItem('ltf.indexSeen', String(discovered))
          setIndexSeen(discovered)
          open('index')
        }}
      />
      <BigButton
        bg="bg-rebirth"
        icon={<RebirthIcon size={60} />}
        label="Rebirth"
        hotkey={HOTKEYS.rebirth}
        onClick={() => open('rebirth')}
        extra={<St className="absolute -right-3 -top-3 rotate-12 text-2xl italic">{rebirthPct}%</St>}
      />
    </div>
  )
}

function StatRow({ icon, children, id, pulse }) {
  return (
    <div id={id} className={`stat-row ${pulse ? 'pulse' : ''}`}>
      <div className="grid h-[62px] w-[62px] place-items-center">{icon}</div>
      <St className="text-[44px] leading-none">{children}</St>
    </div>
  )
}

function Stats() {
  const profile = useGame((s) => s.profile)
  const [bump, setBump] = useState(0)
  useEffect(() => fx.on((t) => (t === 'loot' || t === 'bagIn') && setBump((b) => b + 1)), [])
  if (!profile) return null
  const full = profile.ores.length >= profile.capacity
  return (
    <div className="hud-hideable pointer-events-none absolute bottom-6 left-5 flex flex-col gap-2">
      <StatRow icon={<BackpackIcon size={56} />} id="hud-backpack" pulse={full}>
        <span key={bump} className={`inline-block ${bump ? 'pop-in' : ''}`} style={{ color: full ? '#ff6a5e' : undefined }}>
          {profile.ores.length}/{profile.capacity}
        </span>
      </StatRow>
      <StatRow icon={<CoinIcon size={56} />}>{formatNum(profile.coins)}</StatRow>
      <StatRow icon={<RebirthIcon size={52} />}>{formatNum(profile.rebirths)}</StatRow>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Top
 * ------------------------------------------------------------------------- */

function TopCenter() {
  const stage = useGame((s) => s.stage)
  return (
    <div className="hud-hideable pointer-events-auto absolute left-1/2 top-2 flex -translate-x-1/2 flex-col items-center">
      {stage ? (
        <button type="button" className="btn btn-red relative mt-12 px-10 text-4xl" title="Home (H)" onClick={goHome}>
          Home
          <KeyBadge k={ACTION_KEYS.home} small />
        </button>
      ) : (
        <button type="button" className="relative flex flex-col items-center transition hover:scale-105" onClick={() => open('races')}>
          <WingsIcon size={112} />
          <St className="grad-rainbow -mt-6 text-3xl">Races</St>
        </button>
      )}
    </div>
  )
}

function TutorialStrip() {
  const profile = useGame((s) => s.profile)
  const equipHint = useGame((s) => s.equipHint)
  const stage = useGame((s) => s.stage)
  const forging = useGame((s) => s.forging)
  const respawn = useGame((s) => s.stageRespawn)
  const hasDrops = useGame((s) => Object.keys(s.drops).length > 0)
  if (!profile || forging) return null

  const newbie = profile.stats.forged === 0
  const cleared = stage > 0 && (respawn[String(stage)] || 0) > 0
  let text = null
  if (equipHint) text = 'Equip your new weapon.'
  else if (hasDrops && stage > 0) text = 'Press E to pick up your loot!'
  else if (newbie && profile.ores.length === 0 && stage === 0) text = 'Walk through the Dungeon gate and fight!'
  else if (newbie && stage > 0 && !cleared && profile.ores.length === 0) text = 'Defeat every enemy to unlock the ores!'
  else if (newbie && stage > 0 && cleared && profile.ores.length === 0) text = 'Mine the ores!'
  else if (newbie && profile.ores.length > 0 && stage > 0) text = 'Nice! Press H to go Home and take your ores to the Forge.'
  else if (newbie && profile.ores.length > 0) text = 'Bring your ores to the Forge and press E!'
  if (!text) return null

  return (
    <div className="hud-hideable pointer-events-none absolute left-1/2 top-[20%] -translate-x-1/2">
      <div
        className="px-24 py-2"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(20,24,40,0.75) 20%, rgba(20,24,40,0.75) 80%, transparent)' }}
      >
        <St className="whitespace-nowrap text-[40px]">{text}</St>
      </div>
    </div>
  )
}

/** The player's picture and name, as a pill at the top right. */
function PlayerTag() {
  const { identity, isLoggedIn, avatar } = useBloxity()
  const name = useGame((s) => s.profile?.name) || guestName()
  // The Bloxity picture when signed in, else the face off the character's own skin.
  const [face, setFace] = useState(null)
  const skinId = lookOrGuest(avatar).skinId
  useEffect(() => {
    let live = true
    Promise.resolve(skinHeadshot(skinId)).then((url) => live && setFace(url))
    return () => {
      live = false
    }
  }, [skinId])
  const pfp = (isLoggedIn && identityAvatarUrl(identity)) || face
  return (
    <div className="flex h-[58px] items-center gap-3 self-center rounded-full bg-[#2a2c3a]/90 py-1 pl-1 pr-5 shadow-[0_3px_0_rgba(0,0,0,0.35)]">
      {pfp ? (
        <img src={pfp} alt="" className="h-[50px] w-[50px] rounded-full bg-[#5a6070] object-cover" style={{ imageRendering: 'pixelated' }} />
      ) : (
        <div className="grid h-[50px] w-[50px] place-items-center rounded-full bg-[#2f7dff]">
          <St className="text-2xl">{name[0]?.toUpperCase()}</St>
        </div>
      )}
      <St className="text-2xl">{name}</St>
    </div>
  )
}

function TopRight() {
  const hideHud = useGame((s) => s.hideHud)
  const profile = useGame((s) => s.profile)
  const muted = useGame((s) => s.settings.muted)
  useTicker(1000)
  const questReady = profile && Object.values(profile.quests).some((q) => q.progress >= q.target)
  const gift = profile && giftReady(profile)
  const swapTo = swapTarget(profile)
  const canSwap = Boolean(bestOfClass(profile, swapTo))
  return (
    <div className="pointer-events-auto absolute right-4 top-3 flex flex-col items-end gap-3">
      <PlayerTag />
      {/* One button under another down the right edge, with room between them. */}
      <div className="mt-2 flex flex-col items-end gap-5">
        <button type="button" className="icon-btn hud-hideable" title={`${muted ? 'Sound on' : 'Sound off'} (N)`} onClick={toggleSound}>
          <MusicIcon off={muted} />
          <KeyBadge k={ACTION_KEYS.sound} small />
        </button>
        <button type="button" className="icon-btn hud-hideable" title="Free gift (K)" onClick={() => open('gift')}>
          <GiftIcon size={38} />
          <KeyBadge k={ACTION_KEYS.gift} small />
          {gift && <span className="badge-bang" style={{ fontSize: 28, top: -14, right: -6 }}>!</span>}
        </button>
        <button
          type="button"
          className={`icon-btn hud-hideable ${canSwap ? '' : 'opacity-60'}`}
          title={`Switch to your best ${swapTo} (X)`}
          onClick={swapWeapon}
        >
          <ItemIcon item={{ id: swapTo === 'Axe' ? 'woodcutter' : 'iron_blade', kind: 'weapon' }} size={34} />
          <span className="swap-label">{swapTo}</span>
          <KeyBadge k={ACTION_KEYS.swap} small />
        </button>
        <button type="button" className="icon-btn hud-hideable" title="Quests (J)" onClick={() => open('quests')}>
          <ScrollIcon />
          <KeyBadge k={HOTKEYS.quests} small />
          {questReady && <span className="badge-bang" style={{ fontSize: 28, top: -14, right: -6 }}>!</span>}
        </button>
        <button type="button" className="icon-btn hud-hideable" title="Settings (O)" onClick={() => open('settings')}>
          <GearIcon />
          <KeyBadge k={HOTKEYS.settings} small />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Hide UI"
          onClick={() => {
            sfx('click')
            useGame.setState({ hideHud: !hideHud })
          }}
        >
          <EyeIcon off={hideHud} />
        </button>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Bottom
 * ------------------------------------------------------------------------- */

function SkillSlot() {
  const weaponId = useGame((s) => s.profile?.weaponId)
  const skillCd = useGame((s) => s.skillCd)
  const [now, setNow] = useState(0)
  const skill = weaponId && skillFor(weaponId)

  // Tick every frame while the cooldown runs, so the sweep animates smoothly.
  useEffect(() => {
    if (!skillCd) return
    let raf
    const loop = () => {
      const t = performance.now()
      setNow(t)
      if (t < skillCd.until) raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [skillCd])

  const left = skillCd ? Math.max(0, skillCd.until - now) / 1000 : 0
  const pct = skillCd && left > 0 ? left / skillCd.total : 0

  return (
    <button type="button" className="slot" title={skill ? `${skill.name}: ${skill.text}` : 'No skill'} onClick={() => window.dispatchEvent(new Event('ltf:skill'))}>
      {skill && <SkillIcon skill={skill.key} size={66} />}
      {pct > 0 && (
        <div className="absolute inset-0 grid place-items-center rounded-md" style={{ background: `conic-gradient(rgba(0,0,0,0.65) ${pct * 360}deg, transparent 0)` }}>
          <St className="text-3xl">{left.toFixed(1)}</St>
        </div>
      )}
      <div className="absolute -right-3 -top-3 grid h-9 w-9 place-items-center rounded-full border-[3px] border-[#151522] bg-white">
        <span className="text-lg font-bold text-[#151522]">Q</span>
      </div>
    </button>
  )
}

function ExtraSkillSlot() {
  const extra = useGame((s) => s.profile?.extraSkill)
  const def = EXTRA_SKILLS.find((x) => x.id === extra)
  return (
    <button type="button" className="relative flex flex-col items-center" onClick={() => open('extraSkill')}>
      <St className="mb-1 text-xl" style={{ color: '#ffd23b' }}>
        {def ? def.name : 'Extra Skill'}
      </St>
      <div className="slot">
        {def ? (
          <div className="grid h-14 w-14 place-items-center rounded-full" style={{ background: `radial-gradient(${def.color}, #151522)` }}>
            <St className="text-lg">{def.name.split(' ').map((w) => w[0]).join('')}</St>
          </div>
        ) : (
          <DiceIcon size={60} />
        )}
        {!def && (
          <div className="absolute -right-3 -top-3 grid h-9 w-9 place-items-center rounded-full border-[3px] border-white bg-[#e0202c]">
            <span className="text-xl font-bold text-white">?</span>
          </div>
        )}
      </div>
    </button>
  )
}

/** The "Damage:" readout; it bumps and spits out a "+N" each time a swing trains it. */
function DamageStat({ damage }) {
  const [gains, setGains] = useState([])
  const [bump, setBump] = useState(0)
  useEffect(
    () =>
      fx.on((type, d) => {
        if (type !== 'trained' || !(d.damage > 0)) return
        const id = performance.now() + Math.random()
        setBump((b) => b + 1)
        setGains((list) => [...list.slice(-4), { id, amount: d.damage, x: (Math.random() - 0.5) * 60 }])
        setTimeout(() => setGains((list) => list.filter((g) => g.id !== id)), 900)
      }),
    [],
  )
  return (
    <div className="relative" id="hud-damage">
      <St key={bump} className={`text-[30px] ${bump ? 'dmg-bump' : ''}`} style={{ color: '#3aa8ff' }}>
        Damage:{formatNum(damage)}
      </St>
      {gains.map((g) => (
        <St key={g.id} className="hud-gain text-[26px]" style={{ '--gx': `${g.x}px` }}>
          ⚔️+{formatNum(g.amount)}
        </St>
      ))}
    </div>
  )
}

function BottomBars() {
  const profile = useGame((s) => s.profile)
  const sessionId = useGame((s) => s.sessionId)
  const autoAttack = useGame((s) => s.autoAttack)
  useTicker(120)
  if (!profile) return null
  const me = getRoom()?.state.players.get(sessionId)
  const hp = Math.ceil(me?.hp ?? profile.maxHp)
  const maxHp = profile.maxHp

  return (
    <div className="hud-hideable pointer-events-auto absolute bottom-3 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1">
      <div className="flex items-end gap-5">
        <div className="flex flex-col items-center">
          <div className="flex items-center">
            <div className="z-10 -mr-3">
              <HeartIcon size={48} />
            </div>
            <div className="bar h-[42px] w-[270px]" style={{ background: '#4a0f0f' }}>
              <div className="bar-fill" style={{ width: `${(hp / maxHp) * 100}%`, background: 'linear-gradient(#ff4d3d,#c20f0f)' }} />
              <div className="absolute inset-0 grid place-items-center">
                <St className="text-2xl">
                  {formatNum(hp)}/{formatNum(maxHp)}
                </St>
              </div>
            </div>
          </div>
          <DamageStat damage={profile.damage} />
        </div>
        {/* Both slots are 86px squares; ExtraSkillSlot's label now sits above its
            icon (not below), so with `items-end` on this row the two icon boxes
            line up on the same baseline instead of sitting at different heights. */}
        <div className="flex -translate-y-2 items-end gap-5">
          <SkillSlot />
          <ExtraSkillSlot />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="bar h-[50px] w-[640px]" style={{ background: '#3a1f12' }}>
          <div
            className="bar-fill"
            style={{ width: `${(profile.levelInto / profile.levelNeed) * 100}%`, background: 'linear-gradient(90deg,#ffe24a,#ffb000 60%,#ff8a00)' }}
          />
          <div className="absolute inset-0 flex items-center justify-between px-5">
            <St className="text-3xl">Lv. {profile.level}</St>
            <St className="text-3xl">
              {formatNum(profile.levelInto)}/{formatNum(profile.levelNeed)}
            </St>
          </div>
        </div>
        <button
          type="button"
          className={`btn auto-fight relative flex h-[50px] items-center gap-2 px-4 text-2xl ${autoAttack ? 'btn-green auto-fight-on' : 'btn-red'}`}
          title={`Auto Fight (${ACTION_KEYS.autoFight})`}
          onClick={toggleAutoFight}
        >
          <SwordIcon size={30} color="#fff" />
          <span className="whitespace-nowrap">Auto Fight</span>
          <span className="auto-fight-state">{autoAttack ? 'ON' : 'OFF'}</span>
          <KeyBadge k={ACTION_KEYS.autoFight} small />
        </button>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Contextual
 * ------------------------------------------------------------------------- */

function InteractPrompt() {
  const prompt = useGame((s) => s.prompt)
  const panel = useGame((s) => s.panel)
  if (!prompt || panel) return null
  const labels = { pickup: 'Pick up' }
  const label = labels[prompt] || HUB.stations[prompt]?.label || ''
  return (
    <button
      type="button"
      className="e-prompt pointer-events-auto absolute bottom-7 right-6 flex items-center gap-3"
      onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }))}
    >
      <span className="e-prompt-key">
        <St className="text-2xl">E</St>
      </span>
      <St className="pr-2 text-2xl">{label}</St>
    </button>
  )
}

function FightFlash() {
  const [flash, setFlash] = useState(null)
  useEffect(
    () =>
      fx.on((t, d) => {
        if (t === 'enterStage') {
          setFlash({ stage: d.stage, key: Date.now() })
          sfx('announce')
        }
      }),
    [],
  )
  useEffect(() => {
    if (!flash) return
    const id = setTimeout(() => setFlash(null), 1500)
    return () => clearTimeout(id)
  }, [flash])
  if (!flash) return null
  return (
    <div key={flash.key} className="fight-flash pointer-events-none absolute left-1/2 top-[30%] -translate-x-1/2 text-center">
      <div className="stage-title text-[120px]" style={{ color: '#ff3b3b' }}>
        FIGHT
      </div>
    </div>
  )
}

/** Counts your hits on enemies while they keep landing within a second and a half. */
function ComboCounter() {
  const [combo, setCombo] = useState({ n: 0, key: 0 })
  const resetRef = useRef(null)
  useEffect(
    () =>
      fx.on((t, d) => {
        if (t !== 'hit' || !d.mine || d.kind !== 'enemy') return
        setCombo((c) => ({ n: c.n + 1, key: c.key + 1 }))
        clearTimeout(resetRef.current)
        resetRef.current = setTimeout(() => setCombo((c) => ({ n: 0, key: c.key })), 1500)
      }),
    [],
  )
  useEffect(() => () => clearTimeout(resetRef.current), [])
  if (combo.n < 2) return null
  const hot = combo.n >= 10
  return (
    <div className="pointer-events-none absolute right-[16%] top-[40%] text-center">
      <div key={combo.key} className="combo-pop">
        <St className="text-[64px] leading-none" style={{ color: hot ? '#ff5a3b' : '#ffd23b' }}>
          {combo.n}
        </St>
        <St className="-mt-1 text-2xl" style={{ color: '#ffffff' }}>
          {hot ? 'HIT COMBO!' : 'HITS'}
        </St>
      </div>
    </div>
  )
}

function Toasts() {
  const toasts = useGame((s) => s.toasts)
  const colors = { error: '#ff6a5e', success: '#6dff4a', coin: '#ffd23b', loot: '#6dff6d', level: '#ffd23b', info: '#ffffff' }
  return (
    <div className="pointer-events-none absolute left-1/2 top-[29%] flex -translate-x-1/2 flex-col items-center gap-1">
      {toasts.map((t) => (
        <St key={t.id} className="pop-in text-[32px]" style={{ color: colors[t.kind] || '#fff' }}>
          {t.text}
        </St>
      ))}
    </div>
  )
}

function Announcement() {
  const a = useGame((s) => s.announcement)
  if (!a) return null
  const color = a.rarity ? rarityOf(a.rarity).color : '#ffffff'
  return (
    <div key={a.id} className="pop-in pointer-events-none absolute left-1/2 top-[13%] -translate-x-1/2">
      <div className="rounded-xl border-[3px] border-white/80 bg-[rgba(18,20,32,0.85)] px-6 py-2" style={{ boxShadow: `0 0 24px ${color}` }}>
        <St className="whitespace-nowrap text-2xl" style={{ color }}>
          {a.text}
        </St>
      </div>
    </div>
  )
}

function Overlays() {
  const hurtAt = useGame((s) => s.hurtAt)
  const deadAt = useGame((s) => s.deadAt)
  // Both overlays are keyed CSS animations that fade themselves out.
  return (
    <>
      {hurtAt > 0 && <div key={hurtAt} className="hurt-vignette" />}
      {deadAt > 0 && (
        <div key={deadAt} className="death-overlay pointer-events-none absolute inset-0 grid place-items-center bg-black/40">
          <div className="text-center">
            <div className="stage-title" style={{ color: '#ff4d4d' }}>
              You died!
            </div>
            <St className="text-3xl">Back to the lobby — get stronger and try again.</St>
          </div>
        </div>
      )}
    </>
  )
}

/** A sword with "+N" that flies from the player down into the Damage readout. */
function PowerFlyers() {
  const [items, setItems] = useState([])
  const idRef = useRef(0)
  const lastAt = useRef(0)
  useEffect(
    () =>
      fx.on((t, d) => {
        if (t !== 'trained' || !(d.damage > 0)) return
        // One flyer per quarter second at most, however fast the clicks come.
        const now = performance.now()
        if (now - lastAt.current < 250) return
        lastAt.current = now
        const target = document.getElementById('hud-damage')?.getBoundingClientRect()
        if (!target) return
        const id = ++idRef.current
        const x = window.innerWidth / 2 + 30 + Math.random() * 40
        const y = window.innerHeight * 0.45
        setItems((list) => [...list.slice(-5), { id, amount: d.damage, x, y, dx: target.left + target.width / 2 - x, dy: target.top - y }])
        setTimeout(() => setItems((list) => list.filter((i) => i.id !== id)), 850)
      }),
    [],
  )
  return items.map((i) => (
    <div key={i.id} className="power-flyer" style={{ left: i.x, top: i.y, '--dx': `${i.dx}px`, '--dy': `${i.dy}px` }}>
      <SwordIcon size={64} color="#9fe6ff" />
      <St className="text-[40px]" style={{ color: '#ffd23b' }}>
        +{formatNum(i.amount)}
      </St>
    </div>
  ))
}

/** Ore icons that fly from the middle of the screen into the backpack counter. */
function LootFlyers() {
  const [items, setItems] = useState([])
  const idRef = useRef(0)
  useEffect(
    () =>
      fx.on((t, d) => {
        if (t !== 'loot' && t !== 'bagIn') return
        const target = document.getElementById('hud-backpack')?.getBoundingClientRect()
        if (!target) return
        const id = ++idRef.current
        // The player stands in the middle of the screen; start from their back.
        const x = window.innerWidth / 2 - 40
        const y = window.innerHeight * 0.52 - 40
        setItems((list) => [...list, { id, ore: d.ore, x, y, dx: target.left + 20 - x, dy: target.top - y }])
        setTimeout(() => setItems((list) => list.filter((i) => i.id !== id)), 950)
      }),
    [],
  )
  return items.map((i) => (
    <div key={i.id} className="fly-icon" style={{ left: i.x, top: i.y, '--dx': `${i.dx}px`, '--dy': `${i.dy}px` }}>
      <OreIcon type={i.ore} size={80} />
    </div>
  ))
}

function TouchAttack() {
  const [coarse] = useState(() => window.matchMedia?.('(pointer: coarse)').matches)
  if (!coarse) return null
  return (
    <button
      type="button"
      className="hud-btn bg-rebirth pointer-events-auto absolute bottom-40 right-8 grid h-28 w-28 place-items-center rounded-full"
      onPointerDown={() => window.dispatchEvent(new Event('ltf:attack'))}
    >
      <SwordIcon size={64} color="#fff" />
    </button>
  )
}

/** Keyboard shortcuts for panels. */
function Hotkeys() {
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      const game = useGame.getState()
      if (game.forging) return
      if (e.repeat) return
      if (!game.panel) {
        const action = { [ACTION_KEYS.home]: goHome, [ACTION_KEYS.sound]: toggleSound, [ACTION_KEYS.swap]: swapWeapon, [ACTION_KEYS.autoFight]: toggleAutoFight }[e.code.replace('Key', '')]
        if (action && e.code.startsWith('Key')) {
          action()
          return
        }
      }
      if (e.code === `Key${ACTION_KEYS.gift}`) {
        if (game.panel === 'gift') {
          sfx('click')
          game.closePanel()
        } else if (!game.panel) open('gift')
        return
      }
      const panel = Object.keys(HOTKEYS).find((p) => e.code === `Key${HOTKEYS[p]}`)
      if (!panel) return
      if (game.panel === panel) {
        sfx('click')
        game.closePanel()
      } else if (!game.panel) {
        open(panel)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return null
}

/** Watches the inventory for a newly forged weapon stronger than the one equipped. */
function EquipHintWatcher() {
  const profile = useGame((s) => s.profile)
  const equipHint = useGame((s) => s.equipHint)
  useEffect(() => {
    if (!profile || !equipHint) return
    const item = profile.items.find((i) => i.uid === equipHint)
    if (!item || profile.equipped.weapon === equipHint || profile.equipped.armor === equipHint) {
      useGame.setState({ equipHint: null })
    }
  }, [profile, equipHint])
  return null
}

export function Hud() {
  const hideHud = useGame((s) => s.hideHud)
  const forging = useGame((s) => s.forging)
  const panel = useGame((s) => s.panel)
  const profile = useGame((s) => s.profile)
  if (!profile) return null
  // The forge screen is full-bleed, like the reference: no HUD behind it.
  const focused = forging || panel === 'forge'
  return (
    <div className={`hud-scale pointer-events-none absolute inset-0 z-10 ${hideHud ? 'hud-hidden' : ''}`}>
      <Hotkeys />
      <EquipHintWatcher />
      {!focused && (
        <>
          <TopCenter />
          <TopRight />
          <MenuButtons />
          <Stats />
          <BottomBars />
          <InteractPrompt />
          <TouchAttack />
        </>
      )}
      {!focused && !panel && <TutorialStrip />}
      <FightFlash />
      {!focused && <ComboCounter />}
      <Announcement />
      <Toasts />
      <LootFlyers />
      <PowerFlyers />
      <Overlays />
    </div>
  )
}

export default Hud
