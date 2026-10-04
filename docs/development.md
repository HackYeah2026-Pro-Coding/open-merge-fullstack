# Development

How to run OpenMerge locally, configure it, and work with the database. For what
the project is, see the [README](../README.md); for production, see
[deployment.md](deployment.md).

## Setup

```bash
cp .env.example .env
pnpm install
pnpm setup        # starts Postgres, runs migrations, seeds
pnpm dev          # API on :3000, web on :5173
```

Open <http://localhost:5173>. With the default `VITE_API_MODE=mock` the web app
runs on an in-browser mock of the API and needs no backend. Set
`VITE_API_MODE=http` to talk to the NestJS API; `curl localhost:3000/api/health`
checks it, and the API reference is at <http://localhost:3000/api/docs>.

The API boots with only a database. Each feature switches on when its variables
are set (see `.env.example`), and answers 503 naming what is missing until then:

| Feature | Variables |
|---|---|
| GitHub sign-in | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` |
| Opening GitHub issues, reading PRs | `GITHUB_TOKEN` |
| Escrow on Solana | `SERVER_WALLET_KEYPAIR_B64`, `SERVER_WALLET_ADDRESS`, `SOLANA_CI_KEYPAIR_B64`, `ESCROW_PROGRAM_ID`, `TOKEN_MINT`, `SOLANA_RPC_URL` |
| AI review | `GITHUB_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL` |
| Payout on merge | `GITHUB_WEBHOOK_SECRET` and the escrow variables |

GitHub webhooks (event "Pull requests", secret `GITHUB_WEBHOOK_SECRET`) go to
`<API_URL>/api/review/webhook` for the review and
`<API_URL>/api/merge/webhook-handler` for the payout.

## One-time: Docker access

`docker compose` needs your user to be in the `docker` group:

```bash
sudo usermod -aG docker $USER
```

Then log out and back in (or run `newgrp docker`) for it to take effect.

**No Docker?** Prisma 7 ships a local Postgres that needs no container:

```bash
pnpm --filter @escrow/api exec prisma dev
```

It prints a `DATABASE_URL` — paste it into `.env` and carry on.

## Scripts

Run from the repository root.

| Script                   | Does                                     |
| ------------------------ | ---------------------------------------- |
| `pnpm dev`               | Postgres + API + web, all watching       |
| `pnpm build`             | Builds every package in dependency order |
| `pnpm typecheck`         | `tsc --noEmit` across the workspace      |
| `pnpm test`              | Jest (API) and Vitest (web)              |
| `pnpm db:target`         | Which database is in use                 |
| `pnpm use:local` / `use:supabase` | Switch the database             |
| `pnpm db:up` / `db:down` | Start / stop Postgres                    |
| `pnpm db:nuke`           | Stop Postgres **and delete its volume**  |
| `pnpm db:migrate`        | `prisma migrate dev`                     |
| `pnpm db:reset`          | Drop, re-migrate, re-seed                |
| `pnpm db:seed`           | Run the seed (idempotent)                |
| `pnpm db:studio`         | Prisma Studio                            |
| `pnpm demo:*`            | Demo take on GitHub, see `demo/README.md` |

Database UI at <http://localhost:8080>: `docker compose --profile tools up -d adminer`

## Layout

```
anchor/              escrow program (Anchor, Rust) and its tests; see anchor/README.md
apps/api/            NestJS
  prisma/
    schema.prisma    models + the Prisma 7 generator config
    seed.ts          idempotent seed
  prisma.config.ts   schema path, migrations path, DATABASE_URL
  scripts/demo/      the pnpm demo:* commands
  src/
    config/env.ts    zod-validated environment, checked at boot
    auth/            GitHub OAuth sign-in, session and owner-view cookies
    bounty/          bounty list, detail and creation; org and repo views
    issue/           POST /api/issue: lock the reward, open the GitHub issue
    repo/ github/    stored repositories and GitHub REST calls
    review/          PR webhook, Claude + Gemini review, commit status and comment
    merge/ payout/   merge webhook and release of the escrow to the PR author
    solana/          escrow program client (EscrowService) and read-only reader
    wallet/          linking a Phantom wallet by signed challenge
    health/          GET /api/health
    generated/       Prisma client — generated, gitignored
apps/web/            Vite + React
  src/api/           HTTP client and the in-browser mock (VITE_API_MODE)
  src/pages/         landing, bounties, dashboard, account, token
  src/wallet/        Phantom connection and balances
  src/index.css      design tokens (dark + light) exposed to Tailwind
packages/shared/     types shared by API and web
demo/                demo scenario, repo states and filler data
```

## Switching between local Postgres and Supabase

Both connection strings live side by side in `.env`; `DB_TARGET` picks one. The
app, the Prisma CLI and the seed all read it through the same resolver
(`apps/api/src/config/database-url.ts`), so they can never disagree about which
database is in use.

```bash
pnpm db:target        # which one am I on?
pnpm use:supabase     # switch
pnpm use:local        # switch back
```

Every Prisma command prints its target before doing anything, because migrations
are destructive:

```
[prisma] target: supabase (aws-0-eu-central-1.pooler.supabase.com:5432)
```

### Setting up Supabase

In the dashboard: **Connect** → **Session pooler**. Copy that string into
`SUPABASE_DATABASE_URL` in `.env`, then apply the existing migrations and seed:

```bash
DB_TARGET=supabase pnpm --filter @escrow/api run db:deploy
DB_TARGET=supabase pnpm db:seed
```

Setting `DB_TARGET` on the command line overrides `.env` for that one command,
so you never forget to switch back to local.

**Pick the session pooler, not "Direct connection".** Direct connections are
IPv6-only unless you buy the IPv4 add-on, so on most networks they simply time
out. The session pooler (port 5432) is IPv4 on every plan and supports prepared
statements, which means one URL serves both the running app and `prisma migrate`.

Use `SUPABASE_DIRECT_URL` only if you deliberately point `SUPABASE_DATABASE_URL`
at the **transaction** pooler (port 6543). That one cannot run migrations, so put
a session-pooler URL in `SUPABASE_DIRECT_URL` and the Prisma CLI will use it
while the app keeps the pooled connection. Prisma 7 has no `directUrl` setting —
this split works because the CLI reads `prisma.config.ts` while the app builds
its own driver adapter.

`SUPABASE_DIRECT_URL` is the same string with the port changed to 5432 and any
`pgbouncer=true` removed:

```
SUPABASE_DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-<n>-<region>.pooler.supabase.com:6543/postgres
SUPABASE_DIRECT_URL=postgresql://postgres.<ref>:<password>@aws-<n>-<region>.pooler.supabase.com:5432/postgres
```

**If a Prisma command against Supabase hangs with no output, this is why.**
It is talking to the transaction pooler, which never answers the migration
handshake, so the command waits forever instead of failing.

### Migrating Supabase

Create migrations against the local database, then apply the finished files to
Supabase. Never run `prisma migrate dev` against Supabase: when it detects drift
it offers to reset the database, and Supabase is shared.

```bash
# 1. Edit apps/api/prisma/schema.prisma, then create and apply the migration locally
pnpm db:migrate --name describe_the_change
pnpm prisma:generate          # Prisma 7's migrate dev does not regenerate the client
pnpm db:seed && pnpm typecheck

# 2. Read the generated SQL in apps/api/prisma/migrations/<timestamp>_<name>/
#    Look for DROP TABLE / DROP COLUMN, which delete data.

# 3. Apply it to Supabase
DB_TARGET=supabase pnpm --filter @escrow/api exec prisma migrate status
DB_TARGET=supabase pnpm --filter @escrow/api run db:deploy

# 4. Confirm Supabase matches the schema
DB_TARGET=supabase pnpm --filter @escrow/api exec prisma migrate diff \
  --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

`migrate status` lists what will be applied. `migrate deploy` applies only the
migration files that are new, in order, and never resets anything. The final
`migrate diff` prints `No difference detected.` when the two agree.

Commit the migration folder with the schema change. Your teammate gets the same
schema locally by pulling and running `pnpm db:migrate`.

### If SSL fails

`sslmode=require` is treated as full certificate verification by this driver
(not libpq's weaker meaning). If you get `self-signed certificate in certificate
chain`, change it to `sslmode=no-verify`.

### Caveats

`pnpm db:up` is a no-op when `DB_TARGET=supabase` — there is no container to
start. And `pnpm db:nuke` only ever touches the local container; it cannot
delete anything on Supabase.

Supabase is shared, so a migration you deploy lands on your teammate too. That is
the point — it keeps one schema between you — but deploy only migrations from a
branch you have both agreed on.

## Things worth knowing

**Postgres runs on host port 55432**, not 5432, so it does not collide with a
Postgres you may already have running. The container still listens on 5432
internally.

**One `.env` at the repository root** serves all three packages. The API resolves
it explicitly, Prisma loads it through `prisma.config.ts`, and Vite reads it via
`envDir`.

**Vite proxies `/api` to `localhost:3000`**, so the browser talks to one origin.
There is no CORS dance in development and no absolute API URL in the frontend.

**Prisma 7 differs from 6 in ways that bite:**

- The client is generated into `apps/api/src/generated/prisma` — source, not
  `node_modules`. It is gitignored; `pnpm install` regenerates it.
- `moduleFormat = "cjs"` and `importFileExtension = ""` in the generator are what
  make the generated code compile under NestJS' CommonJS build. Removing them
  produces ESM with `.ts` import specifiers, which `tsc` will reject.
- The connection URL lives in `prisma.config.ts`, not in `schema.prisma`.
- There is no Rust query engine. `PrismaClient` requires a driver adapter —
  see `PrismaService`.
- Enums must span multiple lines. `enum Status { A B }` is a syntax error.

**TypeScript is pinned to 5.9.3.** `@nestjs/schematics` advertises a peer
requirement of >=6, but 5.9.3 works for both `nest build` and `nest generate`, and
is what the surrounding ecosystem is tested against. npm's `latest` tag is now
TypeScript 7, which removed `baseUrl`.

**`pnpm install` reports "Ignored build scripts: @parcel/watcher,
@prisma/engines".** That is deliberate — Prisma 7 does not need the engine
binaries.
