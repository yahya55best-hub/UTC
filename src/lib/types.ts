// Shared domain types mirroring the Postgres schema (supabase/migrations).

export type UserRole = 'OWNER' | 'ADMIN' | 'SALES'
export type BrandType = 'OWN' | 'EUROPEAN' | 'EGYPTIAN'
export type PricingMode = 'WAREHOUSE' | 'AGENT_COMMISSION' | 'FIXED_MONTHLY'
export type BuyCurrency = 'EUR' | 'USD' | 'EGP' | 'MIXED'
export type Currency = 'EUR' | 'USD' | 'EGP'
export type ProductCategory =
  | 'FEEDING' | 'DRINKING' | 'SILO' | 'CAGE' | 'CLIMATE_CONTROL' | 'FAN'
  | 'HEATER' | 'LIGHTING' | 'COOLING_PAD' | 'EGG_TRAY' | 'SPARE_PART' | 'OTHER'
export type UnitType = 'PER_METER' | 'PER_UNIT' | 'PER_HOUSE' | 'PER_COMPONENT' | 'PER_SQM'
export type PoultryType = 'BROILER' | 'LAYER' | 'BREEDER' | 'TURKEY' | 'DUCK' | 'ALL'
export type PriceValueType = 'UNIT_PRICE' | 'COMMISSION_PERCENT'
export type CustomerRegion =
  | 'MIDDLE_EAST' | 'NORTH_AFRICA' | 'EAST_AFRICA' | 'WEST_AFRICA' | 'SOUTHERN_AFRICA' | 'OTHER'
export type HouseType = 'BROILER' | 'LAYER' | 'BREEDER' | 'HATCHERY' | 'MIXED'
export type QuoteStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED'

export const CURRENCIES: Currency[] = ['EUR', 'USD', 'EGP']
export const QUOTE_STATUSES: QuoteStatus[] = ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED']
export const HOUSE_TYPES: HouseType[] = ['BROILER', 'LAYER', 'BREEDER', 'HATCHERY', 'MIXED']
export const REGIONS: CustomerRegion[] = [
  'MIDDLE_EAST', 'NORTH_AFRICA', 'EAST_AFRICA', 'WEST_AFRICA', 'SOUTHERN_AFRICA', 'OTHER',
]
export const PRICING_MODES: PricingMode[] = ['WAREHOUSE', 'AGENT_COMMISSION', 'FIXED_MONTHLY']
export const PRODUCT_CATEGORIES: ProductCategory[] = [
  'FEEDING', 'DRINKING', 'SILO', 'CAGE', 'CLIMATE_CONTROL', 'FAN', 'HEATER',
  'LIGHTING', 'COOLING_PAD', 'EGG_TRAY', 'SPARE_PART', 'OTHER',
]
export const UNIT_TYPES: UnitType[] = ['PER_METER', 'PER_UNIT', 'PER_HOUSE', 'PER_COMPONENT', 'PER_SQM']

export interface Profile {
  id: string
  email: string | null
  display_name: string | null
  role: UserRole
  active: boolean
  created_at: string
  updated_at: string
}

export interface Brand {
  id: string
  name: string
  origin_country: string | null
  brand_type: BrandType
  pricing_modes: PricingMode[]
  default_buy_currency: BuyCurrency
  notes: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface Product {
  id: string
  brand_id: string
  name: string
  category: ProductCategory
  unit: UnitType
  poultry_types: PoultryType[]
  pricing_mode: PricingMode
  installation_separate: boolean
  active: boolean
  notes: string | null
  created_at: string
  updated_at: string
  brand?: Brand
  variants?: ProductPricingVariant[]
}

export interface ProductPricingVariant {
  id: string
  product_id: string
  pricing_mode: PricingMode
  unit: UnitType
  label: string
  created_at: string
  updated_at: string
}

export interface PriceListEntry {
  id: string
  product_id: string
  pricing_variant_id: string | null
  currency: Currency
  value_type: PriceValueType
  amount: number
  effective_from: string
  effective_to: string | null
  created_at: string
  updated_at: string
}

export interface FxRate {
  id: string
  from_currency: Currency
  to_currency: Currency
  rate: number
  updated_at: string
}

export interface Customer {
  id: string
  company_name: string
  country: string | null
  region: CustomerRegion | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  preferred_currency: Currency
  notes: string | null
  owner_user_id: string | null
  created_at: string
  updated_at: string
}

export interface Quote {
  id: string
  quote_number: string | null
  customer_id: string
  project_name: string | null
  house_type: HouseType | null
  currency: Currency
  status: QuoteStatus
  created_by: string | null
  last_edited_by: string | null
  owner_user_id: string | null
  valid_until: string | null
  notes: string | null
  subtotal: number
  total: number
  created_at: string
  updated_at: string
  customer?: Customer
}

export interface QuoteLine {
  id: string
  quote_id: string
  product_id: string | null
  pricing_variant_id: string | null
  brand_snapshot: string | null
  description_snapshot: string
  unit: UnitType | null
  quantity: number
  unit_price: number
  line_total: number
  commission_percent: number | null
  fx_note: string | null
  is_installation: boolean
  sort_order: number
  notes: string | null
  calc_source: string | null
  calc_meta: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

// --- House sizing & auto-calculation engine (Addenda B–F) ------------------

export type FanType = 'TUNNEL' | 'EXHAUST' | 'SIDE' | 'CIRCULATION' | 'WINTER'

export interface CalcSetting {
  key: string
  value: number | null
  unit: string | null
  category: string | null
  description: string | null
  updated_at: string
}

export interface FanModel {
  id: string
  name: string
  fan_type: FanType
  diameter_in: number | null
  capacity_m3h: number | null
  power_hp: number | null
  brand_id: string | null
  active: boolean
  notes: string | null
}

export interface CoolingPadModel {
  id: string
  name: string
  sheet_l_m: number
  sheet_w_m: number
  thickness_cm: number | null
  face_velocity_ms: number | null
  sheet_face_area_m2: number
  brand_id: string | null
  active: boolean
  notes: string | null
}

export interface HeaterModel {
  id: string
  name: string
  thermic_power_kw: number | null
  air_displacement_m3h: number | null
  coverage_m: number | null
  brand_id: string | null
  active: boolean
  notes: string | null
}

export interface AirInletModel {
  id: string
  name: string
  size_label: string | null
  width_m: number | null
  height_m: number | null
  /** Informational only — NOT used by the inlet-count calculation. */
  airflow_per_inlet_m3h: number | null
  brand_id: string | null
  active: boolean
  notes: string | null
}

export interface CageModel {
  id: string
  name: string
  section_length_m: number
  birds_per_cage: number | null
  cages_per_section: number
  tiers_default: number | null
  total_cage_area_cm2: number | null
  brand_id: string | null
  active: boolean
  notes: string | null
}

export interface LightingPlan {
  lamp_model: string | null
  lamp_count: number | null
  rows: number | null
  target_lux: number | null
  uniformity_pct: number | null
  avg_lux: number | null
  min_lux: number | null
  max_lux: number | null
  source: 'ESTIMATE' | 'HATO_SOFTWARE'
  notes: string | null
}

export interface QuoteCalc {
  id: string
  quote_id: string
  inputs: Record<string, unknown>
  results: Record<string, unknown>
  lighting_plan: LightingPlan | null
  created_at: string
  updated_at: string
}

export const BIRD_TYPES = ['BROILER', 'LAYER', 'BREEDER'] as const
export type BirdType = (typeof BIRD_TYPES)[number]
export type HouseSystem = 'FLOOR' | 'CAGED'
export type CapacityMethod = 'DENSITY' | 'WEIGHT' | 'CAGE'
