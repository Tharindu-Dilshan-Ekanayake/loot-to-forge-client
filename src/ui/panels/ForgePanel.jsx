import { useEffect, useRef, useState } from 'react'

import { sfx } from '../../audio/sound'
import { send } from '../../net/network'
import { useGame } from '../../net/store'
import {
  ARMOR_CLASS_ODDS,
  ARMORS,
  FORGE_WEAPON_CHOICES,
  formatNum,
  ORES,
  RARITIES,
  RARITY_INDEX,
  rarityChances,
  rarityOf,
  skillFor,
  WEAPON_CLASS_ODDS,
  WEAPONS,
} from '../../shared/gameData'
import { Btn, CloseButton, RarityText, St } from '../common'
import { rarityBg } from '../rarity'
import { ItemIcon, OreIcon, SkillIcon } from '../Icons'

const ORE_ORDER = Object.keys(ORES)
/** The weapon drawn on each "Make:" button. */
const FORGE_TYPE_ICON = { Sword: 'iron_blade', Axe: 'woodcutter' }

function Frame({ title, children, className = '', style }) {
  return (
    <div className={`flex flex-col ${className}`} style={style}>
      <St as="h3" className="mb-2 text-center text-5xl">
        {title}
      </St>
      <div className="panel flex-1 p-5">
        <span className="corner tl" />
        <span className="corner tr" />
        <span className="corner bl" />
        <span className="corner br" />
        <div className="relative h-full">{children}</div>
      </div>
    </div>
  )
}

export function ForgePanel() {
  const profile = useGame((s) => s.profile)
  const close = useGame((s) => s.closePanel)
  const [mode, setMode] = useState('weapon')
  /** 'auto' rolls the weapon type from the ore count; else a FORGE_WEAPON_CHOICES class. */
  const [weaponType, setWeaponType] = useState('auto')
  const picked = mode === 'weapon' && weaponType !== 'auto' ? weaponType : null
  const [rawSlots, setSlots] = useState([null, null, null, null])
  // Busy until the next profile update arrives (success or a rejected forge).
  const [busyFor, setBusyFor] = useState(null)
  const busy = busyFor !== null && busyFor === profile

  useEffect(() => {
    const onKey = (e) => e.code === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  const oreByUid = Object.fromEntries((profile?.ores || []).map((o) => [o.uid, o]))
  // Slotted ores that were sold or consumed elsewhere simply drop out.
  const slots = rawSlots.map((u) => (u && oreByUid[u] ? u : null))
  const slotted = slots.filter(Boolean)
  // Unslotted ores grouped by type, rarest last like the reference game.
  const byType = {}
  for (const o of profile?.ores || []) {
    if (slots.includes(o.uid)) continue
    ;(byType[o.type] ||= []).push(o.uid)
  }
  const groups = ORE_ORDER.filter((t) => byType[t]).map((t) => [t, byType[t]])

  if (!profile) return null

  const count = slotted.length
  const multiplier = slotted.reduce((s, uid) => s + (ORES[oreByUid[uid]?.type]?.mult || 0), 0)
  const classOdds = picked ? { [picked]: 100 } : count ? (mode === 'weapon' ? WEAPON_CLASS_ODDS : ARMOR_CLASS_ODDS)[count] : null
  const topClass = classOdds ? Object.entries(classOdds).sort((a, b) => b[1] - a[1])[0] : [mode === 'weapon' ? 'Katana' : 'Plate', 0]
  const chances = count ? rarityChances(multiplier) : null

  const catalog = mode === 'weapon' ? WEAPONS : ARMORS
  const preview = Object.values(catalog).filter((d) => d.class === topClass[0] && !d.shopOnly)

  const addOre = (uid) => {
    const i = slots.indexOf(null)
    if (i < 0) {
      sfx('error')
      return
    }
    sfx('click')
    setSlots(slots.map((s, j) => (j === i ? uid : s)))
  }
  const removeSlot = (i) => {
    sfx('click')
    setSlots(slots.map((s, j) => (j === i ? null : s)))
  }

  const doForge = () => {
    if (!count || busy) return
    setBusyFor(profile)
    sfx('pour')
    send('forge', { mode, ores: slotted, cls: picked || undefined })
  }

  return (
    <div className="hud-scale fade-in absolute inset-0 z-30 flex flex-col bg-black/40">
      <div className="mt-6 flex items-center justify-center gap-6">
        <span className="h-[3px] w-56 bg-gradient-to-r from-transparent to-white/80" />
        <St as="h2" className="text-7xl">
          Forge
        </St>
        <span className="h-[3px] w-56 bg-gradient-to-l from-transparent to-white/80" />
      </div>

      <div className="flex flex-1 items-stretch justify-between gap-6 px-10 pb-8 pt-2">
        {/* Preview */}
        <Frame title="Preview" className="w-[500px]">
          <div className="mb-3 rounded-lg border-2 border-white/30 bg-white/10 px-3 py-2" style={{ boxShadow: count ? '0 0 0 2px #ffd23b inset' : undefined }}>
            <St className="text-3xl">
              {topClass[0]}: {topClass[1]}%
            </St>
          </div>
          {classOdds && Object.keys(classOdds).length > 1 && (
            <div className="mb-2 flex gap-2">
              {Object.entries(classOdds).map(([c, p]) => (
                <span key={c} className="rounded-md bg-black/40 px-2 py-0.5">
                  <St className="st-thin text-base">
                    {c} {p}%
                  </St>
                </span>
              ))}
            </div>
          )}
          <div className="grid grid-cols-4 gap-3">
            {preview.map((d) => {
              const known = profile.discovered[d.id]
              return (
                <div key={d.id} className="tile tile-gray grid aspect-square place-items-center" title={known ? `${d.name} (${d.rarity})` : '???'} style={known ? { background: rarityBg(d.rarity) } : undefined}>
                  <ItemIcon item={{ id: d.id, kind: mode }} size={64} silhouette={!known} />
                </div>
              )
            })}
          </div>
          {chances && (
            <div className="mt-4 grid grid-cols-4 gap-x-3 gap-y-1">
              {RARITIES.filter((r) => chances[r.id] >= 0.01).map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded bg-black/35 px-2">
                  <RarityText rarity={r.id} className="st-thin text-sm" />
                  <St className="st-thin text-sm">{chances[r.id] >= 1 ? chances[r.id].toFixed(0) : chances[r.id].toFixed(2)}%</St>
                </div>
              ))}
            </div>
          )}
        </Frame>

        {/* Centre: slots + forge button, with the crucible visible behind. */}
        <div className="flex flex-1 flex-col items-center justify-end">
          <div className="flex gap-4">
            {slots.map((uid, i) => {
              const ore = uid && oreByUid[uid]
              return (
                <button
                  key={i}
                  type="button"
                  className="tile grid h-[92px] w-[92px] place-items-center"
                  style={{ background: ore ? rarityBg(ORES[ore.type].rarity) : 'linear-gradient(#6a6e78,#4a4d55)' }}
                  onClick={() => ore && removeSlot(i)}
                >
                  {ore ? (
                    <>
                      <OreIcon type={ore.type} size={66} />
                      <St className="absolute bottom-0 text-lg">x1</St>
                    </>
                  ) : (
                    <St className="text-xl">Empty</St>
                  )}
                </button>
              )
            })}
          </div>
          <St className="mt-3 text-3xl" style={{ color: '#ffd23b' }}>
            Multiplier: {count ? multiplier.toFixed(1) : 0}
          </St>
          <button
            type="button"
            disabled={!count || busy}
            className={`btn mt-2 h-[78px] w-[310px] text-5xl ${count && !busy ? 'btn-gold shine' : 'btn-gray'}`}
            onClick={doForge}
          >
            {busy ? 'Forging…' : 'Forge'}
          </button>
        </div>

        {/* Ores */}
        <div className="relative w-[500px]">
          <div className="absolute -top-2 right-0 z-10">
            <CloseButton onClick={close} />
          </div>
          <Frame title="Ores" className="h-full">
            <div className="flex h-full flex-col">
              <div className="scroll-y grid flex-1 content-start gap-3" style={{ gridTemplateColumns: 'repeat(4, 96px)' }}>
                {groups.length === 0 && (
                  <St className="col-span-4 mt-6 text-center text-2xl opacity-80">No ores! Mine them in the Dungeon.</St>
                )}
                {groups.map(([type, uids]) => (
                  <button
                    key={type}
                    type="button"
                    className="tile grid h-[96px] w-[96px] place-items-center"
                    style={{ background: rarityBg(ORES[type].rarity) }}
                    onClick={() => addOre(uids[0])}
                    title={`${ORES[type].name} · x${ORES[type].mult} multiplier`}
                  >
                    <OreIcon type={type} size={62} />
                    <St className="absolute bottom-0 text-lg leading-tight">{ORES[type].name}</St>
                    <St className="absolute right-1 top-0 text-lg">{uids.length}</St>
                  </button>
                ))}
              </div>
              {mode === 'weapon' && (
                <div className="mt-3 flex items-center justify-center gap-2">
                  <St className="mr-1 text-2xl">Make:</St>
                  {['auto', ...FORGE_WEAPON_CHOICES].map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`forge-type ${weaponType === t ? 'forge-type-on' : ''}`}
                      title={t === 'auto' ? 'Weapon type rolls from the number of ores' : `Always forge a ${t}`}
                      onClick={() => {
                        sfx('click')
                        setWeaponType(t)
                      }}
                    >
                      {t !== 'auto' && <ItemIcon item={{ id: FORGE_TYPE_ICON[t], kind: 'weapon' }} size={34} />}
                      <St className="text-xl">{t === 'auto' ? 'Auto' : t}</St>
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-3 flex justify-center gap-6">
                <Btn variant={mode === 'weapon' ? 'blue' : 'gray'} className="w-48 text-4xl" onClick={() => setMode('weapon')}>
                  Weapon
                </Btn>
                <Btn variant={mode === 'armor' ? 'blue' : 'gray'} className="w-48 text-4xl" onClick={() => setMode('armor')}>
                  Armor
                </Btn>
              </div>
            </div>
          </Frame>
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Cinematic + reveal card
 * ------------------------------------------------------------------------- */

const MELT_MS = 3300

export function ForgeCinematic() {
  const forging = useGame((s) => s.forging)
  const timers = useRef([])

  useEffect(() => {
    if (forging?.phase !== 'melt') return
    const at = (ms, fn) => timers.current.push(setTimeout(fn, ms))
    at(500, () => sfx('anvil'))
    at(1200, () => sfx('anvil'))
    at(1900, () => sfx('anvil'))
    at(2500, () => sfx('sizzle'))
    at(MELT_MS, () => reveal())
    return () => {
      timers.current.forEach(clearTimeout)
      timers.current = []
    }
  }, [forging?.phase])

  if (!forging) return null

  if (forging.phase === 'melt') {
    return (
      <div className="absolute inset-0 z-30">
        <button type="button" className="absolute right-6 top-6 flex flex-col items-center transition hover:scale-105" onClick={reveal}>
          <div className="grid h-24 w-24 place-items-center rounded-2xl border-4 border-[#151522] bg-gradient-to-b from-[#8fdcff] to-[#2f7dff]">
            <St className="text-3xl italic">SKIP</St>
          </div>
        </button>
      </div>
    )
  }

  return <NewItemCard forging={forging} />
}

function reveal() {
  const f = useGame.getState().forging
  if (!f || f.phase !== 'melt') return
  const def = WEAPONS[f.item.id] || ARMORS[f.item.id]
  sfx('reveal', RARITY_INDEX[def.rarity])
  useGame.setState({ forging: { ...f, phase: 'card' } })
}

function NewItemCard({ forging }) {
  const profile = useGame((s) => s.profile)
  const { item, isNew } = forging
  const isWeapon = item.kind !== 'armor'
  const def = isWeapon ? WEAPONS[item.id] : ARMORS[item.id]
  const r = rarityOf(def.rarity)
  const skill = isWeapon ? skillFor(item.id) : null
  const price = Math.floor((item.power || item.hp || 10) * 2.4)

  const equippedUid = isWeapon ? profile?.equipped.weapon : profile?.equipped.armor
  const equipped = profile?.items.find((i) => i.uid === equippedUid)
  const better = !equipped || (item.power || item.hp) > (equipped.power || equipped.hp || 0)

  const next = () => {
    sfx('click')
    useGame.setState({ forging: null, equipHint: better ? item.uid : null })
  }

  const rows = [
    ['Name', def.name, '#ffffff'],
    ['Class', def.class, '#ffffff'],
    ['Rarity', def.rarity, r.color],
    [isWeapon ? 'Power' : 'Health', `+${formatNum(item.power || item.hp)}`, '#ffffff'],
    ['Price', formatNum(price), '#ffd23b'],
  ]
  const labelColors = ['#ffffff', '#ffffff', '#ff4d4d', '#ff7af5', '#ffd23b']

  return (
    <div className="hud-scale fade-in absolute inset-0 z-40 grid place-items-center bg-black/30" onClick={next}>
      <div className="relative">
        <div className="rays pointer-events-none absolute left-1/2 top-1/2 h-[900px] w-[900px] -translate-x-1/2 -translate-y-1/2" />
        {isNew && <div className="new-tag pointer-events-none absolute -left-16 -top-20 z-10">NEW!</div>}
        <div className="pop-in relative">
          <St as="h2" className="mb-1 text-center text-5xl">
            {isWeapon ? 'Equip your new weapon.' : 'Equip your new armor.'}
          </St>
          <div className="panel w-[740px] p-6">
            <span className="corner tl" />
            <span className="corner tr" />
            <span className="corner bl" />
            <span className="corner br" />
            <div className="relative flex gap-6">
              <div
                className="tile grid h-[300px] w-[230px] shrink-0 place-items-center"
                style={{ background: rarityBg(def.rarity), boxShadow: `0 0 30px ${r.color}` }}
              >
                <div className="-rotate-12">
                  <ItemIcon item={item} size={210} />
                </div>
              </div>
              <div className="grid flex-1 grid-cols-[150px_1fr] gap-x-3 gap-y-3">
                {rows.map(([label, value, color], i) => (
                  <div key={label} className="contents">
                    <div className="grid place-items-center rounded-md bg-white/10 py-1">
                      <St className="text-3xl" style={{ color: labelColors[i] }}>
                        {label}
                      </St>
                    </div>
                    <div className="grid place-items-center rounded-md bg-white/10 py-1">
                      {label === 'Rarity' ? <RarityText rarity={def.rarity} className="text-3xl" /> : <St className="text-3xl" style={{ color }}>{value}</St>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative mt-5 flex items-center gap-4 border-t-2 border-white/30 pt-4">
              {skill ? (
                <>
                  <div className="relative grid h-[110px] w-[130px] shrink-0 place-items-center rounded border-2 border-white/40 bg-black/30">
                    <SkillIcon skill={skill.key} size={90} />
                    <div className="absolute -right-3 -top-3 grid h-10 w-10 place-items-center rounded-lg border-[3px] border-[#151522] bg-gradient-to-b from-[#e2b3ff] to-[#8a2be2]">
                      <St className="text-xl">{skill.grade}</St>
                    </div>
                  </div>
                  <St className="text-[34px] leading-tight" style={{ color: '#ffd23b' }}>
                    {skill.text.split(/(\d+%|CD:[\d.]+s)/).map((part, i) =>
                      /\d+%|CD:/.test(part) ? (
                        <span key={i} style={{ color: '#4dff4d' }}>
                          {part}
                        </span>
                      ) : (
                        <span key={i}>{part}</span>
                      ),
                    )}
                  </St>
                </>
              ) : (
                <St className="text-3xl" style={{ color: '#7fe3ff' }}>
                  Armor raises your max health while equipped.
                </St>
              )}
            </div>
            <div className="relative mt-4 flex justify-center gap-4">
              <Btn
                variant="green"
                className="px-10 text-3xl"
                onClick={(e) => {
                  e.stopPropagation()
                  send('equip', { uid: item.uid })
                  useGame.setState({ forging: null, equipHint: null })
                }}
              >
                Equip
              </Btn>
              <Btn
                variant="gray"
                className="px-10 text-3xl"
                onClick={(e) => {
                  e.stopPropagation()
                  next()
                }}
              >
                Keep
              </Btn>
            </div>
          </div>
          <St className="mt-3 block text-center text-3xl opacity-90">Click anywhere to next</St>
        </div>
      </div>
    </div>
  )
}

export default ForgePanel
