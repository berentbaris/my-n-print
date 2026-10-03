import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from 'recharts';
import logo from '../nprint_lite_new_logo.png';
import { logCalculation } from '../firebase';
import data from '../data/appData.json';
import {
  defaultInputs, computeAll, nationalAverage, eatLancet, dailyCalories, biggestGaps,
  ENERGY_KEYS, ENERGY_LABELS, wasteFactor,
} from '../calc/calc';

/* ===== CONFIG ===== */
const VERSION = '5.0.0';
const COUNTRY_LIST = Object.entries(data.countries)
  .map(([iso, c]) => ({ iso, name: c.name }))
  .sort((a, b) => a.name.localeCompare(b.name));
const IMPUTED_FLAGS = new Set(['income-group (N-Print)', 'income-group median', 'income-group median (app)']);
const ENERGY_ICONS = {
  electricity: '⚡', household_gas: '🔥', household_other: '🪵', car: '🚗', public_transit: '🚌', flight: '✈️', goods_services: '🛍️',
};
const EF_LABELS = { electricity: 'electricity', ev: 'electric car', public_transit: 'public transit', flight: 'flights', car: 'car' };

// colour-blind-safe palette (Okabe–Ito)
const C_USER = '#0072B2';
const C_AVG = '#E69F00';
const C_EAT = '#009E73';

/* ===== HELPERS ===== */
const fmtInput = (v) => {
  if (!Number.isFinite(v) || v === 0) return '0';
  if (v < 1) return String(Math.round(v * 100) / 100);
  if (v < 100) return String(Math.round(v * 10) / 10);
  return String(Math.round(v));
};
const kg = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '–');
const parse = (s) => {
  const n = parseFloat(String(s).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const field = (v) => ({ raw: fmtInput(v), val: v });

const TIPS = {
  beef: 'Beef has among the highest nitrogen losses per serving. Replacing some servings with poultry, legumes or grains lowers your footprint the most.',
  'mutton and goat meat': 'Mutton and goat meat have very high losses per serving. Swapping some servings for legumes, poultry or fish helps.',
  pork: 'Try replacing some pork with plant proteins such as beans, lentils or tofu.',
  poultry: 'Poultry is lower than red meat, but plant proteins are lower still.',
  offals: 'Offal comes from the same animals as red meat and carries similar losses per kg of nitrogen.',
  'fish and seafood': 'Choose a moderate amount of fish; plant proteins have lower losses.',
  milk: 'Dairy contributes through feed and manure. Moderate amounts, or plant-based alternatives, reduce losses.',
  cheese: 'Cheese is concentrated milk — it takes about 10 kg of milk to make 1 kg of cheese.',
  eggs: 'Eggs are moderate; legumes are a lower-nitrogen protein source.',
  default_food: 'Eating closer to the recommended amount of this food group lowers your footprint.',
  electricity: 'Switch to a renewable electricity tariff or install solar panels, and use efficient appliances.',
  household_gas: 'Better insulation, a lower thermostat setting, or a heat pump reduce gas use.',
  household_other: 'Cleaner cooking and heating fuels (e.g. electricity or LPG instead of wood, charcoal or kerosene) reduce emissions.',
  car: 'Drive less, car-share, or switch to an electric car — combustion engines are a major NOₓ source.',
  public_transit: 'Public transit is usually lower per km than driving; walking and cycling are zero.',
  flight: 'Fewer or shorter flights, or taking the train, reduce aviation NOₓ.',
  goods_services: 'Buying fewer new goods (repairing, sharing, second-hand) lowers the embodied emissions of consumption.',
};

/* ===== SMALL UI PIECES ===== */
function Card({ dark, className = '', children }) {
  return (
    <div className={`rounded-lg shadow p-5 ${dark ? 'bg-gray-800' : 'bg-white'} ${className}`}>{children}</div>
  );
}
function H2({ dark, children }) {
  return <h2 className={`text-2xl font-bold mb-3 ${dark ? 'text-emerald-300' : 'text-emerald-800'}`}>{children}</h2>;
}
function Note({ dark, children }) {
  return <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-600'}`}>{children}</p>;
}

/* ===== COMPONENT ===== */
const NFootprintCalculator = () => {
  const [darkMode, setDarkMode] = useState(false);
  const [iso, setIso] = useState('');
  const [food, setFood] = useState({});
  const [en, setEn] = useState({});
  const [opts, setOpts] = useState({});
  const [touched, setTouched] = useState(false);
  const [calculated, setCalculated] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [showServingPanel, setShowServingPanel] = useState(false);
  const [showPathways, setShowPathways] = useState(false);

  const country = iso ? data.countries[iso] : null;

  // load the national average into every input when a country is chosen
  const loadDefaults = (code) => {
    const d = defaultInputs(data, code);
    if (!d) return;
    const f = {};
    data.categories.forEach((c) => { f[c.key] = field(d.servings[c.key]); });
    setFood(f);
    setEn({
      household: field(d.household),
      kwh_month: field(d.kwh_month),
      gas_m3_month: field(d.gas_m3_month),
      car_km_week: field(d.car_km_week),
      transit_km_week: field(d.transit_km_week),
      flight_hours: field(d.flight_hours),
    });
    setOpts({
      other_fuels: d.other_fuels, car_type: d.car_type, spending: d.spending, waste: d.waste, renewable: d.renewable,
    });
    setTouched(false);
  };

  const onCountry = (code) => {
    setIso(code);
    loadDefaults(code);
  };

  const setFoodVal = (k, raw) => {
    setFood((p) => ({ ...p, [k]: { raw, val: parse(raw) } }));
    setTouched(true);
  };
  const setEnVal = (k, raw) => {
    setEn((p) => ({ ...p, [k]: { raw, val: parse(raw) } }));
    setTouched(true);
  };
  const setOpt = (k, v) => {
    setOpts((p) => ({ ...p, [k]: v }));
    setTouched(true);
  };
  const clearFood = () => {
    const f = {};
    data.categories.forEach((c) => { f[c.key] = { raw: '', val: 0 }; });
    setFood(f);
    setTouched(true);
  };

  const servings = useMemo(() => {
    const s = {};
    data.categories.forEach((c) => { s[c.key] = food[c.key]?.val ?? 0; });
    return s;
  }, [food]);

  // live calorie estimate (130 kcal/day oils & fats added only once at least one serving is entered)
  const liveCalories = useMemo(() => dailyCalories(data, servings), [servings]);

  const inputs = useMemo(() => (iso ? {
    iso,
    servings,
    household: Math.max(1, en.household?.val || 1),
    kwh_month: en.kwh_month?.val ?? 0,
    gas_m3_month: en.gas_m3_month?.val ?? 0,
    car_km_week: en.car_km_week?.val ?? 0,
    transit_km_week: en.transit_km_week?.val ?? 0,
    flight_hours: en.flight_hours?.val ?? 0,
    ...opts,
  } : null), [iso, servings, en, opts]);

  const results = useMemo(() => {
    if (!calculated || !inputs) return null;
    const user = computeAll(data, inputs);
    const avg = nationalAverage(data, iso);
    const eat = eatLancet(data, iso);
    return { user, avg, eat, gaps: biggestGaps(user, avg, 3) };
  }, [calculated, inputs, iso]);

  useEffect(() => {
    if (results && !hasScrolled) {
      const el = document.getElementById('results-section');
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); setHasScrolled(true); }
    }
  }, [results, hasScrolled]);

  const calculate = () => {
    if (!inputs) return;
    setCalculated(true);
    const r = computeAll(data, inputs);
    logCalculation({
      country: country.name,
      iso,
      foodFootprint: r.food.total,
      energyFootprint: r.energy.total,
      totalFootprint: r.total,
      dailyCalories: liveCalories,
      usedDefaults: !touched,
      wasteLevel: opts.waste,
      carType: opts.car_type,
      renewable: !!opts.renewable,
      otherFuels: opts.other_fuels,
      spending: opts.spending,
      appVersion: VERSION,
    });
  };

  const toggleDarkMode = () => {
    setDarkMode((d) => {
      const next = !d;
      document.body.style.backgroundColor = next ? '#0a0a3a' : '#f0fdf4';
      return next;
    });
  };
  const getInputBorderGradient = () => (darkMode
    ? 'linear-gradient(to right, #1a1a2e, #16213e, #0f3460, #541690)'
    : 'linear-gradient(to right, #800000, #a52a2a, #ff4500, #ff8c00)');

  // grams of N lost per serving (shown next to each food input)
  const perServing = (cat) => {
    if (!country) return null;
    const f = country.food[cat.key];
    const consN = cat.serving_kg * cat.n_content;
    const wf = wasteFactor(cat.waste, opts.waste || 'average', data);
    return consN * ((f.vnf[3] ?? 0) * wf + (1 - (country.removal ?? 0)) + (f.fe ?? 0)) * 1000;
  };

  const flaggedFood = country
    ? data.categories.filter((c) => IMPUTED_FLAGS.has(country.food[c.key].flag))
    : [];
  const importsOnly = country
    ? data.categories.filter((c) => country.food[c.key].flag === 'imports')
    : [];

  /* ===== STYLES ===== */
  const inputCls = `w-28 p-2 border rounded-md text-right text-lg appearance-none [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:m-0 ${darkMode ? 'bg-gray-600 border-gray-500 text-white focus:border-emerald-500' : 'bg-white border-gray-300 text-gray-900 focus:border-emerald-500'}`;
  const selectCls = `block w-full p-2 border rounded-md shadow-sm focus:outline-none ${darkMode ? 'bg-gray-600 border-gray-500 text-white' : 'bg-white border-gray-300 text-gray-900'}`;
  const tileCls = `p-3 rounded-lg shadow-sm ${darkMode ? 'bg-gray-700' : 'bg-green-50'}`;
  const labelCls = `font-medium ${darkMode ? 'text-gray-200' : 'text-gray-800'}`;
  const subCls = `text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`;
  const axisTick = { fontSize: typeof window !== 'undefined' && window.innerWidth < 640 ? 11 : 13, fill: darkMode ? '#e5e7eb' : '#374151' };
  const tooltipProps = {
    contentStyle: { backgroundColor: darkMode ? '#374151' : '#fff', border: 'none', borderRadius: 8 },
    itemStyle: { color: darkMode ? '#e5e7eb' : '#374151' },
    labelStyle: { color: darkMode ? '#e5e7eb' : '#111827', fontWeight: 600 },
    formatter: (v) => `${Number(v).toFixed(2)} kg N/yr`,
  };

  /* ===== CHART DATA ===== */
  const foodCompare = results ? results.user.food.rows.map((r, i) => ({
    name: r.label, You: r.total, 'National average': results.avg.food.rows[i].total,
  })) : [];
  const energyCompare = results ? ENERGY_KEYS.map((k) => ({
    name: ENERGY_LABELS[k], You: results.user.energy.parts[k], 'National average': results.avg.energy.parts[k],
  })) : [];
  const pathwayRows = results ? (() => {
    const u = results.user; const a = results.avg;
    const rows = [
      { name: 'Leaching & runoff (food production)', You: u.food.pathways.leaching, 'National average': a.food.pathways.leaching },
      { name: 'Volatilization, NH₃ + NOₓ (food production)', You: u.food.pathways.volatilization, 'National average': a.food.pathways.volatilization },
      { name: 'N₂O (food production)', You: u.food.pathways.n2o, 'National average': a.food.pathways.n2o },
      { name: 'Fish & seafood (pathway not available)', You: u.food.pathways.unspecified, 'National average': a.food.pathways.unspecified },
      { name: 'Wastewater (after treatment)', You: u.food.pathways.wastewater, 'National average': a.food.pathways.wastewater },
      { name: 'Food-chain energy (farm fuel, processing)', You: u.food.pathways.foodEnergy, 'National average': a.food.pathways.foodEnergy },
      { name: 'NOₓ (energy)', You: u.energy.pollutants.NOx, 'National average': a.energy.pollutants.NOx },
      { name: 'NH₃ (energy)', You: u.energy.pollutants.NH3, 'National average': a.energy.pollutants.NH3 },
      { name: 'N₂O (energy)', You: u.energy.pollutants.N2O, 'National average': a.energy.pollutants.N2O },
    ];
    return rows;
  })() : [];

  const narrow = typeof window !== 'undefined' && window.innerWidth < 640;
  const compareChart = (rows, height) => (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={darkMode ? '#374151' : '#e5e7eb'} />
        <XAxis type="number" tick={axisTick} stroke={darkMode ? '#9ca3af' : '#4b5563'} tickFormatter={(v) => `${Number(v).toFixed(1)} kg`} />
        <YAxis type="category" dataKey="name" width={narrow ? 110 : 170} tick={axisTick} stroke={darkMode ? '#9ca3af' : '#4b5563'} interval={0} />
        <Tooltip {...tooltipProps} cursor={{ fill: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)' }} />
        <Legend wrapperStyle={{ color: darkMode ? '#e5e7eb' : '#374151' }} />
        <Bar dataKey="You" fill={C_USER} barSize={10} />
        <Bar dataKey="National average" fill={C_AVG} barSize={10} />
      </BarChart>
    </ResponsiveContainer>
  );

  /* ===== RENDER ===== */
  return (
    <div className={`w-full max-w-screen-xl mx-auto p-4 space-y-6 min-h-screen text-left ${darkMode ? 'bg-gray-900 text-white' : 'bg-gradient-to-b from-green-50 to-emerald-100'}`}>
      {/* Theme toggle */}
      <div className="absolute md:fixed top-6 left-6 z-50">
        <button onClick={toggleDarkMode} aria-label="Toggle dark mode"
          className={`p-3 rounded-full shadow-lg transition-colors duration-300 ${darkMode ? 'bg-gray-700 text-yellow-300' : 'bg-white text-gray-800'}`}>
          {darkMode ? '☀️' : '🌙'}
        </button>
      </div>

      {/* Serving sizes drawer toggle */}
      <div className="absolute md:fixed top-6 right-6 z-50">
        <button onClick={() => setShowServingPanel((s) => !s)}
          className={`px-4 py-2 rounded-lg shadow ${darkMode ? 'bg-gray-700 text-emerald-300' : 'bg-white text-emerald-700'}`}>
          {showServingPanel ? 'Hide serving sizes' : 'Show serving sizes'}
        </button>
      </div>

      {/* Serving sizes panel */}
      <div aria-hidden={!showServingPanel}
        className={`fixed top-0 right-0 h-full w-80 transform transition-transform duration-300 z-40 ${showServingPanel ? 'translate-x-0' : 'translate-x-full'} ${darkMode ? 'bg-gray-800 text-white border-gray-700' : 'bg-white text-gray-800 border-emerald-100'} shadow-2xl border-l`}>
        <div className="p-4 pt-20 border-b" style={{ borderColor: darkMode ? '#374151' : '#e5f3eb' }}>
          <h3 className={`text-lg font-semibold ${darkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>Serving sizes</h3>
          <p className={subCls}>One serving, as eaten. Grains, rice and beans are weighed dry/uncooked.</p>
        </div>
        <div className="p-3 overflow-y-auto h-[calc(100%-140px)]">
          <table className="w-full text-sm">
            <thead><tr><th className="text-left py-1">Food</th><th className="text-right py-1">g</th><th className="text-left py-1 pl-2">≈</th></tr></thead>
            <tbody>
              {data.categories.map((c) => (
                <tr key={c.key} className={`${darkMode ? 'border-gray-700' : 'border-emerald-50'} border-t align-top`}>
                  <td className="py-1 pr-2">{c.icon} {c.label}</td>
                  <td className="py-1 text-right">{Math.round(c.serving_kg * 1000)}</td>
                  <td className="py-1 pl-2">{c.measure}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Hero */}
      <div className="nprint-hero flex flex-col items-center justify-center text-center gap-4 mt-4 mb-2">
        <img src={logo} alt="My-N-Print logo" className="h-42 md:h-60 w-auto select-none pointer-events-none drop-shadow" draggable="false" />
        <h1 className="nprint-hero__title">Personal Nitrogen Footprint Calculator</h1>
      </div>

      {/* Intro */}
      <div className={`rounded-2xl p-6 md:p-8 ${darkMode ? 'bg-gray-800/60 border border-gray-700' : 'bg-white/80 border border-emerald-100'}`}>
        <h2 className={`text-2xl md:text-3xl font-bold mb-4 ${darkMode ? 'text-emerald-300' : 'text-emerald-800'}`}>What is a nitrogen footprint?</h2>
        <div className={`space-y-3 text-lg leading-relaxed ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          <p>
            Nitrogen is essential for life — it's in every protein you eat and every crop that grows.
            But when we produce food, burn fuel, or treat wastewater, some of that nitrogen escapes
            into the environment as <em>reactive nitrogen</em>: compounds like nitrous oxide, ammonia,
            and nitrate that contribute to smog, water pollution, biodiversity loss, and climate change.
          </p>
          <p>
            Your <strong>nitrogen footprint</strong> is the total amount of reactive nitrogen released
            into the environment each year as a result of your consumption. It's measured in
            <strong> kilograms of N per year</strong> (kg N/yr) and has two main components:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-700/50' : 'bg-emerald-50'}`}>
              <span className="text-2xl">🌾</span>
              <h3 className={`font-semibold mt-1 ${darkMode ? 'text-emerald-200' : 'text-emerald-700'}`}>Food</h3>
              <p className={`text-base mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Losses from growing and processing what you eat — fertilizer, manure and feed — plus the nitrogen your body excretes that is not removed by wastewater treatment.
              </p>
            </div>
            <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-700/50' : 'bg-emerald-50'}`}>
              <span className="text-2xl">⚡</span>
              <h3 className={`font-semibold mt-1 ${darkMode ? 'text-emerald-200' : 'text-emerald-700'}`}>Energy</h3>
              <p className={`text-base mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Electricity, heating and cooking fuels, driving, flying and the goods you buy — burning fuels releases nitrogen oxides.
              </p>
            </div>
          </div>
          <p className={`text-base mt-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            Choose your country: every field is then filled in with your country's average, so you start from the national footprint.
            Change the values that differ for you, and see where your footprint is above or below average and what you can do about it.
          </p>
        </div>
      </div>

      {/* Input form */}
      <Card dark={darkMode} className="p-6">
        <div className="flex flex-col md:flex-row justify-between items-start mb-6">
          <h1 className={`text-4xl md:text-5xl font-extrabold ${darkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>My-N-Print</h1>
          <p className={`mt-2 md:mt-0 md:text-right max-w-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
            Calculate your annual nitrogen footprint from food and energy. Based on the original <a className="underline" href="https://n-print.org/">N-Print calculator</a>.
          </p>
        </div>

        {/* Country */}
        <div className="max-w-md mb-4">
          <label htmlFor="country-select" className={`block text-lg font-medium mb-2 ${darkMode ? 'text-emerald-200' : 'text-emerald-700'}`}>Select your country:</label>
          <select id="country-select" value={iso} onChange={(e) => onCountry(e.target.value)} className={selectCls}>
            <option value="" disabled>Choose your country</option>
            {COUNTRY_LIST.map((c) => <option key={c.iso} value={c.iso}>{c.name}</option>)}
          </select>
        </div>

        {country && (
          <>
            <div className={`p-3 rounded-lg mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-2 ${darkMode ? 'bg-emerald-900/40 text-emerald-100' : 'bg-emerald-50 text-emerald-900'}`}>
              <span>
                {touched
                  ? 'You have changed some values. '
                  : `All fields show the average for ${country.name}. `}
                National average: <strong>{kg(country.published.total, 1)} kg N/yr</strong> (food {kg(country.published.food, 1)}, energy {kg(country.published.energy, 1)}).
              </span>
              <button onClick={() => loadDefaults(iso)}
                className={`px-3 py-1 rounded-md text-sm font-semibold shrink-0 ${darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-white hover:bg-emerald-100'} border border-emerald-300`}>
                Reset to national average
              </button>
            </div>

            {/* Food inputs */}
            <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-2 gap-2">
              <h3 className={`text-xl font-semibold ${darkMode ? 'text-emerald-200' : 'text-emerald-700'}`}>Food: servings per week</h3>
              <button onClick={clearFood} className={`text-sm underline ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Clear all food fields</button>
            </div>
            <div className="mb-4 space-y-1">
              <Note dark={darkMode}>Enter the servings you <strong>eat</strong>. Food wasted at home is added automatically (adjust below). Serving sizes are shown under each food; grains, rice and beans are dry weight.</Note>
              <Note dark={darkMode}>Not included: {data.excluded.join(', ')} (together about {Math.round(data.excluded_share * 100)}% of the nitrogen in the world food supply).</Note>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {data.categories.map((c) => {
                const flagged = IMPUTED_FLAGS.has(country.food[c.key].flag);
                const imported = country.food[c.key].flag === 'imports';
                const ps = perServing(c);
                return (
                  <div key={c.key} className={`${tileCls} flex items-center gap-3`}>
                    <span className="text-2xl">{c.icon}</span>
                    <label htmlFor={`food-${c.key}`} className="flex-grow">
                      <span className={`text-lg ${labelCls}`}>{c.label}{flagged && <span title="Estimated from countries in the same income group (see data notes)" className="ml-1 text-amber-500">*</span>}{imported && <span title="Not produced in your country: based on imports only (see data notes)" className="ml-1 text-sky-500">†</span>}</span>
                      <span className={`block ${subCls}`}>1 serving = {Math.round(c.serving_kg * 1000)} g · {c.measure}</span>
                      {ps !== null && <span className={`block ${subCls}`}>≈ {ps.toFixed(ps < 1 ? 2 : 1)} g N lost per serving</span>}
                    </label>
                    <input id={`food-${c.key}`} type="number" min="0" step="0.5" inputMode="decimal"
                      value={food[c.key]?.raw ?? ''} onChange={(e) => setFoodVal(c.key, e.target.value)} className={inputCls} />
                  </div>
                );
              })}
            </div>

            {/* Food waste */}
            <div className={`${tileCls} mb-4 max-w-xl`}>
              <label htmlFor="waste" className={`block text-lg mb-1 ${labelCls}`}>🗑️ How much food does your household throw away?</label>
              <select id="waste" value={opts.waste} onChange={(e) => setOpt('waste', e.target.value)} className={selectCls}>
                <option value="low">Less than average (half)</option>
                <option value="average">About average</option>
                <option value="high">More than average (one and a half times)</option>
              </select>
              <span className={`block mt-1 ${subCls}`}>Average household waste ranges from 5% (beans) to 25% (fruit and vegetables) of food bought.</span>
            </div>

            {/* Calorie counter */}
            <div className={`p-4 rounded-lg shadow mb-6 ${darkMode ? 'bg-gray-700 text-gray-200' : 'bg-green-50 text-gray-800'}`}>
              <h3 className={`text-xl font-semibold mb-2 ${darkMode ? 'text-emerald-200' : 'text-emerald-700'}`}>Estimated daily energy intake</h3>
              <p className="text-3xl font-bold">{Math.round(liveCalories)} <span className="text-lg font-normal">kcal/day</span></p>
              <div className="relative" style={{ marginTop: '0.5rem' }}>
                <div className={`w-full rounded-full h-2.5 ${darkMode ? 'bg-gray-600' : 'bg-gray-200'}`}>
                  <div className="h-2.5 rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(100, (liveCalories / 3000) * 100)}%`,
                      background: liveCalories > 2500 ? 'linear-gradient(90deg, #f59e0b, #ef4444)'
                        : liveCalories > 2000 ? 'linear-gradient(90deg, #10b981, #f59e0b)' : 'linear-gradient(90deg, #10b981, #34d399)',
                    }} />
                </div>
                {[2000, 2500].map((m) => (
                  <div key={m} style={{ position: 'absolute', left: `${(m / 3000) * 100}%`, top: 0, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', transform: 'translateX(-50%)' }}>
                    <div style={{ width: 2, height: 10, background: darkMode ? '#9ca3af' : '#6b7280', borderRadius: 1 }} />
                    <span style={{ fontSize: 11, color: darkMode ? '#9ca3af' : '#6b7280', marginTop: 2, whiteSpace: 'nowrap' }}>{m.toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <p className={`mt-6 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                Recommended: <strong>2,000 kcal/day</strong> (women) · <strong>2,500 kcal/day</strong> (men).
                {liveCalories > 0 && ` Includes about ${data.oils_fats_kcal} kcal/day from oils and fats, which are not entered separately.`}
                {' '}Use this to check that your servings are realistic.
              </p>
            </div>

            {/* Energy inputs */}
            <h3 className={`text-xl font-semibold mt-8 mb-2 ${darkMode ? 'text-emerald-200' : 'text-emerald-700'}`}>Energy and travel</h3>
            <div className="mb-4">
              <Note dark={darkMode}>Defaults are national averages per person (household size 1). Electricity and car travel defaults are national totals divided by population, so they include industry and road freight — enter your own household use if you know it.</Note>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className={`${tileCls} flex items-center gap-3`}>
                <span className="text-2xl">🏠</span>
                <label htmlFor="household" className={`flex-grow text-lg ${labelCls}`}>People in your household</label>
                <input id="household" type="number" min="1" step="1" value={en.household?.raw ?? ''} onChange={(e) => setEnVal('household', e.target.value)} className={inputCls} />
              </div>

              <div className={`${tileCls}`}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">⚡</span>
                  <label htmlFor="kwh" className={`flex-grow text-lg ${labelCls}`}>Electricity (kWh/month, whole household)</label>
                  <input id="kwh" type="number" min="0" value={en.kwh_month?.raw ?? ''} onChange={(e) => setEnVal('kwh_month', e.target.value)} className={inputCls} />
                </div>
                <label className={`flex items-center gap-2 mt-2 ${subCls}`}>
                  <input type="checkbox" checked={!!opts.renewable} onChange={(e) => setOpt('renewable', e.target.checked)} />
                  My electricity is 100% renewable (green tariff or own solar)
                </label>
              </div>

              <div className={`${tileCls}`}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🔥</span>
                  <label htmlFor="gas" className={`flex-grow text-lg ${labelCls}`}>Natural gas (m³/month, whole household)</label>
                  <input id="gas" type="number" min="0" value={en.gas_m3_month?.raw ?? ''} onChange={(e) => setEnVal('gas_m3_month', e.target.value)} className={inputCls} />
                </div>
                <span className={`block mt-1 ${subCls}`}>1 m³ ≈ 35.3 ft³ ≈ 10 kWh of gas</span>
              </div>

              <div className={`${tileCls}`}>
                <label htmlFor="other-fuels" className={`block text-lg mb-1 ${labelCls}`}>🪵 Other household fuels (wood, charcoal, coal, kerosene, LPG)</label>
                <select id="other-fuels" value={opts.other_fuels} onChange={(e) => setOpt('other_fuels', e.target.value)} className={selectCls}>
                  <option value="national">I use them about as much as the national average ({kg(country.energy_pc.household_other)} kg N/yr)</option>
                  <option value="none">I don't use any</option>
                </select>
              </div>

              <div className={`${tileCls} flex items-center gap-3`}>
                <span className="text-2xl">✈️</span>
                <label htmlFor="flight" className={`flex-grow text-lg ${labelCls}`}>Flying hours per year</label>
                <input id="flight" type="number" min="0" value={en.flight_hours?.raw ?? ''} onChange={(e) => setEnVal('flight_hours', e.target.value)} className={inputCls} />
              </div>

              <div className={`${tileCls}`}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🚗</span>
                  <label htmlFor="car" className={`flex-grow text-lg ${labelCls}`}>Car travel (km/week)</label>
                  <input id="car" type="number" min="0" value={en.car_km_week?.raw ?? ''} onChange={(e) => setEnVal('car_km_week', e.target.value)} className={inputCls} />
                </div>
                <div className="flex gap-4 mt-2 text-sm">
                  {[['combustion', 'Petrol / diesel'], ['electric', 'Electric']].map(([v, l]) => (
                    <label key={v} className="flex items-center gap-1">
                      <input type="radio" name="car-type" value={v} checked={opts.car_type === v} onChange={() => setOpt('car_type', v)} /> {l}
                    </label>
                  ))}
                </div>
              </div>

              <div className={`${tileCls} flex items-center gap-3`}>
                <span className="text-2xl">🚌</span>
                <label htmlFor="transit" className={`flex-grow text-lg ${labelCls}`}>Public transit (km/week)</label>
                <input id="transit" type="number" min="0" value={en.transit_km_week?.raw ?? ''} onChange={(e) => setEnVal('transit_km_week', e.target.value)} className={inputCls} />
              </div>

              <div className={`${tileCls}`}>
                <label htmlFor="spending" className={`block text-lg mb-1 ${labelCls}`}>🛍️ Spending on goods and services, compared with others in your country</label>
                <select id="spending" value={opts.spending} onChange={(e) => setOpt('spending', e.target.value)} className={selectCls}>
                  <option value="Minimal">Below average</option>
                  <option value="Moderate">About average</option>
                  <option value="High">Above average</option>
                </select>
              </div>
            </div>
          </>
        )}

        {/* Calculate */}
        <div className="p-0.5 rounded-lg mt-6" style={{ background: getInputBorderGradient() }}>
          <button onClick={calculate} disabled={!country}
            className={`w-full py-4 px-8 rounded-lg transition-colors font-bold text-2xl ${darkMode
              ? 'bg-gray-800 text-white hover:bg-emerald-600 disabled:bg-gray-900 disabled:text-gray-600 disabled:cursor-not-allowed'
              : 'bg-white text-emerald-700 hover:bg-emerald-600 hover:text-white disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed'}`}>
            {calculated ? 'Recalculate N-Print' : 'Calculate N-Print'}
          </button>
        </div>
        {calculated && <p className={`mt-2 text-center ${subCls}`}>Results below update automatically as you change your answers.</p>}
      </Card>

      {/* Results */}
      {results && (
        <div id="results-section" className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card dark={darkMode} className="text-center">
              <div className={`text-sm uppercase tracking-wider mb-1 ${darkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>Your footprint</div>
              <div className="text-5xl font-bold" style={{ color: C_USER }}>{kg(results.user.total, 1)}<span className="text-2xl ml-1">kg N/yr</span></div>
              <div className={`text-sm mt-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Food {kg(results.user.food.total, 1)} · Energy {kg(results.user.energy.total, 1)}</div>
            </Card>
            <Card dark={darkMode} className="text-center">
              <div className={`text-sm uppercase tracking-wider mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Average in {country.name}</div>
              <div className="text-4xl font-bold" style={{ color: C_AVG }}>{kg(results.avg.total, 1)}<span className="text-xl ml-1">kg N/yr</span></div>
              <div className={`text-sm mt-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Food {kg(results.avg.food.total, 1)} · Energy {kg(results.avg.energy.total, 1)}</div>
              {(() => {
                const pct = Math.round((results.user.total / results.avg.total - 1) * 100);
                return (
                  <div className={`text-sm mt-1 font-semibold ${pct > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                    {pct === 0 ? 'You are at the national average' : `You are ${Math.abs(pct)}% ${pct > 0 ? 'above' : 'below'} average`}
                  </div>
                );
              })()}
            </Card>
            <Card dark={darkMode} className="text-center">
              <div className={`text-sm uppercase tracking-wider mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Food footprint of the EAT-Lancet diet</div>
              <div className="text-4xl font-bold" style={{ color: C_EAT }}>{kg(results.eat.total, 1)}<span className="text-xl ml-1">kg N/yr</span></div>
              <div className={`text-sm mt-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Your food: {kg(results.user.food.total, 1)} kg N/yr. The EAT-Lancet planetary health diet<sup>1</sup>, produced and treated as in {country.name}.
              </div>
            </Card>
          </div>

          {/* Recommendations */}
          <Card dark={darkMode}>
            <H2 dark={darkMode}>What you can do</H2>
            {results.gaps.length ? (
              <>
                <p className={`mb-3 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Where your footprint is furthest above the national average:</p>
                <ul className="space-y-3 mb-4">
                  {results.gaps.map((g) => (
                    <li key={g.key} className={`${tileCls}`}>
                      <div className={`font-semibold ${labelCls}`}>
                        {g.kind === 'food' ? data.categories.find((c) => c.key === g.key).icon : ENERGY_ICONS[g.key]} {g.label}: {kg(g.user)} vs {kg(g.avg)} kg N/yr (+{kg(g.diff)})
                      </div>
                      <div className={`text-sm mt-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{TIPS[g.key] || TIPS.default_food}</div>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className={`mb-3 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>None of your components is clearly above the national average.</p>
            )}
            <h3 className={`font-semibold mb-1 ${darkMode ? 'text-emerald-200' : 'text-emerald-700'}`}>General options for reducing nitrogen losses<sup>2,3</sup></h3>
            <ul className={`list-disc pl-6 text-sm space-y-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              <li>The biggest levers are diet and food waste: eat less animal protein, especially beef, mutton and goat, and more legumes, grains and vegetables; eat roughly the amount of food you need, and waste less of it.</li>
              <li>Where food comes from matters more than how far it travelled: transport and processing fuel are a small part of the food footprint, while fertilizer, manure and feed are most of it.</li>
              <li>Organic and conventional products have broadly similar nitrogen losses per kg of food; eating less of the high-loss foods matters more than the label.</li>
              <li>For energy, renewable electricity and electric cars reduce emissions the most; walking, cycling and public transit help too.</li>
              <li>Fly less, and buy fewer new goods.</li>
            </ul>
          </Card>

          {/* Component comparison */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card dark={darkMode}>
              <H2 dark={darkMode}>Food, by food group</H2>
              <Note dark={darkMode}>Production losses, wastewater and food-chain energy per food group (kg N/yr).</Note>
              {compareChart(foodCompare, 560)}
            </Card>
            <Card dark={darkMode}>
              <H2 dark={darkMode}>Energy, by component</H2>
              <Note dark={darkMode}>kg N/yr. “Other household fuels” and “goods & services” are national per capita values, scaled by your answers.</Note>
              {compareChart(energyCompare, 320)}
              <div className={`mt-4 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                <table className="w-full">
                  <thead><tr className="text-left"><th>Component</th><th className="text-right">You</th><th className="text-right">Average</th></tr></thead>
                  <tbody>
                    {ENERGY_KEYS.map((k) => (
                      <tr key={k} className={`border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                        <td>{ENERGY_ICONS[k]} {ENERGY_LABELS[k]}</td>
                        <td className="text-right">{kg(results.user.energy.parts[k])}</td>
                        <td className="text-right">{kg(results.avg.energy.parts[k])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* Pathways */}
          <Card dark={darkMode}>
            <div className="flex items-center justify-between">
              <H2 dark={darkMode}>Where does the nitrogen go?</H2>
              <button onClick={() => setShowPathways((s) => !s)} className={`text-sm underline ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                {showPathways ? 'Hide' : 'Show'} results by loss pathway
              </button>
            </div>
            <Note dark={darkMode}>
              Food production losses split into leaching and runoff to water, volatilization to air (ammonia and nitrogen oxides) and nitrous oxide (a greenhouse gas);
              energy emissions split into nitrogen oxides, ammonia and nitrous oxide.
            </Note>
            {showPathways && compareChart(pathwayRows, 420)}
          </Card>

          {/* EAT-Lancet table */}
          <Card dark={darkMode}>
            <H2 dark={darkMode}>Your diet compared with the EAT-Lancet diet</H2>
            <div className="overflow-x-auto">
              <table className={`w-full text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                <thead>
                  <tr className="text-left">
                    <th className="py-1">Food group</th>
                    <th className="text-right">Your servings/week</th>
                    <th className="text-right">EAT-Lancet servings/week</th>
                    <th className="text-right">Your kg N/yr</th>
                    <th className="text-right">EAT-Lancet kg N/yr</th>
                  </tr>
                </thead>
                <tbody>
                  {data.categories.map((c, i) => (
                    <tr key={c.key} className={`border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                      <td className="py-1">{c.icon} {c.label}</td>
                      <td className="text-right">{fmtInput(servings[c.key])}</td>
                      <td className="text-right">{fmtInput(results.eat.servings[c.key])}</td>
                      <td className="text-right">{kg(results.user.food.rows[i].total)}</td>
                      <td className="text-right">{kg(results.eat.rows[i].total)}</td>
                    </tr>
                  ))}
                  <tr className={`border-t font-semibold ${darkMode ? 'border-gray-600' : 'border-gray-300'}`}>
                    <td className="py-1">Total food</td><td /><td />
                    <td className="text-right">{kg(results.user.food.total)}</td>
                    <td className="text-right">{kg(results.eat.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          {/* Data notes */}
          <Card dark={darkMode}>
            <H2 dark={darkMode}>Data notes for {country.name}</H2>
            <ul className={`list-disc pl-6 text-sm space-y-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              <li>Losses per kg of nitrogen eaten (virtual nitrogen factors) are specific to {country.name}, each food group and each loss pathway, and include imports at the loss rates of the exporting countries.</li>
              {flaggedFood.length > 0 && (
                <li><span className="text-amber-500">*</span> Estimated from countries in the same income group (no national value): {flaggedFood.map((c) => c.label).join(', ')}.
                  {flaggedFood.some((c) => c.key === 'fish and seafood') && ' FAO emission data do not cover fisheries and aquaculture.'}</li>
              )}
              {importsOnly.length > 0 && (
                <li><span className="text-sky-500">†</span> Not produced in {country.name}; based only on the loss factors of the countries it is imported from: {importsOnly.map((c) => c.label).join(', ')}.</li>
              )}
              {country.ef_imputed.length > 0 && (
                <li>Emission factors for {country.ef_imputed.map((k) => EF_LABELS[k]).join(', ')} use the median of countries in the same income group (national energy data incomplete).</li>
              )}
              <li>Wastewater: {Math.round((country.removal ?? 0) * 100)}% of excreted nitrogen is removed by treatment on average in your region (sewer connection × removal efficiency).</li>
              <li>Food-chain energy (fuel used on farms and in food processing) is part of your food footprint.</li>
            </ul>
          </Card>

          <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-600'} space-y-1`}>
            <p><sup>1</sup> Willett, W. et al. Food in the Anthropocene: the EAT–Lancet Commission on healthy diets from sustainable food systems. Lancet 393, 447–492 (2019).</p>
            <p><sup>2</sup> Leach, A. M. et al. A nitrogen footprint model to help consumers understand their role in nitrogen losses to the environment. Environ. Dev. 1, 40–66 (2012).</p>
            <p><sup>3</sup> Sutton, M. A. et al. Our Nutrient World. Centre for Ecology and Hydrology (2013).</p>
          </div>
        </div>
      )}

      {/* FAQ */}
      <div className={`rounded-2xl p-6 md:p-8 mt-8 ${darkMode ? 'bg-gray-800/60 border border-gray-700' : 'bg-white/80 border border-emerald-100'}`}>
        <h2 className={`text-2xl md:text-3xl font-bold mb-6 ${darkMode ? 'text-emerald-300' : 'text-emerald-800'}`}>Frequently Asked Questions</h2>
        <div className="space-y-6">
          {[
            ['What is a nitrogen footprint?',
              'Your nitrogen footprint is the total amount of reactive nitrogen released into the environment each year as a result of your consumption. It is measured in kilograms of nitrogen per year (kg N/yr) and has two main components: food (losses from producing and processing what you eat, plus the nitrogen in sewage that is not removed by treatment) and energy (electricity, household fuels, driving, flying and the goods and services you buy).'],
            ['What is a good nitrogen footprint?',
              'It depends on where you live. National averages range from about 7 to more than 70 kg N per person per year; the world average is about 21 kg N. Where livestock is kept with low productivity, food footprints can be very high even when people eat little meat. Use the calculator to compare your result with your country\'s average and with the EAT-Lancet diet.'],
            ['How does food compare to energy?',
              'For most people food is the larger part, about 80% of the world average footprint. Meat and dairy are especially nitrogen-intensive because of fertilizer for feed crops and manure. Energy makes up the rest, mainly nitrogen oxides from burning fuels.'],
            ['How can I reduce my nitrogen footprint?',
              'The most effective steps are eating less meat and dairy (especially beef, mutton and goat), wasting less food, choosing renewable electricity, driving and flying less, and buying fewer new goods. The results section shows which parts of your footprint are furthest above your country\'s average.'],
            ['How is my footprint calculated?',
              'Food: the nitrogen in the food you eat is multiplied by country-, food group- and pathway-specific loss factors derived from FAO emission statistics (fertilizer, crop residues, manure, feed and imports), plus sewage nitrogen not removed by treatment and fuel used in the food chain. Energy: your electricity, gas, travel and spending are multiplied by country-specific emission factors from the EDGAR v8.0 inventory (2022). With the default answers the calculator reproduces the national average published in the accompanying paper.'],
          ].map(([q, a]) => (
            <div key={q}>
              <h3 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-emerald-200' : 'text-emerald-700'}`}>{q}</h3>
              <p className={`leading-relaxed ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{a}</p>
            </div>
          ))}
        </div>
      </div>

      <div className={`text-center mt-6 text-sm ${darkMode ? 'text-gray-500' : 'text-emerald-600'}`}>
        v{VERSION} · Data: FAOSTAT, EDGAR v8.0 (2022), UN energy statistics, van Puijenbroek et al. (2019)
      </div>
    </div>
  );
};

export default NFootprintCalculator;
