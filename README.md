# Escrow

project template

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
`SUPABASE_DATABASE_URL` in `.env`, then:

```bash
pnpm use:supabase
pnpm db:migrate
pnpm db:seed
```

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

### If SSL fails

`sslmode=require` is treated as full certificate verification by this driver
(not libpq's weaker meaning). If you get `self-signed certificate in certificate
chain`, change it to `sslmode=no-verify`.

### Caveats

`pnpm db:up` is a no-op when `DB_TARGET=supabase` — there is no container to
start. And `pnpm db:nuke` only ever touches the local container; it cannot
delete anything on Supabase.

Supabase is shared, so a migration you run lands on your teammate too. That is
the point — it keeps one schema between you — but run `pnpm db:migrate` on a
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

`DATABASE_URL` wins over `DB_TARGET` whenever it is set, so a deployed container
needs exactly one database variable and the local `local`/`supabase` switch stays
out of production entirely. Render injects `PORT` on its own and the app binds
`0.0.0.0`, which is what makes it reachable from outside the container.

### Migrations

The image deliberately ships without the Prisma CLI — the generated client is
TypeScript that `nest build` already compiled into `dist`, so production needs
only `@prisma/client` and the `pg` driver. Run migrations from your machine
against the same database:

```bash
pnpm use:supabase
pnpm db:migrate
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
