// Smoke test: run after `npm run build`. Every check passes or fails CI; nothing is skipped.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { serveDist } from '../tests/server.mjs';

const BASE = 'https://hangin-ph.vercel.app';
const errors = [];
const fail = (m) => errors.push(m);

// ---------- static checks on dist/ ----------
if (!existsSync('dist/index.html')) {
  console.error('SMOKE FAIL: dist/index.html missing (run npm run build first)');
  process.exit(1);
}
const html = readFileSync('dist/index.html', 'utf8');
if (!/<title>[^<]*Hangin/.test(html)) fail('index.html: missing Hangin title');
if (!/Open-Meteo/.test(html) || !/CC BY 4\.0/.test(html) || !/Copernicus Atmosphere Monitoring Service/.test(html)) fail('index.html: missing Open-Meteo / CC BY 4.0 / CAMS attribution');
if (!/href="https:\/\/open-meteo\.com\/"/.test(html) || !/href="https:\/\/creativecommons\.org\/licenses\/by\/4\.0\/"/.test(html)) fail('index.html: attribution links missing');
if (!/Thresholds from/.test(html)) fail('index.html: "Thresholds from" missing');

// Head tags: tolerate tags spanning several lines by scanning every <meta ...> with [\s\S].
const metas = [...html.matchAll(/<meta\b([\s\S]*?)\/?>/g)].map((m) => {
  const attrs = {};
  for (const a of m[1].matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) attrs[a[1]] = a[2];
  return attrs;
});
const meta = (key) => metas.find((m) => m.property === key || m.name === key)?.content;
const expectHttps = (key) => {
  const v = meta(key);
  if (!v) fail(`meta ${key} missing`);
  else if (!v.startsWith(`${BASE}/`)) fail(`meta ${key} must be an absolute ${BASE} URL, got ${v}`);
  return v;
};
const expectEq = (key, want) => { if (meta(key) !== want) fail(`meta ${key} should be ${want}, got ${meta(key)}`); };
expectHttps('og:video');
expectHttps('og:video:secure_url');
expectEq('og:video:type', 'video/mp4');
for (const k of ['og:video:width', 'og:video:height', 'twitter:player:width', 'twitter:player:height']) if (!/^\d+$/.test(meta(k) ?? '')) fail(`meta ${k} missing or not numeric`);
expectEq('twitter:card', 'player');
expectHttps('twitter:player');
expectHttps('og:image');
expectEq('og:image:width', '1200');
expectEq('og:image:height', '630');
for (const k of ['og:title', 'og:description']) if (!meta(k)) fail(`meta ${k} missing`);

// ---------- every referenced asset exists ----------
const refs = new Set();
const collect = (text, from) => {
  for (const m of text.matchAll(/(?:src|href|poster)="([^"#?]+)[^"]*"/g)) refs.add(m[1]);
  for (const m of text.matchAll(/url\(["']?([^"')]+)["']?\)/g)) refs.add(m[1]);
  for (const m of text.matchAll(/["'`](\.?\.?\/[\w./-]+\.(?:js|css|woff2?|ttf|svg|png|mp4|json|wasm))["'`]/g)) refs.add(m[1]);
  void from;
};
const toLocal = (ref, base) => {
  let r = ref;
  if (r.startsWith(BASE)) r = r.slice(BASE.length);
  if (/^[a-z]+:|^\/\//i.test(r)) return null; // external
  if (!r.startsWith('/')) r = '/' + normalize(join(dirname(base), r)).replace(/^\.?\//, '');
  return r;
};
const seen = new Set();
const queue = [['/index.html', html]];
collect(html, '/index.html');
for (const r of [...refs]) { const l = toLocal(r, '/index.html'); if (l && l !== '/') queue.push([l, null]); }
refs.clear();
const checked = [];
while (queue.length) {
  const [path, text] = queue.shift();
  if (seen.has(path)) continue;
  seen.add(path);
  const file = join('dist', path);
  if (!existsSync(file)) { fail(`referenced asset missing from dist: ${path}`); continue; }
  checked.push(path);
  if (/\.(js|css|html)$/.test(path)) {
    const body = text ?? readFileSync(file, 'utf8');
    collect(body, path);
    for (const r of [...refs]) { const l = toLocal(r, path); if (l && l !== '/' && !seen.has(l)) queue.push([l, null]); }
    refs.clear();
  }
}
for (const must of ['/og/preview.mp4', '/og/image.png', '/og/player.html', '/favicon.svg']) if (!existsSync(join('dist', must))) fail(`dist${must} missing`);
if (!checked.some((p) => /^\/assets\/.+\.js$/.test(p))) fail('no built JS bundle referenced');
if (!checked.some((p) => /^\/assets\/.+\.css$/.test(p))) fail('no built CSS referenced');
// absolute og/ URLs must map to files that ship
for (const m of metas) if (m.content?.startsWith(`${BASE}/`)) { const p = m.content.slice(BASE.length); if (!existsSync(join('dist', p))) fail(`meta ${m.property ?? m.name} points to ${p}, not in dist`); }
if (!existsSync('dist/og/player.html') || !/\/og\/preview\.mp4/.test(readFileSync('dist/og/player.html', 'utf8'))) fail('og/player.html does not play /og/preview.mp4');

// ---------- MP4 ----------
const mp4 = 'dist/og/preview.mp4';
if (existsSync(mp4)) {
  const size = statSync(mp4).size;
  if (size >= 5 * 1024 * 1024) fail(`preview.mp4 is ${size} bytes, must be under 5 MB`);
  const head = readFileSync(mp4).subarray(0, 64).toString('latin1');
  if (!head.includes('ftyp')) fail('preview.mp4 is not an MP4 container (no ftyp box)');
  const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height:format=duration', '-of', 'json', mp4], { encoding: 'utf8' });
  if (probe.error || probe.status !== 0) fail(`ffprobe failed: ${probe.error?.message ?? probe.stderr}`);
  else {
    const j = JSON.parse(probe.stdout);
    const s = j.streams?.[0];
    const dur = Number(j.format?.duration);
    if (s?.codec_name !== 'h264') fail(`preview.mp4 codec is ${s?.codec_name}, need h264`);
    if (!(s?.width === 1200 && s?.height === 630) && !(s?.width * 9 === s?.height * 16)) fail(`preview.mp4 is ${s?.width}x${s?.height}, need 1200x630 or 16:9`);
    if (!(dur >= 5 && dur <= 8)) fail(`preview.mp4 duration ${dur}s, need 5-8 s`);
  }
}

// ---------- data files ----------
const cities = JSON.parse(readFileSync('src/data/cities.json', 'utf8'));
if (cities.length < 40) fail(`cities.json has ${cities.length} cities, need 40+`);
const names = new Set();
for (const c of cities) {
  if (!c.name || !c.region) fail(`city missing name/region: ${JSON.stringify(c)}`);
  if (names.has(c.name)) fail(`duplicate city ${c.name}`);
  names.add(c.name);
  if (typeof c.lat !== 'number' || typeof c.lon !== 'number' || !(c.lat >= 4.5 && c.lat <= 21.5 && c.lon >= 116 && c.lon <= 127)) fail(`city ${c.name} has lat/lon outside the Philippines`);
}
for (const n of ['Manila', 'Quezon City', 'Makati', 'Taguig', 'Pasig', 'Pasay', 'Parañaque', 'Las Piñas', 'Muntinlupa', 'Mandaluyong', 'San Juan', 'Marikina', 'Caloocan', 'Malabon', 'Navotas', 'Valenzuela', 'Pateros', 'Cebu City', 'Mandaue', 'Lapu-Lapu', 'Davao City', 'Baguio', 'Iloilo City', 'Bacolod', 'Cagayan de Oro', 'Zamboanga City', 'General Santos', 'Angeles', 'San Fernando (Pampanga)', 'Batangas City', 'Lucena', 'Naga', 'Legazpi', 'Tacloban', 'Puerto Princesa', 'Dumaguete', 'Tuguegarao', 'Laoag', 'Butuan']) if (!names.has(n)) fail(`required city missing: ${n}`);

const th = JSON.parse(readFileSync('src/data/thresholds.json', 'utf8'));
const isUrl = (s) => typeof s === 'string' && /^https:\/\/\S+$/.test(s);
for (const [p, def] of Object.entries(th.pollutants)) {
  if (def.breakpoints.length !== (p === 'ozone' ? 5 : 6)) fail(`thresholds ${p}: unexpected breakpoint count ${def.breakpoints.length}`);
  for (const b of [...def.breakpoints, ...(def.breakpoints1h ?? [])]) if (!isUrl(b.source)) fail(`thresholds ${p}/${b.category}: missing source URL`);
}
for (const [p, w] of Object.entries(th.who2021)) if (!isUrl(w.source)) fail(`thresholds who2021/${p}: missing source URL`);
for (const c of th.categories) if (!isUrl(c.source)) fail(`thresholds category ${c.id}: missing source URL`);

// ---------- browser checks (Playwright) ----------
const fixture = readFileSync('tests/fixtures/open-meteo.json', 'utf8');
const API = 'https://air-quality-api.open-meteo.com/**';
const { server, url } = await serveDist();
let browser;
try {
  browser = await chromium.launch(); // a launch failure throws -> CI fails; never skipped
  const external = new Set();
  for (const [label, viewport] of [['mobile 375x812', { width: 375, height: 812 }], ['desktop 1280x800', { width: 1280, height: 800 }]]) {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('request', (r) => { const u = new URL(r.url()); if (!r.url().startsWith(url) && !r.url().startsWith('data:')) external.add(u.origin); });
    const bad = [];
    page.on('response', (r) => { if (r.url().startsWith(url) && r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
    const calls = [];
    await page.route(API, (route) => { calls.push(route.request().url()); route.fulfill({ contentType: 'application/json', body: fixture }); });
    const noOverflow = async (when) => {
      const w = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
      if (w.s > w.c) fail(`${label}: horizontal overflow ${when} (scrollWidth ${w.s} > ${w.c})`);
    };
    try {
      await page.goto(url);
      await page.waitForSelector('[data-testid="value-pm2_5"]', { timeout: 10000 });
      if (!/lat/.test(calls[0] ?? '') || !calls[0].includes('timezone=Asia%2FManila') && !calls[0].includes('timezone=Asia/Manila')) fail(`${label}: unexpected API URL ${calls[0]}`);
      // city picker works
      await page.fill('#search', 'parana');
      const n = await page.locator('button.city').count();
      if (n !== 1) fail(`${label}: searching "parana" should show 1 city (accent-insensitive), got ${n}`);
      await page.click('button.city');
      await page.waitForFunction(() => document.querySelector('#place-h')?.textContent?.includes('Parañaque'));
      if ((await page.evaluate(() => localStorage.getItem('hangin:city'))) !== 'Parañaque') fail(`${label}: last city not remembered`);
      // cards render with numbers
      for (const p of ['pm2_5', 'pm10', 'ozone']) {
        const txt = await page.locator(`[data-testid="value-${p}"]`).textContent();
        if (!/^\d+\.\d$/.test(txt ?? '')) fail(`${label}: ${p} card has no number (${txt})`);
      }
      const body = await page.locator('#result').innerText();
      if (!/PHT/.test(body) || !/Data updated: 16 Nov, 2:00 PM PHT/.test(body)) fail(`${label}: "Data updated ... PHT" missing`);
      if ((await page.locator('.advice .g').count()) !== 5) fail(`${label}: expected 5 advice groups`);
      if ((await page.locator('.bars').count()) !== 3 || (await page.locator('.bars .bar').count()) !== 72) fail(`${label}: expected 3 bar strips of 24 hours`);
      if ((await page.locator('details.tbl tbody tr').count()) !== 24) fail(`${label}: hourly table should have 24 rows`);
      await page.locator('details.tbl summary').click();
      await noOverflow('with results and table open');
      const footer = await page.locator('footer').innerText();
      if (!/Open-Meteo\.com \(CC BY 4\.0\)/.test(footer) || !/Thresholds from/.test(footer) || !/not medical advice/.test(footer)) fail(`${label}: footer attribution/thresholds/disclaimer missing`);
      if (!/24-hour/.test(body) || !/8-hour/.test(body)) fail(`${label}: hourly-vs-24h/8h note missing`);
      if (!/this hour/i.test(body)) fail(`${label}: pollutant cards not labelled "this hour"`);
      {
        const badge = (await page.locator('.overall .badge').textContent()) ?? '';
        const aqi = Number(await page.locator('[data-testid="aqi"]').textContent());
        const want = aqi <= 50 ? 'Good' : aqi <= 100 ? 'Moderate' : aqi <= 150 ? 'Unhealthy for Sensitive' : 'Unhealthy';
        if (!badge.includes(want)) fail(`${label}: badge "${badge.trim()}" disagrees with US AQI ${aqi}`);
      }
      if ((await page.locator('#donate:visible').count()) !== 0) fail(`${label}: donate link should be hidden until DONATE_URL is set`);
      // language toggle
      await page.click('#lang');
      if ((await page.getAttribute('html', 'lang')) !== 'fil') fail(`${label}: html lang should be fil after toggle`);
      if (!/Susunod na 24 oras/.test(await page.locator('#result').innerText())) fail(`${label}: Tagalog result text missing`);
      await page.click('#lang');
      if ((await page.getAttribute('html', 'lang')) !== 'en') fail(`${label}: html lang should return to en`);
      // reload remembers the city
      await page.reload();
      await page.waitForFunction(() => document.querySelector('#place-h')?.textContent?.includes('Parañaque'));
      // error state, then retry succeeds
      await page.unroute(API);
      await page.route(API, (route) => route.abort('failed'));
      await page.evaluate(() => localStorage.clear());
      await page.click('button.city[data-name="Cebu City"], #search');
      await page.fill('#search', 'Cebu');
      await page.click('button.city[data-name="Cebu City"]');
      await page.waitForSelector('[data-state="error"]', { timeout: 10000 });
      if (!(await page.getByRole('button', { name: 'Try again' }).isVisible())) fail(`${label}: retry button missing in error state`);
      await noOverflow('in error state');
      await page.unroute(API);
      await page.route(API, (route) => route.fulfill({ contentType: 'application/json', body: fixture }));
      await page.getByRole('button', { name: 'Try again' }).click();
      await page.waitForSelector('[data-testid="value-pm2_5"]', { timeout: 10000 });
      // stale cache when the fetch fails after a success
      await page.unroute(API);
      await page.route(API, (route) => route.abort('failed'));
      await page.getByRole('button', { name: /Cebu City/ }).first().click();
      await page.waitForSelector('.banner.warn[role="status"]', { timeout: 10000 });
      if (!/Showing the last saved result|Could not refresh/.test(await page.locator('#result').innerText())) fail(`${label}: stale-cache notice missing`);
      if (!/PHT/.test(await page.locator('.banner.warn').first().innerText())) fail(`${label}: stale notice should show a PHT time`);
      // missing values
      await page.unroute(API);
      const sparse = JSON.parse(fixture);
      sparse.current.ozone = null; sparse.hourly.ozone = sparse.hourly.ozone.map(() => null);
      await page.route(API, (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(sparse) }));
      await page.evaluate(() => localStorage.clear());
      await page.getByRole('button', { name: /Cebu City/ }).first().click();
      await page.waitForFunction(() => document.querySelector('[data-testid="value-ozone"]')?.textContent === '—', null, { timeout: 10000 });
      if (!/Some values are missing/.test(await page.locator('#result').innerText())) fail(`${label}: missing-values note not shown`);
      await noOverflow('with missing values');
    } catch (e) {
      fail(`${label}: ${e.message.split('\n')[0]}`);
    }
    if (pageErrors.length) fail(`${label}: page errors: ${pageErrors.join('; ')}`);
    if (bad.length) fail(`${label}: same-origin requests failed: ${bad.join(', ')}`);
    await ctx.close();
  }
  // 320 px width: no overflow
  const ctx = await browser.newContext({ viewport: { width: 320, height: 640 } });
  const page = await ctx.newPage();
  await page.route(API, (route) => route.fulfill({ contentType: 'application/json', body: fixture }));
  await page.goto(url);
  await page.waitForSelector('[data-testid="value-pm2_5"]', { timeout: 10000 });
  const w = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
  if (w.s > w.c) fail(`320px: horizontal overflow (${w.s} > ${w.c})`);
  await ctx.close();
  // geolocation is never requested without a tap
  const gctx = await browser.newContext({ viewport: { width: 375, height: 812 }, permissions: [], geolocation: { latitude: 14.6, longitude: 121 } });
  const gp = await gctx.newPage();
  await gp.addInitScript(() => { window.__geo = 0; const g = navigator.geolocation; const orig = g.getCurrentPosition.bind(g); g.getCurrentPosition = (...a) => { window.__geo++; return orig(...a); }; });
  await gp.route(API, (route) => route.fulfill({ contentType: 'application/json', body: fixture }));
  await gp.goto(url);
  await gp.waitForSelector('[data-testid="value-pm2_5"]', { timeout: 10000 });
  if ((await gp.evaluate(() => window.__geo)) !== 0) fail('geolocation requested before the user tapped');
  await gctx.close();
  for (const o of external) if (o !== 'https://air-quality-api.open-meteo.com') fail(`unexpected external request origin: ${o}`);
} catch (e) {
  fail(`browser smoke could not run: ${e.message.split('\n')[0]}`);
} finally {
  await browser?.close();
  server.close();
}

if (errors.length) {
  console.error(`SMOKE FAIL (${errors.length}):\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log(`SMOKE OK (${checked.length} built files checked, ${cities.length} cities, mobile + desktop browser runs)`);
