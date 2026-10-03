/**
 * Decimals and symbol of the reward token. They mirror REWARD_DECIMALS (bounty-view.ts) and
 * DEFAULT_REWARD_SYMBOL (issue.service.ts), which this CLI does not import because that pulls in
 * the whole Solana stack; reward.spec.ts fails if they drift apart.
 */
export const REWARD_DECIMALS = 6;
export const REWARD_SYMBOL = 'OMT';

const UNIT = 10n ** BigInt(REWARD_DECIMALS);

export const toBaseUnits = (tokens: number): bigint => BigInt(tokens) * UNIT;

/** 50_000_000 base units as "50 OMT"; fractions only when there are any. */
export function formatTokens(baseUnits: bigint): string {
  const fraction = (baseUnits % UNIT).toString().padStart(REWARD_DECIMALS, '0').replace(/0+$/, '');
  return `${baseUnits / UNIT}${fraction ? `.${fraction}` : ''} ${REWARD_SYMBOL}`;
}
