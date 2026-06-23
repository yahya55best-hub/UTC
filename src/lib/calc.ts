// ============================================================================
// House Sizing & Auto-Calculation Engine (Addenda B–F)
//
// Authoritative formulas: Addendum C (supersedes B), with confirmed equipment
// specs from D, bird-capacity methods from E, and caged capacity from F.
//
// DESIGN: formulas live here; every CONSTANT comes from the editable
// calc_settings / equipment tables passed in. Each output carries the formula
// string with live numbers substituted (the spec requires showing formulas).
// The engine never invents a missing capacity — it returns a warning and a null
// value, and the UI refuses to add that line.
// ============================================================================

import type {
  AirInletModel, CageModel, CalcSetting, CapacityMethod, CoolingPadModel,
  FanModel, HeaterModel, HouseSystem, UnitType,
} from './types'

const ceil = (n: number) => Math.ceil(n)
const floor = (n: number) => Math.floor(n)
const round = (n: number, d = 0) => {
  const f = 10 ** d
  return Math.round(n * f) / f
}
const fmt = (n: number, d = 0) =>
  n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: 0 })

export interface EngineData {
  settings: CalcSetting[]
  fans: FanModel[]
  pads: CoolingPadModel[]
  heaters: HeaterModel[]
  inlets: AirInletModel[]
  cages: CageModel[]
  /** Resolve a brand_id to its display name (from the catalog). */
  brandName: (id: string | null) => string | null
}

export interface CalcInputs {
  length_m: number
  width_m: number
  eave_height_m: number
  ridge_height_m?: number | null
  bird_type: 'BROILER' | 'LAYER' | 'BREEDER'
  system: HouseSystem
  capacity_method: CapacityMethod
  // weight method
  stocking_density_kgm2?: number
  target_bird_weight_kg?: number
  // tunnel
  tunnel_air_speed_ms?: number
  effective_opening_height_m?: number
  // feed/drink brand choice
  feed_brand?: string
  water_brand?: string
  // model selectors (ids into EngineData)
  tunnel_fan_model_id?: string
  side_fan_model_id?: string
  recirc_fan_model_id?: string
  cooling_pad_model_id?: string
  heater_model_id?: string
  air_inlet_model_id?: string
  // caged inputs
  cage_model_id?: string
  number_of_rows?: number
  tiers_per_row?: number
  end_clearance_m?: number
  // lighting estimate
  lamp_rows?: number
}

/** A computed quantity that becomes an editable quote line. */
export interface Proposal {
  key: string
  section: string
  label: string
  brand_snapshot: string | null
  description: string
  unit: UnitType
  quantity: number
  formula: string
  /** Links to PRODUCT_INFO for the bilingual description + custom unit label. */
  itemKey?: string
  warning?: string
}

/** A display-only computed metric for the engineering report. */
export interface Metric {
  section: string
  label: string
  value: number | null
  unit: string
  formula: string
  warning?: string
}

export interface CalcResult {
  birds: number | null
  metrics: Metric[]
  proposals: Proposal[]
  warnings: string[]
}

/** Fixed display order so results are always grouped logically. */
export const SECTION_ORDER = [
  'House',
  'Bird capacity',
  'Caged system',
  'Feeding & drinking',
  'Ventilation',
  'Cooling',
  'Heating',
  'Lighting',
]

/** Return the distinct sections present in a result, in SECTION_ORDER. */
export function orderedSections(sections: string[]): string[] {
  const present = new Set(sections)
  const ordered = SECTION_ORDER.filter((s) => present.has(s))
  // append any unexpected sections at the end (defensive)
  for (const s of sections) if (!SECTION_ORDER.includes(s) && !ordered.includes(s)) ordered.push(s)
  return ordered
}

function settingMap(settings: CalcSetting[]): (key: string, fallback?: number) => number {
  const m = new Map(settings.map((s) => [s.key, s.value]))
  return (key, fallback = 0) => {
    const v = m.get(key)
    return v == null ? fallback : Number(v)
  }
}

export function runEngine(input: CalcInputs, data: EngineData): CalcResult {
  const get = settingMap(data.settings)
  const metrics: Metric[] = []
  const proposals: Proposal[] = []
  const warnings: string[] = []

  const L = input.length_m
  const W = input.width_m
  const area = round(L * W, 1)

  metrics.push({
    section: 'House',
    label: 'Floor area',
    value: area,
    unit: 'm²',
    formula: `${fmt(L)} × ${fmt(W)} = ${fmt(area, 1)} m²`,
  })

  // ---- Bird capacity (Addendum E / F) --------------------------------------
  let birds: number | null = null
  if (input.system === 'CAGED' || input.capacity_method === 'CAGE') {
    const cage = data.cages.find((c) => c.id === input.cage_model_id)
    const endClear = input.end_clearance_m ?? get('end_clearance_m', 7)
    const rows = input.number_of_rows ?? 0
    const tiers = input.tiers_per_row ?? (cage?.tiers_default ?? 0)
    if (!cage) {
      warnings.push('Select a cage model to compute caged capacity.')
    } else if (!rows || !tiers) {
      warnings.push('Enter number of rows and tiers per row for caged capacity.')
    } else {
      const usable = round(L - endClear, 2)
      const sections = floor(usable / cage.section_length_m)
      const totalCages = rows * tiers * sections * cage.cages_per_section
      const bpc = cage.birds_per_cage
      birds = bpc != null ? totalCages * bpc : null
      metrics.push({
        section: 'Bird capacity',
        label: 'Sections per row',
        value: sections,
        unit: '',
        formula: `floor((${fmt(L)} − ${fmt(endClear)}) / ${cage.section_length_m}) = ${sections}`,
      })
      metrics.push({
        section: 'Bird capacity',
        label: 'Total cages',
        value: totalCages,
        unit: '',
        formula: `${rows} rows × ${tiers} tiers × ${sections} sections × ${cage.cages_per_section} = ${fmt(totalCages)}`,
      })
      if (bpc == null) {
        warnings.push(`Cage model "${cage.name}" has no birds_per_cage set — enter it to compute bird count.`)
      } else {
        metrics.push({
          section: 'Bird capacity',
          label: 'Number of birds',
          value: birds,
          unit: 'birds',
          formula: `${fmt(totalCages)} cages × ${bpc} birds = ${fmt(birds!)}`,
        })
      }
      // Caged BOQ multipliers (Addendum F.4)
      const manurePerTier = get('manure_belts_per_tier', 1)
      const eggPerTier = get('egg_belts_per_tier', 2)
      const cb = data.brandName(cage.brand_id)
      addProposal(proposals, 'Caged system', 'Manure removal units', cb, `${cage.name} — manure removal unit`, 'PER_UNIT', rows, `= rows = ${rows}`)
      addProposal(proposals, 'Caged system', 'Manure belts', cb, `${cage.name} — manure belt`, 'PER_UNIT', rows * tiers * manurePerTier, `${rows} × ${tiers} × ${manurePerTier} = ${rows * tiers * manurePerTier}`)
      addProposal(proposals, 'Caged system', 'Egg belts', cb, `${cage.name} — egg belt`, 'PER_UNIT', rows * tiers * eggPerTier, `${rows} × ${tiers} × ${eggPerTier} = ${rows * tiers * eggPerTier}`)
      addProposal(proposals, 'Caged system', 'Egg collection elevators', cb, `${cage.name} — egg elevator`, 'PER_UNIT', rows, `= rows = ${rows}`)
      addProposal(proposals, 'Caged system', 'Egg tables', cb, `${cage.name} — egg table`, 'PER_UNIT', rows, `= rows = ${rows}`)
      addProposal(proposals, 'Caged system', 'Feeding hoppers', cb, `${cage.name} — feeding hopper`, 'PER_UNIT', rows, `= rows = ${rows}`)
    }
  } else if (input.capacity_method === 'WEIGHT') {
    const density = input.stocking_density_kgm2 ?? get('stocking_density_kgm2', 40)
    const weight = input.target_bird_weight_kg ?? 2.2
    birds = weight > 0 ? round((area * density) / weight) : null
    metrics.push({
      section: 'Bird capacity',
      label: 'Number of birds',
      value: birds,
      unit: 'birds',
      formula: `round((${fmt(area, 1)} m² × ${fmt(density)} kg/m²) / ${weight} kg) = ${birds != null ? fmt(birds) : '—'}`,
    })
  } else {
    // DENSITY (default, floor) — Addendum E.1
    const key =
      input.bird_type === 'BROILER'
        ? 'birds_per_m2_broiler'
        : input.bird_type === 'BREEDER'
        ? 'birds_per_m2_breeder'
        : 'birds_per_m2_layer_floor'
    const d = get(key, input.bird_type === 'BROILER' ? 15 : 6)
    birds = floor(area * d)
    metrics.push({
      section: 'Bird capacity',
      label: 'Number of birds',
      value: birds,
      unit: 'birds',
      formula: `floor(${fmt(area, 1)} m² × ${fmt(d)} birds/m²) = ${fmt(birds)}`,
    })
  }

  // Effective line length = house length − front/back clearance (1.5 m each end).
  const clearance = get('pipe_clearance_total_m', 3)
  const effLen = Math.max(0, round(L - clearance, 2))

  // ---- Feeding (ROXELL NEW MiniMax pan feeder) -----------------------------
  let feedLines = 0
  if (W >= 11 && W <= 13) feedLines = get('feed_lines_11_13', 3)
  else if (W > 13) feedLines = get('feed_lines_above_13', 4)
  else warnings.push(`Width ${fmt(W)} m < 11 m: no default feed-line rule — set feed lines manually.`)
  if (feedLines > 0) {
    const feedPipe = get('feed_pipe_len_m', 3.05)
    const feedPipesPerLine = ceil(effLen / feedPipe)
    const feedTotalPipes = feedPipesPerLine * feedLines
    const feedLineLen = round(feedPipesPerLine * feedPipe, 1)
    addProposal(
      proposals, 'Feeding & drinking', 'Feeding line', input.feed_brand ?? 'Roxell',
      'Feeding line (ROXELL NEW MiniMax)', 'PER_UNIT', feedLines,
      `eff. ${fmt(effLen, 1)} m → ${feedPipesPerLine} pipes/line (≈${fmt(feedLineLen, 1)} m) → ${feedTotalPipes} pipes total`,
      { itemKey: 'FEEDING' },
    )
    metrics.push({ section: 'Feeding & drinking', label: 'Feed pipes per line', value: feedPipesPerLine, unit: 'pipes', formula: `ceil(${fmt(effLen, 1)} / ${feedPipe}) = ${feedPipesPerLine}` })
    metrics.push({ section: 'Feeding & drinking', label: 'Feed pipes total', value: feedTotalPipes, unit: 'pipes', formula: `${feedPipesPerLine} × ${feedLines} lines = ${feedTotalPipes}` })
    metrics.push({ section: 'Feeding & drinking', label: 'Feed line length', value: feedLineLen, unit: 'm', formula: `${feedPipesPerLine} × ${feedPipe} m` })
  }

  // ---- Drinking (ROXELL nipple) --------------------------------------------
  let waterLines = 0
  if (W >= 11 && W <= 13) waterLines = get('water_lines_11_13', 4)
  else if (W > 13) waterLines = get('water_lines_above_13', 5)
  else warnings.push(`Width ${fmt(W)} m < 11 m: no default water-line rule — set water lines manually.`)
  if (waterLines > 0) {
    const waterPipe = get('water_pipe_len_m', 3)
    const nipplesPerPipe = get('nipples_per_pipe', 15)
    const waterPipesPerLine = ceil(effLen / waterPipe)
    const waterTotalPipes = waterPipesPerLine * waterLines
    const totalNipples = waterTotalPipes * nipplesPerPipe
    const waterLineLen = round(waterPipesPerLine * waterPipe, 1)
    addProposal(
      proposals, 'Feeding & drinking', 'Drinking line', input.water_brand ?? 'Roxell',
      'Drinking line (ROXELL nipple)', 'PER_UNIT', waterLines,
      `eff. ${fmt(effLen, 1)} m → ${waterPipesPerLine} pipes/line (≈${fmt(waterLineLen, 1)} m) → ${waterTotalPipes} pipes total`,
      { itemKey: 'DRINKING' },
    )
    metrics.push({ section: 'Feeding & drinking', label: 'Water pipes per line', value: waterPipesPerLine, unit: 'pipes', formula: `ceil(${fmt(effLen, 1)} / ${waterPipe}) = ${waterPipesPerLine}` })
    metrics.push({ section: 'Feeding & drinking', label: 'Water pipes total', value: waterTotalPipes, unit: 'pipes', formula: `${waterPipesPerLine} × ${waterLines} lines = ${waterTotalPipes}` })
    metrics.push({ section: 'Feeding & drinking', label: 'Total nipples', value: totalNipples, unit: 'nipples', formula: `${waterTotalPipes} pipes × ${nipplesPerPipe} (≈20 cm spacing) = ${fmt(totalNipples)}` })
    metrics.push({ section: 'Feeding & drinking', label: 'Water line length', value: waterLineLen, unit: 'm', formula: `${waterPipesPerLine} × ${waterPipe} m` })
  }

  // ---- Tunnel ventilation (Addendum C.5) -----------------------------------
  const speed = input.tunnel_air_speed_ms ?? get('tunnel_air_speed_ms', 3.0)
  const openH = input.effective_opening_height_m ?? get('effective_opening_height_m', 2.0)
  const openingArea = round(W * openH, 2)
  const tunnelAirflow = round(openingArea * speed * 3600)
  metrics.push({
    section: 'Ventilation',
    label: 'Tunnel airflow',
    value: tunnelAirflow,
    unit: 'm³/h',
    formula: `(${fmt(W)} × ${fmt(openH)}) m² × ${speed} m/s × 3600 = ${fmt(tunnelAirflow)} m³/h`,
  })
  const tunnelFan = data.fans.find((f) => f.id === input.tunnel_fan_model_id)
  if (tunnelFan) {
    if (tunnelFan.capacity_m3h == null) {
      warnings.push(`Tunnel fan "${tunnelFan.name}" has no capacity (m³/h) set — set it before sizing.`)
    } else {
      const count = ceil(tunnelAirflow / tunnelFan.capacity_m3h)
      addProposal(
        proposals, 'Ventilation', 'Tunnel fans', brandName(data, tunnelFan.brand_id),
        `${tunnelFan.name} — tunnel fan`, 'PER_UNIT', count,
        `ceil(${fmt(tunnelAirflow)} / ${fmt(tunnelFan.capacity_m3h)}) = ${count}`,
        { itemKey: 'TUNNEL_FAN' },
      )
    }
  }

  // ---- Cooling pads (Addendum C.6 / D.5) -----------------------------------
  // Pads run on both side walls by default (cooling_pad_sides = 2). The
  // airflow-derived area is the per-side requirement; total scales by sides.
  const padSides = get('cooling_pad_sides', 2)
  const faceVel = get('pad_face_velocity_ms', 1.3)
  if (faceVel > 1.5) warnings.push(`Pad face velocity ${faceVel} m/s exceeds the 1.5 m/s maximum.`)
  const padHeight = get('pad_height_m', 1.5)
  const padAreaPerSide = tunnelAirflow / (faceVel * 3600)
  const padArea = round(padAreaPerSide * padSides, 1)
  const padLength = round(padArea / padHeight, 1)
  metrics.push({
    section: 'Cooling',
    label: 'Pad area (total)',
    value: padArea,
    unit: 'm²',
    formula: `${fmt(tunnelAirflow)} / (${faceVel} × 3600) × ${fmt(padSides)} side(s) = ${fmt(padArea, 1)} m²`,
  })
  metrics.push({
    section: 'Cooling',
    label: 'Pad length (total)',
    value: padLength,
    unit: 'm',
    formula: `${fmt(padArea, 1)} / ${padHeight} = ${fmt(padLength, 1)} m  (${fmt(padSides)} side(s))`,
  })
  const pad = data.pads.find((p) => p.id === input.cooling_pad_model_id)
  if (pad) {
    const sheets = ceil(padArea / pad.sheet_face_area_m2)
    addProposal(
      proposals, 'Cooling', 'Cooling pads', brandName(data, pad.brand_id),
      `${pad.name}`, 'PER_UNIT', sheets,
      `ceil(${fmt(padArea, 1)} / ${pad.sheet_face_area_m2}) = ${sheets}`,
      { itemKey: 'COOLING_PAD' },
    )
  }
  // Cooling-pad channel quoted by total metres (PVC), runs alongside the pads.
  addProposal(
    proposals, 'Cooling', 'Cooling-pad channel (PVC)', 'UTC.stav',
    'Cooling-pad PVC channel', 'PER_METER', padLength,
    `pad length = ${fmt(padLength, 1)} m`,
    { itemKey: 'COOLING_CHANNEL' },
  )

  // ---- Side ventilation (Addendum C.7) -------------------------------------
  const birdReq = get('bird_requirement_m3h_per_bird', 4)
  let requiredSide: number | null = null
  if (birds != null) {
    requiredSide = round(birdReq * birds)
    metrics.push({
      section: 'Ventilation',
      label: 'Required side airflow',
      value: requiredSide,
      unit: 'm³/h',
      formula: `${birdReq} m³/h/bird × ${fmt(birds)} birds = ${fmt(requiredSide)} m³/h`,
    })
    const sideFan = data.fans.find((f) => f.id === input.side_fan_model_id)
    if (sideFan) {
      if (sideFan.capacity_m3h == null) {
        warnings.push(`Side fan "${sideFan.name}" has no capacity set.`)
      } else {
        const count = ceil(requiredSide / sideFan.capacity_m3h)
        addProposal(
          proposals, 'Ventilation', 'Side fans', brandName(data, sideFan.brand_id),
          `${sideFan.name} — side fan`, 'PER_UNIT', count,
          `ceil(${fmt(requiredSide)} / ${fmt(sideFan.capacity_m3h)}) = ${count}`,
          { itemKey: 'SIDE_FAN' },
        )
      }
    }
  } else {
    warnings.push('Bird count is needed for side-ventilation sizing.')
  }

  // ---- Air inlets (Addendum C.8 — always both sides) -----------------------
  const inlet = data.inlets.find((m) => m.id === input.air_inlet_model_id)
  if (inlet && requiredSide != null) {
    if (inlet.airflow_per_inlet_m3h == null) {
      warnings.push(`Air inlet "${inlet.name}" has no airflow figure set.`)
    } else {
      const perSide = ceil(requiredSide / inlet.airflow_per_inlet_m3h)
      const total = perSide * 2
      addProposal(
        proposals, 'Ventilation', 'Air inlet windows (both sides)', brandName(data, inlet.brand_id),
        `${inlet.name} — air inlet`, 'PER_UNIT', total,
        `ceil(${fmt(requiredSide)} / ${fmt(inlet.airflow_per_inlet_m3h)}) × 2 = ${total}`,
        { itemKey: 'AIR_INLET' },
      )
    }
  }

  // ---- Recirculation fans (Addendum C.9) -----------------------------------
  const recircSpacing = get('recirc_fan_spacing_m', 30)
  const recircCount = ceil(L / recircSpacing)
  const recircFan = data.fans.find((f) => f.id === input.recirc_fan_model_id)
  addProposal(
    proposals, 'Ventilation', 'Circulation fans', recircFan ? brandName(data, recircFan.brand_id) : 'Pericoli',
    recircFan ? `${recircFan.name} — circulation fan` : 'Circulation fan (ACF 21 P)', 'PER_UNIT', recircCount,
    `ceil(${fmt(L)} / ${recircSpacing}) = ${recircCount}`,
    { itemKey: 'CIRC_FAN' },
  )

  // ---- Heating (Addendum C.10) ---------------------------------------------
  const heater = data.heaters.find((h) => h.id === input.heater_model_id)
  const coverage = heater?.coverage_m ?? get('heater_coverage_m', 27.5)
  const heaterCount = ceil(L / coverage)
  addProposal(
    proposals, 'Heating', 'Heaters', heater ? brandName(data, heater.brand_id) : 'UTC.stav',
    heater ? `${heater.name}` : 'UTC heater', 'PER_UNIT', heaterCount,
    `ceil(${fmt(L)} / ${coverage}) = ${heaterCount}`,
    { itemKey: 'HEATER' },
  )

  // ---- Lighting estimate (Addendum B.7 — HATO plan is authoritative) -------
  const lampSpacing = get('lamp_spacing_m', 3)
  const lampRows = input.lamp_rows ?? 3
  const lampEstimate = ceil((L / lampSpacing) * lampRows)
  addProposal(
    proposals, 'Lighting', 'LED lamps (ESTIMATE — confirm with HATO)', 'Hato',
    'LED lamp (estimate)', 'PER_UNIT', lampEstimate,
    `ceil((${fmt(L)} / ${lampSpacing}) × ${lampRows}) = ${lampEstimate}`,
    { warning: 'Estimate only — enter the HATO light-plan output as the authoritative figure.' },
  )

  return { birds, metrics, proposals, warnings }
}

// helpers -------------------------------------------------------------------
function brandName(data: EngineData, brandId: string | null): string | null {
  return data.brandName(brandId)
}

function addProposal(
  arr: Proposal[],
  section: string,
  label: string,
  brand: string | null,
  description: string,
  unit: UnitType,
  quantity: number,
  formula: string,
  opts: { itemKey?: string; warning?: string } = {},
) {
  arr.push({
    key: `${section}:${label}`.replace(/\s+/g, '_'),
    section,
    label,
    brand_snapshot: brand,
    description,
    unit,
    quantity,
    formula,
    itemKey: opts.itemKey,
    warning: opts.warning,
  })
}
