import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Program } from '@anchor-lang/core';
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, unpackAccount, unpackMint } from '@solana/spl-token';
import { Connection, PublicKey } from '@solana/web3.js';
import type { Env } from '../config/env';
import { EscrowService } from './escrow.service';
import idl from './idl/open_source_project.json';
import type { OpenSourceProject } from './idl/open_source_project';
import { publicKeyFrom } from './keypair';

export type EscrowStatus = 'funded' | 'released' | 'cancelled';

/** An escrow account as stored on chain, with addresses in base58. */
export interface EscrowAccount {
  client: string;
  developer: string | null;
  verifier: string;
  tokenMint: string;
  amount: bigint;
  status: EscrowStatus;
}

export interface MintInfo {
  decimals: number;
  tokenProgram: string;
}

/** How the cluster sees a transaction signature. */
export interface TransactionOutcome {
  /** processed, confirmed or finalized; null when the cluster has no record of it. */
  confirmation: string | null;
  /** The program error, or null when the transaction succeeded. */
  error: unknown;
}

const VAULT_SEED = Buffer.from('vault');

/**
 * Read-only view of the escrow program's accounts and the reward token. It holds no
 * keys, so it cannot sign or move anything; it is used to verify what EscrowService did.
 */
@Injectable()
export class EscrowReader {
  private readonly connection: Connection;
  private readonly program: Program<OpenSourceProject>;

  constructor(
    config: ConfigService<Env, true>,
    private readonly escrow: EscrowService,
  ) {
    this.connection = new Connection(config.get('SOLANA_RPC_URL', { infer: true }), 'confirmed');
    this.program = new Program<OpenSourceProject>(idl as OpenSourceProject, { connection: this.connection });
  }

  /** The escrow account at `escrowAddress`, or null when no account exists there. */
  async fetchEscrow(escrowAddress: string): Promise<EscrowAccount | null> {
    const escrow = publicKeyFrom('escrowAddress', escrowAddress);
    const account = await read(`escrow ${escrowAddress}`, () => this.program.account.escrow.fetchNullable(escrow));
    if (!account) return null;
    return {
      client: account.client.toBase58(),
      developer: account.developer?.toBase58() ?? null,
      verifier: account.verifier.toBase58(),
      tokenMint: account.tokenMint.toBase58(),
      amount: BigInt(account.amount.toString()),
      status: Object.keys(account.status)[0] as EscrowStatus,
    };
  }

  /** The program-owned token account that holds an escrow's tokens. */
  vaultAddress(escrowAddress: string): string {
    const escrow = publicKeyFrom('escrowAddress', escrowAddress);
    const [vault] = PublicKey.findProgramAddressSync([VAULT_SEED, escrow.toBuffer()], this.program.programId);
    return vault.toBase58();
  }

  /** Base units of the reward token in `owner`'s associated token account; 0 when it has none. */
  async tokenBalance(owner: string): Promise<bigint> {
    const { tokenMint } = this.escrow.addresses();
    const { tokenProgram } = await this.mintInfo();
    const ata = getAssociatedTokenAddressSync(
      new PublicKey(tokenMint),
      publicKeyFrom('owner', owner),
      true,
      new PublicKey(tokenProgram),
    );
    return this.tokenAccountBalance(ata.toBase58());
  }

  /** Base units held by a token account; 0 when the account does not exist. */
  async tokenAccountBalance(tokenAccount: string): Promise<bigint> {
    const address = publicKeyFrom('tokenAccount', tokenAccount);
    const info = await read(`token account ${tokenAccount}`, () => this.connection.getAccountInfo(address));
    if (!info) return 0n;
    return unpackAccount(address, info, info.owner).amount;
  }

  /** Lamports held by `address`. */
  solBalance(address: string): Promise<number> {
    return read(`balance of ${address}`, () => this.connection.getBalance(publicKeyFrom('address', address)));
  }

  async mintInfo(): Promise<MintInfo> {
    const mint = new PublicKey(this.escrow.addresses().tokenMint);
    const info = await read(`mint ${mint.toBase58()}`, () => this.connection.getAccountInfo(mint));
    if (!info) throw new BadGatewayException(`Mint ${mint.toBase58()} does not exist on this cluster`);
    if (!info.owner.equals(TOKEN_PROGRAM_ID) && !info.owner.equals(TOKEN_2022_PROGRAM_ID)) {
      throw new BadGatewayException(`${mint.toBase58()} is not a token mint`);
    }
    return { decimals: unpackMint(mint, info, info.owner).decimals, tokenProgram: info.owner.toBase58() };
  }

  /** Whether the escrow program exists and is executable on this cluster. */
  async programDeployed(): Promise<boolean> {
    const info = await read('escrow program', () => this.connection.getAccountInfo(this.program.programId));
    return info?.executable ?? false;
  }

  async transactionOutcome(signature: string): Promise<TransactionOutcome> {
    const { value } = await read(`transaction ${signature}`, () =>
      this.connection.getSignatureStatus(signature, { searchTransactionHistory: true }),
    );
    return { confirmation: value?.confirmationStatus ?? null, error: value?.err ?? null };
  }
}

async function read<T>(what: string, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 300);
    throw new BadGatewayException(`Solana RPC failed while reading ${what}: ${message}`, { cause: error });
  }
}
