# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

# Commits

Do not sign commits as claude

# Supabase migrations (agent workflow)

`prisma migrate dev` is interactive and fails in agent shells; never run it against Supabase. Instead:

1. Edit `apps/api/prisma/schema.prisma`, `pnpm db:up`, create `apps/api/prisma/migrations/<UTC yyyymmddHHMMSS>_<name>/`, then from `apps/api`:
   `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script > <dir>/migration.sql`
2. Delete the `[prisma] target: …` banner Prisma prints into line 1 of that file, and check the SQL for `DROP`.
3. Locally: `pnpm --filter @escrow/api run db:deploy`, `pnpm prisma:generate`, `pnpm db:seed`, `pnpm typecheck`, `pnpm test`. If typecheck can't find `@escrow/shared` exports, run `pnpm --filter @escrow/shared build`.
4. Supabase: `DB_TARGET=supabase pnpm --filter @escrow/api exec prisma migrate status` (a P1001 error can be transient, so retry once), then `DB_TARGET=supabase pnpm --filter @escrow/api run db:deploy`.
5. Verify from `apps/api`: `DB_TARGET=supabase pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` should print `No difference detected.`

If a local deploy fails, fix the SQL, then run `pnpm exec prisma migrate resolve --rolled-back <migration>` and deploy again.
