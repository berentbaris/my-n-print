// My-N-Print calculation module (v5.0, round-2 methodology).
// Pure functions, no React. Equations follow the Methods of Barış et al. (revised manuscript v9).
//
// Food (per food group):
//   N consumed       = servings/week × serving size (kg) × 52 × N content
//   consumption loss = N consumed × (1 − SC × NR)                       [wastewater]
//   production loss  = N consumed × VNF(pathway) × waste factor          [leaching, volatilization, N2O]
//   food-chain energy= N consumed × national food-chain energy per kg N
//   waste factor     = (1 − w) / (1 − m·w), w = household waste fraction of the food group,
//                      m = 0.5 / 1 / 1.5 for low / average / high household food waste.
//                      (VNFs are per kg N reaching consumers at the average waste fraction; wasting
//                      more means more food has to be produced for the same amount eaten.)
// Energy:
//   electricity  = kWh/month × 12 / household size × EF(kWh)       (0 with renewable electricity)
//   gas          = m³/month × 12 / household size × 0.000548 kg N/m³
//   other fuels  = national per capita value, or 0
//   car          = km/week × 52 × EF(km) (combustion or EV)
//   transit      = km/week × 52 × EF(passenger-km)
//   flights      = hours/year × EF(hour)
//   spending     = national goods & services per capita × 0.75 / 1 / 1.25

export const FOOD_PATHWAYS = ['leaching', 'volatilization', 'n2o'];
export const ENERGY_KEYS = ['electricity', 'household_gas', 'household_other', 'car', 'public_transit', 'flight', 'goods_services'];
export const ENERGY_LABELS = {
  electricity: 'Electricity',
  household_gas: 'Natural gas',
  household_other: 'Other household fuels',
  car: 'Car',
  public_transit: 'Public transit',
  flight: 'Flights',
  goods_services: 'Goods & services',
};

const num = (v, d = 0) => {
  const x = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(x) && x >= 0 ? x : d;
};

/** Inputs that reproduce the national average for a country. */
export function defaultInputs(data, iso) {
  const c = data.countries[iso];
  if (!c) return null;
  const servings = {};
  data.categories.forEach((cat) => { servings[cat.key] = c.food[cat.key]?.servings ?? 0; });
  return { iso, servings, ...c.defaults };
}

/** Round default inputs for display, keeping enough precision. */
export function roundForDisplay(v, step = 0.1) {
  return Math.round(v / step) * step;
}

export function wasteFactor(w, level, data) {
  const m = data.waste_multiplier[level] ?? 1;
  return (1 - w) / (1 - m * w);
}

/** Food footprint for a set of weekly servings (object keyed by category). */
export function computeFood(data, iso, servings, wasteLevel = 'average') {
  const c = data.countries[iso];
  const removal = c.removal ?? 0;
  const rows = data.categories.map((cat) => {
    const f = c.food[cat.key];
    const consN = num(servings[cat.key]) * cat.serving_kg * 52 * cat.n_content;
    const wf = wasteFactor(cat.waste, wasteLevel, data);
    const [vL, vV, vN, vT] = f.vnf;
    const pathwaysKnown = vL !== null && vL !== undefined;
    const production = consN * (vT ?? 0) * wf;
    const prodPath = pathwaysKnown
      ? { leaching: consN * vL * wf, volatilization: consN * vV * wf, n2o: consN * vN * wf, unspecified: 0 }
      : { leaching: 0, volatilization: 0, n2o: 0, unspecified: production };
    const consumption = consN * (1 - removal);
    const foodEnergy = consN * (f.fe ?? 0);
    return {
      key: cat.key, label: cat.label, group: cat.group, consN,
      production, consumption, foodEnergy, prodPath,
      total: production + consumption + foodEnergy,
      flag: f.flag,
    };
  });
  const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
  const pathways = {
    leaching: rows.reduce((a, r) => a + r.prodPath.leaching, 0),
    volatilization: rows.reduce((a, r) => a + r.prodPath.volatilization, 0),
    n2o: rows.reduce((a, r) => a + r.prodPath.n2o, 0),
    unspecified: rows.reduce((a, r) => a + r.prodPath.unspecified, 0),
    wastewater: sum('consumption'),
    foodEnergy: sum('foodEnergy'),
  };
  return {
    rows,
    consN: sum('consN'),
    production: sum('production'),
    consumption: sum('consumption'),
    foodEnergy: sum('foodEnergy'),
    total: sum('total'),
    pathways,
  };
}

/** Energy footprint for a set of energy inputs. */
export function computeEnergy(data, iso, inp) {
  const c = data.countries[iso];
  const hh = Math.max(1, num(inp.household, 1));
  const ef = c.ef;
  const elecEF = inp.renewable ? 0 : ef.electricity;
  const evEF = inp.renewable ? 0 : ef.ev;
  const parts = {
    electricity: (num(inp.kwh_month) * 12 / hh) * elecEF,
    household_gas: (num(inp.gas_m3_month) * 12 / hh) * data.gas_ef,
    household_other: inp.other_fuels === 'none' ? 0 : c.energy_pc.household_other,
    car: num(inp.car_km_week) * 52 * (inp.car_type === 'electric' ? evEF : ef.car),
    public_transit: num(inp.transit_km_week) * 52 * ef.public_transit,
    flight: num(inp.flight_hours) * ef.flight,
    goods_services: c.energy_pc.goods_services * (data.spending_multiplier[inp.spending] ?? 1),
  };
  // pollutant split (NOx, NH3, N2O) using national shares of each EDGAR component
  const poll = { NOx: 0, NH3: 0, N2O: 0 };
  ENERGY_KEYS.forEach((k) => {
    let sh = c.shares[k];
    if (k === 'household_gas') sh = data.gas_shares;
    if (k === 'car' && inp.car_type === 'electric') sh = c.shares.electricity;
    poll.NOx += parts[k] * sh[0];
    poll.NH3 += parts[k] * sh[1];
    poll.N2O += parts[k] * sh[2];
  });
  const total = ENERGY_KEYS.reduce((a, k) => a + parts[k], 0);
  return { parts, total, pollutants: poll };
}

export function computeAll(data, inputs) {
  const food = computeFood(data, inputs.iso, inputs.servings, inputs.waste);
  const energy = computeEnergy(data, inputs.iso, inputs);
  return { food, energy, total: food.total + energy.total };
}

/** National average = result with default inputs. */
export function nationalAverage(data, iso) {
  return computeAll(data, defaultInputs(data, iso));
}

/** Food footprint of the EAT-Lancet reference diet in the user's country (same VNFs, waste and treatment). */
export function eatLancet(data, iso) {
  const servings = {};
  data.categories.forEach((cat) => {
    servings[cat.key] = (cat.eat_kg_yr * (1 - cat.waste)) / cat.serving_kg / 52;
  });
  return { servings, ...computeFood(data, iso, servings, 'average') };
}

/** Estimated daily energy intake (kcal/day). Oils and fats (not a food group in the calculator)
 *  add a fixed 130 kcal/day, but only once the user has entered at least one serving. */
export function dailyCalories(data, servings) {
  let kcal = 0;
  let any = false;
  data.categories.forEach((cat) => {
    const s = num(servings?.[cat.key]);
    if (s > 0) any = true;
    kcal += (s / 7) * cat.kcal;
  });
  return any ? kcal + data.oils_fats_kcal : 0;
}

/** Components where the user is furthest above the national average (kg N/yr), largest first. */
export function biggestGaps(user, avg, n = 3) {
  const items = [];
  user.food.rows.forEach((r, i) => {
    items.push({ kind: 'food', key: r.key, label: r.label, user: r.total, avg: avg.food.rows[i].total });
  });
  ENERGY_KEYS.forEach((k) => {
    items.push({ kind: 'energy', key: k, label: ENERGY_LABELS[k], user: user.energy.parts[k], avg: avg.energy.parts[k] });
  });
  return items
    .map((x) => ({ ...x, diff: x.user - x.avg }))
    .filter((x) => x.diff > 0.05)
    .sort((a, b) => b.diff - a.diff)
    .slice(0, n);
}
