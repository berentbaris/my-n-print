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
| 1 | **Add intro text** — short, plain-language explanation of the nitrogen footprint concept near the top of the page, aimed at the general public (what reactive nitrogen is, why it matters, and what this calculator does) | ✅ completed |
| 2 | **Real-time calorie counter** — the daily calorie estimate should update live as the user changes food servings, instead of only appearing after clicking "Calculate Footprint" | ✅ completed |
| 3 | **Add a favicon** — the browser tab currently has no icon, which looks unfinished. Create or add a small icon (based on the existing logo or a leaf/N motif) so the tab looks professional | ✅ completed |
| 4 | **Save calculated footprints to a persistent store** — log every completed calculation (country, energy footprint, food footprint, total, timestamp) to a permanent backend. Investigate whether Firebase (Firestore or Realtime Database) can serve as this "Excel DB" since the app is already hosted on Firebase. Google Sheets append-via-API is another option. | ✅ completed |

| 5 | **Calorie bar improvements** — extend bar max to 3,000 kcal and add visual tick marks at 2,000 and 2,500 | ✅ completed |
| 6 | **Intro text font fix** — remove Space Grotesk override from the intro section so it matches the rest of the page | ✅ completed |
| 7 | **Update intro description** — reword the subtitle to mention personalized footprint and informed consumption reduction | ✅ completed |

### Next task

All v4.3 tasks complete.

---

## Current status

Tasks 1–7 done. Session 5 applied three quick-fix polish items: calorie progress bar now scales to 3,000 kcal with tick marks at 2,000 and 2,500; intro section font changed to match the rest of the site (removed Space Grotesk inline override); intro description text updated with new wording about personalized footprint and informed consumption reduction.

## Blockers / decisions needed

- ~~**Task 4 (persistent storage):** Decided — use **Firestore** (free Spark plan: 20k writes/day, 1 GB storage). Already on Firebase, no extra services needed.~~ **RESOLVED**

---

Last updated: 2026-03-23 (session 5)
