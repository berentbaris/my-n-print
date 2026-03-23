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

### Next task

All v4.3 tasks complete.

---

## Current status

All four v4.3 tasks complete. Task 4 (Firestore logging) implemented: Firebase compat SDK loaded from Google CDN via `<script>` tags in `public/index.html`; `src/firebase.js` lazily initialises the app and exports `logCalculation()`; every "Calculate Footprint" click now fires-and-forgets a write to the `calculations` collection (country, food footprint, energy footprint, total, daily calories, app version, server timestamp). Security rules (`firestore.rules`) restrict the collection to create-only. `firebase.json` updated to reference the rules file.

**Before deploying**, the organiser must:
1. Enable Firestore in the Firebase console (https://console.firebase.google.com/project/my-nprint/firestore → "Create database", production mode).
2. Deploy security rules: `firebase deploy --only firestore:rules`.
3. Verify the existing Google API key works for Firestore writes (if not, copy the Web API Key from Project Settings → General into `.env` as `REACT_APP_FIREBASE_API_KEY`).

## Blockers / decisions needed

- ~~**Task 4 (persistent storage):** Decided — use **Firestore** (free Spark plan: 20k writes/day, 1 GB storage). Already on Firebase, no extra services needed.~~ **RESOLVED**

---

Last updated: 2026-03-23 (session 4)
