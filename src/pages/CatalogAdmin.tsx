import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useCatalog } from '../lib/hooks'
import { currentPrice } from '../lib/pricing'
import { money, todayISO } from '../lib/format'
import { PageHeader, Spinner, Field, Modal } from '../components/ui'
import {
  CURRENCIES, PRICING_MODES, PRODUCT_CATEGORIES, UNIT_TYPES,
  type BrandType, type Currency, type FxRate, type PriceValueType, type Product,
} from '../lib/types'

export function CatalogAdminPage() {
  const { t } = useTranslation()
  const catalog = useCatalog()
  const [brandId, setBrandId] = useState('')
  const [priceFor, setPriceFor] = useState<Product | null>(null)
  const [addingBrand, setAddingBrand] = useState(false)
  const [addingProduct, setAddingProduct] = useState(false)

  if (catalog.loading) return <Spinner />

  const products = catalog.products.filter((p) => !brandId || p.brand_id === brandId)

  return (
    <div>
      <PageHeader title={t('nav.priceAdmin')} subtitle={t('admin.priceEditor')} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select className="input max-w-xs" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
          <option value="">{t('common.all')}</option>
          {catalog.brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <button className="btn-outline" onClick={() => setAddingBrand(true)}>
          ➕ Brand
        </button>
        <button className="btn-outline" onClick={() => setAddingProduct(true)}>
          ➕ Product
        </button>
      </div>

      {/* Products + current prices */}
      <div className="card mb-8 overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-black/5 bg-black/[0.02]">
            <tr>
              <th className="th">{t('quote.pickProduct')}</th>
              <th className="th">{t('catalog.pricingMode')}</th>
              <th className="th">{t('common.unit')}</th>
              <th className="th text-end">EUR</th>
              <th className="th text-end">USD</th>
              <th className="th text-end">EGP</th>
              <th className="th"></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const brand = catalog.brands.find((b) => b.id === p.brand_id)
              const variants = catalog.variants.filter((v) => v.product_id === p.id)
              const priceCell = (c: Currency) => {
                if (variants.length > 0) return <span className="text-xs text-ink-muted">→ variants</span>
                const e = currentPrice(catalog.prices, { productId: p.id, currency: c })
                return e ? money(e.amount, c) : <span className="text-xs text-amber-600">{t('common.notSet')}</span>
              }
              return (
                <tr key={p.id} className="border-b border-black/5 last:border-0">
                  <td className="td">
                    <div className="font-semibold text-ink">{p.name}</div>
                    <div className="text-[11px] text-ink-muted">{brand?.name}</div>
                  </td>
                  <td className="td text-xs">{t(`enums.pricingMode.${p.pricing_mode}`)}</td>
                  <td className="td text-xs">{t(`enums.unit.${p.unit}`)}</td>
                  <td className="td text-end tabular">{priceCell('EUR')}</td>
                  <td className="td text-end tabular">{priceCell('USD')}</td>
                  <td className="td text-end tabular">{priceCell('EGP')}</td>
                  <td className="td text-end">
                    <button className="btn-outline px-2 py-1 text-xs" onClick={() => setPriceFor(p)}>
                      {t('admin.newPrice')}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* FX editor */}
      <FxEditor rates={catalog.fx} onChanged={catalog.reload} />

      {priceFor && (
        <PriceModal
          product={priceFor}
          variants={catalog.variants.filter((v) => v.product_id === priceFor.id)}
          onClose={() => setPriceFor(null)}
          onSaved={() => {
            setPriceFor(null)
            catalog.reload()
          }}
        />
      )}

      <Modal open={addingBrand} onClose={() => setAddingBrand(false)} title="New brand">
        <BrandForm onSaved={() => { setAddingBrand(false); catalog.reload() }} onCancel={() => setAddingBrand(false)} />
      </Modal>
      <Modal open={addingProduct} onClose={() => setAddingProduct(false)} title="New product">
        <ProductForm
          brands={catalog.brands.map((b) => ({ id: b.id, name: b.name }))}
          onSaved={() => { setAddingProduct(false); catalog.reload() }}
          onCancel={() => setAddingProduct(false)}
        />
      </Modal>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Add a new effective-dated price entry (history-preserving). Closes the
// currently-open matching entry by setting its effective_to to the day before.
// ---------------------------------------------------------------------------
function PriceModal({
  product,
  variants,
  onClose,
  onSaved,
}: {
  product: Product
  variants: { id: string; label: string }[]
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const [variantId, setVariantId] = useState<string>(variants[0]?.id ?? '')
  const [currency, setCurrency] = useState<Currency>('EUR')
  const [valueType, setValueType] = useState<PriceValueType>('UNIT_PRICE')
  const [amount, setAmount] = useState('0')
  const [effFrom, setEffFrom] = useState(todayISO())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const vId = variants.length > 0 ? variantId || null : null

    // Close the currently-open matching entry.
    const prevDay = new Date(effFrom)
    prevDay.setDate(prevDay.getDate() - 1)
    let closeQ = supabase
      .from('price_list_entries')
      .update({ effective_to: prevDay.toISOString().slice(0, 10) })
      .eq('product_id', product.id)
      .eq('currency', currency)
      .eq('value_type', valueType)
      .is('effective_to', null)
    closeQ = vId ? closeQ.eq('pricing_variant_id', vId) : closeQ.is('pricing_variant_id', null)
    await closeQ

    const ins = await supabase.from('price_list_entries').insert({
      product_id: product.id,
      pricing_variant_id: vId,
      currency,
      value_type: valueType,
      amount: Number(amount),
      effective_from: effFrom,
    })
    setBusy(false)
    if (ins.error) {
      setError(ins.error.message)
      return
    }
    onSaved()
  }

  return (
    <Modal open onClose={onClose} title={`${t('admin.newPrice')} — ${product.name}`}>
      <form onSubmit={save} className="space-y-3">
        {variants.length > 0 && (
          <Field label={t('quote.pickVariant')}>
            <select className="input" value={variantId} onChange={(e) => setVariantId(e.target.value)}>
              {variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('common.currency')}>
            <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('admin.valueType')}>
            <select className="input" value={valueType} onChange={(e) => setValueType(e.target.value as PriceValueType)}>
              <option value="UNIT_PRICE">UNIT_PRICE</option>
              <option value="COMMISSION_PERCENT">COMMISSION_PERCENT</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('admin.amount')}>
            <input className="input tabular" type="number" step="any" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label={t('admin.effectiveFrom')}>
            <input className="input" type="date" value={effFrom} onChange={(e) => setEffFrom(e.target.value)} />
          </Field>
        </div>
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn-primary" disabled={busy}>
            {busy ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function FxEditor({ rates, onChanged }: { rates: FxRate[]; onChanged: () => void }) {
  const { t } = useTranslation()
  const sorted = useMemo(() => [...rates].sort((a, b) => a.from_currency.localeCompare(b.from_currency)), [rates])

  async function update(id: string, rate: number) {
    await supabase.from('fx_rates').update({ rate, updated_at: new Date().toISOString() }).eq('id', id)
    onChanged()
  }

  return (
    <div className="card p-4">
      <h2 className="mb-3 text-base font-bold text-ink">{t('admin.fxEditor')}</h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((r) => (
          <div key={r.id} className="flex items-center gap-2 rounded-lg border border-black/5 px-3 py-2">
            <span className="w-24 text-sm font-semibold text-ink">
              {r.from_currency} → {r.to_currency}
            </span>
            <input
              className="input tabular flex-1"
              type="number"
              step="any"
              defaultValue={r.rate}
              onBlur={(e) => {
                const v = Number(e.target.value)
                if (v !== Number(r.rate)) update(r.id, v)
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// ---- lightweight brand / product creation ---------------------------------
function BrandForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [origin, setOrigin] = useState('')
  const [type, setType] = useState<BrandType>('EUROPEAN')
  const [buyCurrency, setBuyCurrency] = useState('EUR')
  const [modes, setModes] = useState<string[]>(['WAREHOUSE'])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const res = await supabase.from('brands').insert({
      name,
      origin_country: origin || null,
      brand_type: type,
      default_buy_currency: buyCurrency,
      pricing_modes: modes,
    })
    setBusy(false)
    if (res.error) return setError(res.error.message)
    onSaved()
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <Field label="Name">
        <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Origin country">
          <input className="input" value={origin} onChange={(e) => setOrigin(e.target.value)} />
        </Field>
        <Field label="Type">
          <select className="input" value={type} onChange={(e) => setType(e.target.value as BrandType)}>
            <option value="OWN">OWN</option>
            <option value="EUROPEAN">EUROPEAN</option>
            <option value="EGYPTIAN">EGYPTIAN</option>
          </select>
        </Field>
      </div>
      <Field label="Default buy currency">
        <select className="input" value={buyCurrency} onChange={(e) => setBuyCurrency(e.target.value)}>
          {['EUR', 'USD', 'EGP', 'MIXED'].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>
      <div>
        <span className="label">Pricing modes</span>
        <div className="flex flex-wrap gap-3">
          {PRICING_MODES.map((m) => (
            <label key={m} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={modes.includes(m)}
                onChange={(e) =>
                  setModes((prev) => (e.target.checked ? [...prev, m] : prev.filter((x) => x !== m)))
                }
              />
              {m}
            </label>
          ))}
        </div>
      </div>
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}

function ProductForm({
  brands,
  onSaved,
  onCancel,
}: {
  brands: { id: string; name: string }[]
  onSaved: () => void
  onCancel: () => void
}) {
  const [brandId, setBrandId] = useState(brands[0]?.id ?? '')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('OTHER')
  const [unit, setUnit] = useState('PER_UNIT')
  const [mode, setMode] = useState('WAREHOUSE')
  const [installSep, setInstallSep] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const res = await supabase.from('products').insert({
      brand_id: brandId,
      name,
      category,
      unit,
      pricing_mode: mode,
      poultry_types: ['ALL'],
      installation_separate: installSep,
    })
    setBusy(false)
    if (res.error) return setError(res.error.message)
    onSaved()
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <Field label="Brand">
        <select className="input" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Name">
        <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {PRODUCT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Unit">
          <select className="input" value={unit} onChange={(e) => setUnit(e.target.value)}>
            {UNIT_TYPES.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Pricing mode">
          <select className="input" value={mode} onChange={(e) => setMode(e.target.value)}>
            {PRICING_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input type="checkbox" checked={installSep} onChange={(e) => setInstallSep(e.target.checked)} />
          Installation separate
        </label>
      </div>
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}
