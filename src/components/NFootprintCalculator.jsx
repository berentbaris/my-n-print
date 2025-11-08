import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import logo from '../nprint_lite_new_logo.png';
//require('dotenv').config();

/* ===== CONFIG ===== */
const VERSION = '4.2.1';
const REACT_APP_GOOGLE_API_KEY = process.env.REACT_APP_GOOGLE_API_KEY;
const SPREADSHEET_IDS = { MAIN: '1duGMqR2pnJtMIUwQzKaEaFGrDqGaeJCEJLAhLvKvXIo' };
const SHEETS = {
  VNF: 'final_VNFs',
  ATTR: 'other_attributes',
  SEWAGE: 'sewage_ratings',
  FOOD_COUNTRY: 'food_country_data',
  ENERGY: 'country_energy_consumption_data_final',
  INCOME: 'GDP',                 // columns: iso_a3, Income
  SERVING_SIZES: 'serving_sizes' // columns: name, Serving size
};

/* ===== HELPERS ===== */
async function fetchSheetData(spreadsheetId, sheetName, apiKey) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}?key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed ${sheetName}: ${res.status}`);
  const data = await res.json();
  return data.values || [];
}

function parseSheetData(values, headers) {
  const [, ...rows] = values || [];
  if (!rows?.length) return [];
  return rows.map((row) => {
    const o = {};
    headers.forEach((h, i) => { o[h] = row[i]; });
    return o;
  });
}

// numeric parser that tolerates "0,2" and NBSPs
const parseNum = (v) => {
  if (v === null || v === undefined) return 0;
  const s = String(v).replace(/\u00A0/g, '').trim().replace(/,/g, '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

/* ===== HEADERS ===== */
const vnfHeaders = [
  'Category',
  'High-income countries',
  'Upper-middle-income countries',
  'Lower-middle-income countries',
  'Low-income countries',
];

const attrHeaders = [
  'name',
  'Food waste %',
  'Fossil fuel (kg N/year)',
  'N content (kg N/kg food)',
  'Serving size',
];

const sewageHeaders = ['Income', 'N_removal_rating'];
const foodCountryHeaders = ['iso_a3', 'Area', 'Category', 'kg/cap/year'];
const incomeHeaders = ['Country','iso_a3', 'Income'];
const energyHeaders = [
  'Country','code','pop','Data source (NG)','Final consumption (NG)','Road (NG)','Other transport (NG)',
  'Commerce and public services (NG)','Households (NG)','Other consumers (NG)','Rest (NG)',
  'Data source (Elec)','Final consumption (Elec)','Road (Elec)','Other transport (Elec)',
  'Commerce and public services (Elec)','Households (Elec)','Other consumers (Elec)','Rest (Elec)',
  'Flights per capita','flight time (hours)','renewables'
];
const servingSizeHeaders = ['name','Serving size'];

/* ===== UI ===== */
const foodCategories = [
  { name: 'poultry', icon: '🍗' },
  { name: 'pork', icon: '🥩' },
  { name: 'beef', icon: '🥩' },
  { name: 'fish and seafood', icon: '🐟' },
  { name: 'milk', icon: '🥛' },
  { name: 'cheese', icon: '🧀' },
  { name: 'eggs', icon: '🥚' },
  { name: 'grains and cereals', icon: '🌾' },
  { name: 'rice', icon: '🍚' },
  { name: 'vegetables', icon: '🥬' },
  { name: 'beans and other legumes', icon: '🌱' },
  { name: 'starchy roots', icon: '🥔' },
  { name: 'fruit', icon: '🍎' },
  { name: 'mutton and goat meat', icon: '🐑' },
  { name: 'offals', icon: '🍖' },
];

const energyCategories = [
  { name: 'Household Electricity', icon: '⚡' },
  { name: 'Household Natural Gas', icon: '🔥' },
  { name: 'Number of people in your household', icon: '🏠' },
  { name: 'Flying hours per year', icon: '✈️' },
  { name: 'Public Transit (km/week)', icon: '🚌' },
  { name: 'Car Travel (km/week)', icon: '🚗' },
];

const meatSet  = new Set(['poultry','pork','beef','mutton and goat meat','offals']);
const dairySet = new Set(['milk','cheese','eggs']);

const treatmentRemoval = {
  No: 0.0,
  'Yes, primary treatment system': 0.05,
  'Yes, secondary treatment system': 0.2,
  'Yes, tertiary treatment system': 0.9,
};

/* ===== COMPONENT ===== */
const NFoodprintCalculator = () => {
  const [countries, setCountries] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState('');
  const [foodInputs, setFoodInputs] = useState({});
  const [sewerLevel, setSewerLevel] = useState('Select a country');

  const [electricityInput, setElectricityInput] = useState('');
  const [naturalGasInput, setNaturalGasInput] = useState('');
  const [householdSizeInput, setHouseholdSizeInput] = useState('');
  const [flyingHoursInput, setFlyingHoursInput] = useState('');
  const [publicTransitDistanceInput, setPublicTransitDistanceInput] = useState('');
  const [carTravelDistanceInput, setCarTravelDistanceInput] = useState('');
  const [personalSpendingInput, setPersonalSpendingInput] = useState('');

  const [results, setResults] = useState(null);
  const [hasAutoScrolledOnce, setHasAutoScrolledOnce] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [sheetData, setSheetData] = useState({
    vnf: [], attr: [], sewage: [], foodCountry: [], energy: [], income: [], servingSizes: []
  });

  const [showServingPanel, setShowServingPanel] = useState(false);

  /* ===== LOAD DATA ===== */
  useEffect(() => {
    const refreshData = async () => {
      setIsLoading(true);
      try {
        const [
          vnfRaw, sewageRaw, foodRaw, energyRaw, incomeRaw, attrRaw, servingRaw
        ] = await Promise.all([
          fetchSheetData(SPREADSHEET_IDS.MAIN, SHEETS.VNF, REACT_APP_GOOGLE_API_KEY),
          fetchSheetData(SPREADSHEET_IDS.MAIN, SHEETS.SEWAGE, REACT_APP_GOOGLE_API_KEY),
          fetchSheetData(SPREADSHEET_IDS.MAIN, SHEETS.FOOD_COUNTRY, REACT_APP_GOOGLE_API_KEY),
          fetchSheetData(SPREADSHEET_IDS.MAIN, SHEETS.ENERGY, REACT_APP_GOOGLE_API_KEY),
          fetchSheetData(SPREADSHEET_IDS.MAIN, SHEETS.INCOME, REACT_APP_GOOGLE_API_KEY),
          fetchSheetData(SPREADSHEET_IDS.MAIN, SHEETS.ATTR, REACT_APP_GOOGLE_API_KEY),
          fetchSheetData(SPREADSHEET_IDS.MAIN, SHEETS.SERVING_SIZES, REACT_APP_GOOGLE_API_KEY),
        ]);

        const parsed = {
          vnf: parseSheetData(vnfRaw, vnfHeaders),
          sewage: parseSheetData(sewageRaw, sewageHeaders),
          foodCountry: parseSheetData(foodRaw, foodCountryHeaders),
          energy: parseSheetData(energyRaw, energyHeaders),
          income: parseSheetData(incomeRaw, incomeHeaders),
          attr: parseSheetData(attrRaw, attrHeaders),
          servingSizes: parseSheetData(servingRaw, servingSizeHeaders),
        };
        setSheetData(parsed);

        const foodCountries   = new Set(parsed.foodCountry.map(d => d.Area).filter(Boolean));
        const energyCountries = new Set(parsed.energy.map(d => d.Country).filter(Boolean));
        const all = [...new Set([...foodCountries, ...energyCountries])].filter(
          (c) => !['China, Macao SAR','Micronesia (Federated States of)','Tuvalu'].includes(c)
        );
        setCountries(all.sort());

        window._NPRINT_SD = parsed;
      } catch (e) {
        console.error('Data load error:', e);
      } finally {
        setIsLoading(false);
      }
    };

    refreshData();
    const id = setInterval(refreshData, 5 * 60 * 1000);
    const onVis = () => { if (document.visibilityState === 'visible') refreshData(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  // Auto scroll to results after the first successful calculation only
  useEffect(() => {
    if (results && !hasAutoScrolledOnce) {
      const el = document.getElementById('results-section');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setHasAutoScrolledOnce(true);
      }
    }
  }, [results, hasAutoScrolledOnce]);

  useEffect(() => {
  if (!selectedCountry || !sheetData.income.length) return;
  
  const { isoByCountry, incomeByIso } = buildLookups(sheetData);
  const countryISO = String(isoByCountry[selectedCountry] || '').trim().toUpperCase();
  const income = incomeByIso[countryISO];
  
  // Set default sewage level based on income
  if (income === 'High-income countries') {
    setSewerLevel('On average, your country has a secondary/tertiary treatment system.');
  } else if (income === 'Upper-middle-income countries') {
    setSewerLevel('On average, your country has a secondary/tertiary treatment system.');
  } else if (income === 'Lower-middle-income countries') {
    setSewerLevel('On average, your country has no sewage treatment system.');
  } else {
    setSewerLevel('On average, your country has no sewage treatment system.');
  }
}, [selectedCountry, sheetData]);

  const handleFoodInput = (category, value) => {
    setFoodInputs((prev) => ({ ...prev, [category]: Math.max(0, parseInt(value || 0, 10)) }));
  };
  const handleWheel = (e, category) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1 : -1;
    const current = foodInputs[category] || 0;
    handleFoodInput(category, current + delta);
  };
  const getInputBorderGradient = () =>
    darkMode
      ? 'linear-gradient(to right, #1a1a2e, #16213e, #0f3460, #541690)'
      : 'linear-gradient(to right, #800000, #a52a2a, #ff4500, #ff8c00)';
  const toggleDarkMode = () => {
    setDarkMode((d) => {
      const next = !d;
      document.body.style.backgroundColor = next ? '#0a0a3a' : '#f0fdf4';
      return next;
    });
  };

  function buildLookups(sd) {
    const incomeLabel = (s) => ({
      'High income': 'High-income countries',
      'Upper middle income': 'Upper-middle-income countries',
      'Lower middle income': 'Lower-middle-income countries',
      'Low income': 'Low-income countries',
    }[String(s || '').trim()] || String(s || '').trim());

    const isoByCountry = {};
    sd.foodCountry.forEach((r) => {
      const country = String(r.Area || '').trim();
      const iso = String(r.iso_a3 || '').trim().toUpperCase();
      if (country && iso) isoByCountry[country] = iso;
    });
    sd.energy.forEach((r) => {
      const country = String(r.Country || '').trim();
      const iso = String(r.code || '').trim().toUpperCase();
      if (country && iso && !isoByCountry[country]) isoByCountry[country] = iso;
    });

    const incomeByIso = {};
    sd.income.forEach((r) => {
      const iso = String(r.iso_a3 || '').trim().toUpperCase();
      if (iso) incomeByIso[iso] = incomeLabel(r.Income);
    });

    const vnfByCatByIncome = {};
    sd.vnf.forEach((r) => {
      const cat = String(r['Category'] || '').trim().toLowerCase();
      if (!cat) return;
      vnfByCatByIncome[cat] = {
        'High-income countries':         parseNum(r['High-income countries']),
        'Upper-middle-income countries': parseNum(r['Upper-middle-income countries']),
        'Lower-middle-income countries': parseNum(r['Lower-middle-income countries']),
        'Low-income countries':          parseNum(r['Low-income countries']),
      };
    });

    const attrByCat = {};
    (sd.attr || []).forEach((r) => {
      const cat = String(r['name'] || '').trim().toLowerCase();
      if (!cat) return;
      let fw = parseNum(r['Food waste %']);
      if (fw > 1) fw = fw / 100;
      attrByCat[cat] = {
        foodWaste:  fw,
        fossilFuel: parseNum(r['Fossil fuel (kg N/year)']),
        nContent:   parseNum(r['N content (kg N/kg food)']),
        servingSize:parseNum(r['Serving size']),
      };
    });

    return { isoByCountry, incomeByIso, vnfByCatByIncome, attrByCat };
  }

  if (!window._NPRINT_buildLookups) window._NPRINT_buildLookups = buildLookups;

  /* ===== CALC ===== */
  const calculateFootprint = () => {
    if (isLoading || !selectedCountry) {
      alert('Please ensure data is loaded and a country is selected');
      return;
    }

    setIsCalculating(true);
    try {
      const sd = sheetData;
      const { isoByCountry, incomeByIso, vnfByCatByIncome, attrByCat } = buildLookups(sd);

      const countryISO = String(isoByCountry[selectedCountry] || '').trim().toUpperCase();
      const income = incomeByIso[countryISO];

      const allowed = new Set(foodCategories.map(f => f.name));
      const countryFood = {};
      sd.foodCountry
        .filter((r) => r.Area === selectedCountry)
        .forEach((r) => {
          const k = String(r.Category || '').trim().toLowerCase();
          if (allowed.has(k)) countryFood[k] = parseNum(r['kg/cap/year']);
        });

      const avgRemRow = sd.sewage.find((s) => s.Income === income);
      const avgRemovalRate = avgRemRow ? parseNum(avgRemRow.N_removal_rating) : 0;

      let total_loss_cons_user = 0, total_loss_prod_user = 0, total_loss_fuel_user = 0;
      let userMeatN = 0, userDairyN = 0, userPlantN = 0;

      foodCategories.forEach(({ name: cat }) => {
        const k = cat;
        const timesPerWeek = Number(foodInputs[k] || 0);
        if (!timesPerWeek) return;

        const vnf = income && vnfByCatByIncome[k] ? vnfByCatByIncome[k][income] || 0 : 0;
        const { fossilFuel = 0, nContent = 0, servingSize = 0 } = attrByCat[k] || {};

        const consNFactor = servingSize * 52 * nContent;
        const loss_cons  = timesPerWeek * consNFactor;
        const loss_prod  = loss_cons * vnf;
        const loss_fuel  = timesPerWeek * fossilFuel;

        total_loss_cons_user += loss_cons;
        total_loss_prod_user += loss_prod;
        total_loss_fuel_user += loss_fuel;

        const preTreat = loss_cons + loss_prod + loss_fuel;
        if (meatSet.has(k)) userMeatN += preTreat;
        else if (dairySet.has(k)) userDairyN += preTreat;
        else userPlantN += preTreat;
      });

      const removalRate = treatmentRemoval[sewerLevel] ?? 0.0;
      const adjusted_loss_cons_user = total_loss_cons_user * (1 - avgRemovalRate);
      const totalUserFood = Math.round((adjusted_loss_cons_user + total_loss_prod_user + total_loss_fuel_user) * 100) / 100;

      let total_loss_cons_avg = 0, total_loss_prod_avg = 0, total_loss_fuel_avg = 0;
      let avgMeatN = 0, avgDairyN = 0, avgPlantN = 0;

      foodCategories.forEach(({ name: cat }) => {
        const k = cat;
        const kgCapYear = countryFood[k] || 0;
        if (!kgCapYear) return;

        const vnf = income && vnfByCatByIncome[k] ? vnfByCatByIncome[k][income] || 0 : 0;
        const { foodWaste = 0, fossilFuel = 0, nContent = 0, servingSize = 0 } = attrByCat[k] || {};

        const consCap   = kgCapYear * (1 - foodWaste);
        const weeklyAvg = servingSize > 0 && consCap > 0 ? consCap / servingSize / 52 : 0;

        const consNFactor = servingSize * 52 * nContent;
        const loss_cons = weeklyAvg * consNFactor;
        const loss_prod = loss_cons * vnf;
        const loss_fuel = weeklyAvg * fossilFuel;

        total_loss_cons_avg += loss_cons;
        total_loss_prod_avg += loss_prod;
        total_loss_fuel_avg += loss_fuel;

        const preTreat = loss_cons + loss_prod + loss_fuel;
        if (meatSet.has(k)) avgMeatN += preTreat;
        else if (dairySet.has(k)) avgDairyN += preTreat;
        else avgPlantN += preTreat;
      });

      const adjusted_loss_cons_avg = total_loss_cons_avg * (1 - avgRemovalRate);
      const totalAvgFood = Math.round((adjusted_loss_cons_avg + total_loss_prod_avg + total_loss_fuel_avg) * 100) / 100;

      const countryEnergyData = sd.energy.find((e) => e.Country === selectedCountry);
      const TJ_to_m3 = 28428, TJ_to_kwh = 277778;
      const e_factor_gas = 0.000690972;
      const e_factor_car = 0.00012297;
      const e_factor_flight = 0.128411244;
      const e_factor_public_transport = 0.000575729;

      let e_factor_elec = 0.000906564;
      if (countryEnergyData && countryEnergyData.renewables) {
        const ef = parseNum(countryEnergyData.renewables);
        if (isFinite(ef) && ef > 0) e_factor_elec = ef;
      }

      const hh = Math.max(1, parseNum(householdSizeInput) || 1);
      const userEnergyBreakdown = {
        elec: (parseNum(electricityInput) || 0) * 12 * e_factor_elec / hh,
        ng: (parseNum(naturalGasInput) || 0) * 12 * e_factor_gas / hh,
        flight: (parseNum(flyingHoursInput) || 0) * e_factor_flight,
        car: (parseNum(carTravelDistanceInput) || 0) * 52 * e_factor_car,
        publicTransit: (parseNum(publicTransitDistanceInput) || 0) * 52 * e_factor_public_transport,
        spending: personalSpendingInput === 'High' ? 3.82 : personalSpendingInput === 'Moderate' ? 2.54 : personalSpendingInput === 'Minimal' ? 1.27 : 0,
        topDown: 0,
      };

      if (countryEnergyData) {
        const pop = Math.max(1, parseNum(countryEnergyData.pop) || 1);
        const restNG = Math.max(0, parseNum(countryEnergyData['Rest (NG)']) || 0);
        const restEl = Math.max(0, parseNum(countryEnergyData['Rest (Elec)']) || 0);
        userEnergyBreakdown.topDown = (restEl * TJ_to_kwh * e_factor_elec + restNG * TJ_to_m3 * e_factor_gas) / pop;
      }

      const userEnergyLoss = Math.round(
        Object.values(userEnergyBreakdown).reduce((a, b) => a + (isFinite(b) ? b : 0), 0) * 100
      ) / 100;

      const userFoodPre = (userMeatN + userDairyN + userPlantN) || 1;
      const sUser = totalUserFood > 0 ? totalUserFood / userFoodPre : 0;
      const adjMeat = userMeatN * sUser, adjDairy = userDairyN * sUser, adjPlant = userPlantN * sUser;

      const avgFoodPre = (avgMeatN + avgDairyN + avgPlantN) || 1;
      const sAvg = totalAvgFood > 0 ? totalAvgFood / avgFoodPre : 0;
      const adjAvgMeat = avgMeatN * sAvg, adjAvgDairy = avgDairyN * sAvg, adjAvgPlant = avgPlantN * sAvg;

      setResults({
        totalN: totalUserFood + userEnergyLoss,
        averageN: totalAvgFood + (countryEnergyData ? (
          ((parseNum(countryEnergyData['Households (NG)'])   * TJ_to_m3 * e_factor_gas)  +
           (parseNum(countryEnergyData['Households (Elec)'])* TJ_to_kwh * e_factor_elec) +
           (parseNum(countryEnergyData['Road (Elec)'])       * TJ_to_kwh * e_factor_elec) +
           (parseNum(countryEnergyData['Road (NG)'])         * TJ_to_m3 * e_factor_gas)  +
           (parseNum(countryEnergyData['Other transport (Elec)']) * TJ_to_kwh * e_factor_elec) +
           (parseNum(countryEnergyData['Other transport (NG)'])   * TJ_to_m3 * e_factor_gas)  +
           (parseNum(countryEnergyData['Commerce and public services (Elec)']) * TJ_to_kwh * e_factor_elec) +
           (parseNum(countryEnergyData['Commerce and public services (NG)'])   * TJ_to_m3 * e_factor_gas) +
           (parseNum(countryEnergyData['Other consumers (Elec)'])              * TJ_to_kwh * e_factor_elec) +
           (parseNum(countryEnergyData['Other consumers (NG)'])                * TJ_to_m3 * e_factor_gas)
          ) / Math.max(1, parseNum(countryEnergyData.pop) || 1)
        ) : 0),
        foodBreakdown: { meat: adjMeat, dairy: adjDairy, plant: adjPlant },
        averageFoodBreakdown: { meat: adjAvgMeat, dairy: adjAvgDairy, plant: adjAvgPlant },
        energyBreakdown: userEnergyBreakdown,
        averageEnergyBreakdown: { ng:0, elec:0, flight:0, car:0, publicTransit:0, spending:0, topDown:userEnergyBreakdown.topDown },
        details: {
          totalUserFood,
          totalUserEnergy: userEnergyLoss,
          totalAverageFood: totalAvgFood,
          totalAverageEnergy: 0, // summarized above in averageN
        },
      });
    } catch (err) {
      console.error('Calculation error:', err);
      setResults(null);
    } finally {
      setIsCalculating(false);
    }
  };

  /* ===== CHART DATA ===== */
  const getFoodChartData = () => {
    if (!results?.foodBreakdown) return [];
    const totalFood = results.details.totalUserFood || 1;
    return [
      { name: 'Meat Products', value: results.foodBreakdown.meat,  fill: darkMode ? '#34d399' : '#047857', patternId: 'pattern-meat',  details: `${((results.foodBreakdown.meat  / totalFood) * 100).toFixed(2)}% of food total` },
      { name: 'Dairy & Eggs',  value: results.foodBreakdown.dairy, fill: darkMode ? '#86efac' : '#16a34a', patternId: 'pattern-dairy', details: `${((results.foodBreakdown.dairy / totalFood) * 100).toFixed(2)}% of food total` },
      { name: 'Plant-based',   value: results.foodBreakdown.plant, fill: darkMode ? '#a3e635' : '#65a30d', patternId: 'pattern-plant', details: `${((results.foodBreakdown.plant / totalFood) * 100).toFixed(2)}% of food total` },
    ].filter(d => parseNum(d.value) > 0);
  };

  const getEnergyChartData = () => {
    if (!results?.energyBreakdown) return [];
    const t = results.details.totalUserEnergy || 1;
    const b = results.energyBreakdown;
    return [
      { name: 'Household Electricity', value: b.elec,         fill: darkMode ? '#60a5fa' : '#3b82f6', patternId: 'pattern-elec',     details: `${(b.elec / t * 100).toFixed(2)}% of energy total` },
      { name: 'Household Natural Gas', value: b.ng,           fill: darkMode ? '#fbbf24' : '#eab308', patternId: 'pattern-ng',       details: `${(b.ng / t * 100).toFixed(2)}% of energy total` },
      { name: 'Flights',               value: b.flight,       fill: darkMode ? '#f87171' : '#ef4444', patternId: 'pattern-flight',   details: `${(b.flight / t * 100).toFixed(2)}% of energy total` },
      { name: 'Car Travel',            value: b.car,          fill: darkMode ? '#a78bfa' : '#8b5cf6', patternId: 'pattern-car',      details: `${(b.car / t * 100).toFixed(2)}% of energy total` },
      { name: 'Public Transit',        value: b.publicTransit,fill: darkMode ? '#34d399' : '#047857', patternId: 'pattern-transit',  details: `${(b.publicTransit / t * 100).toFixed(2)}% of energy total` },
      { name: 'Spending',              value: b.spending,     fill: darkMode ? '#facc15' : '#e0a800', patternId: 'pattern-spending', details: `${(b.spending / t * 100).toFixed(2)}% of energy total` },
      { name: 'Other (Top-down)',      value: b.topDown,      fill: darkMode ? '#9ca3af' : '#6b7280', patternId: 'pattern-topdown',  details: `${(b.topDown / t * 100).toFixed(2)}% of energy total` },
    ].filter(d => parseNum(d.value) > 0);
  };

  // Axis tick font sizes: +4px bump
  const axisTickFont = { fontSize: 16 };

  // serving sizes panel data
  const servingRows = (() => {
    const rows = sheetData.servingSizes?.length
      ? sheetData.servingSizes
      : (sheetData.attr || []).map(r => ({ name: r.name, 'Serving size': r['Serving size'] }));
    const wanted = new Set(foodCategories.map(f => f.name));
    return rows
      .map(r => ({ name: String(r.name || '').trim().toLowerCase(), size: parseNum(r['Serving size']) }))
      .filter(r => wanted.has(r.name))
      .sort((a,b)=> a.name.localeCompare(b.name));
  })();

  /* ===== RENDER ===== */
  return (
    <div className={`w-full max-w-screen-xl mx-auto p-4 space-y-6 min-h-screen ${darkMode ? 'bg-gray-900 text-white' : 'bg-gradient-to-b from-green-50 to-emerald-100'}`}>
      {/* Theme toggle */}
      <div className="fixed top-6 left-6 z-50">
        <button
          onClick={toggleDarkMode}
          className={`p-3 rounded-full shadow-lg transition-colors duration-300 ${darkMode ? 'bg-gray-700 text-yellow-300' : 'bg-white text-gray-800'}`}
          aria-label="Toggle dark mode"
        >
          {darkMode ? '☀️' : '🌙'}
        </button>
      </div>

      {/* Serving sizes drawer toggle */}
      <div className="fixed top-6 right-6 z-50">
        <button
          onClick={() => setShowServingPanel(s => !s)}
          className={`px-4 py-2 rounded-lg shadow ${darkMode ? 'bg-gray-700 text-emerald-300' : 'bg-white text-emerald-700'}`}
        >
          {showServingPanel ? 'Hide Serving Sizes' : 'Show Serving Sizes'}
        </button>
      </div>

      {/* Right-edge serving sizes panel */}
      <div
        className={`fixed top-0 right-0 h-full w-72 transform transition-transform duration-300 z-40 ${showServingPanel ? 'translate-x-0' : 'translate-x-full'} ${darkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-800'} shadow-2xl border-l ${darkMode ? 'border-gray-700' : 'border-emerald-100'}`}
        aria-hidden={!showServingPanel}
      >
        <div className="p-4 border-b sticky top-0 backdrop-blur-sm" style={{ borderColor: darkMode ? '#374151' : '#e5f3eb' }}>
          <h3 className={`text-lg font-semibold ${darkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>Serving Sizes</h3>
          <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>From “{SHEETS.SERVING_SIZES}” sheet</p>
        </div>
        <div className="p-3 overflow-y-auto h-[calc(100%-64px)]">
          <table className="w-full text-sm">
            <thead>
              <tr className={`${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                <th className="text-left py-1">Category</th>
                <th className="text-right py-1">Serving size (grams)</th>
              </tr>
            </thead>
            <tbody>
              {servingRows.map((r) => (
                <tr key={r.name} className={`${darkMode ? 'border-gray-700' : 'border-emerald-50'} border-t`}>
                  <td className="py-1 pr-2 capitalize">{r.name}</td>
                  <td className="py-1 pl-2 text-right">{r.size * 1000}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Hero — centered with larger logo and title */}
      <div className="nprint-hero flex flex-col items-center justify-center text-center gap-4 mt-4 mb-2">
        <img
          src={logo}
          alt="My-N-Print logo"
          className="h-42 md:h-60 w-auto select-none pointer-events-none drop-shadow"
          draggable="false"
        />
        <h1 className={`text-5xl md:text-6xl font-extrabold leading-tight ${darkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>
          {/* My-N-Print */}
        </h1>
      </div>

      {/* Results */}
      {results && (
        <div id="results-section">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="md:col-span-2 space-y-8">
              {/* Food */}
              <div className={`relative h-96 rounded-lg shadow p-4 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
                <h2 className={`text-2xl font-bold mb-4 ${darkMode ? 'text-emerald-300' : 'text-emerald-800'}`}>Your Food N-Footprint Breakdown</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={getFoodChartData()} margin={{ top: 20, right: 30, left: 20, bottom: 8 }}>
                    <defs>
                      <pattern id="pattern-meat"   patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke={darkMode ? '#10b981' : '#059669'} strokeWidth="2" /></pattern>
                      <pattern id="pattern-dairy"  patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(-45)"><line x1="0" y1="0" x2="0" y2="8" stroke={darkMode ? '#6ee7b7' : '#34d399'} strokeWidth="2" /></pattern>
                      <pattern id="pattern-plant"  patternUnits="userSpaceOnUse" width="8" height="8"><circle cx="4" cy="4" r="2" fill={darkMode ? '#d9f99d' : '#92b600'} /></pattern>
                    </defs>
                    <XAxis
                      dataKey="name"
                      stroke={darkMode ? '#9ca3af' : '#4b5563'}
                      tick={{ ...axisTickFont, fill: darkMode ? '#e5e7eb' : '#374151' }}
                    />
                    <YAxis
                      stroke={darkMode ? '#9ca3af' : '#4b5563'}
                      tick={{ ...axisTickFont, fill: darkMode ? '#e5e7eb' : '#374151' }}
                      domain={[0, 'auto']}
                    />
                    <Tooltip
                      cursor={{ fill: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}
                      contentStyle={{ backgroundColor: darkMode ? '#374151' : '#fff', border: 'none', borderRadius: '8px' }}
                      itemStyle={{ color: darkMode ? '#e5e7eb' : '#374151' }}
                      formatter={(value, name, props) => [`${Number(value).toFixed(2)} kg N/yr`, props.payload.details]}
                    />
                    <Bar dataKey="value" minPointSize={5} barSize={60}>
                      {getFoodChartData().map((entry, i) => (<Cell key={`food-${i}`} fill={`url(#${entry.patternId})`} />))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Energy */}
              <div className={`relative h-96 rounded-lg shadow p-4 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
                <h2 className={`text-2xl font-bold mb-4 ${darkMode ? 'text-emerald-300' : 'text-emerald-800'}`}>Your Energy N-Footprint Breakdown</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={getEnergyChartData()} margin={{ top: 20, right: 30, left: 20, bottom: 8 }}>
                    <defs>
                      <pattern id="pattern-elec"      patternUnits="userSpaceOnUse" width="8" height="8"><line x1="0" y1="4" x2="8" y2="4" stroke={darkMode ? '#3b82f6' : '#2563eb'} strokeWidth="2" /></pattern>
                      <pattern id="pattern-ng"        patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(90)"><line x1="0" y1="4" x2="8" y2="4" stroke={darkMode ? '#d97706' : '#b45309'} strokeWidth="2" /></pattern>
                      <pattern id="pattern-flight"    patternUnits="userSpaceOnUse" width="8" height="8"><rect x="0" y="0" width="4" height="4" fill={darkMode ? '#ef4444' : '#dc2626'} /></pattern>
                      <pattern id="pattern-car"       patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)"><line x1="0" y1="0" x2="8" y2="8" stroke={darkMode ? '#6d28d9' : '#5b21b6'} strokeWidth="2" /></pattern>
                      <pattern id="pattern-transit"   patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(-45)"><line x1="0" y1="0" x2="8" y2="8" stroke={darkMode ? '#059669' : '#047857'} strokeWidth="2" /></pattern>
                      <pattern id="pattern-spending"  patternUnits="userSpaceOnUse" width="8" height="8"><line x1="0" y1="0" x2="8" y2="8" stroke={darkMode ? '#ca8a04' : '#a16207'} strokeWidth="2" /><line x1="8" y1="0" x2="0" y2="8" stroke={darkMode ? '#ca8a04' : '#a16207'} strokeWidth="2" /></pattern>
                      <pattern id="pattern-topdown"   patternUnits="userSpaceOnUse" width="8" height="8"><line x1="0" y1="0" x2="8" y2="0" stroke={darkMode ? '#4b5563' : '#374151'} strokeWidth="2" /></pattern>
                    </defs>
                    <XAxis
                      dataKey="name"
                      stroke={darkMode ? '#9ca3af' : '#4b5563'}
                      tick={{ ...axisTickFont, fill: darkMode ? '#e5e7eb' : '#374151' }}
                    />
                    <YAxis
                      stroke={darkMode ? '#9ca3af' : '#4b5563'}
                      tick={{ ...axisTickFont, fill: darkMode ? '#e5e7eb' : '#374151' }}
                      domain={[0, 'auto']}
                    />
                    <Tooltip
                      cursor={{ fill: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}
                      contentStyle={{ backgroundColor: darkMode ? '#374151' : '#fff', border: 'none', borderRadius: '8px' }}
                      itemStyle={{ color: darkMode ? '#e5e7eb' : '#374151' }}
                      formatter={(value, name, props) => [`${Number(value).toFixed(2)} kg N/yr`, props.payload.details]}
                    />
                    <Bar dataKey="value" minPointSize={5} barSize={60}>
                      {getEnergyChartData().map((entry, i) => (<Cell key={`energy-${i}`} fill={`url(#${entry.patternId})`} />))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Summary */}
            <div className={`rounded-lg shadow p-6 flex flex-col ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
              <h2 className={`text-2xl font-bold mb-4 ${darkMode ? 'text-emerald-300' : 'text-emerald-800'}`}>Combined Footprint Summary</h2>

              <div className={`text-center border-b pb-4 mb-4 ${darkMode ? 'border-gray-700' : 'border-emerald-100'}`}>
                <div className={`text-sm uppercase tracking-wider mb-1 ${darkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>Your Total</div>
                <div className={`text-5xl font-bold ${darkMode ? 'text-emerald-300' : 'text-emerald-600'}`}>
                  {typeof results?.totalN === 'number' ? results.totalN.toFixed(2) : 'N/A'}
                  <span className="text-2xl ml-1">kg N/yr</span>
                </div>
                <div className={`text-sm mt-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  (Food: {results?.details?.totalUserFood?.toFixed(2)} kg, Energy: {results?.details?.totalUserEnergy?.toFixed(2)} kg)
                </div>
              </div>

              {typeof results?.averageN === 'number' && (
                <div className={`text-center border-b pb-4 mb-4 ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                  <div className={`text-sm uppercase tracking-wider mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Average for {selectedCountry || 'Country'}</div>
                  <div className={`text-3xl font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    {results.averageN.toFixed(2)} <span className="text-xl ml-1">kg N/yr</span>
                  </div>
                </div>
              )}

              <h3 className={`text-xl font-semibold mb-2 ${darkMode ? 'text-emerald-200' : 'text-emerald-700'}`}>Food Breakdown</h3>
              <div className="space-y-2 mb-4">
                <div className={`flex justify-between items-baseline ${darkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>
                  <span className="text-md">Meat Products</span>
                  <span className="font-semibold text-md text-right">{typeof results?.foodBreakdown?.meat === 'number' ? results.foodBreakdown.meat.toFixed(2) : '-'} kg</span>
                </div>
                <div className={`flex justify-between items-baseline ${darkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>
                  <span className="text-md">Dairy & Eggs</span>
                  <span className="font-semibold text-md text-right">{typeof results?.foodBreakdown?.dairy === 'number' ? results.foodBreakdown.dairy.toFixed(2) : '-'} kg</span>
                </div>
                <div className={`flex justify-between items-baseline ${darkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>
                  <span className="text-md">Plant-based</span>
                  <span className="font-semibold text-md text-right">{typeof results?.foodBreakdown?.plant === 'number' ? results.foodBreakdown.plant.toFixed(2) : '-'} kg</span>
                </div>
              </div>

              <h3 className={`text-xl font-semibold mb-2 ${darkMode ? 'text-emerald-200' : 'text-emerald-700'}`}>Energy Breakdown</h3>
              <div className="space-y-2 mt-auto">
                {['elec','ng','flight','car','publicTransit','spending','topDown'].map((k, i) => {
                  const labels = ['Household Electricity','Household Natural Gas','Flights','Car Travel','Public Transit','Spending','Other (Top-down)'];
                  return (
                    <div key={k} className={`flex justify-between items-baseline ${darkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>
                      <span className="text-md">{labels[i]}</span>
                      <span className="font-semibold text-md text-right">{typeof results?.energyBreakdown?.[k] === 'number' ? results.energyBreakdown[k].toFixed(2) : '-'} kg</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Input Form */}
      <div className={`rounded-lg shadow p-6 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
        <div className="flex flex-col md:flex-row justify-between items-start mb-6">
          <h1 className={`text-4xl md:text-5xl font-extrabold ${darkMode ? 'text-emerald-400' : 'text-emerald-700'}`}> My-N-Print </h1>
          <p className={`mt-2 md:mt-0 md:text-right max-w-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
            Calculate your annual nitrogen footprint from food & energy consumption. Based on the original <a className="underline" href="https://n-print.org/">N-Print calculator</a>.
          </p>
        </div>

        {/* Country */}
        <div className="max-w-md mb-6">
          <label htmlFor="country-select" className={`block text-lg font-medium mb-2 ${darkMode ? 'text-emerald-200' : 'text-emerald-700'}`}>Select Your Country:</label>
          {isLoading ? (
            <p className={`${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Loading countries...</p>
          ) : (
            <select
              id="country-select"
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              className={`block w-full p-3 border rounded-md shadow-sm focus:outline-none ${darkMode ? 'bg-gray-700 border-gray-600 text-white focus:border-emerald-500 focus:ring-emerald-500' : 'bg-white border-gray-300 text-gray-900 focus:border-emerald-500'}`}
            >
              <option value="" disabled>Choose your country</option>
              {countries.map((c) => (<option key={c} value={c}>{c}</option>))}
            </select>
          )}
        </div>
        
        {/* Food Inputs */}
        <h3 className={`text-xl font-semibold mb-4 ${darkMode ? 'text-emerald-200' : 'text-emerald-700'}`}>Weekly Food Consumption (Servings per week):</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          {foodCategories.map((f) => (
            <div key={f.name} className={`flex items-center space-x-3 p-3 rounded-lg shadow-sm ${darkMode ? 'bg-gray-700' : 'bg-green-50'}`}>
              <span className="text-2xl">{f.icon}</span>
              <label htmlFor={`input-food-${f.name}`} className={`flex-grow text-xl font-medium ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                {f.name.charAt(0).toUpperCase() + f.name.slice(1)}:
              </label>
              <input
                id={`input-food-${f.name}`} type="number" min="0" value={foodInputs[f.name] || ''} onChange={(e) => handleFoodInput(f.name, e.target.value)} onWheel={(e) => handleWheel(e, f.name)}
                className={`w-full max-w-[8rem] p-3 border rounded-md text-right text-xl appearance-none [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:m-0 ${darkMode ? 'bg-gray-600 border-gray-500 text-white focus:border-emerald-500' : 'bg-white border-gray-300 text-gray-900 focus:border-emerald-500'}`}
              />
            </div>
          ))}
        </div>
        

        {/* Energy Inputs */}
        <h3 className={`text-xl font-semibold mt-8 mb-4 ${darkMode ? 'text-emerald-200' : 'text-emerald-700'}`}>Energy Consumption & Travel Habits:</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6 mb-6">
          {energyCategories.map((eCat) => (
            <div key={eCat.name} className={`flex items-center space-x-3 p-3 rounded-lg shadow-sm ${darkMode ? 'bg-gray-700' : 'bg-green-50'}`}>
              <span className="text-2xl">{eCat.icon}</span>
              <label htmlFor={`input-energy-${eCat.name}`} className={`flex-grow text-xl font-medium ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                {eCat.name === 'Household Electricity' ? 'Electricity (kWh/month for household)'
                  : eCat.name === 'Household Natural Gas' ? <>Natural Gas (m³/month for household):<br /><span style={{ fontSize:'0.75em', color: darkMode ? '#9CA3AF' : '#6B7280' }}>(1 m³ ≈ 35.32 ft³ ≈ 35.177 MJ)</span></>
                  : eCat.name === 'Flying hours per year' ? 'Flying hours per year'
                  : eCat.name === 'Number of people in your household' ? 'Number of People in Household'
                  : eCat.name}
                :
              </label>
              <input
                id={`input-energy-${eCat.name}`} type="number" min={eCat.name === 'Number of people in your household' ? '1' : '0'}
                value={
                  eCat.name === 'Household Electricity' ? electricityInput
                  : eCat.name === 'Household Natural Gas' ? naturalGasInput
                  : eCat.name === 'Number of people in your household' ? householdSizeInput
                  : eCat.name === 'Flying hours per year' ? flyingHoursInput
                  : eCat.name === 'Public Transit (km/week)' ? publicTransitDistanceInput
                  : eCat.name === 'Car Travel (km/week)' ? carTravelDistanceInput : ''
                }
                onChange={(e) => {
                  const v = e.target.value;
                  if (eCat.name === 'Household Electricity') setElectricityInput(v);
                  else if (eCat.name === 'Household Natural Gas') setNaturalGasInput(v);
                  else if (eCat.name === 'Number of people in your household') setHouseholdSizeInput(v);
                  else if (eCat.name === 'Flying hours per year') setFlyingHoursInput(v);
                  else if (eCat.name === 'Public Transit (km/week)') setPublicTransitDistanceInput(v);
                  else if (eCat.name === 'Car Travel (km/week)') setCarTravelDistanceInput(v);
                }}
                className={`w-32 p-3 border rounded-md text-right text-xl appearance-none [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:m-0 ${darkMode ? 'bg-gray-600 border-gray-500 text-white focus:border-emerald-500' : 'bg-white border-gray-300 text-gray-900 focus:border-emerald-500'}`}
              />
            </div>
          ))}

          {/* Spending */}
          <div className={`p-3 rounded-lg shadow-sm ${darkMode ? 'bg-gray-700' : 'bg-green-50'} md:col-span-2`}>
            <label htmlFor="personal-spending-input" className={`block text-xl font-medium mb-2 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>Personal Spending on Goods & Services:</label>
            <select
              id="personal-spending-input" value={personalSpendingInput} onChange={(e) => setPersonalSpendingInput(e.target.value)}
              className={`block w-full p-3 border rounded-md shadow-sm focus:outline-none ${darkMode ? 'bg-gray-600 border-gray-500 text-white focus:border-emerald-500' : 'bg-white border-gray-300 text-gray-900 focus:border-emerald-500'}`}
            >
              <option value="" disabled>Select your spending level</option>
              <option value="Minimal">Minimal</option>
              <option value="Moderate">Moderate</option>
              <option value="High">High</option>
            </select>
          </div>
        </div>

        {/* Sewer */}
        <div className={`p-6 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-green-50'}`}>
          <label className={`block text-lg font-medium mb-4 ${darkMode ? 'text-emerald-200' : 'text-emerald-700'}`}>Your household sewage treatment level:</label>
          <p className={`text-xl font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-800'}`}>
            {sewerLevel || 'Select a country first'}
          </p>
        </div>

        {/* Calculate — bigger font, hover green, smooth scroll on first success handled by useEffect */}
        <div className="p-0.5 rounded-lg mt-6" style={{ background: getInputBorderGradient() }}>
          <button
            onClick={calculateFootprint}
            disabled={isCalculating || !selectedCountry || isLoading}
            className={`w-full py-4 px-8 rounded-lg transition-colors font-bold text-2xl
              ${darkMode
                ? 'bg-gray-800 text-white hover:bg-emerald-600 disabled:bg-gray-900 disabled:text-gray-600 disabled:cursor-not-allowed'
                : 'bg-white text-emerald-700 hover:bg-emerald-600 hover:text-white disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed'
              }`}
          >
            {isCalculating ? 'Calculating...' : 'Calculate N-Print'}
          </button>
        </div>
      </div>

      <div className={`text-center mt-6 text-sm ${darkMode ? 'text-gray-500' : 'text-emerald-500'}`}>
        v{VERSION} • {new Date().toLocaleDateString()}
      </div>
    </div>
  );
};

export default NFoodprintCalculator;