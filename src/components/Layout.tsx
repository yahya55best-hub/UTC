import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthProvider'
import { LanguageToggle } from './LanguageToggle'

function navClass({ isActive }: { isActive: boolean }) {
  return [
    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    isActive ? 'bg-gold-50 text-gold-700' : 'text-ink-soft hover:bg-black/5',
  ].join(' ')
}

export function Layout() {
  const { t } = useTranslation()
  const { profile, role, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-black/5 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="UTC"
            className="h-11 w-auto"
            onError={(e) => {
              if (!e.currentTarget.src.endsWith('/logo-mark.svg')) e.currentTarget.src = '/logo-mark.svg'
            }}
          />
          <div className="hidden sm:block">
            <div className="text-sm font-bold leading-tight text-ink">{t('app.name')}</div>
            <div className="text-[11px] leading-tight text-ink-muted">{t('app.tagline')}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <LanguageToggle />
          <div className="hidden text-end sm:block">
            <div className="text-sm font-semibold text-ink">{profile?.display_name ?? '—'}</div>
            <div className="text-[11px] text-ink-muted">{role ? t(`roles.${role}`) : ''}</div>
          </div>
          <button className="btn-ghost px-3 py-1.5 text-xs" onClick={handleLogout}>
            {t('common.logout')}
          </button>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className="hidden w-56 shrink-0 border-e border-black/5 bg-white p-3 md:block">
          <nav className="space-y-1">
            <NavLink to="/" end className={navClass}>
              📊 <span>{t('nav.dashboard')}</span>
            </NavLink>
            <NavLink to="/quotes/new" className={navClass}>
              ➕ <span>{t('nav.newQuote')}</span>
            </NavLink>
            <NavLink to="/quotes" end className={navClass}>
              📄 <span>{t('nav.quotes')}</span>
            </NavLink>
            <NavLink to="/customers" className={navClass}>
              🏢 <span>{t('nav.customers')}</span>
            </NavLink>
            <NavLink to="/catalog" className={navClass}>
              📚 <span>{t('nav.catalog')}</span>
            </NavLink>
            {isAdmin && (
              <>
                <div className="px-3 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                  {t('nav.admin')}
                </div>
                <NavLink to="/admin" end className={navClass}>
                  📈 <span>{t('nav.adminOverview')}</span>
                </NavLink>
                <NavLink to="/admin/catalog" className={navClass}>
                  🏷️ <span>{t('nav.priceAdmin')}</span>
                </NavLink>
                <NavLink to="/admin/calc" className={navClass}>
                  📐 <span>{t('calc.settings')}</span>
                </NavLink>
              </>
            )}
          </nav>
        </aside>

        {/* Mobile nav */}
        <main className="flex-1 bg-[#FAF9F6] p-4 sm:p-6">
          <div className="mx-auto max-w-6xl">
            <MobileNav isAdmin={isAdmin} />
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

function MobileNav({ isAdmin }: { isAdmin: boolean }) {
  const { t } = useTranslation()
  return (
    <nav className="mb-4 flex gap-2 overflow-x-auto pb-1 md:hidden">
      <NavLink to="/" end className={navClass}>
        {t('nav.dashboard')}
      </NavLink>
      <NavLink to="/quotes/new" className={navClass}>
        {t('nav.newQuote')}
      </NavLink>
      <NavLink to="/quotes" end className={navClass}>
        {t('nav.quotes')}
      </NavLink>
      <NavLink to="/customers" className={navClass}>
        {t('nav.customers')}
      </NavLink>
      <NavLink to="/catalog" className={navClass}>
        {t('nav.catalog')}
      </NavLink>
      {isAdmin && (
        <NavLink to="/admin" end className={navClass}>
          {t('nav.adminOverview')}
        </NavLink>
      )}
    </nav>
  )
}
