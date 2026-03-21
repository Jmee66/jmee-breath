import { BreathCircle } from './BreathCircle'
import { ProgressArc } from './ProgressArc'

// Doit être >= BASE_SIZE (160px) × scale max (1.0) + marge arc + stroke
const CONTAINER_SIZE = 220

/**
 * Composant visuel principal — empile l'arc SVG (fond) et le cercle (premier plan).
 */
export function BreathVisual() {
  return (
    <div
      style={{
        position: 'relative',
        width: CONTAINER_SIZE,
        height: CONTAINER_SIZE,
        flexShrink: 0,
      }}
    >
      <ProgressArc />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <BreathCircle />
      </div>
    </div>
  )
}
