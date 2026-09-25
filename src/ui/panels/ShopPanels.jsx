import { send } from '../../net/network'
import { useGame } from '../../net/store'
import {
  BAG_UPGRADE,
  bagCapacity,
  bagLevel,
  bagUpgradeCost,
  bagUpgradeSlots,
  BAGS,
  DUMMIES,
  HUB,
  ORES,
  QUESTS,
  rebirthMult,
  SHOP_ITEMS,
  STAGES,
  upgradeCost,
  UPGRADES,
} from '../../shared/gameData'
import { Btn, Panel, Price, ProgressBar, St, Wallet } from '../common'
import { rarityBg } from '../rarity'
import { BackpackIcon, BagIcon, HeartIcon, OreIcon, RebirthIcon } from '../Icons'

/** Backpacks: bigger bags carry more ores, you wear the one you pick, and each owned bag upgrades with coins. */
function BagShop({ profile }) {
  const extra = (profile.upgrades.capacity || 0) * 2
  return (
    <>
      <div className="mb-2 mt-5 flex items-baseline justify-between">
        <St className="text-2xl">Backpacks</St>
        <St className="st-thin text-base opacity-90">
          Worn on your back · +{extra} slots from upgrades
        </St>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {BAGS.map((bag) => {
          const owned = profile.bags?.includes(bag.id)
          const worn = profile.bag === bag.id
          const wallet = bag.currency === 'gems' ? profile.gems : profile.coins
          const lvl = bagLevel(profile, bag.id)
          const maxed = lvl >= BAG_UPGRADE.max
          const upCost = bagUpgradeCost(bag, lvl)
          return (
            <div
              key={bag.id}
              className={`relative flex flex-col items-center rounded-xl border-4 p-2 ${worn ? 'border-[#6dff4a]' : 'border-[#151522]'}`}
              style={{ background: rarityBg(bag.rarity) }}
            >
              {worn && <span className="bag-worn">WORN</span>}
              {owned && <span className="bag-level">Lv. {lvl}</span>}
              <BagIcon look={bag.look} size={78} />
              <St className="text-center text-xl leading-tight">{bag.name}</St>
              <St className="text-lg" style={{ color: '#fff27a' }}>
                {bagCapacity(profile, bag) + extra} slots
              </St>
              <St className="st-thin text-center text-xs opacity-90">{bag.text}</St>
              {owned ? (
                <>
                  <Btn
                    variant={worn ? 'gray' : 'blue'}
                    sound="click"
                    className="mt-1 w-full text-lg"
                    disabled={worn}
                    onClick={() => send('equipBag', { id: bag.id })}
                  >
                    {worn ? 'Equipped' : 'Equip'}
                  </Btn>
                  <Btn
                    variant="gold"
                    sound="purchase"
                    className="mt-1 w-full text-base"
                    disabled={maxed || profile.coins < upCost}
                    title={maxed ? 'Fully upgraded' : `Upgrade: +${bagUpgradeSlots(bag)} slots`}
                    onClick={() => send('upgradeBag', { id: bag.id })}
                  >
                    {maxed ? (
                      'MAX'
                    ) : (
                      <span className="flex items-center gap-1">
                        +{bagUpgradeSlots(bag)} <Price amount={upCost} />
                      </span>
                    )}
                  </Btn>
                </>
              ) : (
                <Btn
                  variant="green"
                  sound="purchase"
                  className="mt-1 w-full text-lg"
                  disabled={wallet < bag.price}
                  onClick={() => send('buyBag', { id: bag.id })}
                >
                  <Price amount={bag.price} currency={bag.currency} />
                </Btn>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

export function ShopPanel() {
  const profile = useGame((s) => s.profile)
  if (!profile) return null
  const crates = SHOP_ITEMS.filter((i) => i.pool)

  return (
    <Panel title="Shop" width={1000} titleClass="grad-rainbow">
      <div className="mb-1 flex justify-end">
        <Wallet />
      </div>
      <BagShop profile={profile} />

      <St className="mb-2 mt-5 block text-2xl">Ore Crates</St>
      <div className="grid grid-cols-3 gap-4">
        {crates.map((item) => (
          <div key={item.id} className="flex items-center gap-3 rounded-xl bg-black/30 p-3">
            <div className="flex -space-x-5">
              {item.pool.slice(-3).map((o) => (
                <OreIcon key={o} type={o} size={48} />
              ))}
            </div>
            <div className="flex flex-1 flex-col">
              <St className="text-xl">{item.name}</St>
              <St className="st-thin text-sm opacity-90">{item.text}</St>
              <St className="st-thin text-xs opacity-75">{item.pool.map((o) => ORES[o].name).join(' · ')}</St>
              <Btn variant="gold" sound="purchase" className="mt-1 text-xl" onClick={() => send('buy', { id: item.id })}>
                <Price amount={item.price} />
              </Btn>
            </div>
          </div>
        ))}
      </div>
      <St className="st-thin mt-3 block text-center text-sm opacity-80">
        Earn coins from enemies, quests and the free gift.
      </St>
    </Panel>
  )
}

export function UpgradePanel() {
  const profile = useGame((s) => s.profile)
  if (!profile) return null
  const icons = { capacity: <BackpackIcon size={80} />, vitality: <HeartIcon size={76} /> }
  return (
    <Panel title="Upgrade" width={760} titleClass="text-[#6dff4a]">
      <div className="mb-4 flex justify-end">
        <Wallet />
      </div>
      <div className="grid grid-cols-2 gap-5">
        {Object.entries(UPGRADES).map(([key, u]) => {
          const lvl = profile.upgrades[key] || 0
          const maxed = lvl >= u.max
          const cost = upgradeCost(key, lvl)
          return (
            <div key={key} className="flex flex-col items-center gap-2 rounded-xl bg-black/30 p-5">
              {icons[key]}
              <St className="text-3xl">{u.name}</St>
              <St className="text-lg opacity-90">{u.text}</St>
              <ProgressBar value={lvl} max={u.max} label={`Lv. ${lvl}/${u.max}`} color="linear-gradient(#b6ff7a,#2fd32f)" />
              {key === 'capacity' && <St className="text-xl">Now: {profile.capacity} ores</St>}
              {key === 'vitality' && <St className="text-xl">Max HP: {profile.maxHp}</St>}
              <Btn variant="green" sound="purchase" className="w-full text-2xl" disabled={maxed || profile.coins < cost} onClick={() => send('upgrade', { key })}>
                {maxed ? 'MAX' : <Price amount={cost} />}
              </Btn>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

export function RebirthPanel() {
  const profile = useGame((s) => s.profile)
  if (!profile) return null
  const next = profile.rebirths + 1
  const ready = profile.level >= profile.rebirthReq
  const newStages = STAGES.filter((st) => st.rebirths === next).map((st) => st.id)
  const unlocks = [
    ...DUMMIES.filter((d) => d.rebirths === next).map((d) => `x${d.mult} Power training area`),
    ...(newStages.length ? [`Dungeon Stages ${newStages[0]}-${newStages[newStages.length - 1]}`] : []),
    ...(next === HUB.tower.rebirths ? [`Frostbound Tower shortcut to Stage ${HUB.tower.stage}`] : []),
  ]
  return (
    <Panel title="Rebirth" width={680} titleClass="text-[#d08bff]">
      <div className="flex flex-col items-center gap-3">
        <div className="spin-slow">
          <RebirthIcon size={120} />
        </div>
        <St className="text-3xl">
          Rebirths: {profile.rebirths} → {next}
        </St>
        <div className="w-full">
          <ProgressBar
            value={profile.level}
            max={profile.rebirthReq}
            height={34}
            color="linear-gradient(90deg,#d08bff,#8a2be2)"
            label={`Level ${profile.level} / ${profile.rebirthReq}`}
          />
        </div>
        <div className="w-full rounded-xl bg-black/30 p-4">
          <St className="block text-2xl" style={{ color: '#6dff4a' }}>
            You gain
          </St>
          <St className="block text-xl">
            • Power gains & damage x{rebirthMult(next)} (now x{rebirthMult(profile.rebirths)})
          </St>
          {unlocks.map((u) => (
            <St key={u} className="block text-xl">
              • Unlock {u}
            </St>
          ))}
          <St className="mt-2 block text-2xl" style={{ color: '#ff6a5e' }}>
            You lose
          </St>
          <St className="block text-xl">• Your power and level reset (weapons, ores and coins are kept)</St>
        </div>
        <Btn variant="purple" sound="click" className="w-72 text-4xl" disabled={!ready} onClick={() => send('rebirth')}>
          {ready ? 'Rebirth!' : `Reach Lv. ${profile.rebirthReq}`}
        </Btn>
      </div>
    </Panel>
  )
}

export function QuestsPanel() {
  const profile = useGame((s) => s.profile)
  if (!profile) return null
  return (
    <Panel title="Quests" width={720}>
      <div className="flex flex-col gap-3">
        {QUESTS.map((def) => {
          const q = profile.quests[def.id]
          const done = q.progress >= q.target
          return (
            <div key={def.id} className="flex items-center gap-4 rounded-xl bg-black/30 p-3">
              <div className="flex-1">
                <div className="flex items-baseline justify-between">
                  <St className="text-2xl">{def.name}</St>
                  <St className="text-base opacity-80">Tier {q.tier + 1}</St>
                </div>
                <St className="st-thin mb-1 block text-base opacity-90">
                  {def.verb} ({q.progress}/{q.target})
                </St>
                <ProgressBar value={q.progress} max={q.target} height={20} />
              </div>
              <div className="flex w-40 flex-col items-center gap-1">
                <span className="flex items-center gap-2">
                  <Price amount={Math.round(def.coins * (1 + q.tier * 0.5))} />
                </span>
                <Btn variant={done ? 'green' : 'gray'} className="w-full text-xl" disabled={!done} onClick={() => send('claimQuest', { id: def.id })}>
                  {done ? 'Claim!' : 'In progress'}
                </Btn>
              </div>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}
