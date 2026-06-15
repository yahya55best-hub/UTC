import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { loadLogo } from './pdf'
import { formatDate } from './format'
import { orderedSections, type CalcResult } from './calc'
import type { Customer, LightingPlan, Quote } from './types'

const GOLD: [number, number, number] = [201, 151, 0]
const INK: [number, number, number] = [26, 26, 26]
const MUTED: [number, number, number] = [107, 107, 107]

/**
 * Engineering report / BOQ (Addendum C.12). UTC-branded, shows every computed
 * quantity with the formula used, then the full equipment BOQ. Excludes prices
 * (it's the engineering document, not the customer quote).
 */
export async function generateBoqPdf(args: {
  quote: Quote
  customer: Customer
  inputs: Record<string, unknown>
  result: CalcResult
  lighting: LightingPlan | null
}): Promise<void> {
  const { quote, customer, inputs, result, lighting } = args
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 40
  let y = 40

  const logo = await loadLogo()
  if (logo) {
    const w = 150
    doc.addImage(logo.dataUrl, 'PNG', margin, y, w, Math.min((logo.h / logo.w) * w, 60))
  } else {
    doc.setFont('helvetica', 'bold').setTextColor(...GOLD).setFontSize(26)
    doc.text('UTC', margin, y + 24)
  }
  doc.setFont('helvetica', 'bold').setTextColor(...INK).setFontSize(15)
  doc.text('United Trade Co.', pageW - margin, y + 14, { align: 'right' })
  doc.setFont('helvetica', 'normal').setTextColor(...MUTED).setFontSize(9)
  doc.text('For Poultry Packaging & Equipment', pageW - margin, y + 30, { align: 'right' })

  y += 72
  doc.setDrawColor(...GOLD).setLineWidth(1.2)
  doc.line(margin, y, pageW - margin, y)
  y += 22

  doc.setFont('helvetica', 'bold').setTextColor(...INK).setFontSize(18)
  doc.text('ENGINEERING REPORT / BOQ', margin, y)
  y += 18
  doc.setFont('helvetica', 'normal').setTextColor(...MUTED).setFontSize(9)
  doc.text(
    `${customer.company_name}  ·  ${quote.project_name ?? ''}  ·  ${quote.quote_number ?? '(draft)'}  ·  ${formatDate(quote.created_at)}`,
    margin, y,
  )
  y += 16

  // House information
  const houseRows = Object.entries(inputs)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => [k.replace(/_/g, ' '), String(v)])
  autoTable(doc, {
    startY: y,
    head: [['House information', '']],
    body: houseRows,
    theme: 'plain',
    headStyles: { fillColor: INK, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 10 },
    bodyStyles: { fontSize: 9, textColor: INK },
    columnStyles: { 0: { cellWidth: 200, textColor: MUTED }, 1: { fontStyle: 'bold' } },
    margin: { left: margin, right: margin },
  })
  // @ts-expect-error plugin field
  y = doc.lastAutoTable.finalY + 16

  // Computed metrics with formulas, grouped by section
  const sections = orderedSections([...result.metrics.map((m) => m.section), ...result.proposals.map((p) => p.section)])
  const bodyRows: (string | { content: string; colSpan?: number; styles?: object })[][] = []
  for (const sec of sections) {
    bodyRows.push([{ content: sec, colSpan: 3, styles: { fillColor: [250, 248, 240], fontStyle: 'bold', textColor: GOLD } }])
    for (const m of result.metrics.filter((x) => x.section === sec)) {
      bodyRows.push([m.label, m.value == null ? '—' : `${m.value.toLocaleString()} ${m.unit}`, m.formula])
    }
    for (const p of result.proposals.filter((x) => x.section === sec)) {
      bodyRows.push([
        `${p.label}${p.brand_snapshot ? ` (${p.brand_snapshot})` : ''}`,
        `${p.quantity.toLocaleString()} ${unitShort(p.unit)}`,
        p.formula,
      ])
    }
  }
  autoTable(doc, {
    startY: y,
    head: [['Item', 'Result', 'Formula used']],
    body: bodyRows as never,
    theme: 'grid',
    headStyles: { fillColor: INK, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 8.5, textColor: INK },
    columnStyles: { 0: { cellWidth: 150 }, 1: { cellWidth: 90, halign: 'right' }, 2: { textColor: MUTED } },
    margin: { left: margin, right: margin },
  })
  // @ts-expect-error plugin field
  y = doc.lastAutoTable.finalY + 16

  // Lighting plan (authoritative HATO output if present)
  if (lighting && (lighting.lamp_count || lighting.source === 'HATO_SOFTWARE')) {
    autoTable(doc, {
      startY: y,
      head: [['Lighting plan', '']],
      body: [
        ['Source', lighting.source],
        ['Lamp model', lighting.lamp_model ?? '—'],
        ['Lamp count', String(lighting.lamp_count ?? '—')],
        ['Rows', String(lighting.rows ?? '—')],
        ['Target lux', String(lighting.target_lux ?? '—')],
        ['Uniformity %', String(lighting.uniformity_pct ?? '—')],
        ['Avg / Min / Max lux', `${lighting.avg_lux ?? '—'} / ${lighting.min_lux ?? '—'} / ${lighting.max_lux ?? '—'}`],
      ],
      theme: 'plain',
      headStyles: { fillColor: INK, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 10 },
      bodyStyles: { fontSize: 9, textColor: INK },
      columnStyles: { 0: { cellWidth: 200, textColor: MUTED }, 1: { fontStyle: 'bold' } },
      margin: { left: margin, right: margin },
    })
    // @ts-expect-error plugin field
    y = doc.lastAutoTable.finalY + 16
  }

  if (result.warnings.length > 0) {
    doc.setFont('helvetica', 'bold').setTextColor(180, 120, 0).setFontSize(9)
    doc.text('Notes & assumptions:', margin, y)
    doc.setFont('helvetica', 'normal').setTextColor(...MUTED)
    result.warnings.forEach((w, i) => doc.text(`• ${w}`, margin, y + 12 + i * 11))
  }

  const footerY = doc.internal.pageSize.getHeight() - 26
  doc.setDrawColor(230, 230, 230).line(margin, footerY - 12, pageW - margin, footerY - 12)
  doc.setFont('helvetica', 'italic').setTextColor(...MUTED).setFontSize(8)
  doc.text('Engineering BOQ — quantities computed by the UTC sizing engine; verify before order.', margin, footerY)

  const safe = customer.company_name.replace(/[^\w\d-]+/g, '_').slice(0, 40)
  doc.save(`${quote.quote_number ?? 'UTC-DRAFT'}_${safe}_BOQ.pdf`)
}

function unitShort(u: string): string {
  return (
    { PER_METER: 'm', PER_UNIT: 'unit', PER_HOUSE: 'house', PER_COMPONENT: 'pc', PER_SQM: 'm²' }[u] ?? ''
  )
}
