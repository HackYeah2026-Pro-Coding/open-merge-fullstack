import { REWARD_DECIMALS as APP_DECIMALS } from '../../src/bounty/bounty-view';
import { DEFAULT_REWARD_SYMBOL } from '../../src/issue/issue.service';
import { REWARD_DECIMALS, REWARD_SYMBOL, formatTokens, toBaseUnits } from './reward';

describe('reward', () => {
  it('mirrors the constants the app uses, so demo bounties and the app agree on the token', () => {
    expect(REWARD_DECIMALS).toBe(APP_DECIMALS);
    expect(REWARD_SYMBOL).toBe(DEFAULT_REWARD_SYMBOL);
  });

  it('converts whole tokens to base units', () => {
    expect(toBaseUnits(50)).toBe(50_000_000n);
  });

  it.each([
    [50_000_000n, '50 OMT'],
    [1_500_000n, '1.5 OMT'],
    [1n, '0.000001 OMT'],
    [0n, '0 OMT'],
  ])('formats %s base units as %s', (units, text) => {
    expect(formatTokens(units)).toBe(text);
  });
});
