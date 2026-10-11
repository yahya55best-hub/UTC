import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { formatDate, money } from '../lib/format'
import { PageHeader, Spinner, Stat, StatusBadge, EmptyState } from '../components/ui'
import type { Quote } from '../lib/types'

export function DashboardPage() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [brandCount, setBrandCount] = useState(0)
  const [customerCount, setCustomerCount] = useState(0)
  const [quotesMonth, setQuotesMonth] = useState(0)
  const [recent, setRecent] = useState<(Quote & { customer: { company_name: string } | null })[]>([])

  useEffect(() => {
    ;(async () => {
      const startMonth = new Date()
      startMonth.setDate(1)
      startMonth.setHours(0, 0, 0, 0)
      const iso = startMonth.toISOString()

      const [brands, customers, monthQuotes, recentRes] = await Promise.all([
        supabase.from('brands').select('id', { count: 'exact', head: true }).eq('active', true),
        supabase.from('customers').select('id', { count: 'exact', head: true }),
        supabase.from('quotes').select('id', { count: 'exact', head: true }).gte('created_at', iso),
        supabase
          .from('quotes')
          .select('*, customer:customers(company_name)')
          .order('created_at', { ascending: false })
          .limit(8),
      ])

      setBrandCount(brands.count ?? 0)
      setCustomerCount(customers.count ?? 0)

      setQuotesMonth(monthQuotes.count ?? 0)
      setRecent((recentRes.data as never) ?? [])
      setLoading(false)
    })()
  }, [])

  if (loading) return <Spinner />

  return (
    <div>
      <PageHeader title={t('dashboard.title')} subtitle={`${t('dashboard.welcome')}, ${profile?.display_name ?? ''}`} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <Stat label={t('dashboard.activeBrands')} value={brandCount} />
        <Stat label={t('dashboard.quotesThisMonth')} value={quotesMonth} />
        <Stat label={t('dashboard.activeCustomers')} value={customerCount} />
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link to="/quotes/new" className="btn-primary">
          ➕ {t('nav.newQuote')}
        </Link>
        <Link to="/customers" className="btn-outline">
          🏢 {t('nav.customers')}
        </Link>
        <Link to="/catalog" className="btn-outline">
          📚 {t('nav.catalog')}
        </Link>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-bold text-ink">{t('dashboard.recentQuotes')}</h2>
      {recent.length === 0 ? (
        <EmptyState message={t('common.noResults')} />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-black/5 bg-black/[0.02]">
              <tr>
                <th className="th">{t('quote.number')}</th>
                <th className="th">{t('quote.customer')}</th>
                <th className="th text-end">{t('quotes.valueLabel')}</th>
                <th className="th">{t('common.status')}</th>
                <th className="th">{t('common.date')}</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((q) => (
                <tr key={q.id} className="border-b border-black/5 last:border-0 hover:bg-gold-50/40">
                  <td className="td">
                    <Link to={`/quotes/${q.id}`} className="font-semibold text-gold-700">
                      {q.quote_number}
                    </Link>
                  </td>
                  <td className="td">{q.customer?.company_name ?? '—'}</td>
                  <td className="td text-end tabular">{money(q.total, q.currency)}</td>
                  <td className="td">
                    <StatusBadge status={q.status} />
                  </td>
                  <td className="td">{formatDate(q.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
