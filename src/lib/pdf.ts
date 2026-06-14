import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { money, formatDate } from './format'
import type { Currency, Customer, Quote, QuoteLine } from './types'

const GOLD: [number, number, number] = [201, 151, 0]
const INK: [number, number, number] = [26, 26, 26]
const MUTED: [number, number, number] = [107, 107, 107]

// Unit labels — English, fixed, so the PDF always renders cleanly.
const UNIT_LABEL: Record<string, string> = {
  PER_METER: 'per meter',
  PER_UNIT: 'per unit',
  PER_HOUSE: 'per house',
  PER_COMPONENT: 'per component',
  PER_SQM: 'per m²',
}

const HOUSE_LABEL: Record<string, string> = {
  BROILER: 'Broiler', LAYER: 'Layer', BREEDER: 'Breeder', HATCHERY: 'Hatchery', MIXED: 'Mixed',
}

/** Load an image (PNG preferred, SVG fallback) and return a PNG data URL. */
export async function loadLogo(): Promise<{ dataUrl: string; w: number; h: number } | null> {
  for (const src of ['/UTC_logo_correct.jpeg', '/logo.png', '/logo.svg']) {
    try {
      const dataUrl = await toDataUrl(src)
      if (dataUrl) {
        const dims = await imageDims(dataUrl)
        return { dataUrl, ...dims }
      }
    } catch {
      /* try next */
    }
  }
  return null
}

function toDataUrl(src: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth || 320
      canvas.height = img.naturalHeight || 120
      const ctx = canvas.getContext('2d')
      if (!ctx) return resolve(null)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      try {
        resolve(canvas.toDataURL('image/png'))
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function imageDims(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => resolve({ w: 320, h: 120 })
    img.src = dataUrl
  })
}

export async function generateQuotePdf(args: {
  quote: Quote
  customer: Customer
  lines: QuoteLine[]
  currency: Currency
}): Promise<void> {
  const { quote, customer, lines, currency } = args
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 40
  let y = 40

  // ---- Header: logo + company name + tagline ------------------------------
  const logo = await loadLogo()
  if (logo) {
    const w = 150
    const h = (logo.h / logo.w) * w
    doc.addImage(logo.dataUrl, 'PNG', margin, y, w, Math.min(h, 60))
  } else {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...GOLD)
    doc.setFontSize(26)
    doc.text('UTC', margin, y + 24)
  }

  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...INK)
  doc.setFontSize(15)
  doc.text('United Trade Co.', pageW - margin, y + 14, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MUTED)
  doc.setFontSize(9)
  doc.text('For Poultry Packaging & Equipment', pageW - margin, y + 30, { align: 'right' })

  y += 72
  doc.setDrawColor(...GOLD)
  doc.setLineWidth(1.2)
  doc.line(margin, y, pageW - margin, y)
  y += 22

  // ---- Title --------------------------------------------------------------
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...INK)
  doc.setFontSize(18)
  doc.text('QUOTATION', margin, y)
  y += 8

  // ---- Meta blocks --------------------------------------------------------
  const leftX = margin
  const rightX = pageW / 2 + 10
  let metaY = y + 16
  doc.setFontSize(9)

  const labelVal = (x: number, yy: number, label: string, val: string) => {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...MUTED)
    doc.text(label.toUpperCase(), x, yy)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...INK)
    doc.text(val || '—', x, yy + 12)
  }

  labelVal(leftX, metaY, 'Customer', customer.company_name)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MUTED)
  const custLines = [customer.contact_name, customer.country, customer.contact_email, customer.contact_phone]
    .filter(Boolean) as string[]
  custLines.forEach((line, i) => doc.text(line, leftX, metaY + 26 + i * 11))

  labelVal(rightX, metaY, 'Quote No.', quote.quote_number ?? '(draft)')
  labelVal(rightX, metaY + 28, 'Date', formatDate(quote.created_at))
  labelVal(rightX + 140, metaY, 'Valid until', formatDate(quote.valid_until))
  labelVal(rightX + 140, metaY + 28, 'House type', quote.house_type ? HOUSE_LABEL[quote.house_type] : '—')

  metaY += 28 + Math.max(custLines.length * 11, 28)
  if (quote.project_name) {
    metaY += 18
    labelVal(leftX, metaY, 'Project', quote.project_name)
    metaY += 16
  }

  // ---- Line items table (NO commission / buy-side data) -------------------
  const body = lines
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((l) => [
      l.is_installation ? 'Installation' : l.brand_snapshot ?? '',
      l.description_snapshot + (l.notes ? `\n${l.notes}` : ''),
      l.is_installation ? '' : Number(l.quantity).toLocaleString(),
      l.unit ? UNIT_LABEL[l.unit] ?? '' : '',
      money(l.unit_price, currency),
      money(l.line_total, currency),
    ])

  autoTable(doc, {
    startY: metaY + 14,
    head: [['Brand', 'Description', 'Qty', 'Unit', 'Unit price', 'Amount']],
    body,
    theme: 'striped',
    headStyles: { fillColor: INK, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: INK },
    alternateRowStyles: { fillColor: [250, 248, 240] },
    columnStyles: {
      0: { cellWidth: 70 },
      2: { halign: 'right', cellWidth: 40 },
      3: { cellWidth: 60 },
      4: { halign: 'right', cellWidth: 75 },
      5: { halign: 'right', cellWidth: 80 },
    },
    margin: { left: margin, right: margin },
  })

  // ---- Totals -------------------------------------------------------------
  // @ts-expect-error lastAutoTable is added by the autotable plugin
  let ty = (doc.lastAutoTable?.finalY ?? metaY + 40) + 16
  const totalsX = pageW - margin - 200
  const valueX = pageW - margin

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...INK)
  doc.text('Subtotal', totalsX, ty)
  doc.text(money(quote.subtotal, currency), valueX, ty, { align: 'right' })
  ty += 18

  doc.setDrawColor(...GOLD)
  doc.setLineWidth(0.8)
  doc.line(totalsX, ty - 8, valueX, ty - 8)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('Total', totalsX, ty + 4)
  doc.setTextColor(...GOLD)
  doc.text(`${money(quote.total, currency)}`, valueX, ty + 4, { align: 'right' })
  ty += 30

  // ---- Notes / terms ------------------------------------------------------
  if (quote.notes) {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...MUTED)
    doc.setFontSize(9)
    doc.text('NOTES / TERMS', margin, ty)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...INK)
    const wrapped = doc.splitTextToSize(quote.notes, pageW - margin * 2)
    doc.text(wrapped, margin, ty + 14)
    ty += 14 + wrapped.length * 11
  }

  // ---- Footer -------------------------------------------------------------
  const footerY = doc.internal.pageSize.getHeight() - 30
  doc.setDrawColor(230, 230, 230)
  doc.line(margin, footerY - 12, pageW - margin, footerY - 12)
  doc.setFont('helvetica', 'italic')
  doc.setTextColor(...MUTED)
  doc.setFontSize(9)
  doc.text('Thank you for your business.', margin, footerY)
  doc.text('United Trade Co. — Cairo, Egypt', pageW - margin, footerY, { align: 'right' })

  const safeCompany = customer.company_name.replace(/[^\w\d-]+/g, '_').slice(0, 40)
  doc.save(`${quote.quote_number ?? 'UTC-DRAFT'}_${safeCompany}.pdf`)
}
