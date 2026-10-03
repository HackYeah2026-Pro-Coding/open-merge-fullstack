import { BadGatewayException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnchorProvider, BN, Program, Wallet } from '@anchor-lang/core';
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import type { Env } from '../config/env';
import idl from './idl/open_source_project.json';
import type { OpenSourceProject } from './idl/open_source_project';
import { keypairFromBase64, publicKeyFrom } from './keypair';

/** Where a reward was locked on chain. */
export interface LockedReward {
  /** Base58 address of the new escrow account; release and cancel need it. */
  escrowAddress: string;
  /** Signature of the create_and_deposit transaction. */
  signature: string;
}

interface Chain {
  program: Program<OpenSourceProject>;
  /** The server wallet, which funds every escrow. */
  client: Keypair;
  verifier: PublicKey;
  tokenMint: PublicKey;
}

/**
 * Calls the escrow program. The server wallet acts as the client of every escrow,
 * so it can lock rewards; only the verifier can release or cancel them.
 */
@Injectable()
export class EscrowService {
  private readonly logger = new Logger(EscrowService.name);
  private readonly chain: Chain | null;

  constructor(config: ConfigService<Env, true>) {
    const serverKeypair = config.get('SERVER_WALLET_KEYPAIR_B64', { infer: true });
    if (!serverKeypair) {
      this.chain = null;
      return;
    }
    // env.ts has validated every value below, so none of these throw.
    const client = keypairFromBase64('SERVER_WALLET_KEYPAIR_B64', serverKeypair);
    const verifier = keypairFromBase64('SOLANA_CI_KEYPAIR_B64', config.get('SOLANA_CI_KEYPAIR_B64', { infer: true })!);
    const connection = new Connection(config.get('SOLANA_RPC_URL', { infer: true }), 'confirmed');
    const provider = new AnchorProvider(connection, new Wallet(client), { commitment: 'confirmed' });
    this.chain = {
      program: new Program<OpenSourceProject>(idl as OpenSourceProject, provider),
      client,
      // Only the public key is stored in the escrow; the verifier does not sign here.
      verifier: verifier.publicKey,
      tokenMint: publicKeyFrom('TOKEN_MINT', config.get('TOKEN_MINT', { infer: true })!),
    };
  }

  /**
   * Throws unless escrow is configured. Callers check this before doing work that
   * would be left half done without it.
   */
  assertConfigured(): void {
    this.requireChain();
  }

  /** Creates an escrow funded by the server wallet and locks `amount` base units in it. */
  async lockReward(amount: bigint): Promise<LockedReward> {
    const chain = this.requireChain();
    const tokenProgram = await this.tokenProgramOf(chain);
    const escrow = Keypair.generate();
    const escrowAddress = escrow.publicKey.toBase58();

    try {
      const signature = await chain.program.methods
        .createAndDeposit(new BN(amount.toString()))
        .accountsPartial({
          client: chain.client.publicKey,
          verifier: chain.verifier,
          tokenMint: chain.tokenMint,
          escrow: escrow.publicKey,
          clientTokenAccount: getAssociatedTokenAddressSync(
            chain.tokenMint,
            chain.client.publicKey,
            false,
            tokenProgram,
          ),
          tokenProgram,
        })
        .signers([escrow])
        .rpc();
      return { escrowAddress, signature };
    } catch (error) {
      // A confirmation timeout can hide a transaction that still lands, so the address
      // is logged: check it on an explorer and cancel it if the tokens were locked.
      this.logger.error(
        `create_and_deposit failed for escrow ${escrowAddress}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new BadGatewayException(`Locking the reward on Solana failed: ${messageOf(error)}`, { cause: error });
    }
  }

  private requireChain(): Chain {
    if (!this.chain) {
      throw new ServiceUnavailableException(
        'SERVER_WALLET_KEYPAIR_B64 is not set, so rewards cannot be locked in escrow',
      );
    }
    return this.chain;
  }

  /** The token program must match the program that owns the mint (OMT is Token-2022). */
  private async tokenProgramOf(chain: Chain): Promise<PublicKey> {
    const mint = chain.tokenMint.toBase58();
    let owner: PublicKey | undefined;
    try {
      owner = (await chain.program.provider.connection.getAccountInfo(chain.tokenMint))?.owner;
    } catch (error) {
      throw new BadGatewayException(`Solana RPC failed while reading mint ${mint}: ${messageOf(error)}`, {
        cause: error,
      });
    }
    if (!owner) throw new BadGatewayException(`Mint ${mint} does not exist on this cluster`);
    if (!owner.equals(TOKEN_PROGRAM_ID) && !owner.equals(TOKEN_2022_PROGRAM_ID)) {
      throw new BadGatewayException(`${mint} is not a token mint`);
    }
    return owner;
  }
}

function messageOf(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 300);
}
