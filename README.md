# Reconciler

[![Verification](https://img.shields.io/github/actions/workflow/status/dallascrilley/reconciler/verify.yml?branch=main&label=verification)](https://github.com/dallascrilley/reconciler/actions/workflows/verify.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Reconciler finds billing discrepancies, proposes typed fixes, and will not touch an invoice until a person approves the change.** Detection is deterministic, every proposal and every human decision lands in an append-only audit trail, and the mutation that finally hits the invoice is the one the review recorded — approved as-is, edited, or never.

It is a synthetic rebuild inspired by the shape of a private Meter billing audit. It contains no production customer data, credentials, or billing records.

## The claim, and where to check it

- **No mutation without a decision.** `POST /api/reviews` records an approve, edit, or reject; `GET /api/billing-actions` lists each applied invoice mutation with its proposal, finding, actor, and timestamp. An unreviewed proposal changes nothing.
- **The trail does not rewrite.** `GET /api/audit` returns append-only proposal and human-decision events.
- **Findings reproduce.** The dataset generates from seed `20260713` with checked-in ground truth (`data/ground-truth.json`), so a detection either reproduces on your machine or the diff that broke it is visible.

## What CI proves

`.github/workflows/verify.yml` runs typecheck plus the proposal eval gate on every push and pull request. The gate (`pnpm test:eval`) scores generated proposals case-by-case against the seeded ground truth, so a proposal regression fails the build rather than surfacing in review.

The full suite is 26 tests across 10 files — detectors, evaluation, review queue, state, storage, server, provider path, dashboard, and the dataset generator — and runs with `pnpm verify` (typecheck, tests, build).

What CI does not prove: the live proposal provider needs `RECONCILER_PROVIDER_API_KEY`, so CI and the keyless local path exercise deterministic canned proposals instead.

## Run locally

```bash
pnpm install
pnpm reset
pnpm dev
```

Open `http://localhost:3000`. The keyless path uses deterministic canned proposals; set `RECONCILER_PROVIDER_API_KEY` and optionally `RECONCILER_PROVIDER_URL` to exercise the live proposal provider. Runtime state is loaded from LibSQL/Turso on startup and persisted after proposal and review mutations.

## Local dashboard

Run the project locally with the commands above, then open
`http://localhost:3000`. The keyless path loads the synthetic dataset without
external services.

Useful endpoints:

- `GET /api/dashboard` — recovered-revenue counters, class breakdown, review burndown, and the proposal eval gate
- `GET /api/summary` — dataset seed, account, invoice, and finding counts, findings by kind, and pending proposal and applied action counts
- `GET /api/findings` — deterministic findings with linked evidence
- `GET /api/proposals` — pending, edited, approved, and rejected proposals
- `POST /api/proposals` — generate a proposal for a `findingId`, returning the queued proposal when that finding already has one
- `GET /api/reviews` — recorded human decisions with proposal, decision, edited payload, reviewer, and timestamp
- `POST /api/reviews` — approve, edit, or reject a proposal
- `GET /api/invoices` — current invoice totals after approved mutations
- `GET /api/billing-actions` — invoice mutations applied after a human approval, with proposal, finding, actor, and timestamp
- `GET /api/audit` — append-only proposal and human-decision audit events

## Deterministic seed and persistence

`pnpm seed` regenerates `data/seeded-dataset.json` and `data/ground-truth.json` using seed `20260713`. `pnpm reset:db` resets a LibSQL database with the same seeded corpus. Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` for a remote Turso database; without them, the runtime uses `data/reconciler.db`.

When a remote Turso database is configured, the runtime also refreshes from the database revision before requests. Daily demo reset configuration (deployment secrets) is documented for maintainers in `docs/credentials.md`.

## Catalog composition receipts

`receipts/generated/` contains the forms and analytics blueprint output. `receipts/catalog-install.json`, `.catalog/transactions/`, `receipts/command-ledger.json`, and `receipts/generated-vs-handwritten.json` record the copied catalog assets and replay command. The ledger is explicitly labeled as a replay because the original first-commit command receipt was not captured.

The source catalog and replay scripts live in `ai-templates`, a private repository; the consumer commit records the source revision used for the receipt.

## License

MIT. See [`LICENSE`](LICENSE).
