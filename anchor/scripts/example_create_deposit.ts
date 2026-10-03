// Example: create an escrow and lock the client's tokens in it (create_and_deposit).
//
// Steps:
//   1. Connect to Solana (devnet by default)
//   2. Load the client keypair (pays + signs)
//   3. Read the token mint (decimals, Token vs Token-2022)
//   4. Generate a fresh escrow keypair (the escrow is a normal account, not a PDA)
//   5. Call create_and_deposit, signed by the client and the new escrow keypair
//   6. Print the escrow address, the transaction signature, and the escrow state
//
// Prerequisites: `anchor build` + `anchor deploy` to devnet, `npm install`.
//
// Run:
//   TOKEN_MINT=<mint> VERIFIER=<pubkey> AMOUNT=50 \
//     npm run create-deposit
//
// Optional env:
//   RPC_URL          default https://api.devnet.solana.com
//   CLIENT_KEYPAIR   default ~/.config/solana/id.json (must hold TOKEN_MINT tokens)

import * as anchor from "@anchor-lang/core";
import { getAssociatedTokenAddressSync, getMint, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

import idl from "../target/idl/open_source_project.json" with { type: "json" };
import type { OpenSourceProject } from "../target/types/open_source_project";

const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";
const CLIENT_KEYPAIR = (process.env.CLIENT_KEYPAIR ?? "~/.config/solana/id.json").replace(/^~/, homedir());
const VAULT_SEED = Buffer.from("vault");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

function loadKeypair(path: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
}

// "50" or "12.5" -> raw base units, e.g. 50_000_000 for 6 decimals
function toBaseUnits(uiAmount: string, decimals: number): BN {
  const [whole, fraction = ""] = uiAmount.split(".");
  if (fraction.length > decimals) throw new Error(`AMOUNT has more than ${decimals} decimal places`);
  return new BN(whole + fraction.padEnd(decimals, "0"));
}

function explorer(kind: "tx" | "address", value: string): string {
  const cluster = RPC_URL.includes("devnet") ? "?cluster=devnet" : "";
  return `https://explorer.solana.com/${kind}/${value}${cluster}`;
}

async function main() {
  const tokenMint = new PublicKey(requireEnv("TOKEN_MINT"));
  const verifier = new PublicKey(requireEnv("VERIFIER"));
  const uiAmount = requireEnv("AMOUNT");

  // 1. connection + 2. client wallet
  const connection = new Connection(RPC_URL, "confirmed");
  const client = loadKeypair(CLIENT_KEYPAIR);
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(client), { commitment: "confirmed" });
  const program = new anchor.Program<OpenSourceProject>(idl as OpenSourceProject, provider);

  // 3. the mint's owner tells us which token program to use (Token or Token-2022)
  const mintInfo = await connection.getAccountInfo(tokenMint);
  if (!mintInfo) throw new Error(`Mint ${tokenMint.toBase58()} not found on ${RPC_URL}`);
  const tokenProgram = mintInfo.owner;
  if (!tokenProgram.equals(TOKEN_PROGRAM_ID) && !tokenProgram.equals(TOKEN_2022_PROGRAM_ID)) {
    throw new Error(`${tokenMint.toBase58()} is not a token mint`);
  }
  const mint = await getMint(connection, tokenMint, "confirmed", tokenProgram);
  const amount = toBaseUnits(uiAmount, mint.decimals);

  // client's token account the tokens are taken from
  const clientTokenAccount = getAssociatedTokenAddressSync(tokenMint, client.publicKey, false, tokenProgram);
  const balance = await connection.getTokenAccountBalance(clientTokenAccount).catch(() => null);
  if (!balance) throw new Error(`Client has no token account for this mint: ${clientTokenAccount.toBase58()}`);
  if (new BN(balance.value.amount).lt(amount)) {
    throw new Error(`Client balance ${balance.value.uiAmountString} is lower than AMOUNT ${uiAmount}`);
  }

  // 4. new escrow account; the vault PDA is derived from its address
  const escrow = Keypair.generate();
  const [vaultTokenAccount] = PublicKey.findProgramAddressSync(
    [VAULT_SEED, escrow.publicKey.toBuffer()],
    program.programId,
  );

  console.log("Program:   ", program.programId.toBase58());
  console.log("Client:    ", client.publicKey.toBase58());
  console.log("Verifier:  ", verifier.toBase58());
  console.log("Amount:    ", `${uiAmount} (${amount.toString()} base units)`);
  console.log("Escrow:    ", escrow.publicKey.toBase58());
  console.log("Vault:     ", vaultTokenAccount.toBase58());

  // 5. client pays and signs as the wallet; escrow keypair signs because `init` creates its account
  const signature = await program.methods
    .createAndDeposit(amount)
    .accountsPartial({
      client: client.publicKey,
      verifier,
      tokenMint,
      escrow: escrow.publicKey,
      clientTokenAccount,
      vaultTokenAccount,
      tokenProgram,
    })
    .signers([escrow])
    .rpc();

  // 6. result
  console.log("\nTransaction:", explorer("tx", signature));

  const state = await program.account.escrow.fetch(escrow.publicKey);
  const vaultBalance = await connection.getTokenAccountBalance(vaultTokenAccount);
  console.log("Escrow state:", {
    client: state.client.toBase58(),
    developer: state.developer?.toBase58() ?? null,
    verifier: state.verifier.toBase58(),
    tokenMint: state.tokenMint.toBase58(),
    amount: state.amount.toString(),
    status: Object.keys(state.status)[0],
  });
  console.log("Vault balance:", vaultBalance.value.uiAmountString);
  console.log("\nSave this escrow address, release/cancel need it:", escrow.publicKey.toBase58());
  console.log(explorer("address", escrow.publicKey.toBase58()));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
