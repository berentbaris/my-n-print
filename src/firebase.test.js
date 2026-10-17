import { setDoc } from 'firebase/firestore';
import { acknowledge, enqueue, newId, pendingRecords } from './results/queue';

jest.mock('firebase/app', () => ({ getApps: () => [{}], initializeApp: jest.fn() }));
jest.mock('firebase/firestore', () => ({ getFirestore: () => ({}), doc: (_, collection, id) => `${collection}/${id}`, setDoc: jest.fn() }));
jest.mock('./results/queue', () => ({
  acknowledge: jest.fn(), enqueue: jest.fn(), pendingRecords: jest.fn(),
  newId: jest.fn(),
  visitorIdentity: () => ({ visitorId: 'visitor', sessionId: 'session' }),
}));

const settle = async () => { for (let i = 0; i < 15; i += 1) await Promise.resolve(); };

test('retain failed records, retry with identical IDs, and store later results separately', async () => {
  process.env.REACT_APP_FIREBASE_API_KEY = 'test-key';
  const { logCalculation, retryPendingCalculations, subscribeToStorage } = require('./firebase');
  const records = new Map();
  let count = 0;
  newId.mockImplementation(() => `record-${++count}`);
  pendingRecords.mockImplementation(async () => [...records.values()]);
  enqueue.mockImplementation(async (record) => { records.set(record.id, record); return true; });
  acknowledge.mockImplementation(async (id) => records.delete(id));
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const statuses = [];
  const unsubscribe = subscribeToStorage((status) => statuses.push(status));
  setDoc.mockRejectedValueOnce({ code: 'permission-denied' });
  await logCalculation({ totalFootprint: 12.3456789, inputs: { servings: { beef: 2 } } });
  await settle();
  expect(records.size).toBe(1);
  expect(acknowledge).not.toHaveBeenCalled();
  expect(statuses.at(-1).state).toBe('error');
  const original = setDoc.mock.calls[0];
  setDoc.mockResolvedValue(undefined);
  await retryPendingCalculations();
  await settle();
  expect(setDoc.mock.calls[1]).toEqual(original);
  expect(records.size).toBe(0);
  await logCalculation({ totalFootprint: 11.1234567, inputs: { servings: { beef: 1 } } }, 'input-change');
  await settle();
  expect(setDoc.mock.calls[2][0]).not.toBe(original[0]);
  expect(setDoc.mock.calls[2][1].eventType).toBe('input-change');
  expect(setDoc.mock.calls[2][1].visitorId).toBe('visitor');
  expect(setDoc.mock.calls[2][1].totalFootprint).toBe(11.1234567);
  expect(statuses.at(-1)).toEqual({ state: 'saved', pending: 0 });
  unsubscribe();
  warn.mockRestore();
});
