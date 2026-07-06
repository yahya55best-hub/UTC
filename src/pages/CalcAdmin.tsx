import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useEngineTables } from '../lib/hooks'
import { useCatalog } from '../lib/hooks'
import { PageHeader, Spinner, Field, Modal } from '../components/ui'
import type { CalcSetting, FanType } from '../lib/types'

/** Inline numeric editor that commits on blur. */
function NumCell({
  value,
  onCommit,
  placeholder,
}: {
  value: number | null
  onCommit: (v: number | null) => void
  placeholder?: string
}) {
  return (
    <input
      className="input w-28 px-2 py-1 text-end tabular"
      type="number"
      step="any"
      defaultValue={value ?? ''}
      placeholder={placeholder ?? 'not set'}
      onBlur={(e) => {
        const raw = e.target.value
        const next = raw === '' ? null : Number(raw)
        if (next !== value) onCommit(next)
      }}
    />
  )
}

export function CalcAdminPage() {
  const { t } = useTranslation()
  const eng = useEngineTables()
  const catalog = useCatalog()
  const [addingFan, setAddingFan] = useState(false)

  if (eng.loading || catalog.loading) return <Spinner />

  const brandName = (id: string | null) => catalog.brands.find((b) => b.id === id)?.name ?? '—'

  async function updateSetting(key: string, value: number | null) {
    await supabase.from('calc_settings').update({ value }).eq('key', key)
    eng.reload()
  }
  async function updateRow(table: string, id: string, patch: Record<string, unknown>) {
    await supabase.from(table).update(patch).eq('id', id)
    eng.reload()
  }
  async function del(table: string, id: string) {
    await supabase.from(table).delete().eq('id', id)
    eng.reload()
  }

  // group settings by category
  const byCat = eng.settings.reduce<Record<string, CalcSetting[]>>((acc, s) => {
    const c = s.category ?? 'other'
    ;(acc[c] ??= []).push(s)
    return acc
  }, {})

  return (
    <div>
      <PageHeader title={t('calc.settings')} subtitle={t('calc.title')} />

      {/* calc_settings grouped by category */}
      {Object.entries(byCat).map(([cat, rows]) => (
        <div key={cat} className="card mb-4 p-4">
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-gold-700">{cat}</h3>
          <table className="w-full">
            <tbody>
              {rows.map((s) => (
                <tr key={s.key} className="border-b border-black/5 last:border-0">
                  <td className="td">
                    <div className="font-semibold text-ink">{s.key}</div>
                    <div className="text-[11px] text-ink-muted">{s.description}</div>
                  </td>
                  <td className="td text-end">
                    <NumCell value={s.value} onCommit={(v) => updateSetting(s.key, v)} />
                  </td>
                  <td className="td w-16 text-xs text-ink-muted">{s.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {/* Fan models */}
      <div className="card mb-4 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wide text-gold-700">Fan models</h3>
          <button className="btn-outline px-3 py-1 text-xs" onClick={() => setAddingFan(true)}>➕ Fan</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-black/5">
                <th className="th">Name</th>
                <th className="th">Type</th>
                <th className="th text-end">capacity m³/h</th>
                <th className="th text-end">HP</th>
                <th className="th">Brand</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {eng.fans.map((f) => (
                <tr key={f.id} className="border-b border-black/5 last:border-0">
                  <td className="td font-medium">{f.name}</td>
                  <td className="td text-xs">{f.fan_type}</td>
                  <td className="td text-end">
                    <NumCell value={f.capacity_m3h} onCommit={(v) => updateRow('fan_models', f.id, { capacity_m3h: v })} />
                  </td>
                  <td className="td text-end">
                    <NumCell value={f.power_hp} onCommit={(v) => updateRow('fan_models', f.id, { power_hp: v })} />
                  </td>
                  <td className="td text-xs">{brandName(f.brand_id)}</td>
                  <td className="td text-end">
                    <button className="btn-ghost px-2 py-1 text-red-600" onClick={() => del('fan_models', f.id)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cooling pad models */}
      <EquipTable
        title="Cooling pad models"
        rows={eng.pads}
        cols={[
          { label: 'sheet L', field: 'sheet_l_m', table: 'cooling_pad_models' },
          { label: 'sheet W', field: 'sheet_w_m', table: 'cooling_pad_models' },
          { label: 'thickness cm', field: 'thickness_cm', table: 'cooling_pad_models' },
          { label: 'face vel m/s', field: 'face_velocity_ms', table: 'cooling_pad_models' },
        ]}
        onCommit={updateRow}
        onDelete={(id) => del('cooling_pad_models', id)}
      />

      {/* Heater models */}
      <EquipTable
        title="Heater models"
        rows={eng.heaters}
        cols={[
          { label: 'coverage m', field: 'coverage_m', table: 'heater_models' },
          { label: 'kW', field: 'thermic_power_kw', table: 'heater_models' },
          { label: 'air m³/h', field: 'air_displacement_m3h', table: 'heater_models' },
        ]}
        onCommit={updateRow}
        onDelete={(id) => del('heater_models', id)}
      />

      {/* Air inlet models */}
      <EquipTable
        title="Air inlet models"
        rows={eng.inlets}
        cols={[
          { label: 'width m', field: 'width_m', table: 'air_inlet_models' },
          { label: 'height m', field: 'height_m', table: 'air_inlet_models' },
          { label: 'airflow m³/h (info)', field: 'airflow_per_inlet_m3h', table: 'air_inlet_models' },
        ]}
        onCommit={updateRow}
        onDelete={(id) => del('air_inlet_models', id)}
      />

      {/* Cage models */}
      <EquipTable
        title="Cage models"
        rows={eng.cages}
        cols={[
          { label: 'section L m', field: 'section_length_m', table: 'cage_models' },
          { label: 'birds/cage', field: 'birds_per_cage', table: 'cage_models' },
          { label: 'cages/section', field: 'cages_per_section', table: 'cage_models' },
          { label: 'tiers', field: 'tiers_default', table: 'cage_models' },
        ]}
        onCommit={updateRow}
        onDelete={(id) => del('cage_models', id)}
      />

      {addingFan && <AddFanModal onClose={() => setAddingFan(false)} onSaved={() => { setAddingFan(false); eng.reload() }} />}
    </div>
  )
}

function EquipTable({
  title,
  rows,
  cols,
  onCommit,
  onDelete,
}: {
  title: string
  rows: { id: string; name: string }[]
  cols: { label: string; field: string; table: string }[]
  onCommit: (table: string, id: string, patch: Record<string, unknown>) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="card mb-4 p-4">
      <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-gold-700">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-black/5">
              <th className="th">Name</th>
              {cols.map((c) => <th key={c.field} className="th text-end">{c.label}</th>)}
              <th className="th"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-black/5 last:border-0">
                <td className="td font-medium">{r.name}</td>
                {cols.map((c) => (
                  <td key={c.field} className="td text-end">
                    <NumCell
                      value={((r as Record<string, unknown>)[c.field] as number | null) ?? null}
                      onCommit={(v) => onCommit(c.table, r.id, { [c.field]: v })}
                    />
                  </td>
                ))}
                <td className="td text-end">
                  <button className="btn-ghost px-2 py-1 text-red-600" onClick={() => onDelete(r.id)}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function AddFanModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState<FanType>('TUNNEL')
  const [cap, setCap] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const res = await supabase.from('fan_models').insert({
      name,
      fan_type: type,
      capacity_m3h: cap === '' ? null : Number(cap),
    })
    setBusy(false)
    if (res.error) return setError(res.error.message)
    onSaved()
  }

  return (
    <Modal open onClose={onClose} title="New fan model">
      <form onSubmit={save} className="space-y-3">
        <Field label="Name"><input className="input" required value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Type">
          <select className="input" value={type} onChange={(e) => setType(e.target.value as FanType)}>
            {['TUNNEL', 'EXHAUST', 'SIDE', 'CIRCULATION', 'WINTER'].map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </Field>
        <Field label="capacity m³/h (optional)"><input className="input tabular" type="number" value={cap} onChange={(e) => setCap(e.target.value)} /></Field>
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  )
}
