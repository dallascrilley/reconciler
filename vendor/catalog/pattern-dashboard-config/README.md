# Dashboard Config Model

## What it does

Pure types for SQL-powered dashboards: panel configs, filters, chart types, layout, and catalog/install/merge mechanics. Extracted from the Analytics dashboard system.

## Core types

- `DashboardConfig` — top-level dashboard with name, filters, variables, panels
- `SqlPanel` — individual panel with SQL query, chart type, layout, config
- `DashboardFilter` — filter definition (date-range, select, toggle, etc.)
- `DashboardTemplateMetadata` — catalog template metadata
- `DashboardTemplate` — template with metadata and buildConfig factory

## Merge mechanics

`mergeMissingFilters()` — merge seed filters into a target config without duplicating.

## Dependencies

No runtime dependencies.

## Verification

- `pnpm --dir catalog/patterns/dashboard-config test`
- `pnpm --dir catalog/patterns/dashboard-config typecheck`
