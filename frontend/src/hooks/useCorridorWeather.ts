import { useEffect, useState } from 'react'
import type { RouteOption } from '../services/api'
import type { WeatherTimelineFrame } from '../services/weather'
import {
  fetchCorridorWeather,
  type CorridorSample,
  type CorridorWeather,
} from '../services/corridor'

type CorridorSelection = {
  route: RouteOption
  startTime: string
}

export type ActiveCorridorSample = Omit<CorridorSample, 'frames'> & {
  frame: CorridorSample['frames'][number] | null
}

function getForecastTimestamp(value: string) {
  const timestamp = new Date(value).getTime()

  return Number.isFinite(timestamp) ? timestamp : null
}

function findMatchingFrame(
  frames: CorridorSample['frames'],
  forecastTime: string | null
) {
  if (!forecastTime) {
    return null
  }

  const targetTimestamp = getForecastTimestamp(forecastTime)

  if (targetTimestamp === null) {
    return null
  }

  return (
    frames.find(frame => {
      const frameTimestamp = getForecastTimestamp(
        frame.forecast_time
      )

      return frameTimestamp === targetTimestamp
    }) ?? null
  )
}

export function useCorridorWeather(
  selection: CorridorSelection | null,
  selectedFrame: WeatherTimelineFrame | null
) {
  const [corridor, setCorridor] = useState<CorridorWeather | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const route = selection?.route
  const startTime = selection?.startTime

  useEffect(() => {
    if (!route || !startTime) {
      setCorridor(null)
      setLoading(false)
      setError(null)
      return
    }

    const controller = new AbortController()
    let active = true

    setCorridor(null)
    setLoading(true)
    setError(null)

    async function load() {
      try {
        const data = await fetchCorridorWeather(
          {
            geometry: route!.geometry,
            start_time: startTime!,
            hours: 48,
            sample_count: 7,
          },
          controller.signal
        )

        if (active) {
          setCorridor(data)
        }
      } catch (caught) {
        if (
          active &&
          !(caught instanceof Error && caught.name === 'AbortError')
        ) {
          setError(
            caught instanceof Error
              ? caught.message
              : 'Unable to load corridor forecasts.'
          )
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      active = false
      controller.abort()
    }
  }, [route, startTime])

  const activeSamples: ActiveCorridorSample[] =
    corridor?.samples.map(({ frames, ...sample }) => ({
      ...sample,
      frame: findMatchingFrame(
        frames,
        selectedFrame?.forecast_time ?? null
      ),
    })) ?? []

  return {
    corridor,
    activeSamples,
    loading,
    error,
  }
}