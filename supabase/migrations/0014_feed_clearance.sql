-- ============================================================================
-- UTC CPQ — 0014 feeding line clearance
-- Feeding/drinking line length = house − feed_line_clearance_m (default 6 m,
-- 3 m front + 3 m back for the line motor and the hopper). Idempotent.
-- ============================================================================

insert into public.calc_settings (key, value, unit, category, description) values
  ('feed_line_clearance_m', 6, 'm', 'feeding', 'Feeding line clearance total (3 m front + 3 m back for motor + hopper)')
on conflict (key) do nothing;
