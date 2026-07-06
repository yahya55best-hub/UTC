-- ============================================================================
-- UTC CPQ — 0013 inlet per-side ×2 + heater spacing 30
-- Air-inlet count fix is code-only (the area formula is per-side, then ×2).
-- Heaters now use a 30 m spacing setting, rounded to nearest.
-- Idempotent.
-- ============================================================================

insert into public.calc_settings (key, value, unit, category, description) values
  ('heater_spacing_m', 30, 'm', 'heating', 'House length per heater (round to nearest)')
on conflict (key) do nothing;
