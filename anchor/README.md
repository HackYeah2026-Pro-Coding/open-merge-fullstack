# Run tests

All tests:

```bash
anchor build
cargo test -p anchor --test escrow
```

One test

```bash
cargo test -p anchor --test escrow test_7
```

# Deploy

Program is deployed to **Devnet** (`Anchor.toml` -> `[provider] cluster = "devnet"`).

## Keys

| File                                | What it is                                                                                          | Public part        |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------ |
| `~/.config/solana/id.json`          | Deployer wallet. Pays for deploy and is the **upgrade authority** (only it can upgrade the program) | `solana address`   |
| `target/deploy/anchor-keypair.json` | Program keypair. Its public key **is the program ID**                                               | `anchor keys list` |

Program ID: `9MN1vjVWQpePTmrY7nzMBu5ZeGDtQtCbQvWamJWTDMV3`

The same ID must be in 3 places: `target/deploy/anchor-keypair.json`, `declare_id!` in `programs/anchor/src/lib.rs`, and `[programs.devnet]` in `Anchor.toml`. To sync them:

```bash
anchor keys sync
```

Never commit or delete keypair files. `target/` is gitignored, so back up `target/deploy/anchor-keypair.json` yourself. Losing it does not block upgrades (the wallet authorizes those), but `anchor deploy` would generate a new ID.

## First deploy

```bash
solana config set --url devnet
solana balance                 # needs ~2-4 SOL (program rent + temporary buffer)
solana airdrop 2               # or https://faucet.solana.com if rate-limited

anchor keys sync
anchor build
anchor deploy
```

Check it:

```bash
solana program show 9MN1vjVWQpePTmrY7nzMBu5ZeGDtQtCbQvWamJWTDMV3
```

Explorer: https://explorer.solana.com/address/9MN1vjVWQpePTmrY7nzMBu5ZeGDtQtCbQvWamJWTDMV3?cluster=devnet

## Upgrade (after code changes)

Same commands, same program ID. Costs only tx fees, the temporary buffer rent is refunded.

```bash
anchor build
anchor deploy
```

- Adding instructions is safe.
- Changing fields of `Escrow` breaks escrows already created with the old layout. On devnet just create new ones.
- After every build, copy the new IDL/types to the backend/frontend (see below).

If a deploy fails halfway, get the SOL back from leftover buffers:

```bash
solana program close --buffers
```

# Use from backend / scripts

There is no connection or server to the program. A client builds a transaction "call instruction X of program `9MN1...` with these accounts", signs it, and sends it to a Devnet RPC node. It needs:

| What       | Value / where                                                                                   |
| ---------- | ----------------------------------------------------------------------------------------------- |
| RPC URL    | `https://api.devnet.solana.com` (or a free Helius/QuickNode devnet URL, more reliable)          |
| Program ID | `9MN1vjVWQpePTmrY7nzMBu5ZeGDtQtCbQvWamJWTDMV3` (also in the IDL `address` field)                |
| IDL        | `target/idl/open_source_project.json`: instructions, accounts, errors                           |
| TS types   | `target/types/open_source_project.ts`: typed TS client (TypeScript only)                        |
| Signer     | keypair of whoever signs: client for `create_and_deposit`, CI verifier for `release` / `cancel` |
| Token mint | HACKYEAH2026 mint address                                                                       |

Copy the IDL (and types for TS) into the backend after each `anchor build`, or point to them directly.

Suggested backend env:

```bash
SOLANA_RPC_URL=https://api.devnet.solana.com
ESCROW_PROGRAM_ID=9MN1vjVWQpePTmrY7nzMBu5ZeGDtQtCbQvWamJWTDMV3
TOKEN_MINT=<HACKYEAH2026 mint>
SOLANA_CI_KEYPAIR_B64=<base64 of github-ci.json>   # secret, only where release runs
```

## Instructions (endpoints)

Accounts marked _auto_ are derived by the Anchor client (`accountsPartial`) and don't need to be passed. `tokenProgram` is `TOKEN_PROGRAM_ID` or `TOKEN_2022_PROGRAM_ID` and must match the mint's owner (OMT is Token-2022).

### `create_and_deposit(amount: u64)`

Client creates an escrow and locks `amount` tokens in the vault.

- **Args:** `amount` in base units (`50 OMT = 50_000_000`), must be `> 0`
- **Signers:** `client` (pays rent, ~0.004 SOL) and `escrow` (a fresh `Keypair.generate()`)
- **Accounts:**
  - `client`: client's wallet
  - `verifier`: CI verifier's pubkey (does not sign here, only stored)
  - `tokenMint`: token mint (OMT)
  - `escrow`: public key of the new keypair, this becomes the escrow address
  - `clientTokenAccount`: client's token account for `tokenMint`, holding at least `amount`
  - `tokenProgram`
  - _auto:_ `vaultTokenAccount`, `systemProgram`
- **Errors:** `InvalidAmount`

### `release()`

Verifier pays the locked tokens out to a developer.

- **Args:** none
- **Signer:** `verifier`, must equal `escrow.verifier` (pays rent if the developer's token account has to be created)
- **Accounts:**
  - `verifier`: CI verifier's wallet
  - `escrow`: escrow address
  - `developer`: developer's **wallet** pubkey (not a token account), receiver of the payout
  - `tokenMint`: must equal `escrow.token_mint`
  - `tokenProgram`
  - _auto:_ `vaultTokenAccount`, `developerTokenAccount` (developer's ATA, created if missing), `associatedTokenProgram`, `systemProgram`
- **Errors:** `UnauthorizedVerifier`, `AlreadyProcessed`

### `cancel()`

Verifier refunds the locked tokens back to the client.

- **Args:** none
- **Signer:** `verifier`, must equal `escrow.verifier`
- **Accounts:**
  - `verifier`: CI verifier's wallet
  - `escrow`: escrow address
  - `tokenMint`: must equal `escrow.token_mint`
  - `clientTokenAccount`: an existing token account for `tokenMint` owned by `escrow.client` (e.g. the client's ATA)
  - `tokenProgram`
  - _auto:_ `vaultTokenAccount`
- **Errors:** `UnauthorizedVerifier`, `AlreadyProcessed`, `InvalidClient`

`release` and `cancel` only work while the escrow status is `Funded`. Afterwards it is `Released` or `Cancelled` for good.

## Escrow state

Per escrow the backend should store the **escrow address** (printed by `create_and_deposit`). `release` / `cancel` need it, and everything else (client, verifier, amount, status, and after `release` the paid developer) can be read from the chain:

```ts
const escrow = await program.account.escrow.fetch(escrowAddress);
```

Vault address (PDA, tokens locked here) is derived, no need to store it:

```ts
PublicKey.findProgramAddressSync(
  [Buffer.from("vault"), escrowAddress.toBuffer()],
  programId,
);
```

Calling the instructions (TS, vault and developer token account are derived automatically):

```ts
// client locks 50 tokens (6 decimals) in a new escrow
const escrow = Keypair.generate();
await program.methods
  .createAndDeposit(new BN(50_000_000))
  .accountsPartial({ client, verifier, tokenMint, escrow: escrow.publicKey, clientTokenAccount, tokenProgram })
  .signers([escrow])
  .rpc();

// CI verifier pays out, the receiver is chosen here
await program.methods
  .release()
  .accountsPartial({ verifier, escrow: escrowAddress, developer, tokenMint, tokenProgram })
  .rpc();
```

Libraries:

- TypeScript (Node / Next.js): `@anchor-lang/core` + `@solana/spl-token`, see `scripts/example_create_deposit.ts`
- Python (FastAPI): `anchorpy` + `solders`, load the same IDL JSON

## Scripts

```bash
npm install

TOKEN_MINT=<mint> VERIFIER=<pubkey> AMOUNT=50 \
  npm run create-deposit
```

Optional: `CLIENT_KEYPAIR=<path>` (default `~/.config/solana/id.json`), `RPC_URL`.

# Token: OpenMerge Token (OMT)

The escrow works with any SPL Token or Token-2022 mint. OMT is a Token-2022 mint with the name and symbol stored on-chain (metadata extension). Do **not** add transfer fee, transfer hook, permanent delegate, non-transferable, pausable or default-frozen extensions: they break or endanger the escrow.

## Create the mint

Uses the deployer wallet (`~/.config/solana/id.json`) as payer and mint authority.

```bash
solana config set --url devnet

# 6 decimals, same as the examples above (50 OMT = 50_000_000 base units)
spl-token create-token --program-2022 --enable-metadata --decimals 6
# prints "Address: <MINT>", save it

spl-token initialize-metadata <MINT> "OpenMerge Token" "OMT" "<METADATA_URI>"
```

`<METADATA_URI>` is a public URL to a JSON file that wallets and explorers read for the logo. Use `""` for now and set it later with `spl-token update-metadata <MINT> uri <URL>`. Example JSON:

```json
{ "name": "OpenMerge Token", "symbol": "OMT", "description": "...", "image": "https://.../logo.png" }
```

Mint the supply to your wallet and check it:

```bash
spl-token create-account <MINT>
spl-token mint <MINT> 1000000      # 1,000,000 OMT
spl-token display <MINT>           # name, symbol, decimals, supply, extensions
spl-token balance <MINT>
```

Optional, makes the supply fixed forever (no more minting, cannot be undone):

```bash
spl-token authorize <MINT> mint --disable
```

## Use it in the project

1. Set the mint everywhere a token mint is needed (backend env, scripts):

   ```bash
   TOKEN_MINT=<MINT>
   ```

2. Give OMT to clients (whoever funds escrows). Creates their token account if needed:

   ```bash
   spl-token transfer <MINT> 1000 <CLIENT_WALLET> --fund-recipient --allow-unfunded-recipient
   ```

   Clients also need a little devnet SOL for fees and rent (~0.004 SOL per escrow). Developers need nothing: `release` creates their OMT account, paid by the verifier.

3. Create an escrow with OMT:

   ```bash
   TOKEN_MINT=<MINT> VERIFIER=<verifier pubkey> AMOUNT=50 \
     npm run create-deposit
   ```

4. After `release`, check the developer got paid:

   ```bash
   spl-token balance <MINT> --owner <DEVELOPER_WALLET>
   ```

Explorer: `https://explorer.solana.com/address/<MINT>?cluster=devnet`
