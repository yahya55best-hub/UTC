import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { PageHeader, Spinner, Modal, EmptyState } from '../components/ui'
import { CustomerForm } from '../components/CustomerForm'
import { REGIONS, type Customer } from '../lib/types'

export function CustomersPage() {
  const { t } = useTranslation()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [region, setRegion] = useState('')
  const [creating, setCreating] = useState(false)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('customers').select('*').order('company_name')
    setCustomers((data as Customer[]) ?? [])
    setLoading(false)
  }
  useEffect(() => {
    load()
  }, [])

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase()
    const matchSearch =
      !q ||
      c.company_name.toLowerCase().includes(q) ||
      (c.country ?? '').toLowerCase().includes(q) ||
      (c.contact_name ?? '').toLowerCase().includes(q)
    const matchRegion = !region || c.region === region
    return matchSearch && matchRegion
  })

  return (
    <div>
      <PageHeader
        title={t('customers.title')}
        action={
          <button className="btn-primary" onClick={() => setCreating(true)}>
            ➕ {t('customers.new')}
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          className="input max-w-xs"
          placeholder={t('common.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input max-w-[200px]" value={region} onChange={(e) => setRegion(e.target.value)}>
          <option value="">{t('customers.filterRegion')}</option>
          {REGIONS.map((r) => (
            <option key={r} value={r}>
              {t(`enums.region.${r}`)}
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
                <th className="th">{t('customers.company')}</th>
                <th className="th">{t('customers.country')}</th>
                <th className="th">{t('customers.region')}</th>
                <th className="th">{t('customers.contactName')}</th>
                <th className="th">{t('customers.preferredCurrency')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-black/5 last:border-0 hover:bg-gold-50/40">
                  <td className="td">
                    <Link to={`/customers/${c.id}`} className="font-semibold text-gold-700">
                      {c.company_name}
                    </Link>
                  </td>
                  <td className="td">{c.country ?? '—'}</td>
                  <td className="td">{c.region ? t(`enums.region.${c.region}`) : '—'}</td>
                  <td className="td">{c.contact_name ?? '—'}</td>
                  <td className="td">{c.preferred_currency}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title={t('customers.new')}>
        <CustomerForm
          onSaved={() => {
            setCreating(false)
            load()
          }}
          onCancel={() => setCreating(false)}
        />
      </Modal>
    </div>
  )
}
