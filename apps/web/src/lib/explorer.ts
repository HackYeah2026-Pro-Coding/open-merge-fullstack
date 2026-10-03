import { env } from './env';

function cluster(): string {
  return env.solanaCluster === 'mainnet-beta' ? '' : `?cluster=${env.solanaCluster}`;
}

export function txUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}${cluster()}`;
}

export function addressUrl(address: string): string {
  return `https://explorer.solana.com/address/${address}${cluster()}`;
}
