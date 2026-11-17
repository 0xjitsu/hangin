import { API_BASE } from './config';
import type { Pollutant } from './bands';

export interface HourPoint {
  time: string; // local PHT ISO, e.g. 2026-11-16T14:00
  pm2_5: number | null;
  pm10: number | null;
  ozone: number | null;
  us_aqi: number | null;
}
export interface Reading {
  currentTime: string | null;
  current: Record<Pollutant | 'us_aqi', number | null>;
  hours: HourPoint[]; // next 24 hours from the current hour
}

export function buildUrl(lat: number, lon: number): string {
  const q = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    hourly: 'pm2_5,pm10,ozone,us_aqi,us_aqi_pm2_5,us_aqi_pm10,us_aqi_ozone',
    current: 'pm2_5,pm10,ozone,us_aqi',
    timezone: 'Asia/Manila',
    forecast_days: '2',
  });
  return `${API_BASE}?${q.toString().replace(/%2C/g, ',')}`;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Parse an Open-Meteo response. Throws if the payload has no usable shape. */
export function parseResponse(json: unknown): Reading {
  const j = json as {
    current?: Record<string, unknown>;
    hourly?: Record<string, unknown>;
  };
  const h = j?.hourly;
  if (!h || !Array.isArray(h.time)) throw new Error('Unexpected response');
  const times = h.time as string[];
  const col = (k: string): unknown[] => (Array.isArray(h[k]) ? (h[k] as unknown[]) : []);
  const c = j.current ?? {};
  const currentTime = typeof c.time === 'string' ? c.time : null;
  let start = 0;
  if (currentTime) {
    const hourStr = currentTime.slice(0, 13);
    const idx = times.findIndex((t) => t.slice(0, 13) >= hourStr);
    start = idx < 0 ? times.length : idx;
  }
  const hours: HourPoint[] = [];
  for (let i = start; i < Math.min(times.length, start + 24); i++) {
    hours.push({
      time: times[i],
      pm2_5: num(col('pm2_5')[i]),
      pm10: num(col('pm10')[i]),
      ozone: num(col('ozone')[i]),
      us_aqi: num(col('us_aqi')[i]),
    });
  }
  return {
    currentTime,
    current: { pm2_5: num(c.pm2_5), pm10: num(c.pm10), ozone: num(c.ozone), us_aqi: num(c.us_aqi) },
    hours,
  };
}

export async function fetchRaw(lat: number, lon: number): Promise<unknown> {
  const res = await fetch(buildUrl(lat, lon), { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
