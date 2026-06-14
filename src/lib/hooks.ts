import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'
import type {
  AirInletModel, Brand, CageModel, CalcSetting, CoolingPadModel, FanModel, FxRate,
  HeaterModel, PriceListEntry, Product, ProductPricingVariant,
} from './types'

export interface Catalog {
  brands: Brand[]
  products: Product[]
  variants: ProductPricingVariant[]
  prices: PriceListEntry[]
  fx: FxRate[]
}

const EMPTY: Catalog = { brands: [], products: [], variants: [], prices: [], fx: [] }

export function useCatalog() {
  const [data, setData] = useState<Catalog>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    const [brands, products, variants, prices, fx] = await Promise.all([
      supabase.from('brands').select('*').order('brand_type').order('name'),
      supabase.from('products').select('*').order('name'),
      supabase.from('product_pricing_variants').select('*'),
      supabase.from('price_list_entries').select('*'),
      supabase.from('fx_rates').select('*'),
    ])
    const err = brands.error || products.error || variants.error || prices.error || fx.error
    if (err) setError(err.message)
    setData({
      brands: (brands.data as Brand[]) ?? [],
      products: (products.data as Product[]) ?? [],
      variants: (variants.data as ProductPricingVariant[]) ?? [],
      prices: (prices.data as PriceListEntry[]) ?? [],
      fx: (fx.data as FxRate[]) ?? [],
    })
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  return { ...data, loading, error, reload }
}

export function variantsFor(catalog: Catalog, productId: string): ProductPricingVariant[] {
  return catalog.variants.filter((v) => v.product_id === productId)
}

export interface EngineTables {
  settings: CalcSetting[]
  fans: FanModel[]
  pads: CoolingPadModel[]
  heaters: HeaterModel[]
  inlets: AirInletModel[]
  cages: CageModel[]
}

const EMPTY_ENGINE: EngineTables = { settings: [], fans: [], pads: [], heaters: [], inlets: [], cages: [] }

export function useEngineTables() {
  const [data, setData] = useState<EngineTables>(EMPTY_ENGINE)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    const [settings, fans, pads, heaters, inlets, cages] = await Promise.all([
      supabase.from('calc_settings').select('*').order('category').order('key'),
      supabase.from('fan_models').select('*').order('fan_type').order('name'),
      supabase.from('cooling_pad_models').select('*').order('name'),
      supabase.from('heater_models').select('*').order('name'),
      supabase.from('air_inlet_models').select('*').order('name'),
      supabase.from('cage_models').select('*').order('name'),
    ])
    const err =
      settings.error || fans.error || pads.error || heaters.error || inlets.error || cages.error
    if (err) setError(err.message)
    setData({
      settings: (settings.data as CalcSetting[]) ?? [],
      fans: (fans.data as FanModel[]) ?? [],
      pads: (pads.data as CoolingPadModel[]) ?? [],
      heaters: (heaters.data as HeaterModel[]) ?? [],
      inlets: (inlets.data as AirInletModel[]) ?? [],
      cages: (cages.data as CageModel[]) ?? [],
    })
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  return { ...data, loading, error, reload }
}
