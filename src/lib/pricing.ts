import type { Currency, FxRate, PriceListEntry, PriceValueType } from './types'

/**
 * Pick the currently-effective price entry for a product/variant in a given
 * currency and value type. "Current" = the entry with the latest effective_from
 * that is <= today, whose effective_to is null or >= today. (Section 4.3)
 */
export function currentPrice(
  entries: PriceListEntry[],
  opts: {
    productId: string
    variantId?: string | null
    currency: Currency
    valueType?: PriceValueType
  },
): PriceListEntry | null {
  const today = new Date().toISOString().slice(0, 10)
  const valueType = opts.valueType ?? 'UNIT_PRICE'
  const matches = entries.filter(
    (e) =>
      e.product_id === opts.productId &&
      (opts.variantId ? e.pricing_variant_id === opts.variantId : e.pricing_variant_id === null) &&
      e.currency === opts.currency &&
      e.value_type === valueType &&
      e.effective_from <= today &&
      (e.effective_to === null || e.effective_to >= today),
  )
  if (matches.length === 0) return null
  matches.sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))
  return matches[0]
}

/** Find an FX rate; supports direct, inverse, or 1.0 for same currency. */
export function fxRate(rates: FxRate[], from: Currency, to: Currency): number | null {
  if (from === to) return 1
  const direct = rates.find((r) => r.from_currency === from && r.to_currency === to)
  if (direct) return Number(direct.rate)
  const inverse = rates.find((r) => r.from_currency === to && r.to_currency === from)
  if (inverse && Number(inverse.rate) !== 0) return 1 / Number(inverse.rate)
  return null
}

export interface ResolvedPrice {
  /** Final unit price in the quote currency (snapshot onto the line). */
  unitPrice: number
  /** Currency the price was actually found in (before any conversion). */
  sourceCurrency: Currency
  /** True if an FX conversion was applied. */
  converted: boolean
  /** Human note when converted, e.g. "Converted from EUR @ 54". */
  fxNote: string | null
  /** True if no price entry was found at all (price not yet set). */
  missing: boolean
}

/**
 * Resolve the unit price to use on a quote line, in the quote currency.
 * Tries the quote currency directly; otherwise converts from any available
 * currency using the FX table (Section 5 currency handling). Always returns a
 * value the salesperson can override manually.
 */
export function resolveUnitPrice(
  entries: PriceListEntry[],
  rates: FxRate[],
  opts: { productId: string; variantId?: string | null; quoteCurrency: Currency },
): ResolvedPrice {
  // 1) direct match in the quote currency
  const direct = currentPrice(entries, {
    productId: opts.productId,
    variantId: opts.variantId,
    currency: opts.quoteCurrency,
  })
  if (direct) {
    return {
      unitPrice: Number(direct.amount),
      sourceCurrency: opts.quoteCurrency,
      converted: false,
      fxNote: null,
      missing: Number(direct.amount) === 0,
    }
  }

  // 2) try other currencies and convert
  const others: Currency[] = (['EUR', 'USD', 'EGP'] as Currency[]).filter(
    (c) => c !== opts.quoteCurrency,
  )
  for (const src of others) {
    const entry = currentPrice(entries, {
      productId: opts.productId,
      variantId: opts.variantId,
      currency: src,
    })
    if (entry) {
      const rate = fxRate(rates, src, opts.quoteCurrency)
      if (rate != null) {
        const converted = Math.round(Number(entry.amount) * rate * 100) / 100
        return {
          unitPrice: converted,
          sourceCurrency: src,
          converted: true,
          fxNote: `Converted from ${src} @ ${rate.toLocaleString(undefined, { maximumFractionDigits: 4 })}`,
          missing: Number(entry.amount) === 0,
        }
      }
    }
  }

  // 3) nothing found — price not set
  return { unitPrice: 0, sourceCurrency: opts.quoteCurrency, converted: false, fxNote: null, missing: true }
}

/** Current commission percent for an agent-mode product/variant (internal). */
export function currentCommissionPercent(
  entries: PriceListEntry[],
  opts: { productId: string; variantId?: string | null },
): number | null {
  // commission entries are stored against the variant/product, currency-agnostic
  const today = new Date().toISOString().slice(0, 10)
  const matches = entries.filter(
    (e) =>
      e.product_id === opts.productId &&
      (opts.variantId ? e.pricing_variant_id === opts.variantId : e.pricing_variant_id === null) &&
      e.value_type === 'COMMISSION_PERCENT' &&
      e.effective_from <= today &&
      (e.effective_to === null || e.effective_to >= today),
  )
  if (matches.length === 0) return null
  matches.sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))
  return Number(matches[0].amount)
}

/** Convert an amount between currencies for reporting (returns null if no path). */
export function convert(rates: FxRate[], amount: number, from: Currency, to: Currency): number | null {
  const rate = fxRate(rates, from, to)
  if (rate == null) return null
  return Math.round(amount * rate * 100) / 100
}
