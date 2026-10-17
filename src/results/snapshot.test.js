import data from '../data/appData.json';
import { defaultInputs, computeAll, nationalAverage, eatLancet, biggestGaps } from '../calc/calc';
import { createSnapshot } from './snapshot';

test('full snapshots preserve custom inputs, precision, all breakdowns and reproducible reference data', () => {
  const inputs = { ...defaultInputs(data, 'DEU'), car_type: 'electric', renewable: true, waste: 'low' };
  inputs.servings.beef = 1.23456789;
  inputs.household = 4;
  const user = computeAll(data, inputs);
  const avg = nationalAverage(data, 'DEU');
  const results = { user, avg, eat: eatLancet(data, 'DEU'), gaps: biggestGaps(user, avg) };
  const snapshot = createSnapshot({ data, inputs, rawInputs: {}, results, usedDefaults: false, appVersion: 'test', recommendations: [] });
  expect(snapshot.inputs.servings.beef).toBe(1.23456789);
  expect(snapshot.totalFootprint).toBe(user.total);
  expect(snapshot.results).toEqual(results);
  expect(snapshot.results.user.food.rows).toHaveLength(data.categories.length);
  expect(snapshot.results.user.energy.pollutants).toEqual(user.energy.pollutants);
  expect(snapshot.pathways).toHaveLength(9);
  expect(snapshot.pathways[1].name).toBe('Volatilization, NH₃ (food production)');
  const reproduced = computeAll({ ...snapshot.referenceData, countries: { DEU: snapshot.referenceData.country } }, snapshot.inputs);
  expect(reproduced).toEqual(user);
  inputs.servings.beef = 0;
  expect(snapshot.inputs.servings.beef).toBe(1.23456789);
});
