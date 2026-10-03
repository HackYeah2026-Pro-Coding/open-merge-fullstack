import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitBill } from '../src/splitBill.js';

test('splits evenly when the total divides exactly', () => {
  assert.deepEqual(splitBill(9000, 3), [3000, 3000, 3000]);
});

test('one person pays the whole bill', () => {
  assert.deepEqual(splitBill(4250, 1), [4250]);
});

test('two people split an even total', () => {
  assert.deepEqual(splitBill(1000, 2), [500, 500]);
});
