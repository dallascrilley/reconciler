# Credential references

Secret values do not belong in this repository.

## Scheduled Coolify reset

- GitHub Actions secret: `COOLIFY_API_TOKEN`
- Purpose: request a deployment of the Reconciler Coolify application from the daily reset workflow
- 1Password source: `op://Private/Coolify API Key/credential`
- GitHub Actions variable: `COOLIFY_APPLICATION_UUID`
- GitHub Actions variable: `RECONCILER_PUBLIC_URL`

The workflow requires only Coolify deployment access. It does not receive production billing data or provider API keys.
