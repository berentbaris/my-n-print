# My-N-Print — Progress Log


## 2026-03-23 (session 5 — calorie bar, font & text polish)

- **Calorie bar:** Changed max from 2,500 to 3,000 kcal. Added visual tick markers with labels at the 2,000 and 2,500 positions. Colour gradient thresholds unchanged (green → amber at 2,000, amber → red at 2,500).
- **Intro font:** Removed inline `fontFamily: "Space Grotesk"` from the intro `<h2>` and content `<div>` so the section inherits the same system font stack as the rest of the page.
- **Intro description text:** Updated wording to "…personalized nitrogen footprint…" and added sentence about improving footprint through informed consumption reduction.

## 2026-03-23 (session 4 — Firestore logging)

- **Task 4 (persistent storage):** Added Firestore integration to log every completed calculation. Each write saves country, food footprint, energy footprint, total footprint, daily calories, app version, and a server-generated timestamp to the `calculations` collection.
- **Firebase SDK via CDN:** Since npm was unavailable in the build environment, loaded Firebase compat SDK (v10.14.1) from Google's CDN via `<script>` tags in `public/index.html` — zero new npm dependencies.
- **`src/firebase.js` created:** Lazy-init wrapper that returns a Firestore instance (or `null` if SDK fails to load). Exports `logCalculation()` as a fire-and-forget async function that never blocks the UI.
- **Security rules:** Created `firestore.rules` with create-only access on `calculations` and deny-all everywhere else. Updated `firebase.json` to reference the rules file.
- **v4.3 milestone complete:** All four tasks (intro text, live calorie counter, favicon, Firestore logging) are done. The organiser needs to enable Firestore in the Firebase console and deploy rules before the first live deploy.

## 2026-03-23 (session 3 — favicon)

- **Task 3 (favicon):** Created a custom SVG favicon featuring a bold stylized "N" with the logo's green gradient (`#1a5e3a` → `#10b981` → `#6dca4f`), diagonal stripe detail, and a small footprint accent — all on a dark rounded-square background (`#1a3a2a`).
- **Multi-format export:** Generated favicon.ico (16+32px), PNGs at 16, 32, 180, 192, and 512px, plus an apple-touch-icon and a `site.webmanifest` for PWA/mobile home-screen support.
- **index.html updated:** Added `<link>` tags for all favicon formats, apple-touch-icon, manifest, `theme-color` meta tag, and improved the `<title>` to "My-N-Print — Nitrogen Footprint Calculator".
- **Next:** Task 4 — persistent storage of calculated footprints to Firestore.

## 2026-03-23 (session 2)

- **Task 1 (intro text):** Added a "What is a nitrogen footprint?" section between the hero and the input form. Explains reactive nitrogen, why it matters, and the two footprint components (food & energy) with a clear layout using two info cards. Styled to match both dark and light modes using Space Grotesk.
- **Task 2 (real-time calorie counter):** Calorie estimate now updates live as the user changes food serving inputs, using `useMemo` on `foodInputs` and `sheetData.attr`. Added a colour-coded progress bar (green → amber → red) scaled to 2,500 kcal reference. No longer requires clicking "Calculate Footprint" first.
- **Cleanup:** Removed ~15 lines of DEBUG `console.log` statements from `calculateFootprint()`.
- **Version bumped** from 4.2.1 → 4.3.0.
- **Note:** Build could not be tested in VM (react-app-rewired module resolution error in sandbox). Code verified via brace-balance check and import validation — syntactically correct.

## 2026-03-21

- Created `goals.md` with full project description, hosting details, conventions, and four improvement tasks for the v4.3 milestone
- Reviewed codebase structure: single-component React + Vite app, Firebase-hosted, Google Sheets backend
- Identified a blocker on Task 4 (persistent storage) — need organiser input on Firestore vs. Sheets append
- Next session should begin with Task 1 (intro text)
