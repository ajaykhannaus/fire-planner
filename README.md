# 🔥 FIRE Planner

A global, multi-country **Financial Independence / Retire Early (FIRE)** and life‑goal planning app.
It runs entirely in your browser — **no login, no backend, no data ever leaves your device**. Plans are
saved in `localStorage`.

## Features

- **Any country / currency** — presets (India, US, UK, EU, UAE, Singapore, Australia, Canada) plus a
  custom‑country editor for inflation, FX, returns and number formatting (₹K/L/cr vs $K/M/B).
- **Core FIRE engine** — corpus projection age 30→100, safe‑withdrawal target, real returns, depletion age.
- **Asset allocation** — pre/post‑retirement weights and per‑asset returns with a blended‑return calc.
- **Expenses & investments** — categorised monthly breakdowns.
- **Life goals with financing** — for a house, car, wedding, education, etc. you can:
  - pay **cash**, or **finance with a loan** (set down‑payment %, interest %, tenure);
  - the **loan EMI is carried as an ongoing expense — including into retirement** — until the loan ends;
  - set an **annual appreciation %** so the asset (e.g. a house) grows in value and is added to **net worth**.
- **Goal funding** — dedicated sinking‑fund SIP per goal, plus loan EMI and appreciated asset value at retirement.
- **Career strategy briefing** — Status Quo, Accelerate SIP, Lump Sum, Balanced Mix, Work Longer, Lean FIRE,
  Coast FIRE, Ring‑Fence Goals, Allocation Tilt.
- **Charts, age snapshots, year‑by‑year table.**
- **Downloadable PDF report** (generated client‑side with jsPDF).

## Run locally

It's a static site — any static server works:

```bash
npm start            # npx serve public
# or
python3 -m http.server -d public 4318
```

Then open the printed URL.

## Deploy

Pushing to `main` publishes `public/` to **GitHub Pages** via `.github/workflows/pages.yml`.

## Tech

Vanilla JS ES modules, Chart.js and jsPDF via CDN. No build step.
