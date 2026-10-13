import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type {
  RiskLevel,
  RouteOption,
  RouteResult,
  WeatherCheckpoint,
} from '../../services/api'
import type { WeatherTimelineFrame } from '../../services/weather'
import type { ActiveCorridorSample } from '../../hooks/useCorridorWeather'
import { addCorridorMarkers } from './corridorMarkers'
import { CorridorLegend } from './CorridorLegend'
import './CorridorLegend.css'

type RouteMapProps = {
  result?: RouteResult | null
  selectedRouteId?: string | null
  onSelectRoute?: (id: string) => void
  timelineFrame?: WeatherTimelineFrame | null
  timelineLocation?: {
    latitude: number
    longitude: number
  } | null
  corridorSamples?: ActiveCorridorSample[]
}

const routeColors = ['#AEE033', '#02AAB0', '#F59E0B']

const riskColors: Record<RiskLevel, string> = {
  Low: '#AEE033',
  Moderate: '#FACC15',
  High: '#FB923C',
  Severe: '#EF4444',
  'No Travel': '#A855F7',
}

const riskScores: Record<RiskLevel, number> = {
  Low: 0,
  Moderate: 1,
  High: 2,
  Severe: 3,
  'No Travel': 4,
}

function distanceMiles(a: number[], b: number[]) {
  const radians = Math.PI / 180
  const latA = a[1] * radians
  const latB = b[1] * radians
  const latDifference = (b[1] - a[1]) * radians
  const lonDifference = (b[0] - a[0]) * radians

  const value =
    Math.sin(latDifference / 2) ** 2 +
    Math.cos(latA) *
      Math.cos(latB) *
      Math.sin(lonDifference / 2) ** 2

  return (
    3958.7613 *
    2 *
    Math.atan2(
      Math.sqrt(value),
      Math.sqrt(Math.max(0, 1 - value))
    )
  )
}

function routeDistances(coordinates: number[][]) {
  const distances = [0]

  for (let index = 1; index < coordinates.length; index++) {
    distances.push(
      distances[index - 1] +
        distanceMiles(coordinates[index - 1], coordinates[index])
    )
  }

  return distances
}

function pointAtDistance(
  coordinates: number[][],
  distances: number[],
  target: number
): number[] {
  if (target <= 0) return [...coordinates[0]]

  const total = distances[distances.length - 1]

  if (target >= total) {
    return [...coordinates[coordinates.length - 1]]
  }

  let low = 1
  let high = distances.length - 1

  while (low < high) {
    const middle = Math.floor((low + high) / 2)

    if (distances[middle] < target) {
      low = middle + 1
    } else {
      high = middle
    }
  }

  const index = low
  const start = distances[index - 1]
  const end = distances[index]
  const fraction =
    end === start ? 0 : (target - start) / (end - start)

  const a = coordinates[index - 1]
  const b = coordinates[index]

  return [
    a[0] + (b[0] - a[0]) * fraction,
    a[1] + (b[1] - a[1]) * fraction,
  ]
}

function segmentCoordinates(
  coordinates: number[][],
  distances: number[],
  start: number,
  end: number
) {
  const segment = [pointAtDistance(coordinates, distances, start)]

  for (let index = 1; index < coordinates.length - 1; index++) {
    if (distances[index] > start && distances[index] < end) {
      segment.push(coordinates[index])
    }
  }

  segment.push(pointAtDistance(coordinates, distances, end))
  return segment
}

function checkpointFraction(
  route: RouteOption,
  index: number,
  count: number,
  spacing: number
) {
  if (route.distance_miles <= 0 || count < 2) return 0

  const miles =
    index === count - 1
      ? route.distance_miles
      : Math.min(index * spacing, route.distance_miles)

  return Math.max(0, Math.min(1, miles / route.distance_miles))
}

function createRouteData(result?: RouteResult | null) {
  return {
    type: 'FeatureCollection' as const,
    features: (result?.routes ?? []).map((route, index) => ({
      type: 'Feature' as const,
      properties: {
        id: route.id,
        index,
      },
      geometry: route.geometry,
    })),
  }
}

function createRiskData(result?: RouteResult | null) {
  const features: Array<{
    type: 'Feature'
    properties: {
      routeId: string
      level: RiskLevel
      color: string
    }
    geometry: {
      type: 'LineString'
      coordinates: number[][]
    }
  }> = []

  for (const route of result?.routes ?? []) {
    const analysis = route.weather_analysis

    if (
      analysis?.status !== 'available' ||
      analysis.checkpoints.length < 2 ||
      route.geometry.coordinates.length < 2 ||
      route.distance_miles <= 0
    ) {
      continue
    }

    const coordinates = route.geometry.coordinates
    const distances = routeDistances(coordinates)
    const geometryDistance = distances[distances.length - 1]

    if (geometryDistance <= 0) continue

    const checkpoints = analysis.checkpoints

    for (let index = 0; index < checkpoints.length - 1; index++) {
      const start = checkpoints[index]
      const end = checkpoints[index + 1]

      const startDistance =
        (index === 0
          ? 0
          : checkpointFraction(
              route,
              index,
              checkpoints.length,
              result!.journey.checkpoint_interval_miles
            )) * geometryDistance

      const endDistance =
        (index === checkpoints.length - 2
          ? 1
          : checkpointFraction(
              route,
              index + 1,
              checkpoints.length,
              result!.journey.checkpoint_interval_miles
            )) * geometryDistance

      if (endDistance <= startDistance) continue

      const level =
        riskScores[start.risk.level] >= riskScores[end.risk.level]
          ? start.risk.level
          : end.risk.level

      features.push({
        type: 'Feature',
        properties: {
          routeId: route.id,
          level,
          color: riskColors[level],
        },
        geometry: {
          type: 'LineString',
          coordinates: segmentCoordinates(
            coordinates,
            distances,
            startDistance,
            endDistance
          ),
        },
      })
    }
  }

  return {
    type: 'FeatureCollection' as const,
    features,
  }
}

function formatWeather(value: number | null, unit: string) {
  return value === null ? 'Unavailable' : `${value} ${unit}`
}

function popupContent(checkpoint: WeatherCheckpoint) {
  const element = document.createElement('div')
  element.className = 'weather-map-popup'

  const title = document.createElement('strong')
  title.textContent = checkpoint.risk.level
  title.style.color = riskColors[checkpoint.risk.level]

  const arrival = document.createElement('span')
  arrival.textContent =
    `Arrival: ${new Date(checkpoint.arrival_time).toLocaleString()}`

  const wind = document.createElement('span')
  wind.textContent = `Wind gust: ${formatWeather(
    checkpoint.weather.wind_gust_mph,
    'mph'
  )}`

  const rain = document.createElement('span')
  rain.textContent = `Rain: ${formatWeather(
    checkpoint.weather.rain_inches_per_hour,
    'in/hr'
  )}`

  const snow = document.createElement('span')
  snow.textContent = `Snow: ${formatWeather(
    checkpoint.weather.snowfall_inches_per_hour,
    'in/hr'
  )}`

  const reasons = document.createElement('small')
  reasons.textContent = checkpoint.risk.reasons.join(' ')

  element.append(title, arrival, wind, rain, snow, reasons)
  return element
}

function timelinePopup(frame: WeatherTimelineFrame) {
  const element = document.createElement('div')
  element.className = 'weather-map-popup'

  const heading = document.createElement('strong')
  heading.textContent = 'Origin point forecast'

  const time = document.createElement('span')
  time.textContent = new Date(frame.forecast_time).toLocaleString()

  const wind = document.createElement('span')
  wind.textContent = `Wind gusts: ${formatWeather(
    frame.weather.wind_gust_mph,
    'mph'
  )}`

  const rain = document.createElement('span')
  rain.textContent = `Rain: ${formatWeather(
    frame.weather.rain_inches_per_hour,
    'in/hr'
  )}`

  const snow = document.createElement('span')
  snow.textContent = `Snow: ${formatWeather(
    frame.weather.snowfall_inches_per_hour,
    'in/hr'
  )}`

  const source = document.createElement('small')
  source.textContent =
    'Open-Meteo point forecast, not corridor-wide conditions.'

  element.append(heading, time, wind, rain, snow, source)
  return element
}

export function RouteMap({
  result,
  selectedRouteId,
  onSelectRoute,
  timelineFrame,
  timelineLocation,
  corridorSamples = [],
}: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const timelineMarkerRef = useRef<maplibregl.Marker | null>(null)
  const corridorMarkersRef = useRef<maplibregl.Marker[]>([])
  const onSelectRef = useRef(onSelectRoute)
  const resultRef = useRef(result)
  const [mapReady, setMapReady] = useState(false)

  useEffect(() => {
    onSelectRef.current = onSelectRoute
    resultRef.current = result
  }, [onSelectRoute, result])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const map = new maplibregl.Map({
      container,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: [
              'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            ],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
          },
        },
        layers: [
          {
            id: 'osm',
            type: 'raster',
            source: 'osm',
          },
        ],
      },
      center: [-96, 38],
      zoom: 3.5,
      attributionControl: false,
    })

    mapRef.current = map

    map.addControl(
      new maplibregl.NavigationControl({
        showCompass: false,
      }),
      'bottom-right'
    )

    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
      }),
      'bottom-left'
    )

    const handleLoad = () => {
      map.addSource('journey-routes', {
        type: 'geojson',
        data: createRouteData(resultRef.current),
      })

      map.addSource('journey-risks', {
        type: 'geojson',
        data: createRiskData(resultRef.current),
      })

      for (let index = 0; index < 3; index++) {
        const filter: maplibregl.FilterSpecification = [
          '==',
          ['get', 'index'],
          index,
        ]

        map.addLayer({
          id: `route-${index}-outline`,
          type: 'line',
          source: 'journey-routes',
          filter,
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': '#092B2B',
            'line-width': 12,
            'line-opacity': 0.85,
          },
        })

        const layerId = `route-${index}-line`

        map.addLayer({
          id: layerId,
          type: 'line',
          source: 'journey-routes',
          filter,
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': routeColors[index],
            'line-width': 7,
            'line-opacity': 1,
          },
        })

        map.on('click', layerId, event => {
          const id = event.features?.[0]?.properties?.id
          if (typeof id === 'string') {
            onSelectRef.current?.(id)
          }
        })

        map.on('mouseenter', layerId, () => {
          map.getCanvas().style.cursor = 'pointer'
        })

        map.on('mouseleave', layerId, () => {
          map.getCanvas().style.cursor = ''
        })
      }

      map.addLayer({
        id: 'route-risk-outline',
        type: 'line',
        source: 'journey-risks',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#092B2B',
          'line-width': 11,
          'line-opacity': 0.8,
        },
      })

      map.addLayer({
        id: 'route-risk-line',
        type: 'line',
        source: 'journey-risks',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 7,
          'line-opacity': 1,
        },
      })

      map.on('click', 'route-risk-line', event => {
        const id = event.features?.[0]?.properties?.routeId
        if (typeof id === 'string') {
          onSelectRef.current?.(id)
        }
      })

      map.on('mouseenter', 'route-risk-line', () => {
        map.getCanvas().style.cursor = 'pointer'
      })

      map.on('mouseleave', 'route-risk-line', () => {
        map.getCanvas().style.cursor = ''
      })

      map.resize()
      setMapReady(true)
    }

    map.on('load', handleLoad)

    const observer = new ResizeObserver(() => {
      map.resize()
    })

    observer.observe(container)

    return () => {
      observer.disconnect()
      map.off('load', handleLoad)

      timelineMarkerRef.current?.remove()
      timelineMarkerRef.current = null

      corridorMarkersRef.current.forEach(marker => marker.remove())
      corridorMarkersRef.current = []

      markersRef.current.forEach(marker => marker.remove())
      markersRef.current = []

      mapRef.current = null
      map.remove()
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    const routesSource = map.getSource(
      'journey-routes'
    ) as maplibregl.GeoJSONSource | undefined

    const risksSource = map.getSource(
      'journey-risks'
    ) as maplibregl.GeoJSONSource | undefined

    routesSource?.setData(createRouteData(result))
    risksSource?.setData(createRiskData(result))

    markersRef.current.forEach(marker => marker.remove())
    markersRef.current = []

    if (!result || result.routes.length === 0) return

    const endpoints = [
      {
        coordinates: [
          result.origin.longitude,
          result.origin.latitude,
        ] as [number, number],
        color: '#092B2B',
      },
      {
        coordinates: [
          result.destination.longitude,
          result.destination.latitude,
        ] as [number, number],
        color: '#AEE033',
      },
    ]

    endpoints.forEach(point => {
      const marker = new maplibregl.Marker({
        color: point.color,
        scale: 1.15,
      })
        .setLngLat(point.coordinates)
        .addTo(map)

      markersRef.current.push(marker)
    })

    const bounds = new maplibregl.LngLatBounds()

    result.routes.forEach(route => {
      route.geometry.coordinates.forEach(coordinate => {
        if (
          coordinate.length >= 2 &&
          Number.isFinite(coordinate[0]) &&
          Number.isFinite(coordinate[1])
        ) {
          bounds.extend([coordinate[0], coordinate[1]])
        }
      })
    })

    if (!bounds.isEmpty()) {
      map.resize()
      map.fitBounds(bounds, {
        padding: {
          top: 110,
          bottom: 110,
          left: 90,
          right: 90,
        },
        maxZoom: 11,
        duration: 900,
      })
    }
  }, [result, mapReady])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    const activeId =
      selectedRouteId ?? result?.routes[0]?.id ?? null

    const selectedIndex =
      result?.routes.findIndex(route => route.id === activeId) ?? -1

    for (let index = 0; index < 3; index++) {
      const lineId = `route-${index}-line`
      const outlineId = `route-${index}-outline`

      if (!map.getLayer(lineId)) continue

      const isSelected = index === selectedIndex
      const hasSelection = selectedIndex !== -1

      map.setPaintProperty(
        lineId,
        'line-width',
        hasSelection ? (isSelected ? 8 : 4) : 7
      )

      map.setPaintProperty(
        lineId,
        'line-opacity',
        hasSelection ? (isSelected ? 1 : 0.45) : 1
      )

      map.setPaintProperty(
        outlineId,
        'line-width',
        hasSelection ? (isSelected ? 13 : 8) : 12
      )

      map.setPaintProperty(
        outlineId,
        'line-opacity',
        hasSelection ? (isSelected ? 0.9 : 0.35) : 0.85
      )

      if (isSelected) {
        map.moveLayer(outlineId)
        map.moveLayer(lineId)
      }
    }

    const riskFilter: maplibregl.FilterSpecification =
      activeId === null
        ? ['==', ['get', 'routeId'], '']
        : ['==', ['get', 'routeId'], activeId]

    map.setFilter('route-risk-line', riskFilter)
    map.setFilter('route-risk-outline', riskFilter)

    if (activeId !== null) {
      map.moveLayer('route-risk-outline')
      map.moveLayer('route-risk-line')
    }

    markersRef.current = markersRef.current.filter(marker => {
      const checkpointMarker = marker as maplibregl.Marker & {
        weatherCheckpoint?: boolean
      }

      if (checkpointMarker.weatherCheckpoint) {
        marker.remove()
        return false
      }

      return true
    })

    const route = result?.routes.find(item => item.id === activeId)
    const analysis = route?.weather_analysis

    if (analysis?.status !== 'available') return

    for (const checkpoint of analysis.checkpoints) {
      const element = document.createElement('button')
      element.type = 'button'
      element.className = 'weather-checkpoint-marker'

      element.style.setProperty(
        '--checkpoint-color',
        riskColors[checkpoint.risk.level]
      )

      element.title = `${checkpoint.risk.level} weather risk`

      element.setAttribute(
        'aria-label',
        `Weather checkpoint: ${checkpoint.risk.level} risk`
      )

      const marker = new maplibregl.Marker({
        element,
        anchor: 'center',
      })
        .setLngLat([
          checkpoint.longitude,
          checkpoint.latitude,
        ])
        .setPopup(
          new maplibregl.Popup({
            offset: 16,
            closeButton: true,
            maxWidth: '270px',
          }).setDOMContent(popupContent(checkpoint))
        )
        .addTo(map)

      const taggedMarker = marker as maplibregl.Marker & {
        weatherCheckpoint?: boolean
      }

      taggedMarker.weatherCheckpoint = true
      markersRef.current.push(marker)
    }
  }, [result, selectedRouteId, mapReady])

  useEffect(() => {
    const map = mapRef.current

    timelineMarkerRef.current?.remove()
    timelineMarkerRef.current = null

    if (
      !map ||
      !mapReady ||
      !timelineFrame ||
      !timelineLocation
    ) {
      return
    }

    const element = document.createElement('button')
    element.type = 'button'
    element.className = 'timeline-map-marker'
    element.textContent = 'FORECAST'
    element.title = 'View hourly forecast at route origin'

    element.setAttribute(
      'aria-label',
      'Hourly forecast at route origin'
    )

    const marker = new maplibregl.Marker({
      element,
      anchor: 'bottom',
      offset: [0, -18],
    })
      .setLngLat([
        timelineLocation.longitude,
        timelineLocation.latitude,
      ])
      .setPopup(
        new maplibregl.Popup({
          offset: 22,
          maxWidth: '290px',
        }).setDOMContent(timelinePopup(timelineFrame))
      )
      .addTo(map)

    timelineMarkerRef.current = marker

    return () => {
      marker.remove()

      if (timelineMarkerRef.current === marker) {
        timelineMarkerRef.current = null
      }
    }
  }, [
    mapReady,
    timelineFrame,
    timelineLocation?.latitude,
    timelineLocation?.longitude,
  ])

  useEffect(() => {
    corridorMarkersRef.current.forEach(marker => marker.remove())
    corridorMarkersRef.current = []

    const map = mapRef.current

    if (!map || !mapReady || corridorSamples.length === 0) {
      return
    }

    const markers = addCorridorMarkers(map, corridorSamples)
    corridorMarkersRef.current = markers

    return () => {
      markers.forEach(marker => marker.remove())

      if (corridorMarkersRef.current === markers) {
        corridorMarkersRef.current = []
      }
    }
  }, [mapReady, corridorSamples])

  return (
    <div className="route-map">
      <div ref={containerRef} className="route-map-canvas" />
    <CorridorLegend visible={corridorSamples.length > 0} />
    </div>
  )
}
