import { useEffect } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { initAuth } from '../services/authService'

export function AuthGuard() {
  const { isAuthenticated, isLoading } = useAuthStore()

  useEffect(() => {
    const unsub = initAuth()
    return unsub
  }, [])

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg-base">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    )
  }

  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />
}
