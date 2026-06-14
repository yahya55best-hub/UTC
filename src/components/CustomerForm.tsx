import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { Field } from './ui'
import { CURRENCIES, REGIONS, type Customer } from '../lib/types'

export function CustomerForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: Partial<Customer>
  onSaved: (c: Customer) => void
  onCancel?: () => void
}) {
  const { t } = useTranslation()
  const { session } = useAuth()
  const [form, setForm] = useState<Partial<Customer>>({
    preferred_currency: 'EUR',
    ...initial,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof Customer>(k: K, v: Customer[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const payload = {
      company_name: form.company_name,
      country: form.country ?? null,
      region: form.region ?? null,
      contact_name: form.contact_name ?? null,
      contact_email: form.contact_email ?? null,
      contact_phone: form.contact_phone ?? null,
      preferred_currency: form.preferred_currency ?? 'EUR',
      notes: form.notes ?? null,
    }
    const res = initial?.id
      ? await supabase.from('customers').update(payload).eq('id', initial.id).select().single()
      : await supabase
          .from('customers')
          .insert({ ...payload, owner_user_id: session?.user.id })
          .select()
          .single()
    setBusy(false)
    if (res.error) {
      setError(res.error.message)
      return
    }
    onSaved(res.data as Customer)
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label={t('customers.company')}>
        <input
          className="input"
          required
          value={form.company_name ?? ''}
          onChange={(e) => set('company_name', e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('customers.country')}>
          <input className="input" value={form.country ?? ''} onChange={(e) => set('country', e.target.value)} />
        </Field>
        <Field label={t('customers.region')}>
          <select
            className="input"
            value={form.region ?? ''}
            onChange={(e) => set('region', (e.target.value || null) as Customer['region'])}
          >
            <option value="">—</option>
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {t(`enums.region.${r}`)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('customers.contactName')}>
          <input className="input" value={form.contact_name ?? ''} onChange={(e) => set('contact_name', e.target.value)} />
        </Field>
        <Field label={t('customers.preferredCurrency')}>
          <select
            className="input"
            value={form.preferred_currency ?? 'EUR'}
            onChange={(e) => set('preferred_currency', e.target.value as Customer['preferred_currency'])}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('customers.contactEmail')}>
          <input className="input" type="email" value={form.contact_email ?? ''} onChange={(e) => set('contact_email', e.target.value)} />
        </Field>
        <Field label={t('customers.contactPhone')}>
          <input className="input" value={form.contact_phone ?? ''} onChange={(e) => set('contact_phone', e.target.value)} />
        </Field>
      </div>
      <Field label={t('common.notes')} hint={t('customers.memoryHint')}>
        <textarea className="input min-h-[70px]" value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
      </Field>

      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <button type="button" className="btn-ghost" onClick={onCancel}>
            {t('common.cancel')}
          </button>
        )}
        <button className="btn-primary" disabled={busy}>
          {busy ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </form>
  )
}
