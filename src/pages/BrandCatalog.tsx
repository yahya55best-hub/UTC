import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useCatalog } from '../lib/hooks'
import { useAuth } from '../auth/AuthProvider'
import { PageHeader, Spinner } from '../components/ui'
import type { Brand, BrandType, Product } from '../lib/types'

const GROUPS: { type: BrandType; key: string }[] = [
  { type: 'OWN', key: 'catalog.own' },
  { type: 'EUROPEAN', key: 'catalog.european' },
  { type: 'EGYPTIAN', key: 'catalog.egyptian' },
]

export function BrandCatalogPage() {
  const { t } = useTranslation()
  const { isAdmin } = useAuth()
  const { brands, products, loading } = useCatalog()
  const [openBrand, setOpenBrand] = useState<string | null>(null)

  if (loading) return <Spinner />

  return (
    <div>
      <PageHeader
        title={t('catalog.title')}
        action={
          isAdmin ? (
            <Link to="/admin/catalog" className="btn-outline">
              {t('common.edit')}
            </Link>
          ) : undefined
        }
      />

      {GROUPS.map(({ type, key }) => {
        const list = brands.filter((b) => b.brand_type === type)
        if (list.length === 0) return null
        return (
          <section key={type} className="mb-8">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-gold-700">{t(key)}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((b) => (
                <BrandCard
                  key={b.id}
                  brand={b}
                  products={products.filter((p) => p.brand_id === b.id)}
                  open={openBrand === b.id}
                  onToggle={() => setOpenBrand(openBrand === b.id ? null : b.id)}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function BrandCard({
  brand,
  products,
  open,
  onToggle,
}: {
  brand: Brand
  products: Product[]
  open: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation()
  const categories = Array.from(new Set(products.map((p) => p.category)))

  return (
    <div className={`card p-4 ${!brand.active ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-bold text-ink">{brand.name}</h3>
          <p className="text-xs text-ink-muted">
            {t('catalog.origin')}: {brand.origin_country ?? '—'}
          </p>
        </div>
        <span className="badge bg-gold-50 text-gold-700">{brand.default_buy_currency}</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {brand.pricing_modes.map((m) => (
          <span key={m} className="badge bg-black/5 text-ink-soft">
            {t(`enums.pricingMode.${m}`)}
          </span>
        ))}
        {!brand.active && <span className="badge bg-red-50 text-red-600">{t('catalog.inactive')}</span>}
      </div>

      <div className="mt-3 text-xs text-ink-muted">
        {products.length} {t('catalog.products')}
        {categories.length > 0 && (
          <span> · {categories.map((c) => t(`enums.category.${c}`)).join(', ')}</span>
        )}
      </div>

      {products.length > 0 && (
        <button className="mt-3 text-xs font-semibold text-gold-700" onClick={onToggle}>
          {open ? '▲' : '▼'} {t('catalog.viewProducts')}
        </button>
      )}
      {open && (
        <ul className="mt-2 space-y-1 border-t border-black/5 pt-2 text-sm text-ink-soft">
          {products.map((p) => (
            <li key={p.id} className="flex items-center justify-between">
              <span>{p.name}</span>
              <span className="text-xs text-ink-muted">{t(`enums.unit.${p.unit}`)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
