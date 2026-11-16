import thresholds from './data/thresholds.json';

export type CategoryId = 'good' | 'moderate' | 'usg' | 'unhealthy' | 'very_unhealthy' | 'hazardous';
export type Pollutant = 'pm2_5' | 'pm10' | 'ozone';

export const CATEGORY_ORDER: CategoryId[] = ['good', 'moderate', 'usg', 'unhealthy', 'very_unhealthy', 'hazardous'];
export const POLLUTANTS: Pollutant[] = ['pm2_5', 'pm10', 'ozone'];

interface Breakpoint {
  category: string;
  low: number;
  high: number;
  source: string;
}

const EPS = 1e-6;

/** Convert an Open-Meteo concentration (µg/m³) into the unit the EPA breakpoints use, truncated as EPA specifies. */
export function toBreakpointValue(p: Pollutant, ugm3: number): number {
  const def = thresholds.pollutants[p];
  let v = ugm3;
  if (p === 'ozone') v = ugm3 / thresholds.pollutants.ozone.ugPerPpb;
  const f = 10 ** def.truncateDecimals;
  return Math.floor(v * f + EPS) / f;
}

/** Map a concentration (µg/m³) to a US EPA AQI category. Missing/invalid -> null. Above the top breakpoint -> hazardous. */
export function bandForConcentration(p: Pollutant, ugm3: number | null | undefined): CategoryId | null {
  if (ugm3 === null || ugm3 === undefined || !Number.isFinite(ugm3) || ugm3 < 0) return null;
  const t = toBreakpointValue(p, ugm3);
  const bps = thresholds.pollutants[p].breakpoints as Breakpoint[];
  for (let i = bps.length - 1; i >= 0; i--) {
    if (t >= bps[i].low) return bps[i].category as CategoryId;
  }
  return 'good';
}

/** Map a US AQI number (0-500) to its category. Missing/invalid -> null. */
export function categoryFromAqi(aqi: number | null | undefined): CategoryId | null {
  if (aqi === null || aqi === undefined || !Number.isFinite(aqi) || aqi < 0) return null;
  const a = Math.round(aqi);
  for (const c of thresholds.categories) {
    if (a <= c.aqiHigh) return c.id as CategoryId;
  }
  return 'hazardous';
}

/** The worst (highest) category in a list, ignoring nulls. */
export function worstCategory(list: (CategoryId | null)[]): CategoryId | null {
  let worst = -1;
  for (const c of list) if (c) worst = Math.max(worst, CATEGORY_ORDER.indexOf(c));
  return worst < 0 ? null : CATEGORY_ORDER[worst];
}

export interface WhoComparison {
  guideline: number;
  basis: '24h' | '8h';
  ratio: number;
  exceeds: boolean;
}

/** Compare a reading with the WHO 2021 short-term guideline (24-hour for PM, 8-hour for ozone). */
export function whoComparison(p: Pollutant, ugm3: number | null | undefined): WhoComparison | null {
  if (ugm3 === null || ugm3 === undefined || !Number.isFinite(ugm3) || ugm3 < 0) return null;
  const w = thresholds.who2021;
  const guideline = p === 'ozone' ? w.ozone.avg8h : p === 'pm10' ? w.pm10.avg24h : w.pm2_5.avg24h;
  return { guideline, basis: p === 'ozone' ? '8h' : '24h', ratio: ugm3 / guideline, exceeds: ugm3 > guideline };
}
