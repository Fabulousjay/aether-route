
import { useEffect, useState } from 'react'
import {
  fetchWeatherTimeline,
  type WeatherTimeline,
} from '../services/weather'

type TimelineLocation = {
  latitude: number
  longitude: number
  startTime: string
}

export function useWeatherTimeline(
  location: TimelineLocation | null
) {
  const [timeline, setTimeline] = useState<WeatherTimeline | null>(null)
  const [selectedHour, setSelectedHour] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const latitude = location?.latitude
  const longitude = location?.longitude
  const startTime = location?.startTime

  useEffect(() => {
    if (
      latitude === undefined ||
      longitude === undefined ||
      !startTime
    ) {
      return
    }

    const controller = new AbortController()
    let active = true

    async function load() {
      setLoading(true)
      setError(null)
      setTimeline(null)
      setSelectedHour(0)

      try {
        const data = await fetchWeatherTimeline(
          {
            latitude: latitude!,
            longitude: longitude!,
            startTime: startTime!,
            hours: 48,
          },
          controller.signal
        )

        if (active) {
          setTimeline(data)
        }
      } catch (caught) {
        if (
          active &&
          !(caught instanceof Error && caught.name === 'AbortError')
        ) {
          setError(
            caught instanceof Error
              ? caught.message
              : 'Unable to load weather forecasts.'
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
  }, [latitude, longitude, startTime])

  const selectedFrame =
    timeline?.frames[selectedHour] ?? null

  return {
    timeline,
    selectedHour,
    setSelectedHour,
    selectedFrame,
    loading,
    error,
  }
}
