
import { lazy, Suspense, useState, type FormEvent } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  CloudSun,
  Package,
  Route,
  ShieldCheck,
  SlidersHorizontal,
  Wind,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { LocationAutocomplete } from '../components/ui/LocationAutocomplete'
import DeparturePicker from '../components/ui/DeparturePicker'
import { useRoutes } from '../hooks/useRoutes'
import { useWeatherTimeline } from '../hooks/useWeatherTimeline'
import WeatherTimeline from '../components/weather/WeatherTimeline'
import '../styles/weather-timeline.css'
import '../styles/studio-timeline.css'
import type { RiskLevel, RouteOption, TripDetails } from '../services/api'

const RouteMap = lazy(() =>
  import('../components/map/RouteMap').then(module => ({
    default: module.RouteMap,
  }))
)

const initialTrip: TripDetails = {
  origin: '',
  destination: '',
  departure: '',
  weight: '',
  interval: '25',
}

const routeColors = ['#AEE033', '#02AAB0', '#F59E0B']

const riskColors: Record<RiskLevel, string> = {
  Low: '#AEE033',
  Moderate: '#FACC15',
  High: '#FB923C',
  Severe: '#EF4444',
  'No Travel': '#A855F7',
}

const riskLevels: RiskLevel[] = [
  'Low',
  'Moderate',
  'High',
  'Severe',
  'No Travel',
]

function formatDuration(minutes: number) {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

function WeatherDetails({ route }: { route: RouteOption }) {
  const analysis = route.weather_analysis

  if (!analysis || analysis.status !== 'available') {
    return (
      <div className="weather-unavailable">
        <CloudSun size={18} />
        <div>
          <strong>Weather analysis unavailable</strong>
          <p>
            {analysis?.reason ??
              'No weather forecast was returned for this route.'}
          </p>
        </div>
      </div>
    )
  }

  const summary = analysis.summary
  const miles = analysis.risk_miles

  if (!summary || !miles) return null

  return (
    <section
      className="weather-details"
      aria-label="Freight weather risk analysis"
    >
      <div className="weather-details-header">
        <span className="eyebrow">WEATHER EXPOSURE</span>
        <span
          className="weather-risk-badge"
          style={{
            color: riskColors[summary.overall_level],
            borderColor: riskColors[summary.overall_level],
          }}
        >
          {summary.overall_level}
        </span>
      </div>

      <div className="weather-stats">
        <div>
          <span>Checkpoints</span>
          <strong>{analysis.checkpoint_count}</strong>
        </div>
        <div>
          <span>Severe miles</span>
          <strong>{miles.Severe.toFixed(1)}</strong>
        </div>
        <div>
          <span>No Travel miles</span>
          <strong>{miles['No Travel'].toFixed(1)}</strong>
        </div>
      </div>

      <div className="weather-exposure-track">
        {riskLevels.map(level => {
          const width =
            route.distance_miles > 0
              ? (miles[level] / route.distance_miles) * 100
              : 0

          if (width <= 0) return null

          return (
            <div
              key={level}
              title={`${level}: ${miles[level].toFixed(1)} miles`}
              style={{
                width: `${width}%`,
                backgroundColor: riskColors[level],
              }}
            />
          )
        })}
      </div>

      <div className="weather-exposure-labels">
        <span>{route.distance_miles.toFixed(1)} miles analyzed</span>
        <span>Estimated exposure</span>
      </div>

      {summary.has_no_travel && (
        <p className="weather-warning">
          A No Travel threshold was detected. Do not treat
          this route as safe for departure.
        </p>
      )}

      <p className="weather-method-note">
        Forecast risk is estimated at checkpoint arrival times.
        Segment colors use the higher risk at adjacent checkpoints.
      </p>
    </section>
  )
}

export function RouteStudio() {
  const [trip, setTrip] = useState<TripDetails>(initialTrip)
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)

  const {
    result,
    loading,
    error,
    calculateRoutes,
    clearRoutes,
  } = useRoutes()

  function update(field: keyof TripDetails, value: string) {
    setTrip(current => ({
      ...current,
      [field]: value,
    }))
    setValidationError(null)
    setSelectedRouteId(null)
    clearRoutes()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!trip.origin.trim()) {
      setValidationError('Please enter your starting location.')
      return
    }

    if (!trip.destination.trim()) {
      setValidationError('Please enter your destination.')
      return
    }

    if (!trip.departure) {
      setValidationError('Please select a departure date and time.')
      return
    }

    if (!trip.weight.trim()) {
      setValidationError('Please enter your load weight.')
      return
    }

    const weight = Number(trip.weight)

    if (
      !Number.isFinite(weight) ||
      weight <= 0 ||
      weight > 200000
    ) {
      setValidationError(
        'Load weight must be greater than 0 and at most 200,000 lb.'
      )
      return
    }

    setValidationError(null)
    setSelectedRouteId(null)
    await calculateRoutes(trip)
  }

  const selectedRoute =
    result?.routes.find(route => route.id === selectedRouteId) ??
    result?.routes[0]

  const timelineLocation = result
    ? {
        latitude: result.origin.latitude,
        longitude: result.origin.longitude,
        startTime: result.journey.departure,
      }
    : null

  const {
    timeline,
    selectedHour,
    setSelectedHour,
    selectedFrame,
    loading: timelineLoading,
    error: timelineError,
  } = useWeatherTimeline(timelineLocation)

  const recommendedId = result?.recommendation?.route_id

  return (
    <div className="studio-shell studio-v2">
      <aside className="studio-sidebar">
        <div className="studio-top">
          <Brand />
          <Link to="/" className="back-link">
            <ArrowLeft size={15} />
            Back to overview
          </Link>
        </div>

        <div className="studio-intro">
          <span className="eyebrow">JOURNEY PLANNER / 01</span>
          <h1>
            Plan your <em>next move.</em>
          </h1>
          <p>
            Set your journey details. Compare real driving routes,
            estimated arrival times and weather exposure.
          </p>
        </div>

        <form className="trip-form" onSubmit={handleSubmit}>
          <LocationAutocomplete
            label="Origin"
            value={trip.origin}
            onChange={value => update('origin', value)}
            placeholder="City or address"
          />

          <LocationAutocomplete
            label="Destination"
            value={trip.destination}
            onChange={value => update('destination', value)}
            placeholder="Where are you heading?"
          />

          <DeparturePicker
            value={trip.departure}
            onChange={value => update('departure', value)}
          />

          <label>
            <span>Load weight (lb)</span>
            <div className="input-wrap">
              <Package size={17} />
              <input
                required
                type="number"
                min="1"
                max="200000"
                step="1"
                placeholder="e.g. 30000"
                value={trip.weight}
                onChange={event => update('weight', event.target.value)}
              />
            </div>
          </label>

          <label>
            <span>Checkpoint spacing</span>
            <div className="input-wrap">
              <SlidersHorizontal size={17} />
              <select
                value={trip.interval}
                onChange={event => update('interval', event.target.value)}
              >
                <option value="10">Every 10 miles</option>
                <option value="25">Every 25 miles</option>
                <option value="50">Every 50 miles</option>
              </select>
            </div>
          </label>

          <button
            className="button-primary studio-submit"
            type="submit"
            disabled={loading}
          >
            {loading ? 'Analyzing weather...' : 'Analyze journey'}
            <ArrowRight size={17} />
          </button>
        </form>

        {(validationError || error) && (
          <div className="route-error" role="alert">
            {validationError || error}
          </div>
        )}

        {result && (
          <section
            className="route-results"
            aria-label="Driving routes and weather analysis"
          >
            <div className="route-results-heading">
              <span className="eyebrow">DRIVING ROUTES</span>
              <strong>{result.route_count} found</strong>
            </div>

            {result.routes.map((route, index) => {
              const active = selectedRoute?.id === route.id
              const analysis = route.weather_analysis
              const risk = analysis?.summary?.overall_level

              return (
                <button
                  key={route.id}
                  type="button"
                  className={`route-option ${active ? 'is-active' : ''}`}
                  onClick={() => setSelectedRouteId(route.id)}
                >
                  <span
                    className="route-option-color"
                    style={{
                      backgroundColor:
                        routeColors[index % routeColors.length],
                    }}
                  />

                  <span className="route-option-content">
                    <strong>
                      {route.name}
                      {recommendedId === route.id && (
                        <span className="route-recommended">
                          Recommended
                        </span>
                      )}
                    </strong>

                    <small>
                      {route.distance_miles.toLocaleString()} miles
                      {' · '}
                      {formatDuration(route.duration_minutes)}
                    </small>

                    {risk && (
                      <small
                        className="route-risk-label"
                        style={{ color: riskColors[risk] }}
                      >
                        {risk} weather risk
                      </small>
                    )}

                    {analysis?.status === 'unavailable' && (
                      <small className="route-risk-label">
                        Forecast unavailable
                      </small>
                    )}
                  </span>

                  <ArrowRight size={16} />
                </button>
              )
            })}

            {selectedRoute && <WeatherDetails route={selectedRoute} />}

            {result.route_count < 3 && (
              <p className="route-results-note">
                Only {result.route_count} distinct driving
                {result.route_count === 1
                  ? ' route was'
                  : ' routes were'}{' '}
                returned for this journey.
              </p>
            )}

            <p className="route-results-note">
              Routing estimates do not account for commercial
              vehicle restrictions. Weather risk is forecast-based,
              not a road safety clearance.
            </p>

            <p className="route-results-note">
              Departure time currently uses your browser timezone,
              which may differ from the origin's timezone.
            </p>
          </section>
        )}

        <div className="studio-sidebar-bottom">
          <CloudSun size={16} />
          Weather-aware freight intelligence
        </div>
      </aside>

      <main className="map-stage">
        <Suspense
          fallback={<div className="map-loading">Loading map...</div>}
        >
          <RouteMap
            result={result}
            selectedRouteId={
              selectedRouteId ?? result?.routes[0]?.id
            }
            onSelectRoute={setSelectedRouteId}
            timelineFrame={selectedFrame}
            timelineLocation={
              timeline
                ? {
                    latitude: timeline.latitude,
                    longitude: timeline.longitude,
                  }
                : null
            }
          />
        </Suspense>

        {result && (
          <div className="studio-weather-timeline">
            <WeatherTimeline
              timeline={timeline}
              selectedHour={selectedHour}
              onHourChange={setSelectedHour}
              loading={timelineLoading}
              error={timelineError}
            />
          </div>
        )}

        <div className="map-toolbar">
          <span>
            <span className="live-dot" />
            ROUTE EXPLORER
          </span>
          <span className="map-status">
            <Clock3 size={15} />
            {loading
              ? 'Analyzing routes and forecasts'
              : result
                ? `${result.route_count} ${
                    result.route_count === 1
                      ? 'route found'
                      : 'routes found'
                  }`
                : 'Live map / Route analysis pending'}
          </span>
        </div>

        {!result && !loading && (
          <div className="map-guide">
            <div className="map-guide-icon">
              <Route size={20} />
            </div>
            <div>
              <span className="eyebrow">YOUR JOURNEY</span>
              <h2>Explore the terrain.</h2>
              <p>
                Enter your journey details to discover real driving
                routes and forecast weather exposure.
              </p>
            </div>
          </div>
        )}

        {result && selectedRoute && (
          <div className="map-route-summary weather-map-summary">
            <span className="eyebrow">SELECTED ROUTE</span>
            <h2>{selectedRoute.name}</h2>
            <p>
              {selectedRoute.distance_miles.toLocaleString()}
              {' miles · '}
              {formatDuration(selectedRoute.duration_minutes)}
              {' estimated'}
            </p>

            {selectedRoute.weather_analysis?.summary && (
              <div className="weather-map-summary-risk">
                <ShieldCheck size={16} />
                <strong
                  style={{
                    color:
                      riskColors[
                        selectedRoute.weather_analysis.summary
                          .overall_level
                      ],
                  }}
                >
                  {selectedRoute.weather_analysis.summary.overall_level}{' '}
                  risk
                </strong>
                <span>
                  {selectedRoute.weather_analysis.checkpoint_count}{' '}
                  checkpoints
                </span>
              </div>
            )}

            {selectedRoute.weather_analysis?.status ===
              'unavailable' && (
              <p>Weather forecast unavailable for this route.</p>
            )}
          </div>
        )}

        {result &&
          selectedRoute?.weather_analysis?.status === 'available' && (
            <div
              className="weather-map-legend"
              aria-label="Weather risk map legend"
            >
              <div className="weather-map-legend-title">
                <Wind size={15} />
                WEATHER RISK
              </div>

              <div className="weather-map-legend-items">
                {riskLevels.map(level => (
                  <span key={level}>
                    <i
                      style={{
                        backgroundColor: riskColors[level],
                      }}
                    />
                    {level}
                  </span>
                ))}
              </div>
            </div>
          )}
      </main>
    </div>
  )
}
