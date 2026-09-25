import { useEffect, useRef, useState } from 'react'

import { sfx } from '../../audio/sound'
import { send } from '../../net/network'
import { useGame } from '../../net/store'
import {
  ENCHANT_COST,
  ENCHANTS,
  EXTRA_SKILL_COST,
  EXTRA_SKILLS,
  RACE_SPIN_COST,
  RACES,
  WEAPONS,
} from '../../shared/gameData'
import { Btn, Panel, Price, St, Wallet } from '../common'
import { rarityBg } from '../rarity'
import { DiceIcon, WeaponIcon, WingsIcon } from '../Icons'

/**
 * Shared "spin the wheel" panel: the display cycles through options until the
 * server's result arrives (and at least a second has passed), then lands on it.
 */
function RollPanel({ title, titleClass, what, options, currentId, cost, message, describe, art, blockedReason }) {
  const coins = useGame((s) => s.profile?.coins ?? 0)
  const lastRoll = useGame((s) => s.lastRoll)
  const [spinId, setSpinId] = useState(null)
  const [rolling, setRolling] = useState(false)
  const shown = rolling ? spinId : currentId
  const startedAt = useRef(0)
  const timer = useRef(null)

  useEffect(() => () => clearInterval(timer.current), [])

  useEffect(() => {
    if (!rolling || !lastRoll || lastRoll.what !== what || lastRoll.at < startedAt.current) return
    const wait = Math.max(0, 1100 - (Date.now() - startedAt.current))
    const id = setTimeout(() => {
      clearInterval(timer.current)
      setSpinId(lastRoll.id)
      setRolling(false)
      sfx('reward')
    }, wait)
    return () => clearTimeout(id)
  }, [lastRoll, rolling, what])

  const roll = () => {
    if (rolling) return
    startedAt.current = Date.now()
    setRolling(true)
    send(message)
    let i = 0
    timer.current = setInterval(() => {
      i += 1
      setSpinId(options[i % options.length].id)
      sfx('roll')
    }, 70)
    // Server rejected (e.g. not enough coins): stop spinning.
    setTimeout(() => {
      if (Date.now() - startedAt.current > 2900) {
        clearInterval(timer.current)
        setRolling(false)
      }
    }, 3000)
  }

  const cur = options.find((o) => o.id === shown)
  const total = options.reduce((s, o) => s + o.weight, 0)

  return (
    <Panel title={title} width={820} titleClass={titleClass}>
      <div className="mb-3 flex justify-end">
        <Wallet />
      </div>
      <div className="flex gap-5">
        <div className="flex w-[330px] flex-col items-center gap-3 rounded-xl bg-black/30 p-5">
          {art}
          <div
            className={`grid h-[120px] w-full place-items-center rounded-xl border-4 border-[#151522] ${rolling ? '' : 'pop-in'}`}
            style={{ background: cur ? `radial-gradient(circle, ${cur.color}, #151522)` : '#2a2d36' }}
          >
            <St className="text-4xl">{cur ? cur.name : 'None'}</St>
            {cur && <St className="st-thin text-lg">{describe(cur)}</St>}
          </div>
          <Btn variant="gold" className="w-full text-3xl" disabled={rolling || coins < cost || Boolean(blockedReason)} onClick={roll}>
            {rolling ? 'Rolling…' : blockedReason || (
              <span className="inline-flex items-center gap-2">
                Roll <Price amount={cost} />
              </span>
            )}
          </Btn>
        </div>
        <div className="flex-1">
          <St className="mb-2 block text-2xl">Chances</St>
          <div className="flex flex-col gap-2">
            {options.map((o) => (
              <div key={o.id} className="flex items-center justify-between rounded-lg px-3 py-1" style={{ background: `linear-gradient(90deg, ${o.color}55, transparent)` }}>
                <St className="text-xl" style={{ color: o.color }}>
                  {o.name}
                </St>
                <St className="st-thin text-base">{describe(o)}</St>
                <St className="text-lg">{((o.weight / total) * 100).toFixed(o.weight / total < 0.02 ? 1 : 0)}%</St>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  )
}

export function RacesPanel() {
  const race = useGame((s) => s.profile?.race)
  return (
    <RollPanel
      title="Races"
      titleClass="grad-rainbow"
      what="race"
      message="race"
      options={RACES}
      currentId={race}
      cost={RACE_SPIN_COST}
      describe={(o) => `x${o.mult} damage`}
      art={<WingsIcon size={120} />}
    />
  )
}

export function EnchantPanel() {
  const profile = useGame((s) => s.profile)
  const weapon = profile?.items.find((i) => i.uid === profile.equipped.weapon)
  const def = weapon && WEAPONS[weapon.id]
  return (
    <RollPanel
      title="Enchant"
      titleClass="text-[#e08bff]"
      what="enchant"
      message="enchant"
      options={ENCHANTS}
      currentId={weapon?.enchant}
      cost={ENCHANT_COST}
      describe={(o) => `+${Math.round(o.mult * 100)}% damage`}
      blockedReason={weapon ? null : 'Equip a weapon'}
      art={
        def ? (
          <div className="flex flex-col items-center">
            <div className="tile grid h-24 w-24 place-items-center" style={{ background: rarityBg(def.rarity) }}>
              <WeaponIcon weaponId={def.id} size={72} />
            </div>
            <St className="mt-1 text-xl">{def.name}</St>
          </div>
        ) : null
      }
    />
  )
}

export function ExtraSkillPanel() {
  const extra = useGame((s) => s.profile?.extraSkill)
  return (
    <RollPanel
      title="Extra Skill"
      titleClass="text-[#ffd23b]"
      what="extraSkill"
      message="extraSkill"
      options={EXTRA_SKILLS}
      currentId={extra}
      cost={EXTRA_SKILL_COST}
      describe={(o) => o.text}
      art={<DiceIcon size={100} />}
    />
  )
}
