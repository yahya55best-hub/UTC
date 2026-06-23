import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, ImageRun, ShadingType,
} from 'docx'
import { money, formatDate } from './format'
import { asset } from './asset'
import { PRODUCT_INFO, itemKeyForLine } from './productInfo'
import en from '../i18n/en.json'
import ar from '../i18n/ar.json'
import type { Currency, Customer, Quote, QuoteLine } from './types'

export type DocLang = 'en' | 'ar'

export interface QuoteExportArgs {
  quote: Quote
  customer: Customer
  lines: QuoteLine[]
  currency: Currency
  lang: DocLang
}

const labels = (lang: DocLang) => (lang === 'ar' ? ar : en) as unknown as typeof en
const safeName = (s: string) => s.replace(/[^\w\d-]+/g, '_').slice(0, 40)
const EXCLUDED_NOTE: Bilingual = {
  en: 'Electrical cables and lighting systems are excluded from this quote scope — to be determined separately.',
  ar: 'الكابلات الكهربائية وأنظمة الإضاءة غير مشمولة في نطاق هذا العرض — تُحدَّد بشكل منفصل.',
}
interface Bilingual { en: string; ar: string }

/** Custom unit label + bilingual description for a line, if it maps to a product. */
function lineInfo(
  l: { description_snapshot: string; brand_snapshot: string | null; calc_meta?: Record<string, unknown> | null },
  lang: DocLang,
): { unit: string; desc: string } | null {
  const key = itemKeyForLine(l)
  const info = key ? PRODUCT_INFO[key] : null
  return info ? { unit: info.unit[lang], desc: info.desc[lang] } : null
}
const unitLabel = (L: typeof en, u: string | null) =>
  u ? (L.enums.unit as Record<string, string>)[u] ?? '' : ''
const houseLabel = (L: typeof en, h: string | null) =>
  h ? (L.enums.houseType as Record<string, string>)[h] ?? '' : '—'

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

function escapeHtml(s: string | null | undefined): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
}

function preload(src: string): Promise<void> {
  return new Promise((res) => {
    const img = new Image()
    img.onload = () => res()
    img.onerror = () => res()
    img.src = src
  })
}

// ===========================================================================
// PDF — rasterized via html2canvas so Arabic shapes/joins and renders RTL.
// ===========================================================================
function buildContainer({ quote, customer, lines, currency, lang }: QuoteExportArgs): HTMLDivElement {
  const L = labels(lang)
  const rtl = lang === 'ar'
  const dir = rtl ? 'rtl' : 'ltr'
  const sA = rtl ? 'right' : 'left'
  const eA = rtl ? 'left' : 'right'
  const font = rtl
    ? "'Segoe UI','Tahoma','Noto Naskh Arabic',Arial,sans-serif"
    : "'Segoe UI',Arial,sans-serif"

  const rows = lines
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((l) => {
      const info = lineInfo(l, lang)
      const unitText = info?.unit ?? unitLabel(L, l.unit)
      const descBlock = info ? `<div style="color:#666;font-size:10.5px;margin-top:2px">${escapeHtml(info.desc)}</div>` : ''
      return `<tr>
        <td style="padding:7px 8px;border-bottom:1px solid #eee;text-align:${sA};vertical-align:top">${escapeHtml(l.is_installation ? L.quote.installation : l.brand_snapshot)}</td>
        <td style="padding:7px 8px;border-bottom:1px solid #eee;text-align:${sA};vertical-align:top"><div style="font-weight:600">${escapeHtml(l.description_snapshot)}</div>${descBlock}${l.notes ? `<div style="color:#999;font-size:10px;margin-top:2px">${escapeHtml(l.notes)}</div>` : ''}</td>
        <td style="padding:7px 8px;border-bottom:1px solid #eee;text-align:${eA};vertical-align:top">${l.is_installation ? '' : Number(l.quantity).toLocaleString()}</td>
        <td style="padding:7px 8px;border-bottom:1px solid #eee;text-align:${sA};vertical-align:top">${escapeHtml(unitText)}</td>
        <td style="padding:7px 8px;border-bottom:1px solid #eee;text-align:${eA};vertical-align:top">${money(l.unit_price, currency)}</td>
        <td style="padding:7px 8px;border-bottom:1px solid #eee;text-align:${eA};vertical-align:top">${money(l.line_total, currency)}</td>
      </tr>`
    })
    .join('')

  const meta = (label: string, value: string) =>
    `<div style="margin-bottom:6px"><span style="color:#6B6B6B;font-size:11px">${escapeHtml(label)}: </span><span style="font-weight:700">${value}</span></div>`

  const c = document.createElement('div')
  c.dir = dir
  c.style.cssText = `position:absolute;left:-10000px;top:0;width:780px;background:#fff;color:#1A1A1A;font-family:${font};padding:32px;box-sizing:border-box;direction:${dir}`
  c.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #C28E0E;padding-bottom:14px;margin-bottom:18px">
      <img src="${asset('logo.png')}" style="height:62px;width:auto" />
      <div style="text-align:${eA}">
        <div style="font-size:18px;font-weight:800">${escapeHtml(L.app.name)}</div>
        <div style="font-size:11px;color:#6B6B6B">${escapeHtml(L.app.tagline)}</div>
      </div>
    </div>
    <div style="font-size:22px;font-weight:800;color:#C28E0E;margin-bottom:12px">${escapeHtml(L.pdf.quotation)}</div>
    <div style="display:flex;justify-content:space-between;gap:24px;margin-bottom:18px;font-size:13px">
      <div style="text-align:${sA}">
        <div style="color:#6B6B6B;font-weight:700;text-transform:uppercase;font-size:11px">${escapeHtml(L.pdf.billTo)}</div>
        <div style="font-weight:700;font-size:15px">${escapeHtml(customer.company_name)}</div>
        <div style="color:#555">${[customer.contact_name, customer.country, customer.contact_email, customer.contact_phone].filter(Boolean).map(escapeHtml).join('<br/>')}</div>
      </div>
      <div style="text-align:${eA};white-space:nowrap">
        ${meta(L.pdf.quoteNo, quote.quote_number ?? '—')}
        ${meta(L.pdf.date, formatDate(quote.created_at))}
        ${meta(L.pdf.validUntil, formatDate(quote.valid_until))}
        ${meta(L.pdf.houseType, houseLabel(L, quote.house_type))}
        ${quote.project_name ? meta(L.pdf.project, escapeHtml(quote.project_name)) : ''}
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;direction:${dir}">
      <thead><tr style="background:#1A1A1A;color:#fff">
        <th style="padding:8px;text-align:${sA}">${escapeHtml(L.pdf.brand)}</th>
        <th style="padding:8px;text-align:${sA}">${escapeHtml(L.pdf.description)}</th>
        <th style="padding:8px;text-align:${eA}">${escapeHtml(L.pdf.qty)}</th>
        <th style="padding:8px;text-align:${sA}">${escapeHtml(L.pdf.unit)}</th>
        <th style="padding:8px;text-align:${eA}">${escapeHtml(L.pdf.unitPrice)}</th>
        <th style="padding:8px;text-align:${eA}">${escapeHtml(L.pdf.amount)}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="display:flex;justify-content:${rtl ? 'flex-start' : 'flex-end'};margin-top:16px">
      <table style="font-size:14px">
        <tr><td style="padding:4px 16px;color:#555">${escapeHtml(L.pdf.subtotal)}</td><td style="padding:4px 0;text-align:${eA};font-weight:600">${money(quote.subtotal, currency)}</td></tr>
        <tr><td style="padding:8px 16px;font-weight:800;border-top:2px solid #C28E0E">${escapeHtml(L.pdf.total)}</td><td style="padding:8px 0;text-align:${eA};font-weight:800;color:#C28E0E;border-top:2px solid #C28E0E;font-size:17px">${money(quote.total, currency)}</td></tr>
      </table>
    </div>
    ${quote.notes ? `<div style="margin-top:18px"><div style="color:#6B6B6B;font-weight:700;text-transform:uppercase;font-size:11px">${escapeHtml(L.pdf.terms)}</div><div style="font-size:12px;color:#333;white-space:pre-wrap">${escapeHtml(quote.notes)}</div></div>` : ''}
    <div style="margin-top:12px;font-size:11px;color:#9a6a00;background:#fff8e6;border:1px solid #f0e0a8;border-radius:6px;padding:8px 10px">⚠ ${escapeHtml(EXCLUDED_NOTE[lang])}</div>
    <div style="margin-top:28px;border-top:1px solid #e6e6e6;padding-top:10px;display:flex;justify-content:space-between;color:#6B6B6B;font-size:11px;font-style:italic">
      <span>${escapeHtml(L.pdf.thankYou)}</span><span>United Trade Co. — Cairo, Egypt</span>
    </div>`
  return c
}

export async function downloadQuotePdf(args: QuoteExportArgs): Promise<void> {
  await preload(asset('logo.png'))
  const container = buildContainer(args)
  document.body.appendChild(container)
  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      windowWidth: container.offsetWidth,
    })
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const margin = 24
    const contentW = pageW - margin * 2
    const scale = contentW / canvas.width
    const pageHpx = (pageH - margin * 2) / scale
    let y = 0
    let page = 0
    while (y < canvas.height) {
      const sliceH = Math.min(pageHpx, canvas.height - y)
      const slice = document.createElement('canvas')
      slice.width = canvas.width
      slice.height = sliceH
      const ctx = slice.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, slice.width, slice.height)
      ctx.drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH)
      if (page > 0) pdf.addPage()
      pdf.addImage(slice.toDataURL('image/png'), 'PNG', margin, margin, contentW, sliceH * scale)
      y += sliceH
      page++
    }
    pdf.save(`${args.quote.quote_number ?? 'UTC-DRAFT'}_${safeName(args.customer.company_name)}${args.lang === 'ar' ? '_AR' : ''}.pdf`)
  } finally {
    document.body.removeChild(container)
  }
}

// ===========================================================================
// Word (.docx) — Word shapes Arabic natively and the file stays editable.
// ===========================================================================
export async function downloadQuoteDocx({ quote, customer, lines, currency, lang }: QuoteExportArgs): Promise<void> {
  const L = labels(lang)
  const rtl = lang === 'ar'
  const align = rtl ? AlignmentType.RIGHT : AlignmentType.LEFT
  const endAlign = rtl ? AlignmentType.LEFT : AlignmentType.RIGHT
  const GOLD = 'C28E0E'
  const INK = '1A1A1A'

  const run = (text: unknown, opts: { bold?: boolean; color?: string; size?: number } = {}) =>
    new TextRun({ text: String(text ?? ''), rightToLeft: rtl, bold: opts.bold, color: opts.color, size: opts.size })
  const para = (children: TextRun[], opts: { alignment?: (typeof AlignmentType)[keyof typeof AlignmentType]; after?: number } = {}) =>
    new Paragraph({ alignment: opts.alignment ?? align, bidirectional: rtl, spacing: { after: opts.after ?? 60 }, children })

  const cell = (text: unknown, opts: { bold?: boolean; fill?: string; color?: string; alignment?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) =>
    new TableCell({
      shading: opts.fill ? { fill: opts.fill, color: 'auto', type: ShadingType.CLEAR } : undefined,
      margins: { top: 60, bottom: 60, left: 80, right: 80 },
      children: [
        new Paragraph({
          alignment: opts.alignment ?? align,
          bidirectional: rtl,
          children: [new TextRun({ text: String(text ?? ''), bold: opts.bold, color: opts.color, rightToLeft: rtl, size: 19 })],
        }),
      ],
    })

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      cell(L.pdf.brand, { bold: true, fill: INK, color: 'FFFFFF' }),
      cell(L.pdf.description, { bold: true, fill: INK, color: 'FFFFFF' }),
      cell(L.pdf.qty, { bold: true, fill: INK, color: 'FFFFFF', alignment: endAlign }),
      cell(L.pdf.unit, { bold: true, fill: INK, color: 'FFFFFF' }),
      cell(L.pdf.unitPrice, { bold: true, fill: INK, color: 'FFFFFF', alignment: endAlign }),
      cell(L.pdf.amount, { bold: true, fill: INK, color: 'FFFFFF', alignment: endAlign }),
    ],
  })

  // description cell with an optional smaller bilingual product description
  const descCell = (l: QuoteLine) => {
    const info = lineInfo(l, lang)
    const paras = [
      new Paragraph({ alignment: align, bidirectional: rtl, children: [new TextRun({ text: l.description_snapshot, bold: true, rightToLeft: rtl, size: 19 })] }),
    ]
    if (info) paras.push(new Paragraph({ alignment: align, bidirectional: rtl, children: [new TextRun({ text: info.desc, color: '666666', rightToLeft: rtl, size: 15 })] }))
    if (l.notes) paras.push(new Paragraph({ alignment: align, bidirectional: rtl, children: [new TextRun({ text: l.notes, color: '999999', rightToLeft: rtl, size: 14 })] }))
    return new TableCell({ margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: paras })
  }

  const dataRows = lines
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((l) => {
      const info = lineInfo(l, lang)
      return new TableRow({
        children: [
          cell(l.is_installation ? L.quote.installation : l.brand_snapshot),
          descCell(l),
          cell(l.is_installation ? '' : Number(l.quantity).toLocaleString(), { alignment: endAlign }),
          cell(info?.unit ?? unitLabel(L, l.unit)),
          cell(money(l.unit_price, currency), { alignment: endAlign }),
          cell(money(l.line_total, currency), { alignment: endAlign }),
        ],
      })
    })

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    visuallyRightToLeft: rtl,
    rows: [headerRow, ...dataRows],
  })

  // logo
  let logoPara: Paragraph | null = null
  try {
    const buf = await fetch(asset('logo.png')).then((r) => r.arrayBuffer())
    logoPara = new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new ImageRun({ type: 'png', data: buf, transformation: { width: 150, height: 144 } })],
    })
  } catch {
    /* no logo */
  }

  const metaLine = (label: string, value: string) =>
    para([run(`${label}: `, { color: '6B6B6B' }), run(value, { bold: true })], { after: 30 })

  const children: (Paragraph | Table)[] = []
  if (logoPara) children.push(logoPara)
  children.push(
    new Paragraph({ alignment: AlignmentType.CENTER, children: [run(L.app.name, { bold: true, size: 30 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 }, children: [run(L.app.tagline, { color: GOLD, size: 18 })] }),
    para([run(L.pdf.quotation, { bold: true, color: GOLD, size: 32 })], { after: 160 }),
    para([run(L.pdf.billTo, { color: '6B6B6B', bold: true })], { after: 20 }),
    para([run(customer.company_name, { bold: true, size: 24 })], { after: 20 }),
    para([run([customer.contact_name, customer.country, customer.contact_email, customer.contact_phone].filter(Boolean).join('  ·  '), { color: '555555' })], { after: 120 }),
    metaLine(L.pdf.quoteNo, quote.quote_number ?? '—'),
    metaLine(L.pdf.date, formatDate(quote.created_at)),
    metaLine(L.pdf.validUntil, formatDate(quote.valid_until)),
    metaLine(L.pdf.houseType, houseLabel(L, quote.house_type)),
    ...(quote.project_name ? [metaLine(L.pdf.project, quote.project_name)] : []),
    new Paragraph({ spacing: { after: 80 }, children: [] }),
    table,
    new Paragraph({ spacing: { after: 80 }, children: [] }),
    para([run(`${L.pdf.subtotal}:  `, { color: '555555' }), run(money(quote.subtotal, currency), { bold: true })], { alignment: endAlign, after: 20 }),
    para([run(`${L.pdf.total}:  `, { bold: true }), run(money(quote.total, currency), { bold: true, color: GOLD, size: 26 })], { alignment: endAlign, after: 160 }),
  )
  if (quote.notes) {
    children.push(
      para([run(L.pdf.terms, { color: '6B6B6B', bold: true })], { after: 20 }),
      para([run(quote.notes, { color: '333333' })], { after: 160 }),
    )
  }
  children.push(para([run(`⚠ ${EXCLUDED_NOTE[lang]}`, { color: '9A6A00' })], { after: 160 }))
  children.push(para([run(L.pdf.thankYou, { color: '6B6B6B' })], { alignment: AlignmentType.CENTER }))

  const doc = new Document({
    styles: { default: { document: { run: { font: rtl ? 'Arial' : 'Calibri' } } } },
    sections: [
      {
        properties: { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
        children,
      },
    ],
  })
  const blob = await Packer.toBlob(doc)
  saveBlob(blob, `${quote.quote_number ?? 'UTC-DRAFT'}_${safeName(customer.company_name)}${rtl ? '_AR' : ''}.docx`)
}
