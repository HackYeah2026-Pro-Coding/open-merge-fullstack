const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Decodes a base58 string (Bitcoin alphabet, as used by Solana addresses). */
export function decodeBase58(input: string): Uint8Array {
  let value = 0n;
  for (const char of input) {
    const digit = ALPHABET.indexOf(char);
    if (digit === -1) throw new Error(`Invalid base58 character "${char}".`);
    value = value * 58n + BigInt(digit);
  }

  const bytes: number[] = [];
  while (value > 0n) {
    bytes.unshift(Number(value & 0xffn));
    value >>= 8n;
  }
  // Each leading "1" encodes one leading zero byte.
  for (const char of input) {
    if (char !== '1') break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}
