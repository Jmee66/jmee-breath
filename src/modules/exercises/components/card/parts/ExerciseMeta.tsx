import { Clock, RotateCcw } from 'lucide-react'

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m === 0) return `${s}s`
  if (s === 0) return `${m}min`
  return `${m}min ${s}s`
}

interface Props {
  repetitions: number
  totalSeconds: number
}

export function ExerciseMeta({ repetitions, totalSeconds }: Props) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex items-center gap-1 text-xs text-text-secondary">
        <RotateCcw size={12} />
        {repetitions}×
      </span>
      <span className="flex items-center gap-1 text-xs text-text-secondary">
        <Clock size={12} />
        {formatDuration(totalSeconds)}
      </span>
    </div>
  )
}
