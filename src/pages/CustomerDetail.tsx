import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { money, formatDate } from '../lib/format'
import { PageHeader, Spinner, Modal, StatusBadge, EmptyState } from '../components/ui'
import { CustomerForm } from '../components/CustomerForm'
import type { Customer, Quote } from '../lib/types'

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { t } = useTranslation()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)

  async function load() {
    if (!id) return
    setLoading(true)
    const [c, q] = await Promise.all([
      supabase.from('customers').select('*').eq('id', id).maybeSingle(),
      supabase.from('quotes').select('*').eq('customer_id', id).order('created_at', { ascending: false }),
    ])
    setCustomer((c.data as Customer) ?? null)
    setQuotes((q.data as Quote[]) ?? [])
    setLoading(false)
  }
  useEffect(() => {
    load()
  }, [id])

  if (loading) return <Spinner />
  if (!customer) return <EmptyState message={t('common.noResults')} />

  return (
    <div>
      <PageHeader
        title={customer.company_name}
        subtitle={[customer.country, customer.region ? t(`enums.region.${customer.region}`) : null]
          .filter(Boolean)
          .join(' · ')}
        action={
          <div className="flex gap-2">
            <button className="btn-outline" onClick={() => setEditing(true)}>
              {t('common.edit')}
            </button>
            <Link to={`/quotes/new?customer=${customer.id}`} className="btn-primary">
              ➕ {t('nav.newQuote')}
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-4">
          <Info label={t('customers.contactName')} value={customer.contact_name} />
          <Info label={t('customers.contactEmail')} value={customer.contact_email} />
          <Info label={t('customers.contactPhone')} value={customer.contact_phone} />
          <Info label={t('customers.preferredCurrency')} value={customer.preferred_currency} />
        </div>
        <div className="card p-4 lg:col-span-2">
          <div className="label">{t('common.notes')}</div>
          <p className="whitespace-pre-wrap text-sm text-ink-soft">{customer.notes || '—'}</p>
        </div>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-bold text-ink">{t('customers.history')}</h2>
      {quotes.length === 0 ? (
        <EmptyState message={t('customers.noHistory')} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-black/5 bg-black/[0.02]">
              <tr>
                <th className="th">{t('quote.number')}</th>
                <th className="th">{t('quote.project')}</th>
                <th className="th text-end">{t('quotes.valueLabel')}</th>
                <th className="th">{t('common.status')}</th>
                <th className="th">{t('common.date')}</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => (
                <tr key={q.id} className="border-b border-black/5 last:border-0 hover:bg-gold-50/40">
                  <td className="td">
                    <Link to={`/quotes/${q.id}`} className="font-semibold text-gold-700">
                      {q.quote_number}
                    </Link>
                  </td>
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

      <Modal open={editing} onClose={() => setEditing(false)} title={t('common.edit')}>
        <CustomerForm
          initial={customer}
          onSaved={() => {
            setEditing(false)
            load()
          }}
          onCancel={() => setEditing(false)}
        />
      </Modal>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="mb-2">
      <div className="label mb-0">{label}</div>
      <div className="text-sm text-ink-soft">{value || '—'}</div>
    </div>
  )
}
