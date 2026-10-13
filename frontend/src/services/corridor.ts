
import type { RouteOption, WeatherReading } from './api'

export type WeatherIntensity =
  | 'Light'
  | 'Moderate'
  | 'Heavy'
  | 'Extreme'
  | 'Unavailable'

export type CorridorFrame = {
  forecast_time: string
  weather: WeatherReading
  intensity: WeatherIntensity
}

export type CorridorSample = {
  id: string
  index: number
  fraction: number
  distance_miles: number
  latitude: number
  longitude: number
  frames: CorridorFrame[]
}

export type CorridorWeather = {
  start_time: string
  end_time: string
  duration_hours: number
  frame_count: number
  sample_count: number
  samples: CorridorSample[]
  provider: string
  methodology: {
    sampling: string
    forecast_interval: string
    intensity: string
    spatial_coverage: string
  }
}

export type CorridorRequest = {
  geometry: RouteOption['geometry']
  start_time: string
  hours?: number
  sample_count?: number
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'

export async function fetchCorridorWeather(
  request: CorridorRequest,
  signal?: AbortSignal
): Promise<CorridorWeather> {
  let response: Response

  try {
    response = await fetch(`${API_BASE_URL}/api/weather/corridor/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        geometry: request.geometry,
        start_time: request.start_time,
        hours: request.hours ?? 48,
        sample_count: request.sample_count ?? 7,
      }),
      signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error
    }

    throw new Error(
      'Cannot reach the weather server. Check that Django is running.'
    )
  }

  let data: CorridorWeather & { error?: string }

  try {
    data = await response.json()
  } catch {
    throw new Error('The weather server returned an invalid response.')
  }

  if (!response.ok) {
    throw new Error(
      data.error || 'Unable to retrieve corridor weather forecasts.'
    )
  }

  return data
}
