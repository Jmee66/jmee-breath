import type { ReactNode } from 'react'

interface PageContainerProps {
  title?: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
}

export function PageContainer({ title, subtitle, actions, children }: PageContainerProps) {
  return (
    <div className="space-y-6">
      {(title || actions) && (
        <div className="flex items-start justify-between">
          <div>
            {title && (
              <h1 className="text-xl font-semibold text-text-primary">{title}</h1>
            )}
            {subtitle && (
              <p className="mt-1 text-sm text-text-secondary">{subtitle}</p>
            )}
          </div>
          {actions && <div className="flex-shrink-0">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  )
}
