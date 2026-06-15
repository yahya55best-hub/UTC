import { jsPDF } from 'jspdf'
import { money, formatDate } from './format'
import en from '../i18n/en.json'
import ar from '../i18n/ar.json'
import type { Currency, Customer, Quote, QuoteLine } from './types'

type Lang = 'en' | 'ar'

/**
 * Branded quote PDF that supports Arabic. jsPDF's vector text can't shape
 * Arabic, so we lay the quote out as an HTML element (the browser shapes the
 * Arabic + handles RTL correctly) and rasterize it into the PDF via jsPDF.html.
 * Excludes all commission / buy-side data (same as the English vector PDF).
 */
export async function generateQuotePdfHtml(args: {
  quote: Quote
  customer: Customer
  lines: QuoteLine[]
  currency: Currency
  lang: Lang
}): Promise<void> {
  const { quote, customer, lines, currency, lang } = args
  const L = (lang === 'ar' ? ar : en) as unknown as typeof en
  const rtl = lang === 'ar'
  const dir = rtl ? 'rtl' : 'ltr'
  const startAlign = rtl ? 'right' : 'left'
  const endAlign = rtl ? 'left' : 'right'
  const font = rtl
    ? "'Segoe UI', 'Tahoma', 'Noto Naskh Arabic', Arial, sans-serif"
    : "'Segoe UI', Arial, sans-serif"

  await preload('/logo.png')

  const esc = (s: string | null | undefined) =>
    String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

  const u = (unit: string | null) =>
    unit ? (L.enums.unit as Record<string, string>)[unit] ?? '' : ''
  const houseLabel = quote.house_type
    ? (L.enums.houseType as Record<string, string>)[quote.house_type] ?? ''
    : '—'

  const rows = lines
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((l) => {
      const desc = esc(l.description_snapshot) + (l.notes ? `<div style="color:#888;font-size:11px">${esc(l.notes)}</div>` : '')
      return `<tr>
        <td style="padding:7px 8px;border-bottom:1px solid #eee;text-align:${startAlign}">${esc(l.is_installation ? L.quote.installation : l.brand_snapshot)}</td>
        <td style="padding:7px 8px;border-bottom:1px solid #eee;text-align:${startAlign}">${desc}</td>
        <td style="padding:7px 8px;border-bottom:1px solid #eee;text-align:${endAlign}">${l.is_installation ? '' : Number(l.quantity).toLocaleString()}</td>
        <td style="padding:7px 8px;border-bottom:1px solid #eee;text-align:${startAlign}">${u(l.unit)}</td>
        <td style="padding:7px 8px;border-bottom:1px solid #eee;text-align:${endAlign}">${money(l.unit_price, currency)}</td>
        <td style="padding:7px 8px;border-bottom:1px solid #eee;text-align:${endAlign}">${money(l.line_total, currency)}</td>
      </tr>`
    })
    .join('')

  const container = document.createElement('div')
  container.dir = dir
  container.style.cssText = `position:fixed;top:0;left:-10000px;width:794px;background:#fff;color:#1A1A1A;font-family:${font};padding:36px;box-sizing:border-box;direction:${dir};`
  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #C28E0E;padding-bottom:14px;margin-bottom:18px">
      <img src="/logo.png" style="height:64px;width:auto" crossorigin="anonymous" />
      <div style="text-align:${endAlign}">
        <div style="font-size:18px;font-weight:800;color:#1A1A1A">${esc(L.app.name)}</div>
        <div style="font-size:11px;color:#6B6B6B">${esc(L.app.tagline)}</div>
      </div>
    </div>

    <div style="font-size:22px;font-weight:800;color:#C28E0E;margin-bottom:12px">${esc(L.pdf.quotation)}</div>

    <div style="display:flex;justify-content:space-between;gap:24px;margin-bottom:18px;font-size:13px">
      <div style="text-align:${startAlign}">
        <div style="color:#6B6B6B;font-weight:700;text-transform:uppercase;font-size:11px">${esc(L.pdf.billTo)}</div>
        <div style="font-weight:700;font-size:15px">${esc(customer.company_name)}</div>
        <div style="color:#555">${[customer.contact_name, customer.country, customer.contact_email, customer.contact_phone].filter(Boolean).map(esc).join('<br/>')}</div>
      </div>
      <div style="text-align:${endAlign};white-space:nowrap">
        ${metaRow(L.pdf.quoteNo, quote.quote_number ?? '—')}
        ${metaRow(L.pdf.date, formatDate(quote.created_at))}
        ${metaRow(L.pdf.validUntil, formatDate(quote.valid_until))}
        ${metaRow(L.pdf.houseType, houseLabel)}
        ${quote.project_name ? metaRow(L.pdf.project, esc(quote.project_name)) : ''}
      </div>
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:13px;direction:${dir}">
      <thead>
        <tr style="background:#1A1A1A;color:#fff">
          <th style="padding:8px;text-align:${startAlign}">${esc(L.pdf.brand)}</th>
          <th style="padding:8px;text-align:${startAlign}">${esc(L.pdf.description)}</th>
          <th style="padding:8px;text-align:${endAlign}">${esc(L.pdf.qty)}</th>
          <th style="padding:8px;text-align:${startAlign}">${esc(L.pdf.unit)}</th>
          <th style="padding:8px;text-align:${endAlign}">${esc(L.pdf.unitPrice)}</th>
          <th style="padding:8px;text-align:${endAlign}">${esc(L.pdf.amount)}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div style="display:flex;justify-content:${rtl ? 'flex-start' : 'flex-end'};margin-top:16px">
      <table style="font-size:14px">
        <tr><td style="padding:4px 16px;color:#555">${esc(L.pdf.subtotal)}</td><td style="padding:4px 0;text-align:${endAlign};font-weight:600">${money(quote.subtotal, currency)}</td></tr>
        <tr><td style="padding:8px 16px;font-weight:800;border-top:2px solid #C28E0E">${esc(L.pdf.total)}</td><td style="padding:8px 0;text-align:${endAlign};font-weight:800;color:#C28E0E;border-top:2px solid #C28E0E;font-size:17px">${money(quote.total, currency)}</td></tr>
      </table>
    </div>

    ${quote.notes ? `<div style="margin-top:18px"><div style="color:#6B6B6B;font-weight:700;text-transform:uppercase;font-size:11px">${esc(L.pdf.terms)}</div><div style="font-size:12px;color:#333;white-space:pre-wrap">${esc(quote.notes)}</div></div>` : ''}

    <div style="margin-top:28px;border-top:1px solid #e6e6e6;padding-top:10px;display:flex;justify-content:space-between;color:#6B6B6B;font-size:11px;font-style:italic">
      <span>${esc(L.pdf.thankYou)}</span>
      <span>United Trade Co. — Cairo, Egypt</span>
    </div>
  `

  function metaRow(label: string, value: string) {
    return `<div style="margin-bottom:6px"><span style="color:#6B6B6B;font-size:11px">${esc(label)}: </span><span style="font-weight:700">${value}</span></div>`
  }

  document.body.appendChild(container)
  try {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    await new Promise<void>((resolve) => {
      doc.html(container, {
        callback: () => resolve(),
        x: 10,
        y: 10,
        width: 190,
        windowWidth: 794,
        autoPaging: 'text',
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      })
    })
    const safe = customer.company_name.replace(/[^\w\d-]+/g, '_').slice(0, 40)
    doc.save(`${quote.quote_number ?? 'UTC-DRAFT'}_${safe}${rtl ? '_AR' : ''}.pdf`)
  } finally {
    document.body.removeChild(container)
  }
}

function preload(src: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve()
    img.onerror = () => resolve()
    img.src = src
  })
}
