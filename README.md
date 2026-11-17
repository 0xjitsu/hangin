# Hangin

**Hangin: ang hangin na nilalanghap mo ngayon.** (The air you're breathing now.)

A free, public-good web tool that shows hourly **PM2.5, PM10 and ozone (O₃)** for any Philippine city, now and for the next 24 hours, with plain-language advice for **kids, elders, pregnant women, people with asthma / lung / heart disease**, and everyone else.

**For:** parents, schools, barangay health workers, and anyone with asthma or other breathing problems.

Live: https://hangin-ph.vercel.app

## Features
- Searchable list of 60 Philippine cities (all of Metro Manila incl. Pateros, plus major cities elsewhere); remembers your last city. Optional "Use my location" button: only runs after you tap it, coordinates are rounded to 2 decimals and stay on your device (they are only sent to Open-Meteo to look up the forecast).
- Current values plus 24-hour bar strips (with a text table alternative) in µg/m³, times in PHT (Asia/Manila, UTC+8).
- US EPA AQI categories (Good → Hazardous) with advice per group, and a comparison with the WHO 2021 guidelines.
- English / Tagalog toggle; mobile-first (works from 320 px); keyboard and screen-reader friendly; colour is always paired with a label and icon.
- Loading, error (with retry), offline (last saved result, labelled with its time) and missing-value states.
- Static site: no server, no API keys, no trackers. The only runtime network call is to Open-Meteo.

## Data and attribution
Air quality data: [Open-Meteo.com](https://open-meteo.com/) Air Quality API ([docs](https://open-meteo.com/en/docs/air-quality-api)), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), based on Copernicus Atmosphere Monitoring Service (CAMS) information. The attribution is also shown on the page.

## Where the thresholds come from
All numbers live in [`src/data/thresholds.json`](src/data/thresholds.json), each with a source URL (smoke fails if one is missing):
- **US EPA AQI categories and breakpoints:** [AirNow AQI basics](https://www.airnow.gov/aqi/aqi-basics/), the [EPA AQI Technical Assistance Document](https://document.airnow.gov/technical-assistance-document-for-the-reporting-of-daily-air-quailty.pdf) (PM10, ozone), and the [February 2024 PM2.5 update](https://www.epa.gov/system/files/documents/2024-02/pm-naaqs-air-quality-index-fact-sheet.pdf) (Good now ends at 9.0 µg/m³).
- **WHO 2021 Air Quality Guidelines:** [publication](https://www.who.int/publications/i/item/9789240034228) (24-hour PM2.5 15, PM10 45 µg/m³; peak-season 8-hour O₃ 100 µg/m³).
- The advice wording is a short paraphrase of the EPA/AirNow health message for each category.
- Ozone: EPA breakpoints are in ppb/ppm; Open-Meteo reports µg/m³, so we convert at 1.963 µg/m³ per ppb (48.00 g/mol ÷ 24.45 L/mol at 25 °C, 1 atm). Hourly model values are compared against 24-hour (PM) and 8-hour (O₃) breakpoints as an approximation.

## Limits (please read)
- This is a **model forecast** on a coarse grid (CAMS global, about 0.4° or ~45 km, roughly 3-hourly), so nearby cities can show identical values, **not** readings from an official monitoring station. Local conditions (traffic, burning, a nearby factory) can differ a lot.
- It is **not medical advice**. Follow your doctor and official DENR-EMB advisories.

## Develop
```
npm install
npm run dev          # local dev server
npm run lint         # eslint + tsc + vitest unit tests
npm run build        # outputs dist/
npm run smoke        # static checks on dist/ + Playwright (375x812, 320, desktop) with a mocked API fixture
scripts/check-live.sh https://hangin-ph.vercel.app   # after a deploy: tags, assets, video, player page
npm run og           # re-render public/og/preview.mp4 and image.png (needs ffmpeg and a prior build)
```
`smoke` installs Playwright's Chromium on first run. A browser that cannot launch fails the check; nothing is skipped.

## Add a city
Append an entry to [`src/data/cities.json`](src/data/cities.json):
```json
{"name":"Example City","region":"Province","lat":14.1234,"lon":121.1234}
```
Use 4-decimal coordinates inside the Philippines (lat 4.5–21.5, lon 116–127) and a unique name; `npm run smoke` validates this.

## Link preview
`/og/preview.mp4` (H.264, 1200×630, under 5 MB), `/og/player.html` and `/og/image.png` are served from the site; head tags use absolute `https://hangin-ph.vercel.app` URLs.

## Support
<!-- TODO: add a donation link here and set DONATE_URL in src/config.ts once a real Sponsors page exists. -->
No donation page yet.

## License
MIT
