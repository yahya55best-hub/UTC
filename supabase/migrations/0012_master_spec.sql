-- ============================================================================
-- UTC CPQ — 0012 master calculation spec alignment
-- Tunnel fans sized on cross-section × target airspeed; new pipe/clearance
-- setting names; the EWS 53 (36000) and Multifan box 130 (44600) tunnel models.
-- Idempotent; safe to paste into the SQL editor.
-- ============================================================================

insert into public.calc_settings (key, value, unit, category, description) values
  ('tunnel_target_airspeed_ms', 2.6, 'm/s', 'ventilation', 'Tunnel design air speed (cross-section × airspeed fan sizing)'),
  ('house_end_clearance_m',     3,   'm',   'feeding',     'Length removed for front+back clearance (1.5 m each end)'),
  ('drink_pipe_len_m',          3,   'm',   'drinking',    'Drinking PVC pipe length')
on conflict (key) do nothing;

-- Tunnel fan models (working capacities used by the sizing engine).
insert into public.fan_models (name, fan_type, diameter_in, capacity_m3h, power_hp, brand_id, notes)
select 'Pericoli EWS 53', 'TUNNEL', 53, 36000, 1.5, b.id, 'Tunnel exhaust fan, working capacity 36000 m³/h.'
from public.brands b where b.name = 'Pericoli'
on conflict (name) do nothing;

insert into public.fan_models (name, fan_type, diameter_in, capacity_m3h, power_hp, brand_id, notes)
select 'Multifan box 130', 'TUNNEL', 51, 44600, null, b.id, 'Galvanised box fan 130 cm, 44600 m³/h.'
from public.brands b where b.name = 'Multifan'
on conflict (name) do nothing;
