// Renders public/og/image.png and public/og/preview.mp4 from the real app (with the test fixture).
// Usage: npm run build && node scripts/make-og.mjs
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { serveDist } from '../tests/server.mjs';

const fixture = readFileSync('tests/fixtures/open-meteo.json', 'utf8');
const { server, url } = await serveDist();
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, locale: 'en-PH' });
const page = await ctx.newPage();
await page.route('https://air-quality-api.open-meteo.com/**', (r) => r.fulfill({ contentType: 'application/json', body: fixture }));
await page.addInitScript(() => localStorage.setItem('hangin:city', 'Pasig'));
await page.goto(url);
await page.waitForSelector('[data-testid="value-pm2_5"]');
rmSync('tmp-frames', { recursive: true, force: true });
mkdirSync('tmp-frames');
let n = 0;
const shot = async (hold) => { for (let i = 0; i < hold; i++) await page.screenshot({ path: `tmp-frames/f${String(n++).padStart(4, '0')}.png` }); };
// 10 fps. Scene 1: start page, scene 2: typing a city, scene 3: picked, cards + advice.
await page.evaluate(() => { document.getElementById('result').innerHTML = ''; });
await shot(8);
for (const s of ['C', 'Ce', 'Ceb', 'Cebu']) { await page.fill('#search', s); await shot(4); }
await page.click('button.city[data-name="Cebu City"]');
await page.waitForSelector('[data-testid="value-pm2_5"]');
await shot(20);
await page.evaluate(() => window.scrollTo(0, 330));
await shot(25);
await page.screenshot({ path: 'public/og/image.png' });
await browser.close();
server.close();
execFileSync('ffmpeg', ['-y', '-framerate', '10', '-i', 'tmp-frames/f%04d.png', '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-crf', '28', '-movflags', '+faststart', '-an', 'public/og/preview.mp4'], { stdio: 'inherit' });
rmSync('tmp-frames', { recursive: true, force: true });
console.log('wrote public/og/image.png and preview.mp4');
