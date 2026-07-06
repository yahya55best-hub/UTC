-- ============================================================================
-- UTC CPQ — 0011 ventilation corrections
-- (For databases that already applied 0010 with the earlier values.)
--   A) Air inlets now size on FULL tunnel capacity at 5 m/s.
--   B) Side fans now use air-changes-per-hour (min/transitional ventilation).
-- Idempotent; safe to paste into the SQL editor.
-- ============================================================================

-- A) inlet velocity 3 -> 5, drop the unused side-fan sizing constant
update public.calc_settings set value = 5 where key = 'inlet_air_velocity_ms';
delete from public.calc_settings where key = 'inlet_sizing_side_fans';

-- B) side ventilation air-changes-per-hour
insert into public.calc_settings (key, value, unit, category, description) values
  ('side_vent_ach', 14, 'ACH', 'ventilation', 'Air changes per hour for side/transitional (minimum) ventilation')
on conflict (key) do nothing;
