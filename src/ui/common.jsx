import { useEffect } from 'react'

import { sfx } from '../audio/sound'
import { useGame } from '../net/store'
import { formatNum, rarityOf } from '../shared/gameData'
import { CoinIcon, GemIcon, XIcon } from './Icons'
import { rarityBg } from './rarity'

/** Outlined game text. */
export function St({ as: Tag = 'span', className = '', style, children, ...rest }) {
  return (
    <Tag className={`st ${className}`} style={style} {...rest}>
      {children}
    </Tag>
  )
}

export function Btn({ variant = 'gold', className = '', onClick, disabled, children, sound = 'click', ...rest }) {
  return (
    <button
      type="button"
      className={`btn btn-${variant} ${className}`}
      disabled={disabled}
      onClick={(e) => {
        sfx(sound)
        onClick?.(e)
      }}
      {...rest}
    >
      {children}
    </button>
  )
}

export function CloseButton({ onClick }) {
  return (
    <button
      type="button"
      className="close-x"
      onClick={() => {
        sfx('close')
        onClick()
      }}
      aria-label="Close"
    >
      <XIcon size={34} />
    </button>
  )
}

/** Standard modal: dark frame with corner ornaments, big title, red X. Esc closes. */
export function Panel({ title, children, width = 760, className = '', onClose, titleClass = '' }) {
  const close = useGame((s) => s.closePanel)
  const handleClose = onClose || close

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Escape') {
        sfx('close')
        handleClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleClose])

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/35 fade-in" onPointerDown={(e) => e.target === e.currentTarget && handleClose()}>
      <div className={`pop-in relative ${className}`} style={{ width, maxWidth: '96vw' }}>
        <div className="mb-2 flex items-end justify-center">
          <St as="h2" className={`text-5xl ${titleClass}`}>
            {title}
          </St>
        </div>
        <div className="absolute -top-2 -right-3 z-10">
          <CloseButton onClick={handleClose} />
        </div>
        <div className="panel p-5" style={{ maxHeight: '78vh' }}>
          <span className="corner tl" />
          <span className="corner tr" />
          <span className="corner bl" />
          <span className="corner br" />
          {/* Tall panels (the shop) scroll inside the frame instead of spilling out. */}
          <div className="panel-scroll relative" style={{ maxHeight: 'calc(78vh - 40px)' }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map(([id, label]) => (
        <button
          key={id}
          type="button"
          className={`tab text-lg ${value === id ? 'active' : ''}`}
          onClick={() => {
            sfx('click')
            onChange(id)
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export function RarityTile({ rarity, size = 84, selected, onClick, children, className = '', title }) {
  return (
    <button
      type="button"
      title={title}
      className={`tile ${selected ? 'selected' : ''} ${className} grid place-items-center`}
      style={{ width: size, height: size, background: rarity ? rarityBg(rarity) : undefined }}
      onClick={(e) => {
        sfx('click')
        onClick?.(e)
      }}
    >
      {children}
    </button>
  )
}

export function RarityText({ rarity, className = '', children }) {
  const r = rarityOf(rarity)
  return (
    <St className={`${className} ${rarity === 'Secret' ? 'grad-rainbow' : ''}`} style={rarity === 'Secret' ? undefined : { color: r.color }}>
      {children ?? rarity}
    </St>
  )
}

export function Price({ amount, currency = 'coins', className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {currency === 'gems' ? <GemIcon size={24} /> : <CoinIcon size={24} />}
      <St>{formatNum(amount)}</St>
    </span>
  )
}

export function Wallet() {
  const coins = useGame((s) => s.profile?.coins ?? 0)
  return (
    <div className="flex items-center gap-4 rounded-xl bg-black/40 px-3 py-1">
      <Price amount={coins} />
    </div>
  )
}

export function ProgressBar({ value, max, color = 'linear-gradient(#7dff5a,#22c21f)', height = 22, label }) {
  const pct = Math.max(0, Math.min(1, max ? value / max : 0))
  return (
    <div className="bar w-full" style={{ height }}>
      <div className="bar-fill" style={{ width: `${pct * 100}%`, background: color }} />
      {label && (
        <div className="absolute inset-0 grid place-items-center text-sm">
          <St className="st-thin">{label}</St>
        </div>
      )}
    </div>
  )
}
