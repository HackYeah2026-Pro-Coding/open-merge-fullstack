import type { TokenAmount } from '@escrow/shared';

/**
 * Read-only balance lookups over Solana's JSON-RPC. No SDK is needed for two
 * reads, and nothing here can sign or send a transaction.
 */

export interface WalletBalance {
  /** The reward token, summed over every account the wallet holds for its mint. */
  token: TokenAmount;
  /** Native SOL, which pays network fees. */
  sol: TokenAmount;
}

export interface BalanceSource {
  rpcUrl: string;
  /** Mint of the reward token. */
  mint: string;
  symbol: string;
}

const SOL_DECIMALS = 9;
const CONFIRMED = { commitment: 'confirmed' } as const;

interface RpcBody<T> {
  result?: T;
  error?: { code: number; message: string };
}

interface WithValue<T> {
  value: T;
}

interface ParsedTokenAccount {
  account: { data: { parsed: { info: { tokenAmount: { amount: string; decimals: number } } } } };
}

async function rpc<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`Solana RPC answered ${res.status} ${res.statusText} to ${method}.`);
  const body = (await res.json()) as RpcBody<T>;
  if (body.error) throw new Error(`Solana RPC rejected ${method}: ${body.error.message}`);
  if (body.result === undefined) throw new Error(`Solana RPC sent no result for ${method}.`);
  return body.result;
}

export async function readWalletBalance(address: string, source: BalanceSource): Promise<WalletBalance> {
  const [lamports, accounts] = await Promise.all([
    rpc<WithValue<number>>(source.rpcUrl, 'getBalance', [address, CONFIRMED]),
    rpc<WithValue<ParsedTokenAccount[]>>(source.rpcUrl, 'getTokenAccountsByOwner', [
      address,
      { mint: source.mint },
      { ...CONFIRMED, encoding: 'jsonParsed' },
    ]),
  ]);

  const held = accounts.value.map((a) => a.account.data.parsed.info.tokenAmount);
  // A wallet that never held the token has no account to read decimals from; the mint has them.
  const decimals =
    held[0]?.decimals ??
    (await rpc<WithValue<{ decimals: number }>>(source.rpcUrl, 'getTokenSupply', [source.mint, CONFIRMED])).value.decimals;

  return {
    token: {
      amount: held.reduce((sum, a) => sum + BigInt(a.amount), 0n).toString(),
      symbol: source.symbol,
      decimals,
    },
    // Lamports arrive as a JSON number, exact up to 2^53 (about 9 million SOL).
    sol: { amount: BigInt(lamports.value).toString(), symbol: 'SOL', decimals: SOL_DECIMALS },
  };
}
