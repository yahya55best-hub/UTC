import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useEngineTables } from '../lib/hooks'
import {
  runEngine, orderedSections,
  type CalcInputs, type CalcResult, type Proposal, type EngineData,
} from '../lib/calc'
import { generateBoqPdf } from '../lib/boqPdf'
import { Field, Spinner } from './ui'
import type { Brand, Customer, LightingPlan, Quote } from '../lib/types'

export interface CalcSnapshot {
  inputs: CalcInputs
  result: CalcResult
  lighting: LightingPlan | null
}

const blankLighting = (): LightingPlan => ({
  lamp_model: null, lamp_count: null, rows: null, target_lux: null,
  uniformity_pct: null, avg_lux: null, min_lux: null, max_lux: null,
  source: 'ESTIMATE', notes: null,
})

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
    tunnel_air_speed_ms: 3.0, effective_opening_height_m: 2.0,
    feed_brand: 'UTC.stav', water_brand: 'UTC.stav', lamp_rows: 3,
  })
  const [result, setResult] = useState<CalcResult | null>(null)
  const [edited, setEdited] = useState<Proposal[]>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [lighting, setLighting] = useState<LightingPlan>(blankLighting())

  // Auto-select sensible default equipment models once the tables load, so the
  // first calculation already covers every category (fans, inlets, pads, …).
  useEffect(() => {
    if (eng.loading) return
    setInp((p) => ({
      ...p,
      tunnel_fan_model_id:
        p.tunnel_fan_model_id ??
        eng.fans.find((f) => (f.fan_type === 'TUNNEL' || f.fan_type === 'EXHAUST') && f.capacity_m3h != null)?.id,
      side_fan_model_id:
        p.side_fan_model_id ?? eng.fans.find((f) => f.fan_type === 'SIDE' && f.capacity_m3h != null)?.id,
      recirc_fan_model_id: p.recirc_fan_model_id ?? eng.fans.find((f) => f.fan_type === 'CIRCULATION')?.id,
      cooling_pad_model_id: p.cooling_pad_model_id ?? eng.pads[0]?.id,
      heater_model_id: p.heater_model_id ?? eng.heaters[0]?.id,
      air_inlet_model_id:
        p.air_inlet_model_id ?? eng.inlets.find((m) => m.airflow_per_inlet_m3h != null)?.id,
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eng.loading])

  const engineData: EngineData = useMemo(
    () => ({
      settings: eng.settings, fans: eng.fans, pads: eng.pads, heaters: eng.heaters,
      inlets: eng.inlets, cages: eng.cages,
      brandName: (id) => brands.find((b) => b.id === id)?.name ?? null,
    }),
    [eng, brands],
  )

  function set<K extends keyof CalcInputs>(k: K, v: CalcInputs[K]) {
    setInp((p) => ({ ...p, [k]: v }))
  }
  const num = (v: string) => (v === '' ? undefined : Number(v))

  function compute() {
    const r = runEngine(inp, engineData)
    setResult(r)
    setEdited(r.proposals.map((p) => ({ ...p })))
    setSelected(Object.fromEntries(r.proposals.map((p) => [p.key, true])))
    onSnapshot({ inputs: inp, result: r, lighting })
  }

  function addToQuote() {
    const chosen = edited.filter((p) => selected[p.key] && p.quantity > 0)
    // Apply HATO lighting count if provided as authoritative.
    const lit = lighting.lamp_count ? { ...lighting, source: 'HATO_SOFTWARE' as const } : lighting
    onAddLines(chosen, inp, lighting.lamp_count ? lit : null)
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
  const sections = result
    ? orderedSections([...result.metrics.map((m) => m.section), ...edited.map((p) => p.section)])
    : []

  return (
    <div className="card p-4">
      <h2 className="mb-1 text-base font-bold text-ink">🏠 {t('calc.title')}</h2>
      <p className="mb-4 text-xs text-ink-muted">{t('calc.subtitle')}</p>

      {/* Inputs */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Field label={t('calc.length')}>
          <input className="input tabular" type="number" step="any" value={inp.length_m}
            onChange={(e) => set('length_m', Number(e.target.value))} />
        </Field>
        <Field label={t('calc.width')}>
          <input className="input tabular" type="number" step="any" value={inp.width_m}
            onChange={(e) => set('width_m', Number(e.target.value))} />
        </Field>
        <Field label={t('calc.eave')}>
          <input className="input tabular" type="number" step="any" value={inp.eave_height_m}
            onChange={(e) => set('eave_height_m', Number(e.target.value))} />
        </Field>
        <Field label={t('calc.ridge')}>
          <input className="input tabular" type="number" step="any" value={inp.ridge_height_m ?? ''}
            onChange={(e) => set('ridge_height_m', num(e.target.value) ?? null)} />
        </Field>
        <Field label={t('calc.birdType')}>
          <select className="input" value={inp.bird_type} onChange={(e) => set('bird_type', e.target.value as CalcInputs['bird_type'])}>
            <option value="BROILER">{t('enums.houseType.BROILER')}</option>
            <option value="LAYER">{t('enums.houseType.LAYER')}</option>
            <option value="BREEDER">{t('enums.houseType.BREEDER')}</option>
          </select>
        </Field>
        <Field label={t('calc.system')}>
          <select className="input" value={inp.system}
            onChange={(e) => {
              const s = e.target.value as CalcInputs['system']
              set('system', s)
              if (s === 'CAGED') set('capacity_method', 'CAGE')
              else set('capacity_method', 'DENSITY')
            }}>
            <option value="FLOOR">{t('calc.floor')}</option>
            <option value="CAGED">{t('calc.caged')}</option>
          </select>
        </Field>
        <Field label={t('calc.capacityMethod')}>
          <select className="input" value={inp.capacity_method}
            onChange={(e) => set('capacity_method', e.target.value as CalcInputs['capacity_method'])}>
            <option value="DENSITY">{t('calc.density')}</option>
            <option value="WEIGHT">{t('calc.weight')}</option>
            <option value="CAGE">{t('calc.cage')}</option>
          </select>
        </Field>
        <Field label={t('calc.tunnelSpeed')}>
          <input className="input tabular" type="number" step="any" value={inp.tunnel_air_speed_ms ?? ''}
            onChange={(e) => set('tunnel_air_speed_ms', num(e.target.value))} />
        </Field>
        <Field label={t('calc.openingHeight')}>
          <input className="input tabular" type="number" step="any" value={inp.effective_opening_height_m ?? ''}
            onChange={(e) => set('effective_opening_height_m', num(e.target.value))} />
        </Field>

        {inp.capacity_method === 'WEIGHT' && (
          <>
            <Field label={t('calc.density2')}>
              <input className="input tabular" type="number" step="any" value={inp.stocking_density_kgm2 ?? ''}
                onChange={(e) => set('stocking_density_kgm2', num(e.target.value))} />
            </Field>
            <Field label={t('calc.targetWeight')}>
              <input className="input tabular" type="number" step="any" value={inp.target_bird_weight_kg ?? ''}
                onChange={(e) => set('target_bird_weight_kg', num(e.target.value))} />
            </Field>
          </>
        )}
      </div>

      {/* Caged inputs */}
      {(inp.system === 'CAGED' || inp.capacity_method === 'CAGE') && (
        <div className="mt-3 grid gap-3 rounded-lg bg-gold-50/50 p-3 sm:grid-cols-4">
          <Field label={t('calc.cageModel')}>
            <select className="input" value={inp.cage_model_id ?? ''} onChange={(e) => set('cage_model_id', e.target.value || undefined)}>
              <option value="">—</option>
              {eng.cages.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label={t('calc.rows')}>
            <input className="input tabular" type="number" value={inp.number_of_rows ?? ''} onChange={(e) => set('number_of_rows', num(e.target.value))} />
          </Field>
          <Field label={t('calc.tiers')}>
            <input className="input tabular" type="number" value={inp.tiers_per_row ?? ''} onChange={(e) => set('tiers_per_row', num(e.target.value))} />
          </Field>
          <Field label={t('calc.endClearance')}>
            <input className="input tabular" type="number" step="any" value={inp.end_clearance_m ?? ''} onChange={(e) => set('end_clearance_m', num(e.target.value))} />
          </Field>
        </div>
      )}

      {/* Equipment model selectors */}
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <ModelSelect label={t('calc.tunnelFan')} value={inp.tunnel_fan_model_id} onChange={(v) => set('tunnel_fan_model_id', v)}
          options={tunnelFans.map((f) => ({ id: f.id, label: f.name + (f.capacity_m3h == null ? ' ⚠ no capacity' : '') }))} />
        <ModelSelect label={t('calc.sideFan')} value={inp.side_fan_model_id} onChange={(v) => set('side_fan_model_id', v)}
          options={sideFans.map((f) => ({ id: f.id, label: f.name + (f.capacity_m3h == null ? ' ⚠' : '') }))} />
        <ModelSelect label={t('calc.recircFan')} value={inp.recirc_fan_model_id} onChange={(v) => set('recirc_fan_model_id', v)}
          options={recircFans.map((f) => ({ id: f.id, label: f.name }))} />
        <ModelSelect label={t('calc.padModel')} value={inp.cooling_pad_model_id} onChange={(v) => set('cooling_pad_model_id', v)}
          options={eng.pads.map((p) => ({ id: p.id, label: p.name }))} />
        <ModelSelect label={t('calc.heaterModel')} value={inp.heater_model_id} onChange={(v) => set('heater_model_id', v)}
          options={eng.heaters.map((h) => ({ id: h.id, label: h.name }))} />
        <ModelSelect label={t('calc.inletModel')} value={inp.air_inlet_model_id} onChange={(v) => set('air_inlet_model_id', v)}
          options={eng.inlets.map((m) => ({ id: m.id, label: m.name + (m.airflow_per_inlet_m3h == null ? ' ⚠' : '') }))} />
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

      <button className="btn-primary mt-4" onClick={compute}>⚙ {t('calc.calculate')}</button>

      {/* Results */}
      {result && (
        <div className="mt-5">
          {result.warnings.length > 0 && (
            <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {result.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
            </div>
          )}

          {result.birds != null && (
            <div className="mb-3 inline-block rounded-lg bg-gold-50 px-3 py-1.5 text-sm font-semibold text-gold-800">
              {t('calc.birds')}: {result.birds.toLocaleString()}
            </div>
          )}

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
                {sections.map((sec) => (
                  <FragmentSection
                    key={sec}
                    section={sec}
                    metrics={result.metrics.filter((m) => m.section === sec)}
                    proposals={edited.filter((p) => p.section === sec)}
                    selected={selected}
                    onToggle={(k) => setSelected((s) => ({ ...s, [k]: !s[k] }))}
                    onQty={(k, q) => setEdited((arr) => arr.map((p) => (p.key === k ? { ...p, quantity: q } : p)))}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Lighting plan (HATO authoritative) */}
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

function FragmentSection({
  section, metrics, proposals, selected, onToggle, onQty,
}: {
  section: string
  metrics: CalcResult['metrics']
  proposals: Proposal[]
  selected: Record<string, boolean>
  onToggle: (k: string) => void
  onQty: (k: string, q: number) => void
}) {
  return (
    <>
      <tr className="bg-gold-50/40">
        <td className="td font-bold text-gold-700" colSpan={5}>{section}</td>
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
      {proposals.map((p) => (
        <tr key={p.key} className="border-b border-black/5">
          <td className="td">
            <input type="checkbox" checked={!!selected[p.key]} onChange={() => onToggle(p.key)} />
          </td>
          <td className="td">
            <div className="font-semibold text-ink">{p.label}</div>
            <div className="text-[11px] text-ink-muted">{p.brand_snapshot ?? ''}{p.warning ? ` · ⚠ ${p.warning}` : ''}</div>
          </td>
          <td className="td text-end">
            <input className="input w-24 px-2 py-1 text-end tabular" type="number" step="any" value={p.quantity}
              onChange={(e) => onQty(p.key, Number(e.target.value))} />
          </td>
          <td className="td text-xs">{p.unit.replace('PER_', '').toLowerCase()}</td>
          <td className="td text-xs text-ink-muted">{p.formula}</td>
        </tr>
      ))}
    </>
  )
}

function ModelSelect({
  label, value, onChange, options,
}: {
  label: string
  value?: string
  onChange: (v: string | undefined) => void
  options: { id: string; label: string }[]
}) {
  return (
    <Field label={label}>
      <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">—</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </Field>
  )
}
