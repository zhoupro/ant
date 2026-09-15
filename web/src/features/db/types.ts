export interface Column {
  name: string;
  type: string;
  notnull: boolean;
  pk: boolean;
  default?: string;
}

export interface DBStatus {
  loaded: boolean;
  path?: string;
  name?: string;
  size?: number;
  tables?: number;
  error?: string;
}

// A physical table surfaced in the dashboard sidebar.
// `system` is true for tables whose schema is owned by the
// application itself (e.g. logic_models, pages); they cannot be
// edited or dropped through the generic table API.
export interface TableInfo {
  name: string;
  system: boolean;
}

export interface RowsResponse {
  columns: Column[];
  rows: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
  search: string;
}

export interface CreateTableColumn {
  name: string;
  type: string;
  notnull: boolean;
  pk: boolean;
  default: string;
}

export interface CreateTableInput {
  name: string;
  columns: CreateTableColumn[];
}

export interface AddColumnInput {
  name: string;
  type: string;
  notnull: boolean;
  default: string;
}

export interface RowInput {
  values: Record<string, unknown>;
}