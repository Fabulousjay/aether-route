
export type TripDetails = {
  origin: string
  destination: string
  departure: string
  weight: string
  interval: string
}

export type RiskLevel =
  | 'Low'
  | 'Moderate'
  | 'High'
  | 'Severe'
  | 'No Travel'

export type WeatherReading = {
  wind_gust_mph: number | null
  precipitation_inches_per_hour: number | null
  rain_inches_per_hour: number | null
  snowfall_inches_per_hour: number | null
}

export type FreightRisk = {
  level: RiskLevel
  score: number
  categories: {
    wind: RiskLevel
    rain: RiskLevel
    snow: RiskLevel
  }
  primary_hazards: string[]
  reasons: string[]
  travel_advised: boolean
  weight_lbs: number
}

export type WeatherCheckpoint = {
  checkpoint_id: string
  latitude: number
  longitude: number
  arrival_time: string
  forecast_time: string
  weather: WeatherReading
  provider: string
  risk: FreightRisk
}

export type RiskSummary = {
  overall_level: RiskLevel
  highest_score: number
  average_checkpoint_score: number
  checkpoint_count: number
  counts: Record<RiskLevel, number>
  has_no_travel: boolean
  has_severe: boolean
}

export type WeatherAnalysis = {
  status: 'available' | 'unavailable'
  reason: string | null
  checkpoint_count: number
  checkpoints: WeatherCheckpoint[]
  summary: RiskSummary | null
  risk_miles: Record<RiskLevel, number> | null
  methodology?: {
    forecast_matching: string
    arrival_estimation: string
    segment_risk: string
    risk_mileage: string
  }
}

export type RouteOption = {
  id: string
  name: string
  distance_miles: number
  duration_minutes: number
  geometry: {
    type: 'LineString'
    coordinates: number[][]
  }
  weather_analysis?: WeatherAnalysis
}

export type RouteRecommendation = {
  route_id: string
  risk_level: RiskLevel
  travel_advised: boolean
  reason: string
  evaluated_route_count: number
  all_routes_evaluated: boolean
}

export type RouteResult = {
  origin: {
    name: string
    latitude: number
    longitude: number
  }
  destination: {
    name: string
    latitude: number
    longitude: number
  }
  routes: RouteOption[]
  route_count: number
  provider: string
  truck_routing: boolean
  journey: {
    departure: string
    weight_lb: number
    checkpoint_interval_miles: number
  }
  recommendation?: RouteRecommendation | null
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'

function departureWithTimezone(value: string): string {
  if (/Z$|[+-]\d{2}:\d{2}$/.test(value)) {
    return value
  }

  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
  )

  if (!match) {
    throw new Error('Select a valid departure date and time.')
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6] ?? '0')

  const date = new Date(
    year,
    month - 1,
    day,
    hour,
    minute,
    second
  )

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute ||
    date.getSeconds() !== second
  ) {
    throw new Error('Select a valid departure date and time.')
  }

  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const absoluteOffset = Math.abs(offsetMinutes)
  const offsetHours = String(
    Math.floor(absoluteOffset / 60)
  ).padStart(2, '0')
  const offsetRemainder = String(
    absoluteOffset % 60
  ).padStart(2, '0')

  return `${value}${sign}${offsetHours}:${offsetRemainder}`
}

export async function fetchRoutes(
  trip: TripDetails,
  signal?: AbortSignal
): Promise<RouteResult> {
  const payload = {
    ...trip,
    departure: departureWithTimezone(trip.departure),
  }

  let response: Response

  try {
    response = await fetch(`${API_BASE_URL}/api/routes/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error
    }

    throw new Error(
      'Cannot reach the routing server. Check that Django is running.'
    )
  }

  let data: RouteResult & { error?: string }

  try {
    data = await response.json()
  } catch {
    throw new Error('The routing server returned an invalid response.')
  }

  if (!response.ok) {
    throw new Error(data.error || 'Unable to calculate routes.')
  }

  return data
}
