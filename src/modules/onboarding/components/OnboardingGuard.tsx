import { useEffect } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useOnboardingStore } from '../store/onboardingStore'

export function OnboardingGuard() {
  const { isCompleted, isLoading, load } = useOnboardingStore()

  useEffect(() => {
    void load()
  }, [load])

  if (isLoading) return null

  return isCompleted ? <Outlet /> : <Navigate to="/onboarding" replace />
}
