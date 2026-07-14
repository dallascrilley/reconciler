/**
 * Dashboard config model — pure types for SQL-powered dashboards.
 *
 * Extracted from Analytics dashboard types and catalog system.
 * No agent-native, app-state, or server imports in the core model.
 */

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export type DataSourceType =
  | "bigquery"
  | "ga4"
  | "amplitude"
  | "first-party"
  | "demo"
  | "prometheus";

export type ChartType =
  | "line"
  | "area"
  | "bar"
  | "metric"
  | "table"
  | "pie"
  | "section"
  | "heatmap"
  | "callout";

export type FilterType =
  | "date"
  | "date-range"
  | "select"
  | "toggle"
  | "text"
  | "toggle-date";

export type ColumnFormat =
  | "number"
  | "currency"
  | "percent"
  | "date"
  | "link"
  | "text"
  | "delta";

export interface FilterOption {
  label: string;
  value: string;
}

export interface DashboardFilter {
  id: string;
  type: FilterType;
  label: string;
  defaultValue?: string;
  options?: FilterOption[];
  column?: string;
  param?: string;
}

export interface TableColumnConfig {
  key: string;
  label?: string;
  format?: ColumnFormat;
  width?: number;
  align?: "left" | "right" | "center";
  linkTemplate?: string;
}

export interface PivotConfig {
  rows: string[];
  columns: string[];
  values: string[];
}

export interface SqlPanelConfig {
  xKey?: string;
  yKey?: string;
  yKeys?: string[];
  color?: string;
  colors?: string[];
  yFormatter?: "number" | "currency" | "percent";
  description?: string;
  pivot?: PivotConfig;
  stacked?: boolean;
  legend?: boolean;
  valueLabels?: Record<string, string>;
  sortable?: boolean;
  columns?: TableColumnConfig[];
  limit?: number;
}

export interface SqlPanel {
  id: string;
  title: string;
  sql: string;
  source: DataSourceType;
  chartType: ChartType;
  width: number;
  columns?: number;
  config?: SqlPanelConfig;
  tab?: string;
}

export interface DashboardCatalogEntry {
  templateId?: string;
  templateVersion?: string;
  installedAt?: string;
}

export interface DashboardConfig {
  name: string;
  description?: string;
  catalog?: DashboardCatalogEntry;
  demo?: { id: string; version?: string; installedAt?: string };
  filters?: DashboardFilter[];
  variables?: Record<string, string>;
  columns?: number;
  panels: SqlPanel[];
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

export const MIN_COLUMNS = 1;
export const MAX_COLUMNS = 6;
export const DEFAULT_COLUMNS = 2;

export function clampColumns(value: unknown): number {
  if (value === null || value === undefined) return DEFAULT_COLUMNS;
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_COLUMNS;
  return Math.max(MIN_COLUMNS, Math.min(MAX_COLUMNS, Math.round(n)));
}

export function clampPanelWidth(value: unknown, gridColumns: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return gridColumns;
  return Math.max(1, Math.min(gridColumns, Math.round(n)));
}

// ---------------------------------------------------------------------------
// Catalog / template types
// ---------------------------------------------------------------------------

export type TemplateCategory =
  | "Acquisition"
  | "Product"
  | "Observability"
  | "Operations";

export interface DashboardTemplateMetadata {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  dataSources: DataSourceType[];
  tags: string[];
  panelCount: number;
  version: string;
  recommended?: boolean;
}

export interface InstalledDashboardSummary {
  id: string;
  name: string;
  visibility: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface DashboardTemplate {
  metadata: DashboardTemplateMetadata;
  buildConfig: () => DashboardConfig;
  installedDashboards?: InstalledDashboardSummary[];
  installed?: boolean;
}

// ---------------------------------------------------------------------------
// Merge mechanics
// ---------------------------------------------------------------------------

export function mergeMissingFilters(
  targetConfig: DashboardConfig,
  seedConfig: DashboardConfig,
): { config: DashboardConfig; addedFilterIds: string[] } {
  const existingFilterIds = new Set(
    (targetConfig.filters ?? []).map((f) => f.id),
  );
  const addedFilterIds: string[] = [];

  const mergedFilters = [...(targetConfig.filters ?? [])];
  for (const filter of seedConfig.filters ?? []) {
    if (!existingFilterIds.has(filter.id)) {
      mergedFilters.push(filter);
      addedFilterIds.push(filter.id);
    }
  }

  return {
    config: { ...targetConfig, filters: mergedFilters },
    addedFilterIds,
  };
}
