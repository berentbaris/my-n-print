import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import NFootprintCalculator from './NFootprintCalculator';
import { logCalculation } from '../firebase';
import { downloadResultsPdf } from '../results/pdf';

jest.mock('../firebase', () => ({
  logCalculation: jest.fn(), retryPendingCalculations: jest.fn(),
  startCalculationStorage: () => () => {},
  subscribeToStorage: (listener) => { listener({ state: 'saved', pending: 0 }); return () => {}; },
}));
jest.mock('../results/pdf', () => ({ downloadResultsPdf: jest.fn() }));
jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  BarChart: ({ data }) => <div>{data.map((row) => <div key={row.name}>{row.name}</div>)}</div>,
  Bar: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null,
  Legend: () => null, CartesianGrid: () => null,
}));

test('save every calculation and live edit, export the current snapshot, and do not log display toggles', async () => {
  logCalculation.mockResolvedValue('record');
  Element.prototype.scrollIntoView = jest.fn();
  render(<React.StrictMode><NFootprintCalculator /></React.StrictMode>);
  fireEvent.change(screen.getByLabelText('Select your country:'), { target: { value: 'DEU' } });
  expect(logCalculation).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Calculate N-Print' }));
  expect(logCalculation).toHaveBeenCalledTimes(1);
  expect(logCalculation.mock.calls[0][1]).toBe('calculate');
  expect(logCalculation.mock.calls[0][0].results.user.food.rows).toHaveLength(15);
  const original = logCalculation.mock.calls[0][0];
  fireEvent.change(screen.getByLabelText('Car travel (km/week)'), { target: { value: '500' } });
  expect(logCalculation).toHaveBeenCalledTimes(2);
  expect(logCalculation.mock.calls[1][1]).toBe('input-change');
  expect(logCalculation.mock.calls[1][0].inputs.car_km_week).toBe(500);
  expect(logCalculation.mock.calls[1][0].rawInputs.energy.car_km_week.raw).toBe('500');
  expect(logCalculation.mock.calls[1][0].energyFootprint).not.toBe(original.energyFootprint);
  fireEvent.click(screen.getByRole('button', { name: 'Recalculate N-Print' }));
  expect(logCalculation).toHaveBeenCalledTimes(3);
  expect(logCalculation.mock.calls[2][1]).toBe('calculate');
  fireEvent.click(screen.getByRole('button', { name: 'Toggle dark mode' }));
  fireEvent.click(screen.getByRole('button', { name: 'Show results by loss pathway' }));
  expect(logCalculation).toHaveBeenCalledTimes(3);
  expect(screen.getByText('Volatilization, NH₃ (food production)')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Export results as PDF' }));
  await waitFor(() => expect(downloadResultsPdf).toHaveBeenCalledTimes(1));
  expect(downloadResultsPdf.mock.calls[0][0]).toEqual(logCalculation.mock.calls[2][0]);
});

test('opting out of research storage stops saving and is remembered', () => {
  logCalculation.mockClear();
  window.localStorage.removeItem('my-nprint-share-results');
  Element.prototype.scrollIntoView = jest.fn();
  const { unmount } = render(<NFootprintCalculator />);
  expect(screen.getByRole('heading', { name: 'Privacy notice' })).toBeTruthy();
  fireEvent.click(screen.getByLabelText('Save my anonymous answers and results for research'));
  fireEvent.change(screen.getByLabelText('Select your country:'), { target: { value: 'DEU' } });
  fireEvent.click(screen.getByRole('button', { name: 'Calculate N-Print' }));
  expect(logCalculation).not.toHaveBeenCalled();
  expect(screen.getByText('Your results are not being saved (you opted out).')).toBeTruthy();
  unmount();
  render(<NFootprintCalculator />);
  expect(screen.getByLabelText('Save my anonymous answers and results for research').checked).toBe(false);
  window.localStorage.removeItem('my-nprint-share-results');
});

test('advice suggests protein swaps for animal foods and never cutting plant foods', () => {
  logCalculation.mockClear();
  logCalculation.mockResolvedValue('record');
  window.localStorage.removeItem('my-nprint-share-results');
  Element.prototype.scrollIntoView = jest.fn();
  render(<NFootprintCalculator />);
  fireEvent.change(screen.getByLabelText('Select your country:'), { target: { value: 'DEU' } });
  fireEvent.change(document.getElementById('food-beans and other legumes'), { target: { value: '20' } });
  fireEvent.change(document.getElementById('food-vegetables'), { target: { value: '30' } });
  fireEvent.change(document.getElementById('food-beef'), { target: { value: '7' } });
  fireEvent.click(screen.getByRole('button', { name: 'Calculate N-Print' }));
  expect(screen.getByText('🌱 Keep it up')).toBeTruthy();
  expect(screen.getByText(/You eat more beans & legumes and vegetables than the average/)).toBeTruthy();
  expect(screen.getByText(/Swapping one serving a week for about \d+ g of dried beans/)).toBeTruthy();
  expect(screen.queryByText(/^🫘 Beans & legumes:/)).toBeNull();
  const recs = logCalculation.mock.calls[logCalculation.mock.calls.length - 1][0].recommendations;
  expect(recs.map((r) => r.key)).toContain('beef');
  expect(recs.map((r) => r.key)).not.toContain('beans and other legumes');
  expect(recs.map((r) => r.key)).not.toContain('vegetables');
});
