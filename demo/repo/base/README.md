# fair-split

Split a bill between friends. Amounts are integer cents, so no floating point money is involved.

```js
import { splitBill } from 'fair-split';

splitBill(9000, 3); // [3000, 3000, 3000]
```

## Try it

```bash
npm test             # run the tests
npm run example      # a receipt in the browser at http://localhost:8080
```

No dependencies. Node 20 or newer.
