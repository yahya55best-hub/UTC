import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthProvider'
import { isConfigured } from '../lib/supabase'
import { LanguageToggle } from '../components/LanguageToggle'

export function LoginPage() {
  const { t } = useTranslation()
  const { session, signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to="/" replace />

  if (!isConfigured) {
    return (
      <Shell>
        <h1 className="mb-2 text-lg font-bold text-ink">{t('auth.configTitle')}</h1>
        <p className="text-sm text-ink-muted">{t('auth.configBody')}</p>
      </Shell>
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setBusy(true)
    try {
      if (mode === 'login') {
        const { error } = await signIn(email, password)
        if (error) setError(t('auth.invalid'))
      } else {
        const { error, needsConfirmation } = await signUp(email, password, displayName)
        if (error) {
          setError(/domain/i.test(error) ? t('auth.signupRejected') : error)
        } else if (needsConfirmation) {
          setInfo(t('auth.checkEmail'))
          setMode('login')
        }
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell>
      <h1 className="mb-1 text-xl font-bold text-ink">
        {mode === 'login' ? t('auth.loginTitle') : t('auth.signupTitle')}
      </h1>
      <p className="mb-5 text-sm text-ink-muted">
        {mode === 'signup' ? t('auth.signupHint') : t('app.subtitle')}
      </p>

      <form onSubmit={submit} className="space-y-3">
        {mode === 'signup' && (
          <div>
            <span className="label">{t('auth.displayName')}</span>
            <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          </div>
        )}
        <div>
          <span className="label">{t('auth.email')}</span>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>
        <div>
          <span className="label">{t('auth.password')}</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={6}
            required
          />
        </div>

        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {info && <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{info}</div>}

        <button className="btn-primary w-full" disabled={busy}>
          {busy ? t('common.loading') : mode === 'login' ? t('auth.login') : t('auth.signup')}
        </button>
      </form>

      <div className="mt-4 text-center text-sm text-ink-muted">
        {mode === 'login' ? (
          <>
            {t('auth.noAccount')}{' '}
            <button className="font-semibold text-gold-700" onClick={() => setMode('signup')}>
              {t('auth.signup')}
            </button>
          </>
        ) : (
          <>
            {t('auth.haveAccount')}{' '}
            <button className="font-semibold text-gold-700" onClick={() => setMode('login')}>
              {t('auth.login')}
            </button>
          </>
        )}
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FAF9F6] p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <img
            src="/logo.png"
            alt="United Trade Co."
            className="w-72 max-w-full"
            onError={(e) => {
              if (!e.currentTarget.src.endsWith('/logo.svg')) e.currentTarget.src = '/logo.svg'
            }}
          />
        </div>
        <div className="card p-6">{children}</div>
        <div className="mt-4 flex justify-center">
          <LanguageToggle />
        </div>
      </div>
    </div>
  )
}
