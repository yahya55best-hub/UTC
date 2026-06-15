import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useCatalog, variantsFor } from '../lib/hooks'
import { resolveUnitPrice, currentCommissionPercent } from '../lib/pricing'
import { money, todayISO, addDaysISO } from '../lib/format'
import { generateQuotePdf } from '../lib/pdf'
import { generateQuotePdfHtml } from '../lib/pdfHtml'
import { PageHeader, Spinner, Field, Modal } from '../components/ui'
import { CustomerForm } from '../components/CustomerForm'
import { HouseSizingPanel, type CalcSnapshot } from '../components/HouseSizingPanel'
import type { CalcInputs, Proposal } from '../lib/calc'
import {
  CURRENCIES, HOUSE_TYPES, QUOTE_STATUSES,
  type Currency, type Customer, type HouseType, type Quote, type QuoteLine, type QuoteStatus,
} from '../lib/types'

interface DraftLine {
  key: string
  id?: string
  product_id: string | null
  pricing_variant_id: string | null
  brand_snapshot: string | null
  description_snapshot: string
  unit: QuoteLine['unit']
  quantity: number
  unit_price: number
  commission_percent: number | null
  fx_note: string | null
  is_installation: boolean
  notes: string
  calc_source?: string | null
  calc_meta?: Record<string, unknown> | null
}

let keyCounter = 0
const nextKey = () => `k${++keyCounter}`

export function QuoteEditorPage() {
  const { id } = useParams<{ id: string }>()
  const isNew = !id
  const { t } = useTranslation()
  const { isAdmin, session } = useAuth()
  const navigate = useNavigate()
  const catalog = useCatalog()
  const [params] = useSearchParams()

  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creatingCustomer, setCreatingCustomer] = useState(false)
  const [showCalc, setShowCalc] = useState(false)
  const [calcSnap, setCalcSnap] = useState<CalcSnapshot | null>(null)

  // quote header state
  const [customerId, setCustomerId] = useState<string>('')
  const [projectName, setProjectName] = useState('')
  const [houseType, setHouseType] = useState<HouseType | ''>('')
  const [currency, setCurrency] = useState<Currency>('EUR')
  const [status, setStatus] = useState<QuoteStatus>('DRAFT')
  const [validUntil, setValidUntil] = useState(addDaysISO(30))
  const [terms, setTerms] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([])
  const [meta, setMeta] = useState<Pick<Quote, 'quote_number' | 'created_at' | 'subtotal' | 'total'> | null>(null)

  // ---- load -----------------------------------------------------------------
  useEffect(() => {
    ;(async () => {
      const cu = await supabase.from('customers').select('*').order('company_name')
      const list = (cu.data as Customer[]) ?? []
      setCustomers(list)

      if (isNew) {
        const pre = params.get('customer')
        if (pre) {
          setCustomerId(pre)
          const c = list.find((x) => x.id === pre)
          if (c) setCurrency(c.preferred_currency)
        }
        setLoading(false)
        return
      }

      const [q, ql] = await Promise.all([
        supabase.from('quotes').select('*').eq('id', id).maybeSingle(),
        supabase.from('quote_lines').select('*').eq('quote_id', id).order('sort_order'),
      ])
      const quote = q.data as Quote | null
      if (quote) {
        setCustomerId(quote.customer_id)
        setProjectName(quote.project_name ?? '')
        setHouseType((quote.house_type ?? '') as HouseType | '')
        setCurrency(quote.currency)
        setStatus(quote.status)
        setValidUntil(quote.valid_until ?? addDaysISO(30))
        setTerms(quote.notes ?? '')
        setMeta({
          quote_number: quote.quote_number,
          created_at: quote.created_at,
          subtotal: quote.subtotal,
          total: quote.total,
        })
        setLines(
          ((ql.data as QuoteLine[]) ?? []).map((l) => ({
            key: nextKey(),
            id: l.id,
            product_id: l.product_id,
            pricing_variant_id: l.pricing_variant_id,
            brand_snapshot: l.brand_snapshot,
            description_snapshot: l.description_snapshot,
            unit: l.unit,
            quantity: Number(l.quantity),
            unit_price: Number(l.unit_price),
            commission_percent: l.commission_percent,
            fx_note: l.fx_note,
            is_installation: l.is_installation,
            notes: l.notes ?? '',
            calc_source: l.calc_source,
            calc_meta: l.calc_meta,
          })),
        )
      }
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // ---- derived totals -------------------------------------------------------
  const subtotal = useMemo(
    () => lines.filter((l) => !l.is_installation).reduce((s, l) => s + l.quantity * l.unit_price, 0),
    [lines],
  )
  const total = useMemo(() => lines.reduce((s, l) => s + l.quantity * l.unit_price, 0), [lines])
  const commission = useMemo(
    () =>
      lines.reduce(
        (s, l) => s + (l.commission_percent ? (l.quantity * l.unit_price * l.commission_percent) / 100 : 0),
        0,
      ),
    [lines],
  )
  const hasZero = lines.some((l) => l.unit_price === 0 && !l.is_installation)

  // Re-resolve product line prices when the quote currency changes.
  function changeCurrency(next: Currency) {
    setCurrency(next)
    setLines((prev) =>
      prev.map((l) => {
        if (l.is_installation || !l.product_id) return l
        const r = resolveUnitPrice(catalog.prices, catalog.fx, {
          productId: l.product_id,
          variantId: l.pricing_variant_id,
          quoteCurrency: next,
        })
        return { ...l, unit_price: r.unitPrice, fx_note: r.fxNote }
      }),
    )
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }
  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key))
  }

  function addProductLine(line: DraftLine) {
    setLines((prev) => [...prev, line])
  }
  function addCalcLines(proposals: Proposal[], inputs: CalcInputs) {
    const newLines: DraftLine[] = proposals.map((p) => ({
      key: nextKey(),
      product_id: null,
      pricing_variant_id: null,
      brand_snapshot: p.brand_snapshot,
      description_snapshot: p.description,
      unit: p.unit,
      quantity: p.quantity,
      unit_price: 0,
      commission_percent: null,
      fx_note: null,
      is_installation: false,
      notes: p.formula,
      calc_source: 'ENGINE',
      calc_meta: { section: p.section, label: p.label, formula: p.formula, inputs },
    }))
    setLines((prev) => [...prev, ...newLines])
    setShowCalc(false)
  }

  function buildQuoteObj(): Quote {
    return {
      id: id ?? 'draft',
      quote_number: meta?.quote_number ?? null,
      customer_id: customerId,
      project_name: projectName || null,
      house_type: (houseType || null) as HouseType | null,
      currency,
      status,
      created_by: null,
      last_edited_by: null,
      owner_user_id: null,
      valid_until: validUntil || null,
      notes: terms || null,
      subtotal,
      total,
      created_at: meta?.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  }

  function addInstallationLine() {
    addProductLine({
      key: nextKey(),
      product_id: null,
      pricing_variant_id: null,
      brand_snapshot: null,
      description_snapshot: t('quote.installation'),
      unit: null,
      quantity: 1,
      unit_price: 0,
      commission_percent: null,
      fx_note: null,
      is_installation: true,
      notes: '',
    })
  }

  // ---- save -----------------------------------------------------------------
  async function save() {
    if (!customerId) {
      setError(t('quote.needCustomer'))
      return
    }
    setSaving(true)
    setError(null)

    const header = {
      customer_id: customerId,
      project_name: projectName || null,
      house_type: houseType || null,
      currency,
      status,
      valid_until: validUntil || null,
      notes: terms || null,
    }

    let quoteId = id
    if (isNew) {
      const res = await supabase
        .from('quotes')
        .insert({ ...header, owner_user_id: session?.user.id })
        .select()
        .single()
      if (res.error) {
        setError(res.error.message)
        setSaving(false)
        return
      }
      quoteId = (res.data as Quote).id
    } else {
      const res = await supabase.from('quotes').update(header).eq('id', id)
      if (res.error) {
        setError(res.error.message)
        setSaving(false)
        return
      }
      await supabase.from('quote_lines').delete().eq('quote_id', id)
    }

    const rows = lines.map((l, i) => ({
      quote_id: quoteId,
      product_id: l.product_id,
      pricing_variant_id: l.pricing_variant_id,
      brand_snapshot: l.brand_snapshot,
      description_snapshot: l.description_snapshot,
      unit: l.unit,
      quantity: l.quantity,
      unit_price: l.unit_price,
      commission_percent: l.commission_percent,
      fx_note: l.fx_note,
      is_installation: l.is_installation,
      sort_order: i,
      notes: l.notes || null,
      calc_source: l.calc_source ?? null,
      calc_meta: l.calc_meta ?? null,
    }))
    if (rows.length > 0) {
      const ins = await supabase.from('quote_lines').insert(rows)
      if (ins.error) {
        setError(ins.error.message)
        setSaving(false)
        return
      }
    }

    // Persist the house-sizing snapshot (Addendum B/C) if one was computed.
    if (calcSnap && quoteId) {
      await supabase.from('quote_calcs').upsert(
        {
          quote_id: quoteId,
          inputs: calcSnap.inputs as unknown as Record<string, unknown>,
          results: calcSnap.result as unknown as Record<string, unknown>,
          lighting_plan: calcSnap.lighting,
        },
        { onConflict: 'quote_id' },
      )
    }

    setSaving(false)
    navigate(`/quotes/${quoteId}`, { replace: true })
    if (!isNew) {
      // refresh meta totals
      const { data } = await supabase.from('quotes').select('*').eq('id', quoteId).maybeSingle()
      const q = data as Quote | null
      if (q) setMeta({ quote_number: q.quote_number, created_at: q.created_at, subtotal: q.subtotal, total: q.total })
    }
  }

  async function downloadPdf(lang: 'en' | 'ar') {
    const customer = customers.find((c) => c.id === customerId)
    if (!customer) {
      setError(t('quote.needCustomer'))
      return
    }
    const quoteObj: Quote = {
      id: id ?? 'draft',
      quote_number: meta?.quote_number ?? null,
      customer_id: customerId,
      project_name: projectName || null,
      house_type: (houseType || null) as HouseType | null,
      currency,
      status,
      created_by: null,
      last_edited_by: null,
      owner_user_id: null,
      valid_until: validUntil || null,
      notes: terms || null,
      subtotal,
      total,
      created_at: meta?.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    const lineObjs: QuoteLine[] = lines.map((l, i) => ({
      id: l.id ?? l.key,
      quote_id: id ?? 'draft',
      product_id: l.product_id,
      pricing_variant_id: l.pricing_variant_id,
      brand_snapshot: l.brand_snapshot,
      description_snapshot: l.description_snapshot,
      unit: l.unit,
      quantity: l.quantity,
      unit_price: l.unit_price,
      line_total: Math.round(l.quantity * l.unit_price * 100) / 100,
      commission_percent: l.commission_percent,
      fx_note: l.fx_note,
      is_installation: l.is_installation,
      sort_order: i,
      notes: l.notes || null,
      calc_source: l.calc_source ?? null,
      calc_meta: l.calc_meta ?? null,
      created_at: '',
      updated_at: '',
    }))
    if (lang === 'ar') {
      await generateQuotePdfHtml({ quote: quoteObj, customer, lines: lineObjs, currency, lang: 'ar' })
    } else {
      await generateQuotePdf({ quote: quoteObj, customer, lines: lineObjs, currency })
    }
  }

  if (loading || catalog.loading) return <Spinner />

  return (
    <div>
      <PageHeader
        title={isNew ? t('quote.newTitle') : meta?.quote_number ?? t('quote.builder')}
        subtitle={t('quote.builder')}
        action={
          <div className="flex gap-2">
            <button className="btn-outline" onClick={() => downloadPdf('en')}>
              ⬇ {t('quote.exportPdf')} (EN)
            </button>
            <button className="btn-outline" onClick={() => downloadPdf('ar')}>
              ⬇ {t('quote.exportPdf')} (AR)
            </button>
            <button className="btn-primary" onClick={save} disabled={saving}>
              {saving ? t('common.saving') : isNew ? t('quote.saveDraft') : t('common.save')}
            </button>
          </div>
        }
      />

      {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="mb-4">
        <button className="btn-outline" onClick={() => setShowCalc((s) => !s)}>
          🏠 {t('calc.toggle')} {showCalc ? '▲' : '▼'}
        </button>
      </div>
      {showCalc && (
        <div className="mb-6">
          <HouseSizingPanel
            brands={catalog.brands}
            quote={buildQuoteObj()}
            customer={customers.find((c) => c.id === customerId) ?? null}
            onAddLines={addCalcLines}
            onSnapshot={setCalcSnap}
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* main column */}
        <div className="space-y-6 lg:col-span-2">
          {/* header form */}
          <div className="card p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('quote.customer')}>
                <div className="flex gap-2">
                  <select
                    className="input"
                    value={customerId}
                    onChange={(e) => {
                      setCustomerId(e.target.value)
                      const c = customers.find((x) => x.id === e.target.value)
                      if (c && isNew) changeCurrency(c.preferred_currency)
                    }}
                  >
                    <option value="">{t('quote.pickCustomer')}</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.company_name}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="btn-outline px-3" onClick={() => setCreatingCustomer(true)}>
                    ➕
                  </button>
                </div>
              </Field>
              <Field label={t('quote.project')}>
                <input className="input" value={projectName} onChange={(e) => setProjectName(e.target.value)} />
              </Field>
              <Field label={t('quote.houseType')}>
                <select className="input" value={houseType} onChange={(e) => setHouseType(e.target.value as HouseType | '')}>
                  <option value="">—</option>
                  {HOUSE_TYPES.map((h) => (
                    <option key={h} value={h}>
                      {t(`enums.houseType.${h}`)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('common.currency')}>
                <select className="input" value={currency} onChange={(e) => changeCurrency(e.target.value as Currency)}>
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('quote.validUntil')}>
                <input
                  type="date"
                  className="input"
                  value={validUntil}
                  min={todayISO()}
                  onChange={(e) => setValidUntil(e.target.value)}
                />
              </Field>
              {!isNew && (
                <Field label={t('common.status')}>
                  <select className="input" value={status} onChange={(e) => setStatus(e.target.value as QuoteStatus)}>
                    {QUOTE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {t(`enums.status.${s}`)}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
          </div>

          {/* lines */}
          <div className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-ink">{t('quote.lines')}</h2>
              <button className="btn-ghost text-xs" onClick={addInstallationLine}>
                ➕ {t('quote.addInstallation')}
              </button>
            </div>
            <LinesTable lines={lines} currency={currency} onUpdate={updateLine} onRemove={removeLine} />
          </div>

          {/* terms */}
          <div className="card p-4">
            <Field label={t('quote.terms')}>
              <textarea className="input min-h-[80px]" value={terms} onChange={(e) => setTerms(e.target.value)} />
            </Field>
          </div>
        </div>

        {/* side column */}
        <div className="space-y-6">
          <AddLinePanel catalog={catalog} currency={currency} onAdd={addProductLine} />

          <div className="card p-4">
            <h2 className="mb-3 text-base font-bold text-ink">{t('quote.summary')}</h2>
            <SummaryRow label={t('quote.lineCount')} value={String(lines.length)} />
            <SummaryRow label={t('common.currency')} value={currency} />
            <SummaryRow label={t('common.subtotal')} value={money(subtotal, currency)} />
            <div className="my-2 border-t border-black/5" />
            <SummaryRow label={t('common.total')} value={money(total, currency)} strong />
            {isAdmin && commission > 0 && (
              <div className="mt-3 rounded-lg bg-gold-50 p-2 text-xs text-gold-800">
                <div className="flex justify-between font-semibold">
                  <span>{t('quote.commission')}</span>
                  <span className="tabular">{money(commission, currency)}</span>
                </div>
                <p className="mt-1 text-[11px] text-gold-700">{t('quote.commissionNote')}</p>
              </div>
            )}
            {hasZero && (
              <div className="mt-3 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
                ⚠ {t('quote.zeroPriceWarn')}
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal open={creatingCustomer} onClose={() => setCreatingCustomer(false)} title={t('customers.new')}>
        <CustomerForm
          onSaved={(c) => {
            setCustomers((prev) => [...prev, c].sort((a, b) => a.company_name.localeCompare(b.company_name)))
            setCustomerId(c.id)
            if (isNew) changeCurrency(c.preferred_currency)
            setCreatingCustomer(false)
          }}
          onCancel={() => setCreatingCustomer(false)}
        />
      </Modal>
    </div>
  )
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className={strong ? 'font-bold text-ink' : 'text-ink-muted'}>{label}</span>
      <span className={`tabular ${strong ? 'text-lg font-bold text-gold-700' : 'text-ink-soft'}`}>{value}</span>
    </div>
  )
}

function LinesTable({
  lines,
  currency,
  onUpdate,
  onRemove,
}: {
  lines: DraftLine[]
  currency: Currency
  onUpdate: (key: string, patch: Partial<DraftLine>) => void
  onRemove: (key: string) => void
}) {
  const { t } = useTranslation()
  if (lines.length === 0) return <p className="py-6 text-center text-sm text-ink-muted">{t('quote.noLines')}</p>

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-black/5">
            <th className="th">{t('common.unit')}</th>
            <th className="th text-end">{t('common.quantity')}</th>
            <th className="th text-end">{t('common.unitPrice')}</th>
            <th className="th text-end">{t('common.lineTotal')}</th>
            <th className="th"></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.key} className="border-b border-black/5 align-top last:border-0">
              <td className="td">
                <div className="font-semibold text-ink">
                  {l.is_installation ? `🔧 ${l.description_snapshot}` : l.description_snapshot}
                </div>
                <div className="text-xs text-ink-muted">
                  {l.brand_snapshot ? `${l.brand_snapshot} · ` : ''}
                  {l.unit ? t(`enums.unit.${l.unit}`) : t('quote.amount')}
                </div>
                {l.fx_note && <div className="text-[11px] text-blue-600">↔ {l.fx_note}</div>}
                <input
                  className="input mt-1 px-2 py-1 text-xs"
                  placeholder={t('common.notes')}
                  value={l.notes}
                  onChange={(e) => onUpdate(l.key, { notes: e.target.value })}
                />
              </td>
              <td className="td text-end">
                <input
                  className="input w-20 px-2 py-1 text-end tabular"
                  type="number"
                  step="any"
                  min="0"
                  disabled={l.is_installation}
                  value={l.quantity}
                  onChange={(e) => onUpdate(l.key, { quantity: Number(e.target.value) })}
                />
              </td>
              <td className="td text-end">
                <input
                  className="input w-28 px-2 py-1 text-end tabular"
                  type="number"
                  step="any"
                  min="0"
                  value={l.unit_price}
                  onChange={(e) => onUpdate(l.key, { unit_price: Number(e.target.value), fx_note: null })}
                />
              </td>
              <td className="td text-end font-semibold tabular">{money(l.quantity * l.unit_price, currency)}</td>
              <td className="td text-end">
                <button className="btn-ghost px-2 py-1 text-red-600" onClick={() => onRemove(l.key)}>
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AddLinePanel({
  catalog,
  currency,
  onAdd,
}: {
  catalog: ReturnType<typeof useCatalog>
  currency: Currency
  onAdd: (line: DraftLine) => void
}) {
  const { t } = useTranslation()
  const [brandId, setBrandId] = useState('')
  const [productId, setProductId] = useState('')
  const [variantId, setVariantId] = useState('')
  const [qty, setQty] = useState(1)

  const brandProducts = catalog.products.filter((p) => p.brand_id === brandId && p.active)
  const variants = productId ? variantsFor(catalog, productId) : []
  const product = catalog.products.find((p) => p.id === productId)
  const needsVariant = variants.length > 0

  function reset() {
    setProductId('')
    setVariantId('')
    setQty(1)
  }

  function add() {
    if (!product) return
    if (needsVariant && !variantId) return
    const brand = catalog.brands.find((b) => b.id === product.brand_id)
    const variant = variants.find((v) => v.id === variantId)
    const r = resolveUnitPrice(catalog.prices, catalog.fx, {
      productId: product.id,
      variantId: variant?.id ?? null,
      quoteCurrency: currency,
    })
    const commission = currentCommissionPercent(catalog.prices, {
      productId: product.id,
      variantId: variant?.id ?? null,
    })
    onAdd({
      key: nextKey(),
      product_id: product.id,
      pricing_variant_id: variant?.id ?? null,
      brand_snapshot: brand?.name ?? null,
      description_snapshot: variant ? `${product.name} (${variant.label})` : product.name,
      unit: variant?.unit ?? product.unit,
      quantity: qty,
      unit_price: r.unitPrice,
      commission_percent: commission,
      fx_note: r.fxNote,
      is_installation: false,
      notes: '',
    })
    reset()
  }

  return (
    <div className="card p-4">
      <h2 className="mb-3 text-base font-bold text-ink">{t('quote.addProduct')}</h2>
      <div className="space-y-3">
        <Field label={t('quote.pickBrand')}>
          <select
            className="input"
            value={brandId}
            onChange={(e) => {
              setBrandId(e.target.value)
              reset()
            }}
          >
            <option value="">—</option>
            {catalog.brands
              .filter((b) => b.active)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
          </select>
        </Field>

        {brandId && (
          <Field label={t('quote.pickProduct')}>
            <select
              className="input"
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value)
                setVariantId('')
              }}
            >
              <option value="">—</option>
              {brandProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        {needsVariant && (
          <Field label={t('quote.pickVariant')} hint={t('quote.variantRequired')}>
            <select className="input" value={variantId} onChange={(e) => setVariantId(e.target.value)}>
              <option value="">—</option>
              {variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </Field>
        )}

        {product && (
          <Field label={`${t('common.quantity')} (${t(`enums.unit.${(variants.find((v) => v.id === variantId)?.unit ?? product.unit)}`)})`}>
            <input
              className="input"
              type="number"
              step="any"
              min="0"
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
            />
          </Field>
        )}

        <button
          className="btn-primary w-full"
          disabled={!product || (needsVariant && !variantId)}
          onClick={add}
        >
          ➕ {t('quote.addLine')}
        </button>
      </div>
    </div>
  )
}
