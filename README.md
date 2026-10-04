# OpenMerge

**Paid bounties for open-source issues. Merge the pull request, and the developer gets paid.**

Open source runs on unpaid work. Maintainers can't easily pay for a fix, and
contributors have no guarantee they'll be paid when they deliver one. OpenMerge
fixes both sides of that:

1. **Post a bounty.** The maintainer sets a reward, and OpenMerge opens the matching GitHub issue and locks the money in escrow.
2. **Open a pull request.** Any developer can pick up the issue and submit a fix.
3. **Get a review.** Two AI reviewers and the tests check the PR. The verdict shows up on the commit like any other CI check.
4. **Merge to pay.** When the maintainer merges, the reward goes straight to the developer's wallet.

**Neither side has to trust the other, or us.** The reward is held by an on-chain
program on Solana, not by our backend. It pays out only on merge, and our server
cannot move the funds. To users it's just GitHub: issues, pull requests and checks.

## Stack

| Part            | Choice                                       |
| --------------- | -------------------------------------------- |
| Web             | Vite 8 · React 19 · Tailwind 4               |
| API             | NestJS 12 · Prisma 7.9.1 · PostgreSQL 17     |
| Shared          | `packages/shared` — types used by both sides |
| Package manager | pnpm 10 workspaces                           |

## Quick start

```bash
cp .env.example .env
pnpm install
pnpm setup        # starts Postgres, runs migrations, seeds
pnpm dev          # API on :3000, web on :5173
```

Open <http://localhost:5173> — the page calls `/api/health` and should report
`status ok · database up`.

### One-time: Docker access

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
| `pnpm db:up` / `db:down` | Start / stop Postgres                    |
| `pnpm db:nuke`           | Stop Postgres **and delete its volume**  |
| `pnpm db:migrate`        | `prisma migrate dev`                     |
| `pnpm db:reset`          | Drop, re-migrate, re-seed                |
| `pnpm db:seed`           | Run the seed (idempotent)                |
| `pnpm db:studio`         | Prisma Studio                            |

Database UI at <http://localhost:8080>: `docker compose --profile tools up -d adminer`

## Layout

```
apps/api/            NestJS
  prisma/
    schema.prisma    models + the Prisma 7 generator config
    seed.ts          idempotent seed
  prisma.config.ts   schema path, migrations path, DATABASE_URL
  src/
    config/env.ts    zod-validated environment, checked at boot
    core/filters/    global exception filter
    prisma/          PrismaService (driver adapter)
    health/          GET /api/health
    generated/       Prisma client — generated, gitignored
apps/web/            Vite + React
  src/index.css      design tokens (dark + light) exposed to Tailwind
packages/shared/     types shared by API and web
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

## Deploying the API to Render

`apps/api/Dockerfile` builds a production image of the API alone. `render.yaml`
is a Blueprint that wires it up; you can also create the service by hand.

**Build context is the repository root, not `apps/api`** — the pnpm workspace
needs the root manifests and lockfile. In the Render dashboard:

| Setting | Value |
|---|---|
| Runtime | Docker |
| Dockerfile Path | `./apps/api/Dockerfile` |
| Docker Build Context Directory | `.` |
| Health Check Path | `/api/health` |

Environment variables on the service:

| Variable | Value |
|---|---|
| `DATABASE_URL` | the Supabase **session pooler** string |
| `WEB_ORIGIN` | origin of the deployed frontend, for CORS |
| `NODE_ENV` | `production` |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | a production GitHub OAuth App with callback `https://<web-domain>/api/auth/github/callback` |
| `SESSION_SECRET` | at least 32 random characters (`openssl rand -hex 32`); signs session cookies |

`DATABASE_URL` wins over `DB_TARGET` whenever it is set, so a deployed container
needs exactly one database variable and the local `local`/`supabase` switch stays
out of production entirely. Render injects `PORT` on its own and the app binds
`0.0.0.0`, which is what makes it reachable from outside the container.

### Migrations

The image deliberately ships without the Prisma CLI — the generated client is
TypeScript that `nest build` already compiled into `dist`, so production needs
only `@prisma/client` and the `pg` driver. Run migrations from your machine
against the same database, as described in
[Migrating Supabase](#migrating-supabase):

```bash
DB_TARGET=supabase pnpm --filter @escrow/api run db:deploy
```

Since Supabase is both your shared development database and the production one,
this is a single step rather than a separate release pipeline. If you later split
them, add the Prisma CLI to the runtime stage and set a Render pre-deploy command.

### Local verification before pushing

```bash
docker build -f apps/api/Dockerfile -t escrow-api .
docker run --rm -p 3000:3000 -e DATABASE_URL="<your url>" escrow-api
curl localhost:3000/api/health
```

### Note on the free plan

Free Render services sleep after inactivity and take ~50s to wake. Hit the URL a
few minutes before a demo, or keep a browser tab open on it.

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
