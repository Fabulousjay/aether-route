
import type { WeatherReading } from './api'

export type WeatherTimelineFrame = {
  forecast_time: string
  weather: WeatherReading
}

export type WeatherTimeline = {
  latitude: number
  longitude: number
  start_time: string
  end_time: string
  duration_hours: number
  forecast_interval: string
  frames: WeatherTimelineFrame[]
  frame_count: number
  provider: string
}

export type WeatherTimelineRequest = {
  latitude: number
  longitude: number
  startTime: string
  hours?: number
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'

export async function fetchWeatherTimeline(
  request: WeatherTimelineRequest,
  signal?: AbortSignal
): Promise<WeatherTimeline> {
  const params = new URLSearchParams({
    latitude: String(request.latitude),
    longitude: String(request.longitude),
    start_time: request.startTime,
    hours: String(request.hours ?? 48),
  })

  let response: Response

  try {
    response = await fetch(
      `${API_BASE_URL}/api/weather/timeline/?${params.toString()}`,
      { signal }
    )
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error
    }

    throw new Error(
      'Cannot reach the weather server. Check that Django is running.'
    )
  }

  let data: WeatherTimeline & { error?: string }

  try {
    data = await response.json()
  } catch {
    throw new Error('The weather server returned an invalid response.')
  }

  if (!response.ok) {
    throw new Error(data.error || 'Unable to retrieve weather timeline.')
  }

  return data
}
