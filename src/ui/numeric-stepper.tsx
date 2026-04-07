import type { FocusEventHandler } from 'react'

/** Integer step for arrow buttons (clamp to [min, max]). */
export function applyIntStep(value: number, min: number, max: number, delta: number): number {
  return Math.min(max, Math.max(min, value + delta))
}

function ChevronUpIcon() {
  return (
    <svg
      className="ls-num-stepper__icon"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 12 12"
      width={10}
      height={10}
      aria-hidden
    >
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M3 7.5L6 4.5L9 7.5"
      />
    </svg>
  )
}

function ChevronDownIcon() {
  return (
    <svg
      className="ls-num-stepper__icon"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 12 12"
      width={10}
      height={10}
      aria-hidden
    >
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M3 4.5L6 7.5L9 4.5"
      />
    </svg>
  )
}

export type NumberStepperProps = {
  value: number
  min: number
  max: number
  step?: number
  onValueChange: (n: number) => void
  'aria-label': string
  'aria-describedby'?: string
  /** Fires when focus enters the control (input or arrow buttons). */
  onFocusCapture?: FocusEventHandler<HTMLDivElement>
  variant: 'level' | 'rail' | 'field'
  className?: string
}

export function NumberStepper({
  value,
  min,
  max,
  step = 1,
  onValueChange,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  onFocusCapture,
  variant,
  className,
}: NumberStepperProps) {
  const rootClass = ['ls-num-stepper', `ls-num-stepper--${variant}`, className].filter(Boolean).join(' ')
  const atMin = value <= min
  const atMax = value >= max

  return (
    <div className={rootClass} onFocusCapture={onFocusCapture}>
      <input
        className="ls-num-stepper__input"
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isNaN(n)) return
          onValueChange(n)
        }}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
      />
      <div className="ls-num-stepper__btns">
        <button
          type="button"
          className="ls-num-stepper__btn"
          disabled={atMax}
          aria-label={`${ariaLabel} — increase`}
          onClick={() => {
            const next = applyIntStep(value, min, max, step)
            if (next !== value) onValueChange(next)
          }}
        >
          <ChevronUpIcon />
        </button>
        <button
          type="button"
          className="ls-num-stepper__btn"
          disabled={atMin}
          aria-label={`${ariaLabel} — decrease`}
          onClick={() => {
            const next = applyIntStep(value, min, max, -step)
            if (next !== value) onValueChange(next)
          }}
        >
          <ChevronDownIcon />
        </button>
      </div>
    </div>
  )
}
