import type { Currency } from './types'

const SYMBOL: Record<Currency, string> = { EUR: '€', USD: '$', EGP: 'E£' }

/** Format an amount with its currency, e.g. "€ 1,250.00". */
export function money(amount: number | null | undefined, currency: Currency): string {
  const v = Number(amount ?? 0)
  return `${SYMBOL[currency]} ${v.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function number(value: number | null | undefined, digits = 2): string {
  return Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })
}

export function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function addDaysISO(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export { SYMBOL as currencySymbols }
