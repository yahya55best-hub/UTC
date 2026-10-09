import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useEngineTables } from '../lib/hooks'
import {
  runEngine, orderedSections,
  type CalcInputs, type CalcResult, type Proposal, type EngineData,
} from '../lib/calc'
import { generateBoqPdf } from '../lib/boqPdf'
import { PRODUCT_INFO } from '../lib/productInfo'
import { Field, Spinner } from './ui'
import type { Brand, Customer, LightingPlan, Quote, UnitType } from '../lib/types'

export interface CalcSnapshot {
  inputs: CalcInputs
  result: CalcResult
  lighting: LightingPlan | null
}

interface ManualItem {
  id: string
  label: string
  unitLabel: string
  quantity: number
  unitPrice: number
  internal: boolean
}
interface MarginState {
  enabled: boolean
  mode: 'percent' | 'roundup'
  percent: number
  sections: Record<string, boolean>
}

const blankLighting = (): LightingPlan => ({
  lamp_model: null, lamp_count: null, rows: null, target_lux: null,
  uniformity_pct: null, avg_lux: null, min_lux: null, max_lux: null,
  source: 'ESTIMATE', notes: null,
})

const MANUAL_SECTION = 'Manual items'

// Common dealer add-ons (internal extras the customer often needs).
const SUGGESTED_EXTRAS: { label: string; unitLabel: string }[] = [
  { label: 'Feeding spare pans / repair kit', unitLabel: 'set' },
  { label: 'Drinking spare nipples kit', unitLabel: 'set' },
  { label: 'Backup climate controller', unitLabel: 'unit' },
  { label: 'Spare tunnel fan', unitLabel: 'fan' },
  { label: 'Spare side fan', unitLabel: 'fan' },
  { label: 'Cooling pump spare', unitLabel: 'unit' },
  { label: 'Installation accessories / fasteners', unitLabel: 'set' },
]

const uid = () => `m${Date.now()}${Math.floor(Math.random() * 1e4)}`

function applyMargin(qty: number, section: string, m: MarginState): number {
  if (!m.enabled || !m.sections[section]) return qty
  if (m.mode === 'roundup') return Math.ceil(qty)
  return Math.ceil(qty * (1 + m.percent / 100))
}

export function HouseSizingPanel({
  brands,
  quote,
  customer,
  onAddLines,
  onSnapshot,
}: {
  brands: Brand[]
  quote: Quote
  customer: Customer | null
  onAddLines: (proposals: Proposal[], inputs: CalcInputs, lighting: LightingPlan | null) => void
  onSnapshot: (snap: CalcSnapshot) => void
}) {
  const { t } = useTranslation()
  const eng = useEngineTables()

  const [inp, setInp] = useState<CalcInputs>({
    length_m: 126, width_m: 14, eave_height_m: 3,
    bird_type: 'BROILER', system: 'FLOOR', capacity_method: 'DENSITY',
    tunnel_air_speed_ms: 2.6,
    feed_brand: 'UTC.stav', water_brand: 'UTC.stav', lamp_rows: 3,
  })
  const [result, setResult] = useState<CalcResult | null>(null)
  const [lighting, setLighting] = useState<LightingPlan>(blankLighting())

  // Configurator state — SEPARATE from the auto result so it survives recompute.
  const [overrides, setOverrides] = useState<Record<string, number>>({}) // key -> qty
  const [excluded, setExcluded] = useState<Record<string, boolean>>({})   // key/id -> excluded
  const [manualItems, setManualItems] = useState<ManualItem[]>([])
  const [margin, setMargin] = useState<MarginState>({ enabled: false, mode: 'percent', percent: 10, sections: {} })

  useEffect(() => {
    if (eng.loading) return
    setInp((p) => ({
      ...p,
      tunnel_fan_model_id:
        p.tunnel_fan_model_id ??
        (eng.fans.find((f) => f.name === 'Pericoli EWS 53' && f.capacity_m3h != null) ??
          eng.fans.find((f) => (f.fan_type === 'TUNNEL' || f.fan_type === 'EXHAUST') && f.capacity_m3h != null))?.id,
      side_fan_model_id:
        p.side_fan_model_id ??
        (eng.fans.find((f) => f.fan_type === 'SIDE' && /EWS\s*42/i.test(f.name) && f.capacity_m3h != null) ??
          eng.fans.find((f) => f.fan_type === 'SIDE' && f.capacity_m3h != null))?.id,
      recirc_fan_model_id: p.recirc_fan_model_id ?? eng.fans.find((f) => f.fan_type === 'CIRCULATION')?.id,
      cooling_pad_model_id: p.cooling_pad_model_id ?? eng.pads[0]?.id,
      heater_model_id: p.heater_model_id ?? eng.heaters[0]?.id,
      air_inlet_model_id: p.air_inlet_model_id ?? eng.inlets.find((m) => m.airflow_per_inlet_m3h != null)?.id,
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eng.loading])

  const engineData: EngineData = useMemo(
    () => ({
      settings: eng.settings, fans: eng.fans, pads: eng.pads, heaters: eng.heaters,
      inlets: eng.inlets, cages: eng.cages, silos: eng.silos,
      brandName: (id) => brands.find((b) => b.id === id)?.name ?? null,
    }),
    [eng, brands],
  )

  function set<K extends keyof CalcInputs>(k: K, v: CalcInputs[K]) {
    setInp((p) => ({ ...p, [k]: v }))
  }
  const num = (v: string) => (v === '' ? undefined : Number(v))

  // Reactive: recompute the AUTO result whenever a given changes. Overrides,
  // exclusions and manual items live in separate state, so they survive this.
  useEffect(() => {
    if (eng.loading) return
    const r = runEngine(inp, engineData)
    setResult(r)
    onSnapshot({ inputs: inp, result: r, lighting })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inp, engineData, eng.loading])

  // ---- derived helpers ------------------------------------------------------
  const effQty = (p: Proposal) => (p.key in overrides ? overrides[p.key] : p.quantity)
  const extQty = (p: Proposal) => applyMargin(effQty(p), p.section, margin)
  const isChecked = (key: string) => !excluded[key]
  const setOverride = (key: string, q: number) => setOverrides((o) => ({ ...o, [key]: q }))
  const resetOverride = (key: string) => setOverrides((o) => { const n = { ...o }; delete n[key]; return n })
  const toggleKey = (key: string) => setExcluded((e) => ({ ...e, [key]: !e[key] }))

  const sections = result ? orderedSections([...result.metrics.map((m) => m.section), ...result.proposals.map((p) => p.section)]) : []

  function toggleSection(sec: string, on: boolean) {
    const keys = (result?.proposals ?? []).filter((p) => p.section === sec).map((p) => p.key)
    setExcluded((e) => { const n = { ...e }; keys.forEach((k) => { n[k] = !on }); return n })
  }

  function addManual() {
    setManualItems((a) => [...a, { id: uid(), label: 'New item', unitLabel: 'unit', quantity: 1, unitPrice: 0, internal: false }])
  }
  function addSuggestion(label: string, unitLabel: string) {
    setManualItems((a) => [...a, { id: uid(), label, unitLabel, quantity: 1, unitPrice: 0, internal: true }])
  }

  function addToQuote() {
    const autoChosen: Proposal[] = (result?.proposals ?? [])
      .filter((p) => isChecked(p.key))
      .map((p) => ({ ...p, quantity: extQty(p) }))
      .filter((p) => p.quantity > 0)
    const manualChosen: Proposal[] = manualItems
      .filter((m) => isChecked(m.id))
      .map((m) => ({
        key: m.id, section: MANUAL_SECTION, label: m.label, brand_snapshot: null,
        description: m.label, unit: 'PER_UNIT' as UnitType, quantity: m.quantity,
        formula: 'manual item', unitPrice: m.unitPrice, unitLabel: m.unitLabel,
        internal: m.internal, isManual: true,
      }))
    const lit = lighting.lamp_count ? { ...lighting, source: 'HATO_SOFTWARE' as const } : lighting
    onAddLines([...autoChosen, ...manualChosen], inp, lighting.lamp_count ? lit : null)
    if (result) onSnapshot({ inputs: inp, result, lighting: lighting.lamp_count ? lit : null })
  }

  async function downloadBoq() {
    if (!result || !customer) return
    await generateBoqPdf({
      quote, customer,
      inputs: inp as unknown as Record<string, unknown>,
      result,
      lighting: lighting.lamp_count ? { ...lighting, source: 'HATO_SOFTWARE' } : null,
    })
  }

  if (eng.loading) return <Spinner />

  const tunnelFans = eng.fans.filter((f) => f.fan_type === 'TUNNEL' || f.fan_type === 'EXHAUST')
  const sideFans = eng.fans.filter((f) => f.fan_type === 'SIDE')
  const recircFans = eng.fans.filter((f) => f.fan_type === 'CIRCULATION')
  const unitFor = (p: Proposal) => (p.itemKey && PRODUCT_INFO[p.itemKey]?.unit.en) || p.unit.replace('PER_', '').toLowerCase()

  return (
    <div className="card p-4">
      <h2 className="mb-1 text-base font-bold text-ink">🏠 {t('calc.title')}</h2>
      <p className="mb-4 text-xs text-ink-muted">{t('calc.subtitle')}</p>

      {/* Inputs */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Field label={t('calc.length')}>
          <input className="input tabular" type="number" step="any" value={inp.length_m} onChange={(e) => set('length_m', Number(e.target.value))} />
        </Field>
        <Field label={t('calc.width')}>
          <input className="input tabular" type="number" step="any" value={inp.width_m} onChange={(e) => set('width_m', Number(e.target.value))} />
        </Field>
        <Field label={t('calc.eave')}>
          <input className="input tabular" type="number" step="any" value={inp.eave_height_m} onChange={(e) => set('eave_height_m', Number(e.target.value))} />
        </Field>
        <Field label={t('calc.ridge')}>
          <input className="input tabular" type="number" step="any" value={inp.ridge_height_m ?? ''} onChange={(e) => set('ridge_height_m', num(e.target.value) ?? null)} />
        </Field>
        <Field label={t('calc.birdType')}>
          <select className="input" value={inp.bird_type} onChange={(e) => set('bird_type', e.target.value as CalcInputs['bird_type'])}>
            <option value="BROILER">{t('enums.houseType.BROILER')}</option>
            <option value="LAYER">{t('enums.houseType.LAYER')}</option>
            <option value="BREEDER">{t('enums.houseType.BREEDER')}</option>
          </select>
        </Field>
        <Field label={t('calc.system')}>
          <select className="input" value={inp.system} onChange={(e) => {
            const s = e.target.value as CalcInputs['system']
            set('system', s)
            set('capacity_method', s === 'CAGED' ? 'CAGE' : 'DENSITY')
          }}>
            <option value="FLOOR">{t('calc.floor')}</option>
            <option value="CAGED">{t('calc.caged')}</option>
          </select>
        </Field>
        <Field label={t('calc.capacityMethod')}>
          <select className="input" value={inp.capacity_method} onChange={(e) => set('capacity_method', e.target.value as CalcInputs['capacity_method'])}>
            <option value="DENSITY">{t('calc.density')}</option>
            <option value="WEIGHT">{t('calc.weight')}</option>
            <option value="CAGE">{t('calc.cage')}</option>
          </select>
        </Field>
        <Field label={t('calc.tunnelSpeed')}>
          <input className="input tabular" type="number" step="any" value={inp.tunnel_air_speed_ms ?? ''} onChange={(e) => set('tunnel_air_speed_ms', num(e.target.value))} />
        </Field>
        <Field label={t('calc.siloDays')}>
          <input className="input tabular" type="number" step="any" value={inp.silo_days_storage ?? 3} onChange={(e) => set('silo_days_storage', num(e.target.value))} />
        </Field>
        {inp.capacity_method === 'WEIGHT' && (
          <>
            <Field label={t('calc.density2')}>
              <input className="input tabular" type="number" step="any" value={inp.stocking_density_kgm2 ?? ''} onChange={(e) => set('stocking_density_kgm2', num(e.target.value))} />
            </Field>
            <Field label={t('calc.targetWeight')}>
              <input className="input tabular" type="number" step="any" value={inp.target_bird_weight_kg ?? ''} onChange={(e) => set('target_bird_weight_kg', num(e.target.value))} />
            </Field>
          </>
        )}
      </div>

      {(inp.system === 'CAGED' || inp.capacity_method === 'CAGE') && (
        <div className="mt-3 grid gap-3 rounded-lg bg-gold-50/50 p-3 sm:grid-cols-4">
          <Field label={t('calc.cageModel')}>
            <select className="input" value={inp.cage_model_id ?? ''} onChange={(e) => set('cage_model_id', e.target.value || undefined)}>
              <option value="">—</option>
              {eng.cages.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label={t('calc.rows')}><input className="input tabular" type="number" value={inp.number_of_rows ?? ''} onChange={(e) => set('number_of_rows', num(e.target.value))} /></Field>
          <Field label={t('calc.tiers')}><input className="input tabular" type="number" value={inp.tiers_per_row ?? ''} onChange={(e) => set('tiers_per_row', num(e.target.value))} /></Field>
          <Field label={t('calc.endClearance')}><input className="input tabular" type="number" step="any" value={inp.end_clearance_m ?? ''} onChange={(e) => set('end_clearance_m', num(e.target.value))} /></Field>
        </div>
      )}

      {/* Equipment model selectors */}
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <ModelSelect label={t('calc.tunnelFan')} value={inp.tunnel_fan_model_id} onChange={(v) => set('tunnel_fan_model_id', v)} options={tunnelFans.map((f) => ({ id: f.id, label: f.name + (f.capacity_m3h == null ? ' ⚠ no capacity' : '') }))} />
        <ModelSelect label={t('calc.sideFan')} value={inp.side_fan_model_id} onChange={(v) => set('side_fan_model_id', v)} options={sideFans.map((f) => ({ id: f.id, label: f.name + (f.capacity_m3h == null ? ' ⚠' : '') }))} />
        <ModelSelect label={t('calc.recircFan')} value={inp.recirc_fan_model_id} onChange={(v) => set('recirc_fan_model_id', v)} options={recircFans.map((f) => ({ id: f.id, label: f.name }))} />
        <ModelSelect label={t('calc.padModel')} value={inp.cooling_pad_model_id} onChange={(v) => set('cooling_pad_model_id', v)} options={eng.pads.map((p) => ({ id: p.id, label: p.name }))} />
        <ModelSelect label={t('calc.heaterModel')} value={inp.heater_model_id} onChange={(v) => set('heater_model_id', v)} options={eng.heaters.map((h) => ({ id: h.id, label: h.name }))} />
        <ModelSelect label={t('calc.inletModel')} value={inp.air_inlet_model_id} onChange={(v) => set('air_inlet_model_id', v)} options={eng.inlets.map((m) => ({ id: m.id, label: m.name + (m.airflow_per_inlet_m3h == null ? ' ⚠' : '') }))} />
        <Field label={t('calc.feedBrand')}>
          <select className="input" value={inp.feed_brand} onChange={(e) => set('feed_brand', e.target.value)}>
            {brands.filter((b) => b.active).map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}
          </select>
        </Field>
        <Field label={t('calc.waterBrand')}>
          <select className="input" value={inp.water_brand} onChange={(e) => set('water_brand', e.target.value)}>
            {brands.filter((b) => b.active).map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}
          </select>
        </Field>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button className="btn-outline" onClick={() => result && onSnapshot({ inputs: inp, result, lighting })}>↻ {t('calc.calculate')}</button>
        <span className="text-xs text-ink-muted">{t('calc.autoHint')}</span>
      </div>

      {/* Results */}
      {result && (
        <div className="mt-5">
          {result.warnings.length > 0 && (
            <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {result.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
            </div>
          )}
          {result.birds != null && (
            <div className="mb-3 inline-block rounded-lg bg-gold-50 px-3 py-1.5 text-sm font-semibold text-gold-800">{t('calc.birds')}: {result.birds.toLocaleString()}</div>
          )}

          {/* Dealer extras / margin */}
          <details className="mb-3 rounded-lg border border-black/5 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-ink">💼 {t('calc.dealer')}</summary>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={margin.enabled} onChange={(e) => setMargin((m) => ({ ...m, enabled: e.target.checked }))} />{t('calc.marginOn')}</label>
              <select className="input w-auto px-2 py-1 text-xs" value={margin.mode} onChange={(e) => setMargin((m) => ({ ...m, mode: e.target.value as MarginState['mode'] }))}>
                <option value="percent">{t('calc.marginPercent')}</option>
                <option value="roundup">{t('calc.marginRoundup')}</option>
              </select>
              {margin.mode === 'percent' && (
                <input className="input w-20 px-2 py-1 text-xs tabular" type="number" value={margin.percent} onChange={(e) => setMargin((m) => ({ ...m, percent: Number(e.target.value) }))} />
              )}
              <span className="text-xs text-ink-muted">{t('calc.marginHint')}</span>
            </div>
            {margin.enabled && (
              <div className="mt-2 flex flex-wrap gap-2">
                {sections.filter((s) => s !== MANUAL_SECTION).map((s) => (
                  <label key={s} className="flex items-center gap-1 rounded border border-black/10 px-2 py-0.5 text-xs">
                    <input type="checkbox" checked={!!margin.sections[s]} onChange={(e) => setMargin((m) => ({ ...m, sections: { ...m.sections, [s]: e.target.checked } }))} />{s}
                  </label>
                ))}
              </div>
            )}
            <div className="mt-3 text-xs font-semibold text-ink-muted">{t('calc.suggested')}</div>
            <div className="mt-1 flex flex-wrap gap-2">
              {SUGGESTED_EXTRAS.map((s) => (
                <button key={s.label} className="btn-outline px-2 py-1 text-xs" onClick={() => addSuggestion(s.label, s.unitLabel)}>➕ {s.label}</button>
              ))}
            </div>
          </details>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-black/5">
                  <th className="th w-8"></th>
                  <th className="th">{t('calc.item')}</th>
                  <th className="th text-end">{t('common.quantity')}</th>
                  <th className="th">{t('common.unit')}</th>
                  <th className="th">{t('calc.formula')}</th>
                </tr>
              </thead>
              <tbody>
                {sections.map((sec) => {
                  const secProps = result.proposals.filter((p) => p.section === sec)
                  const allOn = secProps.length > 0 && secProps.every((p) => isChecked(p.key))
                  return (
                    <SectionBlock
                      key={sec}
                      section={sec}
                      allOn={allOn}
                      onToggleSection={(on) => toggleSection(sec, on)}
                      metrics={result.metrics.filter((m) => m.section === sec)}
                      proposals={secProps}
                      overrides={overrides}
                      excluded={excluded}
                      margin={margin}
                      unitFor={unitFor}
                      effQty={effQty}
                      extQty={extQty}
                      onToggle={toggleKey}
                      onOverride={setOverride}
                      onReset={resetOverride}
                    />
                  )
                })}

                {/* Manual items */}
                <tr className="bg-gold-50/40">
                  <td className="td font-bold text-gold-700" colSpan={5}>
                    {MANUAL_SECTION}
                    <button className="btn-ghost ms-2 px-2 py-0.5 text-xs text-gold-700" onClick={addManual}>➕ {t('calc.addManual')}</button>
                  </td>
                </tr>
                {manualItems.map((m) => (
                  <tr key={m.id} className="border-b border-black/5">
                    <td className="td"><input type="checkbox" checked={isChecked(m.id)} onChange={() => toggleKey(m.id)} /></td>
                    <td className="td">
                      <input className="input px-2 py-1 text-sm" value={m.label} onChange={(e) => setManualItems((a) => a.map((x) => x.id === m.id ? { ...x, label: e.target.value } : x))} />
                      <label className="mt-1 flex items-center gap-1 text-[11px] text-ink-muted">
                        <input type="checkbox" checked={m.internal} onChange={(e) => setManualItems((a) => a.map((x) => x.id === m.id ? { ...x, internal: e.target.checked } : x))} />
                        {t('calc.internalOnly')}
                      </label>
                    </td>
                    <td className="td text-end">
                      <input className="input w-20 px-2 py-1 text-end tabular" type="number" step="any" value={m.quantity} onChange={(e) => setManualItems((a) => a.map((x) => x.id === m.id ? { ...x, quantity: Number(e.target.value) } : x))} />
                    </td>
                    <td className="td">
                      <input className="input w-16 px-2 py-1 text-xs" value={m.unitLabel} onChange={(e) => setManualItems((a) => a.map((x) => x.id === m.id ? { ...x, unitLabel: e.target.value } : x))} />
                    </td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <input className="input w-24 px-2 py-1 text-end tabular" type="number" step="any" placeholder={t('common.unitPrice')} value={m.unitPrice} onChange={(e) => setManualItems((a) => a.map((x) => x.id === m.id ? { ...x, unitPrice: Number(e.target.value) } : x))} />
                        <button className="btn-ghost px-2 py-1 text-red-600" onClick={() => setManualItems((a) => a.filter((x) => x.id !== m.id))}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Lighting plan */}
          <details className="mt-4 rounded-lg border border-black/5 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-ink">{t('calc.lightingPlan')}</summary>
            <p className="mt-1 text-xs text-ink-muted">{t('calc.lightingHint')}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-4">
              <Field label={t('calc.lampModel')}><input className="input" value={lighting.lamp_model ?? ''} onChange={(e) => setLighting((l) => ({ ...l, lamp_model: e.target.value || null }))} /></Field>
              <Field label={t('calc.lampCount')}><input className="input tabular" type="number" value={lighting.lamp_count ?? ''} onChange={(e) => setLighting((l) => ({ ...l, lamp_count: e.target.value ? Number(e.target.value) : null }))} /></Field>
              <Field label={t('calc.lampRows')}><input className="input tabular" type="number" value={lighting.rows ?? ''} onChange={(e) => setLighting((l) => ({ ...l, rows: e.target.value ? Number(e.target.value) : null }))} /></Field>
              <Field label={t('calc.targetLux')}><input className="input tabular" type="number" value={lighting.target_lux ?? ''} onChange={(e) => setLighting((l) => ({ ...l, target_lux: e.target.value ? Number(e.target.value) : null }))} /></Field>
              <Field label={t('calc.uniformity')}><input className="input tabular" type="number" value={lighting.uniformity_pct ?? ''} onChange={(e) => setLighting((l) => ({ ...l, uniformity_pct: e.target.value ? Number(e.target.value) : null }))} /></Field>
              <Field label="Avg lux"><input className="input tabular" type="number" value={lighting.avg_lux ?? ''} onChange={(e) => setLighting((l) => ({ ...l, avg_lux: e.target.value ? Number(e.target.value) : null }))} /></Field>
              <Field label="Min lux"><input className="input tabular" type="number" value={lighting.min_lux ?? ''} onChange={(e) => setLighting((l) => ({ ...l, min_lux: e.target.value ? Number(e.target.value) : null }))} /></Field>
              <Field label="Max lux"><input className="input tabular" type="number" value={lighting.max_lux ?? ''} onChange={(e) => setLighting((l) => ({ ...l, max_lux: e.target.value ? Number(e.target.value) : null }))} /></Field>
            </div>
          </details>

          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn-primary" onClick={addToQuote}>➕ {t('calc.addToQuote')}</button>
            <button className="btn-outline" onClick={downloadBoq} disabled={!customer}>⬇ {t('calc.downloadBoq')}</button>
          </div>
        </div>
      )}
    </div>
  )
}

function SectionBlock({
  section, allOn, onToggleSection, metrics, proposals,
  overrides, excluded, margin, unitFor, effQty, extQty, onToggle, onOverride, onReset,
}: {
  section: string
  allOn: boolean
  onToggleSection: (on: boolean) => void
  metrics: CalcResult['metrics']
  proposals: Proposal[]
  overrides: Record<string, number>
  excluded: Record<string, boolean>
  margin: MarginState
  unitFor: (p: Proposal) => string
  effQty: (p: Proposal) => number
  extQty: (p: Proposal) => number
  onToggle: (k: string) => void
  onOverride: (k: string, q: number) => void
  onReset: (k: string) => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <tr className="bg-gold-50/40">
        <td className="td">{proposals.length > 0 && <input type="checkbox" checked={allOn} onChange={(e) => onToggleSection(e.target.checked)} />}</td>
        <td className="td font-bold text-gold-700" colSpan={4}>{section}</td>
      </tr>
      {metrics.map((m, i) => (
        <tr key={`m${i}`} className="border-b border-black/5">
          <td className="td"></td>
          <td className="td text-ink-muted">{m.label}</td>
          <td className="td text-end tabular">{m.value == null ? '—' : m.value.toLocaleString()}</td>
          <td className="td text-xs">{m.unit}</td>
          <td className="td text-xs text-ink-muted">{m.formula}{m.warning ? ` · ⚠ ${m.warning}` : ''}</td>
        </tr>
      ))}
      {proposals.map((p) => {
        const overridden = p.key in overrides
        const base = effQty(p)
        const ext = extQty(p)
        const marginActive = margin.enabled && !!margin.sections[p.section] && ext !== base
        return (
          <tr key={p.key} className={`border-b border-black/5 ${excluded[p.key] ? 'opacity-50' : ''}`}>
            <td className="td"><input type="checkbox" checked={!excluded[p.key]} onChange={() => onToggle(p.key)} /></td>
            <td className="td">
              <div className="font-semibold text-ink">
                {p.label}
                {overridden && <span className="badge ms-1 bg-blue-100 text-blue-700">{t('calc.manualBadge')}</span>}
              </div>
              <div className="text-[11px] text-ink-muted">{p.brand_snapshot ?? ''}{p.warning ? ` · ⚠ ${p.warning}` : ''}</div>
            </td>
            <td className="td text-end">
              <input className="input w-20 px-2 py-1 text-end tabular" type="number" step="any" value={base} onChange={(e) => onOverride(p.key, Number(e.target.value))} />
              {marginActive && <div className="text-[11px] font-semibold text-green-700">→ {ext.toLocaleString()}</div>}
            </td>
            <td className="td text-xs">{unitFor(p)}</td>
            <td className="td text-xs text-ink-muted">
              {p.formula}
              {overridden && <button className="btn-ghost ms-1 px-1 py-0 text-[11px] text-gold-700" onClick={() => onReset(p.key)}>↺ {t('calc.reset')}</button>}
            </td>
          </tr>
        )
      })}
    </>
  )
}

function ModelSelect({ label, value, onChange, options }: { label: string; value?: string; onChange: (v: string | undefined) => void; options: { id: string; label: string }[] }) {
  return (
    <Field label={label}>
      <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">—</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </Field>
  )
}
