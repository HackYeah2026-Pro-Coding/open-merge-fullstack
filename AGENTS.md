# OpenMerge

Paid bounties for open-source issues. A maintainer posts an issue with a reward, the
money is locked up front, a developer solves it, and the reward is paid out when the
pull request is merged. Neither side has to trust the other.

Built for a hackathon. The deliverable is a recording and a presentation, so anything
visible on screen has to look and behave like a finished product.

## How it works

1. A maintainer creates a bounty. A matching issue appears on GitHub and the reward is locked.
2. A developer opens a pull request that solves the issue.
3. The pull request is checked automatically (AI review, tests) and the result shows up on the commit like any other CI check.
4. The maintainer merges whenever they decide to, regardless of the check result.
5. On merge the reward is released to the developer's wallet, whatever the check said. The check informs the maintainer's decision to merge; it never gates the payout.

The rule that shapes everything: **the party that holds the money must not be the one
deciding who gets it.** Release conditions are enforced by an on-chain program, never by
our backend. Backend code must not gain the ability to move funds.

## Who owns what

| Area | Owner |
|---|---|
| Frontend, backend API, database, GitHub login, bounty CRUD, wallet linking | this repo's main author |
| GitHub webhooks and the blockchain / escrow side | teammate |

The on-chain and webhook parts sit behind interfaces so the app works end to end on
mocks before the real implementation lands. **Do not edit the teammate's areas or change
those interfaces without asking.** This file deliberately says nothing about how the
on-chain side works.

## Repository

```
apps/api/        NestJS + Prisma 7.9.1 + PostgreSQL
apps/web/        Vite + React + Tailwind 4
packages/shared/ types shared by both
scripts/         database target switching helpers
```

The package scope `@escrow/*` is a placeholder from before the name was chosen. Leave it
until someone asks for a rename.

### Commands

```bash
pnpm install
pnpm setup          # database up, migrate, seed
pnpm dev            # API :3000, web :5173
pnpm build
pnpm typecheck
pnpm test
pnpm db:target      # local or supabase
pnpm use:local      # / pnpm use:supabase
pnpm db:migrate
```

Run `pnpm typecheck` and `pnpm test` before handing work back.

### Backend notes

- Single `.env` at the repo root. Variables are validated at boot in `apps/api/src/config/env.ts`.
- The database is chosen by `DB_TARGET` (`local` or `supabase`). A plain `DATABASE_URL` overrides it, which is how production is configured.
- Prisma 7: the client is generated into `apps/api/src/generated/prisma` (gitignored), enums must span multiple lines, and the connection URL lives in `prisma.config.ts`.
- TypeScript and Prisma versions are pinned on purpose. Do not bump them casually.
- Money is stored as integer base units in a `BigInt`, never a float.

## Frontend

The web app is the part judges see, so most of the effort goes into polish.

### Direction

It should look like a tool for developers, not a crypto app. The audience maintains open
source and distrusts web3 styling. Reference points are Linear, Vercel and Stripe: calm,
dense, precise. The blockchain is plumbing and should stay out of sight.

**Avoid:** purple-to-pink gradients, glows, 3D coins, chains, padlocks, stock crypto
imagery, emoji as icons, centring everything, more than one accent colour on a screen.

**Prefer:** dark background with generous space, 1px borders instead of shadows (shadows
only under overlays), left-aligned text, real screenshots, one idea per screen.

### Colours

Dark is the default. Both themes are defined as CSS variables in
`apps/web/src/index.css`; use the tokens, never raw hex in components.

| Token | Dark | Light | Use |
|---|---|---|---|
| `bg` | `#090A0C` | `#FDFDFD` | page background |
| `surface-1` | `#111315` | `#F6F7F8` | cards, panels |
| `surface-2` | `#1A1C1F` | `#EFF0F2` | raised blocks |
| `border` | `#2C2E32` | `#DDDEE1` | lines and outlines |
| `fg` | `#F4F5F6` | `#161719` | headings, body |
| `fg-muted` | `#A3A5A8` | `#595B5F` | secondary text |
| `fg-subtle` | `#707175` | `#7E8085` | labels, captions |
| `brand` | `#8C67F2` | `#7446D8` | brand, interaction, focus, merged |
| `money` | `#F3BA3C` | `#B07100` | **amounts only** |
| `ok` | `#35C26D` | `#008C45` | success, open |
| `warn` | `#EFA831` | `#9A6400` | pending, in review |
| `danger` | `#F44657` | `#D02940` | failure, rejected |

Two rules hold the palette together:

- **Amber means money and nothing else.** It never appears outside reward amounts, so the
  eye finds the most important number on any screen immediately.
- **Status colours follow GitHub's meaning**, so users read them without a legend: green
  open or passing, violet merged or paid, amber pending, red failed, grey draft or closed.

Contrast: `fg-subtle` is for non-essential text only. In the light theme `money` and `ok`
are only large-text safe on `bg`, so keep them at 18px and up there.

### Typography

Geist for text and Geist Mono for data. Fall back to Inter and JetBrains Mono.

| Role | Size | Weight | Notes |
|---|---|---|---|
| Hero | 56px | 600 | tracking -3%, landing only |
| Page title | 30px | 600 | tracking -2% |
| Section | 22px | 600 | |
| Body | 15px | 400 | line height 1.6 |
| UI text | 14px | 400 | inside components |
| Label | 11.5px | 500 | uppercase, tracking +7%, `fg-subtle` |

**Always set in mono:** amounts, commit hashes, wallet addresses, transaction signatures,
repo slugs, issue numbers, timers. Use tabular numerals wherever digits line up.

### Layout and motion

- 4px base spacing (4, 8, 12, 16, 24, 32, 48, 64, 96). Card padding 20 to 24.
- Radii: 6 small, 10 default, 14 large.
- Top bar 56px, content in a centred column no wider than about 1152px. No side rail.
- Motion: 120ms for hover and press, 180ms for entering elements, 280ms for layout
  changes, 600 to 900ms for count-ups. Respect `prefers-reduced-motion`.

### Behaviour that makes it feel finished

- Skeletons shaped like the content while loading. A spinner only inside a button.
- Every async action shows pending, success and error states, and a toast on completion.
- Every list has an empty state with one sentence and a next step, never "No data".
- Anything copyable (hash, address, signature) has a copy button that confirms.
- Relative times ("2h ago") with the exact time in a tooltip.
- Visible focus rings and full keyboard support. Contrast at least AA.
- Works down to a 375px viewport with no horizontal scroll.
- Filters live in the URL so a filtered view can be shared.

### Signature elements

Build a few memorable things rather than many generic ones:

- **Dual verdict pill:** one pill split in two, one half per AI reviewer, each coloured by
  its verdict. Same colour on both halves means agreement; different colours means they disagree.
- **Escrow panel:** sticky panel on a bounty showing the reward in amber mono, the lock
  status, and a timeline from funded to paid.
- **Flow ribbon:** landing-page diagram of issue, escrow, pull request, review, merge,
  payout, with a pulse travelling along it.

### Copy

Short, direct, active voice. State what happens ("Merge to release payment") instead of
promising outcomes. Numbers and mechanics carry the message, not adjectives.

## Code standards

- Keep files modular; split a file that approaches about 300 lines.
- Do not swallow errors: no empty `catch`, no `return null` or `return []` to hide a failure. Handle an error only where there is a real recovery, otherwise let it propagate.
- Do not add dependencies without checking first.
- Never weaken or skip a test to make it pass. A failing test means the code is wrong until shown otherwise.
- Keep changes scoped to the task. No drive-by refactors, and no renaming, moving or deleting files without approval.
- Commits follow Conventional Commits (`type(scope): subject`) with a short body listing the changes.
