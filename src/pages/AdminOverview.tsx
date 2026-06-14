import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { money, formatDate } from '../lib/format'
import { convert } from '../lib/pricing'
import { PageHeader, Spinner, Stat, StatusBadge } from '../components/ui'
import type { Currency, FxRate, QuoteStatus } from '../lib/types'

interface ValueByCurrency {
  currency: Currency
  quote_count: number
  total_quoted: number
  total_accepted: number
  total_this_month: number
}
interface Pipeline {
  status: QuoteStatus
  currency: Currency
  quote_count: number
  total_value: number
}
interface UserActivity {
  user_id: string
  display_name: string | null
  email: string | null
  role: string
  quotes_total: number
  quotes_this_month: number
  customers_total: number
}
interface Recent {
  id: string
  quote_number: string | null
  project_name: string | null
  status: QuoteStatus
  currency: Currency
  total: number
  updated_at: string
  customer_name: string
  owner_name: string | null
}
interface TopCustomer {
  id: string
  company_name: string
  country: string | null
  currency: Currency
  quote_count: number
  total_value: number
}

export function AdminOverviewPage() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [valueByCurrency, setValueByCurrency] = useState<ValueByCurrency[]>([])
  const [pipeline, setPipeline] = useState<Pipeline[]>([])
  const [users, setUsers] = useState<UserActivity[]>([])
  const [recent, setRecent] = useState<Recent[]>([])
  const [top, setTop] = useState<TopCustomer[]>([])
  const [fx, setFx] = useState<FxRate[]>([])

  useEffect(() => {
    ;(async () => {
      const [vbc, pl, ua, ra, tc, fxRes] = await Promise.all([
        supabase.from('v_admin_value_by_currency').select('*'),
        supabase.from('v_admin_quote_pipeline').select('*'),
        supabase.from('v_admin_user_activity').select('*'),
        supabase.from('v_admin_recent_activity').select('*').limit(12),
        supabase.from('v_admin_top_customers').select('*').order('total_value', { ascending: false }).limit(8),
        supabase.from('fx_rates').select('*'),
      ])
      setValueByCurrency((vbc.data as ValueByCurrency[]) ?? [])
      setPipeline((pl.data as Pipeline[]) ?? [])
      setUsers((ua.data as UserActivity[]) ?? [])
      setRecent((ra.data as Recent[]) ?? [])
      setTop((tc.data as TopCustomer[]) ?? [])
      setFx((fxRes.data as FxRate[]) ?? [])
      setLoading(false)
    })()
  }, [])

  if (loading) return <Spinner />

  const eurEquiv = valueByCurrency.reduce((s, r) => {
    const v = r.currency === 'EUR' ? r.total_quoted : convert(fx, r.total_quoted, r.currency, 'EUR')
    return s + (v ?? 0)
  }, 0)
  const totalQuoted = valueByCurrency.reduce((s, r) => s + r.total_quoted, 0)
  const totalAccepted = valueByCurrency.reduce((s, r) => s + r.total_accepted, 0)
  const winRate = totalQuoted > 0 ? Math.round((totalAccepted / totalQuoted) * 100) : 0
  const statuses: QuoteStatus[] = ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED']

  return (
    <div>
      <PageHeader
        title={t('admin.title')}
        action={
          <Link to="/admin/catalog" className="btn-outline">
            {t('nav.priceAdmin')}
          </Link>
        }
      />

      {/* Money */}
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-gold-700">{t('admin.money')}</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t('admin.eurEq')} value={money(eurEquiv, 'EUR')} hint={t('admin.allTime')} />
        <Stat label={t('admin.winRate')} value={`${winRate}%`} hint={`${t('admin.accepted')} / ${t('admin.quoted')}`} />
        {valueByCurrency.map((r) => (
          <Stat
            key={r.currency}
            label={`${t('admin.quoted')} · ${r.currency}`}
            value={money(r.total_quoted, r.currency)}
            hint={`${r.quote_count} · ${t('admin.thisMonth')}: ${money(r.total_this_month, r.currency)}`}
          />
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Pipeline */}
        <div className="card p-4">
          <h3 className="mb-3 text-base font-bold text-ink">{t('admin.pipeline')}</h3>
          <table className="w-full">
            <thead>
              <tr className="border-b border-black/5">
                <th className="th">{t('common.status')}</th>
                <th className="th text-end">#</th>
                <th className="th text-end">{t('quotes.valueLabel')}</th>
              </tr>
            </thead>
            <tbody>
              {statuses.map((s) => {
                const rows = pipeline.filter((p) => p.status === s)
                const count = rows.reduce((a, b) => a + b.quote_count, 0)
                return (
                  <tr key={s} className="border-b border-black/5 last:border-0">
                    <td className="td">
                      <StatusBadge status={s} />
                    </td>
                    <td className="td text-end tabular">{count}</td>
                    <td className="td text-end text-xs">
                      {rows.length === 0
                        ? '—'
                        : rows.map((r) => (
                            <div key={r.currency} className="tabular">
                              {money(r.total_value, r.currency)}
                            </div>
                          ))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Top customers */}
        <div className="card p-4">
          <h3 className="mb-3 text-base font-bold text-ink">{t('admin.topCustomers')}</h3>
          <table className="w-full">
            <thead>
              <tr className="border-b border-black/5">
                <th className="th">{t('customers.company')}</th>
                <th className="th text-end">{t('quotes.valueLabel')}</th>
              </tr>
            </thead>
            <tbody>
              {top.map((c) => (
                <tr key={`${c.id}-${c.currency}`} className="border-b border-black/5 last:border-0">
                  <td className="td">{c.company_name}</td>
                  <td className="td text-end tabular">{money(c.total_value, c.currency)}</td>
                </tr>
              ))}
              {top.length === 0 && (
                <tr>
                  <td className="td text-ink-muted" colSpan={2}>
                    {t('common.noResults')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Team activity */}
      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-gold-700">{t('admin.teamActivity')}</h2>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-4">
          <h3 className="mb-3 text-base font-bold text-ink">{t('admin.userActivity')}</h3>
          <table className="w-full">
            <thead>
              <tr className="border-b border-black/5">
                <th className="th">{t('auth.displayName')}</th>
                <th className="th text-end">{t('admin.thisMonth')}</th>
                <th className="th text-end">{t('admin.allTime')}</th>
                <th className="th text-end">{t('nav.customers')}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.user_id} className="border-b border-black/5 last:border-0">
                  <td className="td">
                    <div className="font-semibold text-ink">{u.display_name ?? u.email}</div>
                    <div className="text-[11px] text-ink-muted">{t(`roles.${u.role}`)}</div>
                  </td>
                  <td className="td text-end tabular">{u.quotes_this_month}</td>
                  <td className="td text-end tabular">{u.quotes_total}</td>
                  <td className="td text-end tabular">{u.customers_total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card p-4">
          <h3 className="mb-3 text-base font-bold text-ink">{t('admin.recent')}</h3>
          <ul className="space-y-2">
            {recent.map((r) => (
              <li key={r.id} className="flex items-center justify-between border-b border-black/5 pb-2 last:border-0">
                <div>
                  <Link to={`/quotes/${r.id}`} className="text-sm font-semibold text-gold-700">
                    {r.quote_number}
                  </Link>
                  <div className="text-xs text-ink-muted">
                    {r.customer_name} · {r.owner_name ?? '—'} · {formatDate(r.updated_at)}
                  </div>
                </div>
                <div className="text-end">
                  <div className="tabular text-sm font-semibold">{money(r.total, r.currency)}</div>
                  <StatusBadge status={r.status} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
