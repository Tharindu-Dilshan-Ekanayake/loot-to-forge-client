import { useMemo, useState } from 'react'

import { send } from '../../net/network'
import { useGame } from '../../net/store'
import {
  ARMOR_CLASSES,
  ARMORS,
  ENCHANTS,
  formatNum,
  MAX_WEAPONS,
  ORES,
  RARITIES,
  RARITY_INDEX,
  skillFor,
  WEAPON_CLASSES,
  WEAPONS,
} from '../../shared/gameData'
import { Btn, Panel, Price, RarityText, RarityTile, St, Tabs, Wallet } from '../common'
import { ItemIcon, LockIcon, OreIcon, SkillIcon } from '../Icons'

const itemDef = (item) => WEAPONS[item.id] || ARMORS[item.id]
const itemPrice = (item) => Math.floor((item.power || item.hp || 10) * 2.4)

function sortItems(items) {
  return [...items].sort((a, b) => {
    const ra = RARITY_INDEX[itemDef(a).rarity]
    const rb = RARITY_INDEX[itemDef(b).rarity]
    return rb - ra || (b.power || b.hp) - (a.power || a.hp)
  })
}

function ItemDetails({ item, equipped, onClose }) {
  const def = itemDef(item)
  const isWeapon = item.kind !== 'armor'
  const skill = isWeapon ? skillFor(item.id) : null
  const enchant = ENCHANTS.find((e) => e.id === item.enchant)
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <RarityTile rarity={def.rarity} size={150}>
        <ItemIcon item={item} size={120} />
      </RarityTile>
      <St className="text-3xl">{def.name}</St>
      <RarityText rarity={def.rarity} className="text-2xl" />
      <St className="text-2xl" style={{ color: isWeapon ? '#ff7af5' : '#ff6a5e' }}>
        {isWeapon ? 'Power' : 'Health'} +{formatNum(item.power || item.hp)}
      </St>
      {enchant && (
        <St className="text-xl" style={{ color: enchant.color }}>
          ✦ {enchant.name} (+{Math.round(enchant.mult * 100)}%)
        </St>
      )}
      {skill && (
        <div className="flex items-center gap-2 rounded-lg bg-black/30 p-2 text-left">
          <SkillIcon skill={skill.key} size={44} />
          <St className="st-thin text-base leading-tight">
            [{skill.grade}] {skill.text}
          </St>
        </div>
      )}
      <div className="mt-1 flex flex-wrap justify-center gap-2">
        {equipped ? (
          <Btn variant={isWeapon ? 'gray' : 'red'} disabled={isWeapon} className="text-2xl" onClick={() => send('equip', { uid: item.uid })}>
            {isWeapon ? 'Equipped' : 'Unequip'}
          </Btn>
        ) : (
          <Btn variant="green" className="text-2xl" onClick={() => send('equip', { uid: item.uid })}>
            Equip
          </Btn>
        )}
        <Btn variant="blue" className="text-2xl" onClick={() => send('lock', { uid: item.uid })}>
          {item.locked ? 'Unlock' : 'Lock'}
        </Btn>
        <Btn
          variant="gold"
          className="text-2xl"
          sound="coin"
          disabled={equipped || item.locked}
          onClick={() => {
            send('sell', { what: 'item', uid: item.uid })
            onClose()
          }}
        >
          Sell <Price amount={itemPrice(item)} />
        </Btn>
      </div>
    </div>
  )
}

export function BackpackPanel() {
  const profile = useGame((s) => s.profile)
  const [tab, setTab] = useState('weapon')
  const [selected, setSelected] = useState(null)

  const list = useMemo(() => {
    if (!profile) return []
    return sortItems(profile.items.filter((i) => (tab === 'armor' ? i.kind === 'armor' : i.kind !== 'armor')))
  }, [profile, tab])

  if (!profile) return null
  const equippedSet = new Set(Object.values(profile.equipped))
  const sel = profile.items.find((i) => i.uid === selected) || list.find((i) => equippedSet.has(i.uid)) || list[0]

  const oreGroups = Object.entries(
    profile.ores.reduce((acc, o) => {
      acc[o.type] = (acc[o.type] || 0) + 1
      return acc
    }, {}),
  ).sort((a, b) => ORES[b[0]].mult - ORES[a[0]].mult)
  const oreValue = profile.ores.reduce((s, o) => s + ORES[o.type].sell, 0)

  return (
    <Panel title="Backpack" width={980}>
      <div className="mb-3 flex items-center justify-between">
        <Tabs
          tabs={[
            ['weapon', 'Weapons'],
            ['armor', 'Armor'],
            ['ores', `Ores ${profile.ores.length}/${profile.capacity}`],
          ]}
          value={tab}
          onChange={(t) => {
            setTab(t)
            setSelected(null)
          }}
        />
        <Wallet />
      </div>

      {tab === 'ores' ? (
        <div className="flex gap-5">
          <div className="scroll-y grid flex-1 content-start gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, 92px)', maxHeight: '52vh' }}>
            {oreGroups.length === 0 && <St className="text-2xl opacity-80">Your backpack is empty. Mine ores in the Dungeon!</St>}
            {oreGroups.map(([type, n]) => (
              <RarityTile key={type} rarity={ORES[type].rarity} size={92} title={ORES[type].name}>
                <OreIcon type={type} size={62} />
                <St className="absolute right-1 top-0 text-lg">{n}</St>
                <St className="absolute bottom-0 text-base">{ORES[type].name}</St>
              </RarityTile>
            ))}
          </div>
          <div className="flex w-[260px] flex-col items-center justify-center gap-3 rounded-xl bg-black/30 p-4">
            <St className="text-center text-2xl">Ore value</St>
            <Price amount={oreValue} className="text-3xl" />
            <Btn variant="gold" sound="coin" className="text-2xl" disabled={!profile.ores.length} onClick={() => send('sell', { what: 'ores' })}>
              Sell all ores
            </Btn>
            <St className="st-thin text-center text-sm opacity-80">Tip: rarer ores give a bigger forge multiplier!</St>
          </div>
        </div>
      ) : (
        <div className="flex gap-5">
          <div>
            <div
              className="scroll-y grid content-start gap-3 pr-1"
              style={{ gridTemplateColumns: 'repeat(6, 92px)', maxHeight: '54vh', minHeight: 300 }}
            >
              {list.map((item) => {
                const def = itemDef(item)
                return (
                  <RarityTile key={item.uid} rarity={def.rarity} size={92} selected={sel?.uid === item.uid} onClick={() => setSelected(item.uid)} title={def.name}>
                    <ItemIcon item={item} size={66} />
                    <St className="absolute bottom-0 text-base">{formatNum(item.power || item.hp)}</St>
                    {equippedSet.has(item.uid) && (
                      <span className="absolute -left-2 -top-2 grid h-7 w-7 place-items-center rounded-full border-2 border-white bg-[#22c21f] text-sm font-bold text-white">
                        E
                      </span>
                    )}
                    {item.locked && (
                      <span className="absolute -right-2 -top-2">
                        <LockIcon size={24} />
                      </span>
                    )}
                  </RarityTile>
                )
              })}
            </div>
            <St className="mt-2 block text-lg opacity-80">
              Items {profile.items.length}/{MAX_WEAPONS}
            </St>
          </div>
          <div className="flex flex-1 items-start justify-center rounded-xl bg-black/30 p-4">
            {sel ? <ItemDetails item={sel} equipped={equippedSet.has(sel.uid)} onClose={() => setSelected(null)} /> : <St className="text-2xl">Nothing here yet — forge something!</St>}
          </div>
        </div>
      )}
    </Panel>
  )
}

export function IndexPanel() {
  const profile = useGame((s) => s.profile)
  const classes = [...Object.keys(WEAPON_CLASSES), ...Object.keys(ARMOR_CLASSES)]
  const [cls, setCls] = useState('Katana')
  const [selected, setSelected] = useState(null)
  if (!profile) return null

  const isArmor = Boolean(ARMOR_CLASSES[cls])
  const defs = Object.values(isArmor ? ARMORS : WEAPONS).filter((d) => d.class === cls)
  const found = defs.filter((d) => profile.discovered[d.id]).length
  const all = [...Object.values(WEAPONS), ...Object.values(ARMORS)]
  const totalFound = all.filter((d) => profile.discovered[d.id]).length
  const sel = defs.find((d) => d.id === selected)
  const skill = sel && !isArmor ? skillFor(sel.id) : null

  return (
    <Panel title="Index" width={960}>
      <div className="mb-3 flex items-center justify-between">
        <Tabs tabs={classes.map((c) => [c, c])} value={cls} onChange={(c) => { setCls(c); setSelected(null) }} />
        <St className="text-xl">
          Total {totalFound}/{all.length}
        </St>
      </div>
      <div className="flex gap-5">
        <div className="flex-1">
          <St className="mb-2 block text-3xl">
            {cls}: {Math.round((found / defs.length) * 100)}%
          </St>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(6, 92px)' }}>
            {defs.map((d) => {
              const known = profile.discovered[d.id]
              return (
                <RarityTile
                  key={d.id}
                  rarity={known ? d.rarity : null}
                  size={92}
                  className={known ? '' : 'tile-gray'}
                  selected={selected === d.id}
                  onClick={() => setSelected(d.id)}
                >
                  <ItemIcon item={{ id: d.id, kind: isArmor ? 'armor' : 'weapon' }} size={66} silhouette={!known} />
                </RarityTile>
              )
            })}
          </div>
        </div>
        <div className="flex w-[280px] flex-col items-center justify-center gap-2 rounded-xl bg-black/30 p-4 text-center">
          {sel ? (
            profile.discovered[sel.id] ? (
              <>
                <St className="text-3xl">{sel.name}</St>
                <RarityText rarity={sel.rarity} className="text-2xl" />
                {skill && (
                  <>
                    <SkillIcon skill={skill.key} size={60} />
                    <St className="st-thin text-base">
                      [{skill.grade}] {skill.text}
                    </St>
                  </>
                )}
                {sel.shopOnly && <St className="text-lg" style={{ color: '#ff9bff' }}>Shop exclusive</St>}
              </>
            ) : (
              <>
                <St className="text-4xl">???</St>
                <RarityText rarity={sel.rarity} className="text-2xl" />
                <St className="st-thin text-base opacity-80">{sel.shopOnly ? 'Found in the shop.' : `Forge a ${sel.class} to discover it!`}</St>
              </>
            )
          ) : (
            <St className="text-xl opacity-80">Select an item</St>
          )}
        </div>
      </div>
    </Panel>
  )
}

export function SellPanel() {
  const profile = useGame((s) => s.profile)
  const [maxRarity, setMaxRarity] = useState('UnCommon')
  if (!profile) return null

  const oreValue = profile.ores.reduce((s, o) => s + ORES[o.type].sell, 0)
  const equippedSet = new Set(Object.values(profile.equipped))
  const sellable = profile.items.filter(
    (i) => !i.locked && !equippedSet.has(i.uid) && RARITY_INDEX[itemDef(i).rarity] <= RARITY_INDEX[maxRarity],
  )
  const itemValue = sellable.reduce((s, i) => s + itemPrice(i), 0)

  return (
    <Panel title="Sell" width={760} titleClass="grad-gold">
      <div className="mb-4 flex justify-end">
        <Wallet />
      </div>
      <div className="grid grid-cols-2 gap-5">
        <div className="flex flex-col items-center gap-3 rounded-xl bg-black/30 p-5">
          <OreIcon type="ruby" size={90} />
          <St className="text-3xl">Ores</St>
          <St className="text-xl opacity-90">
            {profile.ores.length} ore{profile.ores.length === 1 ? '' : 's'}
          </St>
          <Price amount={oreValue} className="text-3xl" />
          <Btn variant="gold" sound="coin" className="w-full text-3xl" disabled={!profile.ores.length} onClick={() => send('sell', { what: 'ores' })}>
            Sell All
          </Btn>
        </div>
        <div className="flex flex-col items-center gap-3 rounded-xl bg-black/30 p-5">
          <ItemIcon item={{ id: 'iron_blade', kind: 'weapon' }} size={90} />
          <St className="text-3xl">Items</St>
          <div className="flex flex-wrap justify-center gap-1">
            {RARITIES.slice(0, 5).map((r) => (
              <button
                key={r.id}
                type="button"
                className={`tab text-sm ${maxRarity === r.id ? 'active' : ''}`}
                onClick={() => setMaxRarity(r.id)}
              >
                {r.id}
              </button>
            ))}
          </div>
          <St className="st-thin text-center text-base opacity-90">
            Sells {sellable.length} unlocked item{sellable.length === 1 ? '' : 's'} up to {maxRarity}. Equipped & locked items are kept.
          </St>
          <Price amount={itemValue} className="text-3xl" />
          <Btn
            variant="gold"
            sound="coin"
            className="w-full text-3xl"
            disabled={!sellable.length}
            onClick={() => send('sell', { what: 'items', maxRarity })}
          >
            Sell
          </Btn>
        </div>
      </div>
    </Panel>
  )
}
