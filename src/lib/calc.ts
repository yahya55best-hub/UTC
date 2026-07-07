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
  /** Extra structured values carried onto the line's calc_meta (e.g. end sets). */
  meta?: Record<string, unknown>
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
  // Average internal height H_avg = (side + mid) / 2; if only one height, use it.
  const hAvg = input.ridge_height_m
    ? round((input.eave_height_m + input.ridge_height_m) / 2, 3)
    : input.eave_height_m

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
  const clearance = get('house_end_clearance_m', get('pipe_clearance_total_m', 3))
  const effLen = Math.max(0, round(L - clearance, 2))

  // ---- Feeding (ROXELL NEW MiniMax pan feeder) -----------------------------
  let feedLines = 0
  let feedPipesPerLine = 0
  if (W >= 11 && W <= 13) feedLines = get('feed_lines_11_13', 3)
  else if (W > 13) feedLines = get('feed_lines_above_13', 4)
  else warnings.push(`Width ${fmt(W)} m < 11 m: no default feed-line rule — set feed lines manually.`)
  if (feedLines > 0) {
    const feedPipe = get('feed_pipe_len_m', 3.05)
    feedPipesPerLine = ceil(effLen / feedPipe)
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
    const waterPipe = get('drink_pipe_len_m', get('water_pipe_len_m', 3))
    const nipplesPerPipe = get('nipples_per_pipe', 15)
    // Drinking pipes per line = feeding pipes per line + 1 (always exactly one more).
    const waterPipesPerLine = (feedPipesPerLine > 0 ? feedPipesPerLine : ceil(effLen / waterPipe)) + 1
    const waterTotalPipes = waterPipesPerLine * waterLines
    const totalNipples = waterTotalPipes * nipplesPerPipe
    const waterLineLen = round(waterPipesPerLine * waterPipe, 1)
    // End sets: lines over 60 m need 2 per line, otherwise 1 (60 m exactly = 1).
    const endSetsPerLine = waterLineLen > 60 ? 2 : 1
    const endSetsTotal = endSetsPerLine * waterLines
    addProposal(
      proposals, 'Feeding & drinking', 'Drinking line', input.water_brand ?? 'Roxell',
      'Drinking line (ROXELL nipple)', 'PER_UNIT', waterLines,
      `${waterPipesPerLine} pipes/line (feed ${feedPipesPerLine} + 1) → ${waterTotalPipes} pipes total (≈${fmt(waterLineLen, 1)} m); ${endSetsPerLine} end set(s)/line`,
      { itemKey: 'DRINKING', meta: { endSetsPerLine, endSetsTotal, lineLength: waterLineLen } },
    )
    metrics.push({ section: 'Feeding & drinking', label: 'Water pipes per line', value: waterPipesPerLine, unit: 'pipes', formula: `feeding ${feedPipesPerLine} + 1 = ${waterPipesPerLine}` })
    metrics.push({ section: 'Feeding & drinking', label: 'Water pipes total', value: waterTotalPipes, unit: 'pipes', formula: `${waterPipesPerLine} × ${waterLines} lines = ${waterTotalPipes}` })
    metrics.push({ section: 'Feeding & drinking', label: 'Total nipples', value: totalNipples, unit: 'nipples', formula: `${waterTotalPipes} pipes × ${nipplesPerPipe} (≈20 cm spacing) = ${fmt(totalNipples)}` })
    metrics.push({ section: 'Feeding & drinking', label: 'Water line length', value: waterLineLen, unit: 'm', formula: `${waterPipesPerLine} × ${waterPipe} m` })
    metrics.push({ section: 'Feeding & drinking', label: 'End sets per line', value: endSetsPerLine, unit: 'sets', formula: `${fmt(waterLineLen, 1)} m ${waterLineLen > 60 ? '> 60 → 2' : '≤ 60 → 1'}` })
    metrics.push({ section: 'Feeding & drinking', label: 'End sets total', value: endSetsTotal, unit: 'sets', formula: `${endSetsPerLine} × ${waterLines} lines = ${endSetsTotal}` })
  }

  // ---- Tunnel ventilation — cross-section × target airspeed (length-free) ---
  // tunnelFans = ceil(W × H_avg × airspeed × 3600 / capacity). Length must not
  // appear: same W×H_avg gives the same fan count for any house length.
  const airspeed = get('tunnel_target_airspeed_ms', 2.6)
  const crossSection = round(W * hAvg, 3)
  const tunnelAirflow = round(crossSection * airspeed * 3600)
  metrics.push({
    section: 'Ventilation',
    label: 'Tunnel cross-section',
    value: crossSection,
    unit: 'm²',
    formula: `${fmt(W)} × ${fmt(hAvg, 2)} (H_avg) = ${fmt(crossSection, 2)} m²`,
  })
  metrics.push({
    section: 'Ventilation',
    label: 'Tunnel design airflow',
    value: tunnelAirflow,
    unit: 'm³/h',
    formula: `${fmt(crossSection, 2)} × ${airspeed} m/s × 3600 = ${fmt(tunnelAirflow)} m³/h`,
  })
  const tunnelFan = data.fans.find((f) => f.id === input.tunnel_fan_model_id)
  let tunnelFanCount: number | null = null
  if (tunnelFan) {
    if (tunnelFan.capacity_m3h == null) {
      warnings.push(`Tunnel fan "${tunnelFan.name}" has no capacity (m³/h) set — set it before sizing.`)
    } else {
      tunnelFanCount = ceil(tunnelAirflow / tunnelFan.capacity_m3h)
      addProposal(
        proposals, 'Ventilation', 'Tunnel fans', brandName(data, tunnelFan.brand_id),
        `${tunnelFan.name} — tunnel fan`, 'PER_UNIT', tunnelFanCount,
        `ceil(${fmt(tunnelAirflow)} / ${fmt(tunnelFan.capacity_m3h)}) = ${tunnelFanCount}`,
        { itemKey: 'TUNNEL_FAN' },
      )
    }
  }

  // ---- Cooling pads (fan-count rule — replaces airflow derivation) ---------
  // Pad area = tunnelFans × pad_area_per_fan_m2 (fixed 6, does NOT scale with
  // fan airflow). Total pads snap so padsPerSide × padW is a whole multiple of
  // 3 m (channels/inlets come in 3 m units).
  const pad = data.pads.find((p) => p.id === input.cooling_pad_model_id)
  const padSides = get('cooling_pad_sides', 2)
  const padH = get('pad_height_m', 1.5)
  const padW = pad?.sheet_w_m ?? 0.6
  const padFaceArea = round(padW * padH, 4)
  const padAreaPerFan = get('pad_area_per_fan_m2', 6)
  if (tunnelFanCount == null) {
    warnings.push('Select a tunnel fan model (with capacity) to size the cooling pads — pad area = tunnel fans × ' + padAreaPerFan + '.')
  } else if (padFaceArea <= 0) {
    warnings.push('Cooling pad has no valid width/height for pad sizing.')
  } else {
    const padAreaReq = round(tunnelFanCount * padAreaPerFan, 2)
    const rawPads = padAreaReq / padFaceArea
    // smallest per-side pad count whose run length (× padW) is a multiple of 3 m
    let stepPerSide = 1
    for (let s = 1; s <= 1000; s++) {
      const r = (s * padW) / 3
      if (Math.abs(r - Math.round(r)) < 1e-6) { stepPerSide = s; break }
    }
    const rawPerSide = rawPads / padSides
    const padsPerSide = Math.max(stepPerSide, Math.round(rawPerSide / stepPerSide) * stepPerSide)
    const totalPads = padsPerSide * padSides
    const runPerSide = round(padsPerSide * padW, 2)
    const channelTotal = round(runPerSide * padSides, 2)

    metrics.push({ section: 'Cooling', label: 'Pad area required', value: padAreaReq, unit: 'm²', formula: `${tunnelFanCount} fans × ${padAreaPerFan} = ${fmt(padAreaReq, 1)} m²` })
    metrics.push({ section: 'Cooling', label: 'Raw pads', value: round(rawPads, 2), unit: 'pads', formula: `${fmt(padAreaReq, 1)} / (${padW}×${padH}=${padFaceArea}) = ${fmt(rawPads, 2)}` })
    metrics.push({ section: 'Cooling', label: 'Pads per side', value: padsPerSide, unit: 'pads', formula: `round(${fmt(rawPerSide, 2)} / ${stepPerSide}) × ${stepPerSide} = ${padsPerSide}` })
    metrics.push({ section: 'Cooling', label: 'Pad run per side', value: runPerSide, unit: 'm', formula: `${padsPerSide} × ${padW} m = ${fmt(runPerSide, 1)} m` })

    addProposal(
      proposals, 'Cooling', 'Cooling pads', pad ? brandName(data, pad.brand_id) : 'Smart Falcon',
      pad ? `${pad.name}` : 'Cooling pad', 'PER_UNIT', totalPads,
      `raw ${fmt(rawPads, 2)} → ${padsPerSide}/side × ${padSides} = ${totalPads} pads`,
      { itemKey: 'COOLING_PAD' },
    )
    addProposal(
      proposals, 'Cooling', 'Cooling-pad channel (PVC)', 'UTC.stav',
      'Cooling-pad PVC channel', 'PER_METER', channelTotal,
      `${padsPerSide} pads/side × ${padW} m × ${padSides} sides = ${fmt(channelTotal, 1)} m`,
      { itemKey: 'COOLING_CHANNEL' },
    )
    addProposal(
      proposals, 'Cooling', 'Tunnel inlet (pad section)', 'UTC.stav',
      'Tunnel inlet system', 'PER_METER', channelTotal,
      `${fmt(runPerSide, 1)} m/side × ${padSides} sides = ${fmt(channelTotal, 1)} m`,
      { itemKey: 'TUNNEL_INLET' },
    )
  }

  // ---- Side ventilation — minimum/transitional (air-changes-per-hour) ------
  // Independent path: does NOT feed pads/inlets/channels. Uses house volume ×
  // ACH, not the tunnel/bird formula.
  const ach = get('side_vent_ach', 14)
  const houseVolume = round(L * W * hAvg, 1)
  const minVent = round(houseVolume * ach)
  metrics.push({ section: 'Ventilation', label: 'House volume', value: houseVolume, unit: 'm³', formula: `${fmt(L)} × ${fmt(W)} × ${fmt(hAvg, 2)} = ${fmt(houseVolume, 1)} m³` })
  metrics.push({ section: 'Ventilation', label: 'Min ventilation airflow', value: minVent, unit: 'm³/h', formula: `${fmt(houseVolume, 1)} × ${ach} ACH = ${fmt(minVent)} m³/h` })
  const sideFan = data.fans.find((f) => f.id === input.side_fan_model_id)
  if (!sideFan) {
    warnings.push('Select a side fan model to size side ventilation.')
  } else if (sideFan.capacity_m3h == null) {
    warnings.push(`Side fan "${sideFan.name}" has no capacity set.`)
  } else {
    const sideFans = ceil(minVent / sideFan.capacity_m3h)
    addProposal(
      proposals, 'Ventilation', 'Side fans', brandName(data, sideFan.brand_id),
      `${sideFan.name} — side fan`, 'PER_UNIT', sideFans,
      `ceil(${fmt(minVent)} / ${fmt(sideFan.capacity_m3h)}) = ${sideFans}`,
      { itemKey: 'SIDE_FAN' },
    )
  }

  // ---- Air inlet windows — MIN-VENT (not tunnel; tunnel air enters via pads) -
  // Uses the same minimum-ventilation airflow as the side fans (house volume ×
  // ACH), sized at inlet velocity over the model's structured width × height.
  const inlet = data.inlets.find((m) => m.id === input.air_inlet_model_id)
  const inletVel = get('inlet_air_velocity_ms', 5)
  const inletSpacing = get('air_inlet_spacing_m', 3)
  if (!inlet) {
    warnings.push('Select an air inlet model to size air inlets.')
  } else if (inlet.width_m == null || inlet.height_m == null) {
    warnings.push(`Air inlet "${inlet.name}" has no width/height set — cannot size inlets (enter width_m × height_m).`)
  } else {
    // The area requirement yields the count for ONE side; total = perSide × 2.
    const areaReq = minVent / (3600 * inletVel)
    const areaPerInlet = inlet.width_m * inlet.height_m
    const rawPerSide = ceil(areaReq / areaPerInlet)
    const inletsPerSide = rawPerSide % 2 === 0 ? rawPerSide : rawPerSide + 1
    const totalInlets = inletsPerSide * 2
    const maxPerSide = floor(L / inletSpacing)

    metrics.push({ section: 'Ventilation', label: 'Inlet area required', value: round(areaReq, 3), unit: 'm²', formula: `${fmt(minVent)} (min-vent) / (3600 × ${inletVel}) = ${fmt(areaReq, 2)} m²` })
    metrics.push({ section: 'Ventilation', label: 'Area per inlet', value: round(areaPerInlet, 4), unit: 'm²', formula: `${inlet.width_m} × ${inlet.height_m} = ${fmt(areaPerInlet, 4)} m²` })
    metrics.push({ section: 'Ventilation', label: 'Raw inlets per side', value: rawPerSide, unit: 'inlets', formula: `ceil(${fmt(areaReq, 2)} / ${fmt(areaPerInlet, 4)}) = ${rawPerSide}` })
    metrics.push({ section: 'Ventilation', label: 'Inlets per side (even)', value: inletsPerSide, unit: 'inlets', formula: `${rawPerSide} → even ${inletsPerSide}` })
    metrics.push({ section: 'Ventilation', label: 'Spacing ceiling per side', value: maxPerSide, unit: 'inlets', formula: `floor(${fmt(L)} / ${inletSpacing}) = ${maxPerSide}${inletsPerSide > maxPerSide ? ' — EXCEEDED' : ' — ok'}` })

    addProposal(
      proposals, 'Ventilation', 'Air inlet windows', brandName(data, inlet.brand_id),
      `${inlet.name} — air inlet`, 'PER_UNIT', totalInlets,
      `min-vent ${fmt(minVent)} / (3600×${inletVel}) = ${fmt(areaReq, 2)} m² ÷ ${fmt(areaPerInlet, 4)} = ${rawPerSide}/side → even ${inletsPerSide} × 2 = ${totalInlets}`,
      { itemKey: 'AIR_INLET' },
    )
    if (inletsPerSide > maxPerSide) {
      warnings.push(`Air inlets: ${inletsPerSide}/side exceeds the ${maxPerSide}/side capacity at ${inletSpacing} m spacing.`)
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

  // ---- Heating — house length / spacing, rounded to NEAREST ----------------
  const heater = data.heaters.find((h) => h.id === input.heater_model_id)
  const heaterSpacing = get('heater_spacing_m', 30)
  const heaterCount = Math.round(L / heaterSpacing)
  addProposal(
    proposals, 'Heating', 'Heaters', heater ? brandName(data, heater.brand_id) : 'UTC.stav',
    heater ? `${heater.name}` : 'UTC heater', 'PER_UNIT', heaterCount,
    `round(${fmt(L)} / ${heaterSpacing}) = ${heaterCount}`,
    { itemKey: 'HEATER' },
  )

  // ---- Lighting lines = feeding lines (reactive) ---------------------------
  if (feedLines > 0) {
    addProposal(
      proposals, 'Lighting', 'LED lighting lines', 'Hato',
      'LED lighting line', 'PER_UNIT', feedLines,
      `= feeding lines = ${feedLines}`,
      { itemKey: 'LED_LINE' },
    )
  }

  // ---- Lighting lamp estimate (Addendum B.7 — HATO plan is authoritative) --
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
  opts: { itemKey?: string; warning?: string; meta?: Record<string, unknown> } = {},
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
    meta: opts.meta,
    warning: opts.warning,
  })
}
