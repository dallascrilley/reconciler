# Reconciler

Reconciler is a public synthetic billing-reconciliation workbench. It detects deterministic invoice discrepancies, proposes typed remediations, and requires a human decision before an invoice mutation is applied.

This is a synthetic rebuild inspired by the shape of a private Meter billing audit. It contains no production customer data, credentials, or billing records.

## Run locally

```bash
pnpm install
pnpm reset
pnpm dev
```

The default server listens on `http://localhost:3000` (or `$PORT`). The keyless path uses deterministic canned proposals; set `RECONCILER_PROVIDER_API_KEY` and optionally `RECONCILER_PROVIDER_URL` to exercise the live proposal provider.

Useful endpoints:

- `GET /api/dashboard` — recovered-revenue counters, class breakdown, review burndown, and the proposal eval gate
- `GET /api/findings` — deterministic findings with linked evidence
- `GET /api/proposals` — pending, edited, approved, and rejected proposals
- `POST /api/reviews` — approve, edit, or reject a proposal
- `GET /api/invoices` — current invoice totals after approved mutations
- `GET /api/audit` — append-only proposal and human-decision audit events

## Deterministic seed and persistence

`pnpm seed` regenerates `data/seeded-dataset.json` and `data/ground-truth.json` using seed `20260713`. `pnpm reset:db` resets a LibSQL database with the same seeded corpus. Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` for a remote Turso database; without them, the reset command uses `data/reconciler.db`.

The scheduled GitHub Actions workflow at `.github/workflows/demo-reset.yml` runs `pnpm reset:db` daily with those two repository secrets.

## Catalog composition receipts

`receipts/generated/` contains the forms and analytics blueprint output. `receipts/catalog-install.json`, `.catalog/transactions/`, `receipts/command-ledger.json`, and `receipts/generated-vs-handwritten.json` record the copied catalog assets and replay command. The ledger is explicitly labeled as a replay because the original first-commit command receipt was not captured.

The source catalog and replay scripts live in [`ai-templates`](https://github.com/DallasCrilleyMarTech/ai-templates); the consumer commit records the source revision used for the receipt.
