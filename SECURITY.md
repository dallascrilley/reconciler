# Security

## What this project is

Reconciler is a public demonstration of a billing-reconciliation review
workflow. It is a demo, not a production system, and its threat model is
correspondingly small.

## Synthetic data only

Every account, invoice, and finding in this repository is generated from a
fixed seed (`20260713`). There is no real customer data, no real billing data,
and no real money movement anywhere in the corpus. The dollar figures shown in
the dashboard are synthetic.

Please do not add real data to this repository.

## No accounts, no authentication

The local demo has no user accounts, no login, no sessions, and no
authorization layer. It stores no personal data or visitor credentials.

Because there are no accounts, the review endpoints are unauthenticated by
design. That is suitable only for a local demo over synthetic data and is not
a vulnerability report we need.

Do not deploy this code as-is anywhere it would front real billing data. It
would need authentication, authorization, and an audit trail tied to real
identities first.

## Secrets

The repository contains no credentials. Deployment-time configuration
(`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `RECONCILER_PROVIDER_API_KEY`) is
supplied through the environment and is never committed. If you believe a
credential has been committed, please report it privately rather than opening a
public issue.

## Reporting a vulnerability

Open a [GitHub issue](https://github.com/dallascrilley/reconciler/issues).

Since this project holds no real data and no user accounts, public issues are
the right channel for almost everything. The one exception is a leaked
credential, which should be reported privately so it can be rotated first.

There is no bug bounty and no formal SLA. This is a personal demo project, and
responses are best-effort.
