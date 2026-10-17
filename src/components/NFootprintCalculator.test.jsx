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
