## Problem

Splitting a bill loses or invents cents. A $100.00 dinner between 3 friends charges each of them $33.33, which is $99.99 in total: one cent has vanished.

```
Dinner at Luigi's · $100.00 · 3 people

Person 1                $33.33
Person 2                $33.33
Person 3                $33.33
──────────────────────────────
Collected               $99.99   ← $0.01 is missing
```

$10.00 between 6 people goes the other way: 6 × $1.67 = $10.02, so the group overpays.

`splitBill` rounds every share on its own, so the shares never add up to the total.

## Reproduce

```js
import { splitBill } from './src/splitBill.js';

splitBill(10000, 3); // [3333, 3333, 3333]: 9999 cents, one cent missing
```

Or run `npm run example` and open http://localhost:8080.

## Expected

The shares always add up to the exact total. When the total does not divide evenly, the extra cents go to the first people in the list, one cent each.

```
Person 1                $33.34
Person 2                $33.33
Person 3                $33.33
──────────────────────────────
Collected              $100.00   ✓
```

## Acceptance criteria

- `splitBill(10000, 3)` returns `[3334, 3333, 3333]`
- For any total and number of people, the shares add up to the total exactly
- No two shares differ by more than one cent
- A number of people that is not a positive integer (`0`, `-1`, `2.5`) throws a `RangeError`
- Tests cover the cases above
