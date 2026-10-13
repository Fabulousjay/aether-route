
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, X } from 'lucide-react'

type DeparturePickerProps = {
  value: string
  onChange: (value: string) => void
  label?: string
}

const weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

const pad = (value: number) => String(value).padStart(2, '0')

function toLocalValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function parseDate(value: string) {
  if (!value) return new Date()

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function sameDay(first: Date, second: Date) {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  )
}

export default function DeparturePicker({
  value,
  onChange,
  label = 'Departure date and time',
}: DeparturePickerProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(() => parseDate(value))
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const date = parseDate(value)
    return new Date(date.getFullYear(), date.getMonth(), 1)
  })

  const dialogId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  const year = visibleMonth.getFullYear()
  const month = visibleMonth.getMonth()
  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const calendarCells: Array<number | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ]

  while (calendarCells.length % 7 !== 0) {
    calendarCells.push(null)
  }

  function openPicker() {
    const next = parseDate(value)

    setDraft(next)
    setVisibleMonth(new Date(next.getFullYear(), next.getMonth(), 1))
    previouslyFocusedRef.current = document.activeElement as HTMLElement
    setOpen(true)
  }

  function closePicker() {
    setOpen(false)
    window.requestAnimationFrame(() => {
      previouslyFocusedRef.current?.focus()
    })
  }

  function changeMonth(offset: number) {
    setVisibleMonth(new Date(year, month + offset, 1))
  }

  function chooseDay(day: number) {
    setDraft((current) => {
      const next = new Date(current)
      next.setFullYear(year, month, day)
      return next
    })
  }

  function changeTime(part: 'hours' | 'minutes', value: number) {
    setDraft((current) => {
      const next = new Date(current)

      if (part === 'hours') next.setHours(value)
      else next.setMinutes(value)

      return next
    })
  }

  function confirm() {
    onChange(toLocalValue(draft))
    closePicker()
  }

  useEffect(() => {
    if (!open) return

    const dialog = dialogRef.current
    const focusable = dialog?.querySelector<HTMLElement>('.departure-close')
    focusable?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        closePicker()
        return
      }

      if (event.key !== 'Tab' || !dialog) return

      const elements = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), select:not(:disabled)'
        )
      )

      if (!elements.length) return

      const first = elements[0]
      const last = elements[elements.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open])

  return (
    <div className="departure-field">
      <span className="departure-label">{label}</span>

      <button
        ref={triggerRef}
        type="button"
        className="departure-trigger"
        onClick={openPicker}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
      >
        <Clock3 size={17} />
        <span>{value ? formatDate(parseDate(value)) : 'Select departure date and time'}</span>
        <CalendarDays size={17} className="departure-trigger-icon" />
      </button>

      {open &&
        createPortal(
          <div
            className="departure-overlay"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closePicker()
            }}
          >
            <div
              ref={dialogRef}
              id={dialogId}
              className="departure-popover"
              role="dialog"
              aria-modal="true"
              aria-labelledby={`${dialogId}-title`}
            >
              <div className="departure-popover-heading">
                <div>
                  <strong id={`${dialogId}-title`}>Set departure</strong>
                  <p>Choose when your journey begins.</p>
                </div>

                <button
                  type="button"
                  className="departure-close"
                  aria-label="Close departure picker"
                  onClick={closePicker}
                >
                  <X size={17} />
                </button>
              </div>

              <div className="departure-month-header">
                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={() => changeMonth(-1)}
                >
                  <ChevronLeft size={17} />
                </button>

                <strong>
                  {new Intl.DateTimeFormat('en-US', {
                    month: 'long',
                    year: 'numeric',
                  }).format(visibleMonth)}
                </strong>

                <button
                  type="button"
                  aria-label="Next month"
                  onClick={() => changeMonth(1)}
                >
                  <ChevronRight size={17} />
                </button>
              </div>

              <div className="departure-calendar">
                {weekdays.map((day) => (
                  <span className="departure-weekday" key={day}>
                    {day}
                  </span>
                ))}

                {calendarCells.map((day, index) => {
                  if (day === null) {
                    return <span key={`empty-${index}`} />
                  }

                  const date = new Date(year, month, day)
                  const selected = sameDay(date, draft)

                  return (
                    <button
                      key={`${year}-${month}-${day}`}
                      type="button"
                      className={selected ? 'is-selected' : ''}
                      aria-label={new Intl.DateTimeFormat('en-US', {
                        dateStyle: 'full',
                      }).format(date)}
                      aria-pressed={selected}
                      onClick={() => chooseDay(day)}
                    >
                      {day}
                    </button>
                  )
                })}
              </div>

              <div className="departure-time-section">
                <div className="departure-time-title">
                  <Clock3 size={15} />
                  <strong>Departure time</strong>
                </div>

                <div className="departure-time-controls">
                  <label>
                    <span>Hour</span>
                    <select
                      value={draft.getHours()}
                      onChange={(event) =>
                        changeTime('hours', Number(event.target.value))
                      }
                    >
                      {Array.from({ length: 24 }, (_, hour) => (
                        <option key={hour} value={hour}>
                          {pad(hour)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <span className="departure-time-separator">:</span>

                  <label>
                    <span>Minute</span>
                    <select
                      value={draft.getMinutes()}
                      onChange={(event) =>
                        changeTime('minutes', Number(event.target.value))
                      }
                    >
                      {Array.from({ length: 60 }, (_, minute) => (
                        <option key={minute} value={minute}>
                          {pad(minute)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div className="departure-preview">{formatDate(draft)}</div>

              <div className="departure-actions">
                <button
                  type="button"
                  className="departure-cancel"
                  onClick={closePicker}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="departure-confirm"
                  onClick={confirm}
                >
                  <Check size={15} />
                  OK
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
