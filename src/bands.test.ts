import { describe, it, expect } from 'vitest';
import { bandForConcentration, categoryFromAqi, overallCategory, worstCategory, whoComparison } from './bands';
import thresholds from './data/thresholds.json';

// Source: EPA PM NAAQS AQI fact sheet (Feb 2024 update)
// https://www.epa.gov/system/files/documents/2024-02/pm-naaqs-air-quality-index-fact-sheet.pdf
// PM2.5 µg/m³: Good 0.0-9.0 | Moderate 9.1-35.4 | USG 35.5-55.4 | Unhealthy 55.5-125.4 | Very Unhealthy 125.5-225.4 | Hazardous 225.5+
describe('PM2.5 bands (EPA 2024)', () => {
  const edges: [number, string][] = [
    [8.9, 'good'], [9.0, 'good'], [9.1, 'moderate'],
    [35.4, 'moderate'], [35.5, 'usg'],
    [55.4, 'usg'], [55.5, 'unhealthy'],
    [125.4, 'unhealthy'], [125.5, 'very_unhealthy'],
    [225.4, 'very_unhealthy'], [225.5, 'hazardous'], [400, 'hazardous'],
  ];
  it.each(edges)('%f -> %s', (v, c) => expect(bandForConcentration('pm2_5', v)).toBe(c));
  it('truncates to 0.1 as EPA does', () => {
    expect(bandForConcentration('pm2_5', 9.04)).toBe('good');
    expect(bandForConcentration('pm2_5', 35.49)).toBe('moderate');
  });
});

// Source: EPA AQI Technical Assistance Document
// https://document.airnow.gov/technical-assistance-document-for-the-reporting-of-daily-air-quailty.pdf
// PM10 µg/m³: 0-54 | 55-154 | 155-254 | 255-354 | 355-424 | 425+
describe('PM10 bands (EPA TAD)', () => {
  const edges: [number, string][] = [
    [53, 'good'], [54, 'good'], [55, 'moderate'],
    [154, 'moderate'], [155, 'usg'],
    [254, 'usg'], [255, 'unhealthy'],
    [354, 'unhealthy'], [355, 'very_unhealthy'],
    [424, 'very_unhealthy'], [425, 'hazardous'],
  ];
  it.each(edges)('%f -> %s', (v, c) => expect(bandForConcentration('pm10', v)).toBe(c));
});

// Source: EPA AQI TAD, ozone 8-hour (ppm): 0.000-0.054 | 0.055-0.070 | 0.071-0.085 | 0.086-0.105 | 0.106-0.200
// (1-hour table for the top: 0.405+ hazardous). Open-Meteo gives µg/m³, converted at 1.963 µg/m³ per ppb (48.00 g/mol / 24.45 L/mol).
describe('Ozone bands (EPA TAD, ppb via 1.963 µg/m³ per ppb)', () => {
  const k = thresholds.pollutants.ozone.ugPerPpb;
  const ug = (ppb: number) => ppb * k;
  const edges: [number, string][] = [
    [54, 'good'], [55, 'moderate'], [70, 'moderate'], [71, 'usg'],
    [85, 'usg'], [86, 'unhealthy'], [105, 'unhealthy'], [106, 'very_unhealthy'],
    [200, 'very_unhealthy'], [404, 'very_unhealthy'], [405, 'hazardous'],
  ];
  it.each(edges)('%f ppb at the edge -> %s', (ppb, c) => expect(bandForConcentration('ozone', ug(ppb))).toBe(c));
  it.each([[55, 'good'], [71, 'moderate'], [86, 'usg'], [106, 'unhealthy']] as [number, string][])(
    'just below %f ppb stays in the lower band', (ppb, c) => expect(bandForConcentration('ozone', ug(ppb) - 0.05)).toBe(c));
  it('takes the worse of the 8-hour and 1-hour tables', () => {
    expect(bandForConcentration('ozone', ug(125))).toBe('very_unhealthy'); // 8 h says very unhealthy; 1 h says USG
    expect(bandForConcentration('ozone', ug(250))).toBe('very_unhealthy');
    expect(bandForConcentration('ozone', ug(404))).toBe('very_unhealthy');
    expect(bandForConcentration('ozone', ug(405))).toBe('hazardous');
  });
  it('conversion constant is 1.963', () => expect(k).toBe(1.963));
});

describe('missing and invalid values', () => {
  it.each([null, undefined, NaN, Infinity, -1])('%s -> null', (v) => {
    expect(bandForConcentration('pm2_5', v as number)).toBeNull();
    expect(bandForConcentration('pm10', v as number)).toBeNull();
    expect(bandForConcentration('ozone', v as number)).toBeNull();
    expect(whoComparison('pm2_5', v as number)).toBeNull();
  });
  it('zero is Good, not missing', () => expect(bandForConcentration('pm2_5', 0)).toBe('good'));
});

// Source: AirNow AQI basics https://www.airnow.gov/aqi/aqi-basics/
// 0-50 Good | 51-100 Moderate | 101-150 USG | 151-200 Unhealthy | 201-300 Very Unhealthy | 301+ Hazardous
describe('US AQI category mapping', () => {
  const edges: [number, string][] = [
    [0, 'good'], [50, 'good'], [51, 'moderate'], [100, 'moderate'], [101, 'usg'], [150, 'usg'],
    [151, 'unhealthy'], [200, 'unhealthy'], [201, 'very_unhealthy'], [300, 'very_unhealthy'],
    [301, 'hazardous'], [500, 'hazardous'],
  ];
  it.each(edges)('AQI %i -> %s', (a, c) => expect(categoryFromAqi(a)).toBe(c));
  it('missing -> null', () => {
    expect(categoryFromAqi(null)).toBeNull();
    expect(categoryFromAqi(undefined)).toBeNull();
    expect(categoryFromAqi(NaN)).toBeNull();
  });
});

// The badge must agree with the printed US AQI, even when the single-hour bands disagree.
describe('overallCategory follows the US AQI', () => {
  it.each([[41, 'good'], [54, 'moderate'], [59, 'moderate'], [71, 'moderate'], [101, 'usg'], [null, null]] as [number | null, string | null][])(
    'AQI %s -> %s', (a, c) => expect(overallCategory({ us_aqi: a })).toBe(c));
  it('hourly Good beside AQI 55 (e.g. Angeles) reads Moderate', () => {
    expect(bandForConcentration('pm2_5', 8)).toBe('good');
    expect(overallCategory({ us_aqi: 55 })).toBe(categoryFromAqi(55));
    expect(overallCategory({ us_aqi: 55 })).toBe('moderate');
  });
  it('hourly Moderate beside AQI 42 (e.g. Laoag) reads Good', () => {
    expect(bandForConcentration('pm2_5', 12)).toBe('moderate');
    expect(overallCategory({ us_aqi: 42 })).toBe('good');
  });
});

describe('worstCategory', () => {
  it('picks the highest, ignoring nulls', () => {
    expect(worstCategory(['good', null, 'usg', 'moderate'])).toBe('usg');
    expect(worstCategory([null, null])).toBeNull();
  });
});

// Source: WHO 2021 AQG https://iris.who.int/server/api/core/bitstreams/551b515e-2a32-4e1a-a58c-cdaecd395b19/content
// PM2.5 24-h 15, PM10 24-h 45, O3 peak-season 8-h 100 (µg/m³)
describe('WHO 2021 comparison', () => {
  it('uses 15 / 45 / 100', () => {
    expect(whoComparison('pm2_5', 15)).toMatchObject({ guideline: 15, exceeds: false });
    expect(whoComparison('pm2_5', 15.1)?.exceeds).toBe(true);
    expect(whoComparison('pm10', 45)?.exceeds).toBe(false);
    expect(whoComparison('pm10', 46)?.exceeds).toBe(true);
    expect(whoComparison('ozone', 100)?.exceeds).toBe(false);
    expect(whoComparison('ozone', 101)?.basis).toBe('8h');
  });
});

describe('thresholds.json integrity', () => {
  it('every breakpoint has an https source', () => {
    for (const p of Object.values(thresholds.pollutants)) {
      expect(p.breakpoints.length).toBeGreaterThanOrEqual(5);
      for (const b of p.breakpoints) expect(b.source).toMatch(/^https:\/\//);
    }
  });
});
