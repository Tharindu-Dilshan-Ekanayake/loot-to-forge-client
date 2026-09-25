import { useEffect, useState } from 'react'

import { local } from '../../game/bus'
import { send, travel } from '../../net/network'
import { useGame } from '../../net/store'
import {
  formatNum,
  giftCoins,
  HUB,
  ONLINE_REWARD_MS,
  RARITIES,
  SKILLS,
  stageLock,
  STAGES,
  WEAPON_CLASSES,
} from '../../shared/gameData'
import { Btn, Panel, St } from '../common'
import { CoinIcon, GiftIcon, LockIcon, SkillIcon, SwordIcon } from '../Icons'
import { onlineProgress } from '../quickActions'
import { BackpackPanel, IndexPanel, SellPanel } from './InventoryPanels'
import { EnchantPanel, ExtraSkillPanel, RacesPanel } from './RollPanels'
import { QuestsPanel, RebirthPanel, ShopPanel, UpgradePanel } from './ShopPanels'
import { ForgePanel } from './ForgePanel'

function Slider({ label, value, onChange }) {
  return (
    <label className="flex items-center gap-4">
      <St className="w-40 text-2xl">{label}</St>
      <input type="range" min="0" max="1" step="0.05" value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-3 flex-1 accent-[#ffb000]" />
      <St className="w-14 text-right text-xl">{Math.round(value * 100)}</St>
    </label>
  )
}

function Toggle({ label, value, onChange }) {
  return (
    <div className="flex items-center gap-4">
      <St className="w-40 text-2xl">{label}</St>
      <Btn variant={value ? 'green' : 'red'} className="w-28 text-xl" onClick={() => onChange(!value)}>
        {value ? 'ON' : 'OFF'}
      </Btn>
    </div>
  )
}

export function SettingsPanel() {
  const settings = useGame((s) => s.settings)
  const setSetting = useGame((s) => s.setSetting)
  const keys = [
    ['WASD', 'Move'],
    ['Space', 'Jump'],
    ['Shift', 'Sprint'],
    ['Click / F', 'Attack'],
    ['Q', 'Weapon skill'],
    ['E', 'Interact'],
    ['Right-drag', 'Rotate camera'],
    ['Scroll', 'Zoom'],
    ['B / G / M', 'Backpack / Index / Shop'],
  ]
  return (
    <Panel title="Settings" width={760}>
      <div className="flex flex-col gap-4">
        <Slider label="Sounds" value={settings.sfx} onChange={(v) => setSetting('sfx', v)} />
        <Toggle label="Shadows" value={settings.shadows} onChange={(v) => setSetting('shadows', v)} />
        <Toggle label="Names" value={settings.names} onChange={(v) => setSetting('names', v)} />
        <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 rounded-xl bg-black/30 p-3">
          {keys.map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <St className="text-lg" style={{ color: '#ffd23b' }}>
                {k}
              </St>
              <St className="st-thin text-lg">{v}</St>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  )
}

export function TeleportPanel() {
  const profile = useGame((s) => s.profile)
  const close = useGame((s) => s.closePanel)
  if (!profile) return null
  const go = (fn) => {
    close()
    fn()
  }
  const hubSpots = [
    ['Spawn', HUB.spawn],
    ['Forge', [HUB.stations.forge.pos[0], 1, HUB.stations.forge.pos[2] - 9]],
    ['Market', [(HUB.stations.upgrade.pos[0] + HUB.stations.enchant.pos[0]) / 2, 1, HUB.stations.sell.pos[2] + 7]],
    ['Train', [-25, 1, 0]],
    ['Leaderboards', [HUB.boards.pos[0], 1, HUB.boards.pos[2] + 11]],
    ['Dungeon Gate', [HUB.portal.pos[0], 1, HUB.portal.pos[2] + 8]],
  ]
  return (
    <Panel title="Teleport" width={760}>
      <St className="mb-2 block text-2xl">Lobby</St>
      <div className="mb-4 grid grid-cols-3 gap-3">
        {hubSpots.map(([name, pos]) => (
          <Btn
            key={name}
            variant="blue"
            className="text-2xl"
            onClick={() =>
              go(() => {
                if (useGame.getState().stage) travel(0)
                local.teleport?.(pos, Math.PI)
              })
            }
          >
            {name}
          </Btn>
        ))}
      </div>
      <div className="mb-2 flex items-baseline justify-between">
        <St className="text-2xl">Dungeon</St>
        <St className="st-thin text-base opacity-90">Reach a stage on foot to unlock its teleport</St>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {STAGES.map((s) => {
          const lock = stageLock(s.id, profile)
          // The Frostbound Tower counts as reaching its stage.
          const reached = s.id <= (profile.maxStage || 1) || (s.id === HUB.tower.stage && profile.rebirths >= HUB.tower.rebirths)
          const locked = Boolean(lock) || !reached
          return (
            <Btn
              key={s.id}
              variant={locked ? 'gray' : 'gold'}
              disabled={locked}
              title={lock ? lock.text : reached ? s.name : 'Not reached yet'}
              className="flex flex-col items-center py-2 text-xl"
              onClick={() => go(() => travel(s.id))}
            >
              <span className="flex items-center gap-2">
                {locked && <LockIcon size={22} />}Stage {s.id}
              </span>
              <span className="flex items-center gap-1 text-base">
                <SwordIcon size={18} />
                {formatNum(s.requiredDamage || s.recommend)}
              </span>
            </Btn>
          )
        })}
      </div>
    </Panel>
  )
}

export function SkillsPanel() {
  return (
    <Panel title="Skill Index" width={820} titleClass="grad-gold">
      <div className="grid grid-cols-2 gap-4">
        {Object.entries(WEAPON_CLASSES).map(([cls, c]) => {
          const s = SKILLS[c.skill]
          return (
            <div key={cls} className="flex gap-3 rounded-xl bg-black/30 p-3">
              <SkillIcon skill={c.skill} size={70} />
              <div className="flex-1">
                <St className="text-2xl">{s.name}</St>
                <St className="st-thin block text-base opacity-90">
                  {cls} · CD {s.cooldown}s
                </St>
                <St className="st-thin block text-base">{s.describe(s.base)}</St>
                <div className="mt-1 flex flex-wrap gap-1">
                  {RARITIES.map((r, g) => (
                    <span key={r.id} className="rounded px-1.5" style={{ background: `${r.color}44` }}>
                      <St className="st-thin text-xs" style={{ color: r.color }}>
                        {r.grade} {s.base + s.perGrade * g}%
                      </St>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <St className="st-thin mt-3 block text-center text-base opacity-80">Rarer weapons carry a higher skill grade — and a stronger skill.</St>
    </Panel>
  )
}

/** The free gift: coins every 3 hours. */
export function GiftPanel() {
  const profile = useGame((s) => s.profile)
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 500)
    return () => clearInterval(id)
  }, [])
  if (!profile) return null
  const progress = onlineProgress(profile)
  const ready = progress >= ONLINE_REWARD_MS
  const left = Math.ceil((ONLINE_REWARD_MS - progress) / 1000)
  const two = (n) => String(n).padStart(2, '0')
  const mmss = `${Math.floor(left / 3600)}:${two(Math.floor(left / 60) % 60)}:${two(left % 60)}`
  return (
    <Panel title="Free Gift" width={560} titleClass="grad-gold">
      <div className="flex flex-col items-center gap-3">
        <div className={ready ? 'bob' : ''}>
          <GiftIcon size={150} />
        </div>
        <div className="flex items-center gap-2">
          <CoinIcon size={44} />
          <St className="text-4xl" style={{ color: '#ffd23b' }}>
            +{formatNum(giftCoins(profile.rebirths))}
          </St>
        </div>
        <div className="h-5 w-full overflow-hidden rounded-full border-[3px] border-[#151522] bg-[#2a2c3a]">
          <div className="h-full bg-gradient-to-r from-[#ffe24a] to-[#ff9a00]" style={{ width: `${(progress / ONLINE_REWARD_MS) * 100}%` }} />
        </div>
        <Btn variant={ready ? 'green' : 'gray'} sound="reward" className="w-64 text-3xl" disabled={!ready} onClick={() => send('claimOnline')}>
          {ready ? 'Claim!' : mmss}
        </Btn>
        <St className="st-thin text-center text-base opacity-85">A new gift every {ONLINE_REWARD_MS / 3600000} hours. Rebirths make it bigger.</St>
      </div>
    </Panel>
  )
}

const PANELS = {
  shop: ShopPanel,
  backpack: BackpackPanel,
  index: IndexPanel,
  rebirth: RebirthPanel,
  forge: ForgePanel,
  sell: SellPanel,
  upgrade: UpgradePanel,
  enchant: EnchantPanel,
  races: RacesPanel,
  extraSkill: ExtraSkillPanel,
  quests: QuestsPanel,
  settings: SettingsPanel,
  teleport: TeleportPanel,
  gift: GiftPanel,
  skills: SkillsPanel,
}

export function PanelHost() {
  const panel = useGame((s) => s.panel)
  const forging = useGame((s) => s.forging)
  if (!panel || forging) return null
  const Comp = PANELS[panel]
  return Comp ? <Comp /> : null
}
