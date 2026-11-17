import './style.css';
import cities from './data/cities.json';
import { GROUPS, adviceFor, type Lang } from './advice';
import { POLLUTANTS, bandForConcentration, overallCategory, whoComparison, type CategoryId, type Pollutant } from './bands';
import { fetchRaw, parseResponse, type Reading } from './api';
import { dictionaries, type Dict } from './i18n';
import { DONATE_URL } from './config';
import { formatEpochPht, formatPht, hourLabel } from './time';

interface Place { name: string; region: string; lat: number; lon: number; custom?: boolean }
interface Cached { raw: unknown; fetchedAt: number }

const K_CITY = 'hangin:city';
const K_LANG = 'hangin:lang';
const K_CACHE = 'hangin:cache:';
const ICONS: Record<CategoryId, string> = { good: '✓', moderate: '●', usg: '▲', unhealthy: '◆', very_unhealthy: '■', hazardous: '✖' };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const store = {
  get(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const fmt = (v: number | null) => (v === null ? '—' : v.toFixed(1));
const cacheKey = (p: Place) => `${K_CACHE}${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;

let lang: Lang = (store.get(K_LANG) as Lang | null) ?? (/^(fil|tl)/i.test(navigator.language) ? 'tl' : 'en');
let place: Place | null = null;
let seq = 0;
const t = (): Dict => dictionaries[lang];

type View =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; offline: boolean }
  | { kind: 'data'; reading: Reading; fetchedAt: number; stale: boolean };
let view: View = { kind: 'idle' };

function applyI18n() {
  const d = t();
  document.documentElement.lang = lang === 'tl' ? 'fil' : 'en';
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const v = (d as unknown as Record<string, unknown>)[el.dataset.i18n as string];
    if (typeof v === 'string') el.textContent = v;
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-html]').forEach((el) => {
    const v = (d as unknown as Record<string, unknown>)[el.dataset.i18nHtml as string];
    if (typeof v === 'string') el.innerHTML = v;
  });
  const btn = $('lang');
  btn.textContent = d.langToggle;
  btn.setAttribute('aria-label', d.langToggleLabel);
  btn.setAttribute('lang', lang === 'tl' ? 'en' : 'fil');
  const s = $<HTMLInputElement>('search');
  s.placeholder = d.searchPlaceholder;
  $('city-list').setAttribute('aria-label', d.cityListLabel);
  const donate = $<HTMLAnchorElement>('donate');
  if (DONATE_URL) donate.href = DONATE_URL; else donate.hidden = true;
}

function renderCityList() {
  const q = fold($<HTMLInputElement>('search').value.trim());
  const list = cities.filter((c) => !q || fold(c.name).includes(q) || fold(c.region).includes(q)).slice(0, 60);
  $('city-list').innerHTML = list.length
    ? list.map((c) => `<li><button type="button" class="city" tabindex="-1" data-name="${esc(c.name)}"${place && !place.custom && place.name === c.name ? ' aria-current="true"' : ''}>${esc(c.name)} <span class="region">${esc(c.region)}</span></button></li>`).join('')
    : `<li class="empty">${esc(t().noCities)}</li>`;
  const cur = document.querySelector<HTMLButtonElement>('#city-list button.city[aria-current]') ?? document.querySelector<HTMLButtonElement>('#city-list button.city');
  if (cur) cur.tabIndex = 0;
}

/** Roving tabindex: the city list is a single tab stop; arrow keys move within it. */
function focusCity(i: number) {
  const btns = [...document.querySelectorAll<HTMLButtonElement>('#city-list button.city')];
  btns.forEach((b, j) => { b.tabIndex = j === i ? 0 : -1; });
  btns[i]?.focus();
}

function categoryBadge(c: CategoryId | null): string {
  if (!c) return `<span class="badge none"><span aria-hidden="true">?</span> ${esc(t().noData)}</span>`;
  return `<span class="badge ${c}"><span aria-hidden="true">${ICONS[c]}</span> ${esc(t().category[c])}</span>`;
}

function pollutantCard(p: Pollutant, v: number | null): string {
  const d = t();
  const band = bandForConcentration(p, v);
  const who = whoComparison(p, v);
  let whoText = '';
  if (who) {
    const basis = who.basis === '24h' ? d.whoBasis24 : d.whoBasis8;
    whoText = `${d.who} (${basis} ${who.guideline} µg/m³): ${who.exceeds ? `<strong>${who.ratio.toFixed(1)}${d.whoTimes}, ${d.whoOver}</strong>` : d.whoWithin}`;
  }
  return `<article class="card ${band ?? 'none'}" data-pollutant="${p}">
    <h3>${esc(d.pollutant[p])} <span class="unit">(${esc(d.thisHour)})</span></h3>
    <p class="value"><span class="num" data-testid="value-${p}">${fmt(v)}</span> <span class="unit">µg/m³</span></p>
    <p>${categoryBadge(band)}</p>
    <p class="who">${whoText || esc(d.noData)}</p>
  </article>`;
}

function legend(): string {
  const d = t();
  return `<ul class="legend" aria-label="${esc(d.legend)}">${(Object.keys(ICONS) as CategoryId[]).map((c) => `<li><span class="sw ${c}" aria-hidden="true">${ICONS[c]}</span> ${esc(d.category[c])}</li>`).join('')}</ul>`;
}

function strip(p: Pollutant, r: Reading): string {
  const d = t();
  const vals = r.hours.map((h) => h[p]);
  const nums = vals.filter((v): v is number => v !== null);
  if (!nums.length) return `<div class="strip"><h4>${esc(d.pollutant[p])}</h4><p class="who">${esc(d.noData)}</p></div>`;
  const max = Math.max(...nums);
  const scale = Math.max(max, 1);
  const min = Math.min(...nums);
  const maxI = vals.indexOf(max);
  const bars = r.hours.map((h) => {
    const v = h[p];
    const c = bandForConcentration(p, v);
    const ht = v === null ? 4 : Math.max(6, Math.round((v / scale) * 100));
    return `<li class="bar ${c ?? 'none'}" style="--h:${ht}%" title="${hourLabel(h.time)} PHT: ${fmt(v)} µg/m³${c ? ', ' + esc(d.category[c]) : ''}"><span class="mk" aria-hidden="true">${c ? ICONS[c] : '?'}</span></li>`;
  }).join('');
  const label = `${d.pollutant[p]}, ${d.chartLabel}: ${d.low} ${min.toFixed(1)}, ${d.peak} ${max.toFixed(1)} µg/m³ ${maxI >= 0 ? hourLabel(r.hours[maxI].time) + ' PHT' : ''}`;
  return `<div class="strip"><h4>${esc(d.pollutant[p])} <span class="unit">µg/m³</span></h4>
    <ol class="bars" role="img" aria-label="${esc(label)}">${bars}</ol>
    <p class="axis"><span>${hourLabel(r.hours[0].time)}</span><span>${d.peak} ${max.toFixed(1)}</span><span>${hourLabel(r.hours[r.hours.length - 1].time)} PHT</span></p></div>`;
}

function hourTable(r: Reading): string {
  const d = t();
  const rows = r.hours.map((h) => `<tr><th scope="row">${hourLabel(h.time)}</th>${POLLUTANTS.map((p) => {
    const c = bandForConcentration(p, h[p]);
    return `<td>${fmt(h[p])} <span class="cat-s">${c ? ICONS[c] + ' ' + esc(d.category[c]) : ''}</span></td>`;
  }).join('')}</tr>`).join('');
  return `<details class="tbl"><summary>${esc(d.tableToggle)}</summary>
    <div class="scroll"><table><caption>${esc(d.tableCaption)}</caption>
    <thead><tr><th scope="col">${esc(d.hour)}</th>${POLLUTANTS.map((p) => `<th scope="col">${esc(d.pollutant[p])}</th>`).join('')}</tr></thead>
    <tbody>${rows}</tbody></table></div></details>`;
}

function renderData(r: Reading, fetchedAt: number, stale: boolean): string {
  const d = t();
  const bands = POLLUTANTS.map((p) => bandForConcentration(p, r.current[p]));
  const overall = overallCategory(r.current);
  const missing = bands.some((b) => b === null);
  const when = r.currentTime ? formatPht(r.currentTime) : formatEpochPht(fetchedAt);
  const advice = overall
    ? `<section class="advice" aria-labelledby="adv-h"><h3 id="adv-h">${esc(d.adviceTitle)}</h3><p class="note">${esc(d.adviceFor)}: ${categoryBadge(overall)}</p>
      <dl>${GROUPS.map((g) => `<div class="g ${g}"><dt>${esc(d.group[g])}</dt><dd>${esc(adviceFor(lang, overall, g))}</dd></div>`).join('')}</dl></section>`
    : '';
  const strips = r.hours.length ? `<section aria-labelledby="n24"><h3 id="n24">${esc(d.next24)}</h3>${legend()}${POLLUTANTS.map((p) => strip(p, r)).join('')}${hourTable(r)}</section>` : '';
  return `${stale ? `<p class="banner warn" role="status">${esc(d.staleNotice)} ${esc(formatEpochPht(fetchedAt))}.</p><p><button type="button" class="btn" data-act="retry">${esc(d.retry)}</button></p>` : ''}
    <h2 id="place-h">${esc(d.showing)}: ${esc(place?.name ?? '')}${place && !place.custom ? ` <span class="region">${esc(place.region)}</span>` : ''}</h2>
    <p class="updated">${esc(d.updated)}: <time>${esc(when)}</time></p>
    <div class="overall ${overall ?? 'none'}"><span class="o-label">${esc(d.overall)}</span> ${categoryBadge(overall)}
      ${r.current.us_aqi !== null ? `<span class="aqi">${esc(d.aqi)} <strong data-testid="aqi">${Math.round(r.current.us_aqi)}</strong></span>` : ''}</div>
    ${missing ? `<p class="banner warn">${esc(d.missingNote)}</p>` : ''}
    <p class="note">${esc(d.hourlyNote)}</p>
    <div class="cards">${POLLUTANTS.map((p) => pollutantCard(p, r.current[p])).join('')}</div>
    ${advice}${strips}`;
}

function render() {
  const el = $('result');
  const d = t();
  el.setAttribute('aria-busy', view.kind === 'loading' ? 'true' : 'false');
  switch (view.kind) {
    case 'idle': el.innerHTML = ''; break;
    case 'loading': el.innerHTML = `<p class="banner" role="status" data-state="loading">${esc(d.loading)}</p>`; break;
    case 'error':
      el.innerHTML = `<div class="banner err" data-state="error"><h2>${esc(view.offline ? d.offlineTitle : d.errorTitle)}</h2><p>${esc(view.offline ? d.offlineNone : d.errorBody)}</p><button type="button" class="btn" data-act="retry">${esc(d.retry)}</button></div>`;
      break;
    case 'data': el.innerHTML = renderData(view.reading, view.fetchedAt, view.stale); break;
  }
}

function readCache(p: Place): Cached | null {
  const s = store.get(cacheKey(p));
  if (!s) return null;
  try { const c = JSON.parse(s) as Cached; parseResponse(c.raw); return c; } catch { return null; }
}

async function load(p: Place) {
  place = p;
  const my = ++seq;
  view = { kind: 'loading' };
  render();
  try {
    const raw = await fetchRaw(p.lat, p.lon);
    const reading = parseResponse(raw);
    if (my !== seq) return;
    const fetchedAt = Date.now();
    store.set(cacheKey(p), JSON.stringify({ raw, fetchedAt } satisfies Cached));
    view = { kind: 'data', reading, fetchedAt, stale: false };
  } catch {
    if (my !== seq) return;
    const c = readCache(p);
    view = c ? { kind: 'data', reading: parseResponse(c.raw), fetchedAt: c.fetchedAt, stale: true } : { kind: 'error', offline: !navigator.onLine };
  }
  render();
  renderCityList();
}

function pick(name: string) {
  const c = cities.find((x) => x.name === name);
  if (!c) return;
  store.set(K_CITY, c.name);
  $('locate-msg').textContent = '';
  void load(c);
  renderCityList();
}

function locate() {
  const msg = $('locate-msg');
  if (!('geolocation' in navigator)) { msg.textContent = t().locationDenied; return; }
  msg.textContent = t().locating;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = Math.round(pos.coords.latitude * 100) / 100;
      const lon = Math.round(pos.coords.longitude * 100) / 100;
      if (lat < 4.5 || lat > 21.5 || lon < 116 || lon > 127) { msg.textContent = t().locationOutside; return; }
      msg.textContent = '';
      void load({ name: t().yourLocation, region: '', lat, lon, custom: true });
    },
    () => { msg.textContent = t().locationDenied; },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
  );
}

function setLang(l: Lang) {
  lang = l;
  store.set(K_LANG, l);
  if (place?.custom) place = { ...place, name: t().yourLocation };
  applyI18n();
  renderCityList();
  render();
}

function init() {
  applyI18n();
  renderCityList();
  $('lang').addEventListener('click', () => setLang(lang === 'en' ? 'tl' : 'en'));
  $('search').addEventListener('input', renderCityList);
  $('search').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); focusCity(0); }
  });
  $('city-list').addEventListener('keydown', (e) => {
    const btns = [...document.querySelectorAll<HTMLButtonElement>('#city-list button.city')];
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const to = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? btns.length - 1 : null;
    if (to === null) return;
    e.preventDefault();
    if (to < 0) $('search').focus(); else focusCity(Math.min(to, btns.length - 1));
  });
  $('city-list').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button.city');
    if (b) pick(b.dataset.name as string);
  });
  $('locate').addEventListener('click', locate);
  $('result').addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-act="retry"]') && place) void load(place);
  });
  window.addEventListener('online', () => { if (place && view.kind !== 'loading') void load(place); });
  const saved = store.get(K_CITY);
  const start = cities.find((c) => c.name === saved) ?? cities[0];
  pick(start.name);
}

init();
