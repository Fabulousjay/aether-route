import type * as maplibregl from 'maplibre-gl'
import type { ActiveCorridorSample } from '../../hooks/useCorridorWeather'

type HeatmapFeature = {
  type: 'Feature'
  properties: { intensity: number }
  geometry: {
    type: 'Point'
    coordinates: [number, number]
  }
}

const intensityWeights: Record<string, number> = {
  Light: 0.25,
  Moderate: 0.5,
  Heavy: 0.75,
  Extreme: 1,
}

export function createCorridorHeatmapData(samples: ActiveCorridorSample[]) {
  const features: HeatmapFeature[] = samples.flatMap(sample => {
    const intensity = intensityWeights[sample.frame?.intensity ?? '']

    if (
      intensity === undefined ||
      !Number.isFinite(sample.longitude) ||
      !Number.isFinite(sample.latitude)
    ) {
      return []
    }

    return [{
      type: 'Feature' as const,
      properties: { intensity },
      geometry: {
        type: 'Point' as const,
        coordinates: [sample.longitude, sample.latitude] as [number, number],
      },
    }]
  })

  return {
    type: 'FeatureCollection' as const,
    features,
  }
}

export const corridorHeatmapLayer: maplibregl.HeatmapLayerSpecification = {
  id: 'corridor-weather-heatmap',
  type: 'heatmap',
  source: 'corridor-heatmap',
  paint: {
    'heatmap-weight': ['get', 'intensity'],
    'heatmap-intensity': [
      'interpolate', ['linear'], ['zoom'],
      3, 0.8,
      9, 1.3,
    ],
    'heatmap-radius': [
      'interpolate', ['linear'], ['zoom'],
      3, 18,
      7, 35,
      11, 55,
    ],
    'heatmap-opacity': 0.48,
    'heatmap-color': [
      'interpolate', ['linear'], ['heatmap-density'],
      0, 'rgba(174,224,51,0)',
      0.15, 'rgba(174,224,51,0.35)',
      0.35, '#AEE033',
      0.55, '#FACC15',
      0.75, '#FB923C',
      1, '#EF4444',
    ],
  },
}