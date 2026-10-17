import { indexedDB as fakeIndexedDB } from 'fake-indexeddb';
import { deserialize, serialize } from 'v8';

test('retain every pending snapshot across reload, then remove only acknowledged records', async () => {
  Object.defineProperty(window, 'indexedDB', { configurable: true, value: fakeIndexedDB });
  Object.defineProperty(window, 'structuredClone', { configurable: true, value: (value) => deserialize(serialize(value)) });
  jest.resetModules();
  let queue = require('./queue');
  const first = { id: 'first', inputs: { beef: 1.23456789 } };
  const second = { id: 'second', inputs: { beef: 2 } };
  expect(await queue.enqueue(first)).toBe(true);
  expect(await queue.enqueue(second)).toBe(true);
  jest.resetModules(); // Clears the JS in-memory fallback, as a page reload does.
  queue = require('./queue');
  expect(await queue.pendingRecords()).toEqual([first, second]);
  await queue.acknowledge('first');
  expect(await queue.pendingRecords()).toEqual([second]);
  await queue.enqueue(second); // An identical retry must not create a duplicate.
  expect(await queue.pendingRecords()).toEqual([second]);
  await queue.acknowledge('second');
});

test('report unavailable persistence and still retain records in memory', async () => {
  Object.defineProperty(window, 'indexedDB', { configurable: true, value: undefined });
  jest.resetModules();
  const queue = require('./queue');
  const record = { id: 'fallback', totalFootprint: 1.23456789 };
  expect(await queue.enqueue(record)).toBe(false);
  expect(await queue.pendingRecords()).toEqual([record]);
  await queue.acknowledge('fallback');
  expect(await queue.pendingRecords()).toEqual([]);
});
