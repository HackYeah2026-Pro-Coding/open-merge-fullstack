/**
 * A token amount as it travels over the API. `amount` is integer base units
 * serialised from a BigInt (JSON has no BigInt), so it is never a float.
 */
export interface TokenAmount {
  amount: string;
  symbol: string;
  decimals: number;
}
