import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { money, formatDate } from '../lib/format'
import { PageHeader, Spinner, StatusBadge, EmptyState } from '../components/ui'
import { QUOTE_STATUSES, type Quote } from '../lib/types'

export function QuotesListPage() {
  const { t } = useTranslation()
  const [quotes, setQuotes] = useState<(Quote & { customer: { company_name: string } | null })[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('quotes')
        .select('*, customer:customers(company_name)')
        .order('created_at', { ascending: false })
      setQuotes((data as never) ?? [])
      setLoading(false)
    })()
  }, [])

  const filtered = quotes.filter((q) => {
    const matchStatus = !status || q.status === status
    const ql = search.toLowerCase()
    const matchSearch =
      !ql ||
      (q.quote_number ?? '').toLowerCase().includes(ql) ||
      (q.customer?.company_name ?? '').toLowerCase().includes(ql) ||
      (q.project_name ?? '').toLowerCase().includes(ql)
    return matchStatus && matchSearch
  })

  return (
    <div>
      <PageHeader
        title={t('quotes.title')}
        action={
          <Link to="/quotes/new" className="btn-primary">
            ➕ {t('nav.newQuote')}
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          className="input max-w-xs"
          placeholder={t('common.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input max-w-[200px]" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t('quotes.filterStatus')}</option>
          {QUOTE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`enums.status.${s}`)}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <EmptyState message={t('common.noResults')} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-black/5 bg-black/[0.02]">
              <tr>
                <th className="th">{t('quote.number')}</th>
                <th className="th">{t('quote.customer')}</th>
                <th className="th">{t('quote.project')}</th>
                <th className="th text-end">{t('quotes.valueLabel')}</th>
                <th className="th">{t('common.status')}</th>
                <th className="th">{t('common.date')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((q) => (
                <tr key={q.id} className="border-b border-black/5 last:border-0 hover:bg-gold-50/40">
                  <td className="td">
                    <Link to={`/quotes/${q.id}`} className="font-semibold text-gold-700">
                      {q.quote_number}
                    </Link>
                  </td>
                  <td className="td">{q.customer?.company_name ?? '—'}</td>
                  <td className="td">{q.project_name ?? '—'}</td>
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
