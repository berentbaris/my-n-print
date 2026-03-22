# My-N-Print Platform — Development Goals

## About the project

My-N-Print is a **personal nitrogen footprint calculator** that estimates your yearly reactive-nitrogen output based on food consumption and energy use. Users select their country, enter daily food servings and energy habits, and the tool returns a breakdown of their nitrogen footprint (food production, food consumption/waste, sewage, and energy) compared to their country's average.

The app is a **React + Vite** single-page application. It pulls reference data (virtual nitrogen factors, sewage ratings, country-level food and energy stats) from a Google Sheets backend via the Sheets API. The front end is a single main component (`NFootprintCalculator.jsx`) styled with CSS modules in `App.css`.

**Live site:** <https://my-nprint.web.app/>
**Hosting:** Firebase Hosting, managed through the Google Cloud / Firebase console (`firebase.json` → `build/` directory).
**Data backend:** Google Sheets (spreadsheet ID in source), accessed with a restricted API key.

## Conventions

- Framework: React 19 + Vite
- Styling: plain CSS in `App.css` (Space Grotesk font, green gradient palette, dark/light mode)
- Structure: single `/src/components/NFootprintCalculator.jsx` component, may be split as the app grows
- No TypeScript yet — plain JS/JSX
- Deploy: `npm run build` → `firebase deploy`
- Keep design distinctive — avoid generic AI aesthetics; use character in typography and layout

---

## Current milestone: UX & Data Polish (v4.3)

### Task list

| # | Task | Status |
|---|------|--------|
| 1 | **Add intro text** — short, plain-language explanation of the nitrogen footprint concept near the top of the page, aimed at the general public (what reactive nitrogen is, why it matters, and what this calculator does) | pending |
| 2 | **Real-time calorie counter** — the daily calorie estimate should update live as the user changes food servings, instead of only appearing after clicking "Calculate Footprint" | pending |
| 3 | **Add a favicon** — the browser tab currently has no icon, which looks unfinished. Create or add a small icon (based on the existing logo or a leaf/N motif) so the tab looks professional | pending |
| 4 | **Save calculated footprints to a persistent store** — log every completed calculation (country, energy footprint, food footprint, total, timestamp) to a permanent backend. Investigate whether Firebase (Firestore or Realtime Database) can serve as this "Excel DB" since the app is already hosted on Firebase. Google Sheets append-via-API is another option. | pending |

### Next task

Task 1

---

## Current status


## Blockers / decisions needed

- ~~**Task 4 (persistent storage):** Decided — use **Firestore** (free Spark plan: 20k writes/day, 1 GB storage). Already on Firebase, no extra services needed.~~ **RESOLVED**

---

Last updated: 2026-03-22
