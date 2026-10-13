
import { useEffect, useId, useRef, useState } from 'react'
import { LoaderCircle, MapPin } from 'lucide-react'

type LocationAutocompleteProps = {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

type PhotonFeature = {
  properties: {
    name?: string
    city?: string
    state?: string
    country?: string
    street?: string
    housenumber?: string
  }
}

function formatPlace(feature: PhotonFeature) {
  const place = feature.properties

  const primary = [
    place.housenumber,
    place.street,
  ].filter(Boolean).join(' ')

  const parts = [
    primary || place.name,
    place.city,
    place.state,
    place.country,
  ].filter(Boolean)

  return [...new Set(parts)].join(', ')
}

export function LocationAutocomplete({
  label,
  value,
  onChange,
  placeholder = 'Search for a location',
}: LocationAutocompleteProps) {
  const listId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [query, setQuery] = useState('')
  const [confirmed, setConfirmed] = useState('')

  useEffect(() => {
    if (!open || query.length < 3 || query === confirmed) {
      setSuggestions([])
      setLoading(false)
      return
    }

    const controller = new AbortController()

    const timer = window.setTimeout(async () => {
      setLoading(true)

      try {
        const url = new URL('https://photon.komoot.io/api/')
        url.searchParams.set('q', query)
        url.searchParams.set('limit', '6')

        const response = await fetch(url, {
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error('Location search failed')
        }

        const data: { features: PhotonFeature[] } =
          await response.json()

        const locations = data.features
          .map(formatPlace)
          .filter(Boolean)

        setSuggestions([...new Set(locations)])
        setActiveIndex(-1)
      } catch {
        if (!controller.signal.aborted) {
          setSuggestions([])
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }, 450)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query, open, confirmed])

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [])

  const selectLocation = (location: string) => {
    onChange(location)
    setConfirmed(location)
    setQuery(location)
    setOpen(false)
    setSuggestions([])
    setActiveIndex(-1)
  }

  return (
    <div className="location-field" ref={containerRef}>
      <label className="location-label" htmlFor={listId}>
        {label}
      </label>

      <div className="location-input-wrap">
        <MapPin size={18} />

        <input
          id={listId}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && suggestions.length > 0}
          aria-controls={`${listId}-options`}
          aria-activedescendant={
            activeIndex >= 0
              ? `${listId}-option-${activeIndex}`
              : undefined
          }
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          onFocus={() => {
            setQuery(value)
            setOpen(true)
          }}
          onChange={event => {
            const nextValue = event.target.value
            onChange(nextValue)
            setQuery(nextValue)
            setConfirmed('')
            setOpen(true)
          }}
          onKeyDown={event => {
            if (event.key === 'Escape') {
              setOpen(false)
              return
            }

            if (!open || suggestions.length === 0) return

            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setActiveIndex(index =>
                Math.min(index + 1, suggestions.length - 1)
              )
            }

            if (event.key === 'ArrowUp') {
              event.preventDefault()
              setActiveIndex(index => Math.max(index - 1, 0))
            }

            if (event.key === 'Enter' && activeIndex >= 0) {
              event.preventDefault()
              selectLocation(suggestions[activeIndex])
            }
          }}
        />

        {loading && (
          <LoaderCircle
            size={16}
            className="location-loading"
          />
        )}
      </div>

      {open && suggestions.length > 0 && (
        <div
          id={`${listId}-options`}
          className="location-suggestions"
          role="listbox"
        >
          {suggestions.map((location, index) => (
            <button
              key={location}
              id={`${listId}-option-${index}`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={
                index === activeIndex
                  ? 'location-suggestion is-highlighted'
                  : 'location-suggestion'
              }
              onMouseDown={event => event.preventDefault()}
              onClick={() => selectLocation(location)}
            >
              <MapPin size={15} />
              <span>{location}</span>
            </button>
          ))}

          <div className="location-attribution">
            Search powered by Photon / OpenStreetMap
          </div>
        </div>
      )}
    </div>
  )
}
