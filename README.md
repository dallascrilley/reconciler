# Reconciler

Reconciler is a public synthetic billing-reconciliation workbench. It detects deterministic invoice discrepancies, proposes typed remediations, and requires a human decision before an invoice mutation is applied.

This is a synthetic rebuild inspired by the shape of a private Meter billing audit. It contains no production customer data, credentials, or billing records.

## Run locally

```bash
pnpm install
pnpm reset
pnpm dev
```

Open `http://localhost:3000`. The keyless path uses deterministic canned proposals; set `RECONCILER_PROVIDER_API_KEY` and optionally `RECONCILER_PROVIDER_URL` to exercise the live proposal provider. Runtime state is loaded from LibSQL/Turso on startup and persisted after proposal and review mutations.

## Staging dashboard (optional)

A long-lived staging instance runs the same synthetic dataset (no production data):

- URL: `http://up6cq0ickmyuycbsb0btq3b3.5.161.80.184.sslip.io`
- Health: `GET /health`

Prefer the local path above for evaluation. Staging is reset daily from `main` (see `.github/workflows/demo-reset.yml`).

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

When a remote Turso database is configured, the runtime also refreshes from the database revision before requests. The pull-request workflow at `.github/workflows/verify.yml` runs typecheck and the proposal eval gate. Daily demo reset configuration (deployment secrets) is documented for maintainers in `docs/credentials.md`.

## Catalog composition receipts

`receipts/generated/` contains the forms and analytics blueprint output. `receipts/catalog-install.json`, `.catalog/transactions/`, `receipts/command-ledger.json`, and `receipts/generated-vs-handwritten.json` record the copied catalog assets and replay command. The ledger is explicitly labeled as a replay because the original first-commit command receipt was not captured.

The source catalog and replay scripts live in `ai-templates`, a private repository; the consumer commit records the source revision used for the receipt.

## License

MIT. See [`LICENSE`](LICENSE).
