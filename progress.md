# My-N-Print — Progress Log


## 2026-03-23

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
