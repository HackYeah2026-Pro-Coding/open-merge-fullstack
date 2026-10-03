import { afterEach, describe, expect, it, vi } from 'vitest';
import { readWalletBalance } from './solana-rpc';

const SOURCE = { rpcUrl: 'https://rpc.test', mint: 'Mint111', symbol: 'OMT' };

function tokenAccount(amount: string, decimals: number) {
  return { account: { data: { parsed: { info: { tokenAmount: { amount, decimals } } } } } };
}

/** Answers each JSON-RPC method from `results`, and records which methods were called. */
function stubRpc(results: Record<string, unknown>, init: ResponseInit = { status: 200 }) {
  const methods: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, request: RequestInit) => {
      const { method } = JSON.parse(String(request.body)) as { method: string };
      methods.push(method);
      return new Response(JSON.stringify(results[method]), init);
    }),
  );
  return methods;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readWalletBalance', () => {
  it('sums every token account for the mint and reads SOL in lamports', async () => {
    const methods = stubRpc({
      getBalance: { result: { value: 1_500_000_000 } },
      getTokenAccountsByOwner: { result: { value: [tokenAccount('1250000000', 6), tokenAccount('500000', 6)] } },
    });

    const balance = await readWalletBalance('Owner111', SOURCE);

    expect(balance).toEqual({
      token: { amount: '1250500000', symbol: 'OMT', decimals: 6 },
      sol: { amount: '1500000000', symbol: 'SOL', decimals: 9 },
    });
    expect(methods).not.toContain('getTokenSupply');
  });

  it('reads decimals from the mint when the wallet has no token account', async () => {
    stubRpc({
      getBalance: { result: { value: 0 } },
      getTokenAccountsByOwner: { result: { value: [] } },
      getTokenSupply: { result: { value: { amount: '1000000000000', decimals: 6 } } },
    });

    const balance = await readWalletBalance('Owner111', SOURCE);

    expect(balance.token).toEqual({ amount: '0', symbol: 'OMT', decimals: 6 });
    expect(balance.sol.amount).toBe('0');
  });

  it('fails with the RPC error message', async () => {
    stubRpc({
      getBalance: { error: { code: -32602, message: 'Invalid param: WrongSize' } },
      getTokenAccountsByOwner: { result: { value: [] } },
    });

    await expect(readWalletBalance('bad', SOURCE)).rejects.toThrow('Solana RPC rejected getBalance: Invalid param: WrongSize');
  });

  it('fails on an HTTP error such as rate limiting', async () => {
    stubRpc({}, { status: 429, statusText: 'Too Many Requests' });

    await expect(readWalletBalance('Owner111', SOURCE)).rejects.toThrow('Solana RPC answered 429 Too Many Requests');
  });
});
