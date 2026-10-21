import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { ENERGY_KEYS, ENERGY_LABELS } from '../calc/calc';

// Built-in PDF fonts do not contain chemical subscripts or emoji.
const plain = (value) => String(value)
  .replace(/₀/g, '0').replace(/₁/g, '1').replace(/₂/g, '2').replace(/₃/g, '3')
  .replace(/ₓ/g, 'x').replace(/[–—−]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
  .replace(/×/g, 'x').replace(/≈/g, '~').replace(/→/g, 'to');
const number = (value, digits = 3) => Number(value).toFixed(digits);

/** Render from the same snapshot that is logged, never from clipped chart DOM. */
export function createResultsPdf(snapshot, exportedAt = new Date()) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const { inputs, results, referenceData: ref } = snapshot;
  const green = [6, 95, 70];
  let y;

  function page(title, first = false) {
    if (!first) pdf.addPage();
    pdf.setFillColor(...green);
    pdf.rect(0, 0, 210, 26, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.text('My-N-Print', 15, 12);
    pdf.setFontSize(10);
    pdf.text(plain(`${snapshot.country} | Personal nitrogen footprint`), 15, 20);
    pdf.setTextColor(25, 42, 35);
    pdf.setFontSize(16);
    pdf.text(title, 15, 38);
    y = 46;
  }

  function paragraph(text, size = 9) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(plain(text), 180);
    const height = lines.length * size * 0.42 + 3;
    if (y + height > 276) page('Results continued');
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(size);
    pdf.text(lines, 15, y);
    y += height;
  }

  function heading(text) {
    if (y > 260) page('Results continued');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text(plain(text), 15, y);
    y += 5;
  }

  function table(head, body, options = {}) {
    autoTable(pdf, {
      startY: y,
      head: [head.map(plain)],
      body: body.map((row) => row.map(plain)),
      theme: 'striped',
      margin: { left: 15, right: 15, top: 34, bottom: 20 },
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.7, textColor: [25, 42, 35], overflow: 'linebreak' },
      headStyles: { fillColor: green, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [240, 248, 243] },
      columnStyles: Object.fromEntries(head.map((_, i) => [i, { halign: i ? 'right' : 'left' }])),
      ...options,
    });
    y = pdf.lastAutoTable.finalY + 8;
  }

  page('Your results', true);
  paragraph(`Exported ${exportedAt.toLocaleString('en-GB')} | App v${snapshot.appVersion} | Data ${snapshot.dataVersion}`, 8);
  paragraph(Object.values(snapshot.dataYear).join(' | '), 8);
  paragraph('All footprint values are kilograms of nitrogen per person per year (kg N/yr). Values below are rounded to three decimal places; the stored results retain full precision.');
  table(['Footprint (kg N/yr)', 'You', 'National average'], [
    ['Food', number(results.user.food.total), number(results.avg.food.total)],
    ['Energy', number(results.user.energy.total), number(results.avg.energy.total)],
    ['Total', number(results.user.total), number(results.avg.total)],
  ]);
  paragraph(`Your total is ${number(Math.abs((results.user.total / results.avg.total - 1) * 100), 1)}% ${results.user.total >= results.avg.total ? 'above' : 'below'} the national average. EAT-Lancet food footprint: ${number(results.eat.total)} kg N/yr. Estimated energy intake: ${number(snapshot.dailyCalories, 0)} kcal/day (including 130 kcal/day from oils and fats when food is entered).`);
  heading('Your energy and lifestyle answers');
  table(['Answer', 'Value'], [
    ['Household size', number(inputs.household, 2)],
    ['Electricity (kWh/month, whole household)', number(inputs.kwh_month, 2)],
    ['Natural gas (m3/month, whole household)', number(inputs.gas_m3_month, 2)],
    ['Car travel (km/week)', number(inputs.car_km_week, 2)],
    ['Public transit (km/week)', number(inputs.transit_km_week, 2)],
    ['Flights (hours/year)', number(inputs.flight_hours, 2)],
    ['Renewable electricity', inputs.renewable ? 'Yes' : 'No'],
    ['Car type', inputs.car_type === 'electric' ? 'Electric' : 'Petrol / diesel'],
    ['Other household fuels', inputs.other_fuels === 'none' ? 'None' : 'National average'],
    ['Spending on goods and services', { Minimal: 'Below average', Moderate: 'About average', High: 'Above average' }[inputs.spending]],
    ['Household food waste', inputs.waste],
    ['Answers unchanged from national defaults', snapshot.usedDefaults ? 'Yes' : 'No'],
  ]);
  heading('What you can do');
  if (!snapshot.recommendations.length) paragraph('None of your components is clearly above the national average.');
  snapshot.recommendations.forEach((item) => paragraph(`${item.label}: ${number(item.user)} vs ${number(item.avg)} kg N/yr (+${number(item.diff)}). ${item.tip}`, 8));
  paragraph('General options: reduce animal protein and food waste; choose more legumes, grains and vegetables; use renewable electricity; walk, cycle or use public transit; fly less and buy fewer new goods.', 8);

  page('Your diet and comparisons');
  paragraph('Servings are food actually eaten per week. Grain, rice and bean serving weights are dry/uncooked. National average and EAT-Lancet use the same country reference data. EAT-Lancet refers to the food footprint only.');
  table(['Food group', 'Serving (g)', 'Your servings/week', 'EAT servings/week', 'You kg N/yr', 'Average kg N/yr', 'EAT kg N/yr'], ref.categories.map((cat, i) => [
    cat.label, number(cat.serving_kg * 1000, 0), number(inputs.servings[cat.key]), number(results.eat.servings[cat.key]),
    number(results.user.food.rows[i].total), number(results.avg.food.rows[i].total), number(results.eat.rows[i].total),
  ]).concat([['Total food', '', '', '', number(results.user.food.total), number(results.avg.food.total), number(results.eat.total)]]));
  heading('Serving measures');
  paragraph(ref.categories.map((cat) => `${cat.label}: ${number(cat.serving_kg * 1000, 0)} g - ${cat.measure}`).join('\n'), 8);

  page('Food losses and nitrogen pathways');
  paragraph('Food losses include production, wastewater after treatment, and fuel used on farms and in food processing. N eaten is the nitrogen consumed, rather than an additional loss. All values in this table are kg N/yr.');
  table(['Food group', 'N eaten', 'Production', 'Wastewater', 'Food-chain energy', 'Total'], results.user.food.rows.map((row) => [
    row.label, number(row.consN), number(row.production), number(row.consumption), number(row.foodEnergy), number(row.total),
  ]).concat([['Total', number(results.user.food.consN), number(results.user.food.production), number(results.user.food.consumption), number(results.user.food.foodEnergy), number(results.user.food.total)]]));
  heading('Where does the nitrogen go?');
  table(['Pathway', 'You kg N/yr', 'Average kg N/yr'], snapshot.pathways.map((row) => [row.name, number(row.You), number(row['National average'])]));
  paragraph('Food volatilization is ammonia (NH3). Energy pollutants include nitrogen oxides (NOx), ammonia (NH3) and nitrous oxide (N2O). Fish and seafood losses may have no pathway split.', 8);

  page('Energy breakdown and data notes');
  table(['Energy component', 'You kg N/yr', 'Average kg N/yr'], ENERGY_KEYS.map((key) => [ENERGY_LABELS[key], number(results.user.energy.parts[key]), number(results.avg.energy.parts[key])])
    .concat([['Total energy', number(results.user.energy.total), number(results.avg.energy.total)]]));
  heading('Energy emissions by pollutant');
  table(['Pollutant', 'You kg N/yr', 'Average kg N/yr'], ['NOx', 'NH3', 'N2O'].map((key) => [key, number(results.user.energy.pollutants[key]), number(results.avg.energy.pollutants[key])]));
  heading(`Data notes for ${snapshot.country}`);
  paragraph('Virtual nitrogen factors are specific to each food group and pathway and include imports at the loss rates of exporting countries. Other household fuels and goods & services use national per capita values scaled by your answers.');
  paragraph(`Wastewater treatment removes ${number(ref.country.removal * 100, 1)}% of excreted nitrogen (sewer connection x removal efficiency). Food-chain energy is part of the food footprint.`);
  const imputed = ['income-group (N-Print)', 'income-group median', 'income-group median (app)'];
  const flagged = ref.categories.filter((cat) => imputed.includes(ref.country.food[cat.key].flag));
  const imports = ref.categories.filter((cat) => ref.country.food[cat.key].flag === 'imports');
  if (flagged.length) paragraph(`Food factors estimated from the same income group: ${flagged.map((cat) => cat.label).join(', ')}. FAO emission data do not cover fisheries and aquaculture.`);
  if (imports.length) paragraph(`Food groups based on imports only: ${imports.map((cat) => cat.label).join(', ')}.`);
  if (ref.country.ef_imputed.length) paragraph(`Energy factors estimated from the income-group median: ${ref.country.ef_imputed.join(', ')}.`);
  paragraph(`Food groups excluded by the model: ${Array.isArray(ref.excluded) ? ref.excluded.join(', ') : JSON.stringify(ref.excluded)}.`);
  heading('Method and references');
  paragraph('Food: servings/week x serving weight x 52 x nitrogen content, multiplied by country loss factors, adjusted for food waste, wastewater removal and food-chain energy. Energy: household electricity/gas and personal travel multiplied by national emission factors.');
  paragraph('Sources: FAOSTAT; EDGAR v8.1 and 2025 GHG release (2022); UN energy statistics; van Puijenbroek et al. (2019). My-N-Print: Baris et al., accompanying manuscript.', 8);
  paragraph('Willett et al. (2019), Food in the Anthropocene, Lancet 393, 447-492. Leach et al. (2012), A nitrogen footprint model, Environmental Development 1, 40-66. Sutton et al. (2013), Our Nutrient World.', 8);
  paragraph('https://my-nprint.web.app/', 8);

  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    pdf.setPage(i);
    pdf.setDrawColor(200, 220, 210);
    pdf.line(15, 281, 195, 281);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(90, 110, 100);
    pdf.text(plain(`My-N-Print | ${snapshot.country} | kg N/person/year`), 15, 287);
    pdf.text(`${i} / ${pages}`, 195, 287, { align: 'right' });
  }
  pdf.setProperties({ title: `My-N-Print results - ${plain(snapshot.country)}`, subject: 'Personal nitrogen footprint', author: 'My-N-Print' });
  return pdf;
}

export function downloadResultsPdf(snapshot) {
  const pdf = createResultsPdf(snapshot);
  const country = snapshot.country.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  pdf.save(`My-N-Print-${country}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
