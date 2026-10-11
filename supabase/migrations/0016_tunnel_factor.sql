-- 0016 — tunnel fan sizing now uses house length:
-- required air = L x W x H_avg x air_speed x 3600 / tunnel_factor ; fans = ceil(required / fan capacity)
insert into public.calc_settings (key, value, unit, category, description) values
  ('tunnel_factor', 100, '', 'ventilation', 'Tunnel fan sizing divisor: L x W x H_avg x speed x 3600 / factor')
on conflict (key) do nothing;
