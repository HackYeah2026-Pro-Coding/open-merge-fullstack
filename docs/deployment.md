# Deployment

The API runs on Render as a Docker image, the web app on Vercel, and both share
the Supabase database. Local setup is in [development.md](development.md).

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
| `WALLET_CHALLENGE_SECRET` | at least 32 random characters; signs wallet-link challenges |
| `API_URL` | public URL of the API, used in absolute links such as the token image |
| `GITHUB_ORG`, `GITHUB_OWNER_LOGIN` | organization that carries bounties and its owner's login |
| `GITHUB_TOKEN` | bot account token: opens issues, reads PRs and CI, posts commit statuses and comments |
| `GITHUB_WEBHOOK_SECRET` | secret of the review and merge webhooks |
| `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL` | AI reviewers (`CLAUDE_REVIEW_MODEL` is optional) |
| `SERVER_WALLET_KEYPAIR_B64`, `SERVER_WALLET_ADDRESS`, `SOLANA_CI_KEYPAIR_B64` | funding wallet and verifier key of the escrow |
| `ESCROW_PROGRAM_ID`, `TOKEN_MINT`, `SOLANA_RPC_URL` | escrow program, OMT mint and RPC endpoint |

In production the API refuses to boot without the secrets, the OAuth app, the
owner login, the escrow and the review variables. `API_URL`, `GITHUB_ORG` and
`SOLANA_RPC_URL` have defaults (set `API_URL` anyway), and `GITHUB_TOKEN` is not
checked at boot, but without it no bounty can be created. `render.yaml` declares
only part of this list; add the rest in the dashboard.

`DATABASE_URL` wins over `DB_TARGET` whenever it is set, so a deployed container
needs exactly one database variable and the local `local`/`supabase` switch stays
out of production entirely. Render injects `PORT` on its own and the app binds
`0.0.0.0`, which is what makes it reachable from outside the container.

### Migrations

The image deliberately ships without the Prisma CLI — the generated client is
TypeScript that `nest build` already compiled into `dist`, so production needs
only `@prisma/client` and the `pg` driver. Run migrations from your machine
against the same database, as described in
[Migrating Supabase](development.md#migrating-supabase):

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

## Web on Vercel

`apps/web/vercel.json` builds the web app alone and rewrites `/api/*` to the
Render service, so the browser still talks to one origin and the session cookie
stays first-party. Build it with `VITE_API_MODE=http` and the `VITE_*` values
from `.env.example`.

## Note on the free plan

Free Render services sleep after inactivity and take ~50s to wake. Hit the URL a
few minutes before a demo, or keep a browser tab open on it.
