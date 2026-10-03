import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitBill } from '../src/splitBill.js';

const sum = (shares) => shares.reduce((total, share) => total + share, 0);

test('splits evenly when the total divides exactly', () => {
  assert.deepEqual(splitBill(9000, 3), [3000, 3000, 3000]);
});

test('one person pays the whole bill', () => {
  assert.deepEqual(splitBill(4250, 1), [4250]);
});

test('two people split an even total', () => {
  assert.deepEqual(splitBill(1000, 2), [500, 500]);
});

test('gives the extra cents to the first people in the list', () => {
  assert.deepEqual(splitBill(10000, 3), [3334, 3333, 3333]);
  assert.deepEqual(splitBill(1000, 6), [167, 167, 167, 167, 166, 166]);
});

test('shares always add up to the total', () => {
  for (let total = 0; total <= 500; total++) {
    for (let people = 1; people <= 12; people++) {
      assert.equal(sum(splitBill(total, people)), total, `${total} cents between ${people}`);
    }
  }
});

test('no two shares differ by more than one cent', () => {
  for (let total = 0; total <= 500; total++) {
    for (let people = 1; people <= 12; people++) {
      const shares = splitBill(total, people);
      assert.ok(Math.max(...shares) - Math.min(...shares) <= 1, `${total} cents between ${people}`);
    }
  }
});

test('rejects a number of people that is not a positive integer', () => {
  for (const people of [0, -1, 2.5, Number.NaN]) {
    assert.throws(() => splitBill(1000, people), RangeError, `people = ${people}`);
  }
});
