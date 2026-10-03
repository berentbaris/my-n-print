// Consistency test: with the default (national average) inputs, the calculator must reproduce
// the national footprints published in the paper (Supplementary Table 1 / Supplementary Data 1).
// Run: npm test -- --watchAll=false
import data from '../data/appData.json';
import { nationalAverage, dailyCalories, computeFood, eatLancet } from './calc';

const TOL = 0.01; // kg N per capita per year

describe('defaults reproduce published national footprints', () => {
  Object.entries(data.countries).forEach(([iso, c]) => {
    test(`${c.name}`, () => {
      const r = nationalAverage(data, iso);
      expect(Math.abs(r.food.consumption - c.published.consumption)).toBeLessThan(TOL);
      expect(Math.abs(r.food.production - c.published.production)).toBeLessThan(TOL);
      expect(Math.abs(r.food.foodEnergy - c.published.food_energy)).toBeLessThan(TOL);
      expect(Math.abs(r.food.total - c.published.food)).toBeLessThan(TOL);
      expect(Math.abs(r.energy.total - c.published.energy)).toBeLessThan(TOL);
      expect(Math.abs(r.total - c.published.total)).toBeLessThan(TOL);
    });
  });
});

test('pathways add up to the food total', () => {
  const r = nationalAverage(data, 'DEU');
  const p = r.food.pathways;
  const s = p.leaching + p.volatilization + p.n2o + p.unspecified + p.wastewater + p.foodEnergy;
  // pathway VNFs are rounded separately from the total VNF in appData.json
  expect(Math.abs(s - r.food.total)).toBeLessThan(1e-4);
  const e = r.energy.pollutants;
  expect(Math.abs(e.NOx + e.NH3 + e.N2O - r.energy.total)).toBeLessThan(1e-4);
});

test('calorie estimate: 0 with no servings, +130 kcal oils/fats once a serving is entered', () => {
  expect(dailyCalories(data, {})).toBe(0);
  const one = dailyCalories(data, { eggs: 7 });
  const eggs = data.categories.find((c) => c.key === 'eggs').kcal;
  expect(Math.abs(one - (eggs + 130))).toBeLessThan(1e-6);
});

test('low household waste lowers production losses, high waste raises them', () => {
  const s = { beef: 2, milk: 7 };
  const lo = computeFood(data, 'DEU', s, 'low').production;
  const av = computeFood(data, 'DEU', s, 'average').production;
  const hi = computeFood(data, 'DEU', s, 'high').production;
  expect(lo).toBeLessThan(av);
  expect(hi).toBeGreaterThan(av);
});

test('EAT-Lancet diet gives a finite food footprint for every country', () => {
  Object.keys(data.countries).forEach((iso) => {
    expect(Number.isFinite(eatLancet(data, iso).total)).toBe(true);
  });
});
