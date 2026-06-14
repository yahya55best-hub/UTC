import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthProvider'
import { Spinner } from './ui'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <Spinner />
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { loading, isAdmin } = useAuth()
  const { t } = useTranslation()
  if (loading) return <Spinner />
  if (!isAdmin) {
    return (
      <div className="card p-10 text-center text-sm text-ink-muted">{t('admin.salesNoAccess')}</div>
    )
  }
  return <>{children}</>
}
