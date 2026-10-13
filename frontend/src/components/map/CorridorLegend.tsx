type CorridorLegendProps = {
  visible: boolean
}

const intensityLevels = [
  { label: 'Light', color: '#AEE033' },
  { label: 'Moderate', color: '#FACC15' },
  { label: 'Heavy', color: '#FB923C' },
  { label: 'Extreme', color: '#EF4444' },
  { label: 'Unavailable', color: '#94A3B8' },
]

export function CorridorLegend({ visible }: CorridorLegendProps) {
  if (!visible) return null

  return (
    <section
      className="corridor-legend"
      aria-label="Corridor forecast intensity legend"
    >
      <div className="corridor-legend-heading">
        <span className="corridor-legend-symbol">◉</span>
        <strong>CORRIDOR FORECAST</strong>
      </div>

      <div className="corridor-legend-items">
        {intensityLevels.map(level => (
          <span className="corridor-legend-item" key={level.label}>
            <span
              className="corridor-legend-dot"
              style={{ backgroundColor: level.color }}
            />
            {level.label}
          </span>
        ))}
      </div>

      <p>
        Numbered markers show weather intensity at the selected
        forecast hour.
      </p>
    </section>
  )
}