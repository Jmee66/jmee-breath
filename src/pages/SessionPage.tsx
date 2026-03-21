import { useNavigate, useLocation } from 'react-router-dom'
import { BreathScreen } from '@modules/breath-engine'
import type { Exercise } from '@core/types'

export default function SessionPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const exercise = (location.state as { exercise?: Exercise })?.exercise

  if (!exercise) {
    navigate('/exercises', { replace: true })
    return null
  }

  return (
    <BreathScreen
      exercise={exercise}
      onComplete={() => navigate('/exercises', { replace: true })}
      onExit={() => navigate(-1)}
    />
  )
}
