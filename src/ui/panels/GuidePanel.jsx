import { useState } from 'react'

import { sfx } from '../../audio/sound'
import { DUMMIES, formatNum, HUB, STAGES } from '../../shared/gameData'
import { Panel, St } from '../common'
import { IS_TOUCH } from '../device'
import { HOTKEYS } from '../hotkeys'
import {
  BackpackIcon,
  BookIcon,
  CartIcon,
  CoinIcon,
  DiceIcon,
  GiftIcon,
  HeartIcon,
  OreIcon,
  RebirthIcon,
  ScrollIcon,
  SkillIcon,
  SwordIcon,
  TargetIcon,
  WingsIcon,
} from '../Icons'
import { ACTION_KEYS } from '../quickActions'

/** A keyboard key cap. */
function Key({ children }) {
  return <span className="keycap">{children}</span>
}

/** One card: an icon, a heading and a few lines. */
function Card({ icon, title, color = '#ffd23b', children }) {
  return (
    <div className="guide-card">
      <div className="guide-card-icon">{icon}</div>
      <div className="min-w-0 flex-1">
        <St className="text-2xl" style={{ color }}>
          {title}
        </St>
        <div className="guide-text">{children}</div>
      </div>
    </div>
  )
}

/** The game in five steps, round and round. */
function Loop() {
  const steps = [
    [<SwordIcon key="s" size={40} color="#fff" />, 'Fight', '#ff5a4e'],
    [<OreIcon key="o" type="ruby" size={40} />, 'Loot', '#3fdc3f'],
    [<CartIcon key="c" size={40} />, 'Forge', '#ffb000'],
    [<RebirthIcon key="r" size={40} />, 'Grow', '#b456ff'],
    [<WingsIcon key="w" size={52} />, 'Go deeper', '#35a0ff'],
  ]
  return (
    <div className="guide-loop">
      {steps.map(([icon, label, color], i) => (
        <div key={label} className="flex items-center">
          <div className="guide-step" style={{ borderColor: color, boxShadow: `0 0 18px ${color}66` }}>
            {icon}
            <St className="text-lg">{label}</St>
          </div>
          {i < steps.length - 1 && <span className="guide-arrow">➜</span>}
        </div>
      ))}
    </div>
  )
}

function Start() {
  return (
    <>
      <St className="block text-center text-3xl">Welcome, warrior!</St>
      <p className="guide-lead">
        Fight your way through <b>{STAGES.length} dungeon stages</b>, loot the ores they guard, and forge them into ever stronger weapons and armor.
      </p>
      <Loop />
      <Card icon={<SwordIcon size={46} color="#fff" />} title="1. Enter the dungeon" color="#ff6a5e">
        Walk through the big <b>Dungeon</b> gate at the north end of the lobby. Each stage's monsters appear the moment you pass its barrier.
      </Card>
      <Card icon={<OreIcon type="copper" size={46} />} title="2. Clear it, then mine" color="#3fdc3f">
        Defeat <b>every</b> enemy: the red barrier ahead turns blue and the ore nodes unlock. Mine them and grab the loot they drop.
      </Card>
      <Card icon={<CartIcon size={46} />} title="3. Forge at home" color="#ffb000">
        Head home (<Key>{ACTION_KEYS.home}</Key>) and bring your ores to the <b>Forge</b>. More and rarer ores forge rarer gear.
      </Card>
      <Card icon={<RebirthIcon size={46} />} title="4. Get stronger, go deeper" color="#d68aff">
        Every swing trains your <b>Damage</b>. Stronger gear, levels and rebirths open the deeper stages.
      </Card>
    </>
  )
}

function Controls() {
  const pc = [
    [['W', 'S'], 'Walk forward / back'],
    [['A', 'D'], 'Turn the view'],
    [['Shift'], 'Sprint'],
    [['Space'], 'Jump'],
    [['Click', 'F'], 'Attack (click fast for a combo)'],
    [['Q'], 'Weapon skill: leap and strike'],
    [['E'], 'Use / pick up loot'],
    [[ACTION_KEYS.autoFight], 'Auto Fight on/off'],
    [[ACTION_KEYS.home], 'Go home'],
    [['Right-drag'], 'Rotate the camera'],
    [['Scroll'], 'Zoom'],
    [[HOTKEYS.backpack, HOTKEYS.shop, HOTKEYS.index], 'Backpack / Shop / Index'],
    [[HOTKEYS.guide], 'This guide'],
  ]
  const touch = [
    ['Left thumb', 'Drag anywhere on the left side: a joystick appears. Push all the way to run.'],
    ['Swipe', 'Drag anywhere else to turn the view. Pinch with two fingers to zoom.'],
    ['Sword button', 'Tap to attack, hold to keep swinging.'],
    ['Skill button', 'Your weapon skill: leap at the nearest enemy.'],
    ['Arrow button', 'Jump.'],
    ['Tap the screen', 'Also attacks, and the prompt button picks up loot.'],
  ]
  return (
    <>
      {IS_TOUCH && (
        <Card icon={<TargetIcon size={46} />} title="Touch controls" color="#8fe0ff">
          <div className="mt-1 flex flex-col gap-1">
            {touch.map(([k, v]) => (
              <div key={k}>
                <b>{k}:</b> {v}
              </div>
            ))}
          </div>
        </Card>
      )}
      <Card icon={<ScrollIcon size={46} />} title="Keyboard & mouse" color="#ffd23b">
        <div className="guide-keys">
          {pc.map(([keys, what]) => (
            <div key={what} className="guide-key-row">
              <span className="flex flex-wrap gap-1">
                {keys.map((k) => (
                  <Key key={k}>{k}</Key>
                ))}
              </span>
              <span>{what}</span>
            </div>
          ))}
        </div>
      </Card>
      {!IS_TOUCH && (
        <Card icon={<TargetIcon size={46} />} title="On a phone or tablet?" color="#8fe0ff">
          The game plays on touch screens too: a thumbstick on the left, attack, skill and jump buttons on the right. Turn your phone sideways.
        </Card>
      )}
    </>
  )
}

function Combat() {
  return (
    <>
      <Card icon={<SwordIcon size={46} color="#fff" />} title="Combo attacks" color="#ff6a5e">
        Click (or <Key>F</Key>) quickly to chain a <b>5-hit combo</b>: chop, sweep, uppercut, thrust, and a spinning slash to finish.
      </Card>
      <Card icon={<SkillIcon skill="whirlwind" size={46} />} title="Weapon skill" color="#b456ff">
        <Key>Q</Key> leaps you at the nearest enemy and slams down with your weapon's skill: Dash (Katana), Whirlwind (Sword), Earthsplitter (Axe) or Flurry (Dagger). Rarer weapons have stronger skills.
      </Card>
      <Card icon={<HeartIcon size={46} />} title="Read the enemy" color="#ff5a5a">
        Enemies <b>wind up</b> their blows: when one raises its weapon, step away and it misses. Archers aim where you're <b>heading</b>, so change direction to dodge their shots. Packs spread out to surround you: keep moving.
      </Card>
      <Card icon={<TargetIcon size={46} />} title="Auto Fight" color="#6dff4a">
        Press <Key>{ACTION_KEYS.autoFight}</Key> and your hero hunts the stage's enemies, picks up loot and mines the ores by itself.
      </Card>
      <Card icon={<HeartIcon size={46} />} title="Health" color="#ff6a5e">
        Health comes from <b>armor</b> (forge it!), the Vitality upgrade and Tough Skin. Out of a fight you heal on your own. If you fall, you wake up in the lobby.
      </Card>
    </>
  )
}

function Dungeon() {
  const first = STAGES[0]
  const last = STAGES[STAGES.length - 1]
  return (
    <>
      <Card icon={<WingsIcon size={56} />} title={`${STAGES.length} stages, one long road north`} color="#35a0ff">
        From <b>{first.name}</b> to <b>{last.name}</b>. Each stage needs more <b>Damage</b> (and later, rebirths) to enter: the barrier tells you what it asks for.
      </Card>
      <Card icon={<SwordIcon size={46} color="#ff5a4e" />} title="Barriers" color="#ff6a5e">
        A stage's enemies <b>appear when you walk in through its barrier</b>, not before: the stage ahead is empty while you fight this one. <b>Red</b> barrier: clear this stage first. <b>Blue</b>: walk on through.
      </Card>
      <Card icon={<RebirthIcon size={46} />} title="Home resets the dungeon" color="#d68aff">
        Going back to the lobby (walking out, <Key>{ACTION_KEYS.home}</Key>, or falling in battle) <b>resets every stage</b>: loot left on the ground is gone and the enemies are back next time. Pick up everything before you leave!
      </Card>
      <Card icon={<OreIcon type="aetherite" size={46} />} title="Event ores" color="#2cf2ff">
        Now and then a rare ore appears in a random stage for everyone to mine together. Watch for the announcement!
      </Card>
      <Card icon={<GiftIcon size={46} />} title="Frostbound Tower" color="#8fe0ff">
        With {HUB.tower.rebirths} rebirths, the tower on the lobby's east side takes you straight to Stage {HUB.tower.stage}.
      </Card>
    </>
  )
}

function LootForge() {
  return (
    <>
      <Card icon={<OreIcon type="gold" size={46} />} title="Loot" color="#ffd23b">
        Defeated enemies and mined ores drop loot on the ground. Walk up and press <Key>E</Key> (or tap the prompt) to put it in your backpack. Elites and bosses drop more, and rarer.
      </Card>
      <Card icon={<BackpackIcon size={46} />} title="Your backpack" color="#ffb000">
        It only holds so many ores. Buy bigger bags in the Shop and upgrade them, or add slots with the Backpack Size upgrade.
      </Card>
      <Card icon={<CartIcon size={46} />} title="The Forge" color="#ff9a3b">
        Put in 1 to 4 ores and pick Sword, Axe or Auto. More ores and rarer ores give better odds of a rare weapon or armor. Equip the best in your Backpack.
      </Card>
      <Card icon={<CoinIcon size={46} />} title="Coins" color="#ffd23b">
        Sell ores and spare gear at the market's <b>Sell</b> stall. Spend coins on upgrades, enchants, races, extra skills and bags.
      </Card>
      <Card icon={<BookIcon size={46} />} title="Index" color="#ff6a5e">
        Every weapon and armor you've found is kept in the Index (<Key>{HOTKEYS.index}</Key>).
      </Card>
    </>
  )
}

function Stronger() {
  const top = DUMMIES[DUMMIES.length - 1]
  return (
    <>
      <Card icon={<TargetIcon size={46} />} title="Training pads" color="#6dff4a">
        Stand on a pad on the lobby's west side and you train by yourself. Better pads multiply your training (up to x{formatNum(top.mult)}) but need rebirths.
      </Card>
      <Card icon={<RebirthIcon size={46} />} title="Levels & rebirth" color="#d68aff">
        Training fills your level bar, and every level adds damage. At the rebirth level, <b>Rebirth</b> resets your training for a permanent power multiplier, a bigger gift and deeper stages.
      </Card>
      <Card icon={<DiceIcon size={46} />} title="Enchant, Races, Extra Skill" color="#ffb000">
        Roll an enchant onto your weapon, a race for a damage bonus (Races, top of the screen), and an extra skill like Critical Eye or Vampiric.
      </Card>
      <Card icon={<HeartIcon size={46} />} title="Upgrades" color="#ff6a5e">
        At the Upgrade stall: Vitality for more health and Backpack Size for more ore slots.
      </Card>
      <Card icon={<GiftIcon size={46} />} title="Free gift & quests" color="#ffd23b">
        Claim a free coin gift every few hours, and finish quests for coins and gems.
      </Card>
    </>
  )
}

function Tips() {
  const tips = [
    'Clear a whole stage before mining: the ores stay caged until every enemy is down.',
    'Loot left behind when you go home is lost. Pick it all up first!',
    'Sprint (Shift, or push the stick all the way) to get through cleared stages fast.',
    'Forging four rare ores at once gives the best odds of a top-rarity item.',
    'Elite enemies glow gold: tougher, but with far better loot.',
    'Bosses hit hard. Forge armor before you take them on.',
    'Stuck on a stage? Train on a pad, forge better gear, or rebirth.',
    'Hide the HUD with the eye button for a clean view.',
  ]
  return (
    <div className="flex flex-col gap-2">
      {tips.map((t, i) => (
        <div key={t} className="guide-tip">
          <span className="guide-tip-n">{i + 1}</span>
          <span>{t}</span>
        </div>
      ))}
    </div>
  )
}

const SECTIONS = [
  ['start', 'Start', <WingsIcon key="i" size={40} />, Start],
  ['controls', 'Controls', <ScrollIcon key="i" size={32} />, Controls],
  ['combat', 'Combat', <SwordIcon key="i" size={30} color="#fff" />, Combat],
  ['dungeon', 'Dungeon', <OreIcon key="i" type="amethyst" size={32} />, Dungeon],
  ['loot', 'Loot & Forge', <CartIcon key="i" size={32} />, LootForge],
  ['stronger', 'Get Stronger', <RebirthIcon key="i" size={32} />, Stronger],
  ['tips', 'Tips', <BookIcon key="i" size={32} />, Tips],
]

/** How to play: a tabbed, illustrated guide. */
export function GuidePanel() {
  const [tab, setTab] = useState('start')
  const Section = SECTIONS.find((s) => s[0] === tab)[3]
  return (
    <Panel title="Guide" width={980} titleClass="grad-gold">
      <div className="guide">
        <nav className="guide-rail">
          {SECTIONS.map(([id, label, icon]) => (
            <button
              key={id}
              type="button"
              className={`guide-tab ${tab === id ? 'active' : ''}`}
              onClick={() => {
                sfx('click')
                setTab(id)
              }}
            >
              <span className="guide-tab-icon">{icon}</span>
              <St className="text-lg">{label}</St>
            </button>
          ))}
        </nav>
        <section key={tab} className="guide-body fade-in">
          <Section />
        </section>
      </div>
    </Panel>
  )
}

export default GuidePanel
