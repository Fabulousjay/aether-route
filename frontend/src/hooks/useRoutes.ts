
import { useEffect, useRef, useState } from 'react'
import {
  fetchRoutes,
  type RouteResult,
  type TripDetails,
} from '../services/api'

export function useRoutes() {
  const [result, setResult] = useState<RouteResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => controllerRef.current?.abort()
  }, [])

  async function calculateRoutes(trip: TripDetails) {
    controllerRef.current?.abort()

    const controller = new AbortController()
    controllerRef.current = controller

    setLoading(true)
    setError('')
    setResult(null)

    try {
      const data = await fetchRoutes(trip, controller.signal)

      if (!controller.signal.aborted) {
        setResult(data)
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setError(
          error instanceof Error
            ? error.message
            : 'Something went wrong.'
        )
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false)
      }
    }
  }

  function clearRoutes() {
    controllerRef.current?.abort()
    setResult(null)
    setError('')
    setLoading(false)
  }

  return {
    result,
    loading,
    error,
    calculateRoutes,
    clearRoutes,
  }
}
