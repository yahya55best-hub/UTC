-- ============================================================================
-- UTC CPQ — 0010 air-inlet area-based sizing
-- Adds structured width_m/height_m columns to air_inlet_models, the three inlet
-- settings, seeds confirmed inlet dimensions, and adds the Pericoli EWS 42 side
-- fan (18000 m³/h). Idempotent; safe to paste into the SQL editor.
-- ============================================================================

alter table public.air_inlet_models add column if not exists width_m  numeric;
alter table public.air_inlet_models add column if not exists height_m numeric;

comment on column public.air_inlet_models.airflow_per_inlet_m3h is
  'Informational only — NOT used by the inlet-count calculation (that uses width_m × height_m).';

-- Confirmed effective-opening dimensions (datasheets).
update public.air_inlet_models set width_m = 0.55,   height_m = 0.26   where name = 'UTC Air Inlet 26×55 cm';
update public.air_inlet_models set width_m = 0.8148, height_m = 0.2578 where name = 'SKOV DA 1911 flange inlet';

-- Inlet sizing constants (admin-editable). Inlets size on FULL tunnel capacity
-- at inlet velocity; side vent is a separate air-changes-per-hour path.
insert into public.calc_settings (key, value, unit, category, description) values
  ('inlet_air_velocity_ms',  5,  'm/s',  'ventilation', 'Design inlet air velocity (inlet-area sizing on tunnel capacity)'),
  ('air_inlet_spacing_m',    3,  'm',    'ventilation', 'Inlet placement spacing (center-to-center) + physical max per side'),
  ('side_vent_ach',          14, 'ACH',  'ventilation', 'Air changes per hour for side/transitional (minimum) ventilation')
on conflict (key) do nothing;

-- Pericoli EWS 42 side fan (matches the product description; 18000 m³/h).
insert into public.fan_models (name, fan_type, diameter_in, capacity_m3h, power_hp, brand_id, notes)
select 'Pericoli EWS 42', 'SIDE', 42, 18000, 1.0, b.id, 'Side/winter exhaust fan, 115×115 cm, 1 HP.'
from public.brands b where b.name = 'Pericoli'
on conflict (name) do nothing;
