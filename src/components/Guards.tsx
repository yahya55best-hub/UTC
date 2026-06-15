import type { ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthProvider'
import { Spinner } from './ui'
import { LanguageToggle } from './LanguageToggle'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading, profile } = useAuth()
  if (loading) return <Spinner />
  if (!session) return <Navigate to="/login" replace />
  // Wait for the profile before deciding (avoids flashing the app to a pending user).
  if (!profile) return <Spinner />
  // Pending approval: signed up but not yet activated by an admin.
  if (profile.active === false) return <PendingApproval />
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

function PendingApproval() {
  const { t } = useTranslation()
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FAF9F6] p-4">
      <div className="w-full max-w-md text-center">
        <img src="/logo.png" alt="UTC" className="mx-auto mb-6 w-56 max-w-full" onError={(e) => { e.currentTarget.src = '/logo.svg' }} />
        <div className="card p-8">
          <div className="mb-3 text-4xl">⏳</div>
          <h1 className="mb-2 text-xl font-bold text-ink">{t('auth.pendingTitle')}</h1>
          <p className="text-sm text-ink-muted">{t('auth.pendingBody')}</p>
          <p className="mt-2 text-xs text-ink-muted">{profile?.email}</p>
          <button
            className="btn-ghost mt-5"
            onClick={async () => {
              await signOut()
              navigate('/login')
            }}
          >
            {t('common.logout')}
          </button>
        </div>
        <div className="mt-4 flex justify-center">
          <LanguageToggle />
        </div>
      </div>
    </div>
  )
}
