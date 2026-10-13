
import { Clock3, CloudRain, Wind, Snowflake } from 'lucide-react'
import type { WeatherTimeline as TimelineData } from '../../services/weather'

type WeatherTimelineProps = {
  timeline: TimelineData | null
  selectedHour: number
  onHourChange: (hour: number) => void
  loading: boolean
  error: string | null
}

function formatReading(value: number | null, unit: string) {
  return value === null ? 'Unavailable' : `${value.toFixed(1)} ${unit}`
}

export default function WeatherTimeline({
  timeline,
  selectedHour,
  onHourChange,
  loading,
  error,
}: WeatherTimelineProps) {
  const frames = timeline?.frames ?? []
  const maxHour = Math.max(0, frames.length - 1)
  const hour = Math.min(selectedHour, maxHour)
  const frame = frames[hour] ?? null

  const formattedTime = frame
    ? new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'UTC',
        timeZoneName: 'short',
      }).format(new Date(frame.forecast_time))
    : 'No forecast selected'

  return (
    <section className="weather-timeline">
      <div className="weather-timeline__heading">
        <div>
          <span className="weather-timeline__eyebrow">
            FORECAST EXPLORER
          </span>
          <h3>Weather timeline</h3>
        </div>
        <Clock3 size={19} />
      </div>

      {loading && (
        <p className="weather-timeline__message">
          Loading hourly forecasts...
        </p>
      )}

      {error && (
        <p className="weather-timeline__message weather-timeline__error">
          {error}
        </p>
      )}

      {!loading && !error && !frame && (
        <p className="weather-timeline__message">
          Plan a route to explore its hourly weather forecast.
        </p>
      )}

      {frame && (
        <>
          <div className="weather-timeline__time">
            <strong>{formattedTime}</strong>
            <span>+{hour}h from forecast start</span>
          </div>

          <input
            className="weather-timeline__slider"
            type="range"
            min={0}
            max={maxHour}
            step={1}
            value={hour}
            onChange={(event) =>
              onHourChange(Number(event.target.value))
            }
            aria-label="Select forecast hour"
          />

          <div className="weather-timeline__ticks">
            <span>0h</span>
            <span>12h</span>
            <span>24h</span>
            <span>36h</span>
            <span>48h</span>
          </div>

          <div className="weather-timeline__readings">
            <div>
              <Wind size={17} />
              <span>Wind gusts</span>
              <strong>
                {formatReading(frame.weather.wind_gust_mph, 'mph')}
              </strong>
            </div>

            <div>
              <CloudRain size={17} />
              <span>Rain</span>
              <strong>
                {formatReading(
                  frame.weather.rain_inches_per_hour,
                  'in/hr'
                )}
              </strong>
            </div>

            <div>
              <Snowflake size={17} />
              <span>Snowfall</span>
              <strong>
                {formatReading(
                  frame.weather.snowfall_inches_per_hour,
                  'in/hr'
                )}
              </strong>
            </div>
          </div>

          <p className="weather-timeline__source">
            Hourly forecast at the selected location · Open-Meteo
          </p>
        </>
      )}
    </section>
  )
}
