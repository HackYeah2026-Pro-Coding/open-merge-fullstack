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
