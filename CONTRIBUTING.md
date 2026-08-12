# Contributing

Thanks for looking at Reconciler. This is a small, deliberately scoped demo
repository, so the contribution loop is short.

## Requirements

- Node.js `>=22` (see `engines` in `package.json`)
- pnpm

## Setup

```bash
pnpm install
```

To run the app locally against the seeded corpus:

```bash
pnpm reset
pnpm dev
```

The server listens on `http://localhost:3000` (or `$PORT`).

## Checks

Run these before opening a pull request:

```bash
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest run
```

`pnpm verify` runs `typecheck`, `test`, and `build` together.

Continuous integration is `.github/workflows/verify.yml`, which runs
`pnpm install --frozen-lockfile`, `pnpm typecheck`, and `pnpm test:eval` on
every pull request. `pnpm test:eval` is a subset of `pnpm test`, so run the
full suite locally.

## The demo redeploys on a schedule

`.github/workflows/demo-reset.yml` redeploys the public demo from `main` on a
daily schedule. A clean deployment recreates the local LibSQL dataset from the
deterministic seed, which means:

- Any state you create by clicking through the live demo is temporary and will
  be reset.
- Anything merged to `main` reaches the public demo on the next scheduled
  redeploy without a separate release step.

Keep that in mind when changing the seed, the dataset, or the review queue.

## Data

The corpus is synthetic and generated from a fixed seed (`20260713`). Do not
add real customer, billing, or account data to this repository. If you change
the generator, regenerate the committed fixtures with `pnpm seed` and include
the regenerated files in the same commit.

## Pull requests

- Keep changes scoped to one concern.
- Update the README when you add, remove, or change an endpoint.
- Include the output of `pnpm typecheck` and `pnpm test` in the PR description.
- Describe user-visible behavior changes explicitly.

## Reporting problems

Open a GitHub issue. For anything security related, see
[`SECURITY.md`](SECURITY.md).
