import idl from '../solana/idl/open_source_project.json';
import { keypairFromBase64, publicKeyFrom } from '../solana/keypair';

export interface EscrowEnv {
  ESCROW_PROGRAM_ID?: string;
  TOKEN_MINT?: string;
  SOLANA_CI_KEYPAIR_B64?: string;
  SERVER_WALLET_KEYPAIR_B64?: string;
  SERVER_WALLET_ADDRESS?: string;
}

const REQUIRED: (keyof EscrowEnv)[] = [
  'ESCROW_PROGRAM_ID',
  'TOKEN_MINT',
  'SOLANA_CI_KEYPAIR_B64',
  'SERVER_WALLET_ADDRESS',
];

/**
 * Escrow is on when SERVER_WALLET_KEYPAIR_B64 is set; the other variables are then
 * required and must agree with each other. Returns the first problem, or undefined.
 */
export function escrowEnvIssue(env: EscrowEnv, production: boolean): string | undefined {
  if (!env.SERVER_WALLET_KEYPAIR_B64) {
    return production ? 'SERVER_WALLET_KEYPAIR_B64: required in production' : undefined;
  }
  const missing = REQUIRED.filter((key) => !env[key]);
  if (missing.length > 0) {
    return `${missing.join(', ')}: required when SERVER_WALLET_KEYPAIR_B64 is set`;
  }

  try {
    const programId = publicKeyFrom('ESCROW_PROGRAM_ID', env.ESCROW_PROGRAM_ID!);
    // The client is built from the bundled IDL, which carries its own program address.
    if (programId.toBase58() !== idl.address) {
      return `ESCROW_PROGRAM_ID: ${programId.toBase58()} differs from the bundled IDL (${idl.address}); copy the IDL of the deployed program into src/solana/idl`;
    }
    publicKeyFrom('TOKEN_MINT', env.TOKEN_MINT!);
    const verifier = keypairFromBase64('SOLANA_CI_KEYPAIR_B64', env.SOLANA_CI_KEYPAIR_B64!);
    const server = keypairFromBase64('SERVER_WALLET_KEYPAIR_B64', env.SERVER_WALLET_KEYPAIR_B64);
    if (server.publicKey.toBase58() !== env.SERVER_WALLET_ADDRESS) {
      return `SERVER_WALLET_KEYPAIR_B64: its address ${server.publicKey.toBase58()} is not SERVER_WALLET_ADDRESS`;
    }
    if (server.publicKey.equals(verifier.publicKey)) {
      return 'SERVER_WALLET_KEYPAIR_B64, SOLANA_CI_KEYPAIR_B64: must be different wallets';
    }
  } catch (error) {
    // The helpers above throw one-line messages that already name the variable.
    if (error instanceof Error) return error.message;
    throw error;
  }
  return undefined;
}
