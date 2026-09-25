import { useId } from 'react'

import { ARMORS, ORES, WEAPONS } from '../shared/gameData'

/**
 * Hand-drawn SVG icons in the chunky, outlined style of the reference game.
 * Every icon uses a dark outline (#151522) so it reads on any background.
 */

const O = '#151522'

function Svg({ size = 48, children, vb = '0 0 64 64', ...rest }) {
  return (
    <svg width={size} height={size} viewBox={vb} {...rest}>
      {children}
    </svg>
  )
}

export function CartIcon({ size }) {
  const id = useId()
  return (
    <Svg size={size}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff6a5e" />
          <stop offset="1" stopColor="#d61f1f" />
        </linearGradient>
      </defs>
      <path d="M6 12h8l6 28h30l6-20H18" fill="none" stroke={O} strokeWidth="7" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M16 20h40l-6 20H20z" fill={`url(#${id})`} stroke={O} strokeWidth="4" strokeLinejoin="round" />
      <path d="M24 24v12M32 24v12M40 24v12M48 24l-2 12" stroke="#ffb3ad" strokeWidth="2.5" />
      <path d="M6 12h8l6 28h30" fill="none" stroke="#ffd0cb" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="24" cy="50" r="5" fill="#ffd23b" stroke={O} strokeWidth="3.5" />
      <circle cx="46" cy="50" r="5" fill="#ffd23b" stroke={O} strokeWidth="3.5" />
    </Svg>
  )
}

export function BackpackIcon({ size }) {
  return (
    <Svg size={size}>
      <path d="M22 14c0-6 20-6 20 0v4H22z" fill="#b8702e" stroke={O} strokeWidth="4" />
      <rect x="10" y="16" width="44" height="42" rx="12" fill="#e08a3c" stroke={O} strokeWidth="4.5" />
      <rect x="18" y="34" width="28" height="18" rx="5" fill="#c46f28" stroke={O} strokeWidth="3.5" />
      <rect x="28" y="30" width="8" height="8" rx="2" fill="#ffd23b" stroke={O} strokeWidth="3" />
      <path d="M16 22c4-3 28-3 32 0" stroke="#ffc07a" strokeWidth="3" fill="none" strokeLinecap="round" />
    </Svg>
  )
}

export function BookIcon({ size }) {
  return (
    <Svg size={size}>
      <rect x="10" y="8" width="42" height="50" rx="5" fill="#e0303c" stroke={O} strokeWidth="4.5" />
      <rect x="14" y="48" width="40" height="8" rx="2" fill="#fff4e0" stroke={O} strokeWidth="3" />
      <path d="M31 18l3.5 7 7.5 1-5.5 5 1.5 7.5L31 35l-7 3.5 1.5-7.5-5.5-5 7.5-1z" fill="#ffd23b" stroke={O} strokeWidth="3" strokeLinejoin="round" />
      <path d="M15 12v34" stroke="#ff7a84" strokeWidth="3" />
    </Svg>
  )
}

/** Rebirth: a pink "poké ball" badge with a blue refresh swirl at its core. */
export function RebirthIcon({ size }) {
  const id = useId()
  return (
    <Svg size={size}>
      <defs>
        <linearGradient id={`${id}top`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff9ae0" />
          <stop offset="1" stopColor="#ff2f9e" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="26" fill="#fdfdfd" stroke={O} strokeWidth="4" />
      <path d="M6.3 32a25.7 25.7 0 0 1 51.4 0z" fill={`url(#${id}top)`} stroke={O} strokeWidth="4" strokeLinejoin="round" />
      <rect x="5" y="29" width="54" height="6.5" fill={O} />
      <circle cx="32" cy="32" r="12" fill="#fdfdfd" stroke={O} strokeWidth="4.5" />
      {/* Refresh swirl inside the core. */}
      <path d="M22.5 28.5a10.5 10.5 0 0 1 17.5-4" stroke="#2fb4ff" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M41.5 35.5a10.5 10.5 0 0 1-17.5 4" stroke="#2fb4ff" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M41 19.5l3.6 7.6-7.8-1z" fill="#2fb4ff" stroke={O} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M23 44.5l-3.6-7.6 7.8 1z" fill="#2fb4ff" stroke={O} strokeWidth="2.5" strokeLinejoin="round" />
    </Svg>
  )
}

export function CoinIcon({ size = 40 }) {
  const id = useId()
  return (
    <Svg size={size}>
      <defs>
        <radialGradient id={id} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#fff6a0" />
          <stop offset="0.5" stopColor="#ffc21a" />
          <stop offset="1" stopColor="#d98a00" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="26" fill={`url(#${id})`} stroke={O} strokeWidth="4.5" />
      <circle cx="32" cy="32" r="18" fill="none" stroke="#b86a00" strokeWidth="3" />
      <path d="M32 18v28M26 22h9a5 5 0 0 1 0 10h-6a5 5 0 0 0 0 10h9" stroke="#8a4a00" strokeWidth="4" fill="none" strokeLinecap="round" />
    </Svg>
  )
}

export function GemIcon({ size = 40 }) {
  return (
    <Svg size={size}>
      <path d="M32 6l22 13v26L32 58 10 45V19z" fill="#2ce6c8" stroke={O} strokeWidth="4.5" strokeLinejoin="round" />
      <path d="M32 16l13 8v16l-13 8-13-8V24z" fill="#0a8a8a" stroke={O} strokeWidth="3" strokeLinejoin="round" />
      <path d="M32 16v8l13 0M32 24l-13 0" stroke="#7ff6e6" strokeWidth="2" />
    </Svg>
  )
}

export function HeartIcon({ size = 40 }) {
  return (
    <Svg size={size}>
      <path d="M32 56S6 40 6 22a13 13 0 0 1 26-5 13 13 0 0 1 26 5c0 18-26 34-26 34z" fill="#ff2d3d" stroke={O} strokeWidth="4.5" strokeLinejoin="round" />
      <path d="M14 20a7 7 0 0 1 9-5" stroke="#ffb3b8" strokeWidth="4" fill="none" strokeLinecap="round" />
    </Svg>
  )
}

export function GiftIcon({ size = 64 }) {
  return (
    <Svg size={size}>
      <rect x="8" y="26" width="48" height="32" rx="4" fill="#ff3b3b" stroke={O} strokeWidth="4.5" />
      <rect x="4" y="18" width="56" height="12" rx="3" fill="#ff5a4e" stroke={O} strokeWidth="4.5" />
      <rect x="27" y="18" width="10" height="40" fill="#ffd23b" stroke={O} strokeWidth="3.5" />
      <path d="M32 18c-4-10-16-12-16-4 0 4 8 4 16 4zM32 18c4-10 16-12 16-4 0 4-8 4-16 4z" fill="#ffd23b" stroke={O} strokeWidth="3.5" strokeLinejoin="round" />
    </Svg>
  )
}

export function TargetIcon({ size = 42 }) {
  return (
    <Svg size={size}>
      <circle cx="32" cy="32" r="18" fill="none" stroke="#fff" strokeWidth="5" />
      <circle cx="32" cy="32" r="6" fill="#fff" />
      <path d="M32 4v14M32 46v14M4 32h14M46 32h14" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
    </Svg>
  )
}

export function ScrollIcon({ size = 42 }) {
  return (
    <Svg size={size}>
      <rect x="14" y="10" width="34" height="44" rx="4" fill="#fff" stroke="#fff" strokeWidth="2" opacity="0.95" />
      <path d="M20 22h22M20 30h22M20 38h14" stroke="#3a3d45" strokeWidth="4" strokeLinecap="round" />
      <circle cx="46" cy="46" r="10" fill="#3a3d45" stroke="#fff" strokeWidth="3" />
      <path d="M42 46l3 3 5-6" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" />
    </Svg>
  )
}

export function GearIcon({ size = 42 }) {
  const teeth = Array.from({ length: 8 }, (_, i) => i * 45)
  return (
    <Svg size={size}>
      {teeth.map((a) => (
        <rect key={a} x="27" y="4" width="10" height="14" rx="2" fill="#fff" transform={`rotate(${a} 32 32)`} />
      ))}
      <circle cx="32" cy="32" r="18" fill="#fff" />
      <circle cx="32" cy="32" r="8" fill="#3a3d45" />
    </Svg>
  )
}

export function EyeIcon({ size = 42, off = false }) {
  return (
    <Svg size={size}>
      <path d="M4 32s10-18 28-18 28 18 28 18-10 18-28 18S4 32 4 32z" fill="#fff" />
      <circle cx="32" cy="32" r="10" fill="#3a3d45" />
      <circle cx="35" cy="29" r="3" fill="#fff" />
      {off && <path d="M10 54L54 10" stroke="#ff3b3b" strokeWidth="6" strokeLinecap="round" />}
    </Svg>
  )
}

export function DiceIcon({ size = 56 }) {
  return (
    <Svg size={size}>
      <path d="M32 6l24 12v26L32 58 8 44V18z" fill="#5fb8ff" stroke={O} strokeWidth="4" strokeLinejoin="round" />
      <path d="M8 18l24 12 24-12M32 30v28" stroke={O} strokeWidth="3.5" fill="none" />
      <path d="M8 18l24 12v28L8 44z" fill="#ff5fd0" stroke={O} strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M32 30l24-12v26L32 58z" fill="#ffd23b" stroke={O} strokeWidth="3.5" strokeLinejoin="round" />
      <circle cx="32" cy="18" r="3.5" fill="#fff" />
      <circle cx="18" cy="34" r="3" fill="#fff" />
      <circle cx="22" cy="44" r="3" fill="#fff" />
      <circle cx="40" cy="38" r="3" fill="#fff" />
      <circle cx="48" cy="34" r="3" fill="#fff" />
      <circle cx="44" cy="46" r="3" fill="#fff" />
    </Svg>
  )
}

export function CursorIcon({ size = 30 }) {
  return (
    <Svg size={size}>
      <path d="M14 6l34 26-15 3 9 17-8 4-9-17-11 10z" fill="#fff" stroke={O} strokeWidth="4" strokeLinejoin="round" />
    </Svg>
  )
}

export function HandIcon({ size = 70 }) {
  return (
    <Svg size={size}>
      <path
        d="M20 30V10a5 5 0 0 1 10 0v16l2-1a5 5 0 0 1 8 2 5 5 0 0 1 8 2 5 5 0 0 1 8 3v12c0 9-7 16-16 16h-6c-6 0-10-3-13-8L10 40a5 5 0 0 1 8-6z"
        fill="#fff"
        stroke={O}
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path d="M32 26v10M40 29v8M48 32v6" stroke="#b8bcc6" strokeWidth="3" strokeLinecap="round" />
    </Svg>
  )
}

export function WingsIcon({ size = 110 }) {
  const id = useId()
  return (
    <Svg size={size} vb="0 0 120 90">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff6a0" />
          <stop offset="0.6" stopColor="#ffc21a" />
          <stop offset="1" stopColor="#d98a00" />
        </linearGradient>
      </defs>
      <path d="M60 50C44 44 22 40 10 18c14 4 22 2 30 10-8-10-6-18-2-26 8 12 16 20 22 34z" fill={`url(#${id})`} stroke={O} strokeWidth="4" strokeLinejoin="round" />
      <path d="M60 50c16-6 38-10 50-32-14 4-22 2-30 10 8-10 6-18 2-26-8 12-16 20-22 34z" fill={`url(#${id})`} stroke={O} strokeWidth="4" strokeLinejoin="round" />
      <path d="M60 22l7 14 15 2-11 10 3 15-14-7-14 7 3-15-11-10 15-2z" fill="#fff6c0" stroke={O} strokeWidth="4" strokeLinejoin="round" />
    </Svg>
  )
}

export function LockIcon({ size = 28 }) {
  return (
    <Svg size={size}>
      <path d="M20 28v-8a12 12 0 0 1 24 0v8" stroke={O} strokeWidth="9" fill="none" />
      <path d="M20 28v-8a12 12 0 0 1 24 0v8" stroke="#c9ccd4" strokeWidth="4" fill="none" />
      <rect x="12" y="28" width="40" height="30" rx="6" fill="#ffd23b" stroke={O} strokeWidth="4" />
      <circle cx="32" cy="42" r="4" fill={O} />
    </Svg>
  )
}

export function XIcon({ size = 36 }) {
  return (
    <Svg size={size}>
      <path d="M14 14l36 36M50 14L14 50" stroke={O} strokeWidth="14" strokeLinecap="round" />
      <path d="M14 14l36 36M50 14L14 50" stroke="#fff" strokeWidth="7" strokeLinecap="round" />
    </Svg>
  )
}

export function SwordIcon({ size = 28, color = '#8fd0ff' }) {
  return (
    <Svg size={size}>
      <path d="M50 6L22 34l8 8L58 14z" fill={color} stroke={O} strokeWidth="4" strokeLinejoin="round" />
      <path d="M16 36l12 12M10 54l10-10" stroke={O} strokeWidth="8" strokeLinecap="round" />
      <path d="M16 36l12 12M10 54l10-10" stroke="#ffd23b" strokeWidth="4" strokeLinecap="round" />
    </Svg>
  )
}

export function ChatIcon({ size = 30 }) {
  return (
    <Svg size={size}>
      <path d="M8 12h48v30H26l-12 10V42H8z" fill="#fff" stroke={O} strokeWidth="3" strokeLinejoin="round" />
      <path d="M18 24h28M18 32h18" stroke="#3a3d45" strokeWidth="4" strokeLinecap="round" />
    </Svg>
  )
}

export function UsersIcon({ size = 30 }) {
  return (
    <Svg size={size}>
      <circle cx="24" cy="22" r="9" fill="#fff" />
      <path d="M8 52c0-10 7-16 16-16s16 6 16 16z" fill="#fff" />
      <circle cx="44" cy="24" r="7" fill="#c9ccd4" />
      <path d="M40 52c0-8-2-12-4-14 2-1 5-2 8-2 7 0 12 5 12 16z" fill="#c9ccd4" />
    </Svg>
  )
}

/* ---------------------------------------------------------------------------
 * Skills
 * ------------------------------------------------------------------------- */

export function SkillIcon({ skill = 'dash', size = 64 }) {
  const id = useId()
  const colors = { dash: ['#fff36a', '#ff9a00'], whirlwind: ['#9ff6ff', '#2f9bff'], earthsplitter: ['#ffd08a', '#c9701f'], flurry: ['#ffb3ff', '#c026ff'] }[skill] || ['#fff', '#aaa']
  return (
    <Svg size={size}>
      <defs>
        <radialGradient id={id}>
          <stop offset="0" stopColor={colors[0]} />
          <stop offset="1" stopColor={colors[1]} />
        </radialGradient>
      </defs>
      {skill === 'dash' && (
        <>
          <path d="M8 44c14-2 26-12 34-26" stroke={colors[1]} strokeWidth="8" fill="none" strokeLinecap="round" opacity="0.6" />
          <path d="M18 50L50 14l4 4-30 38z" fill={`url(#${id})`} stroke={O} strokeWidth="3.5" strokeLinejoin="round" />
          <path d="M10 30l8 4M14 20l8 6M24 12l6 8" stroke={colors[0]} strokeWidth="4" strokeLinecap="round" />
        </>
      )}
      {skill === 'whirlwind' && (
        <>
          <path d="M32 10a22 22 0 1 1-20 13" stroke={`url(#${id})`} strokeWidth="8" fill="none" strokeLinecap="round" />
          <path d="M32 22a10 10 0 1 1-9 6" stroke={colors[0]} strokeWidth="6" fill="none" strokeLinecap="round" />
          <path d="M10 18l2 10 9-4z" fill={colors[1]} stroke={O} strokeWidth="2.5" />
        </>
      )}
      {skill === 'earthsplitter' && (
        <>
          <path d="M6 48h52" stroke={O} strokeWidth="6" strokeLinecap="round" />
          <path d="M32 48l-6 10M32 48l8 10M32 48l-14 4M32 48l16 5" stroke={colors[1]} strokeWidth="4" strokeLinecap="round" />
          <rect x="22" y="12" width="20" height="16" rx="3" fill={`url(#${id})`} stroke={O} strokeWidth="3.5" />
          <path d="M32 28v16" stroke={O} strokeWidth="6" strokeLinecap="round" />
        </>
      )}
      {skill === 'flurry' && (
        <>
          {[0, 12, 24].map((o) => (
            <path key={o} d={`M${10 + o} 54L${30 + o} 10`} stroke={`url(#${id})`} strokeWidth="6" strokeLinecap="round" />
          ))}
        </>
      )}
    </Svg>
  )
}

/* ---------------------------------------------------------------------------
 * Items
 * ------------------------------------------------------------------------- */

/** Weapon silhouette per class, in a 64×64 box, pointing to the top-right. */
const WEAPON_PATHS = {
  Katana: {
    // Long, slender, faintly bowed blade with a raked point — a katana, not a dagger.
    blade: 'M21 43C32 32 47 17 59 4c1 3 2 6 2 9C50 24 36 37 25 47z',
    guard: 'M16 41a6.5 6.5 0 1 0 13 7 6.5 6.5 0 1 0-13-7z',
    handle: 'M6 58l15-15 4 4-15 15z',
  },
  Sword: {
    blade: 'M26 34L52 8l6-2-2 6-26 26z',
    guard: 'M16 30l4-4 18 18-4 4z',
    handle: 'M10 54l12-12 4 4-12 12z',
  },
  Axe: {
    blade: 'M34 10c10-2 20 6 20 18-6-6-12-6-16-2l-6-6c2-4 4-8 2-10z',
    guard: 'M30 18l6 6-4 4-6-6z',
    handle: 'M8 54l26-30 4 4-28 30z',
  },
  Dagger: {
    blade: 'M30 32l18-18 6-2-2 6-18 18z',
    guard: 'M22 30l4-4 12 12-4 4z',
    handle: 'M14 50l10-10 4 4-10 10z',
  },
}

export function WeaponIcon({ weaponId, size = 56, silhouette = false }) {
  const def = WEAPONS[weaponId]
  if (!def) return null
  const p = WEAPON_PATHS[def.class]
  const blade = silhouette ? '#0d0d12' : def.blade
  const accent = silhouette ? '#0d0d12' : def.accent
  const handle = silhouette ? '#0d0d12' : '#2a2230'
  return (
    <Svg size={size}>
      {!silhouette && def.glow && <path d={p.blade} fill="none" stroke={def.glow} strokeWidth="9" opacity="0.45" strokeLinejoin="round" />}
      <path d={p.blade} fill={blade} stroke={silhouette ? '#0d0d12' : O} strokeWidth="3" strokeLinejoin="round" />
      {!silhouette && <path d={p.blade} fill="none" stroke="#ffffff" strokeWidth="1.5" opacity="0.45" transform="translate(-1 -1)" />}
      <path d={p.handle} fill={handle} stroke={silhouette ? '#0d0d12' : O} strokeWidth="3" strokeLinejoin="round" />
      <path d={p.guard} fill={accent} stroke={silhouette ? '#0d0d12' : O} strokeWidth="3" strokeLinejoin="round" />
    </Svg>
  )
}

export function ArmorIcon({ armorId, size = 56, silhouette = false }) {
  const def = ARMORS[armorId]
  if (!def) return null
  const c = silhouette ? '#0d0d12' : def.color
  return (
    <Svg size={size}>
      <path d="M18 8l8 4h12l8-4 12 8-6 12-4-2v30H16V26l-4 2-6-12z" fill={c} stroke={silhouette ? '#0d0d12' : O} strokeWidth="4" strokeLinejoin="round" />
      {!silhouette && (
        <>
          <path d="M26 12c0 6 12 6 12 0" stroke={O} strokeWidth="3" fill="none" />
          <path d="M22 30h20M22 40h20" stroke="rgba(0,0,0,0.3)" strokeWidth="3" />
          <path d="M20 22v28" stroke="rgba(255,255,255,0.4)" strokeWidth="3" />
        </>
      )}
    </Svg>
  )
}

export function OreIcon({ type, size = 56 }) {
  const ore = ORES[type]
  if (!ore) return null
  if (type === 'stone') {
    return (
      <Svg size={size}>
        <path d="M10 40l8-20 18-8 16 10 4 20-14 12H22z" fill="#9ea3a8" stroke={O} strokeWidth="4" strokeLinejoin="round" />
        <path d="M18 24l14 6 20-8M32 30l-4 24" stroke="#6b6f76" strokeWidth="3" fill="none" />
        <circle cx="42" cy="36" r="5" fill="#2a2d33" />
        <circle cx="22" cy="40" r="4" fill="#2a2d33" />
        <path d="M18 24l8-6" stroke="#d6d9de" strokeWidth="3" strokeLinecap="round" />
      </Svg>
    )
  }
  return (
    <Svg size={size}>
      <path d="M8 50l10-10 36 2 4 10-26 6z" fill="#55585f" stroke={O} strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M22 46L18 20l10-12 8 14-2 24z" fill={ore.color} stroke={O} strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M34 46l6-26 12-4 2 12-8 18z" fill={ore.color} stroke={O} strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M12 46l0-14 8-4 4 18z" fill={ore.color2} stroke={O} strokeWidth="3" strokeLinejoin="round" />
      <path d="M22 18l6-8M40 22l10-4" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
      <path d="M28 8l8 14-2 24" fill="none" stroke={ore.color2} strokeWidth="3" opacity="0.7" />
    </Svg>
  )
}

export function ItemIcon({ item, size = 56, silhouette }) {
  if (!item) return null
  if (item.kind === 'armor' || ARMORS[item.id]) return <ArmorIcon armorId={item.id} size={size} silhouette={silhouette} />
  return <WeaponIcon weaponId={item.id} size={size} silhouette={silhouette} />
}

export function MusicIcon({ size = 42, off = false }) {
  return (
    <Svg size={size}>
      <path d="M24 44V14l26-6v30" fill="none" stroke={O} strokeWidth="7" strokeLinejoin="round" />
      <path d="M24 44V14l26-6v30" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinejoin="round" />
      <ellipse cx="17" cy="45" rx="8" ry="6.5" fill="#fff" stroke={O} strokeWidth="3.5" />
      <ellipse cx="43" cy="39" rx="8" ry="6.5" fill="#fff" stroke={O} strokeWidth="3.5" />
      {off && <path d="M8 8l48 48" stroke="#e0202c" strokeWidth="7" strokeLinecap="round" />}
    </Svg>
  )
}

/** Backpack art for the shop, one per bag `look` (matches the 3D models). */
export function BagIcon({ look = 'pouch', size = 72 }) {
  const body = {
    pouch: ['#b8783a', '#8a5226'],
    explorer: ['#6f9a45', '#4a6e2a'],
    knight: ['#c3cbdb', '#8a93a8'],
    crystal: ['#2e4a8a', '#1b2a5a'],
    dragon: ['#d61f2a', '#8a0a12'],
    void: ['#2a0b48', '#12031f'],
    celestial: ['#ffffff', '#dfe4f0'],
  }[look] || ['#b8783a', '#8a5226']
  return (
    <Svg size={size}>
      {look === 'dragon' && (
        <>
          <path d="M12 26L2 14l4 20z" fill="#8a0a12" stroke={O} strokeWidth="3" strokeLinejoin="round" />
          <path d="M52 26l10-12-4 20z" fill="#8a0a12" stroke={O} strokeWidth="3" strokeLinejoin="round" />
        </>
      )}
      {look === 'celestial' && <ellipse cx="32" cy="7" rx="13" ry="4" fill="none" stroke="#ffd23b" strokeWidth="3.5" />}
      {look === 'explorer' && <rect x="12" y="10" width="40" height="11" rx="5.5" fill="#d9b46a" stroke={O} strokeWidth="3.5" />}
      {look === 'crystal' && (
        <>
          <path d="M22 20l3-14 4 14z" fill="#7cf6ff" stroke={O} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M30 20l4-17 4 17z" fill="#b8fbff" stroke={O} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M39 20l3-11 3 11z" fill="#7cf6ff" stroke={O} strokeWidth="2.5" strokeLinejoin="round" />
        </>
      )}
      {look === 'pouch' ? (
        <>
          <path d="M22 16c-10 8-14 20-12 30 2 10 42 10 44 0 2-10-2-22-12-30z" fill={body[0]} stroke={O} strokeWidth="4.5" strokeLinejoin="round" />
          <path d="M22 16l-3-6h26l-3 6z" fill={body[1]} stroke={O} strokeWidth="3.5" strokeLinejoin="round" />
          <rect x="21" y="14" width="22" height="5" rx="2" fill="#5a3a1e" stroke={O} strokeWidth="2.5" />
          <circle cx="32" cy="34" r="4" fill="#ffd23b" stroke={O} strokeWidth="2.5" />
        </>
      ) : (
        <>
          <rect x="11" y="18" width="42" height="40" rx="10" fill={body[0]} stroke={O} strokeWidth="4.5" />
          <path d="M11 30c6-5 36-5 42 0v-2c0-6-4-10-10-10H21c-6 0-10 4-10 10z" fill={body[1]} stroke={O} strokeWidth="3.5" />
          <rect x="19" y="38" width="26" height="15" rx="4" fill={body[1]} stroke={O} strokeWidth="3" />
        </>
      )}
      {look === 'knight' && (
        <>
          <rect x="22" y="31" width="20" height="24" fill="#c21a2e" stroke={O} strokeWidth="2.5" />
          <rect x="29" y="31" width="6" height="24" fill="#ffd23b" stroke={O} strokeWidth="2" />
        </>
      )}
      {look === 'crystal' && <rect x="24" y="36" width="16" height="14" rx="3" fill="#3ef6ff" stroke={O} strokeWidth="2.5" />}
      {look === 'dragon' && (
        <>
          <path d="M11 26h42" stroke="#ffc629" strokeWidth="4" />
          <circle cx="32" cy="44" r="5" fill="#ffb000" stroke={O} strokeWidth="2.5" />
        </>
      )}
      {look === 'void' && (
        <>
          <circle cx="32" cy="42" r="9" fill="#000" stroke="#ff4df2" strokeWidth="3.5" />
          <circle cx="32" cy="42" r="2.5" fill="#fff" />
        </>
      )}
      {look === 'celestial' && <path d="M32 33l3 7 7 2-7 2-3 8-3-8-7-2 7-2z" fill="#ffd23b" stroke={O} strokeWidth="2" strokeLinejoin="round" />}
      {look === 'explorer' && <rect x="28" y="34" width="8" height="7" rx="2" fill="#c9a256" stroke={O} strokeWidth="2.5" />}
    </Svg>
  )
}
