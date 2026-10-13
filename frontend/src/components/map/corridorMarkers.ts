import * as maplibregl from 'maplibre-gl'
import type { ActiveCorridorSample } from '../../hooks/useCorridorWeather'

const intensityColors: Record<string, string> = {
  Light: '#AEE033',
  Moderate: '#FACC15',
  Heavy: '#FB923C',
  Extreme: '#EF4444',
  Unavailable: '#94A3B8',
}

function formatForecastTime(value: string | undefined) {
  if (!value) {
    return 'Forecast unavailable'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Forecast unavailable'
  }

  const formatted = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  }).format(date)

  return `${formatted} UTC`
}

function formatWind(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return 'Forecast unavailable'
  }

  return `${value.toFixed(1)} mph`
}

function formatPrecipitation(
  value: number | null | undefined,
  type: 'rain' | 'snow'
) {
  if (value == null || !Number.isFinite(value)) {
    return 'Forecast unavailable'
  }

  if (value === 0) {
    return type === 'rain'
      ? 'No rain expected'
      : 'No snow expected'
  }

  return `${value.toFixed(3)} in/hr`
}

function createDetail(label: string, value: string) {
  const detail = document.createElement('span')
  detail.textContent = `${label}: ${value}`
  return detail
}

function makePopup(sample: ActiveCorridorSample) {
  const popup = document.createElement('div')
  popup.className = 'weather-map-popup'

  const heading = document.createElement('strong')
  heading.textContent = `Corridor forecast ${sample.index + 1}`

  const intensity = document.createElement('span')
  const intensityLevel = sample.frame?.intensity ?? 'Unavailable'

  intensity.textContent = `Intensity: ${intensityLevel}`
  intensity.style.color =
    intensityColors[intensityLevel] ?? intensityColors.Unavailable

  const time = document.createElement('span')
  time.textContent = formatForecastTime(
    sample.frame?.forecast_time
  )

  const distance = createDetail(
    'Route position',
    `${sample.distance_miles.toFixed(1)} miles from origin`
  )

  const wind = createDetail(
    'Wind gusts',
    formatWind(sample.frame?.weather.wind_gust_mph)
  )

  const rain = createDetail(
    'Rain',
    formatPrecipitation(
      sample.frame?.weather.rain_inches_per_hour,
      'rain'
    )
  )

  const snow = createDetail(
    'Snow',
    formatPrecipitation(
      sample.frame?.weather.snowfall_inches_per_hour,
      'snow'
    )
  )

  const note = document.createElement('small')
  note.textContent =
    'Hourly weather intensity at this location. Freight risk is calculated separately.'

  popup.append(
    heading,
    intensity,
    time,
    distance,
    wind,
    rain,
    snow,
    note
  )

  return popup
}

export function addCorridorMarkers(
  map: maplibregl.Map,
  samples: ActiveCorridorSample[]
): maplibregl.Marker[] {
  return samples
    .filter(
      sample =>
        Number.isFinite(sample.longitude) &&
        Number.isFinite(sample.latitude)
    )
    .map(sample => {
      const intensity = sample.frame?.intensity ?? 'Unavailable'
      const color =
        intensityColors[intensity] ?? intensityColors.Unavailable

      const element = document.createElement('button')
      element.type = 'button'
      element.title =
        `Corridor forecast point ${sample.index + 1}: ${intensity}`

      element.setAttribute('aria-label', element.title)
      element.textContent = String(sample.index + 1)

      Object.assign(element.style, {
        width: '30px',
        height: '30px',
        borderRadius: '50%',
        border: '3px solid #092B2B',
        backgroundColor: color,
        color: '#092B2B',
        fontSize: '12px',
        fontWeight: '800',
        cursor: 'pointer',
        boxShadow: `0 0 0 3px ${color}55, 0 4px 12px #0008`,
      })

      return new maplibregl.Marker({
        element,
        anchor: 'center',
      })
        .setLngLat([sample.longitude, sample.latitude])
        .setPopup(
          new maplibregl.Popup({
            offset: 20,
            maxWidth: '290px',
            closeButton: false,
            closeOnClick: true,
          }).setDOMContent(makePopup(sample))
        )
        .addTo(map)
    })
}