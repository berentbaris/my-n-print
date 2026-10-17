import { dailyCalories } from '../calc/calc';

export const PATHWAY_LABELS = {
  leaching: 'Leaching & runoff (food production)',
  volatilization: 'Volatilization, NH₃ (food production)',
  n2o: 'N₂O (food production)',
  unspecified: 'Fish & seafood (pathway not available)',
  wastewater: 'Wastewater (after treatment)',
  foodEnergy: 'Food-chain energy (farm fuel, processing)',
};

export function pathwayComparisons(results) {
  return [
    ...Object.entries(PATHWAY_LABELS).map(([key, name]) => ({
      name, You: results.user.food.pathways[key], 'National average': results.avg.food.pathways[key],
    })),
    ...[['NOx', 'NOₓ'], ['NH3', 'NH₃'], ['N2O', 'N₂O']].map(([key, label]) => ({
      name: `${label} (energy)`, You: results.user.energy.pollutants[key], 'National average': results.avg.energy.pollutants[key],
    })),
  ];
}

// Full precision and reference data keep old results reproducible after updates.
export function createSnapshot({ data, inputs, rawInputs, results, usedDefaults, appVersion, recommendations }) {
  const country = data.countries[inputs.iso];
  const { countries, ...constants } = data;
  return JSON.parse(JSON.stringify({
    schemaVersion: 2, appVersion, dataVersion: data.version, dataYear: data.data_year,
    country: country.name, iso: inputs.iso,
    foodFootprint: results.user.food.total,
    energyFootprint: results.user.energy.total,
    totalFootprint: results.user.total,
    dailyCalories: dailyCalories(data, inputs.servings),
    usedDefaults, wasteLevel: inputs.waste, carType: inputs.car_type,
    renewable: inputs.renewable, otherFuels: inputs.other_fuels, spending: inputs.spending,
    units: { footprint: 'kg N/person/year', foodServings: 'servings/week', electricity: 'kWh/household/month', gas: 'm3/household/month', travel: 'km/person/week', flights: 'hours/person/year', calories: 'kcal/person/day' },
    inputs, rawInputs, results,
    pathways: pathwayComparisons(results), recommendations,
    referenceData: { ...constants, country },
  }));
}
